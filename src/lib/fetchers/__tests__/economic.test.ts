import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchEconomic } from "../economic";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("fetchEconomic", () => {
  it("returns SET, USD/THB, and gold data when all APIs succeed", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("yahoo")) {
        return {
          ok: true,
          json: async () => ({
            chart: {
              result: [{
                meta: {
                  regularMarketPrice: 1350.50,
                  chartPreviousClose: 1345.00,
                },
              }],
            },
          }),
        };
      }
      if (url.includes("frankfurter")) {
        return {
          ok: true,
          json: async () => ({ rates: { THB: 34.85 } }),
        };
      }
      if (url.includes("chnwt")) {
        return {
          ok: true,
          json: async () => ({
            response: {
              price: {
                gold_bar: { buy: "77,500.00", sell: "77,700.00" },
              },
            },
          }),
        };
      }
      return { ok: false, json: async () => ({}) };
    }) as unknown as typeof fetch);

    const result = await fetchEconomic();

    expect(result.set).toBeDefined();
    expect(result.set!.price).toBe(1350.5);
    expect(result.set!.change).toBeCloseTo(5.5, 1);
    expect(result.usdThb).toBeDefined();
    expect(result.usdThb!.rate).toBe(34.85);
    expect(result.gold).toBeDefined();
    expect(result.gold!.barSell).toBe(77700);
    expect(result.gold!.change).toBe(200); // sell - buy
    expect(result.updatedAt).toBeTruthy();
  });

  it("returns partial data when one API fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("yahoo")) {
        throw new Error("Network error");
      }
      if (url.includes("frankfurter")) {
        return {
          ok: true,
          json: async () => ({ rates: { THB: 34.50 } }),
        };
      }
      if (url.includes("chnwt")) {
        return {
          ok: true,
          json: async () => ({
            response: {
              price: {
                gold_bar: { buy: "77,500.00", sell: "77,700.00" },
              },
            },
          }),
        };
      }
      return { ok: false, json: async () => ({}) };
    }) as unknown as typeof fetch);

    const result = await fetchEconomic();

    expect(result.set).toBeUndefined();
    expect(result.usdThb).toBeDefined();
    expect(result.gold).toBeDefined();
  });

  it("returns all undefined when all APIs fail", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("All down");
    }));

    const result = await fetchEconomic();

    expect(result.set).toBeUndefined();
    expect(result.usdThb).toBeUndefined();
    expect(result.gold).toBeUndefined();
    expect(result.updatedAt).toBeTruthy();
  });

  it("handles gold price without comma formatting", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("chnwt")) {
        return {
          ok: true,
          json: async () => ({
            response: {
              price: {
                gold_bar: { buy: 77500, sell: 77700 },
              },
            },
          }),
        };
      }
      throw new Error("skip");
    }) as unknown as typeof fetch);

    const result = await fetchEconomic();

    expect(result.gold).toBeDefined();
    expect(result.gold!.barSell).toBe(77700);
    expect(result.gold!.change).toBe(200);
  });
});
