import React, { useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload || !payload[0]) return null;

  const data = payload[0].payload;
  const cci = data.cci;
  
  let status = 'Neutral';
  let statusColor = 'text-zinc-400';
  
  if (cci > 100) {
    status = 'Overbought';
    statusColor = 'text-red-400';
  } else if (cci < -100) {
    status = 'Oversold';
    statusColor = 'text-green-400';
  } else if (cci > 0) {
    status = 'Bullish';
    statusColor = 'text-green-400';
  } else {
    status = 'Bearish';
    statusColor = 'text-red-400';
  }

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 shadow-xl">
      <p className="text-xs text-zinc-400 mb-1 font-mono">{data.time}</p>
      <div className="flex items-baseline gap-2">
        <span className="text-cyan-400 font-mono font-bold text-lg">
          {cci?.toFixed(1) || '-'}
        </span>
        <span className={`text-xs ${statusColor}`}>{status}</span>
      </div>
    </div>
  );
};

const CCIChart = ({ data, height = 150 }) => {
  const chartData = useMemo(() => {
    if (!data || !data.length) return [];
    return data.filter(d => d.cci !== null);
  }, [data]);

  if (!chartData.length) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-500 text-sm">
        No CCI data
      </div>
    );
  }

  return (
    <div className="relative indicator-panel cci-panel" style={{ height }}>
      {/* Grid background */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(rgba(6, 182, 212, 0.05) 1px, transparent 1px),
            linear-gradient(90deg, rgba(6, 182, 212, 0.05) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
        }}
      />
      
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={chartData}
          margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="cciGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#06B6D4" stopOpacity={0.3} />
              <stop offset="50%" stopColor="#06B6D4" stopOpacity={0.05} />
              <stop offset="100%" stopColor="#06B6D4" stopOpacity={0.3} />
            </linearGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>
          
          <XAxis
            dataKey="time"
            axisLine={{ stroke: '#27272A' }}
            tickLine={false}
            tick={false}
          />
          <YAxis
            domain={[-200, 200]}
            axisLine={{ stroke: '#27272A' }}
            tickLine={{ stroke: '#27272A' }}
            tick={{ fill: '#71717A', fontSize: 10, fontFamily: 'JetBrains Mono' }}
            ticks={[-100, 0, 100]}
            orientation="right"
            width={40}
          />
          <Tooltip content={<CustomTooltip />} />
          
          {/* Reference lines */}
          <ReferenceLine
            y={100}
            stroke="#EF4444"
            strokeDasharray="3 3"
            strokeOpacity={0.5}
          />
          <ReferenceLine
            y={0}
            stroke="#52525B"
            strokeWidth={1}
          />
          <ReferenceLine
            y={-100}
            stroke="#22C55E"
            strokeDasharray="3 3"
            strokeOpacity={0.5}
          />
          
          {/* CCI Area and Line */}
          <Area
            type="monotone"
            dataKey="cci"
            stroke="#06B6D4"
            strokeWidth={2}
            fill="url(#cciGradient)"
            filter="url(#glow)"
            className="cci-line"
            dot={false}
            activeDot={{ r: 4, fill: '#06B6D4', stroke: '#0E7490' }}
          />
        </AreaChart>
      </ResponsiveContainer>
      
      {/* Label */}
      <div className="absolute top-2 left-2 text-xs font-mono text-cyan-500 flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse"></div>
        CCI (20)
      </div>
      
      {/* Level labels */}
      <div className="absolute right-12 top-2 text-xs font-mono text-red-500/70">+100</div>
      <div className="absolute right-12 bottom-2 text-xs font-mono text-green-500/70">-100</div>
    </div>
  );
};

export default CCIChart;
