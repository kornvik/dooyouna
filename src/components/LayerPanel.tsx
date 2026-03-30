"use client";

import type { FastData, LayerName, SlowData } from "@/types";
import {
  Plane,
  // Ship,
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
  Sun,
  Cloud,
  Mountain,
} from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";

interface LayerPanelProps {
  activeLayers: Set<LayerName>;
  onToggle: (layer: LayerName) => void;
  fastData: FastData | null;
  slowData: SlowData | null;
  slowLoaded: Set<string>;
  onClose?: () => void;
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
  refreshInfo?: string;
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
  refreshInfo,
  onToggle,
}: LayerItemProps) {
  const infoRef = useRef<HTMLSpanElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);

  const showTip = () => {
    const el = infoRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const tipWidth = 200;
    // If tooltip would overflow right edge, position to the left of the icon
    const x = rect.right + 6 + tipWidth > window.innerWidth
      ? rect.left - tipWidth - 6
      : rect.right + 6;
    setTip({ x, y: rect.top + rect.height / 2 });
  };

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
      <span
        ref={infoRef}
        className="flex-shrink-0 inline-flex items-center"
        onMouseEnter={showTip}
        onMouseLeave={() => setTip(null)}
      >
        <Info size={9} style={{ color: "var(--text-secondary)" }} className="opacity-30" />
      </span>
      {tip && createPortal(
        <span
          className="info-tooltip-fixed"
          style={{ left: tip.x, top: tip.y }}
        >
          แหล่ง: {source}{refreshInfo ? `\nอัปเดตทุก: ${refreshInfo}` : ""}
        </span>,
        document.body,
      )}
    </button>
  );
}

