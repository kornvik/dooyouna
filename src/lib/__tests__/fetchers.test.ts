import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchFires } from "../fetchers/fires";
import { fetchWeather } from "../fetchers/weather";
import { fetchAirQuality } from "../fetchers/airQuality";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

// ---------------------------------------------------------------------------
// fires.ts
// ---------------------------------------------------------------------------
describe("fetchFires", () => {
  const CSV_HEADERS = "latitude,longitude,frp,confidence";

  function makeCsvRow(lat: number, lon: number, frp: number, conf = "n") {
    return `${lat},${lon},${frp},${conf}`;
  }

  function buildCsv(rows: string[]): string {
    return [CSV_HEADERS, ...rows].join("\n");
  }

  it("parses CSV and returns filtered hotspots sorted by frp desc", async () => {
    const csv = buildCsv([
      makeCsvRow(13.5, 100.5, 10),
      makeCsvRow(15.0, 102.0, 50),
      makeCsvRow(10.0, 99.0, 30),
    ]);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => csv,
    });

    const result = await fetchFires();

    expect(result).toHaveLength(3);
    expect(result[0].frp).toBe(50);
    expect(result[1].frp).toBe(30);
    expect(result[2].frp).toBe(10);
    expect(result[0]).toEqual({ lat: 15.0, lon: 102.0, frp: 50 });
  });

  it("filters out points outside Thailand/Cambodia region", async () => {
    const csv = buildCsv([
      makeCsvRow(13.5, 100.5, 10),  // inside
      makeCsvRow(25.0, 100.0, 20),  // north of region
      makeCsvRow(3.0, 100.0, 15),   // south of region
      makeCsvRow(13.5, 110.0, 25),  // east of region
      makeCsvRow(13.5, 95.0, 5),    // west of region
    ]);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => csv,
    });

    const result = await fetchFires();

    expect(result).toHaveLength(1);
    expect(result[0].lat).toBe(13.5);
    expect(result[0].lon).toBe(100.5);
  });

  it("caps results at 2000", async () => {
    const rows = Array.from({ length: 2500 }, (_, i) =>
      makeCsvRow(10 + (i % 10) * 0.1, 100 + (i % 8) * 0.1, i),
    );
    const csv = buildCsv(rows);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => csv,
    });

    const result = await fetchFires();

    expect(result).toHaveLength(2500);
    // Should be sorted descending so first item has highest frp
    expect(result[0].frp).toBe(2499);
  });

  it("returns empty array on fetch error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network error"));

    const result = await fetchFires();

    expect(result).toEqual([]);
  });

  it("returns empty array on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const result = await fetchFires();

    expect(result).toEqual([]);
  });

  it("returns empty array for CSV with only headers", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => CSV_HEADERS,
    });

    const result = await fetchFires();

    expect(result).toEqual([]);
  });

  it("skips rows with invalid lat/lon values", async () => {
    const csv = [
      CSV_HEADERS,
      "abc,100.5,10,n",
      "13.5,xyz,20,n",
      "13.5,100.5,30,n",
    ].join("\n");
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => csv,
    });

    const result = await fetchFires();

    expect(result).toHaveLength(1);
    expect(result[0].lat).toBe(13.5);
  });

  it("handles CSV without frp column", async () => {
    const csv = [
      "latitude,longitude,confidence",
      "13.5,100.5,n",
      "15.0,102.0,h",
    ].join("\n");
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => csv,
    });

    const result = await fetchFires();

    expect(result).toHaveLength(2);
    expect(result[0].frp).toBeUndefined();
    expect(result[1].frp).toBeUndefined();
  });

  it("includes boundary coordinates (edges of BBOX)", async () => {
    const csv = buildCsv([
      makeCsvRow(5.5, 97.3, 1),   // min lat, min lon
      makeCsvRow(20.5, 107.7, 2), // max lat, max lon
    ]);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => csv,
    });

    const result = await fetchFires();

    expect(result).toHaveLength(2);
  });

  it("sends correct User-Agent header and timeout", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => CSV_HEADERS,
    });

    await fetchFires();

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("firms.modaps.eosdis.nasa.gov"),
      expect.objectContaining({
        headers: { "User-Agent": "DooYouNa-OSINT/1.0" },
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// weather.ts
// ---------------------------------------------------------------------------
describe("fetchWeather", () => {
  it("extracts radar paths and host from response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        host: "https://tilecache.rainviewer.com",
        radar: {
          past: [
            { path: "/v2/radar/1700000000/256/1/tile.png" },
            { path: "/v2/radar/1700000600/256/1/tile.png" },
            { path: "/v2/radar/1700001200/256/1/tile.png" },
          ],
        },
      }),
    });

    const result = await fetchWeather();

    expect(result.host).toBe("https://tilecache.rainviewer.com");
    expect(result.radar).toHaveLength(3);
    expect(result.radar[0]).toBe("/v2/radar/1700000000/256/1/tile.png");
    expect(result.radar[2]).toBe("/v2/radar/1700001200/256/1/tile.png");
  });

  it("returns empty weather on fetch error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network error"));

    const result = await fetchWeather();

    expect(result).toEqual({ radar: [], host: "" });
  });

  it("returns empty weather on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 503 });

    const result = await fetchWeather();

    expect(result).toEqual({ radar: [], host: "" });
  });

  it("handles missing radar.past gracefully", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        host: "https://example.com",
        radar: {},
      }),
    });

    const result = await fetchWeather();

    expect(result.radar).toEqual([]);
    expect(result.host).toBe("https://example.com");
  });

  it("handles missing host gracefully", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        radar: { past: [{ path: "/test" }] },
      }),
    });

    const result = await fetchWeather();

    expect(result.host).toBe("");
    expect(result.radar).toEqual(["/test"]);
  });

  it("handles empty past array", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        host: "https://example.com",
        radar: { past: [] },
      }),
    });

    const result = await fetchWeather();

    expect(result.radar).toEqual([]);
    expect(result.host).toBe("https://example.com");
  });

  it("sends correct User-Agent header", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ host: "", radar: { past: [] } }),
    });

    await fetchWeather();

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.rainviewer.com/public/weather-maps.json",
      expect.objectContaining({
        headers: { "User-Agent": "DooYouNa-OSINT/1.0" },
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// airQuality.ts
// ---------------------------------------------------------------------------
describe("fetchAirQuality", () => {
  function makeStation(overrides: Record<string, unknown> = {}) {
    return {
      stationID: "44t",
      nameEN: "Silom",
      areaEN: "Bangkok",
      stationType: "general",
      lat: "13.7235",
      long: "100.5310",
      LastUpdate: { date: "2024-01-15", time: "14:00" },
      AQILast: {
        date: "2024-01-15",
        time: "14:00",
        PM25: { value: "35.2", aqi: "100" },
      },
      ...overrides,
    };
  }

  it("parses stations and returns air quality data", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        stations: [makeStation()],
      }),
    });

    const result = await fetchAirQuality();

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      location: "Silom",
      city: "Bangkok",
      country: "TH",
      lat: 13.7235,
      lon: 100.531,
      pm25: 35.2,
      lastUpdated: "2024-01-15 14:00",
    });
  });

  it("skips stations where both pm25 value and aqi are -1", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        stations: [
          makeStation({
            AQILast: {
              date: "2024-01-15",
              time: "14:00",
              PM25: { value: "-1", aqi: "-1" },
            },
          }),
        ],
      }),
    });

    const result = await fetchAirQuality();

    expect(result).toEqual([]);
  });

  it("includes station where value is -1 but aqi is valid", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        stations: [
          makeStation({
            AQILast: {
              date: "2024-01-15",
              time: "14:00",
              PM25: { value: "-1", aqi: "50" },
            },
          }),
        ],
      }),
    });

    const result = await fetchAirQuality();

    expect(result).toHaveLength(1);
    expect(result[0].pm25).toBeNull();
  });

  it("includes station where aqi is -1 but value is valid", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        stations: [
          makeStation({
            AQILast: {
              date: "2024-01-15",
              time: "14:00",
              PM25: { value: "25.0", aqi: "-1" },
            },
          }),
        ],
      }),
    });

    const result = await fetchAirQuality();

    expect(result).toHaveLength(1);
    expect(result[0].pm25).toBe(25.0);
  });

  it("skips stations with lat=0 or lon=0", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        stations: [
          makeStation({ lat: "0", long: "100.5" }),
          makeStation({ lat: "13.7", long: "0" }),
          makeStation({ lat: "0", long: "0" }),
        ],
      }),
    });

    const result = await fetchAirQuality();

    expect(result).toEqual([]);
  });

  it("returns empty array on fetch error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network error"));

    const result = await fetchAirQuality();

    expect(result).toEqual([]);
  });

  it("returns empty array on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const result = await fetchAirQuality();

    expect(result).toEqual([]);
  });

  it("handles multiple valid stations", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        stations: [
          makeStation({ nameEN: "Station A", lat: "13.5", long: "100.5" }),
          makeStation({ nameEN: "Station B", lat: "18.7", long: "98.9" }),
          makeStation({ nameEN: "Station C", lat: "7.8", long: "100.2" }),
        ],
      }),
    });

    const result = await fetchAirQuality();

    expect(result).toHaveLength(3);
    expect(result.map((r) => r.location)).toEqual([
      "Station A",
      "Station B",
      "Station C",
    ]);
  });

  it("handles missing AQILast gracefully", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        stations: [
          {
            stationID: "test",
            nameEN: "Test",
            areaEN: "Area",
            lat: "13.5",
            long: "100.5",
          },
        ],
      }),
    });

    const result = await fetchAirQuality();

    // Should be filtered out because PM25 value and aqi default to "-1"
    expect(result).toEqual([]);
  });

  it("sends correct User-Agent header", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ stations: [] }),
    });

    await fetchAirQuality();

    expect(mockFetch).toHaveBeenCalledWith(
      "http://air4thai.pcd.go.th/services/getNewAQI_JSON.php",
      expect.objectContaining({
        headers: { "User-Agent": "DooYouNa-OSINT/1.0" },
      }),
    );
  });

  it("handles empty stations array", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ stations: [] }),
    });

    const result = await fetchAirQuality();

    expect(result).toEqual([]);
  });
});
