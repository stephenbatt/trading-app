import { useEffect, useRef } from "react";

const TradingViewChart = ({ data }) => {
  const chartRef = useRef(null);

  useEffect(() => {
    if (!data || data.length === 0) return;

    const chart = window.LightweightCharts.createChart(chartRef.current, {
      width: chartRef.current.clientWidth,
      height: 400,
      layout: {
        background: { color: "#131722" },
        textColor: "#d1d5db",
      },
    });

    const series = chart.addCandlestickSeries();

    const formatted = data.map(c => ({
      time: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    series.setData(formatted);

    chart.timeScale().fitContent();

    return () => chart.remove();
  }, [data]);

  return <div ref={chartRef} style={{ width: "100%" }} />;
};

export default TradingViewChart;
