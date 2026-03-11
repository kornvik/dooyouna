import type { AirQuality } from "@/types";

const AIR_QUALITY_URL =
  "http://air4thai.pcd.go.th/services/getNewAQI_JSON.php";

interface PM25Data {
  value: string;
  aqi: string;
}

interface AQILast {
  PM25: PM25Data;
  date: string;
  time: string;
}

interface Air4ThaiStation {
  stationID: string;
  nameEN: string;
  areaEN: string;
  stationType: string;
  lat: string;
  long: string;
  LastUpdate: AQILast;
  AQILast: AQILast;
}

interface Air4ThaiResponse {
  stations: Air4ThaiStation[];
}

export async function fetchAirQuality(): Promise<AirQuality[]> {
  try {
    const resp = await fetch(AIR_QUALITY_URL, {
      signal: AbortSignal.timeout(15_000),
      headers: { "User-Agent": "DooYouNa-OSINT/1.0" },
    });

    if (!resp.ok) return [];

    const data: Air4ThaiResponse = await resp.json();
    const stations = data.stations ?? [];
    const result: AirQuality[] = [];

    for (const stn of stations) {
      try {
        const lat = parseFloat(stn.lat);
        const lon = parseFloat(stn.long);

        if (lat === 0 || lon === 0 || isNaN(lat) || isNaN(lon)) continue;

        const aqiLast = stn.AQILast ?? {};
        const pm25Data = aqiLast.PM25 ?? { value: "-1", aqi: "-1" };
        const pm25Val = pm25Data.value ?? "-1";
        const pm25Aqi = pm25Data.aqi ?? "-1";

        if (pm25Val === "-1" && pm25Aqi === "-1") continue;

        const pm25 =
          pm25Val !== "-1" ? parseFloat(pm25Val) : (null as unknown as number);

        const lastUpdated = `${aqiLast.date ?? ""} ${aqiLast.time ?? ""}`;

        result.push({
          location: stn.nameEN ?? "",
          city: stn.areaEN ?? "",
          country: "TH",
          lat,
          lon,
          pm25,
          lastUpdated,
        });
      } catch {
        continue;
      }
    }

    return result;
  } catch {
    return [];
  }
}
