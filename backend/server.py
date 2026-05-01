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
