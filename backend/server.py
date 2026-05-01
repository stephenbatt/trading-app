print("🔥 NEW VERSION LOADED 🔥")
from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta
from pathlib import Path
from collections import defaultdict
import os
import uuid
import logging
import jwt
import bcrypt
import httpx
import random

# ==================== ENV & LOGGING ====================

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("trading_app")

# ==================== APP & CORS ====================

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # wide open so your frontend always connects
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api_router = APIRouter(prefix="/api")

# ==================== DB SETUP ====================

MONGO_URL = os.getenv("MONGO_URL") or os.getenv("MONGODB_URI")
DB_NAME = os.getenv("DB_NAME", "trading_app")

if not MONGO_URL:
    raise RuntimeError("MONGO_URL / MONGODB_URI not set in environment")

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

# ==================== JWT / SECURITY ====================

JWT_SECRET = "trading-dashboard-secret-key-2024-secure"

JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24

security = HTTPBearer()


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


def create_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "id": user_id,  # make sure get_current_user can read this
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    try:
        token = credentials.credentials
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])

        user_id = payload.get("id") or payload.get("sub")
        email = payload.get("email") or payload.get("sub")

        if not user_id or not email:
            raise HTTPException(status_code=401, detail="Invalid token")

        user = await db.users.find_one({"id": user_id})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")

        return {
            "id": user["id"],
            "email": user["email"],
            "name": user.get("name", "User"),
            "created_at": user.get("created_at", "2024-01-01T00:00:00Z"),
        }

    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

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

# ==================== INDICATORS ====================


def calculate_ema(prices: List[float], period: int) -> List[Optional[float]]:
    if len(prices) < period:
        return [None] * len(prices)

    ema: List[Optional[float]] = []
    multiplier = 2 / (period + 1)

    sma = sum(prices[:period]) / period
    ema = [None] * (period - 1) + [sma]

    for i in range(period, len(prices)):
        ema_value = (prices[i] - ema[-1]) * multiplier + ema[-1]
        ema.append(ema_value)

    return ema


def calculate_cci(
    highs: List[float],
    lows: List[float],
    closes: List[float],
    period: int = 20,
) -> List[Optional[float]]:
    if len(closes) < period:
        return [None] * len(closes)

    cci: List[Optional[float]] = [None] * (period - 1)

    for i in range(period - 1, len(closes)):
        tp_slice = [
            (highs[j] + lows[j] + closes[j]) / 3
            for j in range(i - period + 1, i + 1)
        ]
        tp = tp_slice[-1]
        sma_tp = sum(tp_slice) / period
        mean_dev = sum(abs(tp_val - sma_tp) for tp_val in tp_slice) / period

        if mean_dev != 0:
            cci_val = (tp - sma_tp) / (0.015 * mean_dev)
        else:
            cci_val = 0

        cci.append(cci_val)

    return cci


def calculate_macd(
    prices: List[float], fast: int = 12, slow: int = 26, signal: int = 9
) -> Dict[str, List[Optional[float]]]:
    if len(prices) < slow + signal:
        return {
            "histogram": [None] * len(prices),
            "macd_line": [None] * len(prices),
            "signal_line": [None] * len(prices),
        }

    ema_fast = calculate_ema(prices, fast)
    ema_slow = calculate_ema(prices, slow)

    macd_line: List[Optional[float]] = []
    for i in range(len(prices)):
        if ema_fast[i] is not None and ema_slow[i] is not None:
            macd_line.append(ema_fast[i] - ema_slow[i])
        else:
            macd_line.append(None)

    macd_values = [v for v in macd_line if v is not None]
    if len(macd_values) >= signal:
        signal_ema = calculate_ema(macd_values, signal)
        pad_length = len(macd_line) - len(signal_ema)
        signal_line: List[Optional[float]] = [None] * pad_length + signal_ema
    else:
        signal_line = [None] * len(macd_line)

    histogram: List[Optional[float]] = []
    for i in range(len(macd_line)):
        if macd_line[i] is not None and signal_line[i] is not None:
            histogram.append(macd_line[i] - signal_line[i])
        else:
            histogram.append(None)

    return {
        "histogram": histogram,
        "macd_line": macd_line,
        "signal_line": signal_line,
    }

