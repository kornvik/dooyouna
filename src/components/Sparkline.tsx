"use client";

import { useRef, useState, useCallback } from "react";

interface SparklineProps {
  data: (number | null)[];
  labels?: string[];
  width?: number;
  height?: number;
  color?: string;
  fillColor?: string;
}

export default function Sparkline({
  data,
  labels,
  width = 120,
  height = 32,
  color = "#00d4ff",
  fillColor,
}: SparklineProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const pad = 2;

  const resolveIdx = useCallback(
    (clientX: number) => {
      const svg = svgRef.current;
      if (!svg || data.length < 2) return;
      const rect = svg.getBoundingClientRect();
      const xRatio = (clientX - rect.left) / rect.width;
      const idx = Math.round(xRatio * (data.length - 1));
      setHoverIdx(Math.max(0, Math.min(idx, data.length - 1)));
    },
    [data.length],
  );

  const realValues = data.filter((v): v is number => v !== null);

  if (realValues.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-[9px] text-[var(--text-secondary)] w-full"
        style={{ height }}
      >
        ไม่มีข้อมูล
      </div>
    );
  }

  if (data.length === 1 && realValues.length === 1) {
    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="block w-full" style={{ height }} preserveAspectRatio="none">
        <line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke={color} strokeWidth={1} strokeDasharray="4 3" opacity={0.3} />
        <circle cx={width / 2} cy={height / 2} r={4} fill={color} />
        <text x={width / 2 + 8} y={height / 2 + 3} fill={color} fontSize={10}>{realValues[0].toLocaleString()}</text>
      </svg>
    );
  }

  const min = Math.min(...realValues);
  const max = Math.max(...realValues);
  const range = max - min || 1;

  // Compute x/y for every point; null values get y = null
  const coords = data.map((v, i) => ({
    x: pad + (i / (data.length - 1)) * (width - pad * 2),
    y: v !== null ? pad + (1 - (v - min) / range) * (height - pad * 2) : null,
  }));

  // Build line segments (break at nulls)
  const segments: string[] = [];
  let current = "";
  for (const c of coords) {
    if (c.y === null) {
      if (current) { segments.push(current); current = ""; }
    } else {
      current += current ? ` L${c.x},${c.y}` : `M${c.x},${c.y}`;
    }
  }
  if (current) segments.push(current);

  // Build fill path for segments (close each to bottom)
  const fillSegments = segments.map((seg) => {
    const pts = seg.split(/[ML]/).filter(Boolean).map((p) => p.trim());
    if (pts.length < 2) return "";
    const first = pts[0].split(",");
    const last = pts[pts.length - 1].split(",");
    return `${seg} L${last[0]},${height - pad} L${first[0]},${height - pad} Z`;
  });

  const fill = fillColor || color.replace(")", ",0.1)").replace("rgb", "rgba");

  // Find last non-null point
  const lastReal = [...coords].reverse().find((c) => c.y !== null);

  // Hover
  const hoverCoord = hoverIdx !== null ? coords[hoverIdx] : null;
  const hoverValue = hoverIdx !== null ? data[hoverIdx] : null;

  const tooltipText = hoverValue !== null && hoverIdx !== null
    ? `${hoverValue.toLocaleString()}${labels?.[hoverIdx] ? ` (${labels[hoverIdx]})` : ""}`
    : "";
  const tooltipAnchor = hoverCoord && hoverCoord.x < width / 2 ? "start" : "end";
  const tooltipX = hoverCoord
    ? (tooltipAnchor === "start" ? hoverCoord.x + 6 : hoverCoord.x - 6)
    : 0;
  const tooltipY = hoverCoord?.y != null ? Math.max(pad + 10, hoverCoord.y - 4) : height / 2;
  const charWidth = 5.5;
  const textW = tooltipText.length * charWidth + 10;
  const rectX = tooltipAnchor === "start" ? tooltipX - 4 : tooltipX - textW + 4;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${width} ${height}`}
      className="block w-full cursor-crosshair touch-none"
      style={{ height }}
      preserveAspectRatio="none"
      onMouseMove={(e) => resolveIdx(e.clientX)}
      onMouseLeave={() => setHoverIdx(null)}
      onTouchMove={(e) => {
        e.preventDefault();
        resolveIdx(e.touches[0].clientX);
      }}
      onTouchEnd={() => setHoverIdx(null)}
    >
      {/* Baseline for empty region */}
      <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} stroke={color} strokeWidth={0.5} opacity={0.1} />

      {/* Fill + line segments */}
      {fillSegments.map((d, i) => d && <path key={`f${i}`} d={d} fill={fill} />)}
      {segments.map((d, i) => (
        <path
          key={`l${i}`}
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}

      {/* Last point dot */}
      {lastReal?.y != null && (
        <circle cx={lastReal.x} cy={lastReal.y} r={2.5} fill={color} />
      )}

      {/* Hover indicator */}
      {hoverCoord && hoverIdx !== null && hoverValue !== null && hoverCoord.y !== null && (
        <>
          <line
            x1={hoverCoord.x} y1={pad} x2={hoverCoord.x} y2={height - pad}
            stroke={color} strokeWidth={0.5} opacity={0.5} strokeDasharray="2 2"
          />
          <circle cx={hoverCoord.x} cy={hoverCoord.y} r={3} fill={color} stroke="#000" strokeWidth={1} />
          <rect
            x={rectX}
            y={tooltipY - 10}
            width={textW}
            height={14}
            rx={2}
            fill="rgba(0,0,0,0.85)"
          />
          <text
            x={tooltipX}
            y={tooltipY}
            fill={color}
            fontSize={9}
            fontWeight="bold"
            textAnchor={tooltipAnchor}
          >
            {tooltipText}
          </text>
        </>
      )}

      {/* Show "ไม่มีข้อมูล" on null hover */}
      {hoverCoord && hoverIdx !== null && hoverValue === null && (
        <text
          x={hoverCoord.x}
          y={height / 2}
          fill="var(--text-secondary)"
          fontSize={8}
          textAnchor="middle"
          opacity={0.5}
        >
          ไม่มีข้อมูล
        </text>
      )}
    </svg>
  );
}
