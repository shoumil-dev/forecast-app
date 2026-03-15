export interface ActualPoint {
  startTime: string;
  generation: number;
}

export interface ForecastPoint {
  startTime: string;
  publishTime: string;
  generation: number;
}

export interface ChartPoint {
  time: number;
  label: string;
  actual: number | null;
  forecast: number | null;
}

export interface HorizonPoint {
  horizon: number; // hours
  mae: number | null;
  rmse: number | null;
}

export interface AccuracyMetrics {
  mae: number | null;
  rmse: number | null;
  coverage: number | null;
}

function roundTo30Min(ms: number): number {
  const thirtyMin = 30 * 60 * 1000;
  return Math.round(ms / thirtyMin) * thirtyMin;
}

function roundToHour(ms: number): number {
  const hour = 60 * 60 * 1000;
  return Math.round(ms / hour) * hour;
}

// ─── Build forecast lookup map (reused by both functions) ────────────────────

function buildForecastMap(forecasts: ForecastPoint[]): Map<number, ForecastPoint[]> {
  const map = new Map<number, ForecastPoint[]>();
  for (const f of forecasts) {
    const st = roundTo30Min(new Date(f.startTime).getTime());
    if (!map.has(st)) map.set(st, []);
    map.get(st)!.push(f);
  }
  return map;
}

function getCandidates(map: Map<number, ForecastPoint[]>, targetMs: number): ForecastPoint[] {
  return map.get(targetMs) ?? map.get(roundToHour(targetMs)) ?? [];
}

function bestForecastAt(
  candidates: ForecastPoint[],
  cutoffMs: number
): ForecastPoint | null {
  let best: ForecastPoint | null = null;
  for (const f of candidates) {
    const publishMs = new Date(f.publishTime).getTime();
    if (publishMs <= cutoffMs) {
      if (!best || publishMs > new Date(best.publishTime).getTime()) best = f;
    }
  }
  return best;
}

// ─── Main chart data builder ─────────────────────────────────────────────────

export function buildChartData(
  actuals: ActualPoint[],
  forecasts: ForecastPoint[],
  horizonHours: number
): ChartPoint[] {
  const forecastMap = buildForecastMap(forecasts);
  const horizonMs = horizonHours * 60 * 60 * 1000;

  return actuals.map((a) => {
    const targetMs = roundTo30Min(new Date(a.startTime).getTime());
    const cutoffMs = targetMs - horizonMs;
    const candidates = getCandidates(forecastMap, targetMs);
    const best = bestForecastAt(candidates, cutoffMs);

    return {
      time: targetMs,
      label: formatLabel(a.startTime),
      actual: a.generation,
      forecast: best ? best.generation : null,
    };
  });
}

// ─── Horizon sweep: compute MAE/RMSE for every hour from 0 to 48 ─────────────

export function buildHorizonSweep(
  actuals: ActualPoint[],
  forecasts: ForecastPoint[]
): HorizonPoint[] {
  const forecastMap = buildForecastMap(forecasts);
  const results: HorizonPoint[] = [];

  for (let h = 0; h <= 48; h++) {
    const horizonMs = h * 60 * 60 * 1000;
    const errors: number[] = [];

    for (const a of actuals) {
      const targetMs = roundTo30Min(new Date(a.startTime).getTime());
      const cutoffMs = targetMs - horizonMs;
      const candidates = getCandidates(forecastMap, targetMs);
      const best = bestForecastAt(candidates, cutoffMs);
      if (best != null) errors.push(a.generation - best.generation);
    }

    if (errors.length === 0) {
      results.push({ horizon: h, mae: null, rmse: null });
      continue;
    }

    const mae = errors.reduce((s, e) => s + Math.abs(e), 0) / errors.length;
    const rmse = Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / errors.length);
    results.push({ horizon: h, mae, rmse });
  }

  return results;
}

// ─── Metrics for current horizon ─────────────────────────────────────────────

export function computeMetrics(data: ChartPoint[]): AccuracyMetrics {
  const paired = data.filter((d) => d.actual != null && d.forecast != null);
  const coverage = data.length > 0 ? (paired.length / data.length) * 100 : null;
  if (paired.length === 0) return { mae: null, rmse: null, coverage };

  const errors = paired.map((d) => d.actual! - d.forecast!);
  const mae = errors.reduce((s, e) => s + Math.abs(e), 0) / errors.length;
  const rmse = Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / errors.length);
  return { mae, rmse, coverage };
}

// ─── Top N worst errors for annotations ──────────────────────────────────────

export interface ErrorAnnotation {
  time: number;
  label: string;
  actual: number;
  forecast: number;
  error: number; // signed: actual - forecast
  absError: number;
}

export function getTopErrors(data: ChartPoint[], n = 5): ErrorAnnotation[] {
  return data
    .filter((d) => d.actual != null && d.forecast != null)
    .map((d) => ({
      time: d.time,
      label: d.label,
      actual: d.actual!,
      forecast: d.forecast!,
      error: d.actual! - d.forecast!,
      absError: Math.abs(d.actual! - d.forecast!),
    }))
    .sort((a, b) => b.absError - a.absError)
    .slice(0, n);
}

function formatLabel(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
    hour12: false, timeZone: "UTC",
  });
}