import pandas as pd
import numpy as np

def ema(series, period):
    return series.ewm(span=period, adjust=False).mean()

def cci(df, period=20):
    tp = (df['high'] + df['low'] + df['close']) / 3
    sma = tp.rolling(period).mean()
    mad = tp.rolling(period).apply(lambda x: np.mean(np.abs(x - np.mean(x))))
    return (tp - sma) / (0.015 * mad)

def macd_hist(series):
    ema12 = ema(series, 12)
    ema26 = ema(series, 26)
    macd = ema12 - ema26
    signal = ema(macd, 9)
    return macd - signal

def find_best_ema(df, start, end):
    best_period = start
    best_score = -1

    for p in range(start, end, 5):
        e = ema(df['close'], p)

        touches = 0
        for i in range(1, len(df)):
            if abs(df['close'].iloc[i] - e.iloc[i]) < 0.5:
                touches += 1

        if touches > best_score:
            best_score = touches
            best_period = p

    return best_period

def generate_signal(df):
    if len(df) < 100:
        return "HOLD"

    fast = find_best_ema(df, 5, 100)
    mid = find_best_ema(df, 100, 200)
    slow = find_best_ema(df, 200, 300)

    df['ema_fast'] = ema(df['close'], fast)
    df['ema_mid'] = ema(df['close'], mid)
    df['ema_slow'] = ema(df['close'], slow)

    df['cci'] = cci(df)
    df['macd_hist'] = macd_hist(df['close'])

    last = df.iloc[-1]

    if (
        last['close'] > last['ema_fast'] > last['ema_mid'] > last['ema_slow']
        and last['cci'] < -100
        and last['macd_hist'] > 0
    ):
        return "BUY"

    if (
        last['close'] < last['ema_fast'] < last['ema_mid'] < last['ema_slow']
        and last['cci'] > 100
        and last['macd_hist'] < 0
    ):
        return "SELL"

    return "HOLD"
