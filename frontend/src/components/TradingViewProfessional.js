import React, { useEffect, useRef } from "react";

const TradingViewProfessional = ({ symbol = "NASDAQ:AAPL" }) => {
  const containerRef = useRef();

  useEffect(() => {
    if (!containerRef.current) return;

    containerRef.current.innerHTML = "";

    const script = document.createElement("script");

    script.src =
      "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";

    script.type = "text/javascript";

    script.async = true;

    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: symbol,
      interval: "5",
      timezone: "America/New_York",
      theme: "dark",
      style: "1",
      locale: "en",
      allow_symbol_change: true,

      studies: [
        "MACD@tv-basicstudies",
        "CCI@tv-basicstudies",
        "MASimple@tv-basicstudies"
      ],

      support_host: "https://www.tradingview.com",
    });

    containerRef.current.appendChild(script);

  }, [symbol]);

  return (
    <div
      className="tradingview-widget-container"
      style={{ height: "700px", width: "100%" }}
    >
      <div
        ref={containerRef}
        style={{ height: "100%", width: "100%" }}
      />
    </div>
  );
};

export default TradingViewProfessional;
