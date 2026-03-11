"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FastData, LayerName, SlowData } from "@/types";
import { fetchRegionDossier } from "@/lib/api";

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
          '<div style="color:#e0e7ef;font-family:monospace;font-size:11px;padding:4px;">Loading dossier...</div>'
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
          '<div style="color:#ff4444;font-family:monospace;font-size:11px;">Failed to load dossier</div>'
        );
      }
    });

    map.on("load", () => {
      // Create plane icons via canvas (raster ImageData)
      const icons: [string, string][] = [
        ["plane-commercial", "#00d4ff"],
        ["plane-military", "#ffdd00"],
        ["plane-private", "#ff8800"],
      ];

      for (const [name, color] of icons) {
        const imgData = createPlaneImageData(color, 32);
        if (!map.hasImage(name)) {
          map.addImage(name, imgData, { sdf: false });
        }
      }

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

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainer} className="w-full h-full" />
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 hud-panel px-3 py-1 text-[10px] text-[var(--text-secondary)] z-10">
        {cursorPos.lat.toFixed(4)}°N {cursorPos.lng.toFixed(4)}°E
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Setup all map sources and layers (called once after load + icons ready)
// ---------------------------------------------------------------------------
function setupLayers(map: maplibregl.Map) {
  // GeoJSON sources
  const sources = [
    "flights",
    "military-flights",
    "private-flights",
    "earthquakes",
    "fires",
    "air-quality",
    "ships-source",
    "cctv-source",
  ];
  for (const id of sources) {
    map.addSource(id, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  }

  // --- Flight layers (symbol with plane icon, rotated by heading) ---
  map.addLayer({
    id: "flights-layer",
    type: "symbol",
    source: "flights",
    layout: {
      "icon-image": "plane-commercial",
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

  // --- Fires ---
  map.addLayer({
    id: "fires-layer",
    type: "circle",
    source: "fires",
    paint: {
      "circle-radius": [
        "interpolate", ["linear"], ["zoom"],
        4, 2, 8, 5, 12, 8,
      ],
      "circle-color": "#ff4400",
      "circle-opacity": 0.6,
      "circle-stroke-width": 0,
    },
  });

  // --- Air quality (PM2.5 colored) ---
  map.addLayer({
    id: "air-quality-layer",
    type: "circle",
    source: "air-quality",
    paint: {
      "circle-radius": 10,
      "circle-color": [
        "interpolate",
        ["linear"],
        ["get", "pm25"],
        0, "#00ff88", 35, "#ffaa00", 75, "#ff4444", 150, "#cc00ff",
      ],
      "circle-opacity": 0.75,
      "circle-stroke-width": 2,
      "circle-stroke-color": "rgba(255,255,255,0.3)",
    },
  });

  // --- CCTV ---
  map.addLayer({
    id: "cctv-layer",
    type: "circle",
    source: "cctv-source",
    paint: {
      "circle-radius": 4,
      "circle-color": "#aa88ff",
      "circle-stroke-width": 1,
      "circle-stroke-color": "#aa88ff",
      "circle-opacity": 0.8,
    },
  });

  // --- Click popup handlers ---
  const popupStyle =
    'style="color:#e0e7ef;font-family:monospace;font-size:11px;padding:4px;"';

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

      new maplibregl.Popup({ maxWidth: "300px" })
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

  addPopup(
    "flights-layer",
    (p) => `<div ${popupStyle}>
      <div style="color:#00d4ff;font-weight:bold;">${p.callsign || "Unknown"}</div>
      <div>Type: ${p.type || "N/A"} | Reg: ${p.registration || "N/A"}</div>
      <div>Alt: ${Number(p.alt).toLocaleString()} ft | Speed: ${p.speed} kts</div>
      <div>Heading: ${p.heading}&deg;</div>
    </div>`
  );

  addPopup(
    "military-flights-layer",
    (p) => `<div ${popupStyle}>
      <div style="color:#ffdd00;font-weight:bold;">MIL: ${p.callsign || p.hex}</div>
      <div>Type: ${p.type || "N/A"} | Reg: ${p.registration || "N/A"}</div>
      <div>Alt: ${Number(p.alt).toLocaleString()} ft | Speed: ${p.speed} kts</div>
    </div>`
  );

  addPopup(
    "private-flights-layer",
    (p) => `<div ${popupStyle}>
      <div style="color:#ff8800;font-weight:bold;">${p.callsign || p.registration || "Private"}</div>
      <div>Type: ${p.type || "N/A"} | Reg: ${p.registration || "N/A"}</div>
      <div>Alt: ${Number(p.alt).toLocaleString()} ft | Speed: ${p.speed} kts</div>
    </div>`
  );

  addPopup(
    "earthquakes-layer",
    (p) => `<div ${popupStyle}>
      <div style="color:#ff4444;font-weight:bold;">M${p.magnitude} Earthquake</div>
      <div>${p.place}</div>
      <div>Depth: ${p.depth} km</div>
      <div>${new Date(Number(p.time)).toLocaleString()}</div>
    </div>`
  );

  addPopup(
    "air-quality-layer",
    (p) => `<div ${popupStyle}>
      <div style="color:${Number(p.pm25) > 75 ? "#ff4444" : Number(p.pm25) > 35 ? "#ffaa00" : "#00ff88"};font-weight:bold;">
        PM2.5: ${p.pm25} &micro;g/m&sup3;
      </div>
      <div>${p.location}</div>
      <div>${p.city}</div>
    </div>`
  );

  addPopup(
    "ships-layer",
    (p) => `<div ${popupStyle}>
      <div style="color:#00ff88;font-weight:bold;">${p.name || "Unknown Vessel"}</div>
      <div>MMSI: ${p.mmsi} | Type: ${p.type || "N/A"}</div>
      <div>Speed: ${p.speed} kts | Course: ${p.course}&deg;</div>
    </div>`
  );

  addPopup(
    "cctv-layer",
    (p) => `<div ${popupStyle}>
      <div style="color:#aa88ff;font-weight:bold;">${p.name}</div>
      <div>Source: ${p.source}</div>
      ${p.url ? `<div style="margin-top:4px;"><img src="${p.url}" style="max-width:260px;border-radius:3px;" onerror="this.style.display='none'" /></div>` : ""}
    </div>`
  );
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
    setSourceData("flights", toFeatures(fastData.flights.commercial || []));
    const allMil = [
      ...(fastData.flights.military || []),
      ...(fastData.military_flights || []),
    ];
    setSourceData("military-flights", toFeatures(allMil));
    setSourceData("private-flights", toFeatures(fastData.flights.private || []));
  }
  if (fastData?.cctv) {
    setSourceData("cctv-source", toFeatures(fastData.cctv));
  }

  // Slow data
  if (slowData) {
    setSourceData("earthquakes", toFeatures(slowData.earthquakes || []));
    setSourceData("fires", toFeatures(slowData.fires || []));
    setSourceData("air-quality", toFeatures(slowData.air_quality || []));
    setSourceData("ships-source", toFeatures(slowData.ships || []));
  }

  // Layer visibility
  const layerMap: Record<LayerName, string[]> = {
    commercial: ["flights-layer"],
    military: ["military-flights-layer"],
    private: ["private-flights-layer"],
    ships: ["ships-layer"],
    earthquakes: ["earthquakes-layer"],
    fires: ["fires-layer"],
    weather: [],
    news: [],
    cctv: ["cctv-layer"],
    airQuality: ["air-quality-layer"],
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
