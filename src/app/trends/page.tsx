"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Plane, Flame, Wind, Activity, Droplets, Ship, ArrowLeft, RefreshCw,
} from "lucide-react";
import Sparkline from "@/components/Sparkline";

interface TrendRow {
  date: string;
  value: number;
  metadata: Record<string, unknown>;
}

interface MetricConfig {
  source: string;
  label: string;
  unit: string;
  color: string;
  icon: React.ReactNode;
}

const METRICS: MetricConfig[] = [
  { source: "domestic_flights", label: "เที่ยวบินในประเทศ", unit: "ลำ", color: "#00ff88", icon: <Plane size={14} /> },
  { source: "international_flights", label: "เที่ยวบินระหว่างประเทศ", unit: "ลำ", color: "#00d4ff", icon: <Plane size={14} /> },
  // { source: "military_flights", label: "เที่ยวบินทหาร", unit: "ลำ", color: "#ffdd00", icon: <Plane size={14} /> },
  { source: "fires", label: "จุดความร้อน", unit: "จุด", color: "#ff4400", icon: <Flame size={14} /> },
  { source: "pm25_avg", label: "PM2.5 เฉลี่ย", unit: "µg/m³", color: "#cc00ff", icon: <Wind size={14} /> },
  { source: "earthquakes", label: "แผ่นดินไหว", unit: "ครั้ง", color: "#ff4444", icon: <Activity size={14} /> },
  { source: "flood", label: "จำนวนสถานีน้ำที่มีสถานะเฝ้าระวัง", unit: "สถานี", color: "#ffaa00", icon: <Droplets size={14} /> },
  // { source: "ships", label: "เรือ", unit: "ลำ", color: "#00ff88", icon: <Ship size={14} /> },
];

function MetricCard({ config, data, totalDays }: { config: MetricConfig; data: TrendRow[]; totalDays: number }) {
  const rawValues = data.map((d) => d.value);
  // Pad with nulls on the left so sparkline shows the full time range
  const padCount = Math.max(0, totalDays - rawValues.length);
  const values = [...Array<number | null>(padCount).fill(null), ...rawValues];
  const labels = [...Array<string>(padCount).fill(""), ...data.map((d) => d.date)];
  const latest = rawValues.length > 0 ? rawValues[rawValues.length - 1] : null;
  const prev = rawValues.length > 1 ? rawValues[rawValues.length - 2] : null;
  const change = latest != null && prev != null && prev > 0
    ? ((latest - prev) / prev) * 100
    : null;

  const realValues = rawValues;
  const min = realValues.length > 0 ? Math.min(...realValues) : 0;
  const max = realValues.length > 0 ? Math.max(...realValues) : 0;
  const avg = realValues.length > 0
    ? Math.round((realValues.reduce((s, v) => s + v, 0) / realValues.length) * 10) / 10
    : 0;

  return (
    <div className="hud-panel p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span style={{ color: config.color }}>{config.icon}</span>
          <span className="text-sm font-bold" style={{ color: config.color }}>
            {config.label}
          </span>
        </div>
        {latest != null && (
          <div className="flex items-center gap-2">
            <span className="text-lg font-mono font-bold text-[var(--text-primary)]">
              {typeof latest === "number" && latest % 1 !== 0 ? latest.toFixed(1) : latest.toLocaleString()}
            </span>
            <span className="text-[10px] text-[var(--text-secondary)]">{config.unit}</span>
            {change != null && (
              <span
                className="text-[10px] font-mono"
                style={{ color: change > 0 ? "#ff4444" : change < 0 ? "#00ff88" : "var(--text-secondary)" }}
              >
                {change > 0 ? "▲" : change < 0 ? "▼" : "—"}
                {Math.abs(change).toFixed(1)}%
              </span>
            )}
          </div>
        )}
      </div>

      {/* Sparkline */}
      <Sparkline data={values} labels={labels} width={320} height={48} color={config.color} />

      {/* Stats row */}
      <div className="flex gap-4 text-[10px] text-[var(--text-secondary)]">
        <span>ต่ำสุด: <span className="text-[var(--text-primary)]">{min.toLocaleString()}</span></span>
        <span>สูงสุด: <span className="text-[var(--text-primary)]">{max.toLocaleString()}</span></span>
        <span>เฉลี่ย: <span className="text-[var(--text-primary)]">{avg.toLocaleString()}</span></span>
        <span>{data.length} วัน</span>
      </div>

      {/* Date range */}
      {data.length > 0 && (
        <div className="text-[9px] text-[var(--text-secondary)]">
          {data[0].date} → {data[data.length - 1].date}
        </div>
      )}
    </div>
  );
}

const RANGE_OPTIONS = [
  { label: "30 วัน", days: 30 },
  { label: "3 เดือน", days: 90 },
  { label: "6 เดือน", days: 180 },
  { label: "1 ปี", days: 365 },
];

export default function TrendsPage() {
  const [trends, setTrends] = useState<Record<string, TrendRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  const fetchAll = async (d: number = days) => {
    setLoading(true);
    const results: Record<string, TrendRow[]> = {};

    await Promise.all(
      METRICS.map(async (m) => {
        try {
          const res = await fetch(`/api/trends?source=${m.source}&days=${d}`);
          if (res.ok) results[m.source] = await res.json();
        } catch { /* skip */ }
      })
    );

    setTrends(results);
    setLoading(false);
  };

  useEffect(() => {
    fetchAll(days);
    const interval = setInterval(() => fetchAll(days), 5 * 60_000);
    return () => clearInterval(interval);
  }, [days]);

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] p-4 sm:p-6 overflow-x-hidden">
      {/* Header */}
      <div className="max-w-4xl mx-auto mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center gap-1.5 text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors text-sm"
            >
              <ArrowLeft size={14} />
              แผนที่
            </Link>
            <div>
              <h1 className="text-[var(--accent)] font-bold tracking-[0.2em] glow-text text-sm sm:text-base">
                DOOYOUNA — แนวโน้ม
              </h1>
            </div>
          </div>

          <button
            onClick={() => fetchAll()}
            disabled={loading}
            className="flex items-center gap-1.5 text-[10px] text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors cursor-pointer"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            <span className="hidden sm:inline">รีเฟรช</span>
          </button>
        </div>

        {/* Range selector */}
        <div className="flex items-center gap-1 mt-3">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.days}
              onClick={() => setDays(opt.days)}
              className={`px-2.5 py-1 text-[10px] rounded border transition-colors cursor-pointer ${
                days === opt.days
                  ? "border-[var(--accent)] text-[var(--accent)]"
                  : "border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--accent)]"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid of metric cards */}
      <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4">
        {loading
          ? METRICS.map((m) => (
              <div key={m.source} className="hud-panel p-4 flex flex-col gap-3 animate-pulse">
                <div className="flex items-center gap-2">
                  <span style={{ color: m.color }}>{m.icon}</span>
                  <span className="text-sm font-bold" style={{ color: m.color }}>{m.label}</span>
                </div>
                <div className="h-12 rounded bg-[rgba(255,255,255,0.03)]" />
                <div className="h-3 w-2/3 rounded bg-[rgba(255,255,255,0.05)]" />
              </div>
            ))
          : METRICS.map((m) => (
              <MetricCard key={m.source} config={m} data={trends[m.source] || []} totalDays={days} />
            ))
        }
      </div>

      {/* CRT Scanlines */}
      <div className="scanlines" />
    </div>
  );
}
