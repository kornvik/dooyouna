import type { Aircraft, FlightData } from "@/types";

const ADSB_REGIONAL_URL =
  "https://api.adsb.lol/v2/lat/13.5/lon/102.5/dist/500";
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

function classifyFlights(aircraft: Aircraft[]): FlightData {
  const military: Aircraft[] = [];
  const privateJets: Aircraft[] = [];
  const commercial: Aircraft[] = [];

  for (const ac of aircraft) {
    if (isMilitary(ac)) {
      military.push(ac);
    } else if (isPrivate(ac)) {
      privateJets.push(ac);
    } else {
      commercial.push(ac);
    }
  }

  return {
    commercial,
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
    const flights = classifyFlights(regionalAircraft);

    const globalMilAircraft = mapToAircraft(milData.ac);
    const militaryFlights = globalMilAircraft.filter(isInBbox);

    return { flights, military_flights: militaryFlights };
  } catch (err) {
    console.error("fetchFlights failed:", err);
    return {
      flights: { commercial: [], military: [], private: [], total: 0 },
      military_flights: [],
    };
  }
}
