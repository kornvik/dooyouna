"use client";

import type { FastData, SlowData } from "@/types";
import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";

interface ThreatIndexProps {
  fastData: FastData | null;
  slowData: SlowData | null;
}

interface ThreatSignal {
  label: string;
  score: number; // 0-100
  detail: string;
  color: string;
}

const LEVELS = [
  { name: "CALM", min: 0, color: "#00ff88", bg: "rgba(0,255,136,0.1)" },
  { name: "ELEVATED", min: 25, color: "#ffaa00", bg: "rgba(255,170,0,0.1)" },
  { name: "HIGH", min: 55, color: "#ff6600", bg: "rgba(255,102,0,0.1)" },
  { name: "CRITICAL", min: 80, color: "#ff0044", bg: "rgba(255,0,68,0.1)" },
] as const;

function getLevel(score: number) {
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (score >= LEVELS[i].min) return LEVELS[i];
  }
  return LEVELS[0];
}

export default function ThreatIndex({ fastData, slowData }: ThreatIndexProps) {
  const { signals, totalScore, level } = useMemo(() => {
    const sigs: ThreatSignal[] = [];

    // --- Military activity (0-100) ---
    const milCount =
      (fastData?.flights?.military?.length || 0) +
      (fastData?.military_flights?.length || 0);
    // Baseline: 0-2 is calm, 3-5 elevated, 6-10 high, 10+ critical
    const milScore = Math.min(100, milCount * 12);
    sigs.push({
      label: "MIL FLIGHTS",
      score: milScore,
      detail: `${milCount} active`,
      color: milScore > 60 ? "#ff4444" : milScore > 30 ? "#ffaa00" : "#00ff88",
    });

    // --- PM2.5 crisis (0-100) ---
    const aqStations = slowData?.air_quality || [];
    const dangerousStations = aqStations.filter(
      (s) => s.pm25 !== null && s.pm25 > 75
    );
    const avgPm25 =
      aqStations.length > 0
        ? aqStations.reduce((sum, s) => sum + (s.pm25 || 0), 0) /
          aqStations.length
        : 0;
    // AQI thresholds: <25=good, 25-50=moderate, 50-100=unhealthy for sensitive, >100=unhealthy
    const pm25Score = Math.min(100, Math.max(0, (avgPm25 - 15) * 1.5));
    sigs.push({
      label: "PM2.5",
      score: Math.round(pm25Score),
      detail: `avg ${avgPm25.toFixed(0)} µg/m³ (${dangerousStations.length} danger)`,
      color:
        pm25Score > 60 ? "#ff4444" : pm25Score > 30 ? "#ffaa00" : "#00ff88",
    });

    // --- Fire hotspots (0-100) ---
    const fireCount = slowData?.fires?.length || 0;
    // SE Asia burning season can have 2000+ fires. 0-200=calm, 200-800=elevated, 800-1500=high, 1500+=critical
    const fireScore = Math.min(100, (fireCount / 1500) * 100);
    sigs.push({
      label: "FIRES",
      score: Math.round(fireScore),
      detail: `${fireCount.toLocaleString()} hotspots`,
      color:
        fireScore > 60 ? "#ff4444" : fireScore > 30 ? "#ffaa00" : "#00ff88",
    });

    // --- Seismic activity (0-100) ---
    const quakes = slowData?.earthquakes || [];
    const maxMag = quakes.reduce(
      (max, q) => Math.max(max, q.magnitude || 0),
      0
    );
    // M3=low, M5=elevated, M6=high, M7+=critical
    const seismicScore =
      quakes.length === 0 ? 0 : Math.min(100, (maxMag - 2) * 25);
    sigs.push({
      label: "SEISMIC",
      score: Math.max(0, Math.round(seismicScore)),
      detail: quakes.length > 0 ? `M${maxMag.toFixed(1)} max` : "quiet",
      color:
        seismicScore > 60
          ? "#ff4444"
          : seismicScore > 30
            ? "#ffaa00"
            : "#00ff88",
    });

    // --- Flood (0-100) ---
    const floodStations = slowData?.flood || [];
    const criticalFloods = floodStations.filter((s) => s.critical);
    // 0 stations=calm, 1-5=elevated, 5-15=high, 15+=critical
    const floodScore = Math.min(
      100,
      criticalFloods.length * 8 + floodStations.length * 2
    );
    sigs.push({
      label: "FLOOD",
      score: Math.round(floodScore),
      detail: `${criticalFloods.length} critical / ${floodStations.length} high`,
      color:
        floodScore > 60 ? "#ff4444" : floodScore > 30 ? "#ffaa00" : "#00ff88",
    });

    // --- News volume (0-100) ---
    const newsCount = slowData?.news?.length || 0;
    // Baseline: 0-10=calm, 10-25=elevated, 25-40=high, 40+=critical
    const newsScore = Math.min(100, (newsCount / 40) * 100);
    sigs.push({
      label: "INTEL CHATTER",
      score: Math.round(newsScore),
      detail: `${newsCount} articles`,
      color:
        newsScore > 60 ? "#ff4444" : newsScore > 30 ? "#ffaa00" : "#00ff88",
    });

    // Weighted average
    const weights = [0.25, 0.2, 0.15, 0.15, 0.1, 0.15]; // mil, pm25, fires, seismic, flood, news
    const total = Math.round(
      sigs.reduce((sum, s, i) => sum + s.score * weights[i], 0)
    );

    return { signals: sigs, totalScore: total, level: getLevel(total) };
  }, [fastData, slowData]);

  return (
    <div className="hud-panel w-56">
      {/* Header with threat level */}
      <div
        className="px-3 py-2 border-b border-[var(--border-color)] flex items-center justify-between"
        style={{ background: level.bg }}
      >
        <div className="flex items-center gap-2">
          <AlertTriangle size={12} style={{ color: level.color }} />
          <span
            className="text-[10px] tracking-widest font-bold"
            style={{ color: level.color }}
          >
            {level.name}
          </span>
        </div>
        <span
          className="text-sm font-bold font-mono"
          style={{ color: level.color }}
        >
          {totalScore}
        </span>
      </div>

      {/* Composite bar */}
      <div className="px-3 pt-2 pb-1">
        <div className="h-1.5 rounded-full bg-[rgba(255,255,255,0.05)] overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-1000"
            style={{
              width: `${totalScore}%`,
              background: `linear-gradient(90deg, #00ff88, ${level.color})`,
            }}
          />
        </div>
      </div>

      {/* Individual signals */}
      <div className="px-3 py-1.5 flex flex-col gap-1">
        {signals.map((sig) => (
          <div key={sig.label} className="flex items-center gap-2 text-[9px]">
            <span className="w-[72px] text-[var(--text-secondary)] tracking-wider">
              {sig.label}
            </span>
            <div className="flex-1 h-1 rounded-full bg-[rgba(255,255,255,0.05)] overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${sig.score}%`,
                  background: sig.color,
                }}
              />
            </div>
            <span
              className="w-[80px] text-right truncate"
              style={{ color: sig.color }}
            >
              {sig.detail}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
