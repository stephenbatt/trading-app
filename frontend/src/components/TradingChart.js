import React, { useEffect, useRef } from 'react';
import { createChart, ColorType, CrosshairMode } from 'lightweight-charts';

const TradingChart = ({ data, emaSettings, height = 400 }) => {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!chartContainerRef.current || !data || data.length === 0) return;

    // Clear any existing chart
    if (chartRef.current) {
      chartRef.current.remove();
    }

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: height,
      layout: {
        background: { type: ColorType.Solid, color: '#0a0a0b' },
        textColor: '#71717A',
        fontFamily: "'JetBrains Mono', monospace",
      },
      grid: {
        vertLines: { color: '#1f1f23' },
        horzLines: { color: '#1f1f23' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: '#3B82F6',
          width: 1,
          style: 2,
          labelBackgroundColor: '#3B82F6',
        },
        horzLine: {
          color: '#3B82F6',
          width: 1,
          style: 2,
          labelBackgroundColor: '#3B82F6',
        },
      },
      rightPriceScale: {
        borderColor: '#27272A',
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: '#27272A',
        timeVisible: true,
      },
    });

    chartRef.current = chart;

    // Create candlestick series
    const candleSeries = chart.addCandlestickSeries({
      upColor: '#22C55E',
      downColor: '#EF4444',
      borderUpColor: '#22C55E',
      borderDownColor: '#EF4444',
      wickUpColor: '#22C55E',
      wickDownColor: '#EF4444',
    });

    // Create EMA line series
    const fastEmaSeries = chart.addLineSeries({
      color: '#F59E0B',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
    });

    const midEmaSeries = chart.addLineSeries({
      color: '#8B5CF6',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
    });

    const slowEmaSeries = chart.addLineSeries({
      color: '#EC4899',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
    });

    // Convert data to chart format
    const candleData = data.map(candle => ({
      time: candle.time,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    }));

    const fastEmaData = data
      .filter(c => c.fast_ema !== null && c.fast_ema !== undefined)
      .map(c => ({
        time: c.time,
        value: c.fast_ema,
      }));

    const midEmaData = data
      .filter(c => c.mid_ema !== null && c.mid_ema !== undefined)
      .map(c => ({
        time: c.time,
        value: c.mid_ema,
      }));

    const slowEmaData = data
      .filter(c => c.slow_ema !== null && c.slow_ema !== undefined)
      .map(c => ({
        time: c.time,
        value: c.slow_ema,
      }));

    // Set data
    candleSeries.setData(candleData);
    if (fastEmaData.length > 0) fastEmaSeries.setData(fastEmaData);
    if (midEmaData.length > 0) midEmaSeries.setData(midEmaData);
    if (slowEmaData.length > 0) slowEmaSeries.setData(slowEmaData);

    // Fit content
    chart.timeScale().fitContent();

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [data, height]);

  return (
    <div className="relative">
      <div ref={chartContainerRef} style={{ height }} />
      
      {/* Legend */}
      <div className="absolute top-2 left-2 flex items-center gap-4 text-xs font-mono z-10 bg-black/70 px-3 py-1.5 rounded">
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-0.5 bg-amber-500"></div>
          <span className="text-amber-500">Fast ({emaSettings?.fast_ema || 20})</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-0.5 bg-purple-500"></div>
          <span className="text-purple-500">Mid ({emaSettings?.mid_ema || 50})</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-0.5 bg-pink-500"></div>
          <span className="text-pink-500">Slow ({emaSettings?.slow_ema || 200})</span>
        </div>
      </div>
    </div>
  );
};

export default TradingChart;
