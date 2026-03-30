import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { computeFireZones, clusterHotspots } from "../fireZones";
import type { FireHotspot } from "@/types";

function makeHotspot(lat: number, lon: number, extra: Partial<FireHotspot> = {}): FireHotspot {
  return { lat, lon, ...extra };
}

describe("computeFireZones", () => {
  it("returns empty FeatureCollection for empty input", () => {
    const result = computeFireZones([]);
    expect(result.type).toBe("FeatureCollection");
    expect(result.features).toHaveLength(0);
  });

  it("produces no polygon for fewer than 3 points", () => {
    expect(computeFireZones([makeHotspot(13.5, 100.5)]).features).toHaveLength(0);
    expect(computeFireZones([makeHotspot(13.5, 100.5), makeHotspot(13.51, 100.51)]).features).toHaveLength(0);
  });

  it("produces one polygon for three colocated points", () => {
    const result = computeFireZones([
      makeHotspot(13.5, 100.5), makeHotspot(13.51, 100.51), makeHotspot(13.52, 100.49),
    ]);
    expect(result.features).toHaveLength(1);
    expect(result.features[0].geometry.type).toBe("Polygon");
  });

  it("produces two polygons for two distant clusters", () => {
    const result = computeFireZones([
      makeHotspot(13.50, 100.50), makeHotspot(13.51, 100.51), makeHotspot(13.52, 100.49),
      makeHotspot(18.00, 103.00), makeHotspot(18.01, 103.01), makeHotspot(18.02, 102.99),
    ]);
    expect(result.features).toHaveLength(2);
  });

  it("calculates maxFrp correctly", () => {
    const result = computeFireZones([
      makeHotspot(13.50, 100.50, { frp: 10 }),
      makeHotspot(13.51, 100.51, { frp: 20 }),
      makeHotspot(13.52, 100.49, { frp: 30 }),
    ]);
    expect(result.features[0].properties!.maxFrp).toBe(30);
  });

  it("has correct label and pointCount", () => {
    const result = computeFireZones([
      makeHotspot(13.5, 100.5), makeHotspot(13.51, 100.51), makeHotspot(13.52, 100.49),
    ]);
    expect(result.features[0].properties!.label).toBe("3 จุด");
    expect(result.features[0].properties!.pointCount).toBe(3);
  });
});

describe("computeFireZones color by recency", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("returns red for recent fires (< 6h)", () => {
    vi.setSystemTime(new Date("2026-03-30T12:00:00Z"));
    const result = computeFireZones([
      makeHotspot(13.50, 100.50, { acq_date: "2026-03-30", acq_time: "09:00" }),
      makeHotspot(13.51, 100.51, { acq_date: "2026-03-30", acq_time: "10:00" }),
      makeHotspot(13.52, 100.49, { acq_date: "2026-03-30", acq_time: "11:00" }),
    ]);
    expect(result.features[0].properties!.color).toBe("#ff2200");
  });

  it("returns orange for medium-age fires (6-12h)", () => {
    vi.setSystemTime(new Date("2026-03-30T18:00:00Z"));
    const result = computeFireZones([
      makeHotspot(13.50, 100.50, { acq_date: "2026-03-30", acq_time: "09:00" }),
      makeHotspot(13.51, 100.51, { acq_date: "2026-03-30", acq_time: "10:00" }),
      makeHotspot(13.52, 100.49, { acq_date: "2026-03-30", acq_time: "08:00" }),
    ]);
    expect(result.features[0].properties!.color).toBe("#ff8800");
  });

  it("returns brown for old fires (>= 12h)", () => {
    vi.setSystemTime(new Date("2026-03-31T06:00:00Z"));
    const result = computeFireZones([
      makeHotspot(13.50, 100.50, { acq_date: "2026-03-30", acq_time: "09:00" }),
      makeHotspot(13.51, 100.51, { acq_date: "2026-03-30", acq_time: "10:00" }),
      makeHotspot(13.52, 100.49, { acq_date: "2026-03-30", acq_time: "08:00" }),
    ]);
    expect(result.features[0].properties!.color).toBe("#aa6600");
  });

  it("defaults to brown when no time data", () => {
    const result = computeFireZones([
      makeHotspot(13.50, 100.50), makeHotspot(13.51, 100.51), makeHotspot(13.52, 100.49),
    ]);
    expect(result.features[0].properties!.color).toBe("#aa6600");
  });
});

describe("clusterHotspots", () => {
  it("groups nearby points", () => {
    const clusters = clusterHotspots([
      makeHotspot(13.50, 100.50), makeHotspot(13.51, 100.51), makeHotspot(13.52, 100.49),
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toHaveLength(3);
  });

  it("separates distant points", () => {
    expect(clusterHotspots([makeHotspot(13.5, 100.5), makeHotspot(18.0, 103.0)])).toHaveLength(2);
  });

  it("chains transitive neighbors", () => {
    const clusters = clusterHotspots([
      makeHotspot(13.50, 100.50), makeHotspot(13.54, 100.50), makeHotspot(13.58, 100.50),
    ]);
    expect(clusters).toHaveLength(1);
  });

  it("respects custom radius", () => {
    expect(clusterHotspots([makeHotspot(13.50, 100.50), makeHotspot(13.54, 100.50)], 0.02)).toHaveLength(2);
  });
});
