"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FastData, LayerName, SlowData } from "@/types";
import { fetchRegionDossier } from "@/lib/api";
import {
  POPUP_CONFIG,
  formatFlight, formatDomestic, formatMilitary, formatPrivate,
  formatEarthquake, formatAirQuality, formatShip,
  formatFlood,
} from "@/lib/popupFormatters";
import { getVipLabel } from "@/lib/vipWatchlist";

interface MapViewerProps {
  fastData: FastData | null;
  slowData: SlowData | null;
  activeLayers: Set<LayerName>;
}

const DEFAULT_CENTER: [number, number] = [102.5, 13.5];
const DEFAULT_ZOOM = 5.5;

// Render a plane icon to ImageData via canvas (MapLibre needs raw pixel data)
function createPlaneImageData(
  color: string,
  size = 32
): { width: number; height: number; data: Uint8ClampedArray } {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  // Draw plane shape (pointing up)
  const s = size;
  ctx.fillStyle = color;
  ctx.strokeStyle = "rgba(0,0,0,0.6)";
  ctx.lineWidth = 1;

  ctx.beginPath();
  // Fuselage
  ctx.moveTo(s * 0.5, s * 0.08); // nose
  ctx.lineTo(s * 0.56, s * 0.35);
  // Right wing
  ctx.lineTo(s * 0.88, s * 0.45);
  ctx.lineTo(s * 0.56, s * 0.52);
  // Right tail
  ctx.lineTo(s * 0.56, s * 0.72);
  ctx.lineTo(s * 0.7, s * 0.85);
  ctx.lineTo(s * 0.56, s * 0.8);
  // Bottom center
  ctx.lineTo(s * 0.5, s * 0.88);
  // Left tail (mirror)
  ctx.lineTo(s * 0.44, s * 0.8);
  ctx.lineTo(s * 0.3, s * 0.85);
  ctx.lineTo(s * 0.44, s * 0.72);
  // Left wing
  ctx.lineTo(s * 0.44, s * 0.52);
  ctx.lineTo(s * 0.12, s * 0.45);
  ctx.lineTo(s * 0.44, s * 0.35);
  ctx.closePath();

  ctx.fill();
  ctx.stroke();

  const imageData = ctx.getImageData(0, 0, size, size);
  return { width: size, height: size, data: imageData.data };
}

