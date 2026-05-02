import { useEffect, useRef } from "react";

const TradingViewChart = ({ data }) => {
  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const seriesRef = useRef(null);

  useEffect(() => {
    if (!chartRef.current) return;

    // ✅ Create chart ONLY once
    if (!chartInstance.current) {
      chartInstance.current = window.LightweightCharts.createChart(
        chartRef.current,
        {
          width: chartRef.current.clientWidth,
          height: 400,
          layout: {
            background: { color: "#131722" },
            textColor: "#d1d5db",
          },
        }
      );

      // ✅ Correct API for your version
      seriesRef.current = chartInstance.current.addSeries(
        window.LightweightCharts.CandlestickSeries
      );
    }

          // EMA Line Series
      const fastEMARef = chartInstance.current.addLineSeries({
        color: "#f59e0b",
        lineWidth: 1,
      });

      const midEMARef = chartInstance.current.addLineSeries({
        color: "#a855f7",
        lineWidth: 1,
      });

      const slowEMARef = chartInstance.current.addLineSeries({
        color: "#ec4899",
        lineWidth: 1,
      });

      chartInstance.current.fastEMARef = fastEMARef;
      chartInstance.current.midEMARef = midEMARef;
      chartInstance.current.slowEMARef = slowEMARef;

    // ✅ Update data (no re-creating chart)
    if (data && data.length > 0 && seriesRef.current) {
      const formatted = data.map((c) => ({
        time: Number(c.time),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));

      seriesRef.current.setData(formatted);
            chartInstance.current.fastEMARef.setData(
        data.map((c) => ({
          time: Number(c.time),
          value: c.fast_ema,
        }))
      );

      chartInstance.current.midEMARef.setData(
        data.map((c) => ({
          time: Number(c.time),
          value: c.mid_ema,
        }))
      );

      chartInstance.current.slowEMARef.setData(
        data.map((c) => ({
          time: Number(c.time),
          value: c.slow_ema,
        }))
      );
      chartInstance.current.timeScale().fitContent();
    }
  }, [data]);

  return (
    <div
      ref={chartRef}
      style={{ width: "100%", height: "400px" }}
    />
  );
};

export default TradingViewChart;
