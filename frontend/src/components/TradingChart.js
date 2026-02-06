import React, { useEffect, useRef, useCallback } from 'react';
import { createChart, ColorType, CrosshairMode } from 'lightweight-charts';

const TradingChart = ({ data, emaSettings, height = 400 }) => {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const fastEmaSeriesRef = useRef(null);
  const midEmaSeriesRef = useRef(null);
  const slowEmaSeriesRef = useRef(null);

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#0a0a0b' },
        textColor: '#71717A',
        fontFamily: "'JetBrains Mono', monospace",
      },
      grid: {
        vertLines: { color: '#1f1f23', style: 1 },
        horzLines: { color: '#1f1f23', style: 1 },
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
        secondsVisible: false,
        tickMarkFormatter: (time) => {
          const date = new Date(time * 1000);
          return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        },
      },
      handleScroll: { vertTouchDrag: true },
      handleScale: { axisPressedMouseMove: true },
    });

    // Candlestick series
    const candleSeries = chart.addCandlestickSeries({
      upColor: '#22C55E',
      downColor: '#EF4444',
      borderUpColor: '#22C55E',
      borderDownColor: '#EF4444',
      wickUpColor: '#22C55E',
      wickDownColor: '#EF4444',
    });

    // EMA lines
    const fastEmaSeries = chart.addLineSeries({
      color: '#F59E0B',
      lineWidth: 2,
      title: 'Fast EMA',
      priceLineVisible: false,
      lastValueVisible: true,
    });

    const midEmaSeries = chart.addLineSeries({
      color: '#8B5CF6',
      lineWidth: 2,
      title: 'Mid EMA',
      priceLineVisible: false,
      lastValueVisible: true,
    });

    const slowEmaSeries = chart.addLineSeries({
      color: '#EC4899',
      lineWidth: 2,
      title: 'Slow EMA',
      priceLineVisible: false,
      lastValueVisible: true,
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    fastEmaSeriesRef.current = fastEmaSeries;
    midEmaSeriesRef.current = midEmaSeries;
    slowEmaSeriesRef.current = slowEmaSeries;

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []);

  // Update data when it changes
  useEffect(() => {
    if (!data || !data.length || !candleSeriesRef.current) return;

    // Convert data to chart format
    const candleData = data.map(candle => ({
      time: new Date(candle.time).getTime() / 1000,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    }));

    const fastEmaData = data
      .filter(c => c.fast_ema !== null)
      .map(c => ({
        time: new Date(c.time).getTime() / 1000,
        value: c.fast_ema,
      }));

    const midEmaData = data
      .filter(c => c.mid_ema !== null)
      .map(c => ({
        time: new Date(c.time).getTime() / 1000,
        value: c.mid_ema,
      }));

    const slowEmaData = data
      .filter(c => c.slow_ema !== null)
      .map(c => ({
        time: new Date(c.time).getTime() / 1000,
        value: c.slow_ema,
      }));

    // Set data
    candleSeriesRef.current.setData(candleData);
    fastEmaSeriesRef.current.setData(fastEmaData);
    midEmaSeriesRef.current.setData(midEmaData);
    slowEmaSeriesRef.current.setData(slowEmaData);

    // Fit content
    if (chartRef.current) {
      chartRef.current.timeScale().fitContent();
    }
  }, [data]);

  // Update height
  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.applyOptions({ height });
    }
  }, [height]);

  return (
    <div className="relative">
      <div ref={chartContainerRef} style={{ height }} />
      
      {/* Legend */}
      <div className="absolute top-2 left-2 flex items-center gap-4 text-xs font-mono z-10 bg-black/50 px-2 py-1 rounded">
        <div className="flex items-center gap-1">
          <div className="w-3 h-0.5 bg-amber-500"></div>
          <span className="text-amber-500">Fast ({emaSettings?.fast_ema || 20})</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-0.5 bg-purple-500"></div>
          <span className="text-purple-500">Mid ({emaSettings?.mid_ema || 50})</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-0.5 bg-pink-500"></div>
          <span className="text-pink-500">Slow ({emaSettings?.slow_ema || 200})</span>
        </div>
      </div>
    </div>
  );
};

export default TradingChart;
