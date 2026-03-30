import concaveman from "concaveman";
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

function getMaxFrp(cluster: FireHotspot[]): number {
  let max = 0;
  for (const h of cluster) if (h.frp != null && h.frp > max) max = h.frp;
  return Math.round(max);
}

/**
 * Compute fire perimeters (แนวไฟ) using concave hull (alpha shapes).
 * Much tighter fit than convex hull — traces actual fire boundary.
 */
export function computeFireZones(hotspots: FireHotspot[]): GeoJSON.FeatureCollection {
  if (hotspots.length === 0) return { type: "FeatureCollection", features: [] };
  const clusters = clusterHotspots(hotspots);
  const features: GeoJSON.Feature[] = [];

  for (const cluster of clusters) {
    if (cluster.length < 3) continue;

    // Deduplicate coordinates (concaveman needs unique points)
    const seen = new Set<string>();
    const pts: number[][] = [];
    for (const h of cluster) {
      const key = `${h.lon.toFixed(5)},${h.lat.toFixed(5)}`;
      if (!seen.has(key)) { seen.add(key); pts.push([h.lon, h.lat]); }
    }
    if (pts.length < 3) continue;

    // Concave hull — concavity=2 (tighter fit), lengthThreshold=0 (no min edge)
    const hull = concaveman(pts, 2, 0);
    if (hull.length < 3) continue;

    // Close the ring
    const coords = hull.map(([x, y]) => [x, y] as [number, number]);
    if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) {
      coords.push(coords[0]);
    }

    const maxFrp = getMaxFrp(cluster);
    features.push({
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [coords] },
      properties: {
        pointCount: cluster.length,
        maxFrp,
        color: getZoneColor(cluster),
        label: `${cluster.length} จุด`,
      },
    });
  }
  return { type: "FeatureCollection", features };
}
