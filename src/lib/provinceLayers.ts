import type maplibregl from "maplibre-gl";
import type { ProvinceProperties } from "@/types";

let hoveredId: number | null = null;
let selectedId: number | null = null;

/** Setup province boundary layers with hover/click interactions */
export function setupProvinceLayers(
  map: maplibregl.Map,
  onProvinceSelect: (properties: ProvinceProperties | null) => void
) {
  fetch("/geo/thailand-provinces.geojson")
    .then((r) => r.json())
    .then((data) => {
      if (map.getSource("provinces")) return;

      map.addSource("provinces", {
        type: "geojson",
        data,
      });

      // Insert below data layers: prefer before country borders, fallback to before first flight layer
      const beforeLayer = map.getLayer("country-borders-fill")
        ? "country-borders-fill"
        : map.getLayer("domestic-flights-layer")
          ? "domestic-flights-layer"
          : undefined;

      // Fill layer: transparent default, green tint on hover/selected
      map.addLayer(
        {
          id: "provinces-fill",
          type: "fill",
          source: "provinces",
          paint: {
            "fill-color": [
              "case",
              ["boolean", ["feature-state", "selected"], false],
              "rgba(0, 255, 136, 0.15)",
              ["boolean", ["feature-state", "hover"], false],
              "rgba(0, 255, 136, 0.08)",
              "transparent",
            ],
          },
        },
        beforeLayer
      );

      // Line layer: subtle borders
      map.addLayer(
        {
          id: "provinces-line",
          type: "line",
          source: "provinces",
          paint: {
            "line-color": [
              "case",
              ["boolean", ["feature-state", "selected"], false],
              "rgba(0, 255, 136, 0.6)",
              ["boolean", ["feature-state", "hover"], false],
              "rgba(0, 255, 136, 0.4)",
              "rgba(0, 255, 136, 0.12)",
            ],
            "line-width": [
              "case",
              ["boolean", ["feature-state", "selected"], false],
              1.5,
              ["boolean", ["feature-state", "hover"], false],
              1,
              0.5,
            ],
          },
        },
        beforeLayer
      );

      // Label layer: Thai province names at mid-zoom
      map.addLayer({
        id: "provinces-label",
        type: "symbol",
        source: "provinces",
        minzoom: 6.5,
        maxzoom: 10,
        layout: {
          "text-field": ["get", "name_th"],
          "text-size": 11,
          "text-font": ["Open Sans Regular"],
          "text-allow-overlap": false,
          "text-ignore-placement": false,
        },
        paint: {
          "text-color": "rgba(0, 255, 136, 0.5)",
          "text-halo-color": "rgba(10, 14, 23, 0.8)",
          "text-halo-width": 1,
        },
      });

      // Hover handler
      map.on("mousemove", "provinces-fill", (e) => {
        if (!e.features?.length) return;
        map.getCanvas().style.cursor = "pointer";

        const feature = e.features[0];
        const featureId = feature.id as number;

        if (hoveredId !== null && hoveredId !== featureId) {
          map.setFeatureState({ source: "provinces", id: hoveredId }, { hover: false });
        }
        hoveredId = featureId;
        map.setFeatureState({ source: "provinces", id: hoveredId }, { hover: true });
      });

      map.on("mouseleave", "provinces-fill", () => {
        map.getCanvas().style.cursor = "";
        if (hoveredId !== null) {
          map.setFeatureState({ source: "provinces", id: hoveredId }, { hover: false });
          hoveredId = null;
        }
      });

      // Data layers that should take priority over province clicks
      const dataLayers = [
        "domestic-flights-layer", "international-flights-layer",
        "military-flights-layer", "private-flights-layer",
        "earthquakes-layer", "ships-layer",
        "fires-clusters", "fires-unclustered",
        "aq-clusters", "aq-unclustered",
        "flood-clusters", "flood-unclustered",
      ];

      // Click handler — skip if a data feature is under the cursor
      map.on("click", "provinces-fill", (e) => {
        if (!e.features?.length) return;

        // Check if any data layer feature exists at click point
        const point = e.point;
        const existing = dataLayers.filter((id) => map.getLayer(id));
        const hits = existing.length > 0 ? map.queryRenderedFeatures(point, { layers: existing }) : [];
        if (hits.length > 0) return; // let data layer handle it

        const feature = e.features[0];
        const featureId = feature.id as number;
        const props = feature.properties as Record<string, unknown>;

        // Clear previous selection
        if (selectedId !== null) {
          map.setFeatureState({ source: "provinces", id: selectedId }, { selected: false });
        }

        // Toggle selection
        if (selectedId === featureId) {
          selectedId = null;
          onProvinceSelect(null);
          return;
        }

        selectedId = featureId;
        map.setFeatureState({ source: "provinces", id: selectedId }, { selected: true });

        // Extract geometry for accurate point-in-polygon filtering
        const geom = feature.geometry;
        const geometry = geom && "coordinates" in geom
          ? (geom as { coordinates: number[][][] | number[][][][] }).coordinates
          : undefined;

        onProvinceSelect({
          name_th: props.name_th as string,
          name_en: props.name_en as string,
          code: props.code as string,
          region: props.region as string,
          region_en: props.region_en as string,
          population: Number(props.population),
          area_km2: Number(props.area_km2),
          capital_th: props.capital_th as string,
          capital_en: props.capital_en as string,
          bbox: props.bbox as string,
          geometry,
        });
      });
    })
    .catch(() => {
      /* province layers are optional enhancement */
    });
}

/** Clear province selection state (call when dossier is closed) */
export function clearProvinceSelection(map: maplibregl.Map | null) {
  if (!map) return;
  if (selectedId !== null) {
    try {
      map.setFeatureState({ source: "provinces", id: selectedId }, { selected: false });
    } catch { /* source may not exist yet */ }
    selectedId = null;
  }
}
