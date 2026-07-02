import React, { useState, useEffect } from 'react';
import { backtest, stocks } from '../lib/api';
import Layout from '../components/Layout';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { 
  FlaskConical, 
  Play, 
  Trophy, 
  TrendingUp, 
  TrendingDown,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { toast } from 'sonner';
import { formatPercent, formatPrice, getPriceChangeColor } from '../lib/utils';

const Backtester = () => {
  const [symbol, setSymbol] = useState('AAPL');
  const [symbols, setSymbols] = useState([]);
  const [initialCapital, setInitialCapital] = useState(10000);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);
  const [expandedRow, setExpandedRow] = useState(null);
  
  // EMA ranges
  const [fastEmaRange, setFastEmaRange] = useState('5,10,15,20');
  const [midEmaRange, setMidEmaRange] = useState('20,30,40,50');
  const [slowEmaRange, setSlowEmaRange] = useState('50,100,150,200');

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

  const parseRange = (rangeStr) => {
    return rangeStr.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
  };

  const runBacktest = async () => {
    setRunning(true);
    setResults(null);

    try {
      const response = await backtest.run({
        symbol,
        fast_ema_range: parseRange(fastEmaRange),
        mid_ema_range: parseRange(midEmaRange),
        slow_ema_range: parseRange(slowEmaRange),
        initial_capital: initialCapital,
      });

      setResults(response.data);
      toast.success(`Backtest complete! Tested ${response.data.total_combinations} combinations`);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Backtest failed');
    } finally {
      setRunning(false);
    }
  };

  const toggleRowExpand = (index) => {
    setExpandedRow(expandedRow === index ? null : index);
  };

  return (
    <Layout>
      <div className="p-4 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/30">
            <FlaskConical className="h-6 w-6 text-purple-400" />
          </div>
          <div>
            <h1 className="font-heading text-2xl font-bold text-white">EMA Backtester</h1>
            <p className="text-sm text-zinc-400">
              Test multiple EMA combinations to find the best performing strategy
            </p>
          </div>
        </div>

        {/* Configuration */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Symbol & Capital */}
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-zinc-400">Symbol & Capital</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs text-zinc-500">Stock Symbol</Label>
                <Select value={symbol} onValueChange={setSymbol}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700" data-testid="backtest-symbol-selector">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-700">
                    {symbols.map((s) => (
                      <SelectItem key={s.symbol} value={s.symbol} className="text-white">
                        <span className="font-mono">{s.symbol}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-zinc-500">Initial Capital ($)</Label>
                <Input
                  type="number"
                  value={initialCapital}
                  onChange={(e) => setInitialCapital(parseFloat(e.target.value))}
                  className="bg-zinc-800 border-zinc-700 font-mono"
                  data-testid="initial-capital-input"
                />
              </div>
            </CardContent>
          </Card>

          {/* EMA Ranges */}
          <Card className="bg-zinc-900 border-zinc-800 lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-zinc-400">EMA Period Ranges</CardTitle>
              <CardDescription className="text-xs text-zinc-500">
                Enter comma-separated values for each EMA period range to test
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs text-amber-500">Fast EMA Periods</Label>
                  <Input
                    value={fastEmaRange}
                    onChange={(e) => setFastEmaRange(e.target.value)}
                    placeholder="5,10,15,20"
                    className="bg-zinc-800 border-zinc-700 font-mono text-sm"
                    data-testid="fast-ema-range-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-purple-500">Mid EMA Periods</Label>
                  <Input
                    value={midEmaRange}
                    onChange={(e) => setMidEmaRange(e.target.value)}
                    placeholder="20,30,40,50"
                    className="bg-zinc-800 border-zinc-700 font-mono text-sm"
                    data-testid="mid-ema-range-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-pink-500">Slow EMA Periods</Label>
                  <Input
                    value={slowEmaRange}
                    onChange={(e) => setSlowEmaRange(e.target.value)}
                    placeholder="50,100,150,200"
                    className="bg-zinc-800 border-zinc-700 font-mono text-sm"
                    data-testid="slow-ema-range-input"
                  />
                </div>
              </div>

              <div className="pt-2">
                <Button
                  onClick={runBacktest}
                  disabled={running}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white btn-interactive"
                  data-testid="run-backtest-button"
                >
                  {running ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Running Backtest...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      Run Backtest
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Results */}
        {running && (
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-8 text-center">
              <Loader2 className="h-12 w-12 animate-spin text-purple-400 mx-auto mb-4" />
              <p className="text-zinc-400">Running backtest for {symbol}...</p>
              <p className="text-xs text-zinc-500 mt-2">This may take a moment</p>
            </CardContent>
          </Card>
        )}

        {results && !running && (
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Trophy className="h-5 w-5 text-yellow-500" />
                  <CardTitle className="text-lg text-white">
                    Backtest Results: {results.symbol}
                  </CardTitle>
                </div>
                <Badge variant="outline" className="border-zinc-700 text-zinc-400 font-mono">
                  {results.total_combinations} combinations tested
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {results.results.length === 0 ? (
                <div className="text-center py-8">
                  <AlertCircle className="h-12 w-12 text-zinc-500 mx-auto mb-4" />
                  <p className="text-zinc-400">No valid combinations found</p>
                  <p className="text-xs text-zinc-500 mt-2">
                    Make sure Fast &lt; Mid &lt; Slow EMA periods
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-zinc-800 hover:bg-transparent">
                        <TableHead className="text-zinc-500 text-xs font-medium uppercase tracking-wider">Rank</TableHead>
                        <TableHead className="text-amber-500 text-xs font-medium uppercase tracking-wider">Fast</TableHead>
                        <TableHead className="text-purple-500 text-xs font-medium uppercase tracking-wider">Mid</TableHead>
                        <TableHead className="text-pink-500 text-xs font-medium uppercase tracking-wider">Slow</TableHead>
                        <TableHead className="text-zinc-500 text-xs font-medium uppercase tracking-wider">Return</TableHead>
                        <TableHead className="text-zinc-500 text-xs font-medium uppercase tracking-wider">Win Rate</TableHead>
                        <TableHead className="text-zinc-500 text-xs font-medium uppercase tracking-wider">Trades</TableHead>
                        <TableHead className="text-zinc-500 text-xs font-medium uppercase tracking-wider">Drawdown</TableHead>
                        <TableHead className="text-zinc-500 text-xs font-medium uppercase tracking-wider">Final</TableHead>
                        <TableHead className="w-8"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {results.results.map((result, index) => (
                        <React.Fragment key={index}>
                          <TableRow 
                            className="border-zinc-800 hover:bg-zinc-800/50 cursor-pointer"
                            onClick={() => toggleRowExpand(index)}
                            data-testid={`result-row-${index}`}
                          >
                            <TableCell className="font-mono">
                              {index === 0 && <Trophy className="h-4 w-4 text-yellow-500 inline mr-1" />}
                              #{index + 1}
                            </TableCell>
                            <TableCell className="font-mono text-amber-400">{result.fast_ema}</TableCell>
                            <TableCell className="font-mono text-purple-400">{result.mid_ema}</TableCell>
                            <TableCell className="font-mono text-pink-400">{result.slow_ema}</TableCell>
                            <TableCell className={`font-mono font-semibold ${getPriceChangeColor(result.total_return)}`}>
                              {formatPercent(result.total_return)}
                            </TableCell>
                            <TableCell className="font-mono">
                              <span className={result.win_rate >= 50 ? 'text-green-400' : 'text-red-400'}>
                                {result.win_rate.toFixed(1)}%
                              </span>
                            </TableCell>
                            <TableCell className="font-mono text-zinc-400">{result.total_trades}</TableCell>
                            <TableCell className="font-mono text-red-400">-{result.max_drawdown.toFixed(1)}%</TableCell>
                            <TableCell className="font-mono text-white">{formatPrice(result.final_capital)}</TableCell>
                            <TableCell>
                              {expandedRow === index ? (
                                <ChevronUp className="h-4 w-4 text-zinc-400" />
                              ) : (
                                <ChevronDown className="h-4 w-4 text-zinc-400" />
                              )}
                            </TableCell>
                          </TableRow>

                          {/* Expanded Trade Details */}
                          {expandedRow === index && result.trades && (
                            <TableRow className="bg-zinc-800/30">
                              <TableCell colSpan={10} className="p-4">
                                <div className="space-y-3">
                                  <div className="flex items-center gap-4 text-sm">
                                    <div className="flex items-center gap-2">
                                      <span className="text-zinc-500">Avg Win:</span>
                                      <span className="font-mono text-green-400">{formatPercent(result.avg_win)}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-zinc-500">Avg Loss:</span>
                                      <span className="font-mono text-red-400">{formatPercent(result.avg_loss)}</span>
                                    </div>
                                  </div>

                                  <div className="text-xs text-zinc-500 uppercase tracking-wider">
                                    Recent Trades
                                  </div>

                                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                    {result.trades.slice(-6).map((trade, tIdx) => (
                                      <div
                                        key={tIdx}
                                        className={`p-2 rounded-lg border ${
                                          trade.pnl_pct >= 0 
                                            ? 'bg-green-500/5 border-green-500/20' 
                                            : 'bg-red-500/5 border-red-500/20'
                                        }`}
                                      >
                                        <div className="flex items-center justify-between mb-1">
                                          <Badge 
                                            variant="outline"
                                            className={trade.type === 'long' 
                                              ? 'border-green-500/30 text-green-400 text-xs' 
                                              : 'border-red-500/30 text-red-400 text-xs'}
                                          >
                                            {trade.type === 'long' ? (
                                              <TrendingUp className="h-3 w-3 mr-1" />
                                            ) : (
                                              <TrendingDown className="h-3 w-3 mr-1" />
                                            )}
                                            {trade.type.toUpperCase()}
                                          </Badge>
                                          <span className={`font-mono text-sm font-semibold ${
                                            trade.pnl_pct >= 0 ? 'text-green-400' : 'text-red-400'
                                          }`}>
                                            {formatPercent(trade.pnl_pct)}
                                          </span>
                                        </div>
                                        <div className="flex justify-between text-xs font-mono text-zinc-500">
                                          <span>{formatPrice(trade.entry)} → {formatPrice(trade.exit)}</span>
                                        </div>
                                        <div className="text-xs text-zinc-600 mt-1">
                                          Exit: {trade.exit_reason}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Help Section */}
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-4">
            <h3 className="text-sm font-medium text-zinc-400 mb-3">How the Backtest Works</h3>
            <ul className="space-y-2 text-xs text-zinc-500">
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-0.5">•</span>
                <span><strong className="text-zinc-300">Entry (Long):</strong> Fast EMA crosses above Mid EMA AND price is above Slow EMA</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-500 mt-0.5">•</span>
                <span><strong className="text-zinc-300">Entry (Short):</strong> Fast EMA crosses below Mid EMA AND price is below Slow EMA</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-pink-500 mt-0.5">•</span>
                <span><strong className="text-zinc-300">Trailing Stop:</strong> Slow EMA acts as dynamic stop-loss (never moves against trade direction)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-cyan-500 mt-0.5">•</span>
                <span><strong className="text-zinc-300">Exit:</strong> Price breaks through Slow EMA (stop hit)</span>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default Backtester;
