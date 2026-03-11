/**
 * Popup HTML formatters for map feature click popups.
 * Thai localized with metric units (m, km/h).
 */

const POPUP_STYLE =
  'style="color:#e0e7ef;font-family:monospace;font-size:11px;padding:4px;"';

export const POPUP_CONFIG = {
  maxWidth: "300px",
  anchor: "bottom" as const,
  offset: 15,
};

type Props = Record<string, unknown>;

/** Convert feet to meters */
const ftToM = (ft: number) => Math.round(ft * 0.3048);

/** Convert knots to km/h */
const ktsToKmh = (kts: number) => Math.round(Number(kts) * 1.852);

export function formatFlight(p: Props): string {
  const altM = ftToM(Number(p.alt));
  const spdKmh = ktsToKmh(Number(p.speed));
  return `<div ${POPUP_STYLE}>
    <div style="color:#00d4ff;font-weight:bold;">${p.callsign || "ไม่ทราบ"}</div>
    <div>ประเภท: ${p.type || "N/A"} | ทะเบียน: ${p.registration || "N/A"}</div>
    <div>ระดับ: ${altM.toLocaleString()} ม. | ความเร็ว: ${spdKmh} กม./ชม.</div>
    <div>ทิศทาง: ${p.heading}&deg;</div>
  </div>`;
}

export function formatDomestic(p: Props): string {
  const altM = ftToM(Number(p.alt));
  const spdKmh = ktsToKmh(Number(p.speed));
  return `<div ${POPUP_STYLE}>
    <div style="color:#00ff88;font-weight:bold;">${p.callsign || "ไม่ทราบ"}</div>
    <div>ประเภท: ${p.type || "N/A"} | ทะเบียน: ${p.registration || "N/A"}</div>
    <div>ระดับ: ${altM.toLocaleString()} ม. | ความเร็ว: ${spdKmh} กม./ชม.</div>
    <div>ทิศทาง: ${p.heading}&deg;</div>
  </div>`;
}

export function formatMilitary(p: Props): string {
  const altM = ftToM(Number(p.alt));
  const spdKmh = ktsToKmh(Number(p.speed));
  return `<div ${POPUP_STYLE}>
    <div style="color:#ffdd00;font-weight:bold;">MIL: ${p.callsign || p.hex}</div>
    <div>ประเภท: ${p.type || "N/A"} | ทะเบียน: ${p.registration || "N/A"}</div>
    <div>ระดับ: ${altM.toLocaleString()} ม. | ความเร็ว: ${spdKmh} กม./ชม.</div>
  </div>`;
}

export function formatPrivate(p: Props): string {
  const altM = ftToM(Number(p.alt));
  const spdKmh = ktsToKmh(Number(p.speed));
  return `<div ${POPUP_STYLE}>
    <div style="color:#ff8800;font-weight:bold;">${p.callsign || p.registration || "เครื่องบินส่วนตัว"}</div>
    <div>ประเภท: ${p.type || "N/A"} | ทะเบียน: ${p.registration || "N/A"}</div>
    <div>ระดับ: ${altM.toLocaleString()} ม. | ความเร็ว: ${spdKmh} กม./ชม.</div>
  </div>`;
}

export function formatEarthquake(p: Props): string {
  return `<div ${POPUP_STYLE}>
    <div style="color:#ff4444;font-weight:bold;">M${p.magnitude} แผ่นดินไหว</div>
    <div>${p.place}</div>
    <div>ความลึก: ${p.depth} กม.</div>
    <div>${new Date(Number(p.time)).toLocaleString("th-TH")}</div>
  </div>`;
}

export function formatAirQuality(p: Props): string {
  const pm25 = Number(p.pm25);
  const color = pm25 > 75 ? "#ff4444" : pm25 > 35 ? "#ffaa00" : "#00ff88";
  return `<div ${POPUP_STYLE}>
    <div style="color:${color};font-weight:bold;">
      PM2.5: ${p.pm25} &micro;g/m&sup3;
    </div>
    <div>${p.location}</div>
    <div>${p.city}</div>
  </div>`;
}

export function formatShip(p: Props): string {
  const spdKmh = ktsToKmh(Number(p.speed));
  return `<div ${POPUP_STYLE}>
    <div style="color:#00ff88;font-weight:bold;">${p.name || "เรือไม่ทราบชื่อ"}</div>
    <div>MMSI: ${p.mmsi} | ประเภท: ${p.type || "N/A"}</div>
    <div>ความเร็ว: ${spdKmh} กม./ชม. | ทิศ: ${p.course}&deg;</div>
  </div>`;
}

export function formatCctv(p: Props): string {
  return `<div ${POPUP_STYLE}>
    <div style="color:#aa88ff;font-weight:bold;">${p.name}</div>
    <div>แหล่ง: ${p.source}</div>
    ${p.url ? `<div style="margin-top:4px;"><img src="${p.url}" style="max-width:260px;border-radius:3px;" onerror="this.style.display='none'" /></div>` : ""}
  </div>`;
}

export function formatFlood(p: Props): string {
  const isCritical = p.critical === "true" || p.critical === true;
  const color = isCritical ? "#0044cc" : "#4488ff";
  const label = isCritical ? "น้ำท่วมวิกฤต" : "ระดับน้ำสูง";
  return `<div ${POPUP_STYLE}>
    <div style="color:${color};font-weight:bold;">${label}</div>
    <div>${p.name || p.name_th}</div>
    <div>${p.province || p.province_th}</div>
    <div>ลุ่มน้ำ: ${p.basin || "N/A"}</div>
    ${p.water_level_msl ? `<div>ระดับ: ${p.water_level_msl} MSL</div>` : ""}
    ${p.bank_diff ? `<div>เหนือตลิ่ง: ${p.bank_diff} ม.</div>` : ""}
    <div style="color:var(--text-secondary);font-size:9px;">${p.datetime}</div>
  </div>`;
}
