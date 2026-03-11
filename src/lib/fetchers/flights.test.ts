import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchFlights, isDomestic } from "./flights";
import type { Aircraft } from "@/types";

const mockRegionalResponse = {
  ac: [
    {
      hex: "abc123",
      flight: "THA101 ",
      lat: 13.5,
      lon: 100.5,
      alt_baro: 35000,
      gs: 450,
      track: 180,
      squawk: "1234",
      t: "B77W",
      r: "HS-TKA",
      category: "A5",
      dbFlags: 0,
    },
    {
      hex: "mil001",
      flight: "RTAF01 ",
      lat: 14.0,
      lon: 101.0,
      alt_baro: 20000,
      gs: 300,
      track: 90,
      squawk: "7700",
      t: "F16",
      r: "RTAF-001",
      category: "A2",
      dbFlags: 1,
    },
    {
      hex: "pvt001",
      flight: "GLX01  ",
      lat: 13.8,
      lon: 100.6,
      alt_baro: 40000,
      gs: 500,
      track: 270,
      squawk: "5555",
      t: "GLEX",
      r: "VP-BPJ",
      category: "A3",
      dbFlags: 0,
    },
  ],
};

const mockMilResponse = {
  ac: [
    {
      hex: "milglob1",
      flight: "FORTE10",
      lat: 10.0,
      lon: 100.0,
      alt_baro: 55000,
      gs: 350,
      track: 45,
      squawk: "0000",
      t: "GLHK",
      r: "AF-001",
      category: "A5",
      dbFlags: 1,
    },
    {
      hex: "milglob2",
      flight: "NATO01 ",
      lat: 50.0,
      lon: 10.0,
      alt_baro: 30000,
      gs: 400,
      track: 120,
      squawk: "1111",
      t: "E3CF",
      r: "NATO-01",
      category: "A5",
      dbFlags: 1,
    },
  ],
};

