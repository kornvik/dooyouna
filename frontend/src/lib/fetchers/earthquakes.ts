import type { Earthquake } from "@/types";

const USGS_URL =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson";
const FETCH_TIMEOUT_MS = 15_000;
const USER_AGENT = "DooYouNa-OSINT/1.0";

const BBOX = {
  latMin: 0,
  latMax: 25,
  lonMin: 90,
  lonMax: 115,
} as const;

interface UsgsFeature {
  id: string;
  properties: {
    mag: number;
    place: string;
    time: number;
    url: string;
  };
  geometry: {
    coordinates: [number, number, number]; // [lon, lat, depth]
  };
}

interface UsgsResponse {
  features: UsgsFeature[];
}

function isInSeAsiaBbox(lon: number, lat: number): boolean {
  return (
    lat >= BBOX.latMin &&
    lat <= BBOX.latMax &&
    lon >= BBOX.lonMin &&
    lon <= BBOX.lonMax
  );
}

function mapToEarthquake(feature: UsgsFeature): Earthquake {
  const [lon, lat, depth] = feature.geometry.coordinates;
  return {
    id: feature.id,
    lat,
    lon,
    depth,
    magnitude: feature.properties.mag,
    place: feature.properties.place,
    time: feature.properties.time,
    url: feature.properties.url,
  };
}

export async function fetchEarthquakes(): Promise<Earthquake[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(USGS_URL, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = (await response.json()) as UsgsResponse;

    return data.features
      .filter((f) => {
        const [lon, lat] = f.geometry.coordinates;
        return isInSeAsiaBbox(lon, lat);
      })
      .map(mapToEarthquake);
  } catch (err) {
    console.error("fetchEarthquakes failed:", err);
    return [];
  } finally {
    clearTimeout(timeout);
  }
}
