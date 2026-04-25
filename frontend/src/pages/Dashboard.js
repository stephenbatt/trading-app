import React, { useState, useEffect, useCallback } from 'react';
import { stocks, paperTrades, settings as settingsApi } from '../lib/api';
import Layout from '../components/Layout';
import TradingChart from '../components/CandlestickChart';
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
import { RefreshCw, TrendingUp, TrendingDown, Wallet } from 'lucide-react';
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

  const [bankroll] = useState(10000);

  // ================= SYMBOLS =================
  useEffect(() => {
    const load = async () => {
      try {
        const res = await stocks.getSymbols();
        setSymbols(res.data.symbols || []);
      } catch (e) {
        console.error(e);
      }
    };
    load();
  }, []);

  // ================= SETTINGS =================
  useEffect(() => {
    const load = async () => {
      try {
        const res = await settingsApi.get();
        setUserSettings(res.data);
      } catch (e) {
        console.error(e);
      }
    };
    load();
  }, []);

  // ================= FETCH DATA =================
  const fetchStockData = useCallback(async () => {
    try {
      const hour = new Date().getHours();
      const interval = (hour >= 9 && hour <= 16) ? '5min' : 'daily';

      const res = await stocks.getIndicators(symbol, {
        fast_ema: userSettings.fast_ema,
        mid_ema: userSettings.mid_ema,
        slow_ema: userSettings.slow_ema,
        interval
      });

      setStockData(res.data);
    } catch (e) {
      console.error(e);
      toast.error('Failed to load stock data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [symbol, userSettings]);

  // ================= AUTO REFRESH =================
  useEffect(() => {
    fetchStockData();
    const id = setInterval(fetchStockData, 30000);
    return () => clearInterval(id);
  }, [fetchStockData]);

  // ================= UI DATA =================
  const candles = stockData?.candles || [];
  const current = candles[candles.length - 1];
  const prev = candles[candles.length - 2];

  const change = current && prev
    ? ((current.close - prev.close) / prev.close) * 100
    : 0;

  // ================= RENDER =================
  return (
    <Layout>
      <div className="p-4 space-y-4">

        {/* HEADER */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4 flex justify-between items-center">
            <div>
              <h2 className="text-2xl text-white font-bold">{symbol}</h2>
              {loading ? <Skeleton className="h-8 w-32 mt-2" /> : (
                <div className="flex gap-3 mt-2">
                  <span className="text-3xl font-mono text-white">
                    {formatPrice(current?.close)}
                  </span>
                  <span className={getPriceChangeColor(change)}>
                    {formatPercent(change)}
                  </span>
                </div>
              )}
            </div>

            <Select value={symbol} onValueChange={setSymbol}>
              <SelectTrigger className="w-[180px] bg-zinc-800">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {symbols.map(s => (
                  <SelectItem key={s.symbol} value={s.symbol}>
                    {s.symbol}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button onClick={() => {
              setRefreshing(true);
              fetchStockData();
            }}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>

        {/* CHART */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-2">
            {loading ? (
              <Skeleton className="h-[400px]" />
            ) : (
              <TradingChart data={candles} height={400} />
            )}
          </CardContent>
        </Card>

        {/* CCI */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent>
            <CCIChart data={candles} height={150} />
          </CardContent>
        </Card>

        {/* MACD */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent>
            <MACDChart data={candles} height={120} />
          </CardContent>
        </Card>

      </div>
    </Layout>
  );
};

export default Dashboard;
