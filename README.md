# DooYouNa

Open-source intelligence (OSINT) dashboard for Thailand and Cambodia. Real-time geospatial data aggregated onto an interactive dark-theme map.

![Stack](https://img.shields.io/badge/Next.js-black?logo=next.js) ![Stack](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white) ![Stack](https://img.shields.io/badge/MapLibre_GL-396CB2?logo=maplibre&logoColor=white)

## Features

| Layer | Source | Description |
|-------|--------|-------------|
| Commercial Flights | [adsb.lol](https://adsb.lol) | Real-time aircraft tracking (500nm radius covering TH/KH) |
| Military Aircraft | adsb.lol `/mil` | Military transponders in the region |
| Fire Hotspots | [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov) | VIIRS satellite fire detection — SE Asia 24h |
| PM2.5 Air Quality | [Thailand PCD](http://air4thai.pcd.go.th) | 189 official monitoring stations across Thailand |
| Earthquakes | [USGS](https://earthquake.usgs.gov) | M2.5+ filtered to SE Asia |
| Weather Radar | [RainViewer](https://rainviewer.com) | Precipitation overlay tiles |
| News Intel | RSS | Bangkok Post, Khmer Times, Phnom Penh Post, CNA, GDACS |
| Region Dossier | Nominatim + RestCountries + Wikipedia | Right-click any location for intelligence |
| CCTV Cameras | Thai DOH / BMA | Traffic camera feeds (when available) |
| Maritime Vessels | AIS Stream | Requires `AIS_API_KEY` from [aisstream.io](https://aisstream.io) |

All data sources are **free and require no API keys** (except AIS for ships).

## Quick Start

### Option 1: Local Development

```bash
# Backend (Terminal 1)
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Frontend (Terminal 2)
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Option 2: Docker

```bash
docker compose up --build
```

Open [http://localhost:3000](http://localhost:3000)

## Architecture

```
frontend (Next.js, port 3000)  ──rewrites /api/*──▸  backend (FastAPI, port 8000)
        │                                                     │
   MapLibre GL JS                                    APScheduler background jobs
   (WebGL map render)                                ├─ Fast tier (60s): flights, CCTV
                                                     └─ Slow tier (30min): fires, AQ, news, quakes, weather
```

- **Backend**: Python FastAPI with two-tier scheduled data pipeline. All data stored in-memory. ETag-based conditional responses for efficient polling.
- **Frontend**: Next.js + MapLibre GL + Tailwind CSS. Polls fast data every 60s and slow data every 120s. Dynamic import for MapViewer to avoid SSR issues.
- **Proxy**: Next.js rewrites `/api/*` to backend via `BACKEND_URL` env var.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AIS_API_KEY` | No | [aisstream.io](https://aisstream.io) key for vessel tracking |
| `BACKEND_URL` | No | Backend URL for frontend proxy (default: `http://localhost:8000`) |
| `CORS_ORIGINS` | No | Allowed CORS origins (default: `*`) |

## Region Coverage

Bounding box: **5.5°N–20.5°N, 97.3°E–107.7°E**
Center: **13.5°N, 102.5°E** (Thailand/Cambodia border region)

## Inspired By

[Shadowbroker](https://github.com/BigBodyCobain/Shadowbroker) — global OSINT dashboard. DooYouNa is a focused version for the Thailand/Cambodia region with localized data sources (Thai PCD air quality, regional news feeds).

## License

MIT
