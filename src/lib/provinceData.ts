import type {
  ProvinceProperties,
  ProvinceThreatSummary,
  ProvinceThreatScore,
  FastData,
  SlowData,
  NewsArticle,
  FloodStation,
} from "@/types";

const LEVELS = [
  { name: "ปกติ", min: 0, color: "#00ff88", bg: "rgba(0,255,136,0.1)" },
  { name: "เฝ้าระวัง", min: 25, color: "#ffaa00", bg: "rgba(255,170,0,0.1)" },
  { name: "สูง", min: 55, color: "#ff6600", bg: "rgba(255,102,0,0.1)" },
  { name: "วิกฤต", min: 80, color: "#ff0044", bg: "rgba(255,0,68,0.1)" },
] as const;

function getLevel(score: number) {
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (score >= LEVELS[i].min) return LEVELS[i];
  }
  return LEVELS[0];
}

/** Parse bbox string "[minLon, minLat, maxLon, maxLat]" to number array */
export function parseBbox(bboxStr: string): [number, number, number, number] {
  try {
    const arr = JSON.parse(bboxStr);
    if (Array.isArray(arr) && arr.length === 4) return arr as [number, number, number, number];
  } catch { /* fallback */ }
  return [0, 0, 0, 0];
}

/** Fast point-in-bounding-box test (used as pre-filter) */
export function isPointInBbox(
  lat: number,
  lon: number,
  bbox: [number, number, number, number]
): boolean {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  return lon >= minLon && lon <= maxLon && lat >= minLat && lat <= maxLat;
}

