import type { EconomicData } from "@/types";

const FETCH_TIMEOUT_MS = 10_000;

async function fetchWithTimeout(url: string, timeout = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const resp = await fetch(url, { signal: controller.signal });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchSET(): Promise<EconomicData["set"]> {
  // Yahoo Finance API for SET index
  const resp = await fetchWithTimeout(
    "https://query1.finance.yahoo.com/v8/finance/chart/%5ESET.BK?range=1d&interval=1d"
  );
  const json = await resp.json();
  const result = json.chart?.result?.[0];
  const meta = result?.meta;
  if (!meta) return undefined;
  const price = meta.regularMarketPrice ?? 0;
  const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? price;
  const change = price - prevClose;
  const changePercent = prevClose ? (change / prevClose) * 100 : 0;
  return {
    price: Math.round(price * 100) / 100,
    change: Math.round(change * 100) / 100,
    changePercent: Math.round(changePercent * 100) / 100,
  };
}

async function fetchUSDTHB(): Promise<EconomicData["usdThb"]> {
  const resp = await fetchWithTimeout(
    "https://api.frankfurter.app/latest?from=USD&to=THB"
  );
  const json = await resp.json();
  const rate = json.rates?.THB;
  if (!rate) return undefined;
  return { rate: Math.round(rate * 100) / 100 };
}

async function fetchGold(): Promise<EconomicData["gold"]> {
  const resp = await fetchWithTimeout("https://api.chnwt.dev/thai-gold-api/latest");
  const json = await resp.json();
  const goldBar = json.response?.price?.gold_bar;
  if (!goldBar) return undefined;
  const barSell = typeof goldBar.sell === "string"
    ? Number(goldBar.sell.replace(/,/g, ""))
    : Number(goldBar.sell);
  if (isNaN(barSell)) return undefined;
  // API doesn't provide a change field directly, compute from buy/sell spread info
  const barBuy = typeof goldBar.buy === "string"
    ? Number(goldBar.buy.replace(/,/g, ""))
    : Number(goldBar.buy || 0);
  const change = barBuy ? barSell - barBuy : 0;
  return { barSell, change };
}

export async function fetchEconomic(): Promise<EconomicData> {
  const [setResult, usdResult, goldResult] = await Promise.allSettled([
    fetchSET(),
    fetchUSDTHB(),
    fetchGold(),
  ]);

  return {
    set: setResult.status === "fulfilled" ? setResult.value : undefined,
    usdThb: usdResult.status === "fulfilled" ? usdResult.value : undefined,
    gold: goldResult.status === "fulfilled" ? goldResult.value : undefined,
    updatedAt: new Date().toISOString(),
  };
}
