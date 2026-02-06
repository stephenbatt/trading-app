import React, { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from 'recharts';

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload || !payload[0]) return null;

  const data = payload[0].payload;
  const histogram = data.macd_histogram;
  const isPositive = histogram >= 0;

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 shadow-xl">
      <p className="text-xs text-zinc-400 mb-1 font-mono">{data.time}</p>
      <div className="flex items-baseline gap-2">
        <span className={`font-mono font-bold text-lg ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
          {histogram?.toFixed(4) || '-'}
        </span>
        <span className="text-xs text-zinc-500">Histogram</span>
      </div>
    </div>
  );
};

const MACDChart = ({ data, height = 120 }) => {
  const chartData = useMemo(() => {
    if (!data || !data.length) return [];
    return data.filter(d => d.macd_histogram !== null);
  }, [data]);

  const domain = useMemo(() => {
    if (!chartData.length) return [-1, 1];
    const values = chartData.map(d => Math.abs(d.macd_histogram || 0));
    const max = Math.max(...values);
    return [-max * 1.2, max * 1.2];
  }, [chartData]);

  if (!chartData.length) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-500 text-sm">
        No MACD data
      </div>
    );
  }

  return (
    <div className="relative indicator-panel macd-panel" style={{ height }}>
      {/* Grid background */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(rgba(139, 92, 246, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(139, 92, 246, 0.03) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
        }}
      />
      
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
        >
          <XAxis
            dataKey="time"
            axisLine={{ stroke: '#27272A' }}
            tickLine={false}
            tick={false}
          />
          <YAxis
            domain={domain}
            axisLine={{ stroke: '#27272A' }}
            tickLine={{ stroke: '#27272A' }}
            tick={{ fill: '#71717A', fontSize: 10, fontFamily: 'JetBrains Mono' }}
            orientation="right"
            width={50}
            tickFormatter={(value) => value.toFixed(2)}
          />
          <Tooltip content={<CustomTooltip />} />
          
          {/* Zero line */}
          <ReferenceLine
            y={0}
            stroke="#52525B"
            strokeWidth={1}
          />
          
          {/* Histogram bars */}
          <Bar dataKey="macd_histogram" radius={[2, 2, 0, 0]}>
            {chartData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.macd_histogram >= 0 ? '#22C55E' : '#EF4444'}
                fillOpacity={0.8}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      
      {/* Label */}
      <div className="absolute top-2 left-2 text-xs font-mono text-purple-400 flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-purple-500"></div>
        MACD Histogram (12, 26, 9)
      </div>
    </div>
  );
};

export default MACDChart;
