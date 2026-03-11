import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { fetchFlights, getFlightDirection } from "@/lib/fetchers/flights";
import { fetchEarthquakes } from "@/lib/fetchers/earthquakes";
import { fetchFires } from "@/lib/fetchers/fires";
import { fetchAirQuality } from "@/lib/fetchers/airQuality";
import { fetchFlood } from "@/lib/fetchers/flood";
import { fetchShips } from "@/lib/fetchers/ships";

type Row = {
  date: string;
  source: string;
  region: string | null;
  value: number;
  metadata: Record<string, unknown>;
};

/**
 * Reads today's existing row for a source to merge accumulated data.
 */
async function getExisting(date: string, source: string): Promise<Row | null> {
  const { data } = await supabaseAdmin
    .from("daily_snapshots")
    .select("*")
    .eq("date", date)
    .eq("source", source)
    .eq("region", "")
    .single();
  return data as Row | null;
}

/**
 * POST /api/snapshot
 *
 * Runs hourly via Vercel Cron. For flights and ships, accumulates unique
 * identifiers (hex/MMSI) throughout the day → daily total unique count.
 * For fires, stores the latest hourly count + tracks peak.
 * For AQ/earthquake/flood, stores latest value.
 */
export async function POST() {
  const today = new Date().toISOString().slice(0, 10);
  const hour = new Date().getUTCHours();
  const rows: Row[] = [];

  // Fetch all sources in parallel
  const [flights, earthquakes, fires, airQuality, flood, ships] =
    await Promise.allSettled([
      fetchFlights(),
      fetchEarthquakes(),
      fetchFires(),
      fetchAirQuality(),
      fetchFlood(),
      fetchShips(),
    ]);

  // --- Flights: accumulate unique callsigns (= flight legs) throughout the day ---
  if (flights.status === "fulfilled" && flights.value) {
    const f = flights.value;

    // For commercial flights: use callsign (counts flights, not planes)
    // For military/private: use hex (callsigns often empty/generic)
    const flightSources = [
      { source: "domestic_flights", aircraft: f.flights.domestic, useCallsign: true },
      { source: "international_flights", aircraft: f.flights.international, useCallsign: true },
      { source: "military_flights", aircraft: [...f.flights.military, ...f.military_flights], useCallsign: false },
      { source: "private_flights", aircraft: f.flights.private, useCallsign: false },
    ] as const;

    for (const { source, aircraft, useCallsign } of flightSources) {
      const getId = (a: { hex?: string; callsign?: string }) =>
        useCallsign ? (a.callsign || a.hex || "") : (a.hex || a.callsign || "");
      const currentIds = aircraft.map(getId).filter(Boolean);
      const existing = await getExisting(today, source);
      const prevSeen: string[] = (existing?.metadata?.seen_ids as string[]) || (existing?.metadata?.seen_hexes as string[]) || [];
      const allSeen = [...new Set([...prevSeen, ...currentIds])];

      // For international flights: add inbound/outbound breakdown
      const metadata: Record<string, unknown> = {
        seen_ids: allSeen,
        last_sample: currentIds.length,
        samples: ((existing?.metadata?.samples as number) || 0) + 1,
      };

      if (source === "international_flights") {
        let inbound = (existing?.metadata?.inbound as number) || 0;
        let outbound = (existing?.metadata?.outbound as number) || 0;
        for (const ac of aircraft) {
          const dir = getFlightDirection(ac);
          const id = getId(ac);
          // Only count newly seen flights for direction stats
          if (id && !new Set(prevSeen).has(id)) {
            if (dir === "inbound") inbound++;
            else if (dir === "outbound") outbound++;
          }
        }
        metadata.inbound = inbound;
        metadata.outbound = outbound;
      }

      rows.push({
        date: today, source, region: "",
        value: allSeen.length,
        metadata,
      });
    }

    // Total flights = unique callsigns/hexes across all categories
    const totalExisting = await getExisting(today, "total_flights");
    const prevTotal: string[] = (totalExisting?.metadata?.seen_ids as string[]) || (totalExisting?.metadata?.seen_hexes as string[]) || [];
    const allFlights = [
      ...f.flights.domestic, ...f.flights.international,
      ...f.flights.military, ...f.military_flights, ...f.flights.private,
    ];
    const allIds = allFlights.map((a) => a.callsign || a.hex || "").filter(Boolean);
    const totalSeen = [...new Set([...prevTotal, ...allIds])];
    rows.push({
      date: today, source: "total_flights", region: "",
      value: totalSeen.length,
      metadata: { seen_ids: totalSeen, samples: ((totalExisting?.metadata?.samples as number) || 0) + 1 },
    });
  }

  // --- Fires: store latest count + track peak + hourly history ---
  if (fires.status === "fulfilled" && fires.value) {
    const fireList = fires.value as Array<{ lat: number; lon: number }>;
    const existing = await getExisting(today, "fires");
    const prevPeak = (existing?.metadata?.peak as number) || 0;
    const prevHourly = (existing?.metadata?.hourly as Record<string, number>) || {};

    rows.push({
      date: today, source: "fires", region: "",
      value: Math.max(prevPeak, fireList.length),
      metadata: {
        peak: Math.max(prevPeak, fireList.length),
        latest: fireList.length,
        hourly: { ...prevHourly, [hour]: fireList.length },
        samples: ((existing?.metadata?.samples as number) || 0) + 1,
      },
    });

    // Regional breakdown
    const regions = { north: 0, central: 0, northeast: 0, south: 0 };
    for (const pt of fireList) {
      if (pt.lat > 15) {
        if (pt.lon > 102) regions.northeast++;
        else regions.north++;
      } else if (pt.lat > 10) {
        regions.central++;
      } else {
        regions.south++;
      }
    }
    for (const [region, count] of Object.entries(regions)) {
      rows.push({ date: today, source: "fires", region, value: count, metadata: {} });
    }
  }

  // --- Ships: accumulate unique MMSI throughout the day ---
  if (ships.status === "fulfilled" && ships.value) {
    const shipList = ships.value;
    const currentMMSI = shipList.map((s) => String(s.mmsi || "")).filter(Boolean);
    const existing = await getExisting(today, "ships");
    const prevSeen: string[] = (existing?.metadata?.seen_mmsi as string[]) || [];
    const allSeen = [...new Set([...prevSeen, ...currentMMSI])];

    rows.push({
      date: today, source: "ships", region: "",
      value: allSeen.length,
      metadata: { seen_mmsi: allSeen, last_sample: currentMMSI.length, samples: ((existing?.metadata?.samples as number) || 0) + 1 },
    });
  }

  // --- Earthquakes: latest count + max magnitude ---
  if (earthquakes.status === "fulfilled" && earthquakes.value) {
    const quakes = earthquakes.value;
    const maxMag = quakes.reduce((m: number, q: { magnitude?: number }) => Math.max(m, q.magnitude || 0), 0);
    rows.push({
      date: today, source: "earthquakes", region: "",
      value: quakes.length,
      metadata: { max_magnitude: maxMag },
    });
  }

  // --- Air quality: accumulate hourly PM2.5 readings for daily avg ---
  if (airQuality.status === "fulfilled" && airQuality.value) {
    const stations = airQuality.value as Array<{ pm25: number | null }>;
    const valid = stations.filter((s) => s.pm25 != null);
    const avg = valid.length > 0
      ? valid.reduce((sum, s) => sum + (s.pm25 || 0), 0) / valid.length
      : 0;
    const danger = valid.filter((s) => (s.pm25 || 0) > 75).length;
    const existing = await getExisting(today, "pm25_avg");
    const prevHourly = (existing?.metadata?.hourly as Record<string, number>) || {};
    const updatedHourly: Record<string, number> = { ...prevHourly, [hour]: Math.round(avg * 10) / 10 };
    const hourlyValues = Object.values(updatedHourly) as number[];
    const dailyAvg = hourlyValues.reduce((s: number, v: number) => s + v, 0) / hourlyValues.length;
    const peak = Math.max(...hourlyValues);

    rows.push({
      date: today, source: "pm25_avg", region: "",
      value: Math.round(dailyAvg * 10) / 10,
      metadata: {
        stations: valid.length, dangerous: danger,
        hourly: updatedHourly, peak: Math.round(peak * 10) / 10,
        samples: hourlyValues.length,
      },
    });
  }

  // --- Flood: latest count ---
  if (flood.status === "fulfilled" && flood.value) {
    const stations = flood.value as Array<{ critical?: boolean }>;
    const critical = stations.filter((s) => s.critical).length;
    rows.push({
      date: today, source: "flood", region: "",
      value: stations.length,
      metadata: { critical },
    });
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: "No data fetched" }, { status: 500 });
  }

  // Upsert (on conflict: update value + metadata)
  const { error } = await supabaseAdmin
    .from("daily_snapshots")
    .upsert(rows, { onConflict: "date,source,region" });

  if (error) {
    console.error("Snapshot upsert error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Cleanup old rows (>30 days)
  await supabaseAdmin
    .from("daily_snapshots")
    .delete()
    .lt("date", new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));

  return NextResponse.json({ ok: true, date: today, hour, rows: rows.length });
}
