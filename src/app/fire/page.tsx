"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { FireHotspot } from "@/types";
import { fetchSource } from "@/lib/api";
import FireMap from "@/components/FireMap";
import FireTimeSlider from "@/components/FireTimeSlider";
import { ArrowLeft } from "lucide-react";

function parseDetectTime(h: FireHotspot): number | null {
  if (!h.acq_date || !h.acq_time) return null;
  const hh = h.acq_time.slice(0, 2);
  const mm = h.acq_time.slice(3, 5) || "00";
  return new Date(`${h.acq_date}T${hh}:${mm}:00Z`).getTime();
}

export default function FirePage() {
  const [fires, setFires] = useState<FireHotspot[]>([]);
  const [loading, setLoading] = useState(true);
  const [sliderHour, setSliderHour] = useState<number | null>(null); // null = latest snapshot

  // Fetch fires
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const data = await fetchSource("fires");
      if (!cancelled && data) setFires(data);
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

  // Filter fires by slider position — cumulative: all fires detected up to time T
  const filteredFires = useMemo(() => {
    const endTime = sliderHour ?? timeRange?.max ?? Date.now();
    return fires.filter((h) => {
      const t = parseDetectTime(h);
      if (t === null) return false;
      return t <= endTime;
    });
  }, [fires, sliderHour, timeRange]);

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
            <span className="hidden sm:inline">ระบบเฝ้าระวัง</span>ไฟป่า
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2 sm:gap-4 text-[10px] text-[var(--text-secondary)]">
          <span>
            {loading ? "โหลด..." : `${fires.length.toLocaleString()} จุด`}
          </span>
          {sliderHour !== null && (
            <span className="text-[var(--accent)]">
              {filteredFires.length.toLocaleString()} แสดง
            </span>
          )}
          <span className="hidden sm:inline">4 ดาวเทียม (NOAA-20 · Suomi NPP · NOAA-21 · MODIS)</span>
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        <FireMap fires={filteredFires} />

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
