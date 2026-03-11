import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchShips } from "../ships";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("fetchShips", () => {
  it("returns empty array when AIS_API_KEY is not set", async () => {
    vi.stubEnv("AIS_API_KEY", "");
    const result = await fetchShips();
    expect(result).toEqual([]);
  });
});
