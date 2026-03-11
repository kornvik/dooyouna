import { NextResponse } from "next/server";
import { fetchEarthquakes } from "@/lib/fetchers/earthquakes";
import { fetchFires } from "@/lib/fetchers/fires";
import { fetchWeather } from "@/lib/fetchers/weather";
import { fetchNews } from "@/lib/fetchers/news";
import { fetchAirQuality } from "@/lib/fetchers/airQuality";
import { fetchFlood } from "@/lib/fetchers/flood";

export const revalidate = 1800;

export async function GET() {
  try {
    const [earthquakes, fires, weather, news, air_quality, flood] =
      await Promise.all([
        fetchEarthquakes(),
        fetchFires(),
        fetchWeather(),
        fetchNews(),
        fetchAirQuality(),
        fetchFlood(),
      ]);

    const now = new Date().toISOString();

    return NextResponse.json({
      earthquakes,
      fires,
      weather,
      news,
      air_quality,
      ships: [],
      flood,
      updated: {
        earthquakes: now,
        fires: now,
        weather: now,
        news: now,
        air_quality: now,
        flood: now,
      },
    });
  } catch (err) {
    console.error("GET /api/live-data/slow failed:", err);
    return NextResponse.json(
      { error: "Failed to fetch slow live data" },
      { status: 500 },
    );
  }
}