function createFetchMock(
  regionalResponse: unknown = mockRegionalResponse,
  milResponse: unknown = mockMilResponse,
) {
  let callCount = 0;
  return vi.fn(async (url: string) => {
    callCount++;
    const isRegional = url.includes("lat/13.5");
    const body = isRegional ? regionalResponse : milResponse;
    return {
      ok: true,
      json: async () => body,
    } as Response;
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

function makeAircraft(overrides: Partial<Aircraft> = {}): Aircraft {
  return {
    hex: "test",
    callsign: "",
    lat: 13.5,
    lon: 100.5,
    alt: 35000,
    speed: 450,
    heading: 180,
    squawk: "",
    type: "B738",
    registration: "",
    ...overrides,
  };
}

describe("isDomestic", () => {
  it("returns true for HS- prefix registration", () => {
    expect(isDomestic(makeAircraft({ registration: "HS-TKA" }))).toBe(true);
  });

  it("returns true for THA callsign prefix", () => {
    expect(isDomestic(makeAircraft({ callsign: "THA101" }))).toBe(true);
  });

  it("returns true for AIQ callsign prefix", () => {
    expect(isDomestic(makeAircraft({ callsign: "AIQ320" }))).toBe(true);
  });

  it("returns true for NOK callsign prefix", () => {
    expect(isDomestic(makeAircraft({ callsign: "NOK456" }))).toBe(true);
  });

  it("returns false for foreign aircraft", () => {
    expect(isDomestic(makeAircraft({ registration: "9V-SMA", callsign: "SIA321" }))).toBe(false);
  });

  it("returns false for empty callsign and registration", () => {
    expect(isDomestic(makeAircraft({ callsign: "", registration: "" }))).toBe(false);
  });
});

describe("fetchFlights", () => {
  it("classifies domestic, international, military, and private aircraft correctly", async () => {
    vi.stubGlobal("fetch", createFetchMock());

    const result = await fetchFlights();

    // HS-TKA registration -> domestic
    expect(result.flights.domestic).toHaveLength(1);
    expect(result.flights.domestic[0].hex).toBe("abc123");

    expect(result.flights.military).toHaveLength(1);
    expect(result.flights.military[0].hex).toBe("mil001");

    expect(result.flights.private).toHaveLength(1);
    expect(result.flights.private[0].hex).toBe("pvt001");

    expect(result.flights.total).toBe(3);
  });

  it("filters global military flights to SE Asia bbox", async () => {
    vi.stubGlobal("fetch", createFetchMock());

    const result = await fetchFlights();

    // milglob1 is at lat=10, lon=100 -> inside bbox
    // milglob2 is at lat=50, lon=10 -> outside bbox
    expect(result.military_flights).toHaveLength(1);
    expect(result.military_flights[0].hex).toBe("milglob1");
  });

  it("trims callsign whitespace", async () => {
    vi.stubGlobal("fetch", createFetchMock());

    const result = await fetchFlights();

    expect(result.flights.domestic[0].callsign).toBe("THA101");
    expect(result.flights.military[0].callsign).toBe("RTAF01");
  });

  it("filters out aircraft without lat/lon", async () => {
    const responseWithMissing = {
      ac: [
        { hex: "no_pos", flight: "NOPOS", t: "B738" },
        {
          hex: "has_pos",
          flight: "HASPOS",
          lat: 13.5,
          lon: 100.5,
          t: "B738",
          dbFlags: 0,
        },
      ],
    };
    vi.stubGlobal("fetch", createFetchMock(responseWithMissing));

    const result = await fetchFlights();

    expect(result.flights.total).toBe(1);
    expect(result.flights.international[0].hex).toBe("has_pos");
  });

  it("handles empty response gracefully", async () => {
    vi.stubGlobal("fetch", createFetchMock({ ac: [] }, { ac: [] }));

    const result = await fetchFlights();

    expect(result.flights.domestic).toHaveLength(0);
    expect(result.flights.international).toHaveLength(0);
    expect(result.flights.military).toHaveLength(0);
    expect(result.flights.private).toHaveLength(0);
    expect(result.flights.total).toBe(0);
    expect(result.military_flights).toHaveLength(0);
  });

  it("handles missing ac field in response", async () => {
    vi.stubGlobal("fetch", createFetchMock({}, {}));

    const result = await fetchFlights();

    expect(result.flights.total).toBe(0);
    expect(result.military_flights).toHaveLength(0);
  });

  it("returns fallback on network error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("Network error");
      }),
    );

    const result = await fetchFlights();

    expect(result.flights.total).toBe(0);
    expect(result.military_flights).toHaveLength(0);
  });

  it("handles partial failure (regional fails, military succeeds)", async () => {
    let callCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        callCount++;
        if (url.includes("lat/13.5")) {
          throw new Error("Regional endpoint down");
        }
        return {
          ok: true,
          json: async () => mockMilResponse,
        } as Response;
      }),
    );

    const result = await fetchFlights();

    expect(result.flights.total).toBe(0);
    expect(result.military_flights).toHaveLength(1);
  });

  it("sends correct User-Agent header", async () => {
    const mockFetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ac: [] }),
    })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", mockFetch);

    await fetchFlights();

    expect(mockFetch).toHaveBeenCalledTimes(2);
    for (const call of mockFetch.mock.calls) {
      const options = call[1] as RequestInit;
      expect(options.headers).toEqual(
        expect.objectContaining({ "User-Agent": "DooYouNa-OSINT/1.0" }),
      );
    }
  });

  it("classifies all private jet types correctly", async () => {
    const privateTypes = [
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
    ];

    const response = {
      ac: privateTypes.map((t, i) => ({
        hex: `pvt${i}`,
        flight: `PVT${i}`,
        lat: 13.5,
        lon: 100.5,
        t,
        dbFlags: 0,
      })),
    };

    vi.stubGlobal("fetch", createFetchMock(response, { ac: [] }));

    const result = await fetchFlights();

    expect(result.flights.private).toHaveLength(privateTypes.length);
    expect(result.flights.domestic).toHaveLength(0);
    expect(result.flights.international).toHaveLength(0);
    expect(result.flights.military).toHaveLength(0);
  });

  it("military flag takes priority over private type", async () => {
    const response = {
      ac: [
        {
          hex: "milpvt",
          flight: "MILPVT",
          lat: 13.5,
          lon: 100.5,
          t: "GLEX",
          dbFlags: 1,
        },
      ],
    };

    vi.stubGlobal("fetch", createFetchMock(response, { ac: [] }));

    const result = await fetchFlights();

    // dbFlags=1 means military, even if type is GLEX (private)
    expect(result.flights.military).toHaveLength(1);
    expect(result.flights.private).toHaveLength(0);
  });

  it("deduplicates military flights that appear in both regional and global feeds", async () => {
    const dupeHex = "mil001";
    const regionalWithMil = {
      ac: [
        {
          hex: dupeHex,
          flight: "RTAF01 ",
          lat: 14.0,
          lon: 101.0,
          alt_baro: 20000,
          gs: 300,
          track: 90,
          t: "F16",
          r: "RTAF-001",
          dbFlags: 1,
        },
      ],
    };
    const globalWithSameMil = {
      ac: [
        {
          hex: dupeHex,
          flight: "RTAF01",
          lat: 14.0,
          lon: 101.0,
          alt_baro: 20000,
          gs: 300,
          track: 90,
          t: "F16",
          r: "RTAF-001",
          dbFlags: 1,
        },
        {
          hex: "unique_mil",
          flight: "FORTE10",
          lat: 10.0,
          lon: 100.0,
          alt_baro: 55000,
          gs: 350,
          track: 45,
          t: "GLHK",
          r: "AF-001",
          dbFlags: 1,
        },
      ],
    };

    vi.stubGlobal("fetch", createFetchMock(regionalWithMil, globalWithSameMil));

    const result = await fetchFlights();

    // mil001 should be in flights.military from regional
    expect(result.flights.military).toHaveLength(1);
    expect(result.flights.military[0].hex).toBe(dupeHex);

    // military_flights should only have unique_mil (not the duplicate)
    expect(result.military_flights).toHaveLength(1);
    expect(result.military_flights[0].hex).toBe("unique_mil");
  });

  it("handles non-numeric alt_baro", async () => {
    const response = {
      ac: [
        {
          hex: "ground",
          flight: "GND01",
          lat: 13.5,
          lon: 100.5,
          alt_baro: "ground",
          t: "B738",
          dbFlags: 0,
        },
      ],
    };

    vi.stubGlobal("fetch", createFetchMock(response, { ac: [] }));

    const result = await fetchFlights();

    expect(result.flights.international[0].alt).toBe(0);
  });

  it("classifies T7-GTS as private (not separate VIP)", async () => {
    const response = {
      ac: [
        {
          hex: "vip001",
          flight: "GTS01  ",
          lat: 13.5,
          lon: 100.5,
          alt_baro: 45000,
          gs: 500,
          track: 90,
          t: "GL7T",
          r: "T7-GTS",
          dbFlags: 0,
        },
      ],
    };

    vi.stubGlobal("fetch", createFetchMock(response, { ac: [] }));

    const result = await fetchFlights();

    expect(result.flights.private).toHaveLength(1);
    expect(result.flights.private[0].registration).toBe("T7-GTS");
  });
});
