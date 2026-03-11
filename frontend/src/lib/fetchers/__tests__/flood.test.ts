import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchFlood } from "../flood";

function makeStation(overrides: Record<string, unknown> = {}) {
  return {
    station: {
      tele_station_lat: 13.75,
      tele_station_long: 100.5,
      tele_station_name: { en: "Station A", th: "สถานี A" },
      province_name: { en: "Bangkok", th: "กรุงเทพ" },
    },
    geocode: {
      province_name: { en: "Bangkok", th: "กรุงเทพ" },
    },
    basin: {
      basin_name: { en: "Chao Phraya" },
    },
    situation_level: 4,
    waterlevel_msl: 10.5,
    diff_wl_bank: 1.2,
    waterlevel_datetime: "2024-09-15 10:00",
    ...overrides,
  };
}

function mockApiResponse(items: unknown[]) {
  return {
    ok: true,
    json: vi.fn().mockResolvedValue({
      waterlevel_data: { data: items },
    }),
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("fetchFlood", () => {
  it("returns stations with situation_level >= 4", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockApiResponse([
          makeStation({ situation_level: 4 }),
          makeStation({ situation_level: 5 }),
        ]),
      ),
    );

    const stations = await fetchFlood();

    expect(stations).toHaveLength(2);
    expect(stations[0].situation_level).toBe(4);
    expect(stations[1].situation_level).toBe(5);
  });

  it("filters out stations with situation_level < 4", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockApiResponse([
          makeStation({ situation_level: 1 }),
          makeStation({ situation_level: 2 }),
          makeStation({ situation_level: 3 }),
          makeStation({ situation_level: 4 }),
        ]),
      ),
    );

    const stations = await fetchFlood();

    expect(stations).toHaveLength(1);
    expect(stations[0].situation_level).toBe(4);
  });

  it("maps fields correctly", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockApiResponse([makeStation()])),
    );

    const [station] = await fetchFlood();

    expect(station).toEqual({
      lat: 13.75,
      lon: 100.5,
      name: "Station A",
      name_th: "สถานี A",
      province: "Bangkok",
      province_th: "กรุงเทพ",
      basin: "Chao Phraya",
      water_level_msl: "10.5",
      situation_level: 4,
      bank_diff: "1.2",
      datetime: "2024-09-15 10:00",
      critical: false,
    });
  });

  it("marks situation_level >= 5 as critical", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockApiResponse([makeStation({ situation_level: 5 })]),
      ),
    );

    const [station] = await fetchFlood();

    expect(station.critical).toBe(true);
  });

  it("marks situation_level 4 as not critical", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockApiResponse([makeStation({ situation_level: 4 })]),
      ),
    );

    const [station] = await fetchFlood();

    expect(station.critical).toBe(false);
  });

  it("handles null water_level_msl", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockApiResponse([makeStation({ waterlevel_msl: null })]),
      ),
    );

    const [station] = await fetchFlood();

    expect(station.water_level_msl).toBeNull();
  });

  it("handles null diff_wl_bank", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockApiResponse([makeStation({ diff_wl_bank: null })]),
      ),
    );

    const [station] = await fetchFlood();

    expect(station.bank_diff).toBeNull();
  });

  it("skips stations with no lat/lon", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockApiResponse([
          makeStation({
            station: {
              tele_station_name: { en: "No coords" },
            },
          }),
        ]),
      ),
    );

    const stations = await fetchFlood();

    expect(stations).toHaveLength(0);
  });

  it("returns empty array on HTTP error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Server Error",
      }),
    );

    const stations = await fetchFlood();

    expect(stations).toEqual([]);
  });

  it("returns empty array on network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Network down")),
    );

    const stations = await fetchFlood();

    expect(stations).toEqual([]);
  });

  it("handles flat data structure (no waterlevel_data wrapper)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: [makeStation()],
        }),
      }),
    );

    const stations = await fetchFlood();

    expect(stations).toHaveLength(1);
  });

  it("converts water_level_msl number to string", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockApiResponse([makeStation({ waterlevel_msl: 42.7 })]),
      ),
    );

    const [station] = await fetchFlood();

    expect(station.water_level_msl).toBe("42.7");
    expect(typeof station.water_level_msl).toBe("string");
  });

  it("uses geocode province over station province", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockApiResponse([
          makeStation({
            station: {
              tele_station_lat: 14.0,
              tele_station_long: 100.0,
              tele_station_name: { en: "X" },
              province_name: { en: "Station Province" },
            },
            geocode: {
              province_name: { en: "Geocode Province" },
            },
          }),
        ]),
      ),
    );

    const [station] = await fetchFlood();

    expect(station.province).toBe("Geocode Province");
  });
});
