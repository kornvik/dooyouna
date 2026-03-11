import { describe, it, expect } from "vitest";
import {
  isPointInBbox,
  isPointInProvince,
  parseBbox,
  aggregateProvinceData,
  calculateProvinceThreatScore,
  filterNewsByProvince,
} from "@/lib/provinceData";
import type {
  ProvinceProperties,
  FastData,
  SlowData,
  ProvinceThreatSummary,
} from "@/types";

const makeBbox = (minLon: number, minLat: number, maxLon: number, maxLat: number) =>
  JSON.stringify([minLon, minLat, maxLon, maxLat]);

const makeProvince = (overrides: Partial<ProvinceProperties> = {}): ProvinceProperties => ({
  name_th: "กรุงเทพมหานคร",
  name_en: "Bangkok",
  code: "TH-10",
  region: "ภาคกลาง",
  region_en: "Central",
  population: 5527994,
  area_km2: 1569,
  capital_th: "กรุงเทพฯ",
  capital_en: "Bangkok",
  bbox: makeBbox(100.3, 13.5, 100.9, 13.95),
  ...overrides,
});

const makeSlowData = (overrides: Partial<SlowData> = {}): SlowData => ({
  earthquakes: [],
  fires: [],
  weather: { radar: [], host: "" },
  news: [],
  air_quality: [],
  ships: [],
  flood: [],
  wind: [],
  updated: {},
  ...overrides,
});

const makeFastData = (overrides: Partial<FastData> = {}): FastData => ({
  flights: {
    domestic: [],
    international: [],
    military: [],
    private: [],
    total: 0,
  },
  military_flights: [],
  updated: {},
  ...overrides,
});

// ---- isPointInBbox ----
describe("isPointInBbox", () => {
  const bbox: [number, number, number, number] = [100, 13, 101, 14];

  it("returns true for point inside bbox", () => {
    expect(isPointInBbox(13.5, 100.5, bbox)).toBe(true);
  });

  it("returns false for point outside bbox", () => {
    expect(isPointInBbox(15, 100.5, bbox)).toBe(false);
    expect(isPointInBbox(13.5, 99, bbox)).toBe(false);
  });

  it("returns true for point on boundary", () => {
    expect(isPointInBbox(13, 100, bbox)).toBe(true);
    expect(isPointInBbox(14, 101, bbox)).toBe(true);
  });
});

// ---- isPointInProvince ----
describe("isPointInProvince", () => {
  // Simple square polygon: [100,13] -> [101,13] -> [101,14] -> [100,14] -> [100,13]
  const square: number[][][] = [[[100,13],[101,13],[101,14],[100,14],[100,13]]];

  it("returns true for point inside polygon", () => {
    expect(isPointInProvince(13.5, 100.5, square)).toBe(true);
  });

  it("returns false for point outside polygon", () => {
    expect(isPointInProvince(15, 100.5, square)).toBe(false);
    expect(isPointInProvince(13.5, 99, square)).toBe(false);
  });

  // Triangle: narrower shape to test bbox vs polygon difference
  const triangle: number[][][] = [[[100,13],[101,13],[100.5,14],[100,13]]];

  it("correctly excludes point inside bbox but outside polygon", () => {
    // Point at [13.8, 100.9] is inside the triangle's bbox but outside the triangle
    expect(isPointInProvince(13.8, 100.9, triangle)).toBe(false);
    // Point at [13.5, 100.3] is inside the triangle
    expect(isPointInProvince(13.3, 100.3, triangle)).toBe(true);
  });

  it("handles MultiPolygon", () => {
    const multi: number[][][][] = [
      [[[100,13],[101,13],[101,14],[100,14],[100,13]]],
      [[[102,13],[103,13],[103,14],[102,14],[102,13]]],
    ];
    expect(isPointInProvince(13.5, 100.5, multi)).toBe(true);
    expect(isPointInProvince(13.5, 102.5, multi)).toBe(true);
    expect(isPointInProvince(13.5, 101.5, multi)).toBe(false);
  });

  it("returns false for empty geometry", () => {
    expect(isPointInProvince(13.5, 100.5, [])).toBe(false);
  });
});

