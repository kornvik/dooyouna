import type { Aircraft, FlightData } from "@/types";
const ADSB_REGIONAL_URL =
  "https://api.adsb.lol/v2/lat/13.5/lon/102.5/dist/800";
const ADSB_MIL_URL = "https://api.adsb.lol/v2/mil";
const FETCH_TIMEOUT_MS = 15_000;
const USER_AGENT = "DooYouNa-OSINT/1.0";

const BBOX = {
  latMin: 5.5,
  latMax: 20.5,
  lonMin: 97.3,
  lonMax: 107.7,
} as const;

const PRIVATE_TYPES = new Set([
  "GLEX",
  "G650",
  "GLF6",
  "GLF5",
  "GL7T",
  "CL60",
  "CL35",
  "LJ45",
  "LJ75",
  "FA7X",
  "FA8X",
  "FA50",
  "E55P",
  "C68A",
  "H25B",
]);

interface AdsbResponse {
  ac?: Array<{
    hex?: string;
    flight?: string;
    lat?: number;
    lon?: number;
    alt_baro?: number | string;
    gs?: number;
    track?: number;
    squawk?: string;
    t?: string;
    r?: string;
    category?: string;
    dbFlags?: number;
  }>;
}

function mapToAircraft(raw: AdsbResponse["ac"]): Aircraft[] {
  if (!raw) return [];

  return raw
    .filter((ac) => ac.lat != null && ac.lon != null)
    .map((ac) => ({
      hex: ac.hex ?? "",
      callsign: (ac.flight ?? "").trim(),
      lat: ac.lat!,
      lon: ac.lon!,
      alt: typeof ac.alt_baro === "number" ? ac.alt_baro : 0,
      speed: ac.gs ?? 0,
      heading: ac.track ?? 0,
      squawk: ac.squawk ?? "",
      type: ac.t ?? "",
      registration: ac.r ?? "",
      category: ac.category,
      dbFlags: ac.dbFlags,
    }));
}

function isInBbox(ac: Aircraft): boolean {
  return (
    ac.lat >= BBOX.latMin &&
    ac.lat <= BBOX.latMax &&
    ac.lon >= BBOX.lonMin &&
    ac.lon <= BBOX.lonMax
  );
}

function isMilitary(ac: Aircraft): boolean {
  return ((ac.dbFlags ?? 0) & 1) !== 0;
}

function isPrivate(ac: Aircraft): boolean {
  return PRIVATE_TYPES.has(ac.type);
}

const THAI_ICAO_CODES = new Set([
  "THA", "AIQ", "NOK", "TDM", "BKP", "SLC", "TVJ",
]);

/** Guess-based: Thai airline or HS- registration */
export function isDomesticGuess(ac: Aircraft): boolean {
  if (ac.registration.startsWith("HS-")) return true;
  const prefix = ac.callsign.slice(0, 3);
  return prefix.length === 3 && THAI_ICAO_CODES.has(prefix);
}

// --- OpenSky route cache (persists in-memory across requests) ---
const routeCache = new Map<string, { domestic: boolean; route: string[]; ts: number }>();
const ROUTE_CACHE_TTL = 24 * 60 * 60 * 1000; // 24h
const MAX_LOOKUPS_PER_POLL = 25;

/** Check if a route is domestic (both airports in Thailand = VT prefix) */
function isRouteDomestic(route: string[]): boolean {
  if (route.length < 2) return false;
  return route[0].startsWith("VT") && route[1].startsWith("VT");
}

/** Look up route for a single callsign via OpenSky (free, no key) */
async function lookupRoute(callsign: string): Promise<{ domestic: boolean; route: string[] } | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(
      `https://opensky-network.org/api/routes?callsign=${encodeURIComponent(callsign)}`,
      { signal: controller.signal, headers: { "User-Agent": USER_AGENT } },
    );
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json();
    const route: string[] = data.route || [];
    if (route.length < 2) return null;
    return { domestic: isRouteDomestic(route), route };
  } catch {
    return null;
  }
}

