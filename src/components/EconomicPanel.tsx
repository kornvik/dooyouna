"use client";

import { useEffect, useState } from "react";
import { fetchSource } from "@/lib/api";
import type { EconomicData } from "@/types";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

function TrendIcon({ value }: { value: number | undefined }) {
  if (!value || value === 0) return <Minus size={10} className="text-[var(--text-secondary)]" />;
  return value > 0
    ? <TrendingUp size={10} className="text-[#00ff88]" />
    : <TrendingDown size={10} className="text-[#ff4444]" />;
}

function changeColor(value: number | undefined): string {
  if (!value || value === 0) return "var(--text-secondary)";
  return value > 0 ? "#00ff88" : "#ff4444";
}

export default function EconomicPanel() {
  const [data, setData] = useState<EconomicData | null>(null);

  useEffect(() => {
    let mounted = true;
    const poll = async () => {
      try {
        const d = await fetchSource("economic");
        if (mounted && d) setData(d);
      } catch {
        // keep previous data
      }
    };
    poll();
    const interval = setInterval(poll, 30 * 60 * 1000); // 30 minutes
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  if (!data) return null;

  return (
    <div className="hud-panel w-48">
      <div className="px-3 py-2 border-b border-[var(--border-color)]">
        <div className="text-[10px] tracking-widest text-[var(--accent)] glow-text">
          ดัชนีเศรษฐกิจ
        </div>
      </div>
      <div className="px-3 py-2 flex flex-col gap-1.5 text-[10px] font-mono">
        {/* SET Index */}
        {data.set && (
          <div className="flex items-center justify-between">
            <span className="text-[var(--text-secondary)]">SET</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[var(--text-primary)]">
                {data.set.price.toLocaleString()}
              </span>
              <TrendIcon value={data.set.change} />
              <span style={{ color: changeColor(data.set.change) }}>
                {data.set.change > 0 ? "+" : ""}{data.set.changePercent}%
              </span>
            </div>
          </div>
        )}

        {/* USD/THB */}
        {data.usdThb && (
          <div className="flex items-center justify-between">
            <span className="text-[var(--text-secondary)]">USD/THB</span>
            <span className="text-[var(--text-primary)]">
              {data.usdThb.rate.toFixed(2)}
            </span>
          </div>
        )}

        {/* Thai Gold */}
        {data.gold && (
          <div className="flex items-center justify-between">
            <span className="text-[var(--text-secondary)]">ทองคำ</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[var(--text-primary)]">
                {data.gold.barSell.toLocaleString()}
              </span>
              <TrendIcon value={data.gold.change} />
              <span style={{ color: changeColor(data.gold.change) }}>
                {data.gold.change > 0 ? "+" : ""}{data.gold.change}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
