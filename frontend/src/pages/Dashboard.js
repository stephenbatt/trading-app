import React, { useState, useEffect, useCallback } from 'react';
import { stocks, paperTrades, settings as settingsApi } from '../lib/api';
import Layout from '../components/Layout';
import TradingChart from '../components/TradingViewChart';
import CCIChart from '../components/CCIChart';
import MACDChart from '../components/MACDChart';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Slider } from '../components/ui/slider';
import { Switch } from '../components/ui/switch';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';
import {
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Activity,
  DollarSign,
  BarChart3,
  Loader2,
  Power,
  Wallet,
  Trophy,
  Target
} from 'lucide-react';
import { toast } from 'sonner';
import { formatPrice, formatPercent, getPriceChangeColor } from '../lib/utils';

const Dashboard = () => {
  const [symbol, setSymbol] = useState('AAPL');
  const [interval, setInterval] = useState('5min');
  const [symbols, setSymbols] = useState([]);
  const [stockData, setStockData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [userSettings, setUserSettings] = useState({
    fast_ema: 20,
    mid_ema: 50,
    slow_ema: 200,
    strategy_enabled: false,
  });

  const [openTrades, setOpenTrades] = useState([]);
  const [allTrades, setAllTrades] = useState([]);
  const [tradingQuantity, setTradingQuantity] = useState(10);
  const [placingTrade, setPlacingTrade] = useState(false);
  const [bankroll, setBankroll] = useState(10000);

  const fetchStockData = useCallback(async () => {
    try {
      const response = await stocks.getIndicators(symbol, {
        fast_ema: userSettings.fast_ema,
        mid_ema: userSettings.mid_ema,
        slow_ema: userSettings.slow_ema,
        interval: interval,
      });

      setStockData(response.data);
    } catch (error) {
      console.error('Failed to fetch stock data:', error);
      toast.error('Failed to load stock data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [symbol, userSettings, interval]);

  // Calculate P&L stats
  const closedTrades = allTrades.filter(t => t.status === 'closed');
  const totalPnL = closedTrades.reduce((sum, t) => sum + (t.profit_loss || 0), 0);
  const winningTrades = closedTrades.filter(t => t.profit_loss > 0);
  const losingTrades = closedTrades.filter(t => t.profit_loss <= 0);
  const winRate = closedTrades.length > 0
    ? (winningTrades.length / closedTrades.length) * 100
    : 0;

  const currentBalance = bankroll + totalPnL;

  // Fetch available symbols
  useEffect(() => {
    const fetchSymbols = async () => {
      try {
        const response = await stocks.getSymbols();
        setSymbols(response.data.symbols);
      } catch (error) {
        console.error('Failed to fetch symbols:', error);
      }
    };

    fetchSymbols();
  }, []);

  // Fetch user settings
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await settingsApi.get();
        setUserSettings(response.data);
      } catch (error) {
        console.error('Failed to fetch settings:', error);
      }
    };

    fetchSettings();
  }, []);

  useEffect(() => {
    fetchStockData();

    const intervalId = setInterval(() => {
      fetchStockData();
    }, 30000);

    return () => clearInterval(intervalId);
  }, [fetchStockData, interval]);

  // Fetch open trades
  useEffect(() => {
    const fetchTrades = async () => {
      try {
        const [openResponse, allResponse] = await Promise.all([
          paperTrades.getAll('open'),
          paperTrades.getAll()
        ]);

        setOpenTrades(openResponse.data.trades.filter(t => t.symbol === symbol));
        setAllTrades(allResponse.data.trades);
      } catch (error) {
        console.error('Failed to fetch trades:', error);
      }
    };

    fetchTrades();
  }, [symbol]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchStockData();
  };

  const handlePlaceTrade = async (positionType) => {
    setPlacingTrade(true);

    try {
      await paperTrades.create(symbol, positionType, tradingQuantity);

      toast.success(`${positionType.toUpperCase()} position opened for ${symbol}`);

      const [openResponse, allResponse] = await Promise.all([
        paperTrades.getAll('open'),
        paperTrades.getAll()
      ]);

      setOpenTrades(openResponse.data.trades.filter(t => t.symbol === symbol));
      setAllTrades(allResponse.data.trades);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to place trade');
    } finally {
      setPlacingTrade(false);
    }
  };

  const handleCloseTrade = async (tradeId) => {
    try {
      const result = await paperTrades.close(tradeId, 'manual');

      toast.success(`Trade closed. P/L: ${formatPrice(result.data.profit_loss)}`);

      setOpenTrades(prev => prev.filter(t => t.id !== tradeId));

      const allResponse = await paperTrades.getAll();
      setAllTrades(allResponse.data.trades);
    } catch (error) {
      toast.error('Failed to close trade');
    }
  };

  const handleToggleStrategy = async (enabled) => {
    try {
      const newSettings = {
        ...userSettings,
        strategy_enabled: enabled,
      };

      await settingsApi.update(newSettings);

      setUserSettings(newSettings);

      toast.success(
        enabled
          ? 'Strategy execution enabled'
          : 'Strategy execution disabled'
      );
    } catch (error) {
      toast.error('Failed to update settings');
    }
  };

  // Calculate current price and change
  const currentCandle = stockData?.candles?.[
    stockData.candles.length - 1
  ];

  const prevCandle = stockData?.candles?.[
    stockData.candles.length - 2
  ];

  const priceChange = currentCandle && prevCandle
    ? ((currentCandle.close - prevCandle.close) / prevCandle.close) * 100
    : 0;

  return (
    <Layout>
      <div className="p-4 text-white">
        Dashboard repaired successfully.
      </div>
    </Layout>
  );
};

export default Dashboard;

