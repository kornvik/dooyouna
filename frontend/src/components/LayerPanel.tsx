"use client";

import type { FastData, LayerName, SlowData } from "@/types";
import {
  Plane,
  Ship,
  Flame,
  CloudRain,
  Newspaper,
  Camera,
  Wind,
  Activity,
  Shield,
  Briefcase,
  Droplets,
} from "lucide-react";
import type { ReactNode } from "react";

interface LayerPanelProps {
  activeLayers: Set<LayerName>;
  onToggle: (layer: LayerName) => void;
  fastData: FastData | null;
  slowData: SlowData | null;
}

interface LayerItemProps {
  name: LayerName;
  label: string;
  icon: ReactNode;
  count?: number;
  active: boolean;
  color: string;
  onToggle: (name: LayerName) => void;
}

function LayerItem({
  name,
  label,
  icon,
  count,
  active,
  color,
  onToggle,
}: LayerItemProps) {
  return (
    <button
      onClick={() => onToggle(name)}
      className={`layer-toggle w-full text-left ${active ? "active" : ""}`}
    >
      <div
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ background: active ? color : "#333" }}
      />
      <span style={{ color: active ? color : "var(--text-secondary)" }}>
        {icon}
      </span>
      <span
        className="flex-1 truncate"
        style={{ color: active ? "var(--text-primary)" : "var(--text-secondary)" }}
      >
        {label}
      </span>
      {count !== undefined && (
        <span className="text-[10px]" style={{ color: "var(--text-secondary)" }}>
          {count}
        </span>
      )}
    </button>
  );
}

export default function LayerPanel({
  activeLayers,
  onToggle,
  fastData,
  slowData,
}: LayerPanelProps) {
  const flights = fastData?.flights;

  return (
    <div className="hud-panel w-56 flex flex-col">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[var(--border-color)]">
        <div className="text-[10px] tracking-widest text-[var(--accent)] glow-text">
          DATA LAYERS
        </div>
      </div>

      <div className="p-1.5 flex flex-col gap-0.5 overflow-y-auto max-h-[70vh]">
        {/* Aviation */}
        <div className="px-2 pt-2 pb-1 text-[9px] tracking-wider text-[var(--text-secondary)] uppercase">
          Aviation
        </div>
        <LayerItem
          name="commercial"
          label="Commercial"
          icon={<Plane size={13} />}
          count={flights?.commercial?.length}
          active={activeLayers.has("commercial")}
          color="#00d4ff"
          onToggle={onToggle}
        />
        <LayerItem
          name="military"
          label="Military"
          icon={<Shield size={13} />}
          count={
            (flights?.military?.length || 0) +
            (fastData?.military_flights?.length || 0)
          }
          active={activeLayers.has("military")}
          color="#ffdd00"
          onToggle={onToggle}
        />
        <LayerItem
          name="private"
          label="Private / Jets"
          icon={<Briefcase size={13} />}
          count={flights?.private?.length}
          active={activeLayers.has("private")}
          color="#ff8800"
          onToggle={onToggle}
        />

        {/* Maritime */}
        <div className="px-2 pt-3 pb-1 text-[9px] tracking-wider text-[var(--text-secondary)] uppercase">
          Maritime
        </div>
        <LayerItem
          name="ships"
          label="Vessels"
          icon={<Ship size={13} />}
          count={slowData?.ships?.length}
          active={activeLayers.has("ships")}
          color="#00ff88"
          onToggle={onToggle}
        />

        {/* Environment */}
        <div className="px-2 pt-3 pb-1 text-[9px] tracking-wider text-[var(--text-secondary)] uppercase">
          Environment
        </div>
        <LayerItem
          name="earthquakes"
          label="Earthquakes"
          icon={<Activity size={13} />}
          count={slowData?.earthquakes?.length}
          active={activeLayers.has("earthquakes")}
          color="#ff4444"
          onToggle={onToggle}
        />
        <LayerItem
          name="fires"
          label="Fire Hotspots"
          icon={<Flame size={13} />}
          count={slowData?.fires?.length}
          active={activeLayers.has("fires")}
          color="#ff4400"
          onToggle={onToggle}
        />
        <LayerItem
          name="airQuality"
          label="PM2.5 Air Quality"
          icon={<Wind size={13} />}
          count={slowData?.air_quality?.length}
          active={activeLayers.has("airQuality")}
          color="#cc00ff"
          onToggle={onToggle}
        />
        <LayerItem
          name="flood"
          label="Flood / Water Level"
          icon={<Droplets size={13} />}
          count={slowData?.flood?.length}
          active={activeLayers.has("flood")}
          color="#4488ff"
          onToggle={onToggle}
        />
        <LayerItem
          name="weather"
          label="Weather Radar"
          icon={<CloudRain size={13} />}
          active={activeLayers.has("weather")}
          color="#4488ff"
          onToggle={onToggle}
        />

        {/* Intelligence */}
        <div className="px-2 pt-3 pb-1 text-[9px] tracking-wider text-[var(--text-secondary)] uppercase">
          Intelligence
        </div>
        <LayerItem
          name="news"
          label="News Feed"
          icon={<Newspaper size={13} />}
          count={slowData?.news?.length}
          active={activeLayers.has("news")}
          color="#44aaff"
          onToggle={onToggle}
        />
        <LayerItem
          name="cctv"
          label="CCTV Cameras"
          icon={<Camera size={13} />}
          count={fastData?.cctv?.length}
          active={activeLayers.has("cctv")}
          color="#aa88ff"
          onToggle={onToggle}
        />
      </div>
    </div>
  );
}
