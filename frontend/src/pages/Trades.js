import React, { useState, useEffect } from 'react';
import { paperTrades } from '../lib/api';
import Layout from '../components/Layout';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { 
  FileText, 
  TrendingUp, 
  TrendingDown,
  DollarSign,
  Target,
  RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import { formatPrice, formatPercent, formatDateTime, getPriceChangeColor } from '../lib/utils';

const Trades = () => {
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');

  const fetchTrades = async () => {
    setLoading(true);
    try {
      const response = await paperTrades.getAll();
      setTrades(response.data.trades);
    } catch (error) {
      toast.error('Failed to fetch trades');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrades();
  }, []);

  const handleCloseTrade = async (tradeId) => {
    try {
      const result = await paperTrades.close(tradeId, 'manual');
      toast.success(`Trade closed. P/L: ${formatPrice(result.data.profit_loss)}`);
      fetchTrades();
    } catch (error) {
      toast.error('Failed to close trade');
    }
  };

  const openTrades = trades.filter(t => t.status === 'open');
  const closedTrades = trades.filter(t => t.status === 'closed');

  const filteredTrades = activeTab === 'open' ? openTrades : 
                         activeTab === 'closed' ? closedTrades : trades;

  // Calculate stats
  const totalPnL = closedTrades.reduce((sum, t) => sum + (t.profit_loss || 0), 0);
  const winningTrades = closedTrades.filter(t => t.profit_loss > 0);
  const losingTrades = closedTrades.filter(t => t.profit_loss <= 0);
  const winRate = closedTrades.length > 0 ? (winningTrades.length / closedTrades.length) * 100 : 0;

  return (
    <Layout>
      <div className="p-4 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/30">
              <FileText className="h-6 w-6 text-blue-400" />
            </div>
            <div>
              <h1 className="font-heading text-2xl font-bold text-white">Paper Trades</h1>
              <p className="text-sm text-zinc-400">Track your simulated trading history</p>
            </div>
          </div>

          <Button
            variant="outline"
            onClick={fetchTrades}
            className="border-zinc-700"
            data-testid="refresh-trades-button"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-zinc-800">
                  <DollarSign className="h-5 w-5 text-zinc-400" />
                </div>
                <div>
                  <p className="text-xs text-zinc-500 uppercase tracking-wider">Total P/L</p>
                  <p className={`font-mono text-xl font-bold ${getPriceChangeColor(totalPnL)}`}>
                    {formatPrice(totalPnL)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-zinc-800">
                  <Target className="h-5 w-5 text-zinc-400" />
                </div>
                <div>
                  <p className="text-xs text-zinc-500 uppercase tracking-wider">Win Rate</p>
                  <p className={`font-mono text-xl font-bold ${winRate >= 50 ? 'text-green-400' : 'text-red-400'}`}>
                    {winRate.toFixed(1)}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <TrendingUp className="h-5 w-5 text-green-400" />
                </div>
                <div>
                  <p className="text-xs text-zinc-500 uppercase tracking-wider">Winning</p>
                  <p className="font-mono text-xl font-bold text-green-400">
                    {winningTrades.length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-red-500/10">
                  <TrendingDown className="h-5 w-5 text-red-400" />
                </div>
                <div>
                  <p className="text-xs text-zinc-500 uppercase tracking-wider">Losing</p>
                  <p className="font-mono text-xl font-bold text-red-400">
                    {losingTrades.length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Trades Table */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-0">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="bg-zinc-800">
                <TabsTrigger value="all" className="data-[state=active]:bg-zinc-700" data-testid="tab-all">
                  All ({trades.length})
                </TabsTrigger>
                <TabsTrigger value="open" className="data-[state=active]:bg-zinc-700" data-testid="tab-open">
                  Open ({openTrades.length})
                </TabsTrigger>
                <TabsTrigger value="closed" className="data-[state=active]:bg-zinc-700" data-testid="tab-closed">
                  Closed ({closedTrades.length})
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent className="pt-4">
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : filteredTrades.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="h-12 w-12 text-zinc-600 mx-auto mb-4" />
                <p className="text-zinc-400">No trades found</p>
                <p className="text-xs text-zinc-500 mt-1">
                  Start trading from the Dashboard
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-zinc-800 hover:bg-transparent">
                      <TableHead className="text-zinc-500 text-xs">Symbol</TableHead>
                      <TableHead className="text-zinc-500 text-xs">Type</TableHead>
                      <TableHead className="text-zinc-500 text-xs">Qty</TableHead>
                      <TableHead className="text-zinc-500 text-xs">Entry</TableHead>
                      <TableHead className="text-zinc-500 text-xs">Exit</TableHead>
                      <TableHead className="text-zinc-500 text-xs">Stop</TableHead>
                      <TableHead className="text-zinc-500 text-xs">P/L</TableHead>
                      <TableHead className="text-zinc-500 text-xs">Status</TableHead>
                      <TableHead className="text-zinc-500 text-xs">Date</TableHead>
                      <TableHead className="w-20"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTrades.map((trade) => (
                      <TableRow 
                        key={trade.id} 
                        className="border-zinc-800 hover:bg-zinc-800/50"
                        data-testid={`trade-row-${trade.id}`}
                      >
                        <TableCell className="font-mono font-semibold text-white">
                          {trade.symbol}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={trade.position_type === 'long' 
                              ? 'border-green-500/30 text-green-400' 
                              : 'border-red-500/30 text-red-400'}
                          >
                            {trade.position_type === 'long' ? (
                              <TrendingUp className="h-3 w-3 mr-1" />
                            ) : (
                              <TrendingDown className="h-3 w-3 mr-1" />
                            )}
                            {trade.position_type.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-zinc-300">{trade.quantity}</TableCell>
                        <TableCell className="font-mono text-zinc-300">
                          {formatPrice(trade.entry_price)}
                        </TableCell>
                        <TableCell className="font-mono text-zinc-300">
                          {trade.exit_price ? formatPrice(trade.exit_price) : '-'}
                        </TableCell>
                        <TableCell className="font-mono text-pink-400">
                          {formatPrice(trade.stop_price)}
                        </TableCell>
                        <TableCell className={`font-mono font-semibold ${
                          trade.profit_loss !== null 
                            ? getPriceChangeColor(trade.profit_loss) 
                            : 'text-zinc-500'
                        }`}>
                          {trade.profit_loss !== null ? formatPrice(trade.profit_loss) : '-'}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={trade.status === 'open' 
                              ? 'border-green-500/30 text-green-400 bg-green-500/10' 
                              : 'border-zinc-600 text-zinc-400'}
                          >
                            {trade.status.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-zinc-500">
                          {formatDateTime(trade.entry_time)}
                        </TableCell>
                        <TableCell>
                          {trade.status === 'open' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleCloseTrade(trade.id)}
                              className="border-zinc-700 text-zinc-400 hover:text-white hover:border-red-500"
                              data-testid={`close-trade-${trade.id}`}
                            >
                              Close
                            </Button>
                          )}
                          {trade.status === 'closed' && trade.exit_reason && (
                            <span className="text-xs text-zinc-500">
                              {trade.exit_reason}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default Trades;
