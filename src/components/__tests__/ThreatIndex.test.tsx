/**
 * Tests for ThreatIndex split-panel score calculation logic.
 *
 * The component now renders TWO panels:
 *   1. ดัชนีภัยธรรมชาติ (Natural Disaster Index) - fires, seismic, flood, PM2.5
 *   2. ดัชนีความมั่นคง (Security Index) - military, intel chatter
 *
 * Each panel has its own .font-mono score element.
 */

import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "@testing-library/react";
import ThreatIndex from "../ThreatIndex";
import type { FastData, SlowData } from "@/types";

// ---------------------------------------------------------------------------
// Helpers to build typed mock data
// ---------------------------------------------------------------------------
function makeFastData(overrides: Partial<FastData> = {}): FastData {
  return {
    flights: {
      commercial: [],
      military: [],
      private: [],
      total: 0,
    },
    military_flights: [],
    cctv: [],
    updated: {},
    ...overrides,
  };
}

function makeSlowData(overrides: Partial<SlowData> = {}): SlowData {
  return {
    earthquakes: [],
    fires: [],
    weather: { radar: [], host: "" },
    news: [],
    air_quality: [],
    ships: [],
    flood: [],
    updated: {},
    ...overrides,
  };
}

function makeAirStation(pm25: number) {
  return {
    location: "Station",
    city: "City",
    country: "TH",
    lat: 14,
    lon: 100,
    pm25,
    lastUpdated: "",
  };
}

function makeFlood(critical: boolean) {
  return {
    lat: 14,
    lon: 100,
    name: "Station",
    name_th: "",
    province: "",
    province_th: "",
    basin: "",
    water_level_msl: null,
    situation_level: critical ? 5 : 4,
    bank_diff: null,
    datetime: "",
    critical,
  };
}

// ---------------------------------------------------------------------------
// Pure calculation helpers matching new split weights
// ---------------------------------------------------------------------------
function calcNaturalScore(params: {
  fireCount: number;
  maxMag: number;
  quakeCount: number;
  floodStations: number;
  criticalFloods: number;
  avgPm25: number;
}): number {
  const fireScore = Math.round(Math.min(100, (params.fireCount / 1500) * 100));
  const seismicScore =
    params.quakeCount === 0
      ? 0
      : Math.max(0, Math.round(Math.min(100, (params.maxMag - 2) * 25)));
  const floodScore = Math.round(
    Math.min(100, params.criticalFloods * 8 + params.floodStations * 2)
  );
  const pm25Score = Math.round(
    Math.min(100, Math.max(0, (params.avgPm25 - 15) * 1.5))
  );

  // weights: fires 0.3, seismic 0.2, flood 0.25, PM2.5 0.25
  return Math.round(
    fireScore * 0.3 + seismicScore * 0.2 + floodScore * 0.25 + pm25Score * 0.25
  );
}

function calcSecurityScore(params: {
  milCount: number;
}): number {
  return Math.min(100, params.milCount * 12);
}

// ---------------------------------------------------------------------------
// 1. Calm scenario
// ---------------------------------------------------------------------------
describe("ThreatIndex - Calm scenario", () => {
  it("calculates low scores on both panels with benign data", () => {
    const fastData = makeFastData();
    const slowData = makeSlowData({
      air_quality: [makeAirStation(10), makeAirStation(12)],
      fires: Array.from({ length: 5 }, () => ({ lat: 14, lon: 100 })),
      earthquakes: [],
      news: Array.from({ length: 3 }, (_, i) => ({
        title: `Article ${i}`,
        link: "",
        source: "Test",
        weight: 3,
        published: "",
        summary: "",
      })),
      flood: [],
    });

    const expectedNatural = calcNaturalScore({
      fireCount: 5,
      maxMag: 0,
      quakeCount: 0,
      floodStations: 0,
      criticalFloods: 0,
      avgPm25: 11, // (10+12)/2
    });
    const expectedSecurity = calcSecurityScore({
      milCount: 0,
    });

    const { container } = render(
      <ThreatIndex fastData={fastData} slowData={slowData} />
    );

    // Two panels -> two .font-mono score elements
    const scoreEls = container.querySelectorAll(".font-mono");
    expect(scoreEls).toHaveLength(2);

    const naturalScore = parseInt(scoreEls[0].textContent || "0", 10);
    const securityScore = parseInt(scoreEls[1].textContent || "0", 10);

    expect(naturalScore).toBe(expectedNatural);
    expect(securityScore).toBe(expectedSecurity);

    // Both should be in calm range (0-24)
    expect(naturalScore).toBeLessThan(25);
    expect(securityScore).toBeLessThan(25);

    // Level name should be "ปกติ" for both panels
    const text = container.textContent || "";
    // The word "ปกติ" should appear at least twice (once per panel)
    const calmMatches = text.match(/ปกติ/g);
    expect(calmMatches).not.toBeNull();
    expect(calmMatches!.length).toBeGreaterThanOrEqual(2);
  });

  it("shows zero scores when all data is null", () => {
    const { container } = render(
      <ThreatIndex fastData={null} slowData={null} />
    );

    const scoreEls = container.querySelectorAll(".font-mono");
    expect(scoreEls).toHaveLength(2);

    const naturalScore = parseInt(scoreEls[0].textContent || "0", 10);
    const securityScore = parseInt(scoreEls[1].textContent || "0", 10);

    expect(naturalScore).toBe(0);
    expect(securityScore).toBe(0);
    expect(container.textContent).toContain("ปกติ");
  });
});

