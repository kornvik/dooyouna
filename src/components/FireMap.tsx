"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import mlcontour from "maplibre-contour";
import type { FireHotspot } from "@/types";

interface FireMapProps {
  fires: FireHotspot[];
}

function createFireIcon(size = 28): { width: number; height: number; data: Uint8ClampedArray } {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const s = size;
  ctx.fillStyle = "#ff4400";
  ctx.beginPath();
  ctx.moveTo(s * 0.5, s * 0.05);
  ctx.bezierCurveTo(s * 0.3, s * 0.3, s * 0.15, s * 0.55, s * 0.2, s * 0.75);
  ctx.bezierCurveTo(s * 0.22, s * 0.88, s * 0.35, s * 0.95, s * 0.5, s * 0.95);
  ctx.bezierCurveTo(s * 0.65, s * 0.95, s * 0.78, s * 0.88, s * 0.8, s * 0.75);
  ctx.bezierCurveTo(s * 0.85, s * 0.55, s * 0.7, s * 0.3, s * 0.5, s * 0.05);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#ffaa00";
  ctx.beginPath();
  ctx.moveTo(s * 0.5, s * 0.3);
  ctx.bezierCurveTo(s * 0.38, s * 0.5, s * 0.32, s * 0.65, s * 0.35, s * 0.78);
  ctx.bezierCurveTo(s * 0.37, s * 0.88, s * 0.43, s * 0.92, s * 0.5, s * 0.92);
  ctx.bezierCurveTo(s * 0.57, s * 0.92, s * 0.63, s * 0.88, s * 0.65, s * 0.78);
  ctx.bezierCurveTo(s * 0.68, s * 0.65, s * 0.62, s * 0.5, s * 0.5, s * 0.3);
  ctx.closePath();
  ctx.fill();
  const imageData = ctx.getImageData(0, 0, size, size);
  return { width: size, height: size, data: imageData.data };
}

// Elevation color ramp: decode terrarium DEM → hypsometric tint
let elevProtocolRegistered = false;
function registerElevationProtocol() {
  if (elevProtocolRegistered) return;
  elevProtocolRegistered = true;

  const RAMP: [number, number, number, number][] = [
    // [maxElev, R, G, B] — vivid for dark basemap
    [0, 10, 40, 20],        // sea level — very dark
    [30, 15, 80, 30],       // coastal — dark green
    [100, 30, 140, 40],     // lowland — forest green
    [250, 60, 180, 50],     // plains — bright green
    [500, 140, 200, 40],    // low hills — lime
    [800, 220, 200, 30],    // hills — bright yellow
    [1200, 240, 140, 30],   // mountains — vivid orange
    [1800, 220, 70, 30],    // high mountains — red-orange
    [2500, 200, 200, 200],  // alpine — silver
    [4000, 255, 255, 255],  // peaks — white
  ];

  function elevToColor(h: number): [number, number, number] {
    if (h <= RAMP[0][0]) return [RAMP[0][1], RAMP[0][2], RAMP[0][3]];
    for (let i = 1; i < RAMP.length; i++) {
      if (h <= RAMP[i][0]) {
        const t = (h - RAMP[i - 1][0]) / (RAMP[i][0] - RAMP[i - 1][0]);
        return [
          RAMP[i - 1][1] + (RAMP[i][1] - RAMP[i - 1][1]) * t,
          RAMP[i - 1][2] + (RAMP[i][2] - RAMP[i - 1][2]) * t,
          RAMP[i - 1][3] + (RAMP[i][3] - RAMP[i - 1][3]) * t,
        ];
      }
    }
    const last = RAMP[RAMP.length - 1];
    return [last[1], last[2], last[3]];
  }

  maplibregl.addProtocol("elevcolor", async (params, abortController) => {
    const url = params.url.replace("elevcolor://", "https://");
    const resp = await fetch(url, { signal: abortController.signal });
    const blob = await resp.blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = img.data;

    for (let i = 0; i < d.length; i += 4) {
      // Terrarium decode: height = (R * 256 + G + B / 256) - 32768
      const h = (d[i] * 256 + d[i + 1] + d[i + 2] / 256) - 32768;
      if (h <= 0) {
        d[i + 3] = 0; // hide water/sea level
      } else {
        const [r, g, b] = elevToColor(h);
        d[i] = r;
        d[i + 1] = g;
        d[i + 2] = b;
        d[i + 3] = 70;
      }
    }

    ctx.putImageData(img, 0, 0);
    const result = await canvas.convertToBlob({ type: "image/png" });
    return { data: await result.arrayBuffer() };
  });
}

