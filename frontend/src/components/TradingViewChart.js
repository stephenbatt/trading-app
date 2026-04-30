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
