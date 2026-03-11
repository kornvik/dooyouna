import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchRegionDossier } from "../dossier";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse";
const RESTCOUNTRIES_URL = "https://restcountries.com/v3.1/alpha/";
const WIKIPEDIA_URL = "https://en.wikipedia.org/api/rest_v1/page/summary/";

function mockGeoResponse() {
  return {
    display_name: "Bangkok, Thailand",
    address: {
      city: "Bangkok",
      state: "Bangkok",
      country: "Thailand",
      country_code: "th",
    },
  };
}

function mockCountryResponse() {
  return [
    {
      name: { common: "Thailand", official: "Kingdom of Thailand" },
      capital: ["Bangkok"],
      population: 69800000,
      area: 513120,
      languages: { tha: "Thai" },
      currencies: { THB: { name: "Thai baht", symbol: "฿" } },
      flags: { svg: "https://flags.example.com/th.svg" },
      borders: ["MMR", "LAO", "KHM", "MYS"],
      subregion: "South-Eastern Asia",
      region: "Asia",
    },
  ];
}

function mockWikipediaResponse() {
  return {
    title: "Bangkok",
    extract: "Bangkok is the capital of Thailand.",
    thumbnail: { source: "https://upload.example.com/bangkok.jpg" },
  };
}

function setupFetchMock(overrides: {
  geo?: unknown;
  country?: unknown;
  wiki?: unknown;
  geoStatus?: number;
  countryStatus?: number;
  wikiStatus?: number;
} = {}) {
  const geo = overrides.geo ?? mockGeoResponse();
  const country = overrides.country ?? mockCountryResponse();
  const wiki = overrides.wiki ?? mockWikipediaResponse();

  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((url: string) => {
      if (url.startsWith(NOMINATIM_URL)) {
        return Promise.resolve({
          ok: (overrides.geoStatus ?? 200) === 200,
          status: overrides.geoStatus ?? 200,
          statusText: "OK",
          json: () => Promise.resolve(geo),
        });
      }
      if (url.startsWith(RESTCOUNTRIES_URL)) {
        return Promise.resolve({
          ok: (overrides.countryStatus ?? 200) === 200,
          status: overrides.countryStatus ?? 200,
          statusText: "OK",
          json: () => Promise.resolve(country),
        });
      }
      if (url.startsWith(WIKIPEDIA_URL)) {
        return Promise.resolve({
          ok: (overrides.wikiStatus ?? 200) === 200,
          status: overrides.wikiStatus ?? 200,
          statusText: overrides.wikiStatus === 404 ? "Not Found" : "OK",
          json: () => Promise.resolve(wiki),
        });
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    }),
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("fetchRegionDossier", () => {
  it("returns full dossier with all 3 sources", async () => {
    setupFetchMock();

    const result = await fetchRegionDossier(13.75, 100.5);

    expect(result.lat).toBe(13.75);
    expect(result.lon).toBe(100.5);
    expect(result.location).toBe("Bangkok, Thailand");
    expect(result.city).toBe("Bangkok");
    expect(result.country).toBe("Thailand");
    expect(result.country_code).toBe("TH");
  });

  it("maps country info correctly", async () => {
    setupFetchMock();

    const result = await fetchRegionDossier(13.75, 100.5);

    expect(result.country_info).toBeDefined();
    expect(result.country_info!.name).toBe("Thailand");
    expect(result.country_info!.official_name).toBe("Kingdom of Thailand");
    expect(result.country_info!.capital).toEqual(["Bangkok"]);
    expect(result.country_info!.population).toBe(69800000);
    expect(result.country_info!.currencies).toEqual({ THB: "Thai baht" });
    expect(result.country_info!.flag).toBe("https://flags.example.com/th.svg");
    expect(result.country_info!.borders).toEqual(["MMR", "LAO", "KHM", "MYS"]);
    expect(result.country_info!.region).toBe("South-Eastern Asia");
  });

  it("maps wikipedia summary correctly", async () => {
    setupFetchMock();

    const result = await fetchRegionDossier(13.75, 100.5);

    expect(result.wikipedia).toBeDefined();
    expect(result.wikipedia!.title).toBe("Bangkok");
    expect(result.wikipedia!.extract).toBe("Bangkok is the capital of Thailand.");
    expect(result.wikipedia!.thumbnail).toBe("https://upload.example.com/bangkok.jpg");
  });

  it("returns partial data when reverse geocode fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Network error")),
    );

    const result = await fetchRegionDossier(13.75, 100.5);

    expect(result).toEqual({ lat: 13.75, lon: 100.5 });
    expect(result.country_info).toBeUndefined();
    expect(result.wikipedia).toBeUndefined();
  });

  it("returns partial data when country API fails", async () => {
    setupFetchMock({ countryStatus: 500 });

    const result = await fetchRegionDossier(13.75, 100.5);

    expect(result.location).toBe("Bangkok, Thailand");
    expect(result.country_info).toBeUndefined();
    expect(result.wikipedia).toBeDefined();
  });

  it("sets wikipedia to null when 404", async () => {
    setupFetchMock({ wikiStatus: 404 });

    const result = await fetchRegionDossier(13.75, 100.5);

    expect(result.wikipedia).toBeNull();
    expect(result.country_info).toBeDefined();
  });

  it("uses town when city is absent", async () => {
    setupFetchMock({
      geo: {
        display_name: "Some Town, Thailand",
        address: {
          town: "Nakhon Nayok",
          country: "Thailand",
          country_code: "th",
        },
      },
    });

    const result = await fetchRegionDossier(14.2, 101.2);

    expect(result.city).toBe("Nakhon Nayok");
  });

  it("uses village when city and town are absent", async () => {
    setupFetchMock({
      geo: {
        display_name: "Remote Village, Thailand",
        address: {
          village: "Ban Na",
          country: "Thailand",
          country_code: "th",
        },
      },
    });

    const result = await fetchRegionDossier(14.5, 101.0);

    expect(result.city).toBe("Ban Na");
  });

  it("uppercases country code", async () => {
    setupFetchMock({
      geo: {
        display_name: "Phnom Penh, Cambodia",
        address: {
          city: "Phnom Penh",
          country: "Cambodia",
          country_code: "kh",
        },
      },
    });

    const result = await fetchRegionDossier(11.55, 104.92);

    expect(result.country_code).toBe("KH");
  });

  it("uses User-Agent header on all requests", async () => {
    setupFetchMock();
    const fetchSpy = vi.mocked(global.fetch);

    await fetchRegionDossier(13.75, 100.5);

    // Should have made 3 calls total (geocode + country + wiki)
    expect(fetchSpy).toHaveBeenCalledTimes(3);

    for (const call of fetchSpy.mock.calls) {
      const options = call[1] as RequestInit;
      const headers = options.headers as Record<string, string>;
      expect(headers["User-Agent"]).toBe("DooYouNa-OSINT/1.0");
    }
  });

  it("handles country data as single object (not array)", async () => {
    const singleCountry = mockCountryResponse()[0];
    setupFetchMock({ country: singleCountry });

    const result = await fetchRegionDossier(13.75, 100.5);

    expect(result.country_info).toBeDefined();
    expect(result.country_info!.name).toBe("Thailand");
  });

  it("skips Wikipedia when only country-level location available", async () => {
    setupFetchMock({
      geo: {
        display_name: "Middle of nowhere",
        address: {
          country: "Thailand",
          country_code: "th",
        },
      },
    });
    const fetchSpy = vi.mocked(global.fetch);

    const result = await fetchRegionDossier(10.0, 100.0);

    // Wikipedia should NOT be called at all
    const wikiCall = fetchSpy.mock.calls.find(
      (c) => (c[0] as string).includes("wikipedia"),
    );
    expect(wikiCall).toBeUndefined();
    expect(result.wikipedia).toBeNull();
  });

  it("filters out generic country Wikipedia article", async () => {
    setupFetchMock({
      geo: {
        display_name: "Ban Huai Pong, Thailand",
        address: {
          village: "Ban Huai Pong",
          state: "Kanchanaburi",
          country: "Thailand",
          country_code: "th",
        },
      },
      wiki: {
        title: "Thailand",
        extract:
          "Thailand, officially the Kingdom of Thailand, is a country in Southeast Asia.",
        thumbnail: { source: "https://upload.example.com/thailand.jpg" },
      },
    });

    const result = await fetchRegionDossier(14.0, 99.5);

    // Generic Thailand article should be filtered out
    expect(result.wikipedia).toBeNull();
  });

  it("keeps specific city Wikipedia article", async () => {
    setupFetchMock({
      geo: {
        display_name: "Chiang Mai, Thailand",
        address: {
          city: "Chiang Mai",
          state: "Chiang Mai",
          country: "Thailand",
          country_code: "th",
        },
      },
      wiki: {
        title: "Chiang Mai",
        extract:
          "Chiang Mai is a city in mountainous northern Thailand.",
        thumbnail: { source: "https://upload.example.com/chiangmai.jpg" },
      },
    });

    const result = await fetchRegionDossier(18.8, 98.98);

    expect(result.wikipedia).toBeDefined();
    expect(result.wikipedia!.title).toBe("Chiang Mai");
    expect(result.wikipedia!.extract).toContain("Chiang Mai");
  });
});
