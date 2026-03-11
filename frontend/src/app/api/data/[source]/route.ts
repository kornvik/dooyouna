import { NextResponse } from "next/server";
import { fetchFlights } from "@/lib/fetchers/flights";
import { fetchEarthquakes } from "@/lib/fetchers/earthquakes";
import { fetchFires } from "@/lib/fetchers/fires";
import { fetchWeather } from "@/lib/fetchers/weather";
import { fetchNews } from "@/lib/fetchers/news";
import { fetchAirQuality } from "@/lib/fetchers/airQuality";
import { fetchFlood } from "@/lib/fetchers/flood";

const FETCHERS: Record<string, { fn: () => Promise<unknown>; revalidate: number }> = {
  flights:     { fn: fetchFlights,      revalidate: 60 },
  earthquakes: { fn: fetchEarthquakes,  revalidate: 1800 },
  fires:       { fn: fetchFires,        revalidate: 1800 },
  weather:     { fn: fetchWeather,      revalidate: 1800 },
  news:        { fn: fetchNews,         revalidate: 1800 },
  air_quality: { fn: fetchAirQuality,   revalidate: 1800 },
  flood:       { fn: fetchFlood,        revalidate: 1800 },
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ source: string }> }
) {
  const { source } = await params;
  const fetcher = FETCHERS[source];
  if (!fetcher) {
    return NextResponse.json({ error: "Unknown source" }, { status: 404 });
  }

  try {
    const data = await fetcher.fn();
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": `s-maxage=${fetcher.revalidate}, stale-while-revalidate`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
