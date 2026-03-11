import type { RegionDossier, CountryInfo, WikipediaSummary } from "@/types";

const FETCH_TIMEOUT_MS = 10_000;
const USER_AGENT = "DooYouNa-OSINT/1.0";

async function fetchWithTimeout(
  url: string,
  headers?: Record<string, string>,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT, ...headers },
    });
  } finally {
    clearTimeout(timeout);
  }
}

interface GeoAddress {
  city?: string;
  town?: string;
  village?: string;
  state?: string;
  country?: string;
  country_code?: string;
}

interface GeoResponse {
  display_name?: string;
  address?: GeoAddress;
}

async function reverseGeocode(
  lat: number,
  lon: number,
): Promise<{
  location: string;
  city: string;
  state: string;
  country: string;
  country_code: string;
} | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=10`;
    const response = await fetchWithTimeout(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = (await response.json()) as GeoResponse;
    const address = data.address ?? {};

    return {
      location: data.display_name ?? "",
      city: address.city ?? address.town ?? address.village ?? "",
      state: address.state ?? "",
      country: address.country ?? "",
      country_code: (address.country_code ?? "").toUpperCase(),
    };
  } catch (err) {
    console.error("Reverse geocode error:", err);
    return null;
  }
}

async function fetchCountryInfo(
  countryCode: string,
): Promise<CountryInfo | null> {
  if (!countryCode) return null;

  try {
    const url = `https://restcountries.com/v3.1/alpha/${countryCode}`;
    const response = await fetchWithTimeout(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const raw = await response.json();
    const data = Array.isArray(raw) ? raw[0] : raw;

    const currencies: Record<string, string> = {};
    const rawCurrencies = data.currencies ?? {};
    for (const [code, info] of Object.entries(rawCurrencies)) {
      currencies[code] = (info as { name?: string }).name ?? "";
    }

    return {
      name: data.name?.common ?? "",
      official_name: data.name?.official ?? "",
      capital: data.capital ?? [],
      population: data.population ?? 0,
      area: data.area ?? 0,
      languages: data.languages ?? {},
      currencies,
      flag: data.flags?.svg ?? "",
      borders: data.borders ?? [],
      region: data.subregion ?? data.region ?? "",
    };
  } catch (err) {
    console.error("Country info error:", err);
    return null;
  }
}

async function fetchWikipedia(
  placeName: string,
): Promise<WikipediaSummary | null> {
  if (!placeName) return null;

  try {
    const encoded = encodeURIComponent(placeName);
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`;
    const response = await fetchWithTimeout(url);

    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    return {
      title: data.title ?? "",
      extract: data.extract ?? "",
      thumbnail: data.thumbnail?.source ?? "",
    };
  } catch (err) {
    console.error("Wikipedia error:", err);
    return null;
  }
}

export async function fetchRegionDossier(
  lat: number,
  lon: number,
): Promise<RegionDossier> {
  const result: RegionDossier = { lat, lon };

  // Step 1: Reverse geocode to get location context
  const geo = await reverseGeocode(lat, lon);

  if (!geo) return result;

  result.location = geo.location;
  result.city = geo.city;
  result.state = geo.state;
  result.country = geo.country;
  result.country_code = geo.country_code;

  // Step 2: Fetch country info and Wikipedia in parallel
  const wikiName = geo.city || geo.state || geo.country;

  const [countryInfo, wikipedia] = await Promise.all([
    fetchCountryInfo(geo.country_code),
    fetchWikipedia(wikiName),
  ]);

  if (countryInfo) result.country_info = countryInfo;
  result.wikipedia = wikipedia;

  return result;
}
