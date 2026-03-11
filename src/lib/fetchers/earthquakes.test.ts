import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchEarthquakes } from "./earthquakes";

const mockUsgsResponse = {
  features: [
    {
      id: "eq001",
      properties: {
        mag: 5.2,
        place: "123km SSE of Bangkok, Thailand",
        time: 1710000000000,
        url: "https://earthquake.usgs.gov/earthquakes/eventpage/eq001",
      },
      geometry: {
        coordinates: [100.5, 13.5, 10.0], // [lon, lat, depth]
      },
    },
    {
      id: "eq002",
      properties: {
        mag: 6.1,
        place: "50km N of Jakarta, Indonesia",
        time: 1710001000000,
        url: "https://earthquake.usgs.gov/earthquakes/eventpage/eq002",
      },
      geometry: {
        coordinates: [106.8, 5.5, 25.0],
      },
    },
    {
      id: "eq003",
      properties: {
        mag: 7.0,
        place: "Mid-Atlantic Ridge",
        time: 1710002000000,
        url: "https://earthquake.usgs.gov/earthquakes/eventpage/eq003",
      },
      geometry: {
        coordinates: [-30.0, 15.0, 50.0], // outside SE Asia bbox
      },
    },
    {
      id: "eq004",
      properties: {
        mag: 4.5,
        place: "Northern Japan",
        time: 1710003000000,
        url: "https://earthquake.usgs.gov/earthquakes/eventpage/eq004",
      },
      geometry: {
        coordinates: [140.0, 38.0, 30.0], // outside bbox (lon > 115)
      },
    },
  ],
};

function createFetchMock(response: unknown = mockUsgsResponse) {
  return vi.fn(async () => ({
    ok: true,
    json: async () => response,
  })) as unknown as typeof fetch;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("fetchEarthquakes", () => {
  it("filters earthquakes to SE Asia bbox and maps correctly", async () => {
    vi.stubGlobal("fetch", createFetchMock());

    const result = await fetchEarthquakes();

    // eq001 (lon=100.5, lat=13.5) and eq002 (lon=106.8, lat=5.5) are inside
    // eq003 (lon=-30, lat=15) and eq004 (lon=140, lat=38) are outside
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("eq001");
    expect(result[1].id).toBe("eq002");
  });

  it("maps USGS GeoJSON to Earthquake type correctly", async () => {
    vi.stubGlobal("fetch", createFetchMock());

    const result = await fetchEarthquakes();
    const eq = result[0];

    expect(eq).toEqual({
      id: "eq001",
      lat: 13.5,
      lon: 100.5,
      depth: 10.0,
      magnitude: 5.2,
      place: "123km SSE of Bangkok, Thailand",
      time: 1710000000000,
      url: "https://earthquake.usgs.gov/earthquakes/eventpage/eq001",
    });
  });

  it("returns empty array on network error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("Network error");
      }),
    );

    const result = await fetchEarthquakes();

    expect(result).toEqual([]);
  });

  it("returns empty array on HTTP error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      })),
    );

    const result = await fetchEarthquakes();

    expect(result).toEqual([]);
  });

  it("returns empty array when no earthquakes in SE Asia", async () => {
    const response = {
      features: [
        {
          id: "outside",
          properties: { mag: 3.0, place: "Alaska", time: 0, url: "" },
          geometry: { coordinates: [-150, 60, 10] },
        },
      ],
    };

    vi.stubGlobal("fetch", createFetchMock(response));

    const result = await fetchEarthquakes();

    expect(result).toEqual([]);
  });

  it("handles empty features array", async () => {
    vi.stubGlobal("fetch", createFetchMock({ features: [] }));

    const result = await fetchEarthquakes();

    expect(result).toEqual([]);
  });

  it("includes earthquakes exactly on bbox boundary", async () => {
    const response = {
      features: [
        {
          id: "boundary",
          properties: { mag: 3.0, place: "On boundary", time: 0, url: "" },
          geometry: { coordinates: [90, 0, 5] }, // exact corner: lon=90, lat=0
        },
      ],
    };

    vi.stubGlobal("fetch", createFetchMock(response));

    const result = await fetchEarthquakes();

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("boundary");
  });

  it("excludes earthquakes just outside bbox", async () => {
    const response = {
      features: [
        {
          id: "just_outside_lon",
          properties: { mag: 3.0, place: "Outside", time: 0, url: "" },
          geometry: { coordinates: [115.1, 12, 5] }, // lon just > 115
        },
        {
          id: "just_outside_lat",
          properties: { mag: 3.0, place: "Outside", time: 0, url: "" },
          geometry: { coordinates: [100, -0.1, 5] }, // lat just < 0
        },
      ],
    };

    vi.stubGlobal("fetch", createFetchMock(response));

    const result = await fetchEarthquakes();

    expect(result).toEqual([]);
  });

  it("sends correct User-Agent header", async () => {
    const mockFetch = createFetchMock();
    vi.stubGlobal("fetch", mockFetch);

    await fetchEarthquakes();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const options = mockFetch.mock.calls[0][1] as RequestInit;
    expect(options.headers).toEqual(
      expect.objectContaining({ "User-Agent": "DooYouNa-OSINT/1.0" }),
    );
  });

  it("passes an AbortSignal for timeout support", async () => {
    const mockFetch = createFetchMock();
    vi.stubGlobal("fetch", mockFetch);

    await fetchEarthquakes();

    const options = mockFetch.mock.calls[0][1] as RequestInit;
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });
});
