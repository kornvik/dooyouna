"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import LayerPanel from "@/components/LayerPanel";
import NewsFeed from "@/components/NewsFeed";
import ThreatIndex from "@/components/ThreatIndex";
import EconomicPanel from "@/components/EconomicPanel";
import { fetchSource } from "@/lib/api";
import type { FastData, LayerName, SlowData } from "@/types";

const EMPTY_SLOW: SlowData = {
  earthquakes: [],
  fires: [],
  weather: { radar: [], host: "" },
  news: [],
  air_quality: [],
  ships: [],
  flood: [],
  kaprao: [],
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
  "military",
  "fires",
  "airQuality",
  "flood",
  "news",
];

export default function HomePage() {
  const [fastData, setFastData] = useState<FastData | null>(null);
  const [slowData, setSlowData] = useState<SlowData>(EMPTY_SLOW);
  const [activeLayers, setActiveLayers] = useState<Set<LayerName>>(
    () => new Set(DEFAULT_LAYERS)
  );
  const [connectionStatus, setConnectionStatus] = useState<
    "connecting" | "live" | "error"
  >("connecting");

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
      "earthquakes", "fires", "weather", "news", "air_quality", "flood", "ships", "kaprao",
    ] as const;

    for (const source of slowSources) {
      const poll = async () => {
        try {
          const data = await fetchSource(source);
          if (!mounted || data == null) return;
          setSlowData(prev => ({ ...prev, [source]: data }));
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

  // Count totals
  const militaryCount =
    (fastData?.flights?.military?.length || 0) +
    (fastData?.military_flights?.length || 0);

  return (
    <div className="w-screen h-screen relative overflow-hidden">
      {/* Map */}
      <MapViewer
        fastData={fastData}
        slowData={slowData}
        activeLayers={activeLayers}
      />

      {/* CRT Scanlines */}
      <div className="scanlines" />

      {/* Top header bar */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-3">
          <div className="text-[var(--accent)] font-bold text-sm tracking-[0.2em] glow-text">
            DOOYOUNA
          </div>
          <div className="text-[10px] text-[var(--text-secondary)] tracking-wider">
            ข่าวกรองประเทศไทย
          </div>
        </div>

        <div className="flex items-center gap-4 text-[10px]">
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
            <span className="text-[var(--text-secondary)] uppercase">
              {connectionStatus === "live" ? "เชื่อมต่อ" : connectionStatus === "error" ? "ผิดพลาด" : "กำลังเชื่อมต่อ"}
            </span>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-3 text-[var(--text-secondary)]">
            <span>
              <span className="text-[#00ff88]">{fastData?.flights?.domestic?.length || 0}</span> ใน /{" "}
              <span className="text-[#00d4ff]">{fastData?.flights?.international?.length || 0}</span> นอก /{" "}
              <span className="text-[#ffdd00]">{militaryCount}</span> ทหาร
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

          {/* UTC time */}
          <DualClock />
        </div>
      </div>

      {/* Left panel: Layer toggles */}
      <div className="absolute top-12 left-3 z-20">
        <LayerPanel
          activeLayers={activeLayers}
          onToggle={handleToggle}
          fastData={fastData}
          slowData={slowData}
        />
      </div>

      {/* Right panel: News feed */}
      <div className="absolute top-12 right-3 z-20">
        <NewsFeed
          articles={slowData?.news || []}
          visible={activeLayers.has("news")}
        />
      </div>

      {/* Bottom right: security index + economic panel */}
      <div className="absolute bottom-4 right-3 z-20 flex flex-col gap-2">
        <ThreatIndex fastData={fastData} slowData={slowData} panel="security" />
        <EconomicPanel />
      </div>

      {/* Bottom left: natural disaster index */}
      <div className="absolute bottom-4 left-3 z-20">
        <ThreatIndex fastData={fastData} slowData={slowData} panel="natural" />
      </div>
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
      <span className="text-[var(--text-secondary)]">
        LOCAL <span className="text-[var(--accent)]">{localTime}</span>
      </span>
      <span className="text-[var(--text-secondary)]">
        TH <span className="text-[var(--accent)]">{thaiTime}</span>
      </span>
    </div>
  );
}