# ==================== SAMPLE DATA (FALLBACK) ====================


def generate_sample_stock_data(symbol: str, days: int = 300) -> List[Dict[str, Any]]:
    base_prices = {
        "AAPL": 180.0,
        "MSFT": 380.0,
        "GOOGL": 140.0,
        "AMZN": 175.0,
        "TSLA": 250.0,
        "META": 350.0,
        "NVDA": 480.0,
        "JPM": 170.0,
        "V": 280.0,
        "SPY": 480.0,
        "QQQ": 400.0,
        "DIA": 380.0,
        "BA": 210.0,
        "DIS": 95.0,
        "NFLX": 480.0,
    }

    base_price = base_prices.get(symbol.upper(), 100.0)
    candles: List[Dict[str, Any]] = []
    current_price = base_price

    start_date = datetime.now(timezone.utc) - timedelta(days=days)

    for i in range(days):
        date = start_date + timedelta(days=i)
        if date.weekday() >= 5:
            continue

        daily_change = random.uniform(-0.03, 0.03)
        volatility = random.uniform(0.005, 0.02)

        open_price = current_price
        close_price = current_price * (1 + daily_change)

        high_price = max(open_price, close_price) * (1 + volatility)
        low_price = min(open_price, close_price) * (1 - volatility)

        high_price = max(high_price, open_price, close_price)
        low_price = min(low_price, open_price, close_price)

        candles.append(
            {
                "time": date.strftime("%Y-%m-%d"),
                "open": round(open_price, 2),
                "high": round(high_price, 2),
                "low": round(low_price, 2),
                "close": round(close_price, 2),
                "volume": random.randint(10_000_000, 50_000_000),
            }
        )

        current_price = close_price

    return candles

# ==================== ALPHA VANTAGE ====================

ALPHA_VANTAGE_KEY = os.environ.get("ALPHA_VANTAGE_KEY", "demo")
POLYGON_API_KEY = os.environ.get("POLYGON_API_KEY")

from datetime import datetime, timedelta

