"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { FireHotspot } from "@/types";
import { fetchSource } from "@/lib/api";
import FireMap, { type FireMapHandle } from "@/components/FireMap";
import FireTimeSlider from "@/components/FireTimeSlider";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { analyzeLandUse, type SpreadAlert } from "@/lib/fireLandUse";

function parseDetectTime(h: FireHotspot): number | null {
  if (!h.acq_date || !h.acq_time) return null;
  const hh = h.acq_time.slice(0, 2);
  const mm = h.acq_time.slice(3, 5) || "00";
  return new Date(`${h.acq_date}T${hh}:${mm}:00Z`).getTime();
}

export default function FirePage() {
  const mapRef = useRef<FireMapHandle>(null);
  const [fires, setFires] = useState<FireHotspot[]>([]);
  const [loading, setLoading] = useState(true);
  const [sliderHour, setSliderHour] = useState<number | null>(null); // null = latest snapshot
  const [maxAgeHours, setMaxAgeHours] = useState<number>(24); // 3, 6, or 24
  const [showLandUse, setShowLandUse] = useState(false);
  const [spreadAlerts, setSpreadAlerts] = useState<SpreadAlert[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisStats, setAnalysisStats] = useState<{ forest: number; crop: number } | null>(null);

  // Fetch fires — with localStorage cache for offline use
  useEffect(() => {
    let cancelled = false;
    const CACHE_KEY = "fire-hotspots-cache";

    // Load cached data first so we show something immediately
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const { data, ts } = JSON.parse(cached);
        if (data?.length && Date.now() - ts < 24 * 3600_000) {
          setFires(data);
          setLoading(false);
        }
      }
    } catch { /* ignore */ }

    const load = async () => {
      try {
        const data = await fetchSource("fires");
        if (!cancelled && data?.length) {
          setFires(data);
          try { localStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() })); } catch { /* quota */ }
        }
      } catch { /* offline — keep cached data */ }
      if (!cancelled) setLoading(false);
    };
    load();
    const interval = setInterval(load, 120_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  // Time range of available data
  const timeRange = useMemo(() => {
    const times = fires.map(parseDetectTime).filter((t): t is number => t !== null);
    if (times.length === 0) return null;
    return { min: Math.min(...times), max: Math.max(...times) };
  }, [fires]);

  // Filter fires by slider position + max age from now
  const filteredFires = useMemo(() => {
    const cutoff = Date.now() - maxAgeHours * 3600_000;
    if (sliderHour !== null) {
      // Slider active: show fires up to slider time AND within age window
      return fires.filter((h) => {
        const t = parseDetectTime(h);
        if (t === null) return false;
        return t <= sliderHour && t >= cutoff;
      });
    }
    // Slider at latest: show all fires within age window
    return fires.filter((h) => {
      const t = parseDetectTime(h);
      if (t === null) return false;
      return t >= cutoff;
    });
  }, [fires, sliderHour, maxAgeHours]);

  // Run land use analysis when toggled on
  useEffect(() => {
    if (!showLandUse || filteredFires.length === 0) {
      setSpreadAlerts([]);
      setAnalysisStats(null);
      return;
    }
    let cancelled = false;
    setAnalyzing(true);
    analyzeLandUse(filteredFires).then((result) => {
      if (cancelled) return;
      setSpreadAlerts(result.alerts);
      setAnalysisStats({ forest: result.forestCount, crop: result.croplandCount });
      setAnalyzing(false);
    }).catch(() => {
      if (!cancelled) setAnalyzing(false);
    });
    return () => { cancelled = true; };
  }, [showLandUse, filteredFires]);

  const handleSliderChange = useCallback((hour: number | null) => {
    setSliderHour(hour);
  }, []);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-[var(--bg-primary)] flex flex-col items-center justify-center gap-3">
        <div className="w-10 h-10 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-[var(--text-secondary)]">กำลังโหลดจุดความร้อน...</span>
        <span className="text-[10px] text-[var(--text-secondary)]">4 ดาวเทียม (NOAA-20 · Suomi NPP · NOAA-21 · MODIS)</span>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-[var(--bg-primary)] flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 border-b border-[var(--border-color)] bg-[rgba(0,0,0,0.3)] z-10 shrink-0">
        <Link
          href="/"
          className="text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors shrink-0"
          aria-label="กลับ"
        >
          <ArrowLeft size={18} />
        </Link>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-base">🔥</span>
          <span className="text-xs font-bold tracking-wider text-[var(--accent)]">
            <span className="hidden sm:inline">ระบบเฝ้าระวัง</span>จุดความร้อน
          </span>
        </div>
        <div className="ml-auto flex items-center gap-1.5 sm:gap-4 text-[10px] text-[var(--text-secondary)]">
          <button
            onClick={() => setShowLandUse((v) => !v)}
            className={`px-1.5 py-0.5 rounded text-[9px] transition-colors cursor-pointer ${
              showLandUse
                ? "bg-green-600 text-white font-bold"
                : "text-[var(--text-secondary)] hover:text-green-400"
            }`}
            title="แสดงการใช้ประโยชน์ที่ดิน (ESA WorldCover)"
          >
            🌾 พื้นที่ดิน
          </button>
          <div className="flex gap-1">
            {([3, 6, 24] as const).map((h) => (
              <button
                key={h}
                onClick={() => setMaxAgeHours(h)}
                className={`px-1.5 py-0.5 rounded text-[9px] transition-colors cursor-pointer ${
                  maxAgeHours === h
                    ? "bg-[var(--accent)] text-black font-bold"
                    : "text-[var(--text-secondary)] hover:text-[var(--accent)]"
                }`}
              >
                {h}ชม.
              </button>
            ))}
          </div>
          <span>{filteredFires.length.toLocaleString()} จุด</span>
          <span className="hidden sm:inline">4 ดาวเทียม (NOAA-20 · Suomi NPP · NOAA-21 · MODIS)</span>
        </div>
      </div>

      {/* Land use analysis alerts */}
      {showLandUse && analyzing && (
        <div className="px-3 py-1.5 bg-green-900/50 border-b border-green-700/50 text-[10px] text-green-300 flex items-center gap-2 shrink-0">
          <div className="w-3 h-3 border border-green-400 border-t-transparent rounded-full animate-spin" />
          กำลังวิเคราะห์การใช้ที่ดิน...
        </div>
      )}
      {showLandUse && !analyzing && analysisStats && (
        <div className="px-3 py-1.5 bg-[rgba(0,0,0,0.4)] border-b border-[var(--border-color)] text-[10px] shrink-0 overflow-x-auto">
          <div className="flex items-center gap-3">
            <span className="text-green-400">🌲 ป่า {analysisStats.forest} จุด</span>
            <span className="text-pink-400">🌾 เกษตร {analysisStats.crop} จุด</span>
            {spreadAlerts.length > 0 ? (
              <span className="text-red-400 font-bold flex items-center gap-1">
                <AlertTriangle size={12} />
                พบ {spreadAlerts.length} กลุ่มต้องสงสัย: ไฟเกษตร → ลามป่า
              </span>
            ) : (
              <span className="text-[var(--text-secondary)]">ไม่พบรูปแบบเผาไร่ลามป่า</span>
            )}
          </div>
          {spreadAlerts.length > 0 && (
            <div className="mt-1 flex flex-col gap-0.5">
              {spreadAlerts.slice(0, 5).map((a, i) => (
                <button
                  key={i}
                  className="text-red-300/80 hover:text-red-200 cursor-pointer text-left w-full"
                  onClick={() => mapRef.current?.flyTo(a.source.lat, a.source.lon)}
                >
                  ⚠️ 🌾 {a.cropFirstTime} ({a.croplandFires.length} จุด) → 🌲 {a.forestFirstTime} ({a.forestFires.length} จุด) — ห่าง {a.delayHours} ชม. 📍
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Map */}
      <div className="flex-1 relative">
        <FireMap ref={mapRef} fires={filteredFires} showLandUse={showLandUse} spreadAlerts={spreadAlerts} />

        {/* Legend — hidden on mobile */}
            <div className="hidden sm:block absolute top-3 right-3 hud-panel px-3 py-2 text-[9px] z-10">
              <div className="text-[var(--text-secondary)] mb-1.5 font-bold tracking-wider">ระดับความรุนแรง</div>
              <div className="flex flex-col gap-0.5 text-[var(--text-secondary)]">
                <span>Lv.5 รุนแรงมาก (&gt;100 MW)</span>
                <span>Lv.4 รุนแรง (50-100 MW)</span>
                <span>Lv.3 ปานกลาง (10-50 MW)</span>
                <span>Lv.2 เบา (1-10 MW)</span>
                <span>Lv.1 ต่ำ (&lt;1 MW)</span>
              </div>
              <div className="mt-2 pt-1.5 border-t border-[var(--border-color)] text-[var(--text-secondary)]">
                <div className="font-bold tracking-wider mb-1">ความใหม่</div>
                <div className="flex items-center gap-1.5">
                  <span style={{ opacity: 1 }}>🔥</span>
                  <span>ล่าสุด</span>
                  <span className="ml-1" style={{ opacity: 0.5 }}>🔥</span>
                  <span>6-12 ชม.</span>
                  <span className="ml-1" style={{ opacity: 0.2 }}>🔥</span>
                  <span>เก่า</span>
                </div>
              </div>
              {showLandUse && (
                <div className="mt-2 pt-1.5 border-t border-[var(--border-color)] text-[var(--text-secondary)]">
                  <div className="font-bold tracking-wider mb-1">การใช้ที่ดิน (ESA)</div>
                  <div className="flex flex-col gap-0.5">
                    <span><span className="inline-block w-2.5 h-2.5 rounded-sm mr-1" style={{ background: "#006400" }} />ป่าไม้</span>
                    <span><span className="inline-block w-2.5 h-2.5 rounded-sm mr-1" style={{ background: "#f096ff" }} />เกษตรกรรม</span>
                    <span><span className="inline-block w-2.5 h-2.5 rounded-sm mr-1" style={{ background: "#ffbb22" }} />ไม้พุ่ม</span>
                    <span><span className="inline-block w-2.5 h-2.5 rounded-sm mr-1" style={{ background: "#ffff4c" }} />ทุ่งหญ้า</span>
                    <span><span className="inline-block w-2.5 h-2.5 rounded-sm mr-1" style={{ background: "#fa0000" }} />ชุมชน</span>
                  </div>
                </div>
              )}
            </div>

            {/* Time slider */}
            {timeRange && (
              <div className="absolute bottom-3 sm:bottom-4 left-2 right-2 sm:left-1/2 sm:-translate-x-1/2 sm:right-auto sm:w-[90vw] sm:max-w-2xl z-10">
                <FireTimeSlider
                  minTime={timeRange.min}
                  maxTime={timeRange.max}
                  selectedHour={sliderHour}
                  onSelectHour={handleSliderChange}
                />
              </div>
            )}
      </div>
    </div>
  );
}
