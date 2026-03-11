import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ProvinceDossier from "@/components/ProvinceDossier";
import type { ProvinceProperties, FastData, SlowData } from "@/types";

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
  bbox: JSON.stringify([100.3, 13.5, 100.9, 13.95]),
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
  flights: { domestic: [], international: [], military: [], private: [], total: 0 },
  military_flights: [],
  updated: {},
  ...overrides,
});

describe("ProvinceDossier", () => {
  it("renders province name in Thai and English", () => {
    render(
      <ProvinceDossier
        provinceProperties={makeProvince()}
        fastData={null}
        slowData={null}
        onClose={() => {}}
      />
    );
    expect(screen.getByText("กรุงเทพมหานคร")).toBeDefined();
    expect(screen.getByText(/Bangkok \(TH-10\)/)).toBeDefined();
  });

  it("renders profile section with region, capital, population, area", () => {
    render(
      <ProvinceDossier
        provinceProperties={makeProvince()}
        fastData={null}
        slowData={null}
        onClose={() => {}}
      />
    );
    expect(screen.getByText(/ภาคกลาง/)).toBeDefined();
    expect(screen.getByText(/กรุงเทพฯ/)).toBeDefined();
    expect(screen.getByText(/5,527,994/)).toBeDefined();
    expect(screen.getByText(/1,569/)).toBeDefined();
  });

  it("renders threat composite score", () => {
    render(
      <ProvinceDossier
        provinceProperties={makeProvince()}
        fastData={null}
        slowData={null}
        onClose={() => {}}
      />
    );
    const scoreEl = screen.getByTestId("composite-score");
    expect(scoreEl).toBeDefined();
    expect(scoreEl.textContent).toBe("0");
  });

  it("renders signal rows", () => {
    render(
      <ProvinceDossier
        provinceProperties={makeProvince()}
        fastData={makeFastData()}
        slowData={makeSlowData()}
        onClose={() => {}}
      />
    );
    expect(screen.getByText("ไฟ")).toBeDefined();
    expect(screen.getByText("น้ำท่วม")).toBeDefined();
    expect(screen.getByText("PM2.5")).toBeDefined();
    expect(screen.getByText("แผ่นดินไหว")).toBeDefined();
  });

  it("calls onClose when close button clicked", () => {
    const onClose = vi.fn();
    render(
      <ProvinceDossier
        provinceProperties={makeProvince()}
        fastData={null}
        slowData={null}
        onClose={onClose}
      />
    );
    const closeBtn = screen.getByLabelText("ปิด");
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("handles zero data gracefully with empty state message", () => {
    render(
      <ProvinceDossier
        provinceProperties={makeProvince()}
        fastData={null}
        slowData={makeSlowData()}
        onClose={() => {}}
      />
    );
    expect(screen.getByText("ไม่พบข้อมูลภัยพิบัติในจังหวัดนี้")).toBeDefined();
  });

  it("renders news when present", () => {
    const slow = makeSlowData({
      news: [
        {
          title: "Bangkok flood warning issued today",
          link: "https://example.com",
          source: "Bangkok Post",
          weight: 1,
          published: "2024-01-15T10:00:00Z",
          summary: "Heavy rain in Bangkok area",
        },
      ],
    });
    render(
      <ProvinceDossier
        provinceProperties={makeProvince()}
        fastData={null}
        slowData={slow}
        onClose={() => {}}
      />
    );
    expect(screen.getByText(/ข่าวที่เกี่ยวข้อง/)).toBeDefined();
    expect(screen.getByText(/Bangkok flood warning/)).toBeDefined();
    expect(screen.getByText(/Bangkok Post/)).toBeDefined();
  });

  it("renders flood stations when present", () => {
    const slow = makeSlowData({
      flood: [
        {
          lat: 13.7,
          lon: 100.5,
          name: "Station A",
          name_th: "สถานี A",
          province: "Bangkok",
          province_th: "กรุงเทพมหานคร",
          basin: "เจ้าพระยา",
          water_level_msl: "2.5",
          situation_level: 5,
          bank_diff: "0.3",
          datetime: "2024-01-01",
          critical: true,
        },
      ],
    });
    render(
      <ProvinceDossier
        provinceProperties={makeProvince()}
        fastData={null}
        slowData={slow}
        onClose={() => {}}
      />
    );
    expect(screen.getByText(/สถานีน้ำ \(1\)/)).toBeDefined();
  });
});