export default function LayerPanel({
  activeLayers,
  onToggle,
  fastData,
  slowData,
  slowLoaded,
  onClose,
}: LayerPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const flights = fastData?.flights;

  return (
    <div className="hud-panel w-[75vw] sm:w-56 flex flex-col max-h-[80vh] sm:max-h-none">
      {/* Header — click anywhere to collapse on desktop */}
      <div
        onClick={() => { if (!onClose) setCollapsed((c) => !c); }}
        className="px-3 py-2 border-b border-[var(--border-color)] flex items-center justify-center sm:justify-between w-full relative sm:cursor-pointer"
      >
        <span className="text-[10px] tracking-widest text-[var(--accent)] glow-text">
          ชั้นข้อมูล
        </span>
        <div className="flex items-center gap-2 sm:static absolute right-3">
          <ChevronDown
            size={12}
            className="hidden sm:block text-[var(--text-secondary)] transition-transform duration-200"
            style={{ transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)" }}
          />
          {onClose && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onClose(); } }}
              className="text-[var(--text-secondary)] hover:text-[var(--accent)] text-sm leading-none cursor-pointer"
            >
              ✕
            </span>
          )}
        </div>
      </div>

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
          refreshInfo="~1 นาที"
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
          refreshInfo="~1 นาที"
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
          refreshInfo="~1 นาที"
          onToggle={onToggle}
        />

        {/* Security — military flights hidden from UI but code retained */}
        {/* <div className="px-2 pt-3 pb-1 text-[9px] tracking-wider text-[var(--text-secondary)] uppercase">
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
          refreshInfo="~1 นาที"
          onToggle={onToggle}
        /> */}
        {/* Ships disabled — AIS WebSocket source currently broken
        <LayerItem
          name="ships"
          label="เรือ"
          icon={<Ship size={13} />}
          count={slowLoaded.has("ships") ? slowData?.ships?.length : undefined}
          loading={!slowLoaded.has("ships")}
          active={activeLayers.has("ships")}
          color="#00ff88"
          source="AIS (MarineTraffic)"
          refreshInfo="~30 นาที"
          onToggle={onToggle}
        /> */}

        {/* Natural Hazards */}
        <div className="px-2 pt-3 pb-1 text-[9px] tracking-wider text-[var(--text-secondary)] uppercase">
          ภัยธรรมชาติ
        </div>
        <LayerItem
          name="earthquakes"
          label="แผ่นดินไหว"
          icon={<Activity size={13} />}
          count={slowLoaded.has("earthquakes") ? slowData?.earthquakes?.length : undefined}
          loading={!slowLoaded.has("earthquakes")}
          active={activeLayers.has("earthquakes")}
          color="#ff4444"
          source="USGS Earthquake API"
          refreshInfo="~30 นาที"
          onToggle={onToggle}
        />
        <LayerItem
          name="fires"
          label="จุดความร้อน"
          icon={<Flame size={13} />}
          count={slowLoaded.has("fires") ? slowData?.fires?.length : undefined}
          loading={!slowLoaded.has("fires")}
          active={activeLayers.has("fires")}
          color="#ff4400"
          source="NASA FIRMS (VIIRS/MODIS)"
          refreshInfo="~30 นาที"
          onToggle={onToggle}
        />
        <LayerItem
          name="flood"
          label="น้ำท่วม / ระดับน้ำ"
          icon={<Droplets size={13} />}
          count={slowLoaded.has("flood") ? slowData?.flood?.length : undefined}
          loading={!slowLoaded.has("flood")}
          active={activeLayers.has("flood")}
          color="#4488ff"
          source="สสน. (thaiwater.net)"
          refreshInfo="~30 นาที"
          onToggle={onToggle}
        />
        <LayerItem
          name="floodSatellite"
          label="ดาวเทียมน้ำท่วม"
          icon={<Satellite size={13} />}
          active={activeLayers.has("floodSatellite")}
          color="#0066ff"
          source="NASA GIBS (MODIS Flood 3-Day)"
          refreshInfo="รายวัน"
          onToggle={onToggle}
        />
        <LayerItem
          name="weather"
          label="เรดาร์สภาพอากาศ"
          icon={<CloudRain size={13} />}
          loading={!slowLoaded.has("weather")}
          active={activeLayers.has("weather")}
          color="#4488ff"
          source="RainViewer API"
          refreshInfo="~30 นาที"
          onToggle={onToggle}
        />
        <LayerItem
          name="wind"
          label="ทิศทางลม"
          icon={<Wind size={13} />}
          count={slowLoaded.has("wind") ? slowData?.wind?.length : undefined}
          loading={!slowLoaded.has("wind")}
          active={activeLayers.has("wind")}
          color="#aabbcc"
          source="Open-Meteo (free)"
          refreshInfo="~30 นาที"
          onToggle={onToggle}
        />
        <LayerItem
          name="airQuality"
          label="คุณภาพอากาศ PM2.5"
          icon={<Cloud size={13} />}
          count={slowLoaded.has("air_quality") ? slowData?.air_quality?.length : undefined}
          loading={!slowLoaded.has("air_quality")}
          active={activeLayers.has("airQuality")}
          color="#cc00ff"
          source="กรมควบคุมมลพิษ (air4thai)"
          refreshInfo="~30 นาที"
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
          count={slowLoaded.has("news") ? slowData?.news?.length : undefined}
          loading={!slowLoaded.has("news")}
          active={activeLayers.has("news")}
          color="#44aaff"
          source="Bangkok Post / Khmer Times / RSS"
          refreshInfo="~30 นาที"
          onToggle={onToggle}
        />

        {/* Economic Activity */}
        <div className="px-2 pt-3 pb-1 text-[9px] tracking-wider text-[var(--text-secondary)] uppercase">
          กิจกรรมเศรษฐกิจ
        </div>
        <LayerItem
          name="nightLights"
          label="แสงกลางคืน VIIRS"
          icon={<Sun size={13} />}
          active={activeLayers.has("nightLights")}
          color="#ffdd00"
          source="NASA VIIRS Day/Night Band (Daily)"
          refreshInfo="รายวัน"
          onToggle={onToggle}
        />

        {/* Map Visualization */}
        <div className="px-2 pt-3 pb-1 text-[9px] tracking-wider text-[var(--text-secondary)] uppercase">
          แผนที่
        </div>
        <LayerItem
          name="terrain"
          label="ภูมิประเทศ"
          icon={<Mountain size={13} />}
          active={activeLayers.has("terrain")}
          color="#4a6741"
          source="แผนที่ความสูงภูมิประเทศ"
          onToggle={onToggle}
        />
      </div>}
    </div>
  );
}
