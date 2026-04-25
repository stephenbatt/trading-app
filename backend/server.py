from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any
import httpx
import os
import uuid
import logging

# =============================
# APP SETUP
# =============================
app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# =============================
# ENV
# =============================
POLYGON_API_KEY = os.environ.get("POLYGON_API_KEY")

if not POLYGON_API_KEY:
    logger.warning("POLYGON_API_KEY not set")

# =============================
# CORS
# =============================
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =============================
# FAKE DB (keeps your app alive)
# =============================
db = {
    "stock_cache": {}
}

# =============================
# CACHE HELPERS
# =============================
def get_cache(key: str):
    return db["stock_cache"].get(key)

def set_cache(key: str, data: dict):
    db["stock_cache"][key] = {
        "data": data,
        "cached_at": datetime.now(timezone.utc)
    }

# =============================
# SAMPLE FALLBACK
# =============================
def generate_sample_stock_data(symbol: str, days: int = 300):
    candles = []
    price = 100

    for i in range(days):
        price += (i % 5 - 2) * 0.5
        candles.append({
            "time": f"2024-{(i%12)+1:02d}-{(i%28)+1:02d}",
            "open": price,
            "high": price + 1,
            "low": price - 1,
            "close": price,
            "volume": 1000000 + i * 1000,
        })

    return candles

# =============================
# POLYGON DATA
# =============================
async def fetch_stock_data(symbol: str, interval: str = "day") -> Dict[str, Any]:
    cache_key = f"{symbol}_{interval}"
    cached = get_cache(cache_key)

    if cached:
        if datetime.now(timezone.utc) - cached["cached_at"] < timedelta(hours=1):
            return cached["data"]

    try:
        url = f"https://api.polygon.io/v2/aggs/ticker/{symbol}/range/1/day/2023-01-01/2026-12-31"

        params = {
            "adjusted": "true",
            "sort": "asc",
            "limit": 5000,
            "apiKey": POLYGON_API_KEY
        }

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, params=params)
            data = response.json()

        if "results" not in data:
            raise Exception("Polygon returned no data")

        candles: List[Dict[str, Any]] = []

        for item in data["results"]:
            candles.append({
                "time": item["t"],
                "open": float(item["o"]),
                "high": float(item["h"]),
                "low": float(item["l"]),
                "close": float(item["c"]),
                "volume": float(item["v"]),
            })

        result = {
            "symbol": symbol,
            "interval": interval,
            "candles": candles,
            "data_source": "polygon"
        }

        set_cache(cache_key, result)

        return result

    except Exception as e:
        logger.warning(f"Polygon error: {e}")

    # fallback
    candles = generate_sample_stock_data(symbol, 300)

    return {
        "symbol": symbol,
        "interval": interval,
        "candles": candles,
        "data_source": "sample"
    }

# =============================
# EMA
# =============================
def calculate_ema(prices: List[float], period: int):
    ema = []
    k = 2 / (period + 1)

    for i, price in enumerate(prices):
        if i == 0:
            ema.append(price)
        else:
            ema.append(price * k + ema[i - 1] * (1 - k))

    return ema

# =============================
# INDICATORS
# =============================
@api_router.get("/stocks/{symbol}/indicators")
async def get_indicators(
    symbol: str,
    fast_ema: int = 20,
    mid_ema: int = 50,
    slow_ema: int = 200
):
    data = await fetch_stock_data(symbol.upper())

    candles = data["candles"]
    closes = [c["close"] for c in candles]

    fast = calculate_ema(closes, fast_ema)
    mid = calculate_ema(closes, mid_ema)
    slow = calculate_ema(closes, slow_ema)

    for i in range(len(candles)):
        candles[i]["fast_ema"] = fast[i]
        candles[i]["mid_ema"] = mid[i]
        candles[i]["slow_ema"] = slow[i]

    return {
        "symbol": symbol,
        "candles": candles
    }

# =============================
# BASIC STOCK
# =============================
@api_router.get("/stocks/{symbol}")
async def get_stock(symbol: str):
    return await fetch_stock_data(symbol.upper())

# =============================
# SYMBOLS
# =============================
@api_router.get("/symbols")
async def get_symbols():
    return {
        "symbols": ["AAPL", "TSLA", "MSFT", "NVDA", "AMZN"]
    }

# =============================
# FINAL
# =============================
app.include_router(api_router)
