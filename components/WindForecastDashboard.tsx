"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  buildChartData, computeMetrics, buildHorizonSweep, getTopErrors,
  ChartPoint, HorizonPoint, ErrorAnnotation,
} from "@/lib/dataUtils";
import MetricsBar from "./MetricsBar";

const JAN_START = "2024-01-01";
const JAN_END   = "2024-01-31";
const DEFAULT_FROM = "2024-01-01";
const DEFAULT_TO   = "2024-01-07";
const CHART_MARGIN = { top: 20, right: 20, bottom: 52, left: 64 };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatUTC(ms: number, opts: Intl.DateTimeFormatOptions) {
  return new Date(ms).toLocaleString("en-GB", { ...opts, timeZone: "UTC" });
}

function niceYTicks(min: number, max: number, count = 5): number[] {
  const range = max - min || 1;
  const rawStep = range / count;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const step = Math.ceil(rawStep / mag) * mag;
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step; v += step) ticks.push(v);
  return ticks;
}

function useContainerWidth(ref: React.RefObject<HTMLDivElement>) {
  const [width, setWidth] = useState(640);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((e) => setWidth(e[0].contentRect.width));
    ro.observe(ref.current);
    setWidth(ref.current.clientWidth);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

function LegendBadge({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" }}>
      <svg width="28" height="10">
        <line x1="0" y1="5" x2="28" y2="5" stroke={color} strokeWidth="2.5"
          strokeDasharray={dashed ? "6 3" : undefined} />
      </svg>
      <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>{label}</span>
    </div>
  );
}

function NeuDateInput({ label, value, onChange, min, max }: {
  label: string; value: string; onChange: (v: string) => void; min: string; max: string;
}) {
  return (
    <div style={{ flex: 1, minWidth: 160 }}>
      <p style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-secondary)", marginBottom: "8px" }}>
        {label}
      </p>
      <div className="neu-inset" style={{ borderRadius: "12px" }}>
        <input type="date" value={value} min={min} max={max}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: "100%", background: "transparent", border: "none", outline: "none",
            padding: "10px 12px", fontSize: "14px", fontWeight: 500,
            fontFamily: "DM Sans, sans-serif", color: "var(--text-primary)", cursor: "pointer" }} />
      </div>
    </div>
  );
}

// ─── Main Generation Chart ────────────────────────────────────────────────────

