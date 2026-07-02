import React, { useMemo } from 'react';
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';

// ============================================================
// CCI Chart
// Thin line that changes color by zone:
//   green     = oversold  (<= -100)
//   turquoise = neutral   (-100 to 100)
//   red       = overbought (>= 100)
// Implemented via 3 separate Line series, each holding the
// value only when in its zone (null elsewhere), so the
// rendered line visually shifts color as it crosses zones.
// ============================================================

const OVERSOLD = -100;
const OVERBOUGHT = 100;

const GREEN = '#26A69A';
const RED = '#EF5350';
const TURQUOISE = '#2DD4BF';

const CCITooltip = ({ active, payload }) => {
  if (!active || !payload || !payload[0]) return null;
  const data = payload[0].payload;
  const cci = data.cci;

  let zoneColor = TURQUOISE;
  let zoneLabel = 'Neutral';
  if (cci >= OVERBOUGHT) { zoneColor = RED; zoneLabel = 'Overbought'; }
  else if (cci <= OVERSOLD) { zoneColor = GREEN; zoneLabel = 'Oversold'; }

  return (
    <div className="bg-[#1E222D] border border-[#2A2E39] rounded-lg p-3 shadow-2xl min-w-[140px]">
      <div className="text-[#787B86] text-xs mb-2">
        {data.displayTime || data.time}
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-[#787B86]">CCI (20)</span>
        <span className="font-mono" style={{ color: zoneColor }}>
          {cci != null ? cci.toFixed(1) : '-'}
        </span>
      </div>
      <div className="text-xs mt-1" style={{ color: zoneColor }}>
        {zoneLabel}
      </div>
    </div>
  );
};

const CCIChart = ({ data, height = 150 }) => {
  const chartData = useMemo(() => {
    if (!data || !data.length) return [];
    return data.map((candle, index) => {
      const cci = candle.cci;
      return {
        ...candle,
        index,
        displayTime: typeof candle.time === 'number'
          ? new Date(candle.time * 1000).toLocaleString()
          : candle.time,
        // Segment the value into 3 zone-specific fields
        cciOversold: cci != null && cci <= OVERSOLD ? cci : null,
        cciNeutral: cci != null && cci > OVERSOLD && cci < OVERBOUGHT ? cci : null,
        cciOverbought: cci != null && cci >= OVERBOUGHT ? cci : null,
      };
    });
  }, [data]);

  if (!chartData.length) {
    return (
      <div className="h-full flex items-center justify-center text-[#787B86] bg-[#131722]"
           style={{ height }}>
        Loading CCI...
      </div>
    );
  }

  return (
    <div className="relative bg-[#131722] rounded-lg overflow-hidden" style={{ height }}>
      <div className="absolute top-2 left-3 z-10 text-xs text-[#787B86] font-medium">
        CCI (20)
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
            domain={[-200, 200]}
            ticks={[-100, 0, 100]}
          />

          <Tooltip content={<CCITooltip />} />

          {/* Zone reference lines */}
          <ReferenceLine y={OVERBOUGHT} stroke="#EF5350" strokeDasharray="3 3" strokeWidth={1} />
          <ReferenceLine y={0} stroke="#2A2E39" strokeWidth={1} />
          <ReferenceLine y={OVERSOLD} stroke="#26A69A" strokeDasharray="3 3" strokeWidth={1} />

          {/* Thin, zone-colored line segments */}
          <Line
            type="monotone"
            dataKey="cciOverbought"
            stroke={RED}
            strokeWidth={1.5}
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="cciNeutral"
            stroke={TURQUOISE}
            strokeWidth={1.5}
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="cciOversold"
            stroke={GREEN}
            strokeWidth={1.5}
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

export default CCIChart;