async def fetch_stock_data(symbol: str, interval: str = "5min"):

    end = datetime.utcnow()
    start = end - timedelta(days=5)

    url = f"https://api.polygon.io/v2/aggs/ticker/{symbol.upper()}/range/5/minute/{start.date()}/{end.date()}"

    params = {
        "adjusted": "true",
        "sort": "asc",
        "limit": 5000,
        "apiKey": POLYGON_API_KEY
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(url, params=params)
        data = response.json()

    if "results" not in data or not data["results"]:
        print("⚠ Polygon failed — using sample data")

        return {
            "symbol": symbol.upper(),
            "interval": interval,
            "candles": generate_sample_stock_data(symbol),
            "data_source": "sample"
        }

    candles = []

    for item in data["results"]:
        candles.append({
            "time": int(item["t"] / 1000),
            "open": float(item["o"]),
            "high": float(item["h"]),
            "low": float(item["l"]),
            "close": float(item["c"]),
            "volume": float(item["v"]),
        })

    return {
        "symbol": symbol.upper(),
        "interval": interval,
        "candles": candles,
        "data_source": "polygon"
    }


@api_router.get("/candles/{symbol}")
async def get_candles(symbol: str):
    try:
        return await fetch_stock_data(symbol)
    except Exception as e:
        logger.warning(f"Candle route failed: {e}")

        return {
            "symbol": symbol.upper(),
            "interval": "5min",
            "candles": [],
            "data_source": "none",
        }
        
# ==================== STOCK DATA ROUTES ====================

@api_router.get("/stocks/{symbol}")
async def get_stock_data(
    symbol: str,
    interval: str = "5min",
):
    try:
        data = await fetch_stock_data(symbol.upper(), interval)
        candles = data["candles"]

        if not candles:
            raise Exception("No data")

        fast_ema = 20
        mid_ema = 50
        slow_ema = 200

        closes = [c["close"] for c in candles]
        highs = [c["high"] for c in candles]
        lows = [c["low"] for c in candles]

        fast_vals = calculate_ema(closes, fast_ema)
        mid_vals = calculate_ema(closes, mid_ema)
        slow_vals = calculate_ema(closes, slow_ema)

        cci_vals = calculate_cci(highs, lows, closes, 20)
        macd_vals = calculate_macd(closes)

        for i, candle in enumerate(candles):
            candle["fast_ema"] = round(fast_vals[i], 4) if fast_vals[i] else None
            candle["mid_ema"] = round(mid_vals[i], 4) if mid_vals[i] else None
            candle["slow_ema"] = round(slow_vals[i], 4) if slow_vals[i] else None
            candle["cci"] = round(cci_vals[i], 2) if cci_vals[i] else None
            candle["macd_histogram"] = (
                round(macd_vals["histogram"][i], 4)
                if macd_vals["histogram"][i]
                else None
            )

        return {
            "symbol": symbol.upper(),
            "interval": interval,
            "candles": candles,
            "ema_settings": {
                "fast_ema": fast_ema,
                "mid_ema": mid_ema,
                "slow_ema": slow_ema,
            },
        }

    except Exception as e:
        print("⚠ STOCK ROUTE FAILED:", e)

        return {
            "symbol": symbol.upper(),
            "interval": interval,
            "candles": [],
            "ema_settings": {"fast_ema": 20, "mid_ema": 50, "slow_ema": 200},
        }


@api_router.get("/stocks/{symbol}/indicators")
async def get_indicators(
    symbol: str,
    fast_ema: int = 20,
    mid_ema: int = 50,
    slow_ema: int = 200,
    interval: str = "5min",
):
    try:
        data = await fetch_stock_data(symbol.upper(), interval)
        candles = data["candles"]

        if not candles:
            raise Exception("No data")

        closes = [c["close"] for c in candles]
        highs = [c["high"] for c in candles]
        lows = [c["low"] for c in candles]

        fast_vals = calculate_ema(closes, fast_ema)
        mid_vals = calculate_ema(closes, mid_ema)
        slow_vals = calculate_ema(closes, slow_ema)

        cci_vals = calculate_cci(highs, lows, closes, 20)
        macd_vals = calculate_macd(closes)

        for i, candle in enumerate(candles):
            candle["fast_ema"] = round(fast_vals[i], 4) if fast_vals[i] else None
            candle["mid_ema"] = round(mid_vals[i], 4) if mid_vals[i] else None
            candle["slow_ema"] = round(slow_vals[i], 4) if slow_vals[i] else None
            candle["cci"] = round(cci_vals[i], 2) if cci_vals[i] else None
            candle["macd_histogram"] = (
                round(macd_vals["histogram"][i], 4)
                if macd_vals["histogram"][i]
                else None
            )

        return {
            "symbol": symbol.upper(),
            "interval": interval,
            "candles": candles,
            "ema_settings": {
                "fast_ema": fast_ema,
                "mid_ema": mid_ema,
                "slow_ema": slow_ema,
            },
        }

    except Exception as e:
        print("⚠ INDICATORS FAILED:", e)

        return {
            "symbol": symbol.upper(),
            "interval": interval,
            "candles": [],
            "ema_settings": {
                "fast_ema": fast_ema,
                "mid_ema": mid_ema,
                "slow_ema": slow_ema,
            },
        }
        
# ==================== BACKTEST ENGINE ====================

def run_backtest(
    candles: List[Dict[str, Any]],
    fast_period: int,
    mid_period: int,
    slow_period: int,
    initial_capital: float = 10000.0,
) -> Dict[str, Any]:
    if len(candles) < slow_period + 10:
        return {"error": "Not enough data for backtest"}

    closes = [c["close"] for c in candles]

    fast_ema = calculate_ema(closes, fast_period)
    mid_ema = calculate_ema(closes, mid_period)
    slow_ema = calculate_ema(closes, slow_period)

    trades: List[Dict[str, Any]] = []
    position: Optional[Dict[str, Any]] = None
    capital = initial_capital
    max_capital = initial_capital
    max_drawdown = 0.0

    for i in range(slow_period + 1, len(candles)):
        price = closes[i]
        fast = fast_ema[i]
        mid = mid_ema[i]
        slow = slow_ema[i]
        prev_fast = fast_ema[i - 1]
        prev_mid = mid_ema[i - 1]

        if fast is None or mid is None or slow is None:
            continue

        if position is None:
            if prev_fast <= prev_mid and fast > mid and price > slow:
                position = {
                    "type": "long",
                    "entry_price": price,
                    "entry_index": i,
                    "stop": slow,
                    "highest": price,
                }
            elif prev_fast >= prev_mid and fast < mid and price < slow:
                position = {
                    "type": "short",
                    "entry_price": price,
                    "entry_index": i,
                    "stop": slow,
                    "lowest": price,
                }
        else:
            if position["type"] == "long":
                position["highest"] = max(position["highest"], price)
                new_stop = slow
                if new_stop > position["stop"]:
                    position["stop"] = new_stop

                if price < position["stop"]:
                    pnl = (price - position["entry_price"]) / position[
                        "entry_price"
                    ] * 100
                    capital *= 1 + pnl / 100
                    trades.append(
                        {
                            "type": "long",
                            "entry": position["entry_price"],
                            "exit": price,
                            "pnl_pct": round(pnl, 2),
                            "exit_reason": "stop_hit",
                        }
                    )
                    position = None

            elif position["type"] == "short":
                position["lowest"] = min(position["lowest"], price)
                new_stop = slow
                if new_stop < position["stop"]:
                    position["stop"] = new_stop

                if price > position["stop"]:
                    pnl = (position["entry_price"] - price) / position[
                        "entry_price"
                    ] * 100
                    capital *= 1 + pnl / 100
                    trades.append(
                        {
                            "type": "short",
                            "entry": position["entry_price"],
                            "exit": price,
                            "pnl_pct": round(pnl, 2),
                            "exit_reason": "stop_hit",
                        }
                    )
                    position = None

        if capital > max_capital:
            max_capital = capital
        drawdown = (max_capital - capital) / max_capital * 100
        if drawdown > max_drawdown:
            max_drawdown = drawdown

    if position:
        final_price = closes[-1]
        if position["type"] == "long":
            pnl = (final_price - position["entry_price"]) / position[
                "entry_price"
            ] * 100
        else:
            pnl = (position["entry_price"] - final_price) / position[
                "entry_price"
            ] * 100
        capital *= 1 + pnl / 100
        trades.append(
            {
                "type": position["type"],
                "entry": position["entry_price"],
                "exit": final_price,
                "pnl_pct": round(pnl, 2),
                "exit_reason": "end_of_data",
            }
        )

    winning_trades = [t for t in trades if t["pnl_pct"] > 0]
    losing_trades = [t for t in trades if t["pnl_pct"] <= 0]

    total_trades = len(trades)
    win_rate = (len(winning_trades) / total_trades * 100) if total_trades > 0 else 0
    total_return = (capital - initial_capital) / initial_capital * 100
    avg_win = (
        sum(t["pnl_pct"] for t in winning_trades) / len(winning_trades)
        if winning_trades
        else 0
    )
    avg_loss = (
        sum(t["pnl_pct"] for t in losing_trades) / len(losing_trades)
        if losing_trades
        else 0
    )

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
        "trades": trades,
    }

