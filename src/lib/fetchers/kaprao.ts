import type { KapraoRestaurant } from "@/types";

const API_KEY = process.env.GOOGLE_PLACES_API_KEY || "";
const SEARCH_RADIUS = 15_000; // 15km
const KEYWORD = "ข้าวกะเพรา อาหารตามสั่ง";
const FETCH_TIMEOUT_MS = 10_000;

// Grid of major Thai cities/towns to search around
const SEARCH_POINTS: [number, number][] = [
  [13.75, 100.52],  // Bangkok
  [13.85, 100.60],  // Bangkok East
  [13.65, 100.45],  // Bangkok West
  [18.79, 98.98],   // Chiang Mai
  [18.29, 99.49],   // Lamphun/Lampang area
  [14.97, 102.10],  // Nakhon Ratchasima (Korat)
  [16.43, 102.83],  // Khon Kaen
  [7.88, 98.39],    // Phuket
  [9.14, 99.33],    // Surat Thani
  [12.93, 100.89],  // Pattaya
  [14.35, 100.57],  // Ayutthaya
  [17.00, 99.82],   // Phitsanulok
  [15.23, 104.86],  // Ubon Ratchathani
  [8.43, 99.96],    // Nakhon Si Thammarat
  [6.87, 100.47],   // Hat Yai
  [14.80, 100.62],  // Lop Buri
  [13.36, 99.97],   // Nakhon Pathom
  [12.57, 99.96],   // Hua Hin
];

interface PlacesResponse {
  results?: Array<{
    name?: string;
    geometry?: { location?: { lat: number; lng: number } };
    price_level?: number;
    rating?: number;
    user_ratings_total?: number;
    vicinity?: string;
  }>;
  status?: string;
}

async function searchNearby(lat: number, lon: number): Promise<KapraoRestaurant[]> {
  if (!API_KEY) return [];

  const url = new URL("https://maps.googleapis.com/maps/api/place/nearbysearch/json");
  url.searchParams.set("location", `${lat},${lon}`);
  url.searchParams.set("radius", String(SEARCH_RADIUS));
  url.searchParams.set("type", "restaurant");
  url.searchParams.set("keyword", KEYWORD);
  url.searchParams.set("key", API_KEY);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url.toString(), { signal: controller.signal });
    if (!res.ok) return [];
    const data = (await res.json()) as PlacesResponse;
    if (data.status !== "OK" || !data.results) return [];

    return data.results
      .filter((r) => r.geometry?.location && r.price_level != null)
      .map((r) => ({
        name: r.name || "",
        lat: r.geometry!.location!.lat,
        lon: r.geometry!.location!.lng,
        priceLevel: r.price_level!,
        rating: r.rating ?? 0,
        totalRatings: r.user_ratings_total ?? 0,
        vicinity: r.vicinity || "",
      }));
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchKaprao(): Promise<KapraoRestaurant[]> {
  if (!API_KEY) {
    console.warn("GOOGLE_PLACES_API_KEY not set, skipping kaprao index");
    return [];
  }

  // Fetch all search points in parallel (batched to avoid rate limits)
  const BATCH_SIZE = 5;
  const allResults: KapraoRestaurant[] = [];

  for (let i = 0; i < SEARCH_POINTS.length; i += BATCH_SIZE) {
    const batch = SEARCH_POINTS.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(([lat, lon]) => searchNearby(lat, lon))
    );
    for (const r of results) allResults.push(...r);
  }

  // Deduplicate by name+location (same restaurant might appear in overlapping searches)
  const seen = new Set<string>();
  return allResults.filter((r) => {
    const key = `${r.name}|${r.lat.toFixed(4)}|${r.lon.toFixed(4)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
