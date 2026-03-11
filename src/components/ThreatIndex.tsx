"use client";

import type { FastData, SlowData } from "@/types";
import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";

interface ThreatIndexProps {
  fastData: FastData | null;
  slowData: SlowData | null;
  panel?: "natural" | "security" | "both";
}

interface ThreatSignal {
  label: string;
  score: number; // 0-100
  detail: string;
  color: string;
}

interface PanelData {
  title: string;
  signals: ThreatSignal[];
  totalScore: number;
  level: (typeof LEVELS)[number];
}

const LEVELS = [
  { name: "ปกติ", min: 0, color: "#00ff88", bg: "rgba(0,255,136,0.1)" },
  { name: "เฝ้าระวัง", min: 25, color: "#ffaa00", bg: "rgba(255,170,0,0.1)" },
  { name: "สูง", min: 55, color: "#ff6600", bg: "rgba(255,102,0,0.1)" },
  { name: "วิกฤต", min: 80, color: "#ff0044", bg: "rgba(255,0,68,0.1)" },
] as const;

function getLevel(score: number) {
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (score >= LEVELS[i].min) return LEVELS[i];
  }
  return LEVELS[0];
}

function signalColor(score: number): string {
  return score > 60 ? "#ff4444" : score > 30 ? "#ffaa00" : "#00ff88";
}

function LoadingPanel({ title }: { title: string }) {
  return (
    <div className="hud-panel min-w-[200px] w-56">
      <div
        className="px-3 py-2 border-b border-[var(--border-color)] flex items-center justify-between"
        style={{ background: "rgba(255,255,255,0.03)" }}
      >
        <div className="flex items-center gap-2">
          <AlertTriangle size={12} style={{ color: "var(--text-secondary)" }} />
          <span className="text-[10px] tracking-widest font-bold text-[var(--text-secondary)]">
            {title}
          </span>
        </div>
        <span
          className="inline-block w-3 h-3 border border-t-transparent rounded-full animate-spin"
          style={{ borderColor: "var(--text-secondary)", borderTopColor: "transparent" }}
        />
      </div>
      <div className="px-3 py-3 flex items-center justify-center">
        <span className="text-[9px] text-[var(--text-secondary)] animate-pulse">
          กำลังโหลด...
        </span>
      </div>
    </div>
  );
}

function ThreatPanel({ title, signals, totalScore, level }: PanelData) {
  return (
    <div className="hud-panel min-w-[200px] w-56">
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
            {title} - {level.name}
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

export default function ThreatIndex({ fastData, slowData, panel = "both" }: ThreatIndexProps) {
  const { naturalPanel, securityPanel } = useMemo(() => {
    // --- Fire hotspots (0-100) ---
    const fireCount = slowData?.fires?.length || 0;
    const fireScore = Math.min(100, (fireCount / 1500) * 100);
    const fireSig: ThreatSignal = {
      label: "ไฟ",
      score: Math.round(fireScore),
      detail: `${fireCount.toLocaleString()} จุด`,
      color: signalColor(fireScore),
    };

    // --- Seismic activity (0-100) ---
    const quakes = slowData?.earthquakes || [];
    const maxMag = quakes.reduce(
      (max, q) => Math.max(max, q.magnitude || 0),
      0
    );
    const seismicScore =
      quakes.length === 0 ? 0 : Math.min(100, (maxMag - 2) * 25);
    const seismicSig: ThreatSignal = {
      label: "แผ่นดินไหว",
      score: Math.max(0, Math.round(seismicScore)),
      detail: quakes.length > 0 ? `สูงสุด M${maxMag.toFixed(1)}` : "สงบ",
      color: signalColor(seismicScore),
    };

    // --- Flood (0-100) ---
    const floodStations = slowData?.flood || [];
    const criticalFloods = floodStations.filter((s) => s.critical);
    const floodScore = Math.min(100, criticalFloods.length * 10);
    const floodSig: ThreatSignal = {
      label: "น้ำท่วม",
      score: Math.round(floodScore),
      detail: `${criticalFloods.length} วิกฤต / ${floodStations.length} สูง`,
      color: signalColor(floodScore),
    };

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
    const pm25Score = Math.min(100, Math.max(0, (avgPm25 - 15) * 1.5));
    const pm25Sig: ThreatSignal = {
      label: "PM2.5",
      score: Math.round(pm25Score),
      detail: `เฉลี่ย ${avgPm25.toFixed(0)} µg/m³ (${dangerousStations.length} อันตราย)`,
      color: signalColor(pm25Score),
    };

    // Natural disaster weighted score: fires 0.3, seismic 0.2, flood 0.25, PM2.5 0.25
    const naturalSignals = [fireSig, seismicSig, floodSig, pm25Sig];
    const naturalWeights = [0.3, 0.2, 0.25, 0.25];
    const naturalScore = Math.round(
      naturalSignals.reduce((sum, s, i) => sum + s.score * naturalWeights[i], 0)
    );

    // --- Military activity (0-100) ---
    const milCount =
      (fastData?.flights?.military?.length || 0) +
      (fastData?.military_flights?.length || 0);
    const milScore = Math.min(100, milCount * 12);
    const milSig: ThreatSignal = {
      label: "ทหาร",
      score: milScore,
      detail: `${milCount} ลำ`,
      color: signalColor(milScore),
    };

    // Security score: purely military activity
    const securitySignals = [milSig];
    const securityScore = milScore;

    return {
      naturalPanel: {
        title: "ดัชนีภัยธรรมชาติ",
        signals: naturalSignals,
        totalScore: naturalScore,
        level: getLevel(naturalScore),
      } satisfies PanelData,
      securityPanel: {
        title: "ดัชนีความมั่นคง",
        signals: securitySignals,
        totalScore: securityScore,
        level: getLevel(securityScore),
      } satisfies PanelData,
    };
  }, [fastData, slowData]);

  if (panel === "natural") {
    return !fastData ? <LoadingPanel title="ดัชนีภัยธรรมชาติ" /> : <ThreatPanel {...naturalPanel} />;
  }
  if (panel === "security") {
    return !fastData ? <LoadingPanel title="ดัชนีความมั่นคง" /> : <ThreatPanel {...securityPanel} />;
  }

  return (
    <div className="flex flex-col gap-2">
      {!fastData ? <LoadingPanel title="ดัชนีภัยธรรมชาติ" /> : <ThreatPanel {...naturalPanel} />}
      {!fastData ? <LoadingPanel title="ดัชนีความมั่นคง" /> : <ThreatPanel {...securityPanel} />}
    </div>
  );
}
