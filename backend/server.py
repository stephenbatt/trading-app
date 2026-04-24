from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import jwt
import bcrypt
import httpx
import numpy as np
from collections import defaultdict

# Load environment variables
load_dotenv()

# Logging setup
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# FastAPI app
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_origins=[
        "http://localhost:3000",
        "https://trading-app-am8h-fch3aaaou-joannbatt2016-9014s-projects.vercel.app"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# MongoDB client (adjust URI/DB name if needed)
MONGODB_URI = os.getenv("MONGODB_URI")
client = AsyncIOMotorClient(MONGODB_URI) if MONGODB_URI else None
db = client["trading_app"] if client else None

# Security
security = HTTPBearer()
JWT_SECRET = os.getenv("JWT_SECRET", "change_me")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Settings
JWT_SECRET = os.environ.get('JWT_SECRET', 'trading-dashboard-secret-key-2024')
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24

# Alpha Vantage
ALPHA_VANTAGE_KEY = os.environ.get('ALPHA_VANTAGE_KEY', 'demo')

api_router = APIRouter(prefix="/api")
security = HTTPBearer()

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ==================== MODELS ====================

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    created_at: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

class StockDataRequest(BaseModel):
    symbol: str = "AAPL"
    interval: str = "daily"  # daily, 60min, 30min, 15min, 5min, 1min

class EMASettings(BaseModel):
    fast_ema: int = 20
    mid_ema: int = 50
    slow_ema: int = 200

class BacktestRequest(BaseModel):
    symbol: str = "AAPL"
    fast_ema_range: List[int] = [5, 10, 15, 20]
    mid_ema_range: List[int] = [20, 30, 40, 50]
    slow_ema_range: List[int] = [50, 100, 150, 200]
    initial_capital: float = 10000.0

class PaperTrade(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    symbol: str
    entry_price: float
    entry_time: str
    exit_price: Optional[float] = None
    exit_time: Optional[str] = None
    position_type: str  # "long" or "short"
    quantity: float
    stop_price: float
    highest_price: float
    status: str = "open"  # "open" or "closed"
    profit_loss: Optional[float] = None
    exit_reason: Optional[str] = None
    ema_settings: Dict[str, int] = {}

class UserSettings(BaseModel):
    fast_ema: int = 20
    mid_ema: int = 50
    slow_ema: int = 200
    strategy_enabled: bool = False

# ==================== AUTH HELPERS ====================

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())

def create_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS),
        "iat": datetime.now(timezone.utc)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

# ==================== INDICATOR CALCULATIONS ====================

def calculate_ema(prices: List[float], period: int) -> List[Optional[float]]:
    """Calculate Exponential Moving Average"""
    if len(prices) < period:
        return [None] * len(prices)
    
    ema = []
    multiplier = 2 / (period + 1)
    
    # Start with SMA for first EMA value
    sma = sum(prices[:period]) / period
    ema = [None] * (period - 1) + [sma]
    
    for i in range(period, len(prices)):
        ema_value = (prices[i] - ema[-1]) * multiplier + ema[-1]
        ema.append(ema_value)
    
    return ema

def calculate_cci(highs: List[float], lows: List[float], closes: List[float], period: int = 20) -> List[Optional[float]]:
    """Calculate Commodity Channel Index"""
    if len(closes) < period:
        return [None] * len(closes)
    
    cci = [None] * (period - 1)
    
    for i in range(period - 1, len(closes)):
        # Typical Price
        tp_slice = [(highs[j] + lows[j] + closes[j]) / 3 for j in range(i - period + 1, i + 1)]
        tp = tp_slice[-1]
        
        # SMA of Typical Price
        sma_tp = sum(tp_slice) / period
        
        # Mean Deviation
        mean_dev = sum(abs(tp_val - sma_tp) for tp_val in tp_slice) / period
        
        # CCI
        if mean_dev != 0:
            cci_val = (tp - sma_tp) / (0.015 * mean_dev)
        else:
            cci_val = 0
        
        cci.append(cci_val)
    
    return cci

