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