# ==================== AUTH ROUTES ====================


@api_router.post("/auth/register", response_model=TokenResponse)
async def register(user_data: UserCreate):
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
            "strategy_enabled": False,
        },
    }

    await db.users.insert_one(user_doc)

    token = create_token(user_id, user_data.email)

    return TokenResponse(
        access_token=token,
        user=UserResponse(
            id=user_id,
            email=user_data.email,
            name=user_data.name,
            created_at=now,
        ),
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
            created_at=user["created_at"],
        ),
    )


@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(user: dict = Depends(get_current_user)):
    return UserResponse(
        id=user["id"],
        email=user["email"],
        name=user["name"],
        created_at=user["created_at"],
    )

    try:
        data = await fetch_stock_data(symbol.upper(), interval)
        candles = data["candles"]

        if not candles:
            raise Exception("No data")

        # Default settings
        fast_ema = 20
        mid_ema = 50
        slow_ema = 200

        closes = [c["close"] for c in candles]
        highs = [c["high"] for c in candles]
        lows = [c["low"] for c in candles]

        fast_vals = calculate_ema(closes, fast_ema)
        mid_vals = calculate_ema(closes, mid_ema)
        slow_vals = calculate_ema(closes, slow_ema)

        cci_vals = calculate_cci(highs, lows, closes, 20)
        macd_vals = calculate_macd(closes)

        for i, candle in enumerate(candles):
            candle["fast_ema"] = round(fast_vals[i], 4) if fast_vals[i] else None
            candle["mid_ema"] = round(mid_vals[i], 4) if mid_vals[i] else None
            candle["slow_ema"] = round(slow_vals[i], 4) if slow_vals[i] else None
            candle["cci"] = round(cci_vals[i], 2) if cci_vals[i] else None
            candle["macd_histogram"] = (
                round(macd_vals["histogram"][i], 4)
                if macd_vals["histogram"][i]
                else None
            )

        return {
            "symbol": symbol.upper(),
            "interval": interval,
            "candles": candles,
            "ema_settings": {
                "fast_ema": fast_ema,
                "mid_ema": mid_ema,
                "slow_ema": slow_ema,
            },
        }

    except Exception as e:
        print("⚠ STOCK ROUTE FAILED:", e)

        return {
            "symbol": symbol.upper(),
            "interval": interval,
            "candles": [],
            "ema_settings": {"fast_ema": 20, "mid_ema": 50, "slow_ema": 200},
        }
        