const POPUP_STYLE = 'style="color:#e0e7ef;font-family:monospace;font-size:11px;padding:4px;"';

function frpToLevel(frp: number): string {
  if (frp >= 100) return "Lv.5 รุนแรงมาก";
  if (frp >= 50) return "Lv.4 รุนแรง";
  if (frp >= 10) return "Lv.3 ปานกลาง";
  if (frp >= 1) return "Lv.2 เบา";
  return "Lv.1 ต่ำ";
}

function formatFirePopup(p: Record<string, unknown>): string {
  const frp = Number(p.frp || 0);
  const conf = p.confidence || "N/A";
  const date = String(p.acq_date || "");
  const time = String(p.acq_time || "");
  // Convert UTC to Thai time (UTC+7)
  let thaiTimeStr = "N/A";
  if (date && time) {
    const hh = time.slice(0, 2);
    const mm = time.slice(3, 5) || "00";
    const utcMs = new Date(`${date}T${hh}:${mm}:00Z`).getTime();
    const thai = new Date(utcMs + 7 * 3600_000);
    const nowThai = new Date(Date.now() + 7 * 3600_000);
    const isToday = thai.getUTCDate() === nowThai.getUTCDate() && thai.getUTCMonth() === nowThai.getUTCMonth();
    const prefix = isToday ? "วันนี้" : "เมื่อวาน";
    const tTime = `${String(thai.getUTCHours()).padStart(2, "0")}:${String(thai.getUTCMinutes()).padStart(2, "0")}`;
    thaiTimeStr = `${prefix} ${tTime}`;
  }
  const level = frpToLevel(frp);
  const lat = Number(p.lat).toFixed(4);
  const lon = Number(p.lon).toFixed(4);
  const gmapUrl = `https://www.google.com/maps?q=${lat},${lon}`;
  return `<div ${POPUP_STYLE}>
    <div style="color:#ff4444;font-weight:bold;">🔥 ${level}</div>
    <div>FRP: ${frp.toFixed(1)} MW</div>
    <div>ความเชื่อมั่น: ${conf === "high" ? "สูง" : conf === "nominal" ? "ปกติ" : conf === "low" ? "ต่ำ" : conf}</div>
    <div>ตรวจพบ: ${thaiTimeStr}</div>
    <div>พิกัด: <a href="${gmapUrl}" target="_blank" rel="noopener" style="color:#66bbff;text-decoration:underline;">${lat}°N, ${lon}°E</a></div>
  </div>`;
}

function toFireFeatures(fires: FireHotspot[]): GeoJSON.FeatureCollection {
  const now = Date.now();
  return {
    type: "FeatureCollection",
    features: fires
      .filter((f) => f.lat != null && f.lon != null)
      .map((f) => {
        let ageHours = 12; // default if no time info
        if (f.acq_date && f.acq_time) {
          const hh = f.acq_time.slice(0, 2);
          const mm = f.acq_time.slice(3, 5) || "00";
          const detectMs = new Date(`${f.acq_date}T${hh}:${mm}:00Z`).getTime();
          ageHours = Math.max(0, (now - detectMs) / 3600_000);
        }
        return {
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: [f.lon, f.lat] },
          properties: { ...f, age_hours: Math.round(ageHours * 10) / 10 },
        };
      }),
  };
}

