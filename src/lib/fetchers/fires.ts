import type { FireHotspot } from "@/types";

const FIRES_URLS = [
  "https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-20-viirs-c2/csv/J1_VIIRS_C2_SouthEast_Asia_24h.csv",
  "https://firms.modaps.eosdis.nasa.gov/data/active_fire/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_SouthEast_Asia_24h.csv",
  "https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-21-viirs-c2/csv/J2_VIIRS_C2_SouthEast_Asia_24h.csv",
  "https://firms.modaps.eosdis.nasa.gov/data/active_fire/modis-c6.1/csv/MODIS_C6_1_SouthEast_Asia_24h.csv",
];

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

export function parseFirmsCsv(text: string): FireHotspot[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]);
  const latIdx = headers.indexOf("latitude");
  const lonIdx = headers.indexOf("longitude");
  const frpIdx = headers.indexOf("frp");
  const confidenceIdx = headers.indexOf("confidence");
  const acqTimeIdx = headers.indexOf("acq_time");
  const acqDateIdx = headers.indexOf("acq_date");

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

      if (confidenceIdx >= 0 && fields[confidenceIdx] !== undefined) {
        const val = fields[confidenceIdx].trim();
        if (val) entry.confidence = val;
      }

      if (acqTimeIdx >= 0 && fields[acqTimeIdx] !== undefined) {
        const raw = fields[acqTimeIdx].trim();
        if (raw) {
          const padded = raw.padStart(4, "0");
          entry.acq_time = `${padded.slice(0, 2)}:${padded.slice(2, 4)}`;
        }
      }

      if (acqDateIdx >= 0 && fields[acqDateIdx] !== undefined) {
        const val = fields[acqDateIdx].trim();
        if (val) entry.acq_date = val;
      }

      result.push(entry);
    } catch {
      continue;
    }
  }

  return result;
}

export function deduplicateHotspots(all: FireHotspot[]): FireHotspot[] {
  const sorted = [...all].sort((a, b) => (b.frp ?? 0) - (a.frp ?? 0));
  const kept: FireHotspot[] = [];
  for (const pt of sorted) {
    const isDupe = kept.some(
      (k) =>
        Math.abs(k.lat - pt.lat) < 0.005 &&
        Math.abs(k.lon - pt.lon) < 0.005
    );
    if (!isDupe) kept.push(pt);
  }
  return kept;
}

export async function fetchFires(): Promise<FireHotspot[]> {
  try {
    const results = await Promise.allSettled(
      FIRES_URLS.map((url) =>
        fetch(url, {
          signal: AbortSignal.timeout(30_000),
          headers: { "User-Agent": "DooYouNa-OSINT/1.0" },
        })
      )
    );

    const allHotspots: FireHotspot[] = [];

    for (const result of results) {
      if (result.status !== "fulfilled") continue;
      const resp = result.value;
      if (!resp.ok) continue;

      try {
        const text = await resp.text();
        const hotspots = parseFirmsCsv(text);
        allHotspots.push(...hotspots);
      } catch {
        continue;
      }
    }

    const deduplicated = deduplicateHotspots(allHotspots);
    deduplicated.sort((a, b) => (b.frp ?? 0) - (a.frp ?? 0));
    return deduplicated;
  } catch {
    return [];
  }
}