def calculate_macd(prices: List[float], fast: int = 12, slow: int = 26, signal: int = 9) -> Dict[str, List[Optional[float]]]:
    """Calculate MACD histogram"""
    if len(prices) < slow + signal:
        return {"histogram": [None] * len(prices)}
    
    ema_fast = calculate_ema(prices, fast)
    ema_slow = calculate_ema(prices, slow)
    
    # MACD Line
    macd_line = []
    for i in range(len(prices)):
        if ema_fast[i] is not None and ema_slow[i] is not None:
            macd_line.append(ema_fast[i] - ema_slow[i])
        else:
            macd_line.append(None)
    
    # Signal Line (EMA of MACD)
    macd_values = [v for v in macd_line if v is not None]
    if len(macd_values) >= signal:
        signal_ema = calculate_ema(macd_values, signal)
        # Pad with Nones
        pad_length = len(macd_line) - len(signal_ema)
        signal_line = [None] * pad_length + signal_ema
    else:
        signal_line = [None] * len(macd_line)
    
    # Histogram
    histogram = []
    for i in range(len(macd_line)):
        if macd_line[i] is not None and signal_line[i] is not None:
            histogram.append(macd_line[i] - signal_line[i])
        else:
            histogram.append(None)
    
    return {"histogram": histogram, "macd_line": macd_line, "signal_line": signal_line}

# ==================== SAMPLE DATA GENERATION ====================

def generate_sample_stock_data(symbol: str, days: int = 300) -> List[Dict]:
    """Generate realistic sample stock data for testing when API unavailable"""
    import random
    
    # Base prices for different symbols
    base_prices = {
        "AAPL": 180.0, "MSFT": 380.0, "GOOGL": 140.0, "AMZN": 175.0,
        "TSLA": 250.0, "META": 350.0, "NVDA": 480.0, "JPM": 170.0,
        "V": 280.0, "SPY": 480.0, "QQQ": 400.0, "DIA": 380.0,
        "BA": 210.0, "DIS": 95.0, "NFLX": 480.0
    }
    
    base_price = base_prices.get(symbol, 100.0)
    candles = []
    current_price = base_price
    
    # Generate data from 100 days ago to today
    start_date = datetime.now(timezone.utc) - timedelta(days=days)
    
    for i in range(days):
        date = start_date + timedelta(days=i)
        if date.weekday() >= 5:  # Skip weekends
            continue
            
        # Generate realistic OHLC data with some volatility
        daily_change = random.uniform(-0.03, 0.03)  # ±3% daily change
        volatility = random.uniform(0.005, 0.02)  # Intraday volatility
        
        open_price = current_price
        close_price = current_price * (1 + daily_change)
        
        # High and low based on open/close with volatility
        high_price = max(open_price, close_price) * (1 + volatility)
        low_price = min(open_price, close_price) * (1 - volatility)
        
        # Ensure proper OHLC relationships
        high_price = max(high_price, open_price, close_price)
        low_price = min(low_price, open_price, close_price)
        
        candles.append({
            "time": date.strftime("%Y-%m-%d"),
            "open": round(open_price, 2),
            "high": round(high_price, 2),
            "low": round(low_price, 2),
            "close": round(close_price, 2),
            "volume": random.randint(10000000, 50000000)
        })
        
        current_price = close_price
    
    return candles
 
           # ==================== ALPHA VANTAGE ====================

