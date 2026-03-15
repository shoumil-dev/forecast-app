import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from"); // e.g. 2024-01-01
  const to = searchParams.get("to");     // e.g. 2024-01-07

  if (!from || !to) {
    return NextResponse.json({ error: "Missing from/to params" }, { status: 400 });
  }

  try {
    const startMs = new Date(from + "T00:00:00Z").getTime();
    const endMs   = new Date(to   + "T23:59:59Z").getTime();

    // FUELHH /stream uses publishDateTimeFrom / publishDateTimeTo
    // For actuals, publishTime ≈ startTime, so we use the same window
    const publishFrom = new Date(startMs).toISOString();
    const publishTo   = new Date(endMs).toISOString();

    const url =
      `https://data.elexon.co.uk/bmrs/api/v1/datasets/FUELHH/stream` +
      `?publishDateTimeFrom=${encodeURIComponent(publishFrom)}` +
      `&publishDateTimeTo=${encodeURIComponent(publishTo)}` +
      `&fuelType=WIND`;

    console.log(`[actuals] GET ${url}`);

    const res = await fetch(url, { cache: "no-store" });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[actuals] upstream error ${res.status}: ${text}`);
      return NextResponse.json({ error: `Elexon returned ${res.status}`, detail: text }, { status: 502 });
    }

    const raw: unknown = await res.json();
    console.log(`[actuals] raw count: ${Array.isArray(raw) ? raw.length : "not array"}`);

    if (!Array.isArray(raw)) {
      return NextResponse.json({ error: "Unexpected response shape" }, { status: 502 });
    }

    const allData: ActualRecord[] = [];
    for (const record of raw as RawFuelRecord[]) {
      if (record.fuelType === "WIND" && record.startTime && record.generation != null) {
        const st = new Date(record.startTime).getTime();
        // Only keep records within our requested window
        if (st >= startMs && st <= endMs) {
          allData.push({ startTime: record.startTime, generation: record.generation });
        }
      }
    }

    allData.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

    console.log(`[actuals] returning ${allData.length} records`);
    return NextResponse.json(allData);

  } catch (err) {
    console.error("[actuals] exception:", err);
    return NextResponse.json({ error: "Failed to fetch actuals" }, { status: 500 });
  }
}

interface RawFuelRecord {
  fuelType: string;
  startTime: string;
  generation: number;
  [key: string]: unknown;
}

interface ActualRecord {
  startTime: string;
  generation: number;
}
