"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import LayerPanel from "@/components/LayerPanel";
import NewsFeed from "@/components/NewsFeed";
import { fetchFastData, fetchSlowData } from "@/lib/api";
import type { FastData, LayerName, SlowData } from "@/types";
import { Radio } from "lucide-react";

// Dynamic import to avoid SSR issues with MapLibre
const MapViewer = dynamic(() => import("@/components/MapViewer"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-[var(--bg-primary)] flex items-center justify-center">
      <div className="text-[var(--accent)] text-sm glow-text">
        INITIALIZING MAP...
      </div>
    </div>
  ),
});

const DEFAULT_LAYERS: LayerName[] = [
  "commercial",
  "military",
  "fires",
  "airQuality",
  "news",
];

export default function HomePage() {
  const [fastData, setFastData] = useState<FastData | null>(null);
  const [slowData, setSlowData] = useState<SlowData | null>(null);
  const [activeLayers, setActiveLayers] = useState<Set<LayerName>>(
    () => new Set(DEFAULT_LAYERS)
  );
  const [connectionStatus, setConnectionStatus] = useState<
    "connecting" | "live" | "error"
  >("connecting");
  const etagRef = useRef<string>("");

  // Toggle layer
  const handleToggle = useCallback((layer: LayerName) => {
    setActiveLayers((prev) => {
      const next = new Set(prev);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return next;
    });
  }, []);

  // Poll fast data every 60s
  useEffect(() => {
    let mounted = true;

    const poll = async () => {
      try {
        const result = await fetchFastData(etagRef.current);
        if (!mounted) return;
        if (!result.notModified && result.data) {
          setFastData(result.data);
          etagRef.current = result.etag || "";
        }
        setConnectionStatus("live");
      } catch {
        if (mounted) setConnectionStatus("error");
      }
    };

    poll();
    const interval = setInterval(poll, 60_000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  // Poll slow data every 120s
  useEffect(() => {
    let mounted = true;

    const poll = async () => {
      try {
        const data = await fetchSlowData();
        if (mounted) setSlowData(data);
      } catch {
        // keep previous data
      }
    };

    poll();
    const interval = setInterval(poll, 120_000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  // Count totals
  const totalFlights =
    (fastData?.flights?.commercial?.length || 0) +
    (fastData?.flights?.military?.length || 0) +
    (fastData?.flights?.private?.length || 0) +
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
            TH & KH OSINT
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
              {connectionStatus}
            </span>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-3 text-[var(--text-secondary)]">
            <span>
              <span className="text-[#00d4ff]">{totalFlights}</span> aircraft
            </span>
            <span>
              <span className="text-[#ff4400]">
                {slowData?.fires?.length || 0}
              </span>{" "}
              fires
            </span>
            <span>
              <span className="text-[#cc00ff]">
                {slowData?.air_quality?.length || 0}
              </span>{" "}
              AQ sensors
            </span>
          </div>

          {/* UTC time */}
          <UTCClock />
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

      {/* Bottom left: air quality alert */}
      {slowData?.air_quality && slowData.air_quality.some((a) => a.pm25 > 75) && (
        <div className="absolute bottom-8 left-3 z-20 hud-panel px-3 py-2 max-w-xs">
          <div className="flex items-center gap-2">
            <Radio size={12} className="text-[var(--danger)]" />
            <span className="text-[10px] text-[var(--danger)]">
              PM2.5 ALERT:{" "}
              {slowData.air_quality.filter((a) => a.pm25 > 75).length} stations
              above 75 µg/m³
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function UTCClock() {
  const [time, setTime] = useState("");

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTime(
        now.toISOString().slice(11, 19) + "Z"
      );
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <span className="text-[var(--accent)] font-mono tracking-wider">
      {time}
    </span>
  );
}