// ---- parseBbox ----
describe("parseBbox", () => {
  it("parses valid bbox string", () => {
    expect(parseBbox("[100, 13, 101, 14]")).toEqual([100, 13, 101, 14]);
  });

  it("returns [0,0,0,0] for invalid input", () => {
    expect(parseBbox("not json")).toEqual([0, 0, 0, 0]);
    expect(parseBbox("[1,2]")).toEqual([0, 0, 0, 0]);
  });
});

// ---- aggregateProvinceData ----
describe("aggregateProvinceData", () => {
  const province = makeProvince();

  it("returns zero counts with empty data", () => {
    const result = aggregateProvinceData(province, null, null);
    expect(result.fireCount).toBe(0);
    expect(result.floodStations).toHaveLength(0);
    expect(result.criticalFloods).toBe(0);
    expect(result.aqStations).toHaveLength(0);
    expect(result.earthquakes).toHaveLength(0);
    expect(result.flightCount).toBe(0);
    expect(result.militaryCount).toBe(0);
    expect(result.shipCount).toBe(0);
    expect(result.matchingNews).toHaveLength(0);
  });

  it("filters fires by bbox", () => {
    const slow = makeSlowData({
      fires: [
        { lat: 13.7, lon: 100.5 }, // inside
        { lat: 13.7, lon: 100.6 }, // inside
        { lat: 15.0, lon: 100.5 }, // outside
      ],
    });
    const result = aggregateProvinceData(province, null, slow);
    expect(result.fireCount).toBe(2);
  });

  it("matches flood stations by province name", () => {
    const slow = makeSlowData({
      flood: [
        {
          lat: 0, lon: 0, name: "Station A", name_th: "สถานี A",
          province: "Bangkok", province_th: "กรุงเทพมหานคร",
          basin: "เจ้าพระยา", water_level_msl: "2.5", situation_level: 5,
          bank_diff: "0.3", datetime: "2024-01-01", critical: true,
        },
        {
          lat: 0, lon: 0, name: "Station B", name_th: "สถานี B",
          province: "Chiang Mai", province_th: "เชียงใหม่",
          basin: "ปิง", water_level_msl: "1.0", situation_level: 4,
          bank_diff: "0.1", datetime: "2024-01-01", critical: false,
        },
      ],
    });
    const result = aggregateProvinceData(province, null, slow);
    expect(result.floodStations).toHaveLength(1);
    expect(result.criticalFloods).toBe(1);
  });

  it("counts flights and military inside bbox", () => {
    const fast = makeFastData({
      flights: {
        domestic: [
          { hex: "1", callsign: "TG1", lat: 13.7, lon: 100.5, alt: 1000, speed: 200, heading: 0, squawk: "", type: "", registration: "" },
        ],
        international: [],
        military: [
          { hex: "2", callsign: "MIL1", lat: 13.7, lon: 100.5, alt: 5000, speed: 300, heading: 90, squawk: "", type: "", registration: "" },
        ],
        private: [],
        total: 2,
      },
    });
    const result = aggregateProvinceData(province, fast, null);
    expect(result.flightCount).toBe(1); // domestic only in flightCount
    expect(result.militaryCount).toBe(1);
  });

  it("matches news by province name in text", () => {
    const slow = makeSlowData({
      news: [
        { title: "Bangkok flood warning issued", link: "", source: "BP", weight: 1, published: "", summary: "Heavy rain" },
        { title: "เชียงใหม่ AQI สูง", link: "", source: "TN", weight: 1, published: "", summary: "PM2.5 วิกฤต" },
      ],
    });
    const result = aggregateProvinceData(province, null, slow);
    expect(result.matchingNews).toHaveLength(1);
    expect(result.matchingNews[0].title).toContain("Bangkok");
  });
});

