import type { WeatherData } from "@/types";

const WEATHER_URL = "https://api.rainviewer.com/public/weather-maps.json";

const EMPTY_WEATHER: WeatherData = { radar: [], host: "" };

interface RainViewerFrame {
  path: string;
}

interface RainViewerResponse {
  host: string;
  radar: {
    past: RainViewerFrame[];
  };
}

export async function fetchWeather(): Promise<WeatherData> {
  try {
    const resp = await fetch(WEATHER_URL, {
      signal: AbortSignal.timeout(15_000),
      headers: { "User-Agent": "DooYouNa-OSINT/1.0" },
    });

    if (!resp.ok) return EMPTY_WEATHER;

    const data: RainViewerResponse = await resp.json();

    const radarPaths = (data.radar?.past ?? []).map(
      (frame) => frame.path,
    );
    const host = data.host ?? "";

    return { radar: radarPaths, host };
  } catch {
    return EMPTY_WEATHER;
  }
}
