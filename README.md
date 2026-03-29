# DooYouNa

Open-source intelligence (OSINT) dashboard for Thailand. Real-time geospatial data aggregated onto an interactive dark-theme map. Feel free to contribute krub :)

![Stack](https://img.shields.io/badge/Next.js-black?logo=next.js) ![Stack](https://img.shields.io/badge/MapLibre_GL-396CB2?logo=maplibre&logoColor=white) ![Stack](https://img.shields.io/badge/Tailwind_CSS-06B6D4?logo=tailwindcss&logoColor=white)

## Features

| Layer | Source | Description |
|-------|--------|-------------|
| Commercial Flights | [adsb.lol](https://adsb.lol) | Real-time aircraft tracking (500nm radius) |
| Military Aircraft | adsb.lol `/mil` | Military transponders in the region |
| Fire Hotspots | [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov) | VIIRS satellite fire detection — SE Asia 24h |
| Flood Monitoring | [thaiwater.net](https://thaiwater.net) | Water level stations + MODIS satellite |
| PM2.5 Air Quality | [Thailand PCD](http://air4thai.pcd.go.th) | Official monitoring stations across Thailand |
| Earthquakes | [USGS](https://earthquake.usgs.gov) | M2.5+ filtered to SE Asia |
| Weather Radar | [RainViewer](https://rainviewer.com) | Precipitation overlay tiles |
| News Intel | RSS | Bangkok Post, Khmer Times, CNA, GDACS, ReliefWeb |
| Region Dossier | Nominatim + RestCountries + Wikipedia | Right-click any location for intel |

All data sources are **free and require no API keys**.

## Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Architecture

Next.js fullstack app — API route handlers fetch external data with per-source caching, frontend polls progressively (each source loads independently).

```
Next.js App
├── API Routes (/api/data/[source])     Per-source endpoints with ISR caching
│   ├── flights      (60s revalidate)   ADS-B Exchange
│   ├── earthquakes  (30min)            USGS GeoJSON
│   ├── fires        (30min)            NASA FIRMS CSV
│   ├── weather      (30min)            RainViewer
│   ├── news         (30min)            RSS feeds
│   ├── air_quality  (30min)            Thailand PCD
│   └── flood        (30min)            thaiwater.net
├── MapLibre GL JS                      WebGL map with custom icons & protocols
└── Threat Index                        Natural disaster + security scoring
```

## Testing

```bash
npm test           # run all tests
npm test -- --run  # single run (CI)
```

## Region Coverage

Bounding box: **5.5°N–20.5°N, 97.3°E–107.7°E**
Center: **13.5°N, 102.5°E**

## License

AGPL-3.0