async def fetch_stock_data(symbol: str, interval: str = "daily") -> Dict:
    """Fetch stock data from Alpha Vantage with caching"""
    cache_key = f"{symbol}_{interval}"
    
    # Check cache first
    cached = await db.stock_cache.find_one({"cache_key": cache_key}, {"_id": 0})
    if cached:
        cache_time = datetime.fromisoformat(cached["cached_at"])
        cache_duration = timedelta(hours=1) if interval != "daily" else timedelta(hours=24)
        if datetime.now(timezone.utc) - cache_time < cache_duration:
            return cached["data"]
    
    # Try to fetch from Alpha Vantage
    try:
        if ALPHA_VANTAGE_KEY and ALPHA_VANTAGE_KEY != "demo":
            base_url = "https://www.alphavantage.co/query"
            
            if interval == "daily":
                params = {
                    "function": "TIME_SERIES_DAILY",
                    "symbol": symbol,
                    "outputsize": "compact",
                    "apikey": ALPHA_VANTAGE_KEY
                }
                time_series_key = "Time Series (Daily)"
            else:
                params = {
                    "function": "TIME_SERIES_INTRADAY",
                    "symbol": symbol,
                    "interval": interval,
                    "outputsize": "compact",
                    "apikey": ALPHA_VANTAGE_KEY
                }
                time_series_key = f"Time Series ({interval})"
            
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(base_url, params=params)
                data = response.json()
            
            if time_series_key in data:
                # Parse OHLC data from API
                time_series = data[time_series_key]
                candles = []
                
                for date_str, values in sorted(time_series.items()):
                    candles.append({
                        "time": date_str,
                        "open": float(values["1. open"]),
                        "high": float(values["2. high"]),
                        "low": float(values["3. low"]),
                        "close": float(values["4. close"]),
                        "volume": int(values["5. volume"])
                    })
                
                result = {
                    "symbol": symbol,
                    "interval": interval,
                    "candles": candles,
                    "data_source": "alpha_vantage"
                }
                
                # Cache the result
                await db.stock_cache.update_one(
                    {"cache_key": cache_key},
                    {"$set": {
                        "cache_key": cache_key,
                        "data": result,
                        "cached_at": datetime.now(timezone.utc).isoformat()
                    }},
                    upsert=True
                )
                
                # Return real data
                return result

    except Exception as e:
        logger.warning(f"Alpha Vantage API error: {e}")
    
    # Return cached data if available
    if cached:
        return cached["data"]
    
    raise HTTPException(
        status_code=500,
        detail="Stock API failed - no valid data source"
    )
    
# ==================== BACKTESTING ENGINE ====================

