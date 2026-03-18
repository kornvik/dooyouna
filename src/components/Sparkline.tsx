"use client";

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  fillColor?: string;
}

export default function Sparkline({
  data,
  width = 120,
  height = 32,
  color = "#00d4ff",
  fillColor,
}: SparklineProps) {
  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-[9px] text-[var(--text-secondary)] w-full"
        style={{ height }}
      >
        ไม่มีข้อมูล
      </div>
    );
  }

  if (data.length === 1) {
    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="block w-full" style={{ height }} preserveAspectRatio="none">
        <line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke={color} strokeWidth={1} strokeDasharray="4 3" opacity={0.3} />
        <circle cx={width / 2} cy={height / 2} r={4} fill={color} />
        <text x={width / 2 + 8} y={height / 2 + 3} fill={color} fontSize={10}>{data[0].toLocaleString()}</text>
      </svg>
    );
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pad = 2;

  const points = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (width - pad * 2);
    const y = pad + (1 - (v - min) / range) * (height - pad * 2);
    return `${x},${y}`;
  });

  const linePath = `M${points.join(" L")}`;
  const fillPath = `${linePath} L${width - pad},${height - pad} L${pad},${height - pad} Z`;
  const fill = fillColor || color.replace(")", ",0.1)").replace("rgb", "rgba");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="block w-full" style={{ height }} preserveAspectRatio="none">
      <path d={fillPath} fill={fill} />
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Last point dot */}
      <circle
        cx={parseFloat(points[points.length - 1].split(",")[0])}
        cy={parseFloat(points[points.length - 1].split(",")[1])}
        r={2.5}
        fill={color}
      />
    </svg>
  );
}
