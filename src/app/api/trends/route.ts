import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

/**
 * GET /api/trends?source=fires&days=30
 * Returns daily values for sparkline charts.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const source = searchParams.get("source");
  const days = Math.min(Number(searchParams.get("days") || 30), 365);

  if (!source) {
    return NextResponse.json({ error: "source param required" }, { status: 400 });
  }

  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("daily_snapshots")
    .select("date, value, metadata")
    .eq("source", source)
    .eq("region", "")
    .gte("date", since)
    .order("date", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? [], {
    headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate" },
  });
}