def run_backtest(candles: List[Dict], fast_period: int, mid_period: int, slow_period: int, initial_capital: float = 10000.0) -> Dict:
    """Run backtest with EMA crossover strategy and Slow EMA trailing stop"""
    if len(candles) < slow_period + 10:
        return {"error": "Not enough data for backtest"}
    
    closes = [c["close"] for c in candles]
    
    # Calculate EMAs
    fast_ema = calculate_ema(closes, fast_period)
    mid_ema = calculate_ema(closes, mid_period)
    slow_ema = calculate_ema(closes, slow_period)
    
    # Backtest
    trades = []
    position = None
    capital = initial_capital
    max_capital = initial_capital
    max_drawdown = 0
    
    for i in range(slow_period + 1, len(candles)):
        price = closes[i]
        prev_price = closes[i-1]
        
        fast = fast_ema[i]
        mid = mid_ema[i]
        slow = slow_ema[i]
        prev_fast = fast_ema[i-1]
        prev_mid = mid_ema[i-1]
        
        if fast is None or mid is None or slow is None:
            continue
        
        # Entry conditions
        if position is None:
            # Long entry: Fast crosses above Mid AND price above Slow
            if prev_fast <= prev_mid and fast > mid and price > slow:
                position = {
                    "type": "long",
                    "entry_price": price,
                    "entry_index": i,
                    "stop": slow,  # Slow EMA as initial stop
                    "highest": price
                }
            # Short entry: Fast crosses below Mid AND price below Slow
            elif prev_fast >= prev_mid and fast < mid and price < slow:
                position = {
                    "type": "short",
                    "entry_price": price,
                    "entry_index": i,
                    "stop": slow,
                    "lowest": price
                }
        else:
            # Position management
            if position["type"] == "long":
                # Update highest and trailing stop (slow EMA, never moves down)
                position["highest"] = max(position["highest"], price)
                new_stop = slow
                if new_stop > position["stop"]:
                    position["stop"] = new_stop
                
                # Exit if price breaks below stop
                if price < position["stop"]:
                    pnl = (price - position["entry_price"]) / position["entry_price"] * 100
                    capital *= (1 + pnl / 100)
                    trades.append({
                        "type": "long",
                        "entry": position["entry_price"],
                        "exit": price,
                        "pnl_pct": round(pnl, 2),
                        "exit_reason": "stop_hit"
                    })
                    position = None
            
            elif position["type"] == "short":
                position["lowest"] = min(position["lowest"], price)
                new_stop = slow
                if new_stop < position["stop"]:
                    position["stop"] = new_stop
                
                if price > position["stop"]:
                    pnl = (position["entry_price"] - price) / position["entry_price"] * 100
                    capital *= (1 + pnl / 100)
                    trades.append({
                        "type": "short",
                        "entry": position["entry_price"],
                        "exit": price,
                        "pnl_pct": round(pnl, 2),
                        "exit_reason": "stop_hit"
                    })
                    position = None
        
        # Track drawdown
        if capital > max_capital:
            max_capital = capital
        drawdown = (max_capital - capital) / max_capital * 100
        if drawdown > max_drawdown:
            max_drawdown = drawdown
    
    # Close any open position at end
    if position:
        final_price = closes[-1]
        if position["type"] == "long":
            pnl = (final_price - position["entry_price"]) / position["entry_price"] * 100
        else:
            pnl = (position["entry_price"] - final_price) / position["entry_price"] * 100
        capital *= (1 + pnl / 100)
        trades.append({
            "type": position["type"],
            "entry": position["entry_price"],
            "exit": final_price,
            "pnl_pct": round(pnl, 2),
            "exit_reason": "end_of_data"
        })
    
    # Calculate metrics
    winning_trades = [t for t in trades if t["pnl_pct"] > 0]
    losing_trades = [t for t in trades if t["pnl_pct"] <= 0]
    
    total_trades = len(trades)
    win_rate = (len(winning_trades) / total_trades * 100) if total_trades > 0 else 0
    total_return = ((capital - initial_capital) / initial_capital * 100)
    avg_win = sum(t["pnl_pct"] for t in winning_trades) / len(winning_trades) if winning_trades else 0
    avg_loss = sum(t["pnl_pct"] for t in losing_trades) / len(losing_trades) if losing_trades else 0
    
    return {
        "fast_ema": fast_period,
        "mid_ema": mid_period,
        "slow_ema": slow_period,
        "total_trades": total_trades,
        "win_rate": round(win_rate, 2),
        "total_return": round(total_return, 2),
        "max_drawdown": round(max_drawdown, 2),
        "avg_win": round(avg_win, 2),
        "avg_loss": round(avg_loss, 2),
        "final_capital": round(capital, 2),
        "trades": trades
    }

# ==================== AUTH HELPER (FIX LOGIN LOOP) ====================

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import jwt

security = HTTPBearer()

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        token = credentials.credentials
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])

        return {
            "id": payload.get("id"),
            "email": payload.get("sub"),
            "name": payload.get("name", "User"),
            "created_at": payload.get("created_at", "2024-01-01T00:00:00Z")
        }

    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")
        
# ==================== AUTH ROUTES ====================

