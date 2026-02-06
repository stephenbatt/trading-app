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
  Cell,
} from 'recharts';

// Professional candlestick bar shape
const Candlestick = (props) => {
  const { x, y, width, height, payload, yAxisScale } = props;
  if (!payload || !yAxisScale) return null;

  const { open, close, high, low } = payload;
  const isUp = close >= open;
  
  // Colors - ThinkorSwim style
  const upColor = '#26A69A';
  const downColor = '#EF5350';
  const color = isUp ? upColor : downColor;
  
  // Calculate positions using the Y-axis scale
  const openY = yAxisScale(open);
  const closeY = yAxisScale(close);
  const highY = yAxisScale(high);
  const lowY = yAxisScale(low);
  
  // Body dimensions - THICK bodies
  const bodyWidth = Math.max(width * 0.85, 6);
  const bodyX = x + (width - bodyWidth) / 2;
  const bodyTop = Math.min(openY, closeY);
  const bodyHeight = Math.max(Math.abs(closeY - openY), 1);
  
  // Wick position - THIN wicks
  const wickX = x + width / 2;

  return (
    <g>
      {/* Upper wick - thin */}
      <line
        x1={wickX}
        x2={wickX}
        y1={highY}
        y2={bodyTop}
        stroke={color}
        strokeWidth={1}
      />
      {/* Lower wick - thin */}
      <line
        x1={wickX}
        x2={wickX}
        y1={bodyTop + bodyHeight}
        y2={lowY}
        stroke={color}
        strokeWidth={1}
      />
      {/* Body - thick, filled */}
      <rect
        x={bodyX}
        y={bodyTop}
        width={bodyWidth}
        height={bodyHeight}
        fill={color}
        stroke={color}
        strokeWidth={1}
      />
    </g>
  );
};

// Custom tooltip - Professional dark style
const ProfessionalTooltip = ({ active, payload }) => {
  if (!active || !payload || !payload[0]) return null;

  const data = payload[0].payload;
  const isUp = data.close >= data.open;
  const changePercent = ((data.close - data.open) / data.open * 100).toFixed(2);

  return (
    <div className="bg-[#1E222D] border border-[#2A2E39] rounded-lg p-3 shadow-2xl min-w-[180px]">
      <div className="text-[#787B86] text-xs mb-2 font-medium">{data.time}</div>
      
      {/* OHLC Grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <span className="text-[#787B86]">Open</span>
        <span className="text-white font-mono text-right">${data.open?.toFixed(2)}</span>
        <span className="text-[#787B86]">High</span>
        <span className="text-[#26A69A] font-mono text-right">${data.high?.toFixed(2)}</span>
        <span className="text-[#787B86]">Low</span>
        <span className="text-[#EF5350] font-mono text-right">${data.low?.toFixed(2)}</span>
        <span className="text-[#787B86]">Close</span>
        <span className={`font-mono text-right ${isUp ? 'text-[#26A69A]' : 'text-[#EF5350]'}`}>
          ${data.close?.toFixed(2)}
        </span>
      </div>
      
      {/* Change */}
      <div className={`mt-2 pt-2 border-t border-[#2A2E39] text-sm font-mono ${isUp ? 'text-[#26A69A]' : 'text-[#EF5350]'}`}>
        {isUp ? '▲' : '▼'} {changePercent}%
      </div>
      
      {/* EMA Values */}
      {(data.fast_ema || data.mid_ema || data.slow_ema) && (
        <div className="mt-2 pt-2 border-t border-[#2A2E39] space-y-1 text-xs">
          {data.fast_ema && (
            <div className="flex justify-between">
              <span className="text-[#F7931A]">Fast EMA</span>
              <span className="text-white font-mono">${data.fast_ema?.toFixed(2)}</span>
            </div>
          )}
          {data.mid_ema && (
            <div className="flex justify-between">
              <span className="text-[#9B59B6]">Mid EMA</span>
              <span className="text-white font-mono">${data.mid_ema?.toFixed(2)}</span>
            </div>
          )}
          {data.slow_ema && (
            <div className="flex justify-between">
              <span className="text-[#E91E8C]">Slow EMA</span>
              <span className="text-white font-mono">${data.slow_ema?.toFixed(2)}</span>
            </div>
          )}
        </div>
      )}
      
      {/* Volume */}
      {data.volume && (
        <div className="mt-2 pt-2 border-t border-[#2A2E39] flex justify-between text-xs">
          <span className="text-[#787B86]">Volume</span>
          <span className="text-white font-mono">{(data.volume / 1000000).toFixed(2)}M</span>
        </div>
      )}
    </div>
  );
};