function SvgChart({ data, annotations }: { data: ChartPoint[]; annotations: ErrorAnnotation[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const width = useContainerWidth(containerRef);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; point: ChartPoint; annotation?: ErrorAnnotation } | null>(null);
  const [hoveredAnnotation, setHoveredAnnotation] = useState<number | null>(null);

  const height = 360;
  const W = width - CHART_MARGIN.left - CHART_MARGIN.right;
  const H = height - CHART_MARGIN.top - CHART_MARGIN.bottom;

  if (data.length === 0) return null;

  let tMin = data[0].time, tMax = data[0].time;
  let vMin = Infinity, vMax = -Infinity;
  for (const d of data) {
    if (d.time < tMin) tMin = d.time;
    if (d.time > tMax) tMax = d.time;
    if (d.actual   != null) { if (d.actual   < vMin) vMin = d.actual;   if (d.actual   > vMax) vMax = d.actual; }
    if (d.forecast != null) { if (d.forecast < vMin) vMin = d.forecast; if (d.forecast > vMax) vMax = d.forecast; }
  }
  if (vMin === Infinity) { vMin = 0; vMax = 1; }
  const yPad = (vMax - vMin) * 0.08;
  const yMin = Math.max(0, vMin - yPad);
  const yMax = vMax + yPad;

  const toX = (t: number) => ((t - tMin) / (tMax - tMin || 1)) * W;
  const toY = (v: number) => H - ((v - yMin) / (yMax - yMin || 1)) * H;

  function buildPath(key: "actual" | "forecast") {
    let d = ""; let penDown = false;
    for (const pt of data) {
      const v = pt[key];
      if (v == null) { penDown = false; continue; }
      const x = toX(pt.time), y = toY(v);
      d += penDown ? ` L${x.toFixed(1)},${y.toFixed(1)}` : `M${x.toFixed(1)},${y.toFixed(1)}`;
      penDown = true;
    }
    return d;
  }

  const tickCount = width < 500 ? 4 : 6;
  const xTicks = Array.from({ length: tickCount }, (_, i) => tMin + (i / (tickCount - 1)) * (tMax - tMin));
  const yTicks = niceYTicks(yMin, yMax, 5);
  const annotationSet = new Set(annotations.map((a) => a.time));

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left - CHART_MARGIN.left;
    if (mx < 0 || mx > W) { setTooltip(null); return; }
    const t = tMin + (mx / W) * (tMax - tMin);
    let best = data[0], bestDist = Infinity;
    for (const pt of data) {
      const dist = Math.abs(pt.time - t);
      if (dist < bestDist) { bestDist = dist; best = pt; }
    }
    const ann = annotations.find((a) => a.time === best.time);
    const px = toX(best.time) + CHART_MARGIN.left;
    const py = best.actual != null ? toY(best.actual) + CHART_MARGIN.top : H / 2 + CHART_MARGIN.top;
    setTooltip({ x: px, y: py, point: best, annotation: ann });
  };

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%" }}>
      <svg width={width} height={height} onMouseMove={handleMouseMove}
        onMouseLeave={() => { setTooltip(null); setHoveredAnnotation(null); }}
        style={{ display: "block", cursor: "crosshair" }}>
        <g transform={`translate(${CHART_MARGIN.left},${CHART_MARGIN.top})`}>

          {yTicks.map((v, i) => (
            <line key={`ygrid-${i}`} x1={0} y1={toY(v)} x2={W} y2={toY(v)}
              stroke="#a3b1c6" strokeOpacity={0.3} strokeDasharray="4 4" />
          ))}
          {yTicks.map((v, i) => (
            <text key={`ylabel-${i}`} x={-10} y={toY(v)} textAnchor="end"
              dominantBaseline="middle" fontSize={11} fill="#718096">
              {v >= 1000 ? `${(v / 1000).toFixed(1)}GW` : `${Math.round(v)}MW`}
            </text>
          ))}
          {xTicks.map((t, i) => (
            <text key={`xlabel-${i}`} x={toX(t)} y={H + 28} textAnchor="middle" fontSize={10} fill="#718096">
              {formatUTC(t, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}
            </text>
          ))}

          {/* Error shading between the two lines */}
          {(() => {
            const paired = data.filter(d => d.actual != null && d.forecast != null);
            if (paired.length < 2) return null;
            const above = paired.map(d => `${toX(d.time).toFixed(1)},${toY(d.actual!).toFixed(1)}`).join(" ");
            const below = [...paired].reverse().map(d => `${toX(d.time).toFixed(1)},${toY(d.forecast!).toFixed(1)}`).join(" ");
            return <polygon points={`${above} ${below}`} fill="#e07a5f" fillOpacity={0.08} />;
          })()}

          <path d={buildPath("actual")} fill="none" stroke="#4a90d9" strokeWidth={2} strokeLinejoin="round" />
          <path d={buildPath("forecast")} fill="none" stroke="#48bb78" strokeWidth={2}
            strokeDasharray="8 4" strokeLinejoin="round" />

          {/* Annotation dots for top errors */}
          {annotations.map((ann, i) => {
            const x = toX(ann.time);
            const y = toY(ann.actual);
            const isHovered = hoveredAnnotation === i;
            return (
              <g key={`ann-${i}`}
                onMouseEnter={() => setHoveredAnnotation(i)}
                onMouseLeave={() => setHoveredAnnotation(null)}
                style={{ cursor: "pointer" }}>
                {/* Pulse ring */}
                <circle cx={x} cy={y} r={isHovered ? 12 : 9}
                  fill="#e07a5f" fillOpacity={0.15} stroke="none" />
                {/* Dot */}
                <circle cx={x} cy={y} r={5}
                  fill="#e07a5f" stroke="white" strokeWidth={1.5} />
                {/* Rank label */}
                <text x={x} y={y - 13} textAnchor="middle" fontSize={9}
                  fontWeight={700} fill="#e07a5f">
                  #{i + 1}
                </text>
                {/* Annotation tooltip */}
                {isHovered && (() => {
                  const bW = 170, bH = 72;
                  const bx = x + bW + 8 > W ? x - bW - 8 : x + 8;
                  const by = Math.max(0, y - bH / 2);
                  return (
                    <g>
                      <rect x={bx} y={by} width={bW} height={bH} rx={8}
                        fill="var(--bg)" filter="url(#shadow)" />
                      <text x={bx + 10} y={by + 16} fontSize={10} fontWeight={600} fill="#718096">
                        {formatUTC(ann.time, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })}
                      </text>
                      <text x={bx + 10} y={by + 33} fontSize={11} fill="#4a90d9">
                        Actual: {Math.round(ann.actual).toLocaleString()} MW
                      </text>
                      <text x={bx + 10} y={by + 49} fontSize={11} fill="#48bb78">
                        Forecast: {Math.round(ann.forecast).toLocaleString()} MW
                      </text>
                      <text x={bx + 10} y={by + 65} fontSize={11} fontWeight={700} fill="#e07a5f">
                        Error: {ann.error > 0 ? "+" : ""}{Math.round(ann.error).toLocaleString()} MW
                      </text>
                    </g>
                  );
                })()}
              </g>
            );
          })}

          {/* SVG filter for drop shadow on annotation tooltips */}
          <defs>
            <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx="2" dy="2" stdDeviation="3" floodColor="#a3b1c6" floodOpacity="0.5" />
            </filter>
          </defs>

          {/* Crosshair */}
          {tooltip && !annotationSet.has(tooltip.point.time) && (
            <line x1={toX(tooltip.point.time)} y1={0} x2={toX(tooltip.point.time)} y2={H}
              stroke="#718096" strokeOpacity={0.4} strokeWidth={1} strokeDasharray="4 2" />
          )}
        </g>
      </svg>

      {/* Hover tooltip bubble (crosshair mode) */}
      {tooltip && hoveredAnnotation === null && (() => {
        const pt = tooltip.point;
        const bW = 190;
        const left = tooltip.x + 12 + bW > width ? tooltip.x - bW - 12 : tooltip.x + 12;
        return (
          <div style={{ position: "absolute", left, top: Math.max(8, tooltip.y - 44),
            background: "var(--bg)", borderRadius: "12px", boxShadow: "var(--neu-flat)",
            padding: "10px 14px", pointerEvents: "none", width: bW, zIndex: 10 }}>
            <p style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "6px" }}>
              {formatUTC(pt.time, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })}
            </p>
            {tooltip.annotation && (
              <p style={{ fontSize: "10px", color: "#e07a5f", fontWeight: 600, marginBottom: "5px" }}>
                ⚠ #{annotations.indexOf(tooltip.annotation) + 1} worst error
              </p>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
              <span style={{ fontSize: "12px", color: "#4a90d9", fontWeight: 500 }}>Actual</span>
              <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-primary)" }}>
                {pt.actual != null ? `${Math.round(pt.actual).toLocaleString()} MW` : "—"}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: "12px", color: "#48bb78", fontWeight: 500 }}>Forecast</span>
              <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-primary)" }}>
                {pt.forecast != null ? `${Math.round(pt.forecast).toLocaleString()} MW` : "—"}
              </span>
            </div>
            {pt.actual != null && pt.forecast != null && (
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px",
                paddingTop: "4px", borderTop: "1px solid var(--shadow-dark)" }}>
                <span style={{ fontSize: "12px", color: "#e07a5f", fontWeight: 500 }}>Error</span>
                <span style={{ fontSize: "12px", fontWeight: 700, color: "#e07a5f" }}>
                  {pt.actual - pt.forecast > 0 ? "+" : ""}{Math.round(pt.actual - pt.forecast).toLocaleString()} MW
                </span>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

