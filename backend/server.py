from fastapi import FastAPI, APIRouter, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, timezone
import uuid
from jose import jwt
import yfinance as yf
import pandas as pd

# =============================
# CONFIG
# =============================
SECRET_KEY = "secret"
ALGORITHM = "HS256"

app = FastAPI()
api_router = APIRouter(prefix="/api")

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
# FAKE DB (TEMP)
# =============================
db = {
    "users": [],
    "paper_trades": []
}

# =============================
# AUTH HELPERS
# =============================
def create_token(user_id):
    return jwt.encode({"sub": user_id}, SECRET_KEY, algorithm=ALGORITHM)

def get_current_user():
    # simple placeholder (skip auth validation for now)
    return {"id": "test-user"}

# =============================
# AUTH ROUTES
# =============================
@api_router.post("/auth/register")
async def register(data: dict):
    user = {
        "id": str(uuid.uuid4()),
        "email": data["email"],
        "password": data["password"]
    }
    db["users"].append(user)
    return {"message": "registered"}

@api_router.post("/auth/login")
async def login(data: dict):
    for user in db["users"]:
        if user["email"] == data["email"] and user["password"] == data["password"]:
            token = create_token(user["id"])
            return {
                "access_token": token,
                "user": {"id": user["id"], "email": user["email"]}
            }
    raise HTTPException(status_code=401, detail="Invalid login")

@api_router.get("/auth/me")
async def me():
    return {"id": "test-user", "email": "test@example.com"}

# =============================
# STOCK DATA (WORKING)
# =============================
def get_stock_data(symbol):
    df = yf.download(symbol, period="3mo")

    if df.empty:
        return []

    df["ema20"] = df["Close"].ewm(span=20).mean()
    df["ema50"] = df["Close"].ewm(span=50).mean()
    df["ema200"] = df["Close"].ewm(span=200).mean()

    candles = []
    for i in range(len(df)):
        candles.append({
            "time": str(df.index[i]),
            "open": float(df["Open"][i]),
            "high": float(df["High"][i]),
            "low": float(df["Low"][i]),
            "close": float(df["Close"][i]),
            "volume": float(df["Volume"][i]),
            "fast_ema": float(df["ema20"][i]) if not pd.isna(df["ema20"][i]) else None,
            "mid_ema": float(df["ema50"][i]) if not pd.isna(df["ema50"][i]) else None,
            "slow_ema": float(df["ema200"][i]) if not pd.isna(df["ema200"][i]) else None,
        })

    return candles

@api_router.get("/stocks/{symbol}")
async def stocks(symbol: str):
    candles = get_stock_data(symbol)
    return {"candles": candles}

# =============================
# PAPER TRADES (BASIC)
# =============================
@api_router.get("/paper-trades")
async def get_trades():
    return {"trades": db["paper_trades"]}

# =============================
# FINAL LINE (CRITICAL)
# =============================
app.include_router(api_router)
