import { describe, it, expect } from "vitest";
import {
  POPUP_CONFIG,
  formatFlight,
  formatDomestic,
  formatMilitary,
  formatPrivate,
  formatEarthquake,
  formatAirQuality,
  formatShip,
  formatCctv,
  formatFlood,
} from "../popupFormatters";

describe("POPUP_CONFIG", () => {
  it("has correct offset and maxWidth", () => {
    expect(POPUP_CONFIG.offset).toBe(15);
    expect(POPUP_CONFIG.maxWidth).toBe("300px");
  });
});

describe("formatFlight", () => {
  it("renders callsign and flight data with metric units", () => {
    const html = formatFlight({
      callsign: "THA123",
      type: "B737",
      registration: "HS-ABC",
      alt: 35000,
      speed: 450,
      heading: 270,
    });
    expect(html).toContain("THA123");
    expect(html).toContain("B737");
    expect(html).toContain("HS-ABC");
    // metric: altitude in meters (35000 ft ≈ 10,668 m)
    expect(html).toContain("10,668");
    expect(html).toContain("ม.");
    // speed in km/h (450 kts ≈ 833 km/h)
    expect(html).toContain("833");
    expect(html).toContain("กม./ชม.");
    expect(html).toContain("270");
  });

  it("shows 'ไม่ทราบ' for missing callsign", () => {
    const html = formatFlight({ alt: 0, speed: 0, heading: 0 });
    expect(html).toContain("ไม่ทราบ");
  });

  it("handles zero altitude", () => {
    const html = formatFlight({ callsign: "TEST", alt: 0, speed: 0, heading: 0 });
    expect(html).toContain("0");
  });
});

describe("formatMilitary", () => {
  it("renders MIL prefix with callsign", () => {
    const html = formatMilitary({
      callsign: "COBRA01",
      hex: "abc123",
      type: "F16",
      registration: "40123",
      alt: 25000,
      speed: 500,
    });
    expect(html).toContain("MIL:");
    expect(html).toContain("COBRA01");
    expect(html).toContain("F16");
    expect(html).toContain("40123");
  });

  it("falls back to hex when callsign missing", () => {
    const html = formatMilitary({ hex: "abc123", alt: 0, speed: 0 });
    expect(html).toContain("abc123");
  });
});

describe("formatPrivate", () => {
  it("renders private aircraft info", () => {
    const html = formatPrivate({
      callsign: "N123AB",
      type: "G650",
      registration: "N123AB",
      alt: 41000,
      speed: 500,
    });
    expect(html).toContain("N123AB");
    expect(html).toContain("G650");
  });

  it("falls back to registration when no callsign", () => {
    const html = formatPrivate({ registration: "HS-XYZ", alt: 0, speed: 0 });
    expect(html).toContain("HS-XYZ");
  });

  it("shows 'เครื่องบินส่วนตัว' when no callsign or registration", () => {
    const html = formatPrivate({ alt: 0, speed: 0 });
    expect(html).toContain("เครื่องบินส่วนตัว");
  });
});

describe("formatEarthquake", () => {
  it("renders magnitude and location", () => {
    const html = formatEarthquake({
      magnitude: 5.2,
      place: "10km N of Chiang Rai",
      depth: 15,
      time: 1700000000000,
    });
    expect(html).toContain("M5.2");
    expect(html).toContain("แผ่นดินไหว");
    expect(html).toContain("10km N of Chiang Rai");
    expect(html).toContain("15 กม.");
  });

  it("formats time as locale string", () => {
    const html = formatEarthquake({
      magnitude: 3.0,
      place: "Test",
      depth: 5,
      time: 1700000000000,
    });
    // Should contain a date string (locale-dependent but not empty)
    expect(html.length).toBeGreaterThan(50);
  });
});

describe("formatAirQuality", () => {
  it("shows green for good AQ (pm25 <= 35)", () => {
    const html = formatAirQuality({ pm25: 20, location: "Silom", city: "Bangkok" });
    expect(html).toContain("#00ff88"); // green
    expect(html).toContain("PM2.5: 20");
    expect(html).toContain("Silom");
    expect(html).toContain("Bangkok");
  });

  it("shows orange for moderate AQ (35 < pm25 <= 75)", () => {
    const html = formatAirQuality({ pm25: 50, location: "A", city: "B" });
    expect(html).toContain("#ffaa00");
  });

  it("shows red for bad AQ (pm25 > 75)", () => {
    const html = formatAirQuality({ pm25: 100, location: "A", city: "B" });
    expect(html).toContain("#ff4444");
  });

  it("handles boundary value 35 as green", () => {
    const html = formatAirQuality({ pm25: 35, location: "A", city: "B" });
    expect(html).toContain("#00ff88");
  });

  it("handles boundary value 75 as orange", () => {
    const html = formatAirQuality({ pm25: 75, location: "A", city: "B" });
    expect(html).toContain("#ffaa00");
  });
});