export default function FireMap({ fires }: FireMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        glyphs: "https://cdn.protomaps.com/fonts/pbf/{fontstack}/{range}.pbf",
        sources: {
          "carto-dark": {
            type: "raster",
            tiles: ["https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png"],
            tileSize: 256,
            attribution: "&copy; CARTO",
          },
        },
        layers: [{ id: "carto-tiles", type: "raster", source: "carto-dark" }],
      },
      center: [100.5, 15.0],
      zoom: 6,
      maxZoom: 18,
      maxBounds: [85, -5, 120, 28],
      pitch: 45,
      bearing: 0,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "top-left");

    registerElevationProtocol();

    // Suppress non-fatal tile/font fetch errors (auto-retried by MapLibre)
    const origError = console.error;
    console.error = (...args: unknown[]) => {
      const first = args[0];
      if (first && typeof first === "object" && "message" in first && (first as { message: string }).message === "Failed to fetch") return;
      origError.apply(console, args);
    };
    map.on("error", (e) => {
      if (e?.error?.message === "Failed to fetch") return;
    });

    map.on("load", () => {
      // 3D terrain
      map.addSource("terrain-dem", {
        type: "raster-dem",
        tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
        tileSize: 256,
        encoding: "terrarium",
      });

      map.setTerrain({ source: "terrain-dem", exaggeration: 1.5 });

      // Elevation color fill (hypsometric tint)
      map.addSource("elevation-color", {
        type: "raster",
        tiles: ["elevcolor://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
        tileSize: 256,
      });
      map.addLayer({
        id: "elevation-color-layer",
        type: "raster",
        source: "elevation-color",
        paint: { "raster-opacity": 0.4 },
      });

      // Contour lines from DEM
      const demSource = new mlcontour.DemSource({
        url: "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",
        encoding: "terrarium",
        maxzoom: 12,
      });
      demSource.setupMaplibre(maplibregl);

      map.addSource("contour-source", {
        type: "vector",
        tiles: [demSource.contourProtocolUrl({
          overzoom: 1,
          thresholds: {
            6: [500],
            8: [500, 200],
            10: [500, 100],
            12: [200, 50],
          },
          elevationKey: "ele",
          levelKey: "level",
          contourLayer: "contours",
        })],
        maxzoom: 13,
      });

      // Thin lines for minor contours
      map.addLayer({
        id: "contour-lines",
        type: "line",
        source: "contour-source",
        "source-layer": "contours",
        filter: ["==", ["get", "level"], 0],
        paint: {
          "line-color": "rgba(180, 160, 120, 0.3)",
          "line-width": 0.5,
        },
      });

      // Thicker lines for major contours
      map.addLayer({
        id: "contour-lines-major",
        type: "line",
        source: "contour-source",
        "source-layer": "contours",
        filter: ["==", ["get", "level"], 1],
        paint: {
          "line-color": "rgba(180, 160, 120, 0.5)",
          "line-width": 1,
        },
      });

      // Elevation labels on major contours
      map.addLayer({
        id: "contour-labels",
        type: "symbol",
        source: "contour-source",
        "source-layer": "contours",
        filter: ["==", ["get", "level"], 1],
        minzoom: 5,
        layout: {
          "symbol-placement": "line",
          "text-field": ["concat", ["to-string", ["get", "ele"]], " ม."],
          "text-size": ["interpolate", ["linear"], ["zoom"], 5, 10, 8, 12, 12, 14],
          "text-font": ["Noto Sans Medium"],
          "text-max-angle": 30,
          "text-padding": 15,
        },
        paint: {
          "text-color": "rgba(230, 210, 170, 0.9)",
          "text-halo-color": "rgba(0, 0, 0, 0.9)",
          "text-halo-width": 1.5,
        },
      });

      // Fire points source — clustered
      map.addSource("fire-points", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        cluster: true,
        clusterRadius: 30,
        clusterMaxZoom: 9,
        clusterProperties: {
          min_age: ["min", ["get", "age_hours"]],
          max_frp: ["max", ["coalesce", ["get", "frp"], 0]],
        },
      });

      // Fire icon
      if (!map.hasImage("fire-icon")) map.addImage("fire-icon", createFireIcon(28), { sdf: false });

      // Cluster fire icons with max level label
      map.addLayer({
        id: "fire-clusters",
        type: "symbol",
        source: "fire-points",
        filter: ["has", "point_count"],
        layout: {
          "icon-image": "fire-icon",
          "icon-size": [
            "interpolate", ["linear"], ["get", "point_count"],
            2, 0.6, 50, 1.2, 200, 1.8, 1000, 2.5,
          ],
          "icon-allow-overlap": true,
          "text-field": [
            "concat",
            "Lv.",
            ["step", ["get", "max_frp"], "1", 1, "2", 10, "3", 50, "4", 100, "5"],
          ],
          "text-size": 10,
          "text-font": ["Noto Sans Bold"],
          "text-anchor": "top",
          "text-offset": [0, 1.2],
          "text-allow-overlap": true,
        },
        paint: {
          "icon-opacity": [
            "interpolate", ["linear"], ["get", "min_age"],
            0, 1, 6, 0.8, 12, 0.5, 24, 0.3,
          ],
          "text-color": "#ffffff",
          "text-halo-color": "rgba(0,0,0,0.8)",
          "text-halo-width": 1,
        },
      });

      // Individual fire icons (unclustered) with level label at higher zoom
      map.addLayer({
        id: "fire-points-layer",
        type: "symbol",
        source: "fire-points",
        filter: ["!", ["has", "point_count"]],
        layout: {
          "icon-image": "fire-icon",
          "icon-size": [
            "interpolate", ["linear"], ["zoom"],
            4, 0.3, 8, 0.6, 12, 0.9,
          ],
          "icon-allow-overlap": true,
          "text-field": [
            "step", ["zoom"],
            "", // no label at low zoom
            9, ["concat", "Lv.", ["step", ["coalesce", ["get", "frp"], 0], "1", 1, "2", 10, "3", 50, "4", 100, "5"]],
          ],
          "text-size": 9,
          "text-font": ["Noto Sans Bold"],
          "text-anchor": "top",
          "text-offset": [0, 1],
          "text-allow-overlap": true,
        },
        paint: {
          "icon-opacity": [
            "interpolate", ["linear"], ["coalesce", ["get", "age_hours"], 12],
            0, 1, 6, 0.8, 12, 0.4, 24, 0.2,
          ],
          "text-color": "#ffffff",
          "text-halo-color": "rgba(0,0,0,0.8)",
          "text-halo-width": 1,
          "text-opacity": [
            "interpolate", ["linear"], ["coalesce", ["get", "age_hours"], 12],
            0, 1, 6, 0.8, 12, 0.4, 24, 0.2,
          ],
        },
      });

      // Borders — added after fire layers so they render on top
      fetch("/geo/thailand.json")
        .then(r => r.json())
        .then((data) => {
          if (map.getSource("country-borders")) return;
          map.addSource("country-borders", { type: "geojson", data });
          map.addLayer({
            id: "country-borders-glow",
            type: "line",
            source: "country-borders",
            paint: { "line-color": "rgba(255, 200, 0, 0.12)", "line-width": 6, "line-blur": 4 },
          });
          map.addLayer({
            id: "country-borders-line",
            type: "line",
            source: "country-borders",
            paint: { "line-color": "rgba(255, 200, 0, 0.7)", "line-width": 3 },
          });
        })
        .catch(() => {});

      fetch("/geo/thailand-provinces.geojson")
        .then(r => r.json())
        .then((data) => {
          if (map.getSource("provinces")) return;
          map.addSource("provinces", { type: "geojson", data });
          map.addLayer({
            id: "provinces-line",
            type: "line",
            source: "provinces",
            paint: { "line-color": "rgba(0, 255, 136, 0.45)", "line-width": 1.5 },
          });
          map.addLayer({
            id: "provinces-label",
            type: "symbol",
            source: "provinces",
            minzoom: 6,
            layout: {
              "text-field": ["get", "name_th"],
              "text-size": 12,
              "text-font": ["Open Sans Regular"],
              "text-allow-overlap": false,
              "text-pitch-alignment": "map",
              "text-rotation-alignment": "map",
            },
            paint: {
              "text-color": "rgba(0, 255, 136, 0.7)",
              "text-halo-color": "rgba(10, 14, 23, 0.9)",
              "text-halo-width": 1.5,
            },
          });
        })
        .catch(() => {});

      // Click cluster → zoom in
      map.on("click", "fire-clusters", (e) => {
        const feat = e.features?.[0];
        if (!feat) return;
        const geom = feat.geometry;
        if (geom.type !== "Point") return;
        const src = map.getSource("fire-points") as maplibregl.GeoJSONSource;
        src.getClusterExpansionZoom(feat.properties.cluster_id as number).then((zoom) => {
          map.easeTo({ center: geom.coordinates as [number, number], zoom: zoom + 0.5 });
        });
      });

      // Click individual point → popup
      map.on("click", "fire-points-layer", (e) => {
        const feat = e.features?.[0];
        if (!feat) return;
        if (popupRef.current) popupRef.current.remove();
        const geom = feat.geometry;
        if (geom.type !== "Point") return;
        popupRef.current = new maplibregl.Popup({ maxWidth: "250px", offset: 10 })
          .setLngLat(geom.coordinates as [number, number])
          .setHTML(formatFirePopup(feat.properties as Record<string, unknown>))
          .addTo(map);
      });

      map.on("mouseenter", "fire-clusters", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "fire-clusters", () => { map.getCanvas().style.cursor = ""; });
      map.on("mouseenter", "fire-points-layer", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "fire-points-layer", () => { map.getCanvas().style.cursor = ""; });
    });

    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; console.error = origError; };
  }, []);

  // Update fire points + zones — retry until map is ready
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const update = () => {
      const pointsSrc = map.getSource("fire-points") as maplibregl.GeoJSONSource | undefined;
      if (pointsSrc) pointsSrc.setData(toFireFeatures(fires));
    };

    if (map.isStyleLoaded() && map.getSource("fire-points")) {
      update();
    } else {
      map.once("load", update);
    }
  }, [fires]);

  return <div ref={containerRef} className="w-full h-full" />;
}