/** Enrich flights with real route data. Lazy: only looks up uncached callsigns. */
async function enrichWithRoutes(aircraft: Aircraft[]): Promise<void> {
  const now = Date.now();
  // Clean expired entries
  for (const [key, val] of routeCache) {
    if (now - val.ts > ROUTE_CACHE_TTL) routeCache.delete(key);
  }

  const uncached = aircraft
    .filter((ac) => ac.callsign && !routeCache.has(ac.callsign))
    .slice(0, MAX_LOOKUPS_PER_POLL);

  if (uncached.length === 0) return;

  const results = await Promise.allSettled(
    uncached.map(async (ac) => {
      const result = await lookupRoute(ac.callsign);
      if (result) {
        routeCache.set(ac.callsign, { ...result, ts: now });
      }
    }),
  );
  // ignore failures silently
  void results;
}

/** Determine if a flight is domestic — uses route cache if available, falls back to guess */
export function isDomestic(ac: Aircraft): boolean {
  const cached = routeCache.get(ac.callsign);
  if (cached) return cached.domestic;
  return isDomesticGuess(ac);
}

export type FlightDirection = "domestic" | "inbound" | "outbound" | "unknown";

/** Classify flight direction using route cache */
export function getFlightDirection(ac: Aircraft): FlightDirection {
  const cached = routeCache.get(ac.callsign);
  if (!cached || cached.route.length < 2) return "unknown";
  const originTH = cached.route[0].startsWith("VT");
  const destTH = cached.route[1].startsWith("VT");
  if (originTH && destTH) return "domestic";
  if (!originTH && destTH) return "inbound";
  if (originTH && !destTH) return "outbound";
  return "unknown"; // transit
}

function classifyFlights(aircraft: Aircraft[]): FlightData {
  const military: Aircraft[] = [];
  const privateJets: Aircraft[] = [];
  const domestic: Aircraft[] = [];
  const international: Aircraft[] = [];

  for (const ac of aircraft) {
    if (isMilitary(ac)) {
      military.push(ac);
    } else if (isPrivate(ac)) {
      privateJets.push(ac);
    } else if (isDomestic(ac)) {
      domestic.push(ac);
    } else {
      international.push(ac);
    }
  }

  return {
    domestic,
    international,
    military,
    private: privateJets,
    total: aircraft.length,
  };
}

async function fetchWithTimeout(url: string): Promise<AdsbResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return (await response.json()) as AdsbResponse;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchFlights(): Promise<{
  flights: FlightData;
  military_flights: Aircraft[];
}> {
  try {
    const [regionalData, milData] = await Promise.all([
      fetchWithTimeout(ADSB_REGIONAL_URL).catch((err) => {
        console.error("Failed to fetch regional flights:", err);
        return { ac: [] } as AdsbResponse;
      }),
      fetchWithTimeout(ADSB_MIL_URL).catch((err) => {
        console.error("Failed to fetch military flights:", err);
        return { ac: [] } as AdsbResponse;
      }),
    ]);

    const regionalAircraft = mapToAircraft(regionalData.ac);

    // Lazy-enrich with real route data (non-blocking, fills cache over time)
    await enrichWithRoutes(regionalAircraft);

    const flights = classifyFlights(regionalAircraft);

    const globalMilAircraft = mapToAircraft(milData.ac);
    const militaryFlights = globalMilAircraft.filter(isInBbox);

    // Deduplicate: remove global military aircraft already present in regional feed
    const regionalMilHexes = new Set(flights.military.map((ac) => ac.hex));
    const uniqueGlobalMil = militaryFlights.filter(
      (ac) => !regionalMilHexes.has(ac.hex),
    );

    return { flights, military_flights: uniqueGlobalMil };
  } catch (err) {
    console.error("fetchFlights failed:", err);
    return {
      flights: { domestic: [], international: [], military: [], private: [], total: 0 },
      military_flights: [],
    };
  }
}
