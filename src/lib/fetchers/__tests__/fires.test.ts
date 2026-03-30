import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fetchFires,
  parseFirmsCsv,
  deduplicateHotspots,
} from "@/lib/fetchers/fires";

const CSV_HEADER =
  "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,confidence,version,bright_ti5,frp,daynight";

function makeCsvRow(overrides: {
  lat?: number;
  lon?: number;
  frp?: number;
  confidence?: string;
  acq_date?: string;
  acq_time?: string;
}): string {
  const {
    lat = 14.5,
    lon = 100.5,
    frp = 12.3,
    confidence = "nominal",
    acq_date = "2026-03-30",
    acq_time = "0642",
  } = overrides;
  return `${lat},${lon},310.5,0.39,0.36,${acq_date},${acq_time},N,${confidence},2.0NRT,290.1,${frp},D`;
}

function makeCsv(
  rows: Parameters<typeof makeCsvRow>[0][] = [{}]
): string {
  return [CSV_HEADER, ...rows.map(makeCsvRow)].join("\n");
}

function mockFetchResponses(
  responses: Array<{ ok: boolean; text?: string } | "reject">
) {
  const fetchMock = vi.fn();
  responses.forEach((r) => {
    if (r === "reject") {
      fetchMock.mockRejectedValueOnce(new Error("Network error"));
    } else {
      fetchMock.mockResolvedValueOnce({
        ok: r.ok,
        text: () => Promise.resolve(r.text ?? ""),
      });
    }
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("parseFirmsCsv", () => {
  it("parses a valid CSV with all fields", () => {
    const csv = makeCsv([{
      lat: 15.0, lon: 100.0, frp: 42.5,
      confidence: "high", acq_date: "2026-03-30", acq_time: "1430",
    }]);
    const result = parseFirmsCsv(csv);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      lat: 15.0, lon: 100.0, frp: 42.5,
      confidence: "high", acq_time: "14:30", acq_date: "2026-03-30",
    });
  });

  it("formats acq_time with leading zero padding (642 → 06:42)", () => {
    const csv = makeCsv([{ acq_time: "642" }]);
    const result = parseFirmsCsv(csv);
    expect(result[0].acq_time).toBe("06:42");
  });

  it("filters out points outside Thailand region bbox", () => {
    const csv = makeCsv([
      { lat: 15.0, lon: 100.0 },
      { lat: 1.0, lon: 100.0 },
      { lat: 15.0, lon: 120.0 },
    ]);
    expect(parseFirmsCsv(csv)).toHaveLength(1);
  });

  it("skips rows with invalid lat/lon", () => {
    const raw = [CSV_HEADER, "abc,100.0,310,0.39,0.36,2026-03-30,0642,N,nominal,2.0NRT,290.1,10,D"].join("\n");
    expect(parseFirmsCsv(raw)).toHaveLength(0);
  });

  it("returns empty array for header-only CSV", () => {
    expect(parseFirmsCsv(CSV_HEADER)).toHaveLength(0);
  });

  it("returns empty array for empty string", () => {
    expect(parseFirmsCsv("")).toHaveLength(0);
  });

  it("returns empty array when lat/lon columns missing", () => {
    expect(parseFirmsCsv("col_a,col_b\n1,2")).toHaveLength(0);
  });

  it("handles rows missing optional fields", () => {
    const result = parseFirmsCsv("latitude,longitude\n14.5,100.5");
    expect(result).toHaveLength(1);
    expect(result[0].frp).toBeUndefined();
    expect(result[0].confidence).toBeUndefined();
    expect(result[0].acq_time).toBeUndefined();
  });
});

describe("deduplicateHotspots", () => {
  it("removes nearby duplicates, keeps highest FRP", () => {
    const result = deduplicateHotspots([
      { lat: 15.0, lon: 100.0, frp: 10 },
      { lat: 15.003, lon: 100.003, frp: 50 },
      { lat: 15.004, lon: 100.004, frp: 30 },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].frp).toBe(50);
  });

  it("keeps distinct far-apart hotspots", () => {
    const result = deduplicateHotspots([
      { lat: 15.0, lon: 100.0, frp: 10 },
      { lat: 16.0, lon: 101.0, frp: 20 },
    ]);
    expect(result).toHaveLength(2);
  });

  it("handles points without FRP", () => {
    const result = deduplicateHotspots([
      { lat: 15.0, lon: 100.0 },
      { lat: 15.003, lon: 100.003, frp: 5 },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].frp).toBe(5);
  });

  it("returns empty for empty input", () => {
    expect(deduplicateHotspots([])).toEqual([]);
  });

  it("checks lat AND lon independently", () => {
    const result = deduplicateHotspots([
      { lat: 15.0, lon: 100.0, frp: 10 },
      { lat: 15.001, lon: 100.01, frp: 20 },
    ]);
    expect(result).toHaveLength(2);
  });
});

describe("fetchFires", () => {
  it("fetches from all 4 URLs and merges results", async () => {
    const fetchMock = mockFetchResponses([
      { ok: true, text: makeCsv([{ lat: 15, lon: 100, frp: 10 }]) },
      { ok: true, text: makeCsv([{ lat: 16, lon: 101, frp: 20 }]) },
      { ok: true, text: makeCsv([{ lat: 17, lon: 102, frp: 30 }]) },
      { ok: true, text: makeCsv([{ lat: 18, lon: 103, frp: 40 }]) },
    ]);
    const result = await fetchFires();
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(result).toHaveLength(4);
    expect(result[0].frp).toBe(40);
  });

  it("deduplicates across satellite sources", async () => {
    mockFetchResponses([
      { ok: true, text: makeCsv([{ lat: 15, lon: 100, frp: 10 }]) },
      { ok: true, text: makeCsv([{ lat: 15.002, lon: 100.002, frp: 25 }]) },
      { ok: true, text: makeCsv([{ lat: 18, lon: 103, frp: 5 }]) },
      { ok: true, text: makeCsv([]) },
    ]);
    const result = await fetchFires();
    expect(result).toHaveLength(2);
    expect(result[0].frp).toBe(25);
  });

  it("graceful degradation: returns data when 3/4 fail", async () => {
    mockFetchResponses([
      "reject", "reject", "reject",
      { ok: true, text: makeCsv([{ lat: 15, lon: 100, frp: 42 }]) },
    ]);
    const result = await fetchFires();
    expect(result).toHaveLength(1);
    expect(result[0].frp).toBe(42);
  });

  it("returns empty when all fail", async () => {
    mockFetchResponses(["reject", "reject", "reject", "reject"]);
    expect(await fetchFires()).toEqual([]);
  });

  it("skips non-ok HTTP responses", async () => {
    mockFetchResponses([
      { ok: false }, { ok: false },
      { ok: true, text: makeCsv([{ lat: 15, lon: 100, frp: 10 }]) },
      { ok: false },
    ]);
    expect(await fetchFires()).toHaveLength(1);
  });

  it("parses confidence, acq_time, acq_date", async () => {
    mockFetchResponses([
      { ok: true, text: makeCsv([{
        lat: 14, lon: 100, frp: 15,
        confidence: "high", acq_date: "2026-03-29", acq_time: "1305",
      }]) },
      { ok: false }, { ok: false }, { ok: false },
    ]);
    const result = await fetchFires();
    expect(result[0].confidence).toBe("high");
    expect(result[0].acq_time).toBe("13:05");
    expect(result[0].acq_date).toBe("2026-03-29");
  });
});
