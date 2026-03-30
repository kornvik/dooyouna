"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FastData, LayerName, ProvinceProperties, SlowData } from "@/types";
import {
  POPUP_CONFIG,
  formatFlight, formatDomestic, formatMilitary, formatPrivate,
  formatEarthquake, formatAirQuality, formatShip,
  formatFlood,
} from "@/lib/popupFormatters";
import { getVipLabel } from "@/lib/vipWatchlist";
import { setupProvinceLayers } from "@/lib/provinceLayers";
import { createWindParticleRenderer, type WindParticleRenderer } from "@/lib/windParticles";
import mlcontour from "maplibre-contour";

interface MapViewerProps {
  fastData: FastData | null;
  slowData: SlowData | null;
  activeLayers: Set<LayerName>;
  onProvinceSelect?: (properties: ProvinceProperties | null) => void;
}

const DEFAULT_CENTER: [number, number] = [102.5, 13.5];
const DEFAULT_ZOOM = 5.5;
const MAP_FONT: string[] = ["Noto Sans Regular"];

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

// Curvy wave icon for flood stations (amber=watch, orange=alert)
function createFloodIcon(critical: boolean, size = 28): { width: number; height: number; data: Uint8ClampedArray } {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const s = size;
  const color = critical ? "#ff6600" : "#ffaa00";

  // Three stacked waves, each offset
  const waveRows = [
    { y: 0.30, amp: 0.06, opacity: 0.5, width: 1.5 },
    { y: 0.50, amp: 0.07, opacity: 0.75, width: 2.0 },
    { y: 0.70, amp: 0.08, opacity: 1.0, width: 2.5 },
  ];

  for (const wave of waveRows) {
    ctx.strokeStyle = color;
    ctx.lineWidth = wave.width;
    ctx.globalAlpha = wave.opacity;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(s * 0.08, s * wave.y);
    ctx.bezierCurveTo(
      s * 0.22, s * (wave.y - wave.amp),
      s * 0.36, s * (wave.y + wave.amp),
      s * 0.50, s * wave.y,
    );
    ctx.bezierCurveTo(
      s * 0.64, s * (wave.y - wave.amp),
      s * 0.78, s * (wave.y + wave.amp),
      s * 0.92, s * wave.y,
    );
    ctx.stroke();
  }

  // Filled water body below the bottom wave
  ctx.globalAlpha = 0.2;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(s * 0.08, s * 0.70);
  ctx.bezierCurveTo(s * 0.22, s * 0.62, s * 0.36, s * 0.78, s * 0.50, s * 0.70);
  ctx.bezierCurveTo(s * 0.64, s * 0.62, s * 0.78, s * 0.78, s * 0.92, s * 0.70);
  ctx.lineTo(s * 0.92, s * 0.95);
  ctx.lineTo(s * 0.08, s * 0.95);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;

  const imageData = ctx.getImageData(0, 0, size, size);
  return { width: size, height: size, data: imageData.data };
}