// Fire/flame icon rendered via canvas
function createFireIcon(size = 28): { width: number; height: number; data: Uint8ClampedArray } {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const s = size;

  // Outer flame (orange-red)
  ctx.fillStyle = "#ff4400";
  ctx.beginPath();
  ctx.moveTo(s * 0.5, s * 0.05);
  ctx.bezierCurveTo(s * 0.3, s * 0.3, s * 0.15, s * 0.55, s * 0.2, s * 0.75);
  ctx.bezierCurveTo(s * 0.22, s * 0.88, s * 0.35, s * 0.95, s * 0.5, s * 0.95);
  ctx.bezierCurveTo(s * 0.65, s * 0.95, s * 0.78, s * 0.88, s * 0.8, s * 0.75);
  ctx.bezierCurveTo(s * 0.85, s * 0.55, s * 0.7, s * 0.3, s * 0.5, s * 0.05);
  ctx.closePath();
  ctx.fill();

  // Inner flame (yellow)
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

// Water drop icon for flood stations
function createFloodIcon(critical: boolean, size = 28): { width: number; height: number; data: Uint8ClampedArray } {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const s = size;
  const color = critical ? "#0044cc" : "#66bbff";

  // Water drop shape
  ctx.fillStyle = color;
  ctx.strokeStyle = "rgba(255,255,255,0.4)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(s * 0.5, s * 0.08);
  ctx.bezierCurveTo(s * 0.5, s * 0.08, s * 0.2, s * 0.5, s * 0.2, s * 0.65);
  ctx.bezierCurveTo(s * 0.2, s * 0.85, s * 0.33, s * 0.95, s * 0.5, s * 0.95);
  ctx.bezierCurveTo(s * 0.67, s * 0.95, s * 0.8, s * 0.85, s * 0.8, s * 0.65);
  ctx.bezierCurveTo(s * 0.8, s * 0.5, s * 0.5, s * 0.08, s * 0.5, s * 0.08);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Wave lines inside for flood effect
  ctx.strokeStyle = "rgba(255,255,255,0.3)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(s * 0.28, s * 0.68);
  ctx.bezierCurveTo(s * 0.35, s * 0.63, s * 0.45, s * 0.73, s * 0.55, s * 0.65);
  ctx.bezierCurveTo(s * 0.62, s * 0.6, s * 0.68, s * 0.68, s * 0.72, s * 0.66);
  ctx.stroke();

  const imageData = ctx.getImageData(0, 0, size, size);
  return { width: size, height: size, data: imageData.data };
}

// AQ gauge dot with colored ring and label
function createAQIcon(level: "good" | "moderate" | "bad" | "hazardous", size = 32): { width: number; height: number; data: Uint8ClampedArray } {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const center = size / 2;
  const radius = size * 0.38;

  const colors = {
    good: "#00ff88",
    moderate: "#ffaa00",
    bad: "#ff4444",
    hazardous: "#cc00ff",
  };
  const color = colors[level];

  // Outer ring
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.stroke();

  // Filled center
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.25;
  ctx.beginPath();
  ctx.arc(center, center, radius - 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Center dot
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(center, center, 3, 0, Math.PI * 2);
  ctx.fill();

  const imageData = ctx.getImageData(0, 0, size, size);
  return { width: size, height: size, data: imageData.data };
}

// -----------------------------------------------------------------------
// Satellite flood tile pixel filter:
// Fetches GIBS MODIS tiles, strips out brown/grey land via saturation,
// keeps only water (blue) and flood (red/yellow/cyan) pixels.
// -----------------------------------------------------------------------
let floodProtocolRegistered = false;

function registerFloodProtocol() {
  if (floodProtocolRegistered) return;
  floodProtocolRegistered = true;

  maplibregl.addProtocol("floodfilter", async (params, abortController) => {
    const url = params.url.replace("floodfilter://", "https://");
    const resp = await fetch(url, { signal: abortController.signal });
    const blob = await resp.blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = img.data;

    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue; // already transparent
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const mx = Math.max(r, g, b);
      const mn = Math.min(r, g, b);
      const sat = mx === 0 ? 0 : (mx - mn) / mx;
      const bright = mx / 255;
      // Keep only clearly colored pixels (high saturation = water/flood)
      // Low saturation = grey/brown land/clouds → hide
      if (sat < 0.25 || bright < 0.12) {
        d[i + 3] = 0;
      } else {
        // Boost flood colors (red/yellow) to full opacity, water slightly less
        d[i + 3] = r > 150 ? 220 : 160;
      }
    }

    ctx.putImageData(img, 0, 0);
    const result = await canvas.convertToBlob({ type: "image/png" });
    return { data: await result.arrayBuffer() };
  });
}

export default function MapViewer({
  fastData,
  slowData,
  activeLayers,
}: MapViewerProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const mapLoadedRef = useRef(false);
  const [cursorPos, setCursorPos] = useState({ lat: 0, lng: 0 });

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    registerFloodProtocol();

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          carto: {
            type: "raster",
            tiles: [
              "https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
            ],
            tileSize: 256,
            attribution: "&copy; CARTO",
          },
        },
        glyphs:
          "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
        layers: [
          {
            id: "carto-tiles",
            type: "raster",
            source: "carto",
            minzoom: 0,
            maxzoom: 19,
          },
        ],
      },
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      maxZoom: 18,
      maxBounds: [
        [85, -5],
        [120, 28],
      ],
    });

    map.addControl(new maplibregl.NavigationControl(), "bottom-right");

    map.on("mousemove", (e) => {
      setCursorPos({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    });

    // Right-click: region dossier
    map.on("contextmenu", async (e) => {
      e.preventDefault();
      const { lat, lng } = e.lngLat;
      if (popupRef.current) popupRef.current.remove();

      const popup = new maplibregl.Popup({ maxWidth: "360px" })
        .setLngLat([lng, lat])
        .setHTML(
          '<div style="color:#e0e7ef;font-family:monospace;font-size:11px;padding:4px;">กำลังโหลดข้อมูล...</div>'
        )
        .addTo(map);
      popupRef.current = popup;

      try {
        const data = await fetchRegionDossier(lat, lng);
        const country = data.country || {};
        popup.setHTML(`
          <div style="color:#e0e7ef;font-family:monospace;font-size:11px;padding:4px;max-width:340px;">
            <div style="color:#00ff88;font-weight:bold;font-size:13px;margin-bottom:6px;">
              ${data.location || `${lat.toFixed(4)}, ${lng.toFixed(4)}`}
            </div>
            ${data.country_code ? `<div><b>Country:</b> ${data.country} (${data.country_code})</div>` : ""}
            ${data.city ? `<div><b>City:</b> ${data.city}</div>` : ""}
            ${country.population ? `<div><b>Population:</b> ${Number(country.population).toLocaleString()}</div>` : ""}
            ${country.capital?.length ? `<div><b>Capital:</b> ${country.capital.join(", ")}</div>` : ""}
            ${country.languages ? `<div><b>Languages:</b> ${Object.values(country.languages).join(", ")}</div>` : ""}
            ${country.currencies ? `<div><b>Currency:</b> ${Object.values(country.currencies).join(", ")}</div>` : ""}
            ${data.wikipedia?.extract ? `<div style="margin-top:6px;color:#8892a4;font-size:10px;">${data.wikipedia.extract.slice(0, 200)}...</div>` : ""}
          </div>
        `);
      } catch {
        popup.setHTML(
          '<div style="color:#ff4444;font-family:monospace;font-size:11px;">โหลดข้อมูลล้มเหลว</div>'
        );
      }
    });

    map.on("load", () => {
      // Create all icons via canvas
      const planeIcons: [string, string][] = [
        ["plane-domestic", "#00ff88"],
        ["plane-international", "#00d4ff"],
        ["plane-military", "#ffdd00"],
        ["plane-private", "#ff8800"],
      ];
      for (const [name, color] of planeIcons) {
        if (!map.hasImage(name)) map.addImage(name, createPlaneImageData(color, 32), { sdf: false });
      }

      // Fire icon
      if (!map.hasImage("fire-icon")) map.addImage("fire-icon", createFireIcon(28), { sdf: false });

      // Flood icons
      if (!map.hasImage("flood-normal")) map.addImage("flood-normal", createFloodIcon(false, 28), { sdf: false });
      if (!map.hasImage("flood-critical")) map.addImage("flood-critical", createFloodIcon(true, 28), { sdf: false });

      // AQ icons
      const aqLevels: Array<"good" | "moderate" | "bad" | "hazardous"> = ["good", "moderate", "bad", "hazardous"];
      for (const level of aqLevels) {
        const name = `aq-${level}`;
        if (!map.hasImage(name)) map.addImage(name, createAQIcon(level, 32), { sdf: false });
      }

      // Thailand border highlight (Thailand only, with glow for smooth look)
      fetch("https://raw.githubusercontent.com/johan/world.geo.json/master/countries/THA.geo.json")
        .then(r => r.json())
        .then((tha) => {
          const data = {
            type: "FeatureCollection" as const,
            features: tha.features || [tha],
          };
          if (!map.getSource("country-borders")) {
            map.addSource("country-borders", { type: "geojson", data });
            // Subtle fill
            map.addLayer({
              id: "country-borders-fill",
              type: "fill",
              source: "country-borders",
              paint: { "fill-color": "rgba(255, 200, 0, 0.03)" },
            });
            // Outer glow (smooths out jagged edges)
            map.addLayer({
              id: "country-borders-glow",
              type: "line",
              source: "country-borders",
              paint: {
                "line-color": "rgba(255, 200, 0, 0.12)",
                "line-width": 6,
                "line-blur": 4,
              },
            });
            // Crisp inner border
            map.addLayer({
              id: "country-borders-line",
              type: "line",
              source: "country-borders",
              paint: {
                "line-color": "rgba(255, 200, 0, 0.5)",
                "line-width": 1.5,
              },
            });
          }
        })
        .catch(() => { /* borders are optional */ });

      setupLayers(map);
      mapLoadedRef.current = true;
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      mapLoadedRef.current = false;
    };
  }, []);

  // Update data whenever fastData, slowData, or activeLayers change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // If map not loaded yet, wait for load event
    if (!mapLoadedRef.current) {
      const onStyleData = () => {
        if (mapLoadedRef.current) {
          updateMapData(map, fastData, slowData, activeLayers);
          map.off("sourcedata", onStyleData);
        }
      };
      map.on("sourcedata", onStyleData);
      return () => {
        map.off("sourcedata", onStyleData);
      };
    }

    updateMapData(map, fastData, slowData, activeLayers);
  }, [fastData, slowData, activeLayers]);

  // Weather radar overlay
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current || !slowData?.weather) return;

    const weather = slowData.weather;
    if (!weather.radar?.length || !weather.host) return;

    const radarId = "weather-radar";
    const latestPath = weather.radar[weather.radar.length - 1];

    if (map.getLayer(radarId)) map.removeLayer(radarId);
    if (map.getSource(radarId)) map.removeSource(radarId);

    if (activeLayers.has("weather")) {
      map.addSource(radarId, {
        type: "raster",
        tiles: [`${weather.host}${latestPath}/256/{z}/{x}/{y}/2/1_1.png`],
        tileSize: 256,
      });
      map.addLayer({
        id: radarId,
        type: "raster",
        source: radarId,
        paint: { "raster-opacity": 0.5 },
      });
    }
  }, [slowData?.weather, activeLayers]);

  // NASA GIBS satellite flood extent overlay (MODIS 3-day composite)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;

    const floodSatId = "flood-satellite";
    if (map.getLayer(floodSatId)) map.removeLayer(floodSatId);
    if (map.getSource(floodSatId)) map.removeSource(floodSatId);

    if (activeLayers.has("floodSatellite")) {
      // Use yesterday's date (NRT data has ~1 day lag)
      const d = new Date();
      d.setDate(d.getDate() - 1);
      const dateStr = d.toISOString().slice(0, 10);

      map.addSource(floodSatId, {
        type: "raster",
        tiles: [
          `floodfilter://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=MODIS_Combined_Flood_3-Day&STYLES=&FORMAT=image/png&TRANSPARENT=true&HEIGHT=256&WIDTH=256&TIME=${dateStr}&CRS=EPSG:3857&BBOX={bbox-epsg-3857}`,
        ],
        tileSize: 256,
      });
      map.addLayer({
        id: floodSatId,
        type: "raster",
        source: floodSatId,
        paint: { "raster-opacity": 0.85 },
      });
    }
  }, [activeLayers]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainer} className="w-full h-full" />
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 hud-panel px-3 py-1 text-[10px] text-[var(--text-secondary)] z-10">
        {cursorPos.lat.toFixed(4)}°N {cursorPos.lng.toFixed(4)}°E
      </div>
      {activeLayers.has("floodSatellite") && (
        <div className="absolute bottom-10 right-2 hud-panel px-2 py-1.5 z-10 text-[9px]">
          <div className="text-[8px] tracking-wider text-[var(--text-secondary)] mb-1">ดาวเทียม MODIS 3 วัน</div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-2 rounded-sm" style={{ background: "#ff3300" }} />
            <span style={{ color: "var(--text-secondary)" }}>น้ำท่วมล่าสุด</span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="inline-block w-3 h-2 rounded-sm" style={{ background: "#3366ff" }} />
            <span style={{ color: "var(--text-secondary)" }}>แหล่งน้ำ</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Setup all map sources and layers (called once after load + icons ready)
// ---------------------------------------------------------------------------
function setupLayers(map: maplibregl.Map) {
  // Non-clustered GeoJSON sources
  const plainSources = [
    "domestic-flights",
    "international-flights",
    "military-flights",
    "private-flights",
    "earthquakes",
    "ships-source",
  ];
  for (const id of plainSources) {
    map.addSource(id, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  }

  // Clustered GeoJSON sources (fires, AQ, flood)
  map.addSource("fires", {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
    cluster: true,
    clusterMaxZoom: 12,
    clusterRadius: 40,
  });
  map.addSource("air-quality", {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
    cluster: true,
    clusterMaxZoom: 10,
    clusterRadius: 50,
    clusterProperties: {
      pm25_sum: ["+", ["get", "pm25"]],
      pm25_count: ["+", 1],
    },
  });
  map.addSource("flood-source", {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
    cluster: true,
    clusterMaxZoom: 11,
    clusterRadius: 40,
    clusterProperties: {
      critical_count: ["+", ["case", ["get", "critical"], 1, 0]],
    },
  });

  // --- Flight layers (symbol with plane icon, rotated by heading) ---
  map.addLayer({
    id: "domestic-flights-layer",
    type: "symbol",
    source: "domestic-flights",
    layout: {
      "icon-image": "plane-domestic",
      "icon-size": 0.7,
      "icon-rotate": ["get", "heading"],
      "icon-rotation-alignment": "map",
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
    },
  });

  map.addLayer({
    id: "international-flights-layer",
    type: "symbol",
    source: "international-flights",
    layout: {
      "icon-image": "plane-international",
      "icon-size": 0.7,
      "icon-rotate": ["get", "heading"],
      "icon-rotation-alignment": "map",
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
    },
  });

  map.addLayer({
    id: "military-flights-layer",
    type: "symbol",
    source: "military-flights",
    layout: {
      "icon-image": "plane-military",
      "icon-size": 0.85,
      "icon-rotate": ["get", "heading"],
      "icon-rotation-alignment": "map",
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
    },
  });

  map.addLayer({
    id: "private-flights-layer",
    type: "symbol",
    source: "private-flights",
    layout: {
      "icon-image": "plane-private",
      "icon-size": 0.7,
      "icon-rotate": ["get", "heading"],
      "icon-rotation-alignment": "map",
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
      "text-field": ["get", "vipLabel"],
      "text-size": 9,
      "text-offset": [0, -1.5],
      "text-allow-overlap": true,
    },
    paint: {
      "text-color": "#ff8800",
      "text-halo-color": "rgba(0,0,0,0.8)",
      "text-halo-width": 1,
    },
  });

  // --- Ships ---
  map.addLayer({
    id: "ships-layer",
    type: "circle",
    source: "ships-source",
    paint: {
      "circle-radius": 5,
      "circle-color": "#00ff88",
      "circle-stroke-width": 1,
      "circle-stroke-color": "#00ff88",
      "circle-opacity": 0.8,
    },
  });

  // --- Earthquakes (sized by magnitude) ---
  map.addLayer({
    id: "earthquakes-layer",
    type: "circle",
    source: "earthquakes",
    paint: {
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["get", "magnitude"],
        2.5, 6, 5, 14, 7, 24,
      ],
      "circle-color": [
        "interpolate",
        ["linear"],
        ["get", "magnitude"],
        2.5, "#ffaa00", 5, "#ff4444", 7, "#ff0000",
      ],
      "circle-opacity": 0.7,
      "circle-stroke-width": 1,
      "circle-stroke-color": "#ff4444",
    },
  });

  // --- Fires: clusters as bigger fire icons ---
  map.addLayer({
    id: "fires-cluster",
    type: "symbol",
    source: "fires",
    filter: ["has", "point_count"],
    layout: {
      "icon-image": "fire-icon",
      "icon-size": [
        "interpolate", ["linear"], ["get", "point_count"],
        5, 0.6, 50, 1.0, 200, 1.5, 1000, 2.2,
      ],
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
      "text-field": "{point_count_abbreviated}",
      "text-size": 10,
      "text-offset": [0, 1.6],
      "text-allow-overlap": true,
    },
    paint: {
      "text-color": "#ffcc00",
      "text-halo-color": "rgba(0,0,0,0.7)",
      "text-halo-width": 1,
    },
  });

  // --- Fires: individual icons (unclustered) ---
  map.addLayer({
    id: "fires-layer",
    type: "symbol",
    source: "fires",
    filter: ["!", ["has", "point_count"]],
    layout: {
      "icon-image": "fire-icon",
      "icon-size": [
        "interpolate", ["linear"], ["zoom"],
        4, 0.3, 8, 0.6, 12, 0.9,
      ],
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
    },
  });

  // --- Air quality: clusters as bigger AQ icons with avg PM2.5 ---
  map.addLayer({
    id: "air-quality-cluster",
    type: "symbol",
    source: "air-quality",
    filter: ["has", "point_count"],
    layout: {
      "icon-image": [
        "case",
        [">=", ["/", ["get", "pm25_sum"], ["get", "pm25_count"]], 150], "aq-hazardous",
        [">=", ["/", ["get", "pm25_sum"], ["get", "pm25_count"]], 75], "aq-bad",
        [">=", ["/", ["get", "pm25_sum"], ["get", "pm25_count"]], 35], "aq-moderate",
        "aq-good",
      ],
      "icon-size": [
        "interpolate", ["linear"], ["get", "point_count"],
        2, 0.9, 10, 1.3, 30, 1.8,
      ],
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
      "text-field": [
        "concat",
        ["to-string", ["round", ["/", ["get", "pm25_sum"], ["get", "pm25_count"]]]],
        " avg",
      ],
      "text-size": 10,
      "text-offset": [0, 1.8],
      "text-allow-overlap": true,
    },
    paint: {
      "text-color": "#ffffff",
      "text-halo-color": "rgba(0,0,0,0.7)",
      "text-halo-width": 1,
    },
  });

  // --- Air quality: individual icons (unclustered) ---
  map.addLayer({
    id: "air-quality-layer",
    type: "symbol",
    source: "air-quality",
    filter: ["!", ["has", "point_count"]],
    layout: {
      "icon-image": [
        "case",
        [">=", ["get", "pm25"], 150], "aq-hazardous",
        [">=", ["get", "pm25"], 75], "aq-bad",
        [">=", ["get", "pm25"], 35], "aq-moderate",
        "aq-good",
      ],
      "icon-size": 0.85,
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
      "text-field": ["concat", ["to-string", ["round", ["get", "pm25"]]], ""],
      "text-size": 8,
      "text-offset": [0, 1.8],
      "text-allow-overlap": true,
    },
    paint: {
      "text-color": [
        "case",
        [">=", ["get", "pm25"], 75], "#ff4444",
        [">=", ["get", "pm25"], 35], "#ffaa00",
        "#00ff88",
      ],
      "text-halo-color": "rgba(0,0,0,0.7)",
      "text-halo-width": 1,
    },
  });


  // --- Flood: clusters as bigger water drop icons ---
  map.addLayer({
    id: "flood-cluster",
    type: "symbol",
    source: "flood-source",
    filter: ["has", "point_count"],
    layout: {
      "icon-image": [
        "case",
        [">", ["get", "critical_count"], 0], "flood-critical",
        "flood-normal",
      ],
      "icon-size": [
        "interpolate", ["linear"], ["get", "point_count"],
        2, 0.8, 10, 1.2, 30, 1.8,
      ],
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
      "text-field": "{point_count_abbreviated}",
      "text-size": 10,
      "text-offset": [0, 1.6],
      "text-allow-overlap": true,
    },
    paint: {
      "text-color": "#ffffff",
      "text-halo-color": "rgba(0,0,0,0.7)",
      "text-halo-width": 1,
    },
  });

  // --- Flood: individual water drop icons (unclustered) ---
  map.addLayer({
    id: "flood-layer",
    type: "symbol",
    source: "flood-source",
    filter: ["!", ["has", "point_count"]],
    layout: {
      "icon-image": [
        "case",
        ["get", "critical"], "flood-critical",
        "flood-normal",
      ],
      "icon-size": [
        "case",
        ["get", "critical"], 0.9,
        0.7,
      ],
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
    },
  });

  // --- Cluster click-to-zoom ---
  for (const clusterId of ["fires-cluster", "air-quality-cluster", "flood-cluster"]) {
    const sourceId = clusterId === "fires-cluster" ? "fires"
      : clusterId === "air-quality-cluster" ? "air-quality" : "flood-source";
    map.on("click", clusterId, (e) => {
      const features = map.queryRenderedFeatures(e.point, { layers: [clusterId] });
      if (!features.length) return;
      const clusterIdVal = features[0].properties?.cluster_id;
      const src = map.getSource(sourceId) as maplibregl.GeoJSONSource;
      src.getClusterExpansionZoom(clusterIdVal).then((zoom) => {
        const geom = features[0].geometry;
        if (geom.type === "Point") {
          map.easeTo({ center: geom.coordinates as [number, number], zoom });
        }
      });
    });
    map.on("mouseenter", clusterId, () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", clusterId, () => { map.getCanvas().style.cursor = ""; });
  }

  // --- Click popup handlers ---
  const addPopup = (
    layerId: string,
    fmt: (p: Record<string, unknown>) => string
  ) => {
    map.on("click", layerId, (e) => {
      if (!e.features?.length) return;
      const props = e.features[0].properties || {};
      const geom = e.features[0].geometry;
      const coords =
        geom.type === "Point"
          ? (geom.coordinates.slice() as [number, number])
          : [e.lngLat.lng, e.lngLat.lat] as [number, number];

      new maplibregl.Popup(POPUP_CONFIG)
        .setLngLat(coords)
        .setHTML(fmt(props))
        .addTo(map);
    });
    map.on("mouseenter", layerId, () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", layerId, () => {
      map.getCanvas().style.cursor = "";
    });
  };

  addPopup("domestic-flights-layer", formatDomestic);
  addPopup("international-flights-layer", formatFlight);
  addPopup("military-flights-layer", formatMilitary);
  addPopup("private-flights-layer", formatPrivate);

  addPopup("earthquakes-layer", formatEarthquake);
  addPopup("air-quality-layer", formatAirQuality);
  addPopup("ships-layer", formatShip);

  addPopup("flood-layer", formatFlood);
}

// ---------------------------------------------------------------------------
// Update GeoJSON sources and layer visibility
// ---------------------------------------------------------------------------
function updateMapData(
  map: maplibregl.Map,
  fastData: FastData | null,
  slowData: SlowData | null,
  activeLayers: Set<LayerName>
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toFeatures = (items: any[]): GeoJSON.Feature[] =>
    items
      .filter((i) => i.lat != null && i.lon != null)
      .map((item) => ({
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [item.lon, item.lat],
        },
        properties: { ...item },
      }));

  const setSourceData = (sourceId: string, features: GeoJSON.Feature[]) => {
    const src = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
    if (src) {
      src.setData({ type: "FeatureCollection", features });
    }
  };

  // Fast data
  if (fastData?.flights) {
    setSourceData("domestic-flights", toFeatures(fastData.flights.domestic || []));
    setSourceData("international-flights", toFeatures(fastData.flights.international || []));
    const allMil = [
      ...(fastData.flights.military || []),
      ...(fastData.military_flights || []),
    ];
    setSourceData("military-flights", toFeatures(allMil));
    // Private flights with VIP labels
    const privateFeatures = toFeatures(fastData.flights.private || []).map(f => {
      const label = getVipLabel(String(f.properties?.registration || ""));
      if (label) f.properties = { ...f.properties, vipLabel: label };
      return f;
    });
    setSourceData("private-flights", privateFeatures);
  }

  // Slow data
  if (slowData) {
    setSourceData("earthquakes", toFeatures(slowData.earthquakes || []));
    setSourceData("fires", toFeatures(slowData.fires || []));
    setSourceData("air-quality", toFeatures(slowData.air_quality || []));
    setSourceData("ships-source", toFeatures(slowData.ships || []));
    setSourceData("flood-source", toFeatures(slowData.flood || []));
  }

  // Layer visibility
  const layerMap: Record<LayerName, string[]> = {
    domestic: ["domestic-flights-layer"],
    international: ["international-flights-layer"],
    military: ["military-flights-layer"],
    private: ["private-flights-layer"],
    ships: ["ships-layer"],
    earthquakes: ["earthquakes-layer"],
    fires: ["fires-layer", "fires-cluster"],
    weather: [],
    news: [],
    airQuality: ["air-quality-layer", "air-quality-cluster"],
    flood: ["flood-layer", "flood-cluster"],
    floodSatellite: [], // managed as raster in separate useEffect
  };

  for (const [layerName, mapLayerIds] of Object.entries(layerMap)) {
    const visible = activeLayers.has(layerName as LayerName);
    for (const id of mapLayerIds) {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
      }
    }
  }
}
