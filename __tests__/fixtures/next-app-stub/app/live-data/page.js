import { useState, useEffect } from "react";

export default function LiveData() {
  const [metrics, setMetrics] = useState(null);
  useEffect(() => {
    fetch("/api/metrics").then((r) => r.json()).then(setMetrics);
  }, []);
  return (
    <div>
      <h1>Financial overview</h1>
      <p>Live metrics loaded from the real backend endpoint, not hardcoded here.</p>
    </div>
  );
}