const CandlestickChart = ({ data, height = 450 }) => {
  const chartData = useMemo(() => {
    if (!data || !data.length) return [];
    return data.map((candle, index) => ({
      ...candle,
      index,
      // For bar rendering
      candleRange: Math.max(candle.high, candle.open, candle.close),
    }));
  }, [data]);

  const { domain, yAxisScale } = useMemo(() => {
    if (!chartData.length) return { domain: [0, 100], yAxisScale: null };
    
    const allPrices = chartData.flatMap(c => [c.high, c.low, c.fast_ema, c.mid_ema, c.slow_ema].filter(Boolean));
    const minPrice = Math.min(...allPrices);
    const maxPrice = Math.max(...allPrices);
    const padding = (maxPrice - minPrice) * 0.08;
    const domain = [minPrice - padding, maxPrice + padding];
    
    // Create scale function for candlesticks
    const yAxisScale = (value) => {
      const [min, max] = domain;
      const chartHeight = height - 40; // Account for margins
      return ((max - value) / (max - min)) * chartHeight + 20;
    };
    
    return { domain, yAxisScale };
  }, [chartData, height]);

  if (!chartData.length) {
    return (
      <div className="h-full flex items-center justify-center text-[#787B86] bg-[#131722]">
        Loading chart data...
      </div>
    );
  }

  // Current price for price line
  const currentPrice = chartData[chartData.length - 1]?.close;

  return (
    <div className="relative bg-[#131722] rounded-lg overflow-hidden" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={chartData}
          margin={{ top: 20, right: 60, left: 10, bottom: 20 }}
        >
          {/* Grid */}
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(42, 46, 57, 0.5)" strokeWidth="0.5"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
          
          <XAxis
            dataKey="time"
            axisLine={{ stroke: '#2A2E39' }}
            tickLine={{ stroke: '#2A2E39' }}
            tick={{ fill: '#787B86', fontSize: 10, fontFamily: 'Inter, sans-serif' }}
            interval="preserveStartEnd"
            tickFormatter={(value) => {
              const parts = value?.split('-');
              return parts ? `${parts[1]}/${parts[2]}` : '';
            }}
          />
          <YAxis
            domain={domain}
            axisLine={{ stroke: '#2A2E39' }}
            tickLine={{ stroke: '#2A2E39' }}
            tick={{ fill: '#787B86', fontSize: 10, fontFamily: 'Inter, sans-serif' }}
            tickFormatter={(value) => `$${value?.toFixed(0)}`}
            orientation="right"
            width={55}
          />
          
          <Tooltip content={<ProfessionalTooltip />} />
          
          {/* Current price line */}
          <ReferenceLine
            y={currentPrice}
            stroke="#2962FF"
            strokeWidth={1}
            strokeDasharray="4 2"
            label={{
              value: `$${currentPrice?.toFixed(2)}`,
              position: 'right',
              fill: '#2962FF',
              fontSize: 10,
              fontFamily: 'JetBrains Mono',
            }}
          />
          
          {/* Candlesticks */}
          <Bar
            dataKey="candleRange"
            shape={(props) => <Candlestick {...props} yAxisScale={yAxisScale} />}
            isAnimationActive={false}
          />
          
          {/* EMA Lines - Professional colors */}
          <Line
            type="monotone"
            dataKey="fast_ema"
            stroke="#F7931A"
            dot={false}
            strokeWidth={2}
            connectNulls
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="mid_ema"
            stroke="#9B59B6"
            dot={false}
            strokeWidth={2}
            strokeDasharray="6 3"
            connectNulls
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="slow_ema"
            stroke="#E91E8C"
            dot={false}
            strokeWidth={2}
            strokeDasharray="6 3"
            connectNulls
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
      
      {/* EMA Legend - Professional style */}
      <div className="absolute top-3 left-3 flex items-center gap-4 text-xs z-10 bg-[#131722]/95 px-4 py-2 rounded border border-[#2A2E39]">
        <div className="flex items-center gap-2">
          <div className="w-5 h-0.5 bg-[#F7931A]"></div>
          <span className="text-[#F7931A] font-medium">Fast EMA</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-5 h-0.5 border-t-2 border-dashed border-[#9B59B6]"></div>
          <span className="text-[#9B59B6] font-medium">Mid EMA</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-5 h-0.5 border-t-2 border-dashed border-[#E91E8C]"></div>
          <span className="text-[#E91E8C] font-medium">Slow EMA</span>
        </div>
      </div>
    </div>
  );
};

export default CandlestickChart;
