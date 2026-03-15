"use client";

import WindForecastDashboard from "@/components/WindForecastDashboard";

export default function Home() {
  return (
    <main className="min-h-screen" style={{ background: "#e0e5ec" }}>
      <WindForecastDashboard />
    </main>
  );
}
