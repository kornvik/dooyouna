import type { FireHotspot } from "@/types";

export type LandUseClass = "forest" | "cropland" | "shrubland" | "grassland" | "urban" | "water" | "other";

// ESA WorldCover 2021 class colors (RGB) — from styled WMTS tiles
const CLASS_COLORS: [number, number, number, LandUseClass][] = [
  [0, 100, 0, "forest"],       // Tree cover #006400
  [0, 207, 117, "forest"],     // Mangroves #00cf75
  [240, 150, 255, "cropland"], // Cropland #f096ff
  [255, 187, 34, "shrubland"], // Shrubland #ffbb22
  [255, 255, 76, "grassland"], // Grassland #ffff4c
  [250, 0, 0, "urban"],       // Built-up #fa0000
  [0, 100, 200, "water"],     // Water #0064c8
  [0, 150, 160, "water"],     // Wetland #0096a0
  [180, 180, 180, "other"],   // Bare #b4b4b4
];

function classifyColor(r: number, g: number, b: number): LandUseClass {
  let minDist = Infinity;
  let best: LandUseClass = "other";
  for (const [cr, cg, cb, cls] of CLASS_COLORS) {
    const d = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2;
    if (d < minDist) {
      minDist = d;
      best = cls;
    }
  }
  return minDist < 6400 ? best : "other"; // threshold = 80^2
}

// Lat/lon → Web Mercator tile + pixel offset
function latLonToTilePixel(lat: number, lon: number, zoom: number) {
  const n = 2 ** zoom;
  const tx = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const rawY = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  const ty = Math.floor(rawY);
  const px = Math.min(255, Math.floor((((lon + 180) / 360) * n - tx) * 256));
  const py = Math.min(255, Math.floor((rawY - ty) * 256));
  return { tx, ty, px, py };
}

async function fetchTileImage(tx: number, ty: number, zoom: number): Promise<ImageData | null> {
  const url = `https://services.terrascope.be/wmts/v2?layer=WORLDCOVER_2021_MAP&style=&tilematrixset=EPSG:3857&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image/png&TileMatrix=EPSG:3857:${zoom}&TileCol=${tx}&TileRow=${ty}`;
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!resp.ok) return null;
    const blob = await resp.blob();
    const bmp = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(256, 256);
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(bmp, 0, 0);
    return ctx.getImageData(0, 0, 256, 256);
  } catch {
    return null;
  }
}

function distKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface SpreadAlert {
  croplandFires: FireHotspot[];
  forestFires: FireHotspot[];
  center: { lat: number; lon: number };
  source: { lat: number; lon: number }; // earliest cropland fire (origin)
  cropFirstTime: string;
  forestFirstTime: string;
  delayHours: number;
}

export interface LandUseAnalysis {
  fireClasses: Map<FireHotspot, LandUseClass>;
  alerts: SpreadAlert[];
  forestCount: number;
  croplandCount: number;
}

function getDetectMs(f: FireHotspot): number | null {
  if (!f.acq_date || !f.acq_time) return null;
  const hh = f.acq_time.slice(0, 2);
  const mm = f.acq_time.slice(3, 5) || "00";
  return new Date(`${f.acq_date}T${hh}:${mm}:00Z`).getTime();
}

const THAI_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

function toThaiTimeStr(ms: number): string {
  const thai = new Date(ms + 7 * 3600_000);
  const nowThai = new Date(Date.now() + 7 * 3600_000);
  const d = thai.getUTCDate();
  const hh = String(thai.getUTCHours()).padStart(2, "0");
  const mm = String(thai.getUTCMinutes()).padStart(2, "0");
  const isToday = thai.getUTCDate() === nowThai.getUTCDate() && thai.getUTCMonth() === nowThai.getUTCMonth();
  const isYesterday = thai.getUTCDate() === nowThai.getUTCDate() - 1 && thai.getUTCMonth() === nowThai.getUTCMonth();
  if (isToday) return `วันนี้ ${hh}:${mm}`;
  if (isYesterday) return `เมื่อวาน ${hh}:${mm}`;
  return `${d} ${THAI_MONTHS[thai.getUTCMonth()]} ${hh}:${mm}`;
}

