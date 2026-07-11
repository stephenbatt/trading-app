print("🔥 REDEYE TRADING BOT v3.0 - FULLY LOADED 🔥")

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any, Set
from datetime import datetime, timezone, timedelta
from pathlib import Path
import os, uuid, logging, jwt, bcrypt, httpx, random
from zoneinfo import ZoneInfo

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("redeye_bot")

app = FastAPI(title="RedEye Trading Bot", version="3.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
api_router = APIRouter(prefix="/api")

MONGO_URL = os.getenv("MONGO_URL") or os.getenv("MONGODB_URI")
DB_NAME = os.getenv("DB_NAME", "trading_app")
if not MONGO_URL:
    raise RuntimeError("MONGO_URL not set in environment")
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

JWT_SECRET = os.getenv("JWT_SECRET")
if not JWT_SECRET:
    raise RuntimeError("JWT_SECRET not set in environment")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24
security = HTTPBearer()

POLYGON_API_KEY = os.environ.get("POLYGON_API_KEY", "")
ALPHA_VANTAGE_KEY = os.environ.get("ALPHA_VANTAGE_KEY", "demo")
TICK_SECRET = os.environ.get("TICK_SECRET", "")
MARKET_TZ = ZoneInfo("America/New_York")

NYSE_HOLIDAYS: Set[str] = {
    "2025-01-01","2025-01-20","2025-02-17","2025-04-18",
    "2025-05-26","2025-06-19","2025-07-04","2025-09-01",
    "2025-11-27","2025-12-25",
    "2026-01-01","2026-01-19","2026-02-16","2026-04-03",
    "2026-05-25","2026-06-19","2026-07-03","2026-09-07",
    "2026-11-26","2026-12-25",
}


def hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()

def verify_password(p: str, h: str) -> bool:
    return bcrypt.checkpw(p.encode(), h.encode())

def create_token(user_id: str, email: str) -> str:
    return jwt.encode(
        {"sub": user_id, "id": user_id, "email": email,
         "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS),
         "iat": datetime.now(timezone.utc)},
        JWT_SECRET, algorithm=JWT_ALGORITHM
    )

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("id") or payload.get("sub")
        user = await db.users.find_one({"id": user_id})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return {"id": user["id"], "email": user["email"],
                "name": user.get("name", "User"),
                "created_at": user.get("created_at", "2024-01-01T00:00:00Z")}
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")


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

class BacktestRequest(BaseModel):
    symbol: str = "AAPL"
    fast_ema_range: List[int] = [5, 10, 15, 20]
    mid_ema_range: List[int] = [20, 30, 40, 50]
    slow_ema_range: List[int] = [50, 100, 150, 200]
    initial_capital: float = 10000.0


def is_within_trading_window() -> bool:
    now = datetime.now(MARKET_TZ)
    if now.weekday() >= 5:
        return False
    if now.strftime("%Y-%m-%d") in NYSE_HOLIDAYS:
        return False
    start = now.replace(hour=8, minute=55, second=0, microsecond=0)
    end = now.replace(hour=16, minute=10, second=0, microsecond=0)
    return start <= now < end

def get_eastern_date_str() -> str:
    return datetime.now(MARKET_TZ).strftime("%Y-%m-%d")


def calculate_ema(prices: List[float], period: int) -> List[Optional[float]]:
    if len(prices) < period:
        return [None] * len(prices)
    multiplier = 2 / (period + 1)
    sma = sum(prices[:period]) / period
    ema: List[Optional[float]] = [None] * (period - 1) + [sma]
    for i in range(period, len(prices)):
        ema.append((prices[i] - ema[-1]) * multiplier + ema[-1])
    return ema

def calculate_cci(highs: List[float], lows: List[float], closes: List[float], period: int = 20) -> List[Optional[float]]:
    if len(closes) < period:
        return [None] * len(closes)
    cci: List[Optional[float]] = [None] * (period - 1)
    for i in range(period - 1, len(closes)):
        tp_slice = [(highs[j] + lows[j] + closes[j]) / 3 for j in range(i - period + 1, i + 1)]
        tp = tp_slice[-1]
        sma_tp = sum(tp_slice) / period
        mean_dev = sum(abs(v - sma_tp) for v in tp_slice) / period
        cci.append((tp - sma_tp) / (0.015 * mean_dev) if mean_dev != 0 else 0)
    return cci

def calculate_macd(prices: List[float], fast: int = 12, slow: int = 26, signal: int = 9) -> Dict[str, List[Optional[float]]]:
    if len(prices) < slow + signal:
        return {"histogram": [None]*len(prices), "macd_line": [None]*len(prices), "signal_line": [None]*len(prices)}
    ema_fast = calculate_ema(prices, fast)
    ema_slow = calculate_ema(prices, slow)
    macd_line: List[Optional[float]] = [
        f - s if f is not None and s is not None else None
        for f, s in zip(ema_fast, ema_slow)
    ]
    macd_values = [v for v in macd_line if v is not None]
    if len(macd_values) >= signal:
        signal_ema = calculate_ema(macd_values, signal)
        signal_line: List[Optional[float]] = [None] * (len(macd_line) - len(signal_ema)) + signal_ema
    else:
        signal_line = [None] * len(macd_line)
    histogram: List[Optional[float]] = [
        m - s if m is not None and s is not None else None
        for m, s in zip(macd_line, signal_line)
    ]
    return {"histogram": histogram, "macd_line": macd_line, "signal_line": signal_line}

def compute_signal(candles: List[Dict[str, Any]], fast_ema: int, mid_ema: int, slow_ema: int, cci_period: int = 20) -> Dict[str, Any]:
    closes = [c["close"] for c in candles]
    highs = [c["high"] for c in candles]
    lows = [c["low"] for c in candles]
    fast_vals = calculate_ema(closes, fast_ema)
    mid_vals = calculate_ema(closes, mid_ema)
    slow_vals = calculate_ema(closes, slow_ema)
    cci_vals = calculate_cci(highs, lows, closes, cci_period)
    macd_vals = calculate_macd(closes)["histogram"]
    i = len(candles) - 1
    prev = i - 1
    price = closes[i]
    fast_now = fast_vals[i]; mid_now = mid_vals[i]; slow_now = slow_vals[i]
    cci_now = cci_vals[i]; cci_prev = cci_vals[prev] if prev >= 0 else None
    macd_now = macd_vals[i]
    signal = "HOLD"; reason = "no setup"
    if None not in (fast_now, mid_now, slow_now, cci_now, cci_prev, macd_now):
        near_fast = fast_now != 0 and abs(price - fast_now) / abs(fast_now) < 0.006
        if price > slow_now and near_fast and cci_prev < 0 and cci_now >= 0 and macd_now > 0:
            signal = "BUY"
            reason = "bounce off fast EMA, CCI crossed up, MACD bullish, above slow EMA"
        elif price < slow_now and near_fast and cci_prev > 0 and cci_now <= 0 and macd_now < 0:
            signal = "SELL"
            reason = "rejection at fast EMA, CCI crossed down, MACD bearish, below slow EMA"
    return {"signal": signal, "reason": reason, "price": price,
            "candle_time": candles[i]["time"], "fast_ema_val": fast_now,
            "mid_ema_val": mid_now, "slow_ema_val": slow_now,
            "cci_val": cci_now, "macd_val": macd_now}

def candle_time_to_iso(ct: Any) -> str:
    try:
        if isinstance(ct, (int, float)):
            return datetime.fromtimestamp(ct, tz=timezone.utc).isoformat()
        return f"{ct}T00:00:00+00:00"
    except Exception:
        return datetime.now(timezone.utc).isoformat()


def generate_sample_stock_data(symbol: str, days: int = 300) -> List[Dict[str, Any]]:
    base_prices = {
        "AAPL": 180.0, "MSFT": 380.0, "GOOGL": 140.0, "AMZN": 175.0,
        "TSLA": 250.0, "META": 350.0, "NVDA": 480.0, "JPM": 170.0,
        "V": 280.0, "SPY": 480.0, "QQQ": 400.0, "DIA": 380.0,
        "BA": 210.0, "DIS": 95.0, "NFLX": 480.0,
    }
    current_price = base_prices.get(symbol.upper(), 100.0)
    candles: List[Dict[str, Any]] = []
    start_date = datetime.now(timezone.utc) - timedelta(days=days)
    for i in range(days):
        date_val = start_date + timedelta(days=i)
        if date_val.weekday() >= 5:
            continue
        daily_change = random.uniform(-0.03, 0.03)
        volatility = random.uniform(0.005, 0.02)
        open_price = current_price
        close_price = current_price * (1 + daily_change)
        high_price = max(open_price, close_price) * (1 + volatility)
        low_price = min(open_price, close_price) * (1 - volatility)
        candles.append({
            "time": date_val.strftime("%Y-%m-%d"),
            "open": round(open_price, 2), "high": round(high_price, 2),
            "low": round(low_price, 2), "close": round(close_price, 2),
            "volume": random.randint(10_000_000, 50_000_000),
        })
        current_price = close_price
    return candles


async def fetch_stock_data(symbol: str, interval: str = "5min", require_live: bool = False) -> Dict[str, Any]:
    interval_map = {
        "1min": (1, "minute"), "5min": (5, "minute"), "10min": (10, "minute"),
        "15min": (15, "minute"), "30min": (30, "minute"), "1hour": (1, "hour"),
        "daily": (1, "day"), "1day": (1, "day"), "1week": (1, "week"), "1month": (1, "month"),
    }
    multiplier, timespan = interval_map.get(interval, (5, "minute"))
    end = datetime.utcnow()
    start = end - timedelta(days=5 if timespan == "minute" else 365)

    if POLYGON_API_KEY:
        try:
            url = (f"https://api.polygon.io/v2/aggs/ticker/{symbol.upper()}/range/"
                   f"{multiplier}/{timespan}/{start.date()}/{end.date()}")
            params = {"adjusted": "true", "sort": "asc", "limit": 5000, "apiKey": POLYGON_API_KEY}
            async with httpx.AsyncClient(timeout=10.0) as c:
                resp = await c.get(url, params=params)
                data = resp.json()
            if "results" in data and data["results"]:
                candles = [{"time": int(item["t"] / 1000), "open": float(item["o"]),
                            "high": float(item["h"]), "low": float(item["l"]),
                            "close": float(item["c"]), "volume": float(item["v"])}
                           for item in data["results"]]
                return {"symbol": symbol.upper(), "interval": interval, "candles": candles, "data_source": "polygon"}
        except Exception as e:
            logger.warning(f"Polygon failed {symbol}: {e}")

    try:
        yf_intervals = {
            "1min": "1m", "5min": "5m", "10min": "10m", "15min": "15m",
            "30min": "30m", "1hour": "60m", "daily": "1d", "1day": "1d",
            "1week": "1wk", "1month": "1mo",
        }
        yf_interval = yf_intervals.get(interval, "5m")
        yf_period = "5d" if "m" in yf_interval else "1y"
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol.upper()}"
        params = {"interval": yf_interval, "range": yf_period}
        headers = {"User-Agent": "Mozilla/5.0"}
        async with httpx.AsyncClient(timeout=10.0) as c:
            resp = await c.get(url, params=params, headers=headers)
            data = resp.json()
        result = data["chart"]["result"][0]
        timestamps = result["timestamp"]
        ohlcv = result["indicators"]["quote"][0]
        candles = []
        for i, ts in enumerate(timestamps):
            if ohlcv["close"][i] is None:
                continue
            candles.append({
                "time": ts,
                "open": round(float(ohlcv["open"][i] or 0), 2),
                "high": round(float(ohlcv["high"][i] or 0), 2),
                "low": round(float(ohlcv["low"][i] or 0), 2),
                "close": round(float(ohlcv["close"][i]), 2),
                "volume": int(ohlcv["volume"][i] or 0),
            })
        if candles:
            return {"symbol": symbol.upper(), "interval": interval, "candles": candles, "data_source": "yahoo"}
    except Exception as e:
        logger.warning(f"Yahoo failed {symbol}: {e}")

    if require_live:
        raise Exception(f"No live data for {symbol} — auto-trade blocked")

    logger.warning(f"Using SAMPLE data for {symbol}")
    return {"symbol": symbol.upper(), "interval": interval,
            "candles": generate_sample_stock_data(symbol), "data_source": "sample"}


