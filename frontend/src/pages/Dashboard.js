import React, { useState, useEffect, useCallback } from 'react';
import { stocks, paperTrades, settings as settingsApi } from '../lib/api';
import Layout from '../components/Layout';
import TradingChart from '../components/ProfessionalChart';
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
  const [bankroll, setBankroll] = useState(10000); // Starting bankroll

  // Calculate P&L stats
  const closedTrades = allTrades.filter(t => t.status === 'closed');
  const totalPnL = closedTrades.reduce((sum, t) => sum + (t.profit_loss || 0), 0);
  const winningTrades = closedTrades.filter(t => t.profit_loss > 0);
  const losingTrades = closedTrades.filter(t => t.profit_loss <= 0);
  const winRate = closedTrades.length > 0 ? (winningTrades.length / closedTrades.length) * 100 : 0;
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

  // Fetch stock data
  const fetchStockData = useCallback(async () => {
    try {
      const response = await stocks.getIndicators(symbol, {
        fast_ema: userSettings.fast_ema,
        mid_ema: userSettings.mid_ema,
        slow_ema: userSettings.slow_ema,
        interval: 'daily',
      });
      setStockData(response.data);
    } catch (error) {
      console.error('Failed to fetch stock data:', error);
      toast.error('Failed to load stock data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [symbol, userSettings.fast_ema, userSettings.mid_ema, userSettings.slow_ema]);

  useEffect(() => {
    setLoading(true);
    fetchStockData();
  }, [fetchStockData]);

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
      // Refresh trades
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
      // Refresh all trades to update bankroll
      const allResponse = await paperTrades.getAll();
      setAllTrades(allResponse.data.trades);
    } catch (error) {
      toast.error('Failed to close trade');
    }
  };

  const handleToggleStrategy = async (enabled) => {
    try {
      const newSettings = { ...userSettings, strategy_enabled: enabled };
      await settingsApi.update(newSettings);
      setUserSettings(newSettings);
      toast.success(enabled ? 'Strategy execution enabled' : 'Strategy execution disabled');
    } catch (error) {
      toast.error('Failed to update settings');
    }
  };

  // Calculate current price and change
  const currentCandle = stockData?.candles?.[stockData.candles.length - 1];
  const prevCandle = stockData?.candles?.[stockData.candles.length - 2];
  const priceChange = currentCandle && prevCandle 
    ? ((currentCandle.close - prevCandle.close) / prevCandle.close) * 100 
    : 0;

  return (
    <Layout>
      <div className="p-4 space-y-4">
        {/* Bankroll Stats Bar */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-3 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Wallet className="h-4 w-4 text-blue-400" />
              </div>
              <div>
                <p className="text-xs text-zinc-500">Balance</p>
                <p className={`font-mono text-lg font-bold ${getPriceChangeColor(totalPnL)}`} data-testid="current-balance">
                  {formatPrice(currentBalance)}
                </p>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-3 flex items-center gap-3">
              <div className={`p-2 rounded-lg ${totalPnL >= 0 ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                <DollarSign className={`h-4 w-4 ${totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`} />
              </div>
              <div>
                <p className="text-xs text-zinc-500">Total P/L</p>
                <p className={`font-mono text-lg font-bold ${getPriceChangeColor(totalPnL)}`} data-testid="total-pnl">
                  {totalPnL >= 0 ? '+' : ''}{formatPrice(totalPnL)}
                </p>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-3 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <Target className="h-4 w-4 text-purple-400" />
              </div>
              <div>
                <p className="text-xs text-zinc-500">Win Rate</p>
                <p className={`font-mono text-lg font-bold ${winRate >= 50 ? 'text-green-400' : 'text-red-400'}`}>
                  {winRate.toFixed(0)}%
                </p>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-3 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <Trophy className="h-4 w-4 text-green-400" />
              </div>
              <div>
                <p className="text-xs text-zinc-500">Wins</p>
                <p className="font-mono text-lg font-bold text-green-400">{winningTrades.length}</p>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-3 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500/10">
                <TrendingDown className="h-4 w-4 text-red-400" />
              </div>
              <div>
                <p className="text-xs text-zinc-500">Losses</p>
                <p className="font-mono text-lg font-bold text-red-400">{losingTrades.length}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Top Controls */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {/* Symbol Selector */}
            <Select value={symbol} onValueChange={setSymbol}>
              <SelectTrigger className="w-[180px] bg-zinc-800 border-zinc-700" data-testid="symbol-selector">
                <SelectValue placeholder="Select symbol" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-800 border-zinc-700">
                {symbols.map((s) => (
                  <SelectItem key={s.symbol} value={s.symbol} className="text-white hover:bg-zinc-700">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold">{s.symbol}</span>
                      <span className="text-zinc-400 text-xs">{s.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              size="icon"
              onClick={handleRefresh}
              disabled={refreshing}
              className="border-zinc-700"
              data-testid="refresh-button"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          {/* Strategy Toggle */}
          <div className="flex items-center gap-3 px-4 py-2 rounded-lg bg-zinc-800 border border-zinc-700">
            <Power className={`h-4 w-4 ${userSettings.strategy_enabled ? 'text-green-500' : 'text-zinc-500'}`} />
            <Label htmlFor="strategy-toggle" className="text-sm text-zinc-300">
              Strategy
            </Label>
            <Switch
              id="strategy-toggle"
              checked={userSettings.strategy_enabled}
              onCheckedChange={handleToggleStrategy}
              data-testid="strategy-toggle"
            />
          </div>
        </div>

        {/* Price Header */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="font-heading text-2xl font-bold text-white">{symbol}</h2>
                  <Badge variant="outline" className="border-zinc-700 text-zinc-400">
                    Daily
                  </Badge>
                </div>
                {loading ? (
                  <Skeleton className="h-10 w-40 mt-2" />
                ) : (
                  <div className="flex items-baseline gap-3 mt-2">
                    <span className="font-mono text-4xl font-bold text-white" data-testid="current-price">
                      {formatPrice(currentCandle?.close)}
                    </span>
                    <span className={`font-mono text-lg font-semibold ${getPriceChangeColor(priceChange)}`}>
                      {formatPercent(priceChange)}
                    </span>
                  </div>
                )}
              </div>

              {/* Quick Stats */}
              <div className="flex gap-6">
                <div className="text-center">
                  <p className="text-xs text-zinc-500 uppercase tracking-wider">Open</p>
                  <p className="font-mono text-lg text-white">{formatPrice(currentCandle?.open)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-zinc-500 uppercase tracking-wider">High</p>
                  <p className="font-mono text-lg text-green-400">{formatPrice(currentCandle?.high)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-zinc-500 uppercase tracking-wider">Low</p>
                  <p className="font-mono text-lg text-red-400">{formatPrice(currentCandle?.low)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-zinc-500 uppercase tracking-wider">Volume</p>
                  <p className="font-mono text-lg text-white">
                    {currentCandle?.volume ? (currentCandle.volume / 1000000).toFixed(1) + 'M' : '-'}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Main Grid */}
        <div className="grid grid-cols-12 gap-4">
          {/* Charts Column */}
          <div className="col-span-12 lg:col-span-9 space-y-4">
            {/* Candlestick Chart - TradingView Style */}
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" />
                    {symbol} - Price Chart
                  </CardTitle>
                  <div className="flex items-baseline gap-3">
                    <span className="font-mono text-2xl font-bold text-white" data-testid="current-price">
                      {formatPrice(currentCandle?.close)}
                    </span>
                    <span className={`font-mono text-sm font-semibold ${getPriceChangeColor(priceChange)}`}>
                      {formatPercent(priceChange)}
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-2">
                {loading ? (
                  <Skeleton className="h-[400px] w-full" />
                ) : (
                  <div data-testid="candlestick-chart" className="chart-container">
                    <TradingChart 
                      data={stockData?.candles || []} 
                      height={400} 
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* CCI Chart */}
            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="p-2">
                {loading ? (
                  <Skeleton className="h-[150px] w-full" />
                ) : (
                  <div className="chart-container" data-testid="cci-chart">
                    <CCIChart data={stockData?.candles || []} height={150} />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* MACD Chart */}
            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="p-2">
                {loading ? (
                  <Skeleton className="h-[120px] w-full" />
                ) : (
                  <div className="chart-container" data-testid="macd-chart">
                    <MACDChart data={stockData?.candles || []} height={120} />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="col-span-12 lg:col-span-3 space-y-4">
            {/* EMA Settings */}
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  EMA Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Fast EMA */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-amber-500">Fast EMA</span>
                    <span className="font-mono text-white">{userSettings.fast_ema}</span>
                  </div>
                  <Slider
                    value={[userSettings.fast_ema]}
                    onValueChange={([value]) => setUserSettings(prev => ({ ...prev, fast_ema: value }))}
                    min={5}
                    max={50}
                    step={1}
                    className="[&_[role=slider]]:bg-amber-500"
                    data-testid="fast-ema-slider"
                  />
                </div>

                {/* Mid EMA */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-purple-500">Mid EMA</span>
                    <span className="font-mono text-white">{userSettings.mid_ema}</span>
                  </div>
                  <Slider
                    value={[userSettings.mid_ema]}
                    onValueChange={([value]) => setUserSettings(prev => ({ ...prev, mid_ema: value }))}
                    min={20}
                    max={100}
                    step={1}
                    className="[&_[role=slider]]:bg-purple-500"
                    data-testid="mid-ema-slider"
                  />
                </div>

                {/* Slow EMA */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-pink-500">Slow EMA</span>
                    <span className="font-mono text-white">{userSettings.slow_ema}</span>
                  </div>
                  <Slider
                    value={[userSettings.slow_ema]}
                    onValueChange={([value]) => setUserSettings(prev => ({ ...prev, slow_ema: value }))}
                    min={50}
                    max={300}
                    step={5}
                    className="[&_[role=slider]]:bg-pink-500"
                    data-testid="slow-ema-slider"
                  />
                </div>

                <Button
                  onClick={handleRefresh}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                  disabled={refreshing}
                  data-testid="apply-ema-button"
                >
                  {refreshing ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  Apply Settings
                </Button>
              </CardContent>
            </Card>

            {/* Paper Trading Panel */}
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Paper Trading
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs text-zinc-500">Quantity (shares)</Label>
                  <div className="flex gap-2">
                    {[1, 10, 50, 100].map((qty) => (
                      <Button
                        key={qty}
                        variant={tradingQuantity === qty ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setTradingQuantity(qty)}
                        className={tradingQuantity === qty 
                          ? 'bg-blue-600 text-white' 
                          : 'border-zinc-700 text-zinc-400 hover:text-white'}
                        data-testid={`quantity-${qty}`}
                      >
                        {qty}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    onClick={() => handlePlaceTrade('long')}
                    disabled={placingTrade}
                    className="bg-green-600 hover:bg-green-700 text-white btn-interactive"
                    data-testid="buy-button"
                  >
                    {placingTrade ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                      <>
                        <TrendingUp className="h-4 w-4 mr-1" />
                        BUY
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={() => handlePlaceTrade('short')}
                    disabled={placingTrade}
                    className="bg-red-600 hover:bg-red-700 text-white btn-interactive"
                    data-testid="sell-button"
                  >
                    {placingTrade ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                      <>
                        <TrendingDown className="h-4 w-4 mr-1" />
                        SHORT
                      </>
                    )}
                  </Button>
                </div>

                {/* Open Positions */}
                {openTrades.length > 0 && (
                  <div className="space-y-2 pt-4 border-t border-zinc-800">
                    <p className="text-xs text-zinc-500 uppercase tracking-wider">Open Positions</p>
                    {openTrades.map((trade) => (
                      <div
                        key={trade.id}
                        className="flex items-center justify-between p-2 rounded-lg bg-zinc-800"
                      >
                        <div>
                          <Badge
                            variant={trade.position_type === 'long' ? 'default' : 'destructive'}
                            className={trade.position_type === 'long' 
                              ? 'bg-green-500/20 text-green-400 border-green-500/30' 
                              : 'bg-red-500/20 text-red-400 border-red-500/30'}
                          >
                            {trade.position_type.toUpperCase()}
                          </Badge>
                          <p className="text-xs text-zinc-400 mt-1 font-mono">
                            {trade.quantity} @ {formatPrice(trade.entry_price)}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleCloseTrade(trade.id)}
                          className="text-zinc-400 hover:text-white"
                          data-testid={`close-trade-${trade.id}`}
                        >
                          Close
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Indicator Values */}
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-zinc-400">Current Indicators</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-zinc-500">CCI (20)</span>
                    <span className={`font-mono text-sm ${
                      currentCandle?.cci > 100 ? 'text-red-400' : 
                      currentCandle?.cci < -100 ? 'text-green-400' : 'text-cyan-400'
                    }`}>
                      {currentCandle?.cci?.toFixed(1) || '-'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-zinc-500">MACD Hist</span>
                    <span className={`font-mono text-sm ${
                      currentCandle?.macd_histogram >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {currentCandle?.macd_histogram?.toFixed(4) || '-'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-amber-500">Fast EMA</span>
                    <span className="font-mono text-sm text-white">
                      {formatPrice(currentCandle?.fast_ema)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-purple-500">Mid EMA</span>
                    <span className="font-mono text-sm text-white">
                      {formatPrice(currentCandle?.mid_ema)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-pink-500">Slow EMA</span>
                    <span className="font-mono text-sm text-white">
                      {formatPrice(currentCandle?.slow_ema)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Dashboard;
