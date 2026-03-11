"use client";

import type { FastData, LayerName, SlowData } from "@/types";
import {
  Plane,
  Ship,
  Flame,
  CloudRain,
  Newspaper,
  Wind,
  Activity,
  Shield,
  Briefcase,
  Droplets,
  Satellite,
  Info,
  UtensilsCrossed,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { ChevronDown } from "lucide-react";

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
  loading?: boolean;
  active: boolean;
  color: string;
  source: string;
  onToggle: (name: LayerName) => void;
}

function LayerItem({
  name,
  label,
  icon,
  count,
  loading,
  active,
  color,
  source,
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
      {loading ? (
        <span
          className="inline-block w-3 h-3 border border-t-transparent rounded-full animate-spin"
          style={{ borderColor: `${color}44`, borderTopColor: "transparent" }}
        />
      ) : count !== undefined ? (
        <span className="text-[10px]" style={{ color: "var(--text-secondary)" }}>
          {count}
        </span>
      ) : null}
      <span className="info-tooltip-wrapper flex-shrink-0">
        <Info size={9} style={{ color: "var(--text-secondary)" }} className="opacity-30" />
        <span className="info-tooltip">{source}</span>
      </span>
    </button>
  );
}

export default function LayerPanel({
  activeLayers,
  onToggle,
  fastData,
  slowData,
}: LayerPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const flights = fastData?.flights;

  return (
    <div className="hud-panel w-56 flex flex-col">
      {/* Header — click to collapse */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="px-3 py-2 border-b border-[var(--border-color)] flex items-center justify-between w-full text-left cursor-pointer"
      >
        <span className="text-[10px] tracking-widest text-[var(--accent)] glow-text">
          ชั้นข้อมูล
        </span>
        <ChevronDown
          size={12}
          className="text-[var(--text-secondary)] transition-transform duration-200"
          style={{ transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)" }}
        />
      </button>

      {!collapsed && <div className="p-1.5 flex flex-col gap-0.5 overflow-y-auto max-h-[70vh]">
        {/* Flights */}
        <div className="px-2 pt-2 pb-1 text-[9px] tracking-wider text-[var(--text-secondary)] uppercase">
          เที่ยวบิน
        </div>
        <LayerItem
          name="domestic"
          label="ในประเทศ"
          icon={<Plane size={13} />}
          count={flights?.domestic?.length}
          loading={!fastData}
          active={activeLayers.has("domestic")}
          color="#00ff88"
          source="ADS-B Exchange / OpenSky"
          onToggle={onToggle}
        />
        <LayerItem
          name="international"
          label="ระหว่างประเทศ"
          icon={<Plane size={13} />}
          count={flights?.international?.length}
          loading={!fastData}
          active={activeLayers.has("international")}
          color="#00d4ff"
          source="ADS-B Exchange / OpenSky"
          onToggle={onToggle}
        />
        <LayerItem
          name="private"
          label="เครื่องบินส่วนตัว"
          icon={<Briefcase size={13} />}
          count={flights?.private?.length}
          loading={!fastData}
          active={activeLayers.has("private")}
          color="#ff8800"
          source="ADS-B Exchange"
          onToggle={onToggle}
        />

        {/* Security */}
        <div className="px-2 pt-3 pb-1 text-[9px] tracking-wider text-[var(--text-secondary)] uppercase">
          ความมั่นคง
        </div>
        <LayerItem
          name="military"
          label="เที่ยวบินทหาร"
          icon={<Shield size={13} />}
          count={
            (flights?.military?.length || 0) +
            (fastData?.military_flights?.length || 0)
          }
          loading={!fastData}
          active={activeLayers.has("military")}
          color="#ffdd00"
          source="ADS-B Exchange / MILMOD DB"
          onToggle={onToggle}
        />
        <LayerItem
          name="ships"
          label="เรือ"
          icon={<Ship size={13} />}
          count={slowData?.ships?.length}
          loading={!slowData}
          active={activeLayers.has("ships")}
          color="#00ff88"
          source="AIS (MarineTraffic)"
          onToggle={onToggle}
        />

        {/* Natural Hazards */}
        <div className="px-2 pt-3 pb-1 text-[9px] tracking-wider text-[var(--text-secondary)] uppercase">
          ภัยธรรมชาติ
        </div>
        <LayerItem
          name="earthquakes"
          label="แผ่นดินไหว"
          icon={<Activity size={13} />}
          count={slowData?.earthquakes?.length}
          loading={!slowData}
          active={activeLayers.has("earthquakes")}
          color="#ff4444"
          source="USGS Earthquake API"
          onToggle={onToggle}
        />
        <LayerItem
          name="fires"
          label="จุดความร้อน"
          icon={<Flame size={13} />}
          count={slowData?.fires?.length}
          loading={!slowData}
          active={activeLayers.has("fires")}
          color="#ff4400"
          source="NASA FIRMS (VIIRS/MODIS)"
          onToggle={onToggle}
        />
        <LayerItem
          name="flood"
          label="น้ำท่วม / ระดับน้ำ"
          icon={<Droplets size={13} />}
          count={slowData?.flood?.length}
          loading={!slowData}
          active={activeLayers.has("flood")}
          color="#4488ff"
          source="สสน. (thaiwater.net)"
          onToggle={onToggle}
        />
        <LayerItem
          name="floodSatellite"
          label="ดาวเทียมน้ำท่วม"
          icon={<Satellite size={13} />}
          active={activeLayers.has("floodSatellite")}
          color="#0066ff"
          source="NASA GIBS (MODIS Flood 3-Day)"
          onToggle={onToggle}
        />
        <LayerItem
          name="weather"
          label="เรดาร์สภาพอากาศ"
          icon={<CloudRain size={13} />}
          loading={!slowData}
          active={activeLayers.has("weather")}
          color="#4488ff"
          source="RainViewer API"
          onToggle={onToggle}
        />
        <LayerItem
          name="airQuality"
          label="คุณภาพอากาศ PM2.5"
          icon={<Wind size={13} />}
          count={slowData?.air_quality?.length}
          loading={!slowData}
          active={activeLayers.has("airQuality")}
          color="#cc00ff"
          source="กรมควบคุมมลพิษ (air4thai)"
          onToggle={onToggle}
        />

        {/* Intelligence */}
        <div className="px-2 pt-3 pb-1 text-[9px] tracking-wider text-[var(--text-secondary)] uppercase">
          ข่าวกรอง
        </div>
        <LayerItem
          name="news"
          label="ฟีดข่าว"
          icon={<Newspaper size={13} />}
          count={slowData?.news?.length}
          loading={!slowData}
          active={activeLayers.has("news")}
          color="#44aaff"
          source="Bangkok Post / Khmer Times / RSS"
          onToggle={onToggle}
        />

        {/* Kaprao Index */}
        <div className="px-2 pt-3 pb-1 text-[9px] tracking-wider text-[var(--text-secondary)] uppercase">
          ดัชนีกะเพรา
        </div>
        <LayerItem
          name="kaprao"
          label="ร้านกะเพรา"
          icon={<UtensilsCrossed size={13} />}
          count={slowData?.kaprao?.length}
          loading={!slowData}
          active={activeLayers.has("kaprao")}
          color="#ff8800"
          source="Google Places API"
          onToggle={onToggle}
        />
      </div>}
    </div>
  );
}
