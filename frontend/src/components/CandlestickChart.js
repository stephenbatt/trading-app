import React, { useMemo } from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { formatPrice, formatDate } from '../lib/utils';

// Custom candlestick shape
const CandlestickShape = (props) => {
  const { x, y, width, height, payload } = props;
  if (!payload) return null;

  const { open, close, high, low } = payload;
  const isGreen = close >= open;
  const color = isGreen ? '#22C55E' : '#EF4444';
  
  const bodyTop = Math.min(open, close);
  const bodyBottom = Math.max(open, close);
  const priceRange = props.yAxis?.scale?.domain?.() || [low, high];
  const chartHeight = props.background?.height || 300;
  
  // Calculate Y positions based on price scale
  const getY = (price) => {
    const [minPrice, maxPrice] = priceRange;
    const ratio = (maxPrice - price) / (maxPrice - minPrice);
    return ratio * chartHeight;
  };
  
  const wickX = x + width / 2;
  const candleWidth = Math.max(width * 0.8, 4);
  const candleX = x + (width - candleWidth) / 2;
  
  const bodyHeight = Math.max(Math.abs(getY(bodyTop) - getY(bodyBottom)), 1);
  const bodyY = getY(bodyBottom);

  return (
    <g>
      {/* Wick */}
      <line
        x1={wickX}
        x2={wickX}
        y1={getY(high)}
        y2={getY(low)}
        stroke={color}
        strokeWidth={1}
      />
      {/* Body */}
      <rect
        x={candleX}
        y={bodyY}
        width={candleWidth}
        height={bodyHeight}
        fill={isGreen ? color : color}
        stroke={color}
        strokeWidth={1}
      />
    </g>
  );
};

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload || !payload[0]) return null;

  const data = payload[0].payload;
  const isGreen = data.close >= data.open;
  const changePercent = ((data.close - data.open) / data.open * 100).toFixed(2);

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 shadow-xl">
      <p className="text-xs text-zinc-400 mb-2 font-mono">{data.time}</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs font-mono">
        <span className="text-zinc-500">O</span>
        <span className="text-white">{formatPrice(data.open)}</span>
        <span className="text-zinc-500">H</span>
        <span className="text-white">{formatPrice(data.high)}</span>
        <span className="text-zinc-500">L</span>
        <span className="text-white">{formatPrice(data.low)}</span>
        <span className="text-zinc-500">C</span>
        <span className={isGreen ? 'text-green-500' : 'text-red-500'}>
          {formatPrice(data.close)}
        </span>
      </div>
      <div className={`mt-2 pt-2 border-t border-zinc-700 text-xs font-mono ${isGreen ? 'text-green-500' : 'text-red-500'}`}>
        {isGreen ? '+' : ''}{changePercent}%
      </div>
      {data.fast_ema && (
        <div className="mt-2 pt-2 border-t border-zinc-700 text-xs font-mono space-y-1">
          <div className="flex justify-between">
            <span className="text-amber-500">Fast EMA</span>
            <span className="text-white">{formatPrice(data.fast_ema)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-purple-500">Mid EMA</span>
            <span className="text-white">{formatPrice(data.mid_ema)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-pink-500">Slow EMA</span>
            <span className="text-white">{formatPrice(data.slow_ema)}</span>
          </div>
        </div>
      )}
    </div>
  );
};

const CandlestickChart = ({ data, height = 400 }) => {
  const chartData = useMemo(() => {
    if (!data || !data.length) return [];
    return data.map((candle, index) => ({
      ...candle,
      index,
      candleValue: Math.max(candle.high, candle.open, candle.close),
    }));
  }, [data]);

  const domain = useMemo(() => {
    if (!chartData.length) return [0, 100];
    const prices = chartData.flatMap(c => [c.high, c.low]);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const padding = (max - min) * 0.05;
    return [min - padding, max + padding];
  }, [chartData]);

  if (!chartData.length) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-500">
        No data available
      </div>
    );
  }

  return (
    <div className="relative" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={chartData}
          margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
        >
          <XAxis
            dataKey="time"
            axisLine={{ stroke: '#27272A' }}
            tickLine={{ stroke: '#27272A' }}
            tick={{ fill: '#71717A', fontSize: 10, fontFamily: 'JetBrains Mono' }}
            interval="preserveStartEnd"
            tickFormatter={(value) => value?.split('-').slice(1).join('/')}
          />
          <YAxis
            domain={domain}
            axisLine={{ stroke: '#27272A' }}
            tickLine={{ stroke: '#27272A' }}
            tick={{ fill: '#71717A', fontSize: 10, fontFamily: 'JetBrains Mono' }}
            tickFormatter={(value) => value?.toFixed(0)}
            orientation="right"
          />
          <Tooltip content={<CustomTooltip />} />
          
          {/* Candlesticks rendered as bars */}
          <Bar
            dataKey="candleValue"
            shape={<CandlestickShape />}
            isAnimationActive={false}
          />
          
          {/* EMA Lines */}
          <Line
            type="monotone"
            dataKey="fast_ema"
            stroke="#F59E0B"
            dot={false}
            strokeWidth={1.5}
            connectNulls
            name="Fast EMA"
          />
          <Line
            type="monotone"
            dataKey="mid_ema"
            stroke="#8B5CF6"
            dot={false}
            strokeWidth={1.5}
            connectNulls
            name="Mid EMA"
          />
          <Line
            type="monotone"
            dataKey="slow_ema"
            stroke="#EC4899"
            dot={false}
            strokeWidth={2}
            connectNulls
            name="Slow EMA"
          />
        </ComposedChart>
      </ResponsiveContainer>
      
      {/* Legend */}
      <div className="absolute top-2 left-2 flex items-center gap-4 text-xs font-mono">
        <div className="flex items-center gap-1">
          <div className="w-3 h-0.5 bg-amber-500"></div>
          <span className="text-amber-500">Fast</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-0.5 bg-purple-500"></div>
          <span className="text-purple-500">Mid</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-0.5 bg-pink-500"></div>
          <span className="text-pink-500">Slow</span>
        </div>
      </div>
    </div>
  );
};

export default CandlestickChart;