export async function analyzeLandUse(fires: FireHotspot[]): Promise<LandUseAnalysis> {
  const ZOOM = 10;
  const fireClasses = new Map<FireHotspot, LandUseClass>();

  // Group fires by tile
  const tileMap = new Map<string, { tx: number; ty: number; items: { fire: FireHotspot; px: number; py: number }[] }>();
  for (const f of fires) {
    const { tx, ty, px, py } = latLonToTilePixel(f.lat, f.lon, ZOOM);
    const key = `${tx}:${ty}`;
    if (!tileMap.has(key)) tileMap.set(key, { tx, ty, items: [] });
    tileMap.get(key)!.items.push({ fire: f, px, py });
  }

  // Fetch tiles in batches of 6
  const groups = Array.from(tileMap.values());
  for (let i = 0; i < groups.length; i += 6) {
    const batch = groups.slice(i, i + 6);
    const imgs = await Promise.allSettled(batch.map((g) => fetchTileImage(g.tx, g.ty, ZOOM)));

    for (let j = 0; j < batch.length; j++) {
      const imgResult = imgs[j];
      const imgData = imgResult.status === "fulfilled" ? imgResult.value : null;

      for (const { fire, px, py } of batch[j].items) {
        if (!imgData) {
          fireClasses.set(fire, "other");
          continue;
        }
        const idx = (py * 256 + px) * 4;
        fireClasses.set(fire, classifyColor(imgData.data[idx], imgData.data[idx + 1], imgData.data[idx + 2]));
      }
    }
  }

  // Detect temporal spread: cropland fires detected BEFORE nearby forest fires
  const RADIUS = 5; // km
  const cropFires = fires.filter((f) => fireClasses.get(f) === "cropland" && getDetectMs(f) !== null);
  const forestFires = fires.filter((f) => fireClasses.get(f) === "forest" && getDetectMs(f) !== null);

  const usedCrop = new Set<FireHotspot>();
  const usedForest = new Set<FireHotspot>();
  const alerts: SpreadAlert[] = [];

  for (const cf of cropFires) {
    if (usedCrop.has(cf)) continue;
    const cropTime = getDetectMs(cf)!;

    // Find forest fires that appeared AFTER this crop fire AND within radius
    const nearForest = forestFires.filter((ff) => {
      if (usedForest.has(ff)) return false;
      const forestTime = getDetectMs(ff)!;
      return forestTime > cropTime && distKm(cf.lat, cf.lon, ff.lat, ff.lon) < RADIUS;
    });
    if (nearForest.length === 0) continue;

    // Expand: grab nearby cropland fires that appeared at same time or earlier
    const clusterCrop = [cf];
    usedCrop.add(cf);
    for (const cf2 of cropFires) {
      if (usedCrop.has(cf2)) continue;
      const t2 = getDetectMs(cf2)!;
      if (t2 <= getDetectMs(nearForest[0])! && distKm(cf.lat, cf.lon, cf2.lat, cf2.lon) < RADIUS) {
        clusterCrop.push(cf2);
        usedCrop.add(cf2);
      }
    }
    nearForest.forEach((f) => usedForest.add(f));

    const earliestCrop = Math.min(...clusterCrop.map((f) => getDetectMs(f)!));
    const earliestForest = Math.min(...nearForest.map((f) => getDetectMs(f)!));
    const delayHours = (earliestForest - earliestCrop) / 3600_000;

    // Source = earliest cropland fire (the origin)
    const srcFire = clusterCrop.reduce((a, b) => (getDetectMs(a)! < getDetectMs(b)! ? a : b));

    const all = [...clusterCrop, ...nearForest];
    alerts.push({
      croplandFires: clusterCrop,
      forestFires: nearForest,
      center: {
        lat: all.reduce((s, f) => s + f.lat, 0) / all.length,
        lon: all.reduce((s, f) => s + f.lon, 0) / all.length,
      },
      source: { lat: srcFire.lat, lon: srcFire.lon },
      cropFirstTime: toThaiTimeStr(earliestCrop),
      forestFirstTime: toThaiTimeStr(earliestForest),
      delayHours: Math.round(delayHours * 10) / 10,
    });
  }

  // Sort by delay (shortest = most suspicious)
  alerts.sort((a, b) => a.delayHours - b.delayHours);

  return { fireClasses, alerts, forestCount: forestFires.length, croplandCount: cropFires.length };
}
