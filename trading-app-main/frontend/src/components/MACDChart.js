import React, { useMemo } from 'react';
import {
  ComposedChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';

// ============================================================
// MACD Histogram Chart
// 3-color bars based on magnitude:
//   green     = strong positive
//   red       = strong negative
//   turquoise = weak / near zero (either side)
// No MACD line or signal line - histogram bars only.
// ============================================================

const GREEN = '#26A69A';
const RED = '#EF5350';
const TURQUOISE = '#2DD4BF';

const getBarColor = (value, threshold) => {
  if (value == null) return TURQUOISE;
  if (Math.abs(value) < threshold) return TURQUOISE;
  return value >= 0 ? GREEN : RED;
};

const MACDTooltip = ({ active, payload, threshold }) => {
  if (!active || !payload || !payload[0]) return null;
  const data = payload[0].payload;
  const hist = data.macd_histogram;
  const color = getBarColor(hist, threshold);

  return (
    <div className="bg-[#1E222D] border border-[#2A2E39] rounded-lg p-3 shadow-2xl min-w-[140px]">
      <div className="text-[#787B86] text-xs mb-2">
        {data.displayTime || data.time}
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-[#787B86]">MACD Hist</span>
        <span className="font-mono" style={{ color }}>
          {hist != null ? hist.toFixed(4) : '-'}
        </span>
      </div>
    </div>
  );
};

const MACDChart = ({ data, height = 120 }) => {
  const chartData = useMemo(() => {
    if (!data || !data.length) return [];
    return data.map((candle, index) => ({
      ...candle,
      index,
      displayTime: typeof candle.time === 'number'
        ? new Date(candle.time * 1000).toLocaleString()
        : candle.time,
    }));
  }, [data]);

  // Dynamic threshold: values within 15% of the max absolute
  // histogram value in this dataset count as "weak" (turquoise)
  const threshold = useMemo(() => {
    if (!chartData.length) return 0.1;
    const absValues = chartData
      .map(c => Math.abs(c.macd_histogram))
      .filter(v => !isNaN(v) && v != null);
    if (!absValues.length) return 0.1;
    const maxAbs = Math.max(...absValues);
    return maxAbs * 0.15;
  }, [chartData]);

  if (!chartData.length) {
    return (
      <div className="h-full flex items-center justify-center text-[#787B86] bg-[#131722]"
           style={{ height }}>
        Loading MACD...
      </div>
    );
  }

  return (
    <div className="relative bg-[#131722] rounded-lg overflow-hidden" style={{ height }}>
      <div className="absolute top-2 left-3 z-10 text-xs text-[#787B86] font-medium">
        MACD Histogram (12, 26, 9)
      </div>

      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={chartData}
          margin={{ top: 24, right: 60, left: 10, bottom: 10 }}
        >
          <XAxis dataKey="time" hide />
          <YAxis
            axisLine={{ stroke: '#2A2E39' }}
            tickLine={{ stroke: '#2A2E39' }}
            tick={{ fill: '#787B86', fontSize: 10 }}
            orientation="right"
            width={55}
            tickFormatter={(v) => v?.toFixed(2)}
          />

          <Tooltip content={(props) => <MACDTooltip {...props} threshold={threshold} />} />

          <ReferenceLine y={0} stroke="#2A2E39" strokeWidth={1} />

          <Bar dataKey="macd_histogram" isAnimationActive={false}>
            {chartData.map((entry, i) => (
              <Cell
                key={`cell-${i}`}
                fill={getBarColor(entry.macd_histogram, threshold)}
              />
            ))}
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

export default MACDChart;
