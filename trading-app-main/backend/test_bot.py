import yfinance as yf
from strategy_engine import generate_signal

df = yf.download("AAPL", period="5d", interval="5m")

print(generate_signal(df))