// Cloud/wind icon for air quality stations
function createAQCloudIcon(level: "good" | "moderate" | "bad" | "hazardous", size = 32): { width: number; height: number; data: Uint8ClampedArray } {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const s = size;

  const colors = { good: "#00ff88", moderate: "#ffaa00", bad: "#ff4444", hazardous: "#cc00ff" };
  const color = colors[level];

  // Cloud shape
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.25;
  ctx.beginPath();
  ctx.arc(s * 0.35, s * 0.52, s * 0.22, 0, Math.PI * 2);
  ctx.arc(s * 0.55, s * 0.38, s * 0.25, 0, Math.PI * 2);
  ctx.arc(s * 0.72, s * 0.50, s * 0.20, 0, Math.PI * 2);
  ctx.rect(s * 0.15, s * 0.52, s * 0.72, s * 0.18);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Cloud outline
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(s * 0.35, s * 0.52, s * 0.22, Math.PI * 0.7, Math.PI * 1.9);
  ctx.arc(s * 0.55, s * 0.38, s * 0.25, Math.PI * 1.1, Math.PI * 1.9);
  ctx.arc(s * 0.72, s * 0.50, s * 0.20, Math.PI * 1.4, Math.PI * 0.4);
  ctx.lineTo(s * 0.87, s * 0.68);
  ctx.lineTo(s * 0.15, s * 0.68);
  ctx.closePath();
  ctx.stroke();

  // Wind lines underneath
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.2;
  ctx.globalAlpha = 0.6;
  for (let i = 0; i < 3; i++) {
    const y = s * (0.74 + i * 0.07);
    const xStart = s * (0.2 + i * 0.08);
    const xEnd = s * (0.7 - i * 0.05);
    ctx.beginPath();
    ctx.moveTo(xStart, y);
    ctx.bezierCurveTo(xStart + s * 0.1, y - s * 0.02, xEnd - s * 0.1, y + s * 0.02, xEnd, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const imageData = ctx.getImageData(0, 0, size, size);
  return { width: size, height: size, data: imageData.data };
}

// -----------------------------------------------------------------------
// Satellite flood tile pixel filter:
// Fetches GIBS MODIS tiles, strips out brown/grey land via saturation,
// keeps only water (blue) and flood (red/yellow/cyan) pixels.
// -----------------------------------------------------------------------
let elevProtocolRegistered = false;
function registerElevationProtocol() {
  if (elevProtocolRegistered) return;
  elevProtocolRegistered = true;

  const RAMP: [number, number, number, number][] = [
    [0, 10, 40, 20],
    [30, 15, 80, 30],
    [100, 30, 140, 40],
    [250, 60, 180, 50],
    [500, 140, 200, 40],
    [800, 220, 200, 30],
    [1200, 240, 140, 30],
    [1800, 220, 70, 30],
    [2500, 200, 200, 200],
    [4000, 255, 255, 255],
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
      const h = (d[i] * 256 + d[i + 1] + d[i + 2] / 256) - 32768;
      if (h <= 0) { d[i + 3] = 0; } else {
        const [r, g, b] = elevToColor(h);
        d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 70;
      }
    }
    ctx.putImageData(img, 0, 0);
    const result = await canvas.convertToBlob({ type: "image/png" });
    return { data: await result.arrayBuffer() };
  });
}

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
      // Low saturation = grey/brown land/clouds → hide
      // Blue-dominant = permanent water bodies → hide
      // Keep only red/yellow/orange flood indicators
      if (sat < 0.25 || bright < 0.12) {
        d[i + 3] = 0;
      } else if (b > r * 1.2 && b > g) {
        d[i + 3] = 0;
      } else {
        d[i + 3] = 220;
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
  onProvinceSelect,
}: MapViewerProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const mapLoadedRef = useRef(false);
  const windCanvasRef = useRef<HTMLCanvasElement>(null);
  const windRendererRef = useRef<WindParticleRenderer | null>(null);
  const [cursorPos, setCursorPos] = useState({ lat: 0, lng: 0 });

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    registerFloodProtocol();
    registerElevationProtocol();

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
          "https://cdn.protomaps.com/fonts/pbf/{fontstack}/{range}.pbf",
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

    map.on("mousemove", (e) => {
      setCursorPos({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    });

    // Right-click: prevent default context menu
    map.on("contextmenu", (e) => {
      e.preventDefault();
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

      // AQ cloud icons
      const aqLevels: Array<"good" | "moderate" | "bad" | "hazardous"> = ["good", "moderate", "bad", "hazardous"];
      for (const level of aqLevels) {
        const name = `aq-${level}`;
        if (!map.hasImage(name)) map.addImage(name, createAQCloudIcon(level, 32), { sdf: false });
      }

      // Thailand border highlight (high-res from OSM)
      fetch("/geo/thailand.json")
        .then(r => r.json())
        .then((data) => {
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

      // Province boundaries (click for dossier)
      if (onProvinceSelect) {
        setupProvinceLayers(map, onProvinceSelect);
      }

      setupLayers(map);
      mapLoadedRef.current = true;
    });

    mapRef.current = map;

    // Initialize wind particle renderer
    if (windCanvasRef.current) {
      windRendererRef.current = createWindParticleRenderer(windCanvasRef.current, map);
    }

    return () => {
      windRendererRef.current?.destroy();
      windRendererRef.current = null;
      map.remove();
      mapRef.current = null;
      mapLoadedRef.current = false;
      console.error = origError;
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
  }, [slowData?.weather, activeLayers.has("weather")]);

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
      map.addLayer(
        {
          id: floodSatId,
          type: "raster",
          source: floodSatId,
          paint: { "raster-opacity": 0.85 },
        },
        "domestic-flights-layer" // insert below all data layers
      );
    }
  }, [activeLayers.has("floodSatellite")]);

  // Wind particle animation
  useEffect(() => {
    const renderer = windRendererRef.current;
    if (!renderer) return;

    if (slowData?.wind) {
      renderer.setWindData(slowData.wind);
    }

    if (activeLayers.has("wind") && slowData?.wind?.length) {
      renderer.start();
    } else {
      renderer.stop();
    }
  }, [slowData?.wind, activeLayers.has("wind")]);

  // NASA VIIRS nighttime lights overlay (Black Marble + daily radiance)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;

    const nightId = "night-lights";
    if (map.getLayer(nightId)) map.removeLayer(nightId);
    if (map.getSource(nightId)) map.removeSource(nightId);

    if (activeLayers.has("nightLights")) {
      // Daily layer: yesterday's VIIRS Day/Night Band
      const d = new Date();
      d.setDate(d.getDate() - 1);
      const dateStr = d.toISOString().slice(0, 10);

      map.addSource(nightId, {
        type: "raster",
        tiles: [
          `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_DayNightBand_At_Sensor_Radiance/default/${dateStr}/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png`,
        ],
        tileSize: 256,
      });
      // Insert below flood satellite if present, else below flights
      const viirsBefore = map.getLayer("flood-satellite") ? "flood-satellite" : "domestic-flights-layer";
      map.addLayer(
        {
          id: nightId,
          type: "raster",
          source: nightId,
          paint: { "raster-opacity": 0.85 },
        },
        viirsBefore
      );
    }
  }, [activeLayers.has("nightLights")]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainer} className="w-full h-full" />
      <canvas
        ref={windCanvasRef}
        className="absolute inset-0 pointer-events-none"
        style={{ zIndex: 1 }}
      />
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 hud-panel px-3 py-1 text-[10px] text-[var(--text-secondary)] z-10">
        {cursorPos.lat.toFixed(4)}°N {cursorPos.lng.toFixed(4)}°E
      </div>
      {activeLayers.has("floodSatellite") && (
        <div className="absolute bottom-10 right-2 hud-panel px-2 py-1.5 z-10 text-[9px]">
          <div className="text-[8px] tracking-wider text-[var(--text-secondary)] mb-1">ดาวเทียม MODIS 3 วัน</div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-2 rounded-sm" style={{ background: "#ff3300" }} />
            <span style={{ color: "var(--text-secondary)" }}>พื้นที่น้ำท่วม</span>
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
  // Terrain hillshade
  map.addSource("terrain-dem", {
    type: "raster-dem",
    tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
    tileSize: 256,
    encoding: "terrarium",
  });

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

  map.addLayer({
    id: "contour-lines",
    type: "line",
    source: "contour-source",
    "source-layer": "contours",
    filter: ["==", ["get", "level"], 0],
    paint: {
      "line-color": "rgba(180, 160, 120, 0.25)",
      "line-width": 0.5,
    },
  });

  map.addLayer({
    id: "contour-lines-major",
    type: "line",
    source: "contour-source",
    "source-layer": "contours",
    filter: ["==", ["get", "level"], 1],
    paint: {
      "line-color": "rgba(180, 160, 120, 0.4)",
      "line-width": 0.8,
    },
  });

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
      "text-size": ["interpolate", ["linear"], ["zoom"], 5, 9, 8, 11, 12, 13],
      "text-font": ["Noto Sans Regular"],
      "text-max-angle": 30,
      "text-padding": 15,
    },
    paint: {
      "text-color": "rgba(200, 180, 140, 0.75)",
      "text-halo-color": "rgba(0, 0, 0, 0.9)",
      "text-halo-width": 1.5,
    },
  });

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
      "text-font": MAP_FONT,
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
  // Outer pulse ring
  map.addLayer({
    id: "earthquakes-pulse",
    type: "circle",
    source: "earthquakes",
    paint: {
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["get", "magnitude"],
        2.5, 16, 5, 30, 7, 50,
      ],
      "circle-color": [
        "interpolate",
        ["linear"],
        ["get", "magnitude"],
        2.5, "#ffaa00", 5, "#ff4444", 7, "#ff0000",
      ],
      "circle-opacity": 0.15,
      "circle-stroke-width": 1.5,
      "circle-stroke-color": [
        "interpolate",
        ["linear"],
        ["get", "magnitude"],
        2.5, "#ffaa00", 5, "#ff4444", 7, "#ff0000",
      ],
      "circle-stroke-opacity": 0.4,
    },
  });
  // Inner dot
  map.addLayer({
    id: "earthquakes-layer",
    type: "circle",
    source: "earthquakes",
    paint: {
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["get", "magnitude"],
        2.5, 5, 5, 12, 7, 20,
      ],
      "circle-color": [
        "interpolate",
        ["linear"],
        ["get", "magnitude"],
        2.5, "#ffaa00", 5, "#ff4444", 7, "#ff0000",
      ],
      "circle-opacity": 0.8,
      "circle-stroke-width": 2,
      "circle-stroke-color": "rgba(255,255,255,0.5)",
    },
  });
  // Magnitude label
  map.addLayer({
    id: "earthquakes-label",
    type: "symbol",
    source: "earthquakes",
    layout: {
      "text-font": MAP_FONT,
      "text-field": ["concat", "M", ["to-string", ["get", "magnitude"]]],
      "text-size": 9,
      "text-offset": [0, -1.8],
      "text-allow-overlap": true,
    },
    paint: {
      "text-color": "#ffffff",
      "text-halo-color": "rgba(0,0,0,0.8)",
      "text-halo-width": 1,
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
      "text-font": MAP_FONT,
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

  // --- Air quality: clustered with cloud icon + avg PM2.5 ---
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
      "text-font": MAP_FONT,
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

  // --- Air quality: individual cloud icon + PM2.5 value ---
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
      "text-font": MAP_FONT,
      "text-field": ["to-string", ["round", ["get", "pm25"]]],
      "text-size": 9,
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


  // --- Flood: clusters as wave icons ---
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
      "text-font": MAP_FONT,
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

  // --- Flood: individual wave icons (unclustered) ---
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
    earthquakes: ["earthquakes-pulse", "earthquakes-layer", "earthquakes-label"],
    fires: ["fires-layer", "fires-cluster"],
    weather: [],
    news: [],
    airQuality: ["air-quality-cluster", "air-quality-layer"],
    flood: ["flood-layer", "flood-cluster"],
    wind: [], // managed by canvas particle renderer
    floodSatellite: [], // managed as raster in separate useEffect
    nightLights: [], // managed as raster in separate useEffect
    terrain: ["elevation-color-layer", "contour-lines", "contour-lines-major", "contour-labels"],
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
