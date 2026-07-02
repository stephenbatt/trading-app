"""
Test the REDEYEBATT Bounce Engine.
Uses synthetic data so it works without internet/yfinance.

Run:
uv run python test_bounce.py
"""

import pandas as pd
import numpy as np
from bounce_engine import discover_emas, run_signals, get_latest_signal


np.random.seed(7)

rows = 400
price = 100.0
data = []

for i in range(rows):
    change = np.random.normal(0.05, 1.0)

    open_price = price
    close_price = max(1, price + change)
    high_price = max(open_price, close_price) + np.random.uniform(0.2, 1.2)
    low_price = min(open_price, close_price) - np.random.uniform(0.2, 1.2)

    data.append(
        {
            "open": open_price,
            "high": high_price,
            "low": low_price,
            "close": close_price,
            "volume": 1_000_000,
        }
    )

    price = close_price

df = pd.DataFrame(data)

print("\n" + "=" * 60)
print("PHASE 1: EMA DISCOVERY")
print("=" * 60)

results = discover_emas(df)


def show_group(name, winner, ranked):
    if not winner:
        print(f"\n{name}: No qualified EMA found")
        return

    print(f"\n{name} EMA")
    print(
        f"  Winner: EMA {winner['period']} | "
        f"Score: {winner['respect_score']} | "
        f"Success: {winner['success_rate']}% | "
        f"Bounces: {winner['clean_bounces']}"
    )

    print("  Runners-up:")
    for row in ranked[1:4]:
        print(
            f"    EMA {row['period']} | "
            f"Score: {row['respect_score']} | "
            f"Success: {row['success_rate']}% | "
            f"Bounces: {row['clean_bounces']}"
        )


show_group("FAST", results["fast"], results["fast_ranked"])
show_group("MID", results["mid"], results["mid_ranked"])
show_group("SLOW", results["slow"], results["slow_ranked"])

print("\n" + "=" * 60)
print("PHASE 2: SIGNAL GENERATION")
print("=" * 60)

fast = results["fast"]["period"] if results["fast"] else 10
mid = results["mid"]["period"] if results["mid"] else 100
slow = results["slow"]["period"] if results["slow"] else 250

print(f"\nUsing: Fast EMA {fast} | Mid EMA {mid} | Slow EMA {slow}")

signal_df = run_signals(df, fast, mid, slow)

buys = signal_df[signal_df["signal"] == "BUY"]
sells = signal_df[signal_df["signal"] == "SELL"]

print(f"\nTotal candles analyzed: {len(signal_df)}")
print(f"BUY signals: {len(buys)}")
print(f"SELL signals: {len(sells)}")

if len(buys) > 0:
    print("\nLast 3 BUY signals:")
    for _, row in buys.tail(3).iterrows():
        print(
            f"  Close: {row['close']:.2f} | "
            f"Stop ref: {row['stop_ref']} | "
            f"CCI: {row['cci']:.1f} | "
            f"MACD hist: {row['macd_hist']:.4f}"
        )

if len(sells) > 0:
    print("\nLast 3 SELL signals:")
    for _, row in sells.tail(3).iterrows():
        print(
            f"  Close: {row['close']:.2f} | "
            f"Stop ref: {row['stop_ref']} | "
            f"CCI: {row['cci']:.1f} | "
            f"MACD hist: {row['macd_hist']:.4f}"
        )

print("\n" + "=" * 60)
print("PHASE 3: LATEST SIGNAL")
print("=" * 60)

latest = get_latest_signal(df, fast, mid, slow)

for key, value in latest.items():
    print(f"  {key}: {value}")

print("\nAll tests passed.\n")