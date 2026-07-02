import React, { useMemo, useRef, useEffect, useState } from 'react';
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

// ============================================================
// CANDLESTICK SHAPE
// Uses actual rendered chart dimensions via containerHeight prop
// This is the fix: no more hardcoded height arithmetic
// ============================================================

const Candlestick = (props) => {
  const { x, width, payload, yAxisScale } = props;
  if (!payload || !yAxisScale) return null;

  const { open, close, high, low } = payload;
  if (open == null || close == null || high == null || low == null) return null;

  const isUp    = close >= open;
  const upColor = '#26A69A';
  const downColor = '#EF5350';
  const color   = isUp ? upColor : downColor;

  // Y positions from the real scale function
  const openY  = yAxisScale(open);
  const closeY = yAxisScale(close);
  const highY  = yAxisScale(high);
  const lowY   = yAxisScale(low);

  if (isNaN(openY) || isNaN(closeY) || isNaN(highY) || isNaN(lowY)) return null;

  // Body — minimum 1px so doji candles are still visible
  const bodyWidth  = Math.max(width * 0.6, 2);
  const bodyX      = x + (width - bodyWidth) / 2;
  const bodyTop    = Math.min(openY, closeY);
  const bodyHeight = Math.max(Math.abs(closeY - openY), 1);

  // Wick — centered
  const wickX = x + width / 2;

  return (
    <g>
      {/* Upper wick */}
      <line x1={wickX} x2={wickX} y1={highY} y2={bodyTop}
            stroke={color} strokeWidth={1} />
      {/* Lower wick */}
      <line x1={wickX} x2={wickX} y1={bodyTop + bodyHeight} y2={lowY}
            stroke={color} strokeWidth={1} />
      {/* Body */}
      <rect x={bodyX} y={bodyTop} width={bodyWidth} height={bodyHeight}
            fill={color} stroke={color} strokeWidth={0} />
    </g>
  );
};

// ============================================================
// TOOLTIP
// ============================================================

const ProfessionalTooltip = ({ active, payload }) => {
  if (!active || !payload || !payload[0]) return null;
  const data      = payload[0].payload;
  const isUp      = data.close >= data.open;
  const changePct = ((data.close - data.open) / data.open * 100).toFixed(2);

  return (
    <div className="bg-[#1E222D] border border-[#2A2E39] rounded-lg p-3 shadow-2xl min-w-[180px]">
      <div className="text-[#787B86] text-xs mb-2 font-medium">{data.displayTime || data.time}</div>

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

      <div className={`mt-2 pt-2 border-t border-[#2A2E39] text-sm font-mono ${isUp ? 'text-[#26A69A]' : 'text-[#EF5350]'}`}>
        {isUp ? '▲' : '▼'} {changePct}%
      </div>

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

      {data.volume && (
        <div className="mt-2 pt-2 border-t border-[#2A2E39] flex justify-between text-xs">
          <span className="text-[#787B86]">Volume</span>
          <span className="text-white font-mono">{(data.volume / 1_000_000).toFixed(2)}M</span>
        </div>
      )}
    </div>
  );
};

// ============================================================
// TICK FORMATTER — adapts to timeframe automatically
// ============================================================

const makeTickFormatter = (interval) => (value) => {
  if (!value) return '';

  // Unix timestamp (number)
  if (typeof value === 'number') {
    const d = new Date(value * 1000);
    if (interval === '1day' || interval === 'daily') {
      return `${d.getMonth() + 1}/${d.getDate()}`;
    }
    const hh = d.getHours().toString().padStart(2, '0');
    const mm = d.getMinutes().toString().padStart(2, '0');
    return `${hh}:${mm}`;
  }

  // ISO string (YYYY-MM-DD)
  if (typeof value === 'string') {
    const d = new Date(value);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }

  return String(value);
};

// ============================================================
// MAIN CHART
// ============================================================

