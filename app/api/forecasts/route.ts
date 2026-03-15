import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from"); // e.g. 2024-01-01
  const to = searchParams.get("to");     // e.g. 2024-01-07

  if (!from || !to) {
    return NextResponse.json({ error: "Missing from/to params" }, { status: 400 });
  }

  try {
    // WINDFOR does NOT support settlementDate.
    // It supports publishDateTimeFrom / publishDateTimeTo.
    //
    // To find all forecasts whose startTime falls within [from, to]
    // and whose horizon is 0–48hrs, we need forecasts published from
    // (start - 48hrs) through to (end + 24hrs).
    const startMs = new Date(from + "T00:00:00Z").getTime();
    const endMs   = new Date(to   + "T23:59:59Z").getTime();

    const publishFrom = new Date(startMs - 48 * 60 * 60 * 1000).toISOString();
    const publishTo   = new Date(endMs   + 24 * 60 * 60 * 1000).toISOString();

    const url =
      `https://data.elexon.co.uk/bmrs/api/v1/datasets/WINDFOR/stream` +
      `?publishDateTimeFrom=${encodeURIComponent(publishFrom)}` +
      `&publishDateTimeTo=${encodeURIComponent(publishTo)}`;

    console.log(`[forecasts] GET ${url}`);

    const res = await fetch(url, { cache: "no-store" });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[forecasts] upstream error ${res.status}: ${text}`);
      return NextResponse.json(
        { error: `Elexon returned ${res.status}`, detail: text },
        { status: 502 }
      );
    }

    const raw: unknown = await res.json();
    console.log(`[forecasts] raw record count: ${Array.isArray(raw) ? raw.length : "not array"}`);

    if (!Array.isArray(raw)) {
      console.error("[forecasts] unexpected shape:", JSON.stringify(raw).slice(0, 300));
      return NextResponse.json({ error: "Unexpected response shape from Elexon" }, { status: 502 });
    }

    const filtered: ForecastRecord[] = [];

    for (const r of raw as RawRecord[]) {
      if (!r.startTime || !r.publishTime || r.generation == null) continue;

      const st = new Date(r.startTime).getTime();
      const pt = new Date(r.publishTime).getTime();

      // Only keep records whose startTime is within the user's window
      if (st < startMs || st > endMs) continue;

      // Only keep 0–48 hr forecast horizon
      const horizonHours = (st - pt) / (1000 * 60 * 60);
      if (horizonHours < 0 || horizonHours > 48) continue;

      filtered.push({
        startTime: r.startTime,
        publishTime: r.publishTime,
        generation: r.generation,
      });
    }

    // Sort by startTime asc, then publishTime asc
    filtered.sort((a, b) => {
      const d = new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
      return d !== 0 ? d : new Date(a.publishTime).getTime() - new Date(b.publishTime).getTime();
    });

    console.log(`[forecasts] returning ${filtered.length} filtered records`);
    return NextResponse.json(filtered);

  } catch (err) {
    console.error("[forecasts] exception:", err);
    return NextResponse.json({ error: "Failed to fetch forecasts" }, { status: 500 });
  }
}

interface RawRecord {
  startTime?: string;
  publishTime?: string;
  generation?: number;
  [key: string]: unknown;
}

interface ForecastRecord {
  startTime: string;
  publishTime: string;
  generation: number;
}
