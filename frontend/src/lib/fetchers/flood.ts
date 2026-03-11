import type { FloodStation } from "@/types";

const WATER_LEVEL_URL =
  "https://api-v3.thaiwater.net/api/v1/thaiwater30/public/waterlevel_load";
const FETCH_TIMEOUT_MS = 20_000;
const USER_AGENT = "DooYouNa-OSINT/1.0";
const MIN_SITUATION_LEVEL = 4;

interface StationName {
  en?: string;
  th?: string;
}

interface WaterLevelItem {
  station?: {
    tele_station_lat?: number;
    tele_station_long?: number;
    tele_station_name?: StationName;
    province_name?: StationName;
    basin_name?: StationName;
  };
  geocode?: {
    province_name?: StationName;
  };
  basin?: {
    basin_name?: StationName;
  };
  water_level_msl?: number | string | null;
  situation_level?: number;
  diff_wl_bank?: number | string | null;
  waterlevel_msl?: number | string | null;
  waterlevel_datetime?: string;
  datetime?: string;
}

interface WaterLevelResponse {
  waterlevel_data?: {
    data?: WaterLevelItem[];
  };
  data?: WaterLevelItem[];
}

function toStringOrNull(val: unknown): string | null {
  if (val == null) return null;
  return String(val);
}

function mapToFloodStation(item: WaterLevelItem): FloodStation | null {
  const station = item.station ?? {};
  const geocode = item.geocode ?? {};
  const lat = station.tele_station_lat;
  const lon = station.tele_station_long;

  if (lat == null || lon == null) return null;

  const situationLevel = item.situation_level ?? 3;
  const basinName =
    station.basin_name?.en ??
    item.basin?.basin_name?.en ??
    "";

  return {
    lat: Number(lat),
    lon: Number(lon),
    name: station.tele_station_name?.en ?? "",
    name_th: station.tele_station_name?.th ?? "",
    province: geocode.province_name?.en ?? station.province_name?.en ?? "",
    province_th: geocode.province_name?.th ?? station.province_name?.th ?? "",
    basin: basinName,
    water_level_msl: toStringOrNull(item.waterlevel_msl ?? item.water_level_msl),
    situation_level: situationLevel,
    bank_diff: toStringOrNull(item.diff_wl_bank),
    datetime: item.waterlevel_datetime ?? item.datetime ?? "",
    critical: situationLevel >= 5,
  };
}

export async function fetchFlood(): Promise<FloodStation[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(WATER_LEVEL_URL, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = (await response.json()) as WaterLevelResponse;

    const items =
      data.waterlevel_data?.data ?? data.data ?? [];

    const stations: FloodStation[] = [];

    for (const item of items) {
      try {
        const situationLevel = item.situation_level ?? 3;
        if (situationLevel < MIN_SITUATION_LEVEL) continue;

        const mapped = mapToFloodStation(item);
        if (mapped) stations.push(mapped);
      } catch {
        continue;
      }
    }

    return stations;
  } catch (err) {
    console.error("fetchFlood failed:", err);
    return [];
  } finally {
    clearTimeout(timeout);
  }
}