/** Ray-casting point-in-polygon test for a single ring */
function isPointInRing(lat: number, lon: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Point-in-polygon test supporting Polygon and MultiPolygon coordinates */
export function isPointInProvince(
  lat: number,
  lon: number,
  geometry: number[][][] | number[][][][]
): boolean {
  if (!geometry || geometry.length === 0) return false;

  // Detect Polygon vs MultiPolygon by checking depth
  // Polygon: number[][][] (array of rings, each ring is array of [lon,lat])
  // MultiPolygon: number[][][][] (array of polygons)
  const first = geometry[0];
  if (!Array.isArray(first) || first.length === 0) return false;

  const isMulti = Array.isArray(first[0]) && Array.isArray(first[0][0]);

  if (isMulti) {
    // MultiPolygon
    for (const polygon of geometry as number[][][][]) {
      // Check outer ring (index 0), exclude holes (index 1+)
      if (polygon.length > 0 && isPointInRing(lat, lon, polygon[0])) {
        let inHole = false;
        for (let h = 1; h < polygon.length; h++) {
          if (isPointInRing(lat, lon, polygon[h])) { inHole = true; break; }
        }
        if (!inHole) return true;
      }
    }
    return false;
  }

  // Polygon: outer ring + optional holes
  const rings = geometry as number[][][];
  if (!isPointInRing(lat, lon, rings[0])) return false;
  for (let h = 1; h < rings.length; h++) {
    if (isPointInRing(lat, lon, rings[h])) return false;
  }
  return true;
}

/** Test if a point is inside a province — uses polygon if available, falls back to bbox */
function isPointInProvinceArea(
  lat: number,
  lon: number,
  bbox: [number, number, number, number],
  geometry?: number[][][] | number[][][][]
): boolean {
  // Fast bbox pre-filter
  if (!isPointInBbox(lat, lon, bbox)) return false;
  // Accurate polygon test if geometry available
  if (geometry) return isPointInProvince(lat, lon, geometry);
  return true; // bbox-only fallback
}

/** Filter news articles by province name (Thai or English) in title + summary */
export function filterNewsByProvince(
  articles: NewsArticle[],
  properties: ProvinceProperties
): NewsArticle[] {
  const nameTh = properties.name_th.toLowerCase();
  const nameEn = properties.name_en.toLowerCase();

  return articles.filter((article) => {
    const text = `${article.title} ${article.summary}`.toLowerCase();
    return text.includes(nameTh) || text.includes(nameEn);
  });
}

/** Filter flood stations by province name match or polygon/bbox fallback */
function filterFloodStations(
  stations: FloodStation[],
  properties: ProvinceProperties,
  bbox: [number, number, number, number],
  geometry?: number[][][] | number[][][][]
): FloodStation[] {
  const provinceTh = properties.name_th;
  const provinceEn = properties.name_en.toLowerCase();

  // First try matching on province field
  const byName = stations.filter(
    (s) =>
      s.province_th === provinceTh ||
      s.province.toLowerCase() === provinceEn
  );
  if (byName.length > 0) return byName;

  // Fallback to polygon/bbox
  return stations.filter((s) => isPointInProvinceArea(s.lat, s.lon, bbox, geometry));
}

/** Aggregate all data sources for a province */
export function aggregateProvinceData(
  properties: ProvinceProperties,
  fastData: FastData | null,
  slowData: SlowData | null
): ProvinceThreatSummary {
  const bbox = parseBbox(properties.bbox);
  const geom = properties.geometry;

  // Fires
  const fires = slowData?.fires || [];
  const fireCount = fires.filter((f) => isPointInProvinceArea(f.lat, f.lon, bbox, geom)).length;

  // Flood
  const allFloodStations = slowData?.flood || [];
  const floodStations = filterFloodStations(allFloodStations, properties, bbox, geom);
  const criticalFloods = floodStations.filter((s) => s.critical).length;
  const normalFloods = floodStations.length - criticalFloods;

  // Air quality
  const allAq = slowData?.air_quality || [];
  const aqStations = allAq.filter((s) => isPointInProvinceArea(s.lat, s.lon, bbox, geom));
  const avgPm25 =
    aqStations.length > 0
      ? aqStations.reduce((sum, s) => sum + (s.pm25 || 0), 0) / aqStations.length
      : 0;

  // Earthquakes
  const allQuakes = slowData?.earthquakes || [];
  const earthquakes = allQuakes.filter((q) => isPointInProvinceArea(q.lat, q.lon, bbox, geom));
  const maxMagnitude = earthquakes.reduce((max, q) => Math.max(max, q.magnitude || 0), 0);

  // Flights
  const flights = fastData?.flights;
  const allFlights = [
    ...(flights?.domestic || []),
    ...(flights?.international || []),
    ...(flights?.private || []),
  ];
  const flightCount = allFlights.filter((f) => isPointInProvinceArea(f.lat, f.lon, bbox, geom)).length;

  // Military
  const militaryFlights = [
    ...(flights?.military || []),
    ...(fastData?.military_flights || []),
  ];
  const militaryCount = militaryFlights.filter((f) => isPointInProvinceArea(f.lat, f.lon, bbox, geom)).length;

  // Ships
  const allShips = slowData?.ships || [];
  const shipCount = allShips.filter((s) => isPointInProvinceArea(s.lat, s.lon, bbox, geom)).length;

  // News
  const matchingNews = filterNewsByProvince(slowData?.news || [], properties);

  return {
    fireCount,
    floodStations,
    criticalFloods,
    normalFloods,
    aqStations,
    avgPm25,
    earthquakes,
    maxMagnitude,
    flightCount,
    militaryCount,
    shipCount,
    matchingNews,
  };
}

/** Calculate per-signal and composite threat scores for a province */
export function calculateProvinceThreatScore(
  summary: ProvinceThreatSummary
): ProvinceThreatScore {
  // Fire: 100+ fires in one province = critical
  const fire = Math.min(100, Math.round((summary.fireCount / 100) * 100));

  // Flood: critical×20 + normal×5
  const flood = Math.min(100, Math.round(summary.criticalFloods * 20 + summary.normalFloods * 5));

  // AQ: same as national ThreatIndex
  const airQuality = Math.min(100, Math.max(0, Math.round((summary.avgPm25 - 15) * 1.5)));

  // Seismic: same as national
  const seismic =
    summary.earthquakes.length === 0
      ? 0
      : Math.min(100, Math.max(0, Math.round((summary.maxMagnitude - 2) * 25)));

  // Composite: fire×0.3 + flood×0.25 + AQ×0.25 + seismic×0.2
  const composite = Math.round(
    fire * 0.3 + flood * 0.25 + airQuality * 0.25 + seismic * 0.2
  );

  return {
    fire,
    flood,
    airQuality,
    seismic,
    composite,
    level: getLevel(composite),
  };
}
