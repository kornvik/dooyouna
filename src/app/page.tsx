"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { BarChart3, Flame, Github, Info, Layers, Newspaper } from "lucide-react";
import LayerPanel from "@/components/LayerPanel";
import NewsFeed from "@/components/NewsFeed";
import ThreatIndex from "@/components/ThreatIndex";
import EconomicPanel from "@/components/EconomicPanel";
import ProvinceDossier from "@/components/ProvinceDossier";
import { fetchSource } from "@/lib/api";
import type { FastData, LayerName, ProvinceProperties, SlowData } from "@/types";

const EMPTY_SLOW: SlowData = {
  earthquakes: [],
  fires: [],
  weather: { radar: [], host: "" },
  news: [],
  air_quality: [],
  ships: [],
  flood: [],
  wind: [],
  updated: {},
};

// Dynamic import to avoid SSR issues with MapLibre
const MapViewer = dynamic(() => import("@/components/MapViewer"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-[var(--bg-primary)] flex items-center justify-center">
      <div className="text-[var(--accent)] text-sm glow-text">
        กำลังโหลดแผนที่...
      </div>
    </div>
  ),
});

const DEFAULT_LAYERS: LayerName[] = [
  "domestic",
  "international",
  "fires",
  "airQuality",
  "news",
  "wind",
];

