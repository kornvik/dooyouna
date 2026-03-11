export interface Aircraft {
  hex: string;
  callsign: string;
  lat: number;
  lon: number;
  alt: number;
  speed: number;
  heading: number;
  squawk: string;
  type: string;
  registration: string;
  category?: string;
  dbFlags?: number;
}

export interface FlightData {
  domestic: Aircraft[];
  international: Aircraft[];
  military: Aircraft[];
  private: Aircraft[];
  total: number;
}

export interface Ship {
  mmsi: string;
  name: string;
  lat: number;
  lon: number;
  course: number;
  speed: number;
  type: string;
  country: string;
}

export interface Earthquake {
  id: string;
  lat: number;
  lon: number;
  depth: number;
  magnitude: number;
  place: string;
  time: number;
  url: string;
}

export interface FireHotspot {
  lat: number;
  lon: number;
  frp?: number;
  confidence?: string;
}

export interface NewsArticle {
  title: string;
  link: string;
  source: string;
  weight: number;
  published: string;
  summary: string;
}

export interface AirQuality {
  location: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
  pm25: number;
  lastUpdated: string;
}

export interface WeatherData {
  radar: string[];
  host: string;
}

export interface FastData {
  flights: FlightData;
  military_flights: Aircraft[];
  updated: Record<string, string>;
}

export interface FloodStation {
  lat: number;
  lon: number;
  name: string;
  name_th: string;
  province: string;
  province_th: string;
  basin: string;
  water_level_msl: string | null;
  situation_level: number;
  bank_diff: string | null;
  datetime: string;
  critical: boolean;
}

export interface SlowData {
  earthquakes: Earthquake[];
  fires: FireHotspot[];
  weather: WeatherData;
  news: NewsArticle[];
  air_quality: AirQuality[];
  ships: Ship[];
  flood: FloodStation[];
  updated: Record<string, string>;
}

export interface WikipediaSummary {
  title: string;
  extract: string;
  thumbnail: string;
}

export interface CountryInfo {
  name: string;
  official_name: string;
  capital: string[];
  population: number;
  area: number;
  languages: Record<string, string>;
  currencies: Record<string, string>;
  flag: string;
  borders: string[];
  region: string;
}

export interface RegionDossier {
  lat: number;
  lon: number;
  location?: string;
  city?: string;
  state?: string;
  country?: string;
  country_code?: string;
  country_info?: CountryInfo;
  wikipedia?: WikipediaSummary | null;
}

export interface EconomicData {
  set?: { price: number; change: number; changePercent: number };
  usdThb?: { rate: number };
  gold?: { barSell: number; change: number };
  updatedAt: string;
}

export type LayerName =
  | "domestic"
  | "international"
  | "military"
  | "private"
  | "ships"
  | "earthquakes"
  | "fires"
  | "weather"
  | "news"
  | "airQuality"
  | "flood"
  | "floodSatellite"
  | "nightLights";
