import { describe, it, expect } from "vitest";
import { windToUV, interpolateWind } from "../windParticles";
import type { WindPoint } from "@/types";

describe("windToUV", () => {
  it("converts north wind (0°) to southward movement", () => {
    const [u, v] = windToUV(10, 0);
    // Wind from north → movement to south → v should be positive (screen: negative in geo)
    // After +180°: sin(180°) ≈ 0, -cos(180°) = 1
    expect(Math.abs(u)).toBeLessThan(0.01);
    expect(v).toBeCloseTo(10, 1);
  });

  it("converts east wind (90°) to westward movement", () => {
    const [u, v] = windToUV(10, 90);
    // Wind from east → movement to west → u negative
    // After +180°: sin(270°) = -1, -cos(270°) ≈ 0
    expect(u).toBeCloseTo(-10, 1);
    expect(Math.abs(v)).toBeLessThan(0.01);
  });

  it("converts south wind (180°) to northward movement", () => {
    const [u, v] = windToUV(10, 180);
    expect(Math.abs(u)).toBeLessThan(0.01);
    expect(v).toBeCloseTo(-10, 1);
  });

  it("converts west wind (270°) to eastward movement", () => {
    const [u, v] = windToUV(10, 270);
    expect(u).toBeCloseTo(10, 1);
    expect(Math.abs(v)).toBeLessThan(0.01);
  });

  it("returns zero vector for zero speed", () => {
    const [u, v] = windToUV(0, 45);
    expect(u).toBeCloseTo(0, 10);
    expect(v).toBeCloseTo(0, 10);
  });
});

describe("interpolateWind", () => {
  it("returns zero for empty points", () => {
    expect(interpolateWind(13, 100, [])).toEqual([0, 0]);
  });

  it("returns single point's vector directly", () => {
    const points: WindPoint[] = [{ lat: 13, lon: 100, speed: 10, direction: 0 }];
    const [u, v] = interpolateWind(15, 105, points);
    const [eu, ev] = windToUV(10, 0);
    expect(u).toBeCloseTo(eu, 5);
    expect(v).toBeCloseTo(ev, 5);
  });

  it("returns exact point vector when on a grid point", () => {
    const points: WindPoint[] = [
      { lat: 10, lon: 100, speed: 5, direction: 90 },
      { lat: 15, lon: 105, speed: 20, direction: 270 },
    ];
    const [u, v] = interpolateWind(10, 100, points);
    const [eu, ev] = windToUV(5, 90);
    expect(u).toBeCloseTo(eu, 3);
    expect(v).toBeCloseTo(ev, 3);
  });

  it("weights closer points more heavily", () => {
    const points: WindPoint[] = [
      { lat: 13, lon: 100, speed: 10, direction: 0 },   // close
      { lat: 20, lon: 110, speed: 10, direction: 180 },  // far
    ];
    // Query near the first point
    const [u, v] = interpolateWind(13.1, 100.1, points);
    const [nearU, nearV] = windToUV(10, 0);
    // Should be much closer to the first point's vector
    expect(Math.sign(v)).toBe(Math.sign(nearV));
  });

  it("equal distance from two opposing winds yields near-zero", () => {
    const points: WindPoint[] = [
      { lat: 10, lon: 100, speed: 10, direction: 0 },
      { lat: 20, lon: 100, speed: 10, direction: 180 },
    ];
    // Midpoint
    const [u, v] = interpolateWind(15, 100, points);
    expect(Math.abs(u)).toBeLessThan(0.1);
    expect(Math.abs(v)).toBeLessThan(0.1);
  });
});
