"use client";

import { AccuracyMetrics } from "@/lib/dataUtils";

interface MetricsBarProps {
  metrics: AccuracyMetrics;
  horizonHours: number;
}

export default function MetricsBar({ metrics, horizonHours }: MetricsBarProps) {
  const fmt = (v: number | null, unit: string, decimals = 0) =>
    v == null ? "—" : `${v.toFixed(decimals)} ${unit}`;

  const tiles = [
    {
      label: "Forecast Horizon",
      value: `${horizonHours} hr`,
      color: "var(--text-primary)",
    },
    {
      label: "MAE",
      value: fmt(metrics.mae, "MW"),
      color: metrics.mae == null ? "var(--text-secondary)" : metrics.mae < 500 ? "var(--accent-green)" : "#e07a5f",
    },
    {
      label: "RMSE",
      value: fmt(metrics.rmse, "MW"),
      color: metrics.rmse == null ? "var(--text-secondary)" : metrics.rmse < 700 ? "var(--accent-green)" : "#e07a5f",
    },
    {
      label: "Coverage",
      value: fmt(metrics.coverage, "%", 1),
      color: metrics.coverage == null ? "var(--text-secondary)" : metrics.coverage > 80 ? "var(--accent-green)" : "#e07a5f",
    },
  ];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
        gap: "16px",
      }}
    >
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className="neu-inset"
          style={{ padding: "16px", textAlign: "center" }}
        >
          <div style={{ fontSize: "22px", marginBottom: "6px" }}>{tile.icon}</div>
          <div
            style={{
              fontSize: "18px",
              fontWeight: 700,
              fontFamily: "Space Grotesk, sans-serif",
              color: tile.color,
              marginBottom: "4px",
            }}
          >
            {tile.value}
          </div>
          <div
            style={{
              fontSize: "11px",
              fontWeight: 600,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--text-secondary)",
            }}
          >
            {tile.label}
          </div>
        </div>
      ))}
    </div>
  );
}