async def get_daily_stats(user_id: str) -> Dict[str, Any]:
    today = get_eastern_date_str()
    stats = await db.daily_stats.find_one({"user_id": user_id, "date": today}, {"_id": 0})
    if not stats:
        stats = {"user_id": user_id, "date": today, "trades_opened": 0, "realized_pnl": 0.0}
    return stats

async def increment_daily_trades(user_id: str):
    today = get_eastern_date_str()
    await db.daily_stats.update_one(
        {"user_id": user_id, "date": today},
        {"$inc": {"trades_opened": 1}},
        upsert=True,
    )

async def add_daily_pnl(user_id: str, pnl: float):
    today = get_eastern_date_str()
    await db.daily_stats.update_one(
        {"user_id": user_id, "date": today},
        {"$inc": {"realized_pnl": pnl}},
        upsert=True,
    )

async def check_daily_limits(user_id: str, settings: Dict[str, Any]) -> Optional[str]:
    stats = await get_daily_stats(user_id)
    max_loss = float(settings.get("max_daily_loss", 500.0))
    max_trades = int(settings.get("max_daily_trades", 10))
    if stats["realized_pnl"] <= -abs(max_loss):
        return f"daily loss limit hit (${abs(max_loss):.0f})"
    if stats["trades_opened"] >= max_trades:
        return f"daily trade limit hit ({max_trades} trades)"
    return None

