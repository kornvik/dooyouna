export interface WindPoint {
  lat: number;
  lon: number;
  speed: number; // km/h
  direction: number; // degrees (meteorological: where wind comes FROM)
}

// Grid of points across Thailand/region for wind sampling
const GRID_POINTS = [
  { lat: 19.5, lon: 99.0 },  // Chiang Mai
  { lat: 18.0, lon: 100.5 }, // Lampang/Phrae
  { lat: 17.0, lon: 104.0 }, // Nakhon Phanom
  { lat: 15.0, lon: 100.5 }, // Central
  { lat: 14.0, lon: 100.5 }, // Bangkok area
  { lat: 13.75, lon: 100.5 },// Bangkok
  { lat: 12.5, lon: 102.0 }, // Eastern
  { lat: 9.0, lon: 99.0 },   // Southern
  { lat: 7.5, lon: 100.5 },  // Deep south
  { lat: 16.0, lon: 103.0 }, // Isan
  { lat: 13.0, lon: 105.0 }, // Cambodia border
  { lat: 20.0, lon: 100.0 }, // Chiang Rai
];

export async function fetchWind(): Promise<WindPoint[]> {
  try {
    const lats = GRID_POINTS.map((p) => p.lat).join(",");
    const lons = GRID_POINTS.map((p) => p.lon).join(",");

    const resp = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&current=wind_speed_10m,wind_direction_10m`,
      { signal: AbortSignal.timeout(10_000) },
    );

    if (!resp.ok) return [];

    const data = await resp.json();

    // Open-Meteo returns array when multiple coordinates
    const results: WindPoint[] = [];
    if (Array.isArray(data)) {
      for (let i = 0; i < data.length; i++) {
        const d = data[i];
        results.push({
          lat: GRID_POINTS[i].lat,
          lon: GRID_POINTS[i].lon,
          speed: d.current?.wind_speed_10m ?? 0,
          direction: d.current?.wind_direction_10m ?? 0,
        });
      }
    } else if (data.current) {
      // Single point response
      results.push({
        lat: GRID_POINTS[0].lat,
        lon: GRID_POINTS[0].lon,
        speed: data.current.wind_speed_10m ?? 0,
        direction: data.current.wind_direction_10m ?? 0,
      });
    }

    return results;
  } catch {
    return [];
  }
}