describe("formatShip", () => {
  it("renders vessel info with metric speed", () => {
    const html = formatShip({
      name: "EVERGREEN",
      mmsi: "123456789",
      type: "Cargo",
      speed: 12,
      course: 180,
    });
    expect(html).toContain("EVERGREEN");
    expect(html).toContain("123456789");
    expect(html).toContain("Cargo");
    // speed in km/h (12 kts ≈ 22 km/h)
    expect(html).toContain("22");
    expect(html).toContain("กม./ชม.");
    expect(html).toContain("180");
  });

  it("shows 'เรือไม่ทราบชื่อ' for missing name", () => {
    const html = formatShip({ mmsi: "999", speed: 0, course: 0 });
    expect(html).toContain("เรือไม่ทราบชื่อ");
  });
});

describe("formatCctv", () => {
  it("renders camera info with image", () => {
    const html = formatCctv({
      name: "Siam Junction",
      source: "BMA",
      url: "https://example.com/cam.jpg",
    });
    expect(html).toContain("Siam Junction");
    expect(html).toContain("BMA");
    expect(html).toContain('<img src="https://example.com/cam.jpg"');
  });

  it("omits image when url is missing", () => {
    const html = formatCctv({ name: "Test Cam", source: "DOH" });
    expect(html).not.toContain("<img");
    expect(html).toContain("Test Cam");
  });
});

describe("formatFlood", () => {
  it("shows alert styling for situation_level 5", () => {
    const html = formatFlood({
      situation_level: 5,
      name: "สถานีน้ำ A",
      province: "เชียงราย",
      basin: "แม่โขง",
      water_level_msl: "200.5",
      bank_diff: "1.2",
      datetime: "2024-01-15 12:00",
    });
    expect(html).toContain("#ff6600"); // orange for alert
    expect(html).toContain("เตือนภัย");
    expect(html).toContain("ระดับ 5");
    expect(html).toContain("สถานีน้ำ A");
    expect(html).toContain("เชียงราย");
    expect(html).toContain("แม่โขง");
    expect(html).toContain("200.5");
    expect(html).toContain("เหนือตลิ่ง: 1.2 ม.");
  });

  it("shows watch styling for situation_level 4", () => {
    const html = formatFlood({
      situation_level: 4,
      name: "Station B",
      province: "Bangkok",
      basin: "Chao Phraya",
      datetime: "2024-01-15",
    });
    expect(html).toContain("#ffaa00"); // amber for watch
    expect(html).toContain("เฝ้าระวัง");
    expect(html).toContain("ระดับ 4");
  });

  it("shows below-bank label for negative bank_diff", () => {
    const html = formatFlood({ situation_level: 4, name: "X", datetime: "", bank_diff: "-2.5" });
    expect(html).toContain("ต่ำกว่าตลิ่ง: 2.5 ม.");
  });

  it("omits water_level and bank_diff when null", () => {
    const html = formatFlood({
      situation_level: 4,
      name: "Test",
      datetime: "2024-01-01",
    });
    expect(html).not.toContain("MSL");
    expect(html).not.toContain("ตลิ่ง");
  });

  it("falls back to name_th if name missing", () => {
    const html = formatFlood({
      situation_level: 4,
      name_th: "สถานีทดสอบ",
      datetime: "",
    });
    expect(html).toContain("สถานีทดสอบ");
  });
});

describe("formatDomestic", () => {
  it("renders with green color #00ff88", () => {
    const html = formatDomestic({
      callsign: "THA123",
      type: "B737",
      registration: "HS-ABC",
      alt: 35000,
      speed: 450,
      heading: 270,
    });
    expect(html).toContain("#00ff88");
  });

  it("shows callsign", () => {
    const html = formatDomestic({
      callsign: "NOK456",
      alt: 30000,
      speed: 400,
      heading: 90,
    });
    expect(html).toContain("NOK456");
  });

  it("shows metric units", () => {
    const html = formatDomestic({
      callsign: "AIQ789",
      alt: 35000,
      speed: 450,
      heading: 180,
    });
    // altitude in meters (35000 ft -> 10668 m)
    expect(html).toContain("10,668");
    expect(html).toContain("ม.");
    // speed in km/h (450 kts -> 833 km/h)
    expect(html).toContain("833");
    expect(html).toContain("กม./ชม.");
  });
});
