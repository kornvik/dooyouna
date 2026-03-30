"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Clock, Play, Pause, SkipForward } from "lucide-react";

interface FireTimeSliderProps {
  minTime: number;
  maxTime: number;
  selectedHour: number | null; // null = latest
  onSelectHour: (hour: number | null) => void;
}

function formatTime(ms: number): string {
  // Format explicitly in Thai timezone (UTC+7)
  const thaiMs = ms + 7 * 3600_000;
  const thai = new Date(thaiMs);
  const nowThai = new Date(Date.now() + 7 * 3600_000);
  const isToday = thai.getUTCDate() === nowThai.getUTCDate() &&
                  thai.getUTCMonth() === nowThai.getUTCMonth();
  const prefix = isToday ? "วันนี้" : "เมื่อวาน";
  const hh = String(thai.getUTCHours()).padStart(2, "0");
  const mm = String(thai.getUTCMinutes()).padStart(2, "0");
  return `${prefix} ${hh}:${mm}`;
}

export default function FireTimeSlider({ minTime, maxTime, selectedHour, onSelectHour }: FireTimeSliderProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const isAtEnd = selectedHour === null;

  const stepMs = 3600_000; // 1 hour steps
  const steps = Math.max(1, Math.ceil((maxTime - minTime) / stepMs));

  const currentStep = isAtEnd ? steps : Math.round((selectedHour - minTime) / stepMs);

  const handleChange = useCallback((value: number) => {
    if (value >= steps) {
      onSelectHour(null); // snap to latest
      setIsPlaying(false);
    } else {
      onSelectHour(minTime + value * stepMs);
    }
  }, [minTime, steps, stepMs, onSelectHour]);

  // Auto-play
  useEffect(() => {
    if (isPlaying && !isAtEnd) {
      intervalRef.current = setInterval(() => {
        const next = currentStep + 1;
        if (next >= steps) {
          setIsPlaying(false);
          onSelectHour(null);
        } else {
          onSelectHour(minTime + next * stepMs);
        }
      }, 1500);
    }
    return () => clearInterval(intervalRef.current);
  }, [isPlaying, currentStep, steps, minTime, stepMs, onSelectHour, isAtEnd]);

  // Display time: either selected or latest
  const displayTime = isAtEnd ? maxTime : selectedHour;

  return (
    <div className="hud-panel px-2 sm:px-3 py-2 flex items-center gap-2 sm:gap-3 text-[10px]">
      <Clock size={12} className="text-[var(--accent)] shrink-0 hidden sm:block" />

      <button
        onClick={() => {
          if (isAtEnd) {
            // At latest — pause to scrub back in time
            onSelectHour(maxTime - stepMs);
            setIsPlaying(false);
          } else if (isPlaying) {
            setIsPlaying(false);
          } else {
            setIsPlaying(true);
          }
        }}
        className="text-[var(--accent)] hover:text-white transition-colors cursor-pointer"
        aria-label={isPlaying || isAtEnd ? "หยุด" : "เล่น"}
      >
        {isPlaying || isAtEnd ? <Pause size={14} /> : <Play size={14} />}
      </button>

      <button
        onClick={() => { onSelectHour(null); setIsPlaying(false); }}
        className={`transition-colors cursor-pointer ${isAtEnd ? "text-[var(--accent)]" : "text-[var(--text-secondary)] hover:text-[var(--accent)]"}`}
        aria-label="ล่าสุด"
      >
        <SkipForward size={14} />
      </button>

      <input
        type="range"
        min={0}
        max={steps}
        value={currentStep}
        onChange={(e) => handleChange(Number(e.target.value))}
        className="flex-1 h-1 accent-[var(--accent)] cursor-pointer"
      />

      <span className={`w-28 sm:w-36 text-right shrink-0 ${isAtEnd ? "text-[var(--accent)] font-bold" : "text-[var(--text-secondary)]"}`}>
        {isAtEnd ? `ล่าสุด: ${formatTime(displayTime)}` : formatTime(displayTime)}
      </span>
    </div>
  );
}
