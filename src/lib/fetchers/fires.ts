import type { FireHotspot } from "@/types";

const FIRES_URL =
  "https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-20-viirs-c2/csv/J1_VIIRS_C2_SouthEast_Asia_24h.csv";

const REGION_BBOX = {
  minLat: 5.5,
  maxLat: 20.5,
  minLon: 97.3,
  maxLon: 107.7,
};


function parseCsvLine(line: string): string[] {
  return line.split(",");
}

function isInRegion(lat: number, lon: number): boolean {
  return (
    lat >= REGION_BBOX.minLat &&
    lat <= REGION_BBOX.maxLat &&
    lon >= REGION_BBOX.minLon &&
    lon <= REGION_BBOX.maxLon
  );
}

export async function fetchFires(): Promise<FireHotspot[]> {
  try {
    const resp = await fetch(FIRES_URL, {
      signal: AbortSignal.timeout(30_000),
      headers: { "User-Agent": "DooYouNa-OSINT/1.0" },
    });

    if (!resp.ok) return [];

    const text = await resp.text();
    const lines = text.trim().split("\n");
    if (lines.length < 2) return [];

    const headers = parseCsvLine(lines[0]);
    const latIdx = headers.indexOf("latitude");
    const lonIdx = headers.indexOf("longitude");
    const frpIdx = headers.indexOf("frp");

    if (latIdx === -1 || lonIdx === -1) return [];

    const result: FireHotspot[] = [];

    for (let i = 1; i < lines.length; i++) {
      const fields = parseCsvLine(lines[i]);
      try {
        const lat = parseFloat(fields[latIdx]);
        const lon = parseFloat(fields[lonIdx]);

        if (isNaN(lat) || isNaN(lon)) continue;
        if (!isInRegion(lat, lon)) continue;

        const entry: FireHotspot = { lat, lon };
        if (frpIdx >= 0 && fields[frpIdx] !== undefined) {
          const frp = parseFloat(fields[frpIdx]);
          if (!isNaN(frp)) entry.frp = frp;
        }
        result.push(entry);
      } catch {
        continue;
      }
    }

    result.sort((a, b) => (b.frp ?? 0) - (a.frp ?? 0));
    return result;
  } catch {
    return [];
  }
}
