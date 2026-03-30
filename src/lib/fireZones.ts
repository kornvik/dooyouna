import type { FireHotspot } from "@/types";

/**
 * Grid-based spatial clustering — O(n) average instead of O(n²).
 * Assigns each point to a grid cell of size `radius`, then merges
 * adjacent cells using union-find for transitive grouping.
 */
export function clusterHotspots(points: FireHotspot[], radius = 0.05): FireHotspot[][] {
  if (points.length === 0) return [];

  // Union-find
  const parent = new Int32Array(points.length);
  for (let i = 0; i < points.length; i++) parent[i] = i;
  function find(x: number): number {
    while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
    return x;
  }
  function union(a: number, b: number) {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  }

  // Grid cell → list of point indices
  const invR = 1 / radius;
  const grid = new Map<string, number[]>();
  for (let i = 0; i < points.length; i++) {
    const cx = Math.floor(points[i].lon * invR);
    const cy = Math.floor(points[i].lat * invR);
    const key = `${cx},${cy}`;
    const cell = grid.get(key);
    if (cell) { cell.push(i); } else { grid.set(key, [i]); }
  }

  // For each cell, union points within the cell and with adjacent cells
  for (const [key, indices] of grid) {
    // Union all points in same cell
    for (let i = 1; i < indices.length; i++) union(indices[0], indices[i]);

    const [cxs, cys] = key.split(",");
    const cx = Number(cxs), cy = Number(cys);
    // Check 4 neighbors (right, up, up-right, up-left) to avoid double-checking
    const neighbors = [[1,0],[0,1],[1,1],[-1,1]];
    for (const [dx, dy] of neighbors) {
      const nkey = `${cx + dx},${cy + dy}`;
      const nIndices = grid.get(nkey);
      if (!nIndices) continue;
      // Union the first point of each cell (representative),
      // then check actual distances for border points
      for (const ni of nIndices) {
        for (const ci of indices) {
          if (Math.abs(points[ci].lat - points[ni].lat) < radius &&
              Math.abs(points[ci].lon - points[ni].lon) < radius) {
            union(ci, ni);
            break; // one connection bridges the clusters
          }
        }
      }
    }
  }

  // Group by root
  const groups = new Map<number, FireHotspot[]>();
  for (let i = 0; i < points.length; i++) {
    const root = find(i);
    const g = groups.get(root);
    if (g) { g.push(points[i]); } else { groups.set(root, [points[i]]); }
  }
  return Array.from(groups.values());
}

function cross(O: [number, number], A: [number, number], B: [number, number]): number {
  return (A[0] - O[0]) * (B[1] - O[1]) - (A[1] - O[1]) * (B[0] - O[0]);
}

/** Monotone chain convex hull. Returns vertices in CCW order. */
export function convexHull(points: [number, number][]): [number, number][] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const lower: [number, number][] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: [number, number][] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pts[i]) <= 0) upper.pop();
    upper.push(pts[i]);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function bufferHull(hull: [number, number][], buffer = 0.01): [number, number][] {
  const cx = hull.reduce((s, p) => s + p[0], 0) / hull.length;
  const cy = hull.reduce((s, p) => s + p[1], 0) / hull.length;
  return hull.map(([x, y]) => {
    const dx = x - cx, dy = y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    return [x + (dx / dist) * buffer, y + (dy / dist) * buffer] as [number, number];
  });
}

function getZoneColor(cluster: FireHotspot[]): string {
  const now = Date.now();
  const ages = cluster
    .filter((h) => h.acq_date && h.acq_time)
    .map((h) => {
      const hh = h.acq_time!.slice(0, 2);
      const mm = h.acq_time!.slice(3, 5) || "00";
      return (now - new Date(`${h.acq_date}T${hh}:${mm}:00Z`).getTime()) / 3600000;
    });
  const avgAge = ages.length > 0 ? ages.reduce((a, b) => a + b, 0) / ages.length : 12;
  if (avgAge < 6) return "#ff2200";
  if (avgAge < 12) return "#ff8800";
  return "#aa6600";
}

export function computeFireZones(hotspots: FireHotspot[]): GeoJSON.FeatureCollection {
  if (hotspots.length === 0) return { type: "FeatureCollection", features: [] };
  const clusters = clusterHotspots(hotspots);
  const features: GeoJSON.Feature[] = [];
  for (const cluster of clusters) {
    if (cluster.length < 3) continue;
    const pts: [number, number][] = cluster.map((h) => [h.lon, h.lat]);
    const hull = convexHull(pts);
    if (hull.length < 3) continue;
    const buffered = bufferHull(hull);
    const coords = [...buffered, buffered[0]];
    const frps = cluster.filter((h) => h.frp != null).map((h) => h.frp!);
    const avgFrp = frps.length > 0 ? Math.round(frps.reduce((a, b) => a + b, 0) / frps.length) : 0;
    features.push({
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [coords] },
      properties: {
        pointCount: cluster.length,
        avgFrp,
        color: getZoneColor(cluster),
        label: `🔥 ${cluster.length} จุด`,
      },
    });
  }
  return { type: "FeatureCollection", features };
}
