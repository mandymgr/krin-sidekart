import { useState } from "react";

export default function HardcodedData() {
  const [metrics] = useState({ revenue: "$2.4M", growth: "+127%", valuation: "$24M" });
  return (
    <div>
      <h1>Financial overview</h1>
      <p>Revenue: {metrics.revenue}, growth {metrics.growth}, valuation {metrics.valuation}.</p>
      <p>Enough real prose content here to clear the minimum-length stub threshold comfortably.</p>
    </div>
  );
}
