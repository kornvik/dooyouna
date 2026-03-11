# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**DooYouNa** — an open-source intelligence (OSINT) dashboard focused on Thailand and Cambodia. Inspired by Shadowbroker, it aggregates real-time geospatial data onto an interactive dark-theme map: flights, fire hotspots, air quality (PM2.5), earthquakes, weather radar, regional news, CCTV cameras, and maritime vessels.

## Architecture

```
frontend (Next.js, port 3000)  <--rewrites /api/*-->  backend (FastAPI, port 8000)
        |                                                      |
   MapLibre GL                                         APScheduler background jobs
   (WebGL map)                                         Fast tier (60s): flights, CCTV
                                                       Slow tier (30min): fires, AQ, news, quakes, weather
```

- **Backend**: Python FastAPI with two-tier scheduled data pipeline. All data stored in-memory (`latest_data` dict). ETag-based conditional responses.
- **Frontend**: Next.js + MapLibre GL + Tailwind CSS. Polls `/api/live-data/fast` (60s) and `/api/live-data/slow` (120s). Dynamic import for MapViewer to avoid SSR.
- **Proxy**: Next.js rewrites `/api/*` to backend via `BACKEND_URL` env var.

## Commands

```bash
# Backend
cd backend && pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Frontend
cd frontend && npm install
npm run dev

# Docker (both)
docker compose up --build
```

## Key Data Sources

| Source | API | Data |
|--------|-----|------|
| adsb.lol | Free, no key | Aircraft positions (500nm radius from 13.5°N, 102.5°E) |
| NASA FIRMS | Free open CSV (no key) | Fire hotspots — VIIRS NOAA-20 SE Asia 24h |
| air4thai.pcd.go.th | Free, no key | Thailand PCD PM2.5 — 189 stations |
| USGS | Free GeoJSON | Earthquakes M2.5+ filtered to SE Asia bbox |
| RainViewer | Free | Weather radar tiles |
| RSS feeds | Free | Bangkok Post, Khmer Times, Phnom Penh Post, CNA, GDACS, etc. |
| Nominatim + RestCountries + Wikipedia | Free | Right-click region dossier |

## Region Bounding Box

Thailand + Cambodia: lat 5.5–20.5, lon 97.3–107.7. Center: 13.5°N, 102.5°E.