# ==================== BACKTEST ROUTES ====================


@api_router.post("/backtest")
async def run_ema_backtest(
    request: BacktestRequest, user: dict = Depends(get_current_user)
):
    data = await fetch_stock_data(request.symbol.upper(), "daily")
    candles = data["candles"]

    results: List[Dict[str, Any]] = []

    for fast in request.fast_ema_range:
        for mid in request.mid_ema_range:
            for slow in request.slow_ema_range:
                if fast >= mid or mid >= slow:
                    continue

                result = run_backtest(
                    candles, fast, mid, slow, request.initial_capital
                )
                if "error" not in result:
                    results.append(result)

    results.sort(key=lambda x: x["total_return"], reverse=True)

    backtest_record = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "symbol": request.symbol.upper(),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "top_results": results[:10],
        "total_combinations_tested": len(results),
    }
    await db.backtest_history.insert_one(backtest_record)

    return {
        "symbol": request.symbol.upper(),
        "total_combinations": len(results),
        "results": results[:20],
    }


@api_router.get("/backtest/history")
async def get_backtest_history(user: dict = Depends(get_current_user)):
    history = (
        await db.backtest_history.find(
            {"user_id": user["id"]}, {"_id": 0}
        )
        .sort("timestamp", -1)
        .to_list(50)
    )
    return {"history": history}

# ==================== PAPER TRADING ROUTES ====================


@api_router.post("/paper-trades")
async def create_paper_trade(
    symbol: str,
    position_type: str,
    quantity: float,
    user: dict = Depends(get_current_user),
):
    data = await fetch_stock_data(symbol.upper(), "daily")
    if not data["candles"]:
        raise HTTPException(status_code=404, detail="Symbol not found")

    current_price = data["candles"][-1]["close"]

    user_full = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    settings = user_full.get("settings", {"slow_ema": 200})

    closes = [c["close"] for c in data["candles"]]
    slow_ema_vals = calculate_ema(closes, settings["slow_ema"])
    stop_price = slow_ema_vals[-1] if slow_ema_vals[-1] else current_price * 0.95

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
        "ema_settings": settings,
    }

    await db.paper_trades.insert_one(trade)

    return {k: v for k, v in trade.items() if k != "_id"}


