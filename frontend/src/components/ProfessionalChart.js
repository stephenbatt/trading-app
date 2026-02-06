import React, { useEffect, useRef } from 'react';
import { createChart, CrosshairMode } from 'lightweight-charts';

const ProfessionalChart = ({ data, height = 450 }) => {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!chartContainerRef.current || !data || data.length === 0) return;

    // Remove existing chart
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    // Create chart with professional dark theme (TradingView style)
    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: height,
      layout: {
        backgroundColor: '#131722',
        textColor: '#787B86',
        fontFamily: "'Inter', sans-serif",
        fontSize: 12,
      },
      grid: {
        vertLines: { color: 'rgba(42, 46, 57, 0.5)' },
        horzLines: { color: 'rgba(42, 46, 57, 0.5)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: '#758696',
          width: 1,
          style: 3,
          labelBackgroundColor: '#2962FF',
        },
        horzLine: {
          color: '#758696',
          width: 1,
          style: 3,
          labelBackgroundColor: '#2962FF',
        },
      },
      rightPriceScale: {
        borderColor: '#2A2E39',
        scaleMargins: { top: 0.1, bottom: 0.2 },
        borderVisible: true,
      },
      timeScale: {
        borderColor: '#2A2E39',
        timeVisible: false,
        borderVisible: true,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    });

    chartRef.current = chart;

    // Professional candlestick series - ThinkorSwim style colors
    const candleSeries = chart.addCandlestickSeries({
      upColor: '#26A69A',
      downColor: '#EF5350',
      borderVisible: false,
      wickUpColor: '#26A69A',
      wickDownColor: '#EF5350',
    });

    // Fast EMA - solid amber line
    const fastEma = chart.addLineSeries({
      color: '#F7931A',
      lineWidth: 2,
      lineStyle: 0,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
      lastValueVisible: false,
      priceLineVisible: false,
    });

    // Mid EMA - dashed purple line
    const midEma = chart.addLineSeries({
      color: '#9B59B6',
      lineWidth: 2,
      lineStyle: 2,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
      lastValueVisible: false,
      priceLineVisible: false,
    });

    // Slow EMA - dashed pink line  
    const slowEma = chart.addLineSeries({
      color: '#E91E8C',
      lineWidth: 2,
      lineStyle: 2,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
      lastValueVisible: false,
      priceLineVisible: false,
    });

    // Convert string dates (YYYY-MM-DD) to unix timestamps
    const parseDate = (dateStr) => {
      const parts = dateStr.split('-');
      const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      return Math.floor(date.getTime() / 1000);
    };

    // Sort data by date and convert to timestamp format
    const sortedData = [...data].sort((a, b) => a.time.localeCompare(b.time));

    const candleData = sortedData.map(candle => ({
      time: parseDate(candle.time),
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    }));

    const fastEmaData = sortedData
      .filter(c => c.fast_ema != null)
      .map(c => ({ time: parseDate(c.time), value: c.fast_ema }));

    const midEmaData = sortedData
      .filter(c => c.mid_ema != null)
      .map(c => ({ time: parseDate(c.time), value: c.mid_ema }));

    const slowEmaData = sortedData
      .filter(c => c.slow_ema != null)
      .map(c => ({ time: parseDate(c.time), value: c.slow_ema }));

    // Set data
    candleSeries.setData(candleData);
    if (fastEmaData.length > 0) fastEma.setData(fastEmaData);
    if (midEmaData.length > 0) midEma.setData(midEmaData);
    if (slowEmaData.length > 0) slowEma.setData(slowEmaData);

    // Add current price line
    if (candleData.length > 0) {
      const lastPrice = candleData[candleData.length - 1].close;
      candleSeries.createPriceLine({
        price: lastPrice,
        color: '#2962FF',
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: '',
      });
    }

    // Fit content
    chart.timeScale().fitContent();

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ 
          width: chartContainerRef.current.clientWidth 
        });
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

  if (!data || data.length === 0) {
    return (
      <div 
        className="flex items-center justify-center bg-[#131722] text-zinc-500"
        style={{ height }}
      >
        Loading chart data...
      </div>
    );
  }

  return (
    <div className="relative">
      <div ref={chartContainerRef} style={{ height }} />
      
      {/* EMA Legend - Professional Style */}
      <div className="absolute top-3 left-3 flex items-center gap-4 text-xs z-10 bg-[#131722]/95 px-4 py-2 rounded border border-[#2A2E39]">
        <div className="flex items-center gap-2">
          <div className="w-6 h-0.5 bg-[#F7931A]"></div>
          <span className="text-[#F7931A] font-medium">Fast EMA</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 border-t-2 border-dashed border-[#9B59B6]"></div>
          <span className="text-[#9B59B6] font-medium">Mid EMA</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 border-t-2 border-dashed border-[#E91E8C]"></div>
          <span className="text-[#E91E8C] font-medium">Slow EMA</span>
        </div>
      </div>

      {/* TradingView Watermark */}
      <div className="absolute bottom-3 left-3 text-xs text-zinc-600 font-medium">
        Powered by TradingView
      </div>
    </div>
  );
};

export default ProfessionalChart;