// ---- calculateProvinceThreatScore ----
describe("calculateProvinceThreatScore", () => {
  const emptySummary: ProvinceThreatSummary = {
    fireCount: 0,
    floodStations: [],
    criticalFloods: 0,
    normalFloods: 0,
    aqStations: [],
    avgPm25: 0,
    earthquakes: [],
    maxMagnitude: 0,
    flightCount: 0,
    militaryCount: 0,
    shipCount: 0,
    matchingNews: [],
  };

  it("returns zero scores and ปกติ for empty data", () => {
    const score = calculateProvinceThreatScore(emptySummary);
    expect(score.fire).toBe(0);
    expect(score.flood).toBe(0);
    expect(score.airQuality).toBe(0);
    expect(score.seismic).toBe(0);
    expect(score.composite).toBe(0);
    expect(score.level.name).toBe("ปกติ");
  });

  it("caps fire score at 100 for 100+ fires", () => {
    const score = calculateProvinceThreatScore({ ...emptySummary, fireCount: 200 });
    expect(score.fire).toBe(100);
  });

  it("calculates correct fire score below cap", () => {
    const score = calculateProvinceThreatScore({ ...emptySummary, fireCount: 50 });
    expect(score.fire).toBe(50);
  });

  it("calculates flood score with critical and normal", () => {
    const score = calculateProvinceThreatScore({
      ...emptySummary,
      criticalFloods: 2,
      normalFloods: 3,
    });
    // 2*20 + 3*5 = 55
    expect(score.flood).toBe(55);
  });

  it("calculates AQ score", () => {
    const score = calculateProvinceThreatScore({ ...emptySummary, avgPm25: 68 });
    // (68-15)*1.5 = 79.5 → 80
    expect(score.airQuality).toBe(80);
  });

  it("calculates seismic score", () => {
    const score = calculateProvinceThreatScore({
      ...emptySummary,
      earthquakes: [{ id: "1", lat: 0, lon: 0, depth: 10, magnitude: 5.0, place: "", time: 0, url: "" }],
      maxMagnitude: 5.0,
    });
    // (5-2)*25 = 75
    expect(score.seismic).toBe(75);
  });

  it("computes correct weighted composite", () => {
    const score = calculateProvinceThreatScore({
      ...emptySummary,
      fireCount: 50,     // fire=50
      criticalFloods: 2, // flood=40 (2*20)
      normalFloods: 0,
      avgPm25: 68,       // AQ=80
      earthquakes: [{ id: "1", lat: 0, lon: 0, depth: 10, magnitude: 5.0, place: "", time: 0, url: "" }],
      maxMagnitude: 5.0, // seismic=75
    });
    // composite = 50*0.3 + 40*0.25 + 80*0.25 + 75*0.2 = 15+10+20+15 = 60
    expect(score.composite).toBe(60);
    expect(score.level.name).toBe("สูง");
  });

  it("returns วิกฤต for very high scores", () => {
    const score = calculateProvinceThreatScore({
      ...emptySummary,
      fireCount: 150,
      criticalFloods: 5,
      normalFloods: 0,
      avgPm25: 120,
      earthquakes: [{ id: "1", lat: 0, lon: 0, depth: 10, magnitude: 7.0, place: "", time: 0, url: "" }],
      maxMagnitude: 7.0,
    });
    expect(score.composite).toBeGreaterThanOrEqual(80);
    expect(score.level.name).toBe("วิกฤต");
  });
});

// ---- filterNewsByProvince ----
describe("filterNewsByProvince", () => {
  const province = makeProvince();
  const articles = [
    { title: "Bangkok flood warning", link: "", source: "BP", weight: 1, published: "", summary: "Severe flooding" },
    { title: "กรุงเทพมหานคร น้ำท่วม", link: "", source: "TN", weight: 1, published: "", summary: "ฝนตกหนัก" },
    { title: "Chiang Mai air quality", link: "", source: "CM", weight: 1, published: "", summary: "PM2.5 crisis" },
    { title: "Unrelated headline", link: "", source: "X", weight: 1, published: "", summary: "Contains bangkok in summary" },
  ];

  it("matches English name case-insensitively", () => {
    const result = filterNewsByProvince(articles, province);
    expect(result.some((a) => a.source === "BP")).toBe(true);
    expect(result.some((a) => a.source === "X")).toBe(true); // "bangkok" in summary
  });

  it("matches Thai name", () => {
    const result = filterNewsByProvince(articles, province);
    expect(result.some((a) => a.source === "TN")).toBe(true);
  });

  it("does not match unrelated provinces", () => {
    const result = filterNewsByProvince(articles, province);
    expect(result.some((a) => a.source === "CM")).toBe(false);
  });

  it("returns empty for no matches", () => {
    const noMatchProvince = makeProvince({ name_th: "ตราด", name_en: "Trat" });
    const result = filterNewsByProvince(articles, noMatchProvince);
    expect(result).toHaveLength(0);
  });
});
