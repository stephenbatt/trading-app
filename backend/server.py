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
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api_router = APIRouter(prefix="/api")

# ==================== DB SETUP ====================

MONGO_URL = os.getenv("MONGO_URL") or os.getenv("MONGODB_URI")
DB_NAME = os.getenv("DB_NAME", "trading_app")

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

@api_router.get("/settings")
async def get_settings():
    return {
        "fast_ema": 20,
        "mid_ema": 50,
        "slow_ema": 200,
        "strategy_enabled": False,
    }


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
        "id": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc)
        + timedelta(hours=JWT_EXPIRATION_HOURS),
        "iat": datetime.now(timezone.utc),
    }

    return jwt.encode(
        payload,
        JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    try:
        token = credentials.credentials

        payload = jwt.decode(
            token,
            JWT_SECRET,
            algorithms=[JWT_ALGORITHM],
        )

        user_id = payload.get("id") or payload.get("sub")

        if not user_id:
            raise HTTPException(
                status_code=401,
                detail="Invalid token",
            )

        user = await db.users.find_one({"id": user_id})

        if not user:
            raise HTTPException(
                status_code=401,
                detail="User not found",
            )

        return user

    except Exception:
        raise HTTPException(
            status_code=401,
            detail="Invalid authentication",
        )


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
    user: UserResponse


# ==================== AUTH ROUTES ====================

@api_router.post("/auth/register", response_model=TokenResponse)
async def register(user_data: UserCreate):

    existing = await db.users.find_one(
        {"email": user_data.email}
    )

    if existing:
        raise HTTPException(
            status_code=400,
            detail="Email already registered",
        )

    user_id = str(uuid.uuid4())

    now = datetime.now(
        timezone.utc
    ).isoformat()

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

    token = create_token(
        user_id,
        user_data.email,
    )

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

    user = await db.users.find_one(
        {"email": credentials.email}
    )

    if not user:
        raise HTTPException(
            status_code=401,
            detail="Invalid credentials",
        )

    if not verify_password(
        credentials.password,
        user["password"],
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid credentials",
        )

    token = create_token(
        user["id"],
        user["email"],
    )

    return TokenResponse(
        access_token=token,
        user=UserResponse(
            id=user["id"],
            email=user["email"],
            name=user["name"],
            created_at=user["created_at"],
        ),
    )


@api_router.get(
    "/auth/me",
    response_model=UserResponse,
)
async def get_me(
    user: dict = Depends(get_current_user),
):
    return UserResponse(
        id=user["id"],
        email=user["email"],
        name=user["name"],
        created_at=user["created_at"],
    )


# ---------- ROOT TEST ----------

@app.get("/")
async def root():
    return {"status": "running"}


# ---------- CONNECT ROUTES ----------

app.include_router(api_router)