const CandlestickChart = ({ data, height = 450, interval = '1day' }) => {

  // Track actual rendered container height so the scale is always accurate
  const containerRef = useRef(null);
  const [chartHeight, setChartHeight] = useState(height);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setChartHeight(entry.contentRect.height);
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // ---- Margins must match exactly what Recharts uses internally ----
  const MARGIN = { top: 20, right: 60, left: 10, bottom: 20 };

  const chartData = useMemo(() => {
    if (!data || !data.length) return [];
    return data.map((candle, index) => ({
      ...candle,
      index,
      // displayTime for tooltip
      displayTime: typeof candle.time === 'number'
        ? new Date(candle.time * 1000).toLocaleString()
        : candle.time,
      // Bar needs a positive value to render; we use the full high
      candleRange: candle.high,
    }));
  }, [data]);

  // Price domain — recalculates fresh on every new dataset
  const domain = useMemo(() => {
    if (!chartData.length) return [0, 100];
    const prices = chartData.flatMap(c =>
      [c.high, c.low, c.fast_ema, c.mid_ema, c.slow_ema].filter(v => v != null)
    );
    const minP    = Math.min(...prices);
    const maxP    = Math.max(...prices);
    const padding = (maxP - minP) * 0.08;
    return [minP - padding, maxP + padding];
  }, [chartData]);

  // Scale function — uses MEASURED container height, not the prop
  // This is what eliminates the giant-candle bug on timeframe switch
  const yAxisScale = useMemo(() => {
    const [minD, maxD] = domain;
    const plotHeight   = chartHeight - MARGIN.top - MARGIN.bottom;
    return (value) => MARGIN.top + ((maxD - value) / (maxD - minD)) * plotHeight;
  }, [domain, chartHeight]);

  if (!chartData.length) {
    return (
      <div className="h-full flex items-center justify-center text-[#787B86] bg-[#131722]">
        Loading chart data...
      </div>
    );
  }

  const currentPrice = chartData[chartData.length - 1]?.close;

  return (
    <div
      ref={containerRef}
      className="relative bg-[#131722] rounded-lg overflow-hidden"
      style={{ height }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={MARGIN}>

          {/* Subtle grid */}
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none"
                    stroke="rgba(42,46,57,0.5)" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />

          <XAxis
            dataKey="time"
            axisLine={{ stroke: '#2A2E39' }}
            tickLine={{ stroke: '#2A2E39' }}
            tick={{ fill: '#787B86', fontSize: 10 }}
            interval="preserveStartEnd"
            tickFormatter={makeTickFormatter(interval)}
          />

          <YAxis
            domain={domain}
            axisLine={{ stroke: '#2A2E39' }}
            tickLine={{ stroke: '#2A2E39' }}
            tick={{ fill: '#787B86', fontSize: 10 }}
            tickFormatter={(v) => `$${v?.toFixed(0)}`}
            orientation="right"
            width={55}
          />

          <Tooltip content={<ProfessionalTooltip />} />

          {/* Current price line */}
          {currentPrice && (
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
              }}
            />
          )}

          {/* Candlestick bars — pass yAxisScale so each candle knows where to draw */}
          <Bar
            dataKey="candleRange"
            shape={(props) => <Candlestick {...props} yAxisScale={yAxisScale} />}
            isAnimationActive={false}
          />

          {/* EMA lines */}
          <Line type="monotone" dataKey="fast_ema"
                stroke="#F7931A" dot={false} strokeWidth={2}
                connectNulls isAnimationActive={false} />
          <Line type="monotone" dataKey="mid_ema"
                stroke="#9B59B6" dot={false} strokeWidth={2}
                strokeDasharray="6 3" connectNulls isAnimationActive={false} />
          <Line type="monotone" dataKey="slow_ema"
                stroke="#E91E8C" dot={false} strokeWidth={2}
                strokeDasharray="6 3" connectNulls isAnimationActive={false} />

        </ComposedChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="absolute top-3 left-3 flex items-center gap-4 text-xs z-10
                      bg-[#131722]/95 px-4 py-2 rounded border border-[#2A2E39]">
        <div className="flex items-center gap-2">
          <div className="w-5 h-0.5 bg-[#F7931A]" />
          <span className="text-[#F7931A] font-medium">Fast EMA</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-5 h-0.5 border-t-2 border-dashed border-[#9B59B6]" />
          <span className="text-[#9B59B6] font-medium">Mid EMA</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-5 h-0.5 border-t-2 border-dashed border-[#E91E8C]" />
          <span className="text-[#E91E8C] font-medium">Slow EMA</span>
        </div>
      </div>
    </div>
  );
};

export default CandlestickChart;
