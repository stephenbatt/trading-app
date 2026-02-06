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

    // Create chart with professional dark theme
    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: height,
      layout: {
        background: { color: '#131722' },
        textColor: '#787B86',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        fontSize: 12,
      },
      grid: {
        vertLines: { color: 'rgba(42, 46, 57, 0.5)', style: 1 },
        horzLines: { color: 'rgba(42, 46, 57, 0.5)', style: 1 },
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
        fixLeftEdge: true,
        fixRightEdge: true,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    });

    chartRef.current = chart;

    // Professional candlestick series
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
      lineStyle: 0, // Solid
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
    });

    // Mid EMA - dashed purple line
    const midEma = chart.addLineSeries({
      color: '#9B59B6',
      lineWidth: 2,
      lineStyle: 2, // Dashed
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
    });

    // Slow EMA - dashed pink line  
    const slowEma = chart.addLineSeries({
      color: '#E91E8C',
      lineWidth: 2,
      lineStyle: 2, // Dashed
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
    });

    // Convert string dates to proper format for lightweight-charts
    // The library accepts YYYY-MM-DD strings directly
    const candleData = data.map(candle => ({
      time: candle.time, // YYYY-MM-DD string format
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    })).sort((a, b) => a.time.localeCompare(b.time));

    const fastEmaData = data
      .filter(c => c.fast_ema != null)
      .map(c => ({ time: c.time, value: c.fast_ema }))
      .sort((a, b) => a.time.localeCompare(b.time));

    const midEmaData = data
      .filter(c => c.mid_ema != null)
      .map(c => ({ time: c.time, value: c.mid_ema }))
      .sort((a, b) => a.time.localeCompare(b.time));

    const slowEmaData = data
      .filter(c => c.slow_ema != null)
      .map(c => ({ time: c.time, value: c.slow_ema }))
      .sort((a, b) => a.time.localeCompare(b.time));

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

    // Fit content and scroll to latest
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
      
      {/* EMA Legend */}
      <div className="absolute top-3 left-3 flex items-center gap-4 text-xs font-sans z-10 bg-[#131722]/90 px-3 py-2 rounded border border-[#2A2E39]">
        <div className="flex items-center gap-2">
          <div className="w-5 h-0.5 bg-[#F7931A]"></div>
          <span className="text-[#F7931A]">Fast EMA</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-5 h-0.5 bg-[#9B59B6]" style={{borderTop: '2px dashed #9B59B6', height: 0}}></div>
          <span className="text-[#9B59B6]">Mid EMA</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-5 h-0.5 bg-[#E91E8C]" style={{borderTop: '2px dashed #E91E8C', height: 0}}></div>
          <span className="text-[#E91E8C]">Slow EMA</span>
        </div>
      </div>
    </div>
  );
};

export default ProfessionalChart;
