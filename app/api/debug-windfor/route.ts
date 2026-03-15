import { NextResponse } from "next/server";

// Hit this in your browser to see exactly what Elexon returns for WINDFOR:
// http://localhost:3000/api/debug-windfor
export async function GET() {
  const publishFrom = "2024-01-01T00:00:00Z";
  const publishTo   = "2024-01-02T00:00:00Z";

  const url =
    `https://data.elexon.co.uk/bmrs/api/v1/datasets/WINDFOR/stream` +
    `?publishDateTimeFrom=${encodeURIComponent(publishFrom)}` +
    `&publishDateTimeTo=${encodeURIComponent(publishTo)}`;

  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();

  return new NextResponse(text, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
