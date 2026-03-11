import WebSocket from "ws";
import type { Ship } from "@/types";

const AIS_WS_URL = "wss://stream.aisstream.io/v0/stream";
const COLLECTION_TIMEOUT_MS = 12_000; // collect data for 12 seconds
const AIS_API_KEY = process.env.AIS_API_KEY || "";

// SE Asia bounding boxes
const BOUNDING_BOXES = [
  [[5.0, 95.0], [20.5, 107.7]], // Thailand + Cambodia + Vietnam
];

// Map AIS ship type codes to readable types
function shipTypeLabel(typeCode: number): string {
  if (typeCode >= 70 && typeCode <= 79) return "Cargo";
  if (typeCode >= 80 && typeCode <= 89) return "Tanker";
  if (typeCode >= 60 && typeCode <= 69) return "Passenger";
  if (typeCode >= 40 && typeCode <= 49) return "High Speed";
  if (typeCode >= 30 && typeCode <= 39) return "Fishing";
  if (typeCode >= 50 && typeCode <= 59) return "Special Craft";
  if (typeCode >= 20 && typeCode <= 29) return "WIG";
  return "Other";
}

// Map MID (Maritime Identification Digits) to country
function midToCountry(mmsi: string): string {
  const mid = mmsi.slice(0, 3);
  const countries: Record<string, string> = {
    "567": "Thailand",
    "514": "Cambodia",
    "574": "Vietnam",
    "533": "Malaysia",
    "525": "Indonesia",
    "563": "Singapore",
    "520": "Myanmar",
    "515": "Philippines",
    "516": "Philippines",
  };
  return countries[mid] || "Unknown";
}

export async function fetchShips(): Promise<Ship[]> {
  if (!AIS_API_KEY) {
    console.error("AIS_API_KEY not set, skipping ship fetch");
    return [];
  }

  return new Promise<Ship[]>((resolve) => {
    const ships = new Map<string, Ship>();
    let resolved = false;

    const finish = () => {
      if (resolved) return;
      resolved = true;
      try { ws.close(); } catch { /* ignore */ }
      resolve(Array.from(ships.values()));
    };

    // Safety timeout
    const timer = setTimeout(finish, COLLECTION_TIMEOUT_MS);

    let ws: WebSocket;
    try {
      ws = new WebSocket(AIS_WS_URL);
    } catch (err) {
      console.error("WebSocket creation failed:", err);
      clearTimeout(timer);
      resolve([]);
      return;
    }

    ws.on("open", () => {
      const subscription = {
        APIKey: AIS_API_KEY,
        BoundingBoxes: BOUNDING_BOXES,
        FilterMessageTypes: ["PositionReport", "ShipStaticData"],
      };
      ws.send(JSON.stringify(subscription));
    });

    ws.on("message", (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString());
        const meta = msg.MetaData;
        if (!meta) return;

        const mmsi = String(meta.MMSI || "");
        const lat = meta.latitude;
        const lon = meta.longitude;
        if (!mmsi || lat == null || lon == null) return;

        // Update or create ship entry
        const existing = ships.get(mmsi);
        const ship: Ship = {
          mmsi,
          name: (meta.ShipName || existing?.name || "").trim(),
          lat,
          lon,
          course: 0,
          speed: 0,
          type: existing?.type || "Other",
          country: midToCountry(mmsi),
        };

        // Extract position data from PositionReport
        const posReport = msg.Message?.PositionReport;
        if (posReport) {
          ship.course = posReport.Cog ?? existing?.course ?? 0;
          ship.speed = posReport.Sog ?? existing?.speed ?? 0;
        }

        // Extract static data
        const staticData = msg.Message?.ShipStaticData;
        if (staticData) {
          if (staticData.Name) ship.name = staticData.Name.trim();
          if (staticData.Type) ship.type = shipTypeLabel(staticData.Type);
        }

        ships.set(mmsi, ship);
      } catch {
        // skip malformed messages
      }
    });

    ws.on("error", (err) => {
      console.error("AIS WebSocket error:", err);
      clearTimeout(timer);
      finish();
    });

    ws.on("close", () => {
      clearTimeout(timer);
      finish();
    });
  });
}