@api_router.post("/auth/register", response_model=TokenResponse)
async def register(user_data: UserCreate):
    # Check if user exists
    existing = await db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    user_doc = {
        "id": user_id,
        "email": user_data.email,
        "password": hash_password(user_data.password),
        "name": user_data.name,
        "created_at": now,
        "settings": {
            "fast_ema": 20,
            "mid_ema": 50,
            "slow_ema": 200,
            "strategy_enabled": False
        }
    }
    
    await db.users.insert_one(user_doc)
    
    token = create_token(user_id, user_data.email)
    
    return TokenResponse(
        access_token=token,
        user=UserResponse(id=user_id, email=user_data.email, name=user_data.name, created_at=now)
    )

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(credentials: UserLogin):
    user = await db.users.find_one({"email": credentials.email})
    if not user or not verify_password(credentials.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    token = create_token(user["id"], user["email"])
    
    return TokenResponse(
        access_token=token,
        user=UserResponse(
            id=user["id"],
            email=user["email"],
            name=user["name"],
            created_at=user["created_at"]
        )
    )

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(user: dict = Depends(get_current_user)):
    return UserResponse(
        id=user["id"],
        email=user["email"],
        name=user["name"],
        created_at=user["created_at"]
    )

# ==================== STOCK DATA ROUTES ====================

@api_router.get("/stocks/{symbol}")
async def get_stock_data(symbol: str, interval: str = "daily", user: dict = Depends(get_current_user)):
    """Get stock OHLC data with indicators"""
    data = await fetch_stock_data(symbol.upper(), interval)
    candles = data["candles"]
    
    if not candles:
        raise HTTPException(status_code=404, detail="No data found")
    
    # Get user settings for EMA periods
    user_full = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    settings = user_full.get("settings", {"fast_ema": 20, "mid_ema": 50, "slow_ema": 200})
    
    closes = [c["close"] for c in candles]
    highs = [c["high"] for c in candles]
    lows = [c["low"] for c in candles]
    
    # Calculate indicators
    fast_ema = calculate_ema(closes, settings["fast_ema"])
    mid_ema = calculate_ema(closes, settings["mid_ema"])
    slow_ema = calculate_ema(closes, settings["slow_ema"])
    cci = calculate_cci(highs, lows, closes, 20)
    macd = calculate_macd(closes)
    
    # Combine data
    for i, candle in enumerate(candles):
        candle["fast_ema"] = round(fast_ema[i], 4) if fast_ema[i] else None
        candle["mid_ema"] = round(mid_ema[i], 4) if mid_ema[i] else None
        candle["slow_ema"] = round(slow_ema[i], 4) if slow_ema[i] else None
        candle["cci"] = round(cci[i], 2) if cci[i] else None
        candle["macd_histogram"] = round(macd["histogram"][i], 4) if macd["histogram"][i] else None
    
    return {
        "symbol": symbol.upper(),
        "interval": interval,
        "candles": candles,
        "ema_settings": settings
    }

@api_router.get("/stocks/{symbol}/indicators")
async def get_indicators(
    symbol: str, 
    fast_ema: int = 20, 
    mid_ema: int = 50, 
    slow_ema: int = 200,
    interval: str = "daily",
    user: dict = Depends(get_current_user)
):
    """Get stock data with indicators (FIXED TO USE REAL DATA)"""

    # ✅ USE THE SAME DATA SOURCE AS WORKING ENDPOINT
    data = await fetch_stock_data(symbol.upper(), interval)
    candles = data["candles"]
    
    if not candles:
        raise HTTPException(status_code=404, detail="No data found")
    
    closes = [c["close"] for c in candles]
    highs = [c["high"] for c in candles]
    lows = [c["low"] for c in candles]
    
    # Calculate indicators
    fast_ema_vals = calculate_ema(closes, fast_ema)
    mid_ema_vals = calculate_ema(closes, mid_ema)
    slow_ema_vals = calculate_ema(closes, slow_ema)
    cci = calculate_cci(highs, lows, closes, 20)
    macd = calculate_macd(closes)
    
    # Combine data
    for i, candle in enumerate(candles):
        candle["fast_ema"] = round(fast_ema_vals[i], 4) if fast_ema_vals[i] else None
        candle["mid_ema"] = round(mid_ema_vals[i], 4) if mid_ema_vals[i] else None
        candle["slow_ema"] = round(slow_ema_vals[i], 4) if slow_ema_vals[i] else None
        candle["cci"] = round(cci[i], 2) if cci[i] else None
        candle["macd_histogram"] = round(macd["histogram"][i], 4) if macd["histogram"][i] else None
    
    return {
        "symbol": symbol.upper(),
        "interval": interval,
        "candles": candles,
        "ema_settings": {
            "fast_ema": fast_ema,
            "mid_ema": mid_ema,
            "slow_ema": slow_ema
        }
    }

# ==================== BACKTESTING ROUTES ====================

@api_router.post("/backtest")
async def run_ema_backtest(request: BacktestRequest, user: dict = Depends(get_current_user)):
    """Run EMA combination backtest"""
    data = await fetch_stock_data(request.symbol.upper(), "daily")
    candles = data["candles"]
    
    results = []
    
    for fast in request.fast_ema_range:
        for mid in request.mid_ema_range:
            for slow in request.slow_ema_range:
                if fast >= mid or mid >= slow:
                    continue  # Skip invalid combinations
                
                result = run_backtest(candles, fast, mid, slow, request.initial_capital)
                if "error" not in result:
                    results.append(result)
    
    # Sort by total return
    results.sort(key=lambda x: x["total_return"], reverse=True)
    
    # Save backtest to user history
    backtest_record = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "symbol": request.symbol.upper(),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "top_results": results[:10],
        "total_combinations_tested": len(results)
    }
    await db.backtest_history.insert_one(backtest_record)
    
    return {
        "symbol": request.symbol.upper(),
        "total_combinations": len(results),
        "results": results[:20]  # Return top 20
    }

