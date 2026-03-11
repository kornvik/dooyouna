// Known aircraft registrations → short label shown on map
const WATCHLIST = new Map<string, string>([
  ["T7-GTS", "Tony"],
  ["HB-JLF", "Rolex Group"],
  ["OY-PGA", "Golden Palace Medicine"],
]);

/** Returns a short label if this registration is on the watchlist, else undefined */
export function getVipLabel(registration: string): string | undefined {
  return WATCHLIST.get((registration || "").toUpperCase());
}