@api_router.get("/paper-trades")
async def get_paper_trades(
    status: Optional[str] = None, user: dict = Depends(get_current_user)
):
    query: Dict[str, Any] = {"user_id": user["id"]}
    if status:
        query["status"] = status

    trades = (
        await db.paper_trades.find(query, {"_id": 0})
        .sort("entry_time", -1)
        .to_list(100)
    )
    return {"trades": trades}


@api_router.put("/paper-trades/{trade_id}/close")
async def close_paper_trade(
    trade_id: str,
    exit_reason: str = "manual",
    user: dict = Depends(get_current_user),
):
    trade = await db.paper_trades.find_one(
        {"id": trade_id, "user_id": user["id"]}, {"_id": 0}
    )
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")

    if trade["status"] == "closed":
        raise HTTPException(status_code=400, detail="Trade already closed")

    data = await fetch_stock_data(trade["symbol"], "daily")
    exit_price = data["candles"][-1]["close"]

    if trade["position_type"] == "long":
        pnl = (exit_price - trade["entry_price"]) * trade["quantity"]
    else:
        pnl = (trade["entry_price"] - exit_price) * trade["quantity"]

    update = {
        "exit_price": exit_price,
        "exit_time": datetime.now(timezone.utc).isoformat(),
        "status": "closed",
        "profit_loss": round(pnl, 2),
        "exit_reason": exit_reason,
    }

    await db.paper_trades.update_one({"id": trade_id}, {"$set": update})

    return {"message": "Trade closed", "profit_loss": round(pnl, 2)}


@api_router.put("/paper-trades/{trade_id}/update-stop")
async def update_trade_stop(
    trade_id: str, user: dict = Depends(get_current_user)
):
    trade = await db.paper_trades.find_one(
        {"id": trade_id, "user_id": user["id"]}, {"_id": 0}
    )
    if not trade or trade["status"] == "closed":
        raise HTTPException(status_code=404, detail="Open trade not found")

    data = await fetch_stock_data(trade["symbol"], "daily")
    current_price = data["candles"][-1]["close"]

    closes = [c["close"] for c in data["candles"]]
    slow_ema_vals = calculate_ema(
        closes, trade["ema_settings"].get("slow_ema", 200)
    )
    new_stop = slow_ema_vals[-1] if slow_ema_vals[-1] else current_price * 0.95

    if trade["position_type"] == "long":
        if new_stop > trade["stop_price"]:
            trade["stop_price"] = round(new_stop, 4)
    else:
        if new_stop < trade["stop_price"]:
            trade["stop_price"] = round(new_stop, 4)

    await db.paper_trades.update_one(
        {"id": trade_id}, {"$set": {"stop_price": trade["stop_price"]}}
    )

    return {"message": "Stop updated", "stop_price": trade["stop_price"]}

# ==================== FINAL HOOK ====================
# ==================== SYMBOLS ====================

@api_router.get("/symbols")
async def get_symbols():
    return {
        "symbols": [
            {"symbol": "AAPL", "name": "Apple Inc."},
            {"symbol": "MSFT", "name": "Microsoft"},
            {"symbol": "TSLA", "name": "Tesla"},
            {"symbol": "AMZN", "name": "Amazon"},
            {"symbol": "GOOGL", "name": "Google"},
            {"symbol": "NVDA", "name": "NVIDIA"},
        ]
    }

# ==================== SETTINGS ====================

@api_router.get("/settings")
async def get_settings():
    return {
        "fast_ema": 20,
        "mid_ema": 50,
        "slow_ema": 200,
        "strategy_enabled": False
    }


# ---------- ROOT TEST ----------
@app.get("/")
async def root():
    return {"status": "running"}


# ---------- CONNECT ROUTES ----------
app.include_router(api_router)