@api_router.get("/backtest/history")
async def get_backtest_history(user: dict = Depends(get_current_user)):
    """Get user's backtest history"""
    history = await db.backtest_history.find({"user_id": user["id"]}, {"_id": 0}).sort("timestamp", -1).to_list(50)
    return {"history": history}

# ==================== PAPER TRADING ROUTES ====================

@api_router.post("/paper-trades")
async def create_paper_trade(
    symbol: str,
    position_type: str,
    quantity: float,
    user: dict = Depends(get_current_user)
):
    """Create a new paper trade"""
    # Get current price
    data = await fetch_stock_data(symbol.upper(), "daily")
    if not data["candles"]:
        raise HTTPException(status_code=404, detail="Symbol not found")
    
    current_price = data["candles"][-1]["close"]
    
    # Get user settings
    user_full = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    settings = user_full.get("settings", {"slow_ema": 200})
    
    # Calculate slow EMA for stop
    closes = [c["close"] for c in data["candles"]]
    slow_ema = calculate_ema(closes, settings["slow_ema"])
    stop_price = slow_ema[-1] if slow_ema[-1] else current_price * 0.95
    
    trade = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "symbol": symbol.upper(),
        "entry_price": current_price,
        "entry_time": datetime.now(timezone.utc).isoformat(),
        "position_type": position_type,
        "quantity": quantity,
        "stop_price": round(stop_price, 4),
        "highest_price": current_price,
        "status": "open",
        "ema_settings": settings
    }
    
    await db.paper_trades.insert_one(trade)
    
    # Remove _id before returning
    return {k: v for k, v in trade.items() if k != "_id"}

@api_router.get("/paper-trades")
async def get_paper_trades(status: str = None, user: dict = Depends(get_current_user)):
    """Get user's paper trades"""
    query = {"user_id": user["id"]}
    if status:
        query["status"] = status
    
    trades = await db.paper_trades.find(query, {"_id": 0}).sort("entry_time", -1).to_list(100)
    return {"trades": trades}

@api_router.put("/paper-trades/{trade_id}/close")
async def close_paper_trade(trade_id: str, exit_reason: str = "manual", user: dict = Depends(get_current_user)):
    """Close a paper trade"""
    trade = await db.paper_trades.find_one({"id": trade_id, "user_id": user["id"]}, {"_id": 0})
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    
    if trade["status"] == "closed":
        raise HTTPException(status_code=400, detail="Trade already closed")
    
    # Get current price
    data = await fetch_stock_data(trade["symbol"], "daily")
    exit_price = data["candles"][-1]["close"]
    
    # Calculate P/L
    if trade["position_type"] == "long":
        pnl = (exit_price - trade["entry_price"]) * trade["quantity"]
    else:
        pnl = (trade["entry_price"] - exit_price) * trade["quantity"]
    
    update = {
        "exit_price": exit_price,
        "exit_time": datetime.now(timezone.utc).isoformat(),
        "status": "closed",
        "profit_loss": round(pnl, 2),
        "exit_reason": exit_reason
    }
    
    await db.paper_trades.update_one({"id": trade_id}, {"$set": update})
    
    return {"message": "Trade closed", "profit_loss": round(pnl, 2)}

