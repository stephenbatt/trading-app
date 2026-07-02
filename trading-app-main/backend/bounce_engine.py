"""
REDEYEBATT Bounce Engine
EMA Discovery + CCI + MACD Histogram + Signal Generation
"""

import pandas as pd
import numpy as np


def calc_ema(series, period):
    return series.ewm(span=period, adjust=False).mean()


def calc_cci(df, period=20):
    tp = (df["high"] + df["low"] + df["close"]) / 3
    sma = tp.rolling(window=period).mean()
    mad = tp.rolling(window=period).apply(
        lambda x: np.mean(np.abs(x - np.mean(x))),
        raw=True
    )
    return (tp - sma) / (0.015 * mad)


def calc_macd_histogram(series, fast=12, slow=26, signal=9):
    ema_fast = calc_ema(series, fast)
    ema_slow = calc_ema(series, slow)
    macd_line = ema_fast - ema_slow
    signal_line = calc_ema(macd_line, signal)
    return macd_line - signal_line


class BounceEngine:
    def __init__(self, tolerance=0.003):
        self.tolerance = tolerance
        self.min_clean_bounces = 5
        self.min_follow_through = 1.0

    def _touched_ema(self, row, ema_value):
        if pd.isna(ema_value):
            return False

        band_high = ema_value * (1 + self.tolerance)
        band_low = ema_value * (1 - self.tolerance)

        return row["low"] <= band_high and row["high"] >= band_low

    def is_bullish_bounce(self, row, ema_value):
        return self._touched_ema(row, ema_value) and row["close"] > ema_value

    def is_bearish_rejection(self, row, ema_value):
        return self._touched_ema(row, ema_value) and row["close"] < ema_value

    def measure_follow_through(self, df, index, direction, lookahead=10):
        if index + 1 >= len(df):
            return 0.0, 0

        entry_close = df.iloc[index]["close"]
        ema_at_touch = df.iloc[index]["ema"]
        future = df.iloc[index + 1:index + 1 + lookahead]

        if future.empty:
            return 0.0, 0

        if direction == "bullish":
            best_price = future["high"].max()
            pct_move = ((best_price - entry_close) / entry_close) * 100
            candles_held = int((future["close"] > ema_at_touch).sum())
        else:
            best_price = future["low"].min()
            pct_move = ((entry_close - best_price) / entry_close) * 100
            candles_held = int((future["close"] < ema_at_touch).sum())

        return pct_move, candles_held

    def score_ema(self, df, period, lookahead=10):
        if period >= len(df):
            return None

        df = df.copy()
        df["ema"] = calc_ema(df["close"], period)

        clean_bounces = 0
        failed_bounces = 0
        total_follow_through = 0.0
        total_hold_candles = 0

        for i in range(period, len(df) - lookahead):
            row = df.iloc[i]
            ema_value = row["ema"]

            direction = None

            if self.is_bullish_bounce(row, ema_value):
                direction = "bullish"
            elif self.is_bearish_rejection(row, ema_value):
                direction = "bearish"

            if direction is None:
                continue

            pct_move, candles_held = self.measure_follow_through(df, i, direction, lookahead)

            if pct_move >= self.min_follow_through and candles_held >= 3:
                clean_bounces += 1
                total_follow_through += pct_move
                total_hold_candles += candles_held
            else:
                failed_bounces += 1

        total_tests = clean_bounces + failed_bounces

        if total_tests == 0 or clean_bounces < self.min_clean_bounces:
            return {
                "period": period,
                "clean_bounces": clean_bounces,
                "failed_bounces": failed_bounces,
                "success_rate": 0.0,
                "avg_follow_through": 0.0,
                "avg_hold_candles": 0.0,
                "respect_score": 0.0,
                "qualified": False,
            }

        avg_follow_through = total_follow_through / clean_bounces
        avg_hold_candles = total_hold_candles / clean_bounces
        success_rate = clean_bounces / total_tests

        touch_penalty = max(0, total_tests - 80) * 2
        failure_penalty = failed_bounces * 12

        respect_score = (
            clean_bounces * 6
            + avg_follow_through * 15
            + avg_hold_candles * 4
            + success_rate * 100
            - failure_penalty
            - touch_penalty
        )

        return {
            "period": period,
            "clean_bounces": clean_bounces,
            "failed_bounces": failed_bounces,
            "success_rate": round(success_rate * 100, 2),
            "avg_follow_through": round(avg_follow_through, 2),
            "avg_hold_candles": round(avg_hold_candles, 2),
            "respect_score": round(respect_score, 2),
            "qualified": True,
        }

    def rank_emas(self, df, periods, lookahead=10):
        results = []

        for period in periods:
            result = self.score_ema(df, period, lookahead)
            if result and result["qualified"]:
                results.append(result)

        results.sort(key=lambda x: x["respect_score"], reverse=True)
        return results

    def discover_best_emas(self, df):
        fast_ranked = self.rank_emas(df, list(range(5, 101, 5)))
        mid_ranked = self.rank_emas(df, list(range(100, 201, 5)))
        slow_ranked = self.rank_emas(df, list(range(200, 351, 5)))

        return {
            "fast": fast_ranked[0] if fast_ranked else None,
            "mid": mid_ranked[0] if mid_ranked else None,
            "slow": slow_ranked[0] if slow_ranked else None,
            "fast_ranked": fast_ranked[:10],
            "mid_ranked": mid_ranked[:10],
            "slow_ranked": slow_ranked[:10],
        }