export default function HomePage() {
  const [fastData, setFastData] = useState<FastData | null>(null);
  const [slowData, setSlowData] = useState<SlowData>(EMPTY_SLOW);
  const [activeLayers, setActiveLayers] = useState<Set<LayerName>>(
    () => new Set(DEFAULT_LAYERS)
  );
  const [slowLoaded, setSlowLoaded] = useState<Set<string>>(() => new Set());
  const [connectionStatus, setConnectionStatus] = useState<
    "connecting" | "live" | "error"
  >("connecting");
  const [mobilePanel, setMobilePanel] = useState<null | "layers" | "news">(null);
  const [selectedProvince, setSelectedProvince] = useState<ProvinceProperties | null>(null);
  const [showDisclaimer, setShowDisclaimer] = useState(() => {
    if (typeof window === "undefined") return false;
    return !localStorage.getItem("disclaimerAck");
  });

  // Toggle layer
  const handleToggle = useCallback((layer: LayerName) => {
    setActiveLayers((prev) => {
      const next = new Set(prev);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return next;
    });
  }, []);

  // Progressive data loading: each source fetched independently
  useEffect(() => {
    let mounted = true;
    const intervals: ReturnType<typeof setInterval>[] = [];

    // Flights: fast poll (60s)
    const pollFlights = async () => {
      try {
        const data = await fetchSource("flights");
        if (!mounted || !data) return;
        setFastData({
          flights: data.flights || { domestic: [], international: [], military: [], private: [], total: 0 },
          military_flights: data.military_flights || [],
          updated: {},
        });
        setConnectionStatus("live");
      } catch {
        if (mounted) setConnectionStatus("error");
      }
    };
    pollFlights();
    intervals.push(setInterval(pollFlights, 60_000));

    // Slow sources: each fetches independently, polls every 120s
    const slowSources = [
      "earthquakes", "fires", "weather", "news", "air_quality", "flood", "wind",
    ] as const;

    for (const source of slowSources) {
      const poll = async () => {
        try {
          const data = await fetchSource(source);
          if (!mounted || data == null) return;
          setSlowData(prev => ({ ...prev, [source]: data }));
          setSlowLoaded(prev => { const next = new Set(prev); next.add(source); return next; });
        } catch {
          // keep previous data
        }
      };
      poll();
      intervals.push(setInterval(poll, 120_000));
    }

    return () => {
      mounted = false;
      intervals.forEach(clearInterval);
    };
  }, []);

  // Count totals (kept for backend/dossier use)
  // const militaryCount =
  //   (fastData?.flights?.military?.length || 0) +
  //   (fastData?.military_flights?.length || 0);

  return (
    <div className="w-screen h-screen relative overflow-hidden">
      {/* Map */}
      <MapViewer
        fastData={fastData}
        slowData={slowData}
        activeLayers={activeLayers}
        onProvinceSelect={setSelectedProvince}
      />

      {/* CRT Scanlines */}
      <div className="scanlines" />

      {/* Province Dossier */}
      {selectedProvince && (
        <ProvinceDossier
          provinceProperties={selectedProvince}
          fastData={fastData}
          slowData={slowData}
          onClose={() => setSelectedProvince(null)}
        />
      )}

      {/* Top header bar */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-2 py-1.5 sm:px-4 sm:py-2">
        <div className="flex items-center gap-1.5 sm:gap-3">
          <div className="text-[var(--accent)] font-bold text-xs sm:text-sm tracking-[0.2em] glow-text">
            DOOYOUNA
          </div>
          <div className="hidden sm:block text-[10px] text-[var(--text-secondary)] tracking-wider">
            ข่าวกรองประเทศไทย
          </div>
          <Link
            href="/trends"
            className="hidden sm:flex items-center gap-1 text-[10px] text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors ml-2 border border-[var(--border-color)] rounded px-2 py-0.5"
          >
            <BarChart3 size={10} />
            แนวโน้ม
          </Link>
          <button
            onClick={() => setShowDisclaimer(true)}
            className="ml-0.5 sm:ml-1 text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors cursor-pointer"
          >
            <Info size={12} />
          </button>
          <Link
            href="/fire"
            className="text-[var(--text-secondary)] hover:text-orange-400 transition-colors"
            title="ระบบเฝ้าระวังไฟป่า"
          >
            <Flame size={12} />
          </Link>
          <a
            href="https://github.com/kornvik/dooyouna"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors"
          >
            <Github size={12} />
          </a>
        </div>

        <div className="flex items-center gap-2 sm:gap-4 text-[10px]">
          {/* Live indicator */}
          <div className="flex items-center gap-1.5">
            <div
              className={`w-1.5 h-1.5 rounded-full pulse-dot ${
                connectionStatus === "live"
                  ? "bg-[var(--accent)]"
                  : connectionStatus === "error"
                    ? "bg-[var(--danger)]"
                    : "bg-[var(--warning)]"
              }`}
            />
            <span className="hidden sm:inline text-[var(--text-secondary)] uppercase">
              {connectionStatus === "live" ? "เชื่อมต่อ" : connectionStatus === "error" ? "ผิดพลาด" : "กำลังเชื่อมต่อ"}
            </span>
          </div>

          {/* Stats — desktop only */}
          <div className="hidden sm:flex items-center gap-3 text-[var(--text-secondary)]">
            <span>
              <span className="text-[#00ff88]">{fastData?.flights?.domestic?.length || 0}</span> ใน /{" "}
              <span className="text-[#00d4ff]">{fastData?.flights?.international?.length || 0}</span> นอก
              {/* <span className="text-[#ffdd00]">{militaryCount}</span> ทหาร */}
            </span>
            <span>
              <span className="text-[#ff4400]">
                {slowData?.fires?.length || 0}
              </span>{" "}
              จุดไฟ
            </span>
            <span>
              <span className="text-[#cc00ff]">
                {slowData?.air_quality?.length || 0}
              </span>{" "}
              สถานี AQ
            </span>
          </div>

          {/* Clock */}
          <DualClock />
        </div>
      </div>

      {/* Mobile floating toggle buttons */}
      <button
        className="sm:hidden fixed top-12 left-3 z-20 hud-panel p-2.5 cursor-pointer"
        onClick={() => setMobilePanel(mobilePanel === "layers" ? null : "layers")}
        aria-label="Toggle layers"
      >
        <Layers size={18} className="text-[var(--accent)]" />
      </button>
      <button
        className="sm:hidden fixed top-12 right-3 z-20 hud-panel p-2.5 cursor-pointer"
        onClick={() => setMobilePanel(mobilePanel === "news" ? null : "news")}
        aria-label="Toggle news"
      >
        <Newspaper size={18} className="text-[var(--accent)]" />
      </button>
      <Link
        href="/trends"
        className="sm:hidden fixed top-[6.5rem] right-3 z-20 hud-panel p-2.5"
        aria-label="Trends"
      >
        <BarChart3 size={18} className="text-[var(--accent)]" />
      </Link>

      {/* Mobile panel: Layers */}
      {mobilePanel === "layers" && (
        <div
          className="sm:hidden fixed inset-0 z-30 flex items-center justify-center bg-black/50"
          onClick={() => setMobilePanel(null)}
        >
          <div onClick={(e) => e.stopPropagation()}>
            <LayerPanel
              activeLayers={activeLayers}
              onToggle={handleToggle}
              fastData={fastData}
              slowData={slowData}
              slowLoaded={slowLoaded}
              onClose={() => setMobilePanel(null)}
            />
          </div>
        </div>
      )}

      {/* Mobile panel: News */}
      {mobilePanel === "news" && (
        <div
          className="sm:hidden fixed inset-0 z-30 flex items-center justify-center bg-black/50"
          onClick={() => setMobilePanel(null)}
        >
          <div onClick={(e) => e.stopPropagation()}>
            <NewsFeed
              articles={slowData?.news || []}
              visible={activeLayers.has("news")}
              onClose={() => setMobilePanel(null)}
            />
          </div>
        </div>
      )}

      {/* Desktop: Left panel — Layer toggles */}
      <div className="hidden sm:block absolute top-12 left-3 z-20">
        <LayerPanel
          activeLayers={activeLayers}
          onToggle={handleToggle}
          fastData={fastData}
          slowData={slowData}
          slowLoaded={slowLoaded}
        />
      </div>

      {/* Desktop: Right panel — News feed */}
      <div className="hidden sm:block absolute top-12 right-3 z-20">
        <NewsFeed
          articles={slowData?.news || []}
          visible={activeLayers.has("news")}
        />
      </div>

      {/* Desktop: Bottom right — economic panel */}
      <div className="hidden sm:flex absolute bottom-4 right-3 z-20 flex-col gap-2">
        {/* <ThreatIndex fastData={fastData} slowData={slowData} panel="security" /> */}
        <EconomicPanel />
      </div>

      {/* Desktop: Bottom left — natural disaster index */}
      <div className="hidden sm:block absolute bottom-4 left-3 z-20">
        <ThreatIndex fastData={fastData} slowData={slowData} panel="natural" />
      </div>

      {/* Mobile: Bottom horizontal scroll strip */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-20 overflow-x-auto pb-3 px-3">
        <div className="flex gap-2 w-max">
          <ThreatIndex fastData={fastData} slowData={slowData} panel="natural" />
          {/* <ThreatIndex fastData={fastData} slowData={slowData} panel="security" /> */}
          <EconomicPanel />
        </div>
      </div>

      {/* Disclaimer popup */}
      {showDisclaimer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="hud-panel max-w-sm mx-4 p-5 text-center">
            <Info size={20} className="text-[var(--accent)] mx-auto mb-3" />
            <p className="text-[11px] leading-relaxed text-[var(--text-secondary)] mb-4">
              ข้อมูลรวบรวมจากแหล่งเปิดสาธารณะ อาจไม่ครบถ้วนหรือมีความคลาดเคลื่อน ไม่ควรใช้เป็นข้อมูลอ้างอิงหลัก
            </p>
            <button
              onClick={() => { localStorage.setItem("disclaimerAck", "1"); setShowDisclaimer(false); }}
              className="text-[10px] tracking-wider px-4 py-1.5 border border-[var(--accent)] text-[var(--accent)] rounded hover:bg-[var(--accent)] hover:text-black transition-colors cursor-pointer"
            >
              รับทราบ
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DualClock() {
  const [localTime, setLocalTime] = useState("");
  const [thaiTime, setThaiTime] = useState("");

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setLocalTime(now.toLocaleTimeString("en-GB", { hour12: false }));
      setThaiTime(
        now.toLocaleTimeString("th-TH", {
          hour12: false,
          timeZone: "Asia/Bangkok",
        })
      );
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex gap-3 text-[10px] font-mono tracking-wider">
      <span className="hidden sm:inline text-[var(--text-secondary)]">
        LOCAL <span className="text-[var(--accent)]">{localTime}</span>
      </span>
      <span className="text-[var(--text-secondary)]">
        TH <span className="text-[var(--accent)]">{thaiTime}</span>
      </span>
    </div>
  );
}
