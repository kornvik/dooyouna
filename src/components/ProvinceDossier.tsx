"use client";

import { useMemo, useState } from "react";
import { X, ChevronDown, ChevronUp } from "lucide-react";
import type { ProvinceProperties, FastData, SlowData } from "@/types";
import {
  aggregateProvinceData,
  calculateProvinceThreatScore,
} from "@/lib/provinceData";

interface ProvinceDossierProps {
  provinceProperties: ProvinceProperties;
  fastData: FastData | null;
  slowData: SlowData | null;
  onClose: () => void;
}

function signalColor(score: number): string {
  return score > 60 ? "#ff4444" : score > 30 ? "#ffaa00" : "#00ff88";
}

function SignalRow({ label, detail, score }: { label: string; detail: string; score: number }) {
  return (
    <div className="flex items-center justify-between text-[10px]">
      <span className="text-[var(--text-secondary)]">{label}</span>
      <span style={{ color: signalColor(score) }}>{detail}</span>
    </div>
  );
}

export default function ProvinceDossier({
  provinceProperties,
  fastData,
  slowData,
  onClose,
}: ProvinceDossierProps) {
  const [floodOpen, setFloodOpen] = useState(false);

  const { threats, score } = useMemo(() => {
    const threats = aggregateProvinceData(provinceProperties, fastData, slowData);
    const score = calculateProvinceThreatScore(threats);
    return { threats, score };
  }, [provinceProperties, fastData, slowData]);

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className="sm:hidden fixed inset-0 bg-black/50 backdrop-blur-sm z-[29]"
        onClick={onClose}
      />

      <div
        className="province-dossier-enter fixed top-12 left-3 z-30 w-80 max-h-[calc(100vh-4rem)] overflow-y-auto hud-panel
                   max-sm:inset-0 max-sm:top-0 max-sm:left-0 max-sm:w-full max-sm:max-h-full max-sm:rounded-none"
        data-testid="province-dossier"
      >
        {/* Header */}
        <div className="px-3 py-2 border-b border-[var(--border-color)] flex items-start justify-between gap-2">
          <div>
            <div className="text-sm font-bold text-[var(--accent)] glow-text leading-tight">
              {provinceProperties.name_th}
            </div>
            <div className="text-[10px] text-[var(--text-secondary)] mt-0.5">
              {provinceProperties.name_en} ({provinceProperties.code})
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors p-0.5 cursor-pointer"
            aria-label="ปิด"
          >
            <X size={16} />
          </button>
        </div>

        {/* Profile */}
        <div className="px-3 py-2 border-b border-[var(--border-color)] text-[10px] text-[var(--text-secondary)] grid grid-cols-2 gap-y-1">
          <div>
            <span className="text-[var(--text-primary)]">ภาค:</span> {provinceProperties.region}
          </div>
          <div>
            <span className="text-[var(--text-primary)]">เมือง:</span> {provinceProperties.capital_th}
          </div>
          <div>
            <span className="text-[var(--text-primary)]">ประชากร:</span>{" "}
            {provinceProperties.population.toLocaleString()}
          </div>
          <div>
            <span className="text-[var(--text-primary)]">พื้นที่:</span>{" "}
            {provinceProperties.area_km2.toLocaleString()} km²
          </div>
        </div>

        {/* Threat score bar */}
        <div
          className="px-3 py-2 border-b border-[var(--border-color)]"
          style={{ background: score.level.bg }}
        >
          <div className="flex items-center justify-between mb-1">
            <span
              className="text-[10px] font-bold tracking-wider"
              style={{ color: score.level.color }}
            >
              ระดับ: {score.level.name}
            </span>
            <span
              className="text-sm font-bold font-mono"
              style={{ color: score.level.color }}
              data-testid="composite-score"
            >
              {score.composite}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-[rgba(255,255,255,0.05)] overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-1000"
              style={{
                width: `${score.composite}%`,
                background: `linear-gradient(90deg, #00ff88, ${score.level.color})`,
              }}
            />
          </div>
        </div>

        {/* Signal breakdown */}
        <div className="px-3 py-2 border-b border-[var(--border-color)] flex flex-col gap-1">
          <SignalRow
            label="ไฟ"
            score={score.fire}
            detail={`${threats.fireCount.toLocaleString()} จุด`}
          />
          <SignalRow
            label="น้ำท่วม"
            score={score.flood}
            detail={
              threats.floodStations.length === 0
                ? "ไม่มีสถานีเฝ้าระวัง"
                : threats.criticalFloods > 0
                  ? `${threats.criticalFloods} เตือนภัย · ${threats.normalFloods} เฝ้าระวัง`
                  : `${threats.floodStations.length} สถานีเฝ้าระวัง`
            }
          />
          <SignalRow
            label="PM2.5"
            score={score.airQuality}
            detail={threats.avgPm25 > 0 ? `เฉลี่ย ${threats.avgPm25.toFixed(0)}` : "ไม่มีข้อมูล"}
          />
          <SignalRow
            label="แผ่นดินไหว"
            score={score.seismic}
            detail={
              threats.maxMagnitude > 0
                ? `สูงสุด M${threats.maxMagnitude.toFixed(1)}`
                : "สงบ"
            }
          />
        </div>

        {/* Activity counts removed — point-in-time flight/ship data is misleading per province */}

        {/* Flood stations (collapsible) */}
        {threats.floodStations.length > 0 && (
          <div className="border-b border-[var(--border-color)]">
            <button
              onClick={() => setFloodOpen(!floodOpen)}
              className="w-full px-3 py-1.5 flex items-center justify-between text-[10px] text-[var(--text-secondary)] hover:bg-[rgba(0,255,136,0.03)] transition-colors cursor-pointer"
            >
              <span>
                สถานีน้ำ ({threats.floodStations.length})
              </span>
              {floodOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
            {floodOpen && (
              <div className="px-3 pb-2 flex flex-col gap-1">
                {threats.floodStations.map((station, i) => (
                  <div
                    key={`${station.name}-${i}`}
                    className="flex items-center gap-2 text-[9px]"
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{
                        background: station.critical ? "#ff6600" : "#ffaa00",
                      }}
                    />
                    <span className="text-[var(--text-primary)] truncate flex-1">
                      {station.name_th || station.name}
                    </span>
                    <span
                      className="shrink-0"
                      style={{
                        color: station.critical ? "#ff6600" : "#ffaa00",
                      }}
                    >
                      {station.critical ? "วิกฤต" : "เฝ้าระวัง"} (ระดับ {station.situation_level})
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* News mentions */}
        {threats.matchingNews.length > 0 && (
          <div className="px-3 py-2">
            <div className="text-[10px] text-[var(--text-secondary)] mb-1.5">
              ข่าวที่เกี่ยวข้อง ({threats.matchingNews.length})
            </div>
            <div className="flex flex-col gap-2">
              {threats.matchingNews.slice(0, 5).map((article, i) => (
                <a
                  key={`${article.link}-${i}`}
                  href={article.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block hover:bg-[rgba(0,255,136,0.03)] rounded px-1 py-0.5 -mx-1 transition-colors"
                >
                  <div className="text-[10px] text-[var(--text-primary)] leading-tight line-clamp-2">
                    {article.title}
                  </div>
                  <div className="text-[8px] text-[var(--text-secondary)] mt-0.5">
                    {article.source}
                    {article.published && (
                      <> · {new Date(article.published).toLocaleDateString("th-TH", { day: "numeric", month: "short" })}</>
                    )}
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {threats.fireCount === 0 &&
          threats.floodStations.length === 0 &&
          threats.aqStations.length === 0 &&
          threats.earthquakes.length === 0 &&
          threats.matchingNews.length === 0 && (
            <div className="px-3 py-4 text-center text-[10px] text-[var(--text-secondary)]">
              ไม่พบข้อมูลภัยพิบัติในจังหวัดนี้
            </div>
          )}
      </div>
    </>
  );
}