class SignalGenerator:
    def __init__(self, fast_period, mid_period, slow_period, cci_period=20, tolerance=0.003):
        self.fast_period = fast_period
        self.mid_period = mid_period
        self.slow_period = slow_period
        self.cci_period = cci_period
        self.engine = BounceEngine(tolerance=tolerance)

    def generate(self, df):
        df = df.copy()

        df["ema_fast"] = calc_ema(df["close"], self.fast_period)
        df["ema_mid"] = calc_ema(df["close"], self.mid_period)
        df["ema_slow"] = calc_ema(df["close"], self.slow_period)
        df["cci"] = calc_cci(df, self.cci_period)
        df["macd_hist"] = calc_macd_histogram(df["close"])

        signals = []
        stop_refs = []

        for i in range(len(df)):
            if i == 0:
                signals.append("NONE")
                stop_refs.append(None)
                continue

            row = df.iloc[i]
            prev = df.iloc[i - 1]

            if pd.isna(row["cci"]) or pd.isna(row["macd_hist"]) or pd.isna(row["ema_fast"]):
                signals.append("NONE")
                stop_refs.append(None)
                continue

            touched_fast = self.engine._touched_ema(row, row["ema_fast"])

            cci_cross_up = prev["cci"] < 0 and row["cci"] >= 0
            cci_cross_down = prev["cci"] > 0 and row["cci"] <= 0

            bullish = row["close"] > row["ema_fast"] and row["macd_hist"] > 0
            bearish = row["close"] < row["ema_fast"] and row["macd_hist"] < 0

            if bullish and touched_fast and cci_cross_up:
                signals.append("BUY")
                stop_refs.append(round(row["ema_mid"], 4))
            elif bearish and touched_fast and cci_cross_down:
                signals.append("SELL")
                stop_refs.append(round(row["ema_mid"], 4))
            else:
                signals.append("NONE")
                stop_refs.append(None)

        df["signal"] = signals
        df["stop_ref"] = stop_refs

        return df

    def get_latest_signal(self, df):
        result = self.generate(df)
        last = result.iloc[-1]

        return {
            "signal": last["signal"],
            "close": round(last["close"], 4),
            "ema_fast": round(last["ema_fast"], 4),
            "ema_mid": round(last["ema_mid"], 4),
            "ema_slow": round(last["ema_slow"], 4),
            "cci": round(last["cci"], 2),
            "macd_hist": round(last["macd_hist"], 4),
            "stop_ref": last["stop_ref"],
            "fast_period": self.fast_period,
            "mid_period": self.mid_period,
            "slow_period": self.slow_period,
        }


def discover_emas(df, tolerance=0.003):
    return BounceEngine(tolerance=tolerance).discover_best_emas(df)


def run_signals(df, fast, mid, slow, cci_period=20, tolerance=0.003):
    return SignalGenerator(fast, mid, slow, cci_period, tolerance).generate(df)


def get_latest_signal(df, fast, mid, slow):
    return SignalGenerator(fast, mid, slow).get_latest_signal(df)