@api_router.put("/paper-trades/{trade_id}/update-stop")
async def update_trade_stop(trade_id: str, user: dict = Depends(get_current_user)):
    """Update trailing stop based on Slow EMA"""
    trade = await db.paper_trades.find_one({"id": trade_id, "user_id": user["id"]}, {"_id": 0})
    if not trade or trade["status"] == "closed":
        raise HTTPException(status_code=404, detail="Open trade not found")
    
    data = await fetch_stock_data(trade["symbol"], "daily")
    current_price = data["candles"][-1]["close"]
    closes = [c["close"] for c in data["candles"]]
    
    settings = trade.get("ema_settings", {"slow_ema": 200})
    slow_ema = calculate_ema(closes, settings.get("slow_ema", 200))
    new_stop = slow_ema[-1]
    
    # Trailing stop never moves down for longs
    if trade["position_type"] == "long":
        if new_stop > trade["stop_price"]:
            await db.paper_trades.update_one(
                {"id": trade_id},
                {"$set": {"stop_price": round(new_stop, 4), "highest_price": max(trade["highest_price"], current_price)}}
            )
    
    return {"new_stop": round(new_stop, 4), "current_price": current_price}

# ==================== SETTINGS ROUTES ====================

@api_router.get("/settings")
async def get_settings(user: dict = Depends(get_current_user)):
    """Get user settings"""
    user_full = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    return user_full.get("settings", {
        "fast_ema": 20,
        "mid_ema": 50,
        "slow_ema": 200,
        "strategy_enabled": False
    })

@api_router.put("/settings")
async def update_settings(settings: UserSettings, user: dict = Depends(get_current_user)):
    """Update user settings"""
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"settings": settings.model_dump()}}
    )
    return {"message": "Settings updated", "settings": settings.model_dump()}

# ==================== AVAILABLE SYMBOLS ====================

@api_router.get("/symbols")
async def get_available_symbols():
    """Get list of popular stock symbols"""
    symbols = [
        {"symbol": "AAPL", "name": "Apple Inc."},
        {"symbol": "MSFT", "name": "Microsoft Corporation"},
        {"symbol": "GOOGL", "name": "Alphabet Inc."},
        {"symbol": "AMZN", "name": "Amazon.com Inc."},
        {"symbol": "TSLA", "name": "Tesla Inc."},
        {"symbol": "META", "name": "Meta Platforms Inc."},
        {"symbol": "NVDA", "name": "NVIDIA Corporation"},
        {"symbol": "JPM", "name": "JPMorgan Chase & Co."},
        {"symbol": "V", "name": "Visa Inc."},
        {"symbol": "SPY", "name": "SPDR S&P 500 ETF"},
        {"symbol": "QQQ", "name": "Invesco QQQ Trust"},
        {"symbol": "DIA", "name": "SPDR Dow Jones Industrial"},
        {"symbol": "BA", "name": "Boeing Company"},
        {"symbol": "DIS", "name": "Walt Disney Company"},
        {"symbol": "NFLX", "name": "Netflix Inc."},
    ]
    return {"symbols": symbols}

# ==================== PRICEBAND SETTLEMENT ====================

async def settle_all_bets():
    bets = await db.trades.find({"status": "open"}).to_list(1000)

    for bet in bets:
        symbol = bet.get("symbol")

        data = await fetch_stock_data(symbol)
        if not data or not data.get("candles"):
            continue

        current_price = data["candles"][-1]["close"]

        low = float(bet.get("low", 0))
        high = float(bet.get("high", 0))
        amount = float(bet.get("amount", 0))
        bet_type = bet.get("type")

        if bet_type == "inside":
            win = low <= current_price <= high
        else:
            win = current_price < low or current_price > high

        payout = amount if win else -amount

        await db.paper_account.update_one(
            {},
            {"$inc": {"balance": payout}}
        )

        await db.trades.update_one(
            {"_id": bet["_id"]},
            {
                "$set": {
                    "status": "closed",
                    "result": "win" if win else "loss",
                    "final_price": current_price
                }
            }
        )


@api_router.post("/settle-now")
async def settle_now():
    await settle_all_bets()
    return {"status": "settled"}
    
# Include router
app.include_router(api_router)


@app.on_event("shutdown")
async def shutdown_db_client():
    if client:
        client.close()


if __name__ == "__main__":
    import uvicorn
    import os

    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