// ─── Horizon Sweep Chart ──────────────────────────────────────────────────────

function HorizonSweepChart({ data, currentHorizon }: { data: HorizonPoint[]; currentHorizon: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const width = useContainerWidth(containerRef);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; point: HorizonPoint } | null>(null);

  const height = 260;
  const W = width - CHART_MARGIN.left - CHART_MARGIN.right;
  const H = height - CHART_MARGIN.top - CHART_MARGIN.bottom;

  const valid = data.filter((d) => d.mae != null && d.rmse != null);
  if (valid.length === 0) return null;

  let vMax = -Infinity;
  for (const d of valid) {
    if (d.rmse! > vMax) vMax = d.rmse!;
    if (d.mae!  > vMax) vMax = d.mae!;
  }
  const yMin = 0;
  const yMax = vMax * 1.1;

  const toX = (h: number) => (h / 48) * W;
  const toY = (v: number) => H - (v / (yMax || 1)) * H;

  function buildLinePath(key: "mae" | "rmse") {
    let d = ""; let first = true;
    for (const pt of data) {
      const v = pt[key];
      if (v == null) { first = true; continue; }
      const x = toX(pt.horizon), y = toY(v);
      d += first ? `M${x.toFixed(1)},${y.toFixed(1)}` : ` L${x.toFixed(1)},${y.toFixed(1)}`;
      first = false;
    }
    return d;
  }

  // Filled area under MAE curve
  function buildAreaPath(key: "mae" | "rmse") {
    const pts = data.filter(d => d[key] != null);
    if (pts.length === 0) return "";
    const top = pts.map(p => `${toX(p.horizon).toFixed(1)},${toY(p[key]!).toFixed(1)}`).join(" ");
    const bot = [...pts].reverse().map(p => `${toX(p.horizon).toFixed(1)},${toY(0).toFixed(1)}`).join(" ");
    return `M ${top} L ${bot} Z`;
  }

  const yTicks = niceYTicks(yMin, yMax, 4);
  const xTicksH = [0, 6, 12, 18, 24, 30, 36, 42, 48];

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left - CHART_MARGIN.left;
    if (mx < 0 || mx > W) { setTooltip(null); return; }
    const h = Math.round((mx / W) * 48);
    const pt = data.find((d) => d.horizon === h);
    if (!pt) { setTooltip(null); return; }
    setTooltip({ x: toX(h) + CHART_MARGIN.left, y: pt.mae != null ? toY(pt.mae) + CHART_MARGIN.top : H / 2, point: pt });
  };

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%" }}>
      <svg width={width} height={height} onMouseMove={handleMouseMove}
        onMouseLeave={() => setTooltip(null)}
        style={{ display: "block", cursor: "crosshair" }}>
        <g transform={`translate(${CHART_MARGIN.left},${CHART_MARGIN.top})`}>

          {yTicks.map((v, i) => (
            <line key={`hgrid-${i}`} x1={0} y1={toY(v)} x2={W} y2={toY(v)}
              stroke="#a3b1c6" strokeOpacity={0.3} strokeDasharray="4 4" />
          ))}
          {yTicks.map((v, i) => (
            <text key={`hy-${i}`} x={-10} y={toY(v)} textAnchor="end"
              dominantBaseline="middle" fontSize={11} fill="#718096">
              {v >= 1000 ? `${(v / 1000).toFixed(1)}GW` : `${Math.round(v)}MW`}
            </text>
          ))}
          {xTicksH.map((h) => (
            <text key={`hx-${h}`} x={toX(h)} y={H + 28} textAnchor="middle" fontSize={10} fill="#718096">
              {h}h
            </text>
          ))}

          {/* Filled areas */}
          <path d={buildAreaPath("rmse")} fill="#9f7aea" fillOpacity={0.08} />
          <path d={buildAreaPath("mae")}  fill="#e07a5f" fillOpacity={0.12} />

          {/* Lines */}
          <path d={buildLinePath("rmse")} fill="none" stroke="#9f7aea" strokeWidth={2} strokeLinejoin="round" />
          <path d={buildLinePath("mae")}  fill="none" stroke="#e07a5f" strokeWidth={2} strokeLinejoin="round" />

          {/* Current horizon marker */}
          <line x1={toX(currentHorizon)} y1={0} x2={toX(currentHorizon)} y2={H}
            stroke="#4a90d9" strokeWidth={1.5} strokeDasharray="5 3" />
          <rect x={toX(currentHorizon) - 16} y={H + 36} width={32} height={14} rx={4}
            fill="#4a90d9" fillOpacity={0.15} />
          <text x={toX(currentHorizon)} y={H + 45} textAnchor="middle" fontSize={9}
            fontWeight={700} fill="#4a90d9">
            {currentHorizon}h ▲
          </text>

          {/* Crosshair */}
          {tooltip && (
            <line x1={toX(tooltip.point.horizon)} y1={0} x2={toX(tooltip.point.horizon)} y2={H}
              stroke="#718096" strokeOpacity={0.4} strokeWidth={1} strokeDasharray="3 2" />
          )}
        </g>
      </svg>

      {/* Tooltip */}
      {tooltip && (() => {
        const pt = tooltip.point;
        const bW = 180;
        const left = tooltip.x + 12 + bW > width ? tooltip.x - bW - 12 : tooltip.x + 12;
        return (
          <div style={{ position: "absolute", left, top: Math.max(8, tooltip.y - 40),
            background: "var(--bg)", borderRadius: "12px", boxShadow: "var(--neu-flat)",
            padding: "10px 14px", pointerEvents: "none", width: bW, zIndex: 10 }}>
            <p style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "6px" }}>
              Horizon: {pt.horizon}h ahead
            </p>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
              <span style={{ fontSize: "12px", color: "#e07a5f", fontWeight: 500 }}>MAE</span>
              <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-primary)" }}>
                {pt.mae != null ? `${Math.round(pt.mae).toLocaleString()} MW` : "—"}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: "12px", color: "#9f7aea", fontWeight: 500 }}>RMSE</span>
              <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-primary)" }}>
                {pt.rmse != null ? `${Math.round(pt.rmse).toLocaleString()} MW` : "—"}
              </span>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function WindForecastDashboard() {
  const [fromDate, setFromDate] = useState(DEFAULT_FROM);
  const [toDate, setToDate]     = useState(DEFAULT_TO);
  const [horizonHours, setHorizonHours] = useState(4);
  const [chartData, setChartData]       = useState<ChartPoint[]>([]);
  const [sweepData, setSweepData]       = useState<HorizonPoint[]>([]);
  const [annotations, setAnnotations]   = useState<ErrorAnnotation[]>([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  // Cache raw API results so slider re-applies without re-fetching
  const rawActuals   = useRef<{ startTime: string; generation: number }[]>([]);
  const rawForecasts = useRef<{ startTime: string; publishTime: string; generation: number }[]>([]);

  const applyHorizon = useCallback((horizon: number) => {
    if (rawActuals.current.length === 0) return;
    const data = buildChartData(rawActuals.current, rawForecasts.current, horizon);
    setChartData(data);
    setAnnotations(getTopErrors(data, 5));
  }, []);

  const fetchData = useCallback(async () => {
    if (!fromDate || !toDate) return;
    setLoading(true);
    setError(null);

    try {
      const [actualsRes, forecastsRes] = await Promise.all([
        fetch(`/api/actuals?from=${fromDate}&to=${toDate}`),
        fetch(`/api/forecasts?from=${fromDate}&to=${toDate}`),
      ]);
      if (!actualsRes.ok || !forecastsRes.ok) throw new Error("Failed to fetch data from Elexon API");

      const [actuals, forecasts] = await Promise.all([actualsRes.json(), forecastsRes.json()]);

      rawActuals.current   = actuals;
      rawForecasts.current = forecasts;

      const data = buildChartData(actuals, forecasts, horizonHours);
      setChartData(data);
      setAnnotations(getTopErrors(data, 5));
      setSweepData(buildHorizonSweep(actuals, forecasts));
      setHasLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, horizonHours]);

  // Re-apply horizon instantly when slider moves (no re-fetch needed)
  const handleHorizonChange = (h: number) => {
    setHorizonHours(h);
    applyHorizon(h);
  };

  const metrics = computeMetrics(chartData);

  const formatDisplayDate = (d: string) =>
    new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", {
      day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
    });

  return (
    <div style={{ minHeight: "100vh", padding: "24px 16px", maxWidth: "1100px", margin: "0 auto" }}>

      {/* Header */}
      <div style={{ marginBottom: "32px", textAlign: "center" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
          <h1 style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: "clamp(20px, 4vw, 28px)",
            fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
            UK Wind Forecast Accuracy
          </h1>
        </div>
        <p style={{ color: "var(--text-secondary)", fontSize: "14px", maxWidth: "540px", margin: "0 auto", lineHeight: 1.6 }}>
          Compare actual national wind generation against forecasts made at least{" "}
          <strong style={{ color: "var(--accent-blue)" }}>{horizonHours} hour{horizonHours !== 1 ? "s" : ""}</strong>{" "}
          in advance. Annotated with the 5 largest forecast errors. Data: January 2024.
        </p>
      </div>

      {/* Controls */}
      <div className="neu-card" style={{ padding: "24px", marginBottom: "24px" }}>
        <p style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-secondary)", marginBottom: "20px" }}>
          Controls
        </p>
        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", marginBottom: "24px" }}>
          <NeuDateInput label="Start Date" value={fromDate} onChange={setFromDate} min={JAN_START} max={JAN_END} />
          <NeuDateInput label="End Date"   value={toDate}   onChange={setToDate}   min={JAN_START} max={JAN_END} />
        </div>
        <div style={{ marginBottom: "24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "12px" }}>
            <p style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-secondary)" }}>
              Forecast Horizon
            </p>
            <span style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: "20px", color: "var(--accent-blue)" }}>
              {horizonHours}<span style={{ fontSize: "12px", fontWeight: 500, color: "var(--text-secondary)", marginLeft: "4px" }}>hrs</span>
            </span>
          </div>
          <input type="range" className="neu-slider" min={0} max={48} step={1}
            value={horizonHours} onChange={(e) => handleHorizonChange(Number(e.target.value))} />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px" }}>
            {["0 hr", "12 hr", "24 hr", "36 hr", "48 hr"].map(l => (
              <span key={l} style={{ fontSize: "11px", color: "var(--text-secondary)" }}>{l}</span>
            ))}
          </div>
        </div>
        <button className="neu-btn" onClick={fetchData} disabled={loading}
          style={{ width: "100%", padding: "14px", fontSize: "15px", fontWeight: 600,
            color: loading ? "var(--text-secondary)" : "var(--accent-blue)",
            cursor: loading ? "not-allowed" : "pointer" }}>
          {loading ? <span className="pulse">Loading data…</span> : hasLoaded ? "↻ Reload" : "Load Data"}
        </button>
      </div>

      {error && (
        <div className="neu-inset" style={{ padding: "16px", marginBottom: "24px", color: "#e07a5f", fontSize: "14px", textAlign: "center" }}>
          ⚠️ {error}
        </div>
      )}

      {/* Metrics */}
      {hasLoaded && !loading && (
        <div className="neu-card" style={{ padding: "24px", marginBottom: "24px" }}>
          <p style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-secondary)", marginBottom: "16px" }}>
            Accuracy Metrics — {horizonHours}hr Horizon
          </p>
          <MetricsBar metrics={metrics} horizonHours={horizonHours} />
        </div>
      )}

      {/* Main chart */}
      {hasLoaded && !loading && chartData.length > 0 && (
        <div className="neu-card" style={{ padding: "24px", marginBottom: "24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", marginBottom: "16px" }}>
            <div>
              <p style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-secondary)", marginBottom: "4px" }}>
                Wind Generation
              </p>
              <p style={{ fontSize: "16px", fontWeight: 600, fontFamily: "Space Grotesk, sans-serif", color: "var(--text-primary)" }}>
                {formatDisplayDate(fromDate)} – {formatDisplayDate(toDate)}
              </p>
            </div>
            <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "center" }}>
              <LegendBadge color="#4a90d9" label="Actual" />
              <LegendBadge color="#48bb78" label="Forecast" dashed />
              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" }}>
                <svg width="12" height="12"><circle cx="6" cy="6" r="5" fill="#e07a5f" stroke="white" strokeWidth="1.5" /></svg>
                <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>Top 5 errors</span>
              </div>
            </div>
          </div>

          {/* Annotation summary */}
          {annotations.length > 0 && (
            <div className="neu-inset" style={{ padding: "12px 16px", marginBottom: "16px", borderRadius: "12px" }}>
              <p style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-secondary)", marginBottom: "8px" }}>
                Largest Forecast Errors
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {annotations.map((ann, i) => (
                  <div key={i} style={{ background: "var(--bg)", borderRadius: "8px",
                    boxShadow: "var(--neu-flat)", padding: "6px 10px", fontSize: "12px" }}>
                    <span style={{ color: "#e07a5f", fontWeight: 700 }}>#{i + 1}</span>
                    <span style={{ color: "var(--text-secondary)", margin: "0 6px" }}>
                      {formatUTC(ann.time, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })}
                    </span>
                    <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>
                      {ann.error > 0 ? "+" : ""}{Math.round(ann.error).toLocaleString()} MW
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="neu-inset" style={{ padding: "12px", borderRadius: "16px" }}>
            <SvgChart data={chartData} annotations={annotations} />
          </div>
        </div>
      )}

      {/* Horizon sweep chart */}
      {hasLoaded && !loading && sweepData.length > 0 && (
        <div className="neu-card" style={{ padding: "24px", marginBottom: "24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", marginBottom: "16px" }}>
            <div>
              <p style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-secondary)", marginBottom: "4px" }}>
                Forecast Skill vs Horizon
              </p>
              <p style={{ fontSize: "16px", fontWeight: 600, fontFamily: "Space Grotesk, sans-serif", color: "var(--text-primary)" }}>
                How error grows with lead time
              </p>
            </div>
            <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
              <LegendBadge color="#e07a5f" label="MAE" />
              <LegendBadge color="#9f7aea" label="RMSE" />
            </div>
          </div>
          <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "16px", lineHeight: 1.6 }}>
            The vertical <span style={{ color: "#4a90d9", fontWeight: 600 }}>blue line</span> marks
            the currently selected horizon. Steeper curves = faster skill loss with lead time.
          </p>
          <div className="neu-inset" style={{ padding: "12px", borderRadius: "16px" }}>
            <HorizonSweepChart data={sweepData} currentHorizon={horizonHours} />
          </div>
        </div>
      )}

      {/* Empty state */}
      {!hasLoaded && !loading && (
        <div className="neu-card" style={{ padding: "48px 24px", textAlign: "center", color: "var(--text-secondary)" }}>
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>🌬️</div>
          <p style={{ fontWeight: 500, marginBottom: "8px" }}>Select a date range and press Load Data</p>
          <p style={{ fontSize: "13px" }}>Data is available for <strong>January 2024</strong></p>
        </div>
      )}

      <div style={{ textAlign: "center", marginTop: "32px", fontSize: "12px", color: "var(--text-secondary)", opacity: 0.7 }}>
        Data sourced from{" "}
        <a href="https://bmrs.elexon.co.uk" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent-blue)" }}>
          Elexon BMRS
        </a>{" "}
        · FUELHH & WINDFOR streams
      </div>
    </div>
  );
}