async def check_exposure(user_id: str, price: float, quantity: float, settings: Dict[str, Any]) -> Optional[str]:
    balance = float(settings.get("balance", 10000.0))
    max_pct = float(settings.get("max_exposure_pct", 50.0))
    open_trades = await db.paper_trades.find({"user_id": user_id, "status": "open"}, {"_id": 0}).to_list(100)
    current_exposure = sum(t["entry_price"] * t["quantity"] for t in open_trades)
    max_allowed = balance * (max_pct / 100.0)
    if current_exposure + (price * quantity) > max_allowed:
        return f"max exposure limit ({max_pct:.0f}% of ${balance:.0f})"
    return None


@api_router.post("/auth/register", response_model=TokenResponse)
async def register(user_data: UserCreate):
    if await db.users.find_one({"email": user_data.email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    await db.users.insert_one({
        "id": user_id, "email": user_data.email,
        "password": hash_password(user_data.password),
        "name": user_data.name, "created_at": now,
        "settings": {
            "fast_ema": 20, "mid_ema": 50, "slow_ema": 200, "ema_source": "manual",
            "strategy_enabled": False, "symbols": ["AAPL"], "interval": "5min",
            "auto_quantity": 10, "take_profit_ratio": 2.0,
            "max_daily_loss": 500.0, "max_daily_trades": 10,
            "max_exposure_pct": 50.0, "require_live_data": True, "balance": 10000.0,
        },
    })
    return TokenResponse(
        access_token=create_token(user_id, user_data.email),
        user=UserResponse(id=user_id, email=user_data.email, name=user_data.name, created_at=now),
    )

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(credentials: UserLogin):
    user = await db.users.find_one({"email": credentials.email})
    if not user or not verify_password(credentials.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return TokenResponse(
        access_token=create_token(user["id"], user["email"]),
        user=UserResponse(id=user["id"], email=user["email"], name=user["name"], created_at=user["created_at"]),
    )

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(user: dict = Depends(get_current_user)):
    return UserResponse(**user)


@api_router.get("/stocks/{symbol}")
async def get_stock_data(symbol: str, interval: str = "5min", fast_ema: int = 20, mid_ema: int = 50, slow_ema: int = 200):
    try:
        data = await fetch_stock_data(symbol.upper(), interval)
        candles = data["candles"]
        if not candles:
            raise Exception("No candles")
        closes = [c["close"] for c in candles]
        highs = [c["high"] for c in candles]
        lows = [c["low"] for c in candles]
        fv = calculate_ema(closes, fast_ema)
        mv = calculate_ema(closes, mid_ema)
        sv = calculate_ema(closes, slow_ema)
        cv = calculate_cci(highs, lows, closes, 20)
        mac = calculate_macd(closes)
        for i, c in enumerate(candles):
            c["fast_ema"] = round(fv[i], 4) if fv[i] else None
            c["mid_ema"] = round(mv[i], 4) if mv[i] else None
            c["slow_ema"] = round(sv[i], 4) if sv[i] else None
            c["cci"] = round(cv[i], 2) if cv[i] else None
            c["macd_histogram"] = round(mac["histogram"][i], 4) if mac["histogram"][i] else None
        return {"symbol": symbol.upper(), "interval": interval, "candles": candles,
                "data_source": data.get("data_source", "unknown"),
                "ema_settings": {"fast_ema": fast_ema, "mid_ema": mid_ema, "slow_ema": slow_ema}}
    except Exception as e:
        logger.error(f"Stock data failed {symbol}: {e}")
        return {"symbol": symbol.upper(), "interval": interval, "candles": [],
                "ema_settings": {"fast_ema": fast_ema, "mid_ema": mid_ema, "slow_ema": slow_ema}}

@api_router.get("/stocks/{symbol}/indicators")
async def get_indicators(symbol: str, fast_ema: int = 20, mid_ema: int = 50, slow_ema: int = 200, interval: str = "5min"):
    return await get_stock_data(symbol, interval, fast_ema, mid_ema, slow_ema)

@api_router.get("/stocks/{symbol}/signal")
async def get_signal(symbol: str, fast_ema: int = 20, mid_ema: int = 50, slow_ema: int = 200, interval: str = "5min"):
    try:
        data = await fetch_stock_data(symbol.upper(), interval)
        candles = data["candles"]
        if len(candles) < slow_ema + 5:
            return {"symbol": symbol.upper(), "signal": "HOLD", "reason": "not enough data"}
        result = compute_signal(candles, fast_ema, mid_ema, slow_ema)
        return {"symbol": symbol.upper(), "data_source": data.get("data_source"), **result}
    except Exception as e:
        return {"symbol": symbol.upper(), "signal": "HOLD", "error": str(e)}

@api_router.get("/symbols")
async def get_symbols():
    return {"symbols": [
        {"symbol": "AAPL", "name": "Apple Inc."}, {"symbol": "MSFT", "name": "Microsoft"},
        {"symbol": "TSLA", "name": "Tesla"}, {"symbol": "AMZN", "name": "Amazon"},
        {"symbol": "GOOGL", "name": "Google"}, {"symbol": "NVDA", "name": "NVIDIA"},
        {"symbol": "META", "name": "Meta"}, {"symbol": "SPY", "name": "S&P 500 ETF"},
        {"symbol": "QQQ", "name": "Nasdaq ETF"}, {"symbol": "JPM", "name": "JPMorgan Chase"},
        {"symbol": "DIS", "name": "Disney"}, {"symbol": "NFLX", "name": "Netflix"},
        {"symbol": "V", "name": "Visa"}, {"symbol": "BA", "name": "Boeing"},
        {"symbol": "AMD", "name": "AMD"}, {"symbol": "INTC", "name": "Intel"},
        {"symbol": "GS", "name": "Goldman Sachs"}, {"symbol": "WMT", "name": "Walmart"},
        {"symbol": "KO", "name": "Coca-Cola"}, {"symbol": "PFE", "name": "Pfizer"},
    ]}


def run_backtest(candles: List[Dict[str, Any]], fast_period: int, mid_period: int, slow_period: int, initial_capital: float = 10000.0) -> Dict[str, Any]:
    if len(candles) < slow_period + 10:
        return {"error": "Not enough data"}
    closes = [c["close"] for c in candles]
    fast_ema = calculate_ema(closes, fast_period)
    mid_ema = calculate_ema(closes, mid_period)
    slow_ema = calculate_ema(closes, slow_period)
    trades: List[Dict[str, Any]] = []
    position: Optional[Dict[str, Any]] = None
    capital = initial_capital; max_capital = initial_capital; max_drawdown = 0.0
    for i in range(slow_period + 1, len(candles)):
        price = closes[i]; fast = fast_ema[i]; mid = mid_ema[i]; slow = slow_ema[i]
        prev_fast = fast_ema[i-1]; prev_mid = mid_ema[i-1]
        if None in (fast, mid, slow):
            continue
        if position is None:
            if prev_fast <= prev_mid and fast > mid and price > slow:
                position = {"type": "long", "entry_price": price, "stop": slow, "highest": price}
            elif prev_fast >= prev_mid and fast < mid and price < slow:
                position = {"type": "short", "entry_price": price, "stop": slow, "lowest": price}
        else:
            if position["type"] == "long":
                position["highest"] = max(position["highest"], price)
                if slow > position["stop"]: position["stop"] = slow
                if price < position["stop"]:
                    pnl = (price - position["entry_price"]) / position["entry_price"] * 100
                    capital *= 1 + pnl / 100
                    trades.append({"type": "long", "entry": position["entry_price"], "exit": price, "pnl_pct": round(pnl, 2), "exit_reason": "stop_hit"})
                    position = None
            elif position["type"] == "short":
                position["lowest"] = min(position["lowest"], price)
                if slow < position["stop"]: position["stop"] = slow
                if price > position["stop"]:
                    pnl = (position["entry_price"] - price) / position["entry_price"] * 100
                    capital *= 1 + pnl / 100
                    trades.append({"type": "short", "entry": position["entry_price"], "exit": price, "pnl_pct": round(pnl, 2), "exit_reason": "stop_hit"})
                    position = None
        if capital > max_capital: max_capital = capital
        drawdown = (max_capital - capital) / max_capital * 100
        if drawdown > max_drawdown: max_drawdown = drawdown
    if position:
        final_price = closes[-1]
        pnl = (final_price - position["entry_price"]) / position["entry_price"] * 100 if position["type"] == "long" else (position["entry_price"] - final_price) / position["entry_price"] * 100
        capital *= 1 + pnl / 100
        trades.append({"type": position["type"], "entry": position["entry_price"], "exit": final_price, "pnl_pct": round(pnl, 2), "exit_reason": "end_of_data"})
    winning = [t for t in trades if t["pnl_pct"] > 0]
    losing = [t for t in trades if t["pnl_pct"] <= 0]
    total = len(trades); win_rate = (len(winning) / total * 100) if total > 0 else 0
    return {
        "fast_ema": fast_period, "mid_ema": mid_period, "slow_ema": slow_period,
        "total_trades": total, "win_rate": round(win_rate, 2),
        "total_return": round((capital - initial_capital) / initial_capital * 100, 2),
        "max_drawdown": round(max_drawdown, 2),
        "avg_win": round(sum(t["pnl_pct"] for t in winning) / len(winning), 2) if winning else 0,
        "avg_loss": round(sum(t["pnl_pct"] for t in losing) / len(losing), 2) if losing else 0,
        "final_capital": round(capital, 2), "trades": trades,
    }

@api_router.post("/backtest")
async def run_ema_backtest(request: BacktestRequest, user: dict = Depends(get_current_user)):
    data = await fetch_stock_data(request.symbol.upper(), "daily")
    candles = data["candles"]
    results: List[Dict[str, Any]] = []
    for fast in request.fast_ema_range:
        for mid in request.mid_ema_range:
            for slow in request.slow_ema_range:
                if fast >= mid or mid >= slow: continue
                result = run_backtest(candles, fast, mid, slow, request.initial_capital)
                if "error" not in result: results.append(result)
    results.sort(key=lambda x: x["total_return"], reverse=True)
    await db.backtest_history.insert_one({
        "id": str(uuid.uuid4()), "user_id": user["id"],
        "symbol": request.symbol.upper(),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "top_results": results[:10], "total_combinations_tested": len(results),
    })
    return {"symbol": request.symbol.upper(), "total_combinations": len(results), "results": results[:20]}

@api_router.get("/backtest/history")
async def get_backtest_history(user: dict = Depends(get_current_user)):
    history = await db.backtest_history.find({"user_id": user["id"]}, {"_id": 0}).sort("timestamp", -1).to_list(50)
    return {"history": history}


@api_router.post("/paper-trades")
async def create_paper_trade(symbol: str, position_type: str, quantity: float, user: dict = Depends(get_current_user)):
    data = await fetch_stock_data(symbol.upper(), "daily")
    if not data["candles"]:
        raise HTTPException(status_code=404, detail="Symbol not found")
    current_price = data["candles"][-1]["close"]
    user_full = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    settings = user_full.get("settings", {})
    closes = [c["close"] for c in data["candles"]]
    slow_ema_vals = calculate_ema(closes, settings.get("slow_ema", 200))
    stop_price = slow_ema_vals[-1] if slow_ema_vals[-1] else current_price * 0.95
    trade = {
        "id": str(uuid.uuid4()), "user_id": user["id"], "symbol": symbol.upper(),
        "entry_price": current_price, "entry_time": datetime.now(timezone.utc).isoformat(),
        "position_type": position_type, "quantity": quantity,
        "stop_price": round(stop_price, 4), "highest_price": current_price,
        "status": "open", "ema_settings": settings, "auto": False,
    }
    await db.paper_trades.insert_one(trade)
    return {k: v for k, v in trade.items() if k != "_id"}

@api_router.get("/paper-trades")
async def get_paper_trades(status: Optional[str] = None, user: dict = Depends(get_current_user)):
    query: Dict[str, Any] = {"user_id": user["id"]}
    if status: query["status"] = status
    trades = await db.paper_trades.find(query, {"_id": 0}).sort("entry_time", -1).to_list(100)
    return {"trades": trades}

@api_router.put("/paper-trades/{trade_id}/close")
async def close_paper_trade(trade_id: str, exit_reason: str = "manual", user: dict = Depends(get_current_user)):
    trade = await db.paper_trades.find_one({"id": trade_id, "user_id": user["id"]}, {"_id": 0})
    if not trade: raise HTTPException(status_code=404, detail="Trade not found")
    if trade["status"] == "closed": raise HTTPException(status_code=400, detail="Already closed")
    data = await fetch_stock_data(trade["symbol"], "daily")
    exit_price = data["candles"][-1]["close"]
    pnl = (exit_price - trade["entry_price"]) * trade["quantity"] if trade["position_type"] == "long" else (trade["entry_price"] - exit_price) * trade["quantity"]
    await db.paper_trades.update_one({"id": trade_id}, {"$set": {
        "exit_price": exit_price, "exit_time": datetime.now(timezone.utc).isoformat(),
        "status": "closed", "profit_loss": round(pnl, 2), "exit_reason": exit_reason,
    }})
    return {"message": "Trade closed", "profit_loss": round(pnl, 2)}

@api_router.put("/paper-trades/{trade_id}/update-stop")
async def update_trade_stop(trade_id: str, user: dict = Depends(get_current_user)):
    trade = await db.paper_trades.find_one({"id": trade_id, "user_id": user["id"]}, {"_id": 0})
    if not trade or trade["status"] == "closed": raise HTTPException(status_code=404, detail="Open trade not found")
    data = await fetch_stock_data(trade["symbol"], "daily")
    current_price = data["candles"][-1]["close"]
    closes = [c["close"] for c in data["candles"]]
    sv = calculate_ema(closes, trade["ema_settings"].get("slow_ema", 200))
    new_stop = sv[-1] if sv[-1] else current_price * 0.95
    if trade["position_type"] == "long":
        if new_stop > trade["stop_price"]: trade["stop_price"] = round(new_stop, 4)
    else:
        if new_stop < trade["stop_price"]: trade["stop_price"] = round(new_stop, 4)
    await db.paper_trades.update_one({"id": trade_id}, {"$set": {"stop_price": trade["stop_price"]}})
    return {"message": "Stop updated", "stop_price": trade["stop_price"]}


@api_router.get("/settings")
async def get_user_settings(user: dict = Depends(get_current_user)):
    user_full = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    s = (user_full or {}).get("settings", {})
    return {
        "fast_ema": s.get("fast_ema", 20), "mid_ema": s.get("mid_ema", 50),
        "slow_ema": s.get("slow_ema", 200), "ema_source": s.get("ema_source", "manual"),
        "strategy_enabled": s.get("strategy_enabled", False),
        "symbols": s.get("symbols", ["AAPL"]),
        "interval": s.get("interval", "5min"), "auto_quantity": s.get("auto_quantity", 10),
        "take_profit_ratio": s.get("take_profit_ratio", 2.0),
        "max_daily_loss": s.get("max_daily_loss", 500.0),
        "max_daily_trades": s.get("max_daily_trades", 10),
        "max_exposure_pct": s.get("max_exposure_pct", 50.0),
        "require_live_data": s.get("require_live_data", True),
        "balance": s.get("balance", 10000.0),
    }

@api_router.put("/settings")
async def update_user_settings(payload: Dict[str, Any], user: dict = Depends(get_current_user)):
    allowed = {
        "fast_ema", "mid_ema", "slow_ema", "ema_source", "strategy_enabled",
        "symbols", "interval", "auto_quantity", "take_profit_ratio",
        "max_daily_loss", "max_daily_trades", "max_exposure_pct",
        "require_live_data", "balance",
    }
    update_data = {f"settings.{k}": v for k, v in payload.items() if k in allowed}
    if update_data:
        await db.users.update_one({"id": user["id"]}, {"$set": update_data})
    user_full = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    return (user_full or {}).get("settings", {})

@api_router.get("/daily-stats")
async def get_daily_stats_route(user: dict = Depends(get_current_user)):
    return await get_daily_stats(user["id"])


@app.get("/")
async def root():
    return {
        "status": "running", "version": "3.0", "name": "RedEye Trading Bot",
        "auto_trading": "tick-driven", "market_open": is_within_trading_window(),
        "server_time_eastern": datetime.now(MARKET_TZ).strftime("%Y-%m-%d %H:%M:%S %Z"),
    }


async def open_auto_trade(user_id: str, symbol: str, position_type: str, quantity: float,
                          price: float, candle_time: Any, mid_ema_val: Optional[float],
                          settings: Dict[str, Any], entry_reason: str = ""):
    entry_time = candle_time_to_iso(candle_time)
    fallback_stop = price * (0.95 if position_type == "long" else 1.05)
    stop_price = round(mid_ema_val, 4) if mid_ema_val is not None else round(fallback_stop, 4)
    risk_reward = float(settings.get("take_profit_ratio", 2.0) or 2.0)
    stop_distance = abs(price - stop_price)
    if stop_distance == 0:
        stop_distance = price * 0.01
    take_profit_price = (round(price + stop_distance * risk_reward, 4)
                         if position_type == "long"
                         else round(price - stop_distance * risk_reward, 4))
    trade = {
        "id": str(uuid.uuid4()), "user_id": user_id, "symbol": symbol.upper(),
        "entry_price": price, "entry_time": entry_time,
        "position_type": position_type, "quantity": quantity,
        "stop_price": stop_price, "take_profit_price": take_profit_price,
        "highest_price": price, "status": "open",
        "ema_settings": {"fast_ema": settings.get("fast_ema", 20),
                         "mid_ema": settings.get("mid_ema", 50),
                         "slow_ema": settings.get("slow_ema", 200)},
        "auto": True, "exit_reason": None, "entry_reason": entry_reason,
        "last_candle_time": str(candle_time),
    }
    await db.paper_trades.insert_one(trade)
    await increment_daily_trades(user_id)
    logger.info(f"AUTO OPEN {position_type.upper()} {symbol} @ {price} stop={stop_price} target={take_profit_price} reason={entry_reason}")


async def close_auto_trade(trade: Dict[str, Any], exit_price: float, candle_time: Any, exit_reason: str):
    pnl = ((exit_price - trade["entry_price"]) * trade["quantity"]
           if trade["position_type"] == "long"
           else (trade["entry_price"] - exit_price) * trade["quantity"])
    await db.paper_trades.update_one({"id": trade["id"]}, {"$set": {
        "exit_price": exit_price, "exit_time": candle_time_to_iso(candle_time),
        "status": "closed", "profit_loss": round(pnl, 2), "exit_reason": exit_reason,
    }})
    await add_daily_pnl(trade["user_id"], round(pnl, 2))
    logger.info(f"AUTO CLOSE {trade['position_type'].upper()} {trade['symbol']} @ {exit_price} P/L={round(pnl, 2)} reason={exit_reason}")


async def process_symbol_for_user(user_doc: Dict[str, Any], symbol: str, settings: Dict[str, Any]):
    user_id = user_doc["id"]
    interval = settings.get("interval", "5min")
    fast_ema = settings.get("fast_ema", 20)
    mid_ema = settings.get("mid_ema", 50)
    slow_ema = settings.get("slow_ema", 200)
    quantity = settings.get("auto_quantity", 10)
    require_live = settings.get("require_live_data", True)

    try:
        data = await fetch_stock_data(symbol, interval, require_live=require_live)
    except Exception as e:
        logger.warning(f"SKIP {symbol} user={user_id}: {e}")
        return

    if data["data_source"] == "sample" and require_live:
        logger.warning(f"SKIP {symbol} user={user_id}: sample data blocked")
        return

    candles = data["candles"]
    if len(candles) < slow_ema + 5:
        logger.info(f"SKIP {symbol} user={user_id}: only {len(candles)} candles")
        return

    info = compute_signal(candles, fast_ema, mid_ema, slow_ema)
    signal = info["signal"]; price = info["price"]
    candle_time = info["candle_time"]; mid_ema_val = info["mid_ema_val"]

    open_trade = await db.paper_trades.find_one(
        {"user_id": user_id, "symbol": symbol.upper(), "status": "open"}, {"_id": 0}
    )

    if open_trade is None:
        if signal not in ("BUY", "SELL"):
            return
        limit_reason = await check_daily_limits(user_id, settings)
        if limit_reason:
            logger.info(f"BLOCKED {symbol} user={user_id}: {limit_reason}")
            return
        exposure_reason = await check_exposure(user_id, price, quantity, settings)
        if exposure_reason:
            logger.info(f"BLOCKED {symbol} user={user_id}: {exposure_reason}")
            return
        if signal == "BUY":
            await open_auto_trade(user_id, symbol, "long", quantity, price, candle_time, mid_ema_val, settings, entry_reason=info["reason"])
        else:
            await open_auto_trade(user_id, symbol, "short", quantity, price, candle_time, mid_ema_val, settings, entry_reason=info["reason"])
        return

    last_candle = open_trade.get("last_candle_time")
    current_candle = str(candle_time)
    if last_candle == current_candle:
        return
    await db.paper_trades.update_one({"id": open_trade["id"]}, {"$set": {"last_candle_time": current_candle}})

    pos_type = open_trade["position_type"]
    stop_price = open_trade.get("stop_price")
    take_profit_price = open_trade.get("take_profit_price")

    if pos_type == "long":
        if mid_ema_val is not None:
            new_stop = max(stop_price, mid_ema_val) if stop_price else mid_ema_val
            if new_stop != stop_price:
                await db.paper_trades.update_one({"id": open_trade["id"]}, {"$set": {"stop_price": round(new_stop, 4)}})
                stop_price = new_stop
        if take_profit_price is not None and price >= take_profit_price:
            await close_auto_trade(open_trade, price, candle_time, "take_profit_auto")
            return
        if stop_price is not None and price < stop_price:
            await close_auto_trade(open_trade, price, candle_time, "stop_loss_auto")
            if signal == "SELL":
                limit_reason = await check_daily_limits(user_id, settings)
                if not limit_reason:
                    await open_auto_trade(user_id, symbol, "short", quantity, price, candle_time, mid_ema_val, settings, entry_reason=info["reason"])
    else:
        if mid_ema_val is not None:
            new_stop = min(stop_price, mid_ema_val) if stop_price else mid_ema_val
            if new_stop != stop_price:
                await db.paper_trades.update_one({"id": open_trade["id"]}, {"$set": {"stop_price": round(new_stop, 4)}})
                stop_price = new_stop
        if take_profit_price is not None and price <= take_profit_price:
            await close_auto_trade(open_trade, price, candle_time, "take_profit_auto")
            return
        if stop_price is not None and price > stop_price:
            await close_auto_trade(open_trade, price, candle_time, "stop_loss_auto")
            if signal == "BUY":
                limit_reason = await check_daily_limits(user_id, settings)
                if not limit_reason:
                    await open_auto_trade(user_id, symbol, "long", quantity, price, candle_time, mid_ema_val, settings, entry_reason=info["reason"])


async def process_user_auto_trade(user_doc: Dict[str, Any]):
    settings = user_doc.get("settings", {}) or {}
    if not settings.get("strategy_enabled"):
        return
    symbols = settings.get("symbols", ["AAPL"])
    if isinstance(symbols, str):
        symbols = [symbols]
    for symbol in symbols:
        try:
            await process_symbol_for_user(user_doc, symbol, settings)
        except Exception as e:
            logger.error(f"Error {symbol} user={user_doc.get('id')}: {e}")


@api_router.post("/auto-trade/tick")
async def auto_trade_tick(x_tick_secret: Optional[str] = Header(default=None, alias="X-Tick-Secret")):
    if TICK_SECRET and x_tick_secret != TICK_SECRET:
        raise HTTPException(status_code=401, detail="Invalid tick secret")
    if not is_within_trading_window():
        now = datetime.now(MARKET_TZ)
        return {
            "status": "sleeping",
            "reason": "outside trading window (8:55am-4:10pm Eastern, Mon-Fri, holidays excluded)",
            "server_time_eastern": now.strftime("%Y-%m-%d %H:%M:%S %Z"),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    checked = 0; errors = 0
    try:
        async for user_doc in db.users.find({"settings.strategy_enabled": True}, {"_id": 0}):
            checked += 1
            try:
                await process_user_auto_trade(user_doc)
            except Exception as e:
                errors += 1
                logger.error(f"tick error user={user_doc.get('id')}: {e}")
    except Exception as e:
        logger.error(f"tick fatal: {e}")
        return {"status": "error", "detail": str(e)}
    return {
        "status": "completed", "users_checked": checked, "errors": errors,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


app.include_router(api_router)
