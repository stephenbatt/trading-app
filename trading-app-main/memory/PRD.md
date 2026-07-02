# TradeView - Paper Trading Dashboard PRD

## Project Overview
A web-based trading dashboard for stocks/forex focused on testing EMA-based strategies with paper trading capabilities.

## Original Problem Statement
Build a trading dashboard with:
- Login system with multi-user support
- Candlestick chart with 3 configurable EMAs (Fast/Medium/Slow)
- CCI indicator panel (oscilloscope/heartbeat style)
- MACD histogram panel
- EMA backtesting engine that tests multiple combinations
- Paper trading with Slow EMA as trailing stop-loss
- No live broker connection (paper trading only)

## User Personas
1. **Retail Trader** - Testing EMA-based strategies before live trading
2. **Strategy Developer** - Backtesting EMA combinations to find optimal settings
3. **Learning Trader** - Understanding how EMAs, CCI, and MACD work together

## Core Requirements (Static)
- JWT-based authentication with isolated user data
- Stock data via Alpha Vantage API (with sample data fallback)
- Real-time indicator calculations (EMA, CCI, MACD)
- Paper trading simulation with trailing stop-loss
- EMA backtesting with performance ranking

## What's Been Implemented (Feb 2026)

### Backend (FastAPI)
- ✅ JWT authentication (register/login/me)
- ✅ User settings storage per user
- ✅ Alpha Vantage integration with caching
- ✅ Sample data generation fallback (300 days)
- ✅ EMA/CCI/MACD indicator calculations
- ✅ Backtesting engine with EMA crossover strategy
- ✅ Paper trading CRUD with trailing stop
- ✅ MongoDB for data persistence

### Frontend (React + Recharts)
- ✅ Professional dark theme trading UI
- ✅ Candlestick chart with 3 EMA overlays
- ✅ CCI oscilloscope-style panel
- ✅ MACD histogram panel
- ✅ Interactive EMA sliders
- ✅ Paper trading panel (BUY/SHORT)
- ✅ Backtester with results ranking
- ✅ Trade history page
- ✅ Settings page

### Data Flow
- Stock data: Alpha Vantage API → MongoDB cache → Frontend
- Fallback: Sample data generation when API unavailable
- Indicators: Calculated server-side for accuracy

## Prioritized Backlog

### P0 (Complete)
- [x] User authentication
- [x] Stock data display
- [x] Indicator panels
- [x] Paper trading
- [x] EMA backtesting

### P1 (Future)
- [ ] Real Alpha Vantage API key integration
- [ ] Forex data support
- [ ] More indicator types (RSI, Bollinger)
- [ ] Strategy alerts/notifications

### P2 (Later)
- [ ] Broker API plugin architecture
- [ ] Real-time price updates
- [ ] Mobile responsive improvements
- [ ] Export trade history

## Technical Stack
- Backend: FastAPI, MongoDB, Python
- Frontend: React, Recharts, Tailwind CSS, Shadcn/UI
- Auth: JWT tokens with bcrypt
- Data: Alpha Vantage API + sample fallback

## Next Tasks
1. Add real Alpha Vantage API key for live data
2. Implement additional indicators (RSI, Bollinger Bands)
3. Add strategy alert system
4. Create trade performance analytics dashboard
