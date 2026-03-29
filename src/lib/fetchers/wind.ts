export interface WindPoint {
  lat: number;
  lon: number;
  speed: number; // km/h
  direction: number; // degrees (meteorological: where wind comes FROM)
}

// Generate uniform grid covering Thailand bbox (lat 5.5–20.5, lon 97.3–107.7)
// ~1.5° spacing ≈ 77 points for much better interpolation accuracy
function generateGrid(): { lat: number; lon: number }[] {
  const points: { lat: number; lon: number }[] = [];
  for (let lat = 6; lat <= 20; lat += 1.5) {
    for (let lon = 98; lon <= 107; lon += 1.5) {
      points.push({ lat, lon });
    }
  }
  return points;
}

const GRID_POINTS = generateGrid();

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