// ---------------------------------------------------------------------------
// 2. Critical scenario
// ---------------------------------------------------------------------------
describe("ThreatIndex - Critical scenario", () => {
  it("calculates high scores on both panels with extreme data", () => {
    const milAircraft = Array.from({ length: 10 }, (_, i) => ({
      hex: `mil${i}`,
      callsign: `MIL${i}`,
      lat: 14,
      lon: 100,
      alt: 30000,
      speed: 400,
      heading: 90,
      squawk: "7700",
      type: "F16",
      registration: "",
      dbFlags: 1,
    }));

    const fastData = makeFastData({
      flights: {
        commercial: [],
        military: milAircraft.slice(0, 5),
        private: [],
        total: 5,
      },
      military_flights: milAircraft.slice(5),
    });

    const slowData = makeSlowData({
      air_quality: [
        makeAirStation(120),
        makeAirStation(150),
        makeAirStation(200),
      ],
      fires: Array.from({ length: 1500 }, () => ({
        lat: 14,
        lon: 100,
        frp: 10,
      })),
      earthquakes: [
        {
          id: "eq1",
          lat: 14,
          lon: 100,
          depth: 10,
          magnitude: 6.5,
          place: "Near Bangkok",
          time: Date.now(),
          url: "",
        },
      ],
      news: Array.from({ length: 40 }, (_, i) => ({
        title: `Crisis ${i}`,
        link: "",
        source: "Test",
        weight: 5,
        published: "",
        summary: "",
      })),
      flood: [
        makeFlood(true),
        makeFlood(true),
        makeFlood(true),
        makeFlood(false),
        makeFlood(false),
      ],
    });

    const milCount = 5 + 5;
    const avgPm25 = (120 + 150 + 200) / 3;

    const expectedNatural = calcNaturalScore({
      fireCount: 1500,
      maxMag: 6.5,
      quakeCount: 1,
      floodStations: 5,
      criticalFloods: 3,
      avgPm25,
    });
    const expectedSecurity = calcSecurityScore({
      milCount,
    });

    const { container } = render(
      <ThreatIndex fastData={fastData} slowData={slowData} />
    );

    const scoreEls = container.querySelectorAll(".font-mono");
    expect(scoreEls).toHaveLength(2);

    const naturalScore = parseInt(scoreEls[0].textContent || "0", 10);
    const securityScore = parseInt(scoreEls[1].textContent || "0", 10);

    expect(naturalScore).toBe(expectedNatural);
    expect(securityScore).toBe(expectedSecurity);

    // Natural should be >= 80 (critical)
    expect(naturalScore).toBeGreaterThanOrEqual(80);
    // Security should be 100
    expect(securityScore).toBe(100);

    // At least one panel shows "วิกฤต"
    expect(container.textContent).toContain("วิกฤต");
  });

  it("caps individual scores at 100 with extreme values", () => {
    const milAircraft = Array.from({ length: 20 }, (_, i) => ({
      hex: `mil${i}`,
      callsign: `MIL${i}`,
      lat: 14,
      lon: 100,
      alt: 30000,
      speed: 400,
      heading: 90,
      squawk: "",
      type: "F16",
      registration: "",
      dbFlags: 1,
    }));

    const fastData = makeFastData({
      flights: {
        commercial: [],
        military: milAircraft,
        private: [],
        total: 20,
      },
    });

    const slowData = makeSlowData({
      air_quality: [makeAirStation(500)],
      fires: Array.from({ length: 2000 }, () => ({ lat: 14, lon: 100 })),
      earthquakes: [
        {
          id: "eq1",
          lat: 14,
          lon: 100,
          depth: 5,
          magnitude: 9.0,
          place: "",
          time: 0,
          url: "",
        },
      ],
      flood: Array.from({ length: 50 }, () => makeFlood(true)),
      news: Array.from({ length: 50 }, (_, i) => ({
        title: `News ${i}`,
        link: "",
        source: "Test",
        weight: 5,
        published: "",
        summary: "",
      })),
    });

    const { container } = render(
      <ThreatIndex fastData={fastData} slowData={slowData} />
    );

    const scoreEls = container.querySelectorAll(".font-mono");
    expect(scoreEls).toHaveLength(2);

    const naturalScore = parseInt(scoreEls[0].textContent || "0", 10);
    const securityScore = parseInt(scoreEls[1].textContent || "0", 10);

    // All individual signals cap at 100, both totals should be 100
    expect(naturalScore).toBe(100);
    expect(securityScore).toBe(100);
  });

  it("renders all signal labels across both panels", () => {
    const { container } = render(
      <ThreatIndex fastData={makeFastData()} slowData={makeSlowData()} />
    );

    const naturalLabels = ["ไฟ", "แผ่นดินไหว", "น้ำท่วม", "PM2.5"];
    const securityLabels = ["ทหาร"];

    for (const label of [...naturalLabels, ...securityLabels]) {
      expect(container.textContent).toContain(label);
    }

    // Verify panel titles
    expect(container.textContent).toContain("ดัชนีภัยธรรมชาติ");
    expect(container.textContent).toContain("ดัชนีความมั่นคง");
  });
});
