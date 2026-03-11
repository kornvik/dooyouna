"""
SeaWatch: Thailand/Cambodia OSINT Dashboard - Backend API
"""

import logging
import threading
from contextlib import asynccontextmanager

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from services.data_fetcher import (
    get_etag,
    get_fast_data,
    get_health,
    get_slow_data,
    run_fast_tier,
    run_slow_tier,
)
from services.region_dossier import get_dossier

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

scheduler = BackgroundScheduler()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: run initial fetch in background thread so server starts immediately
    logger.info("Starting scheduler and background data fetch...")

    def _initial_fetch():
        run_fast_tier()
        run_slow_tier()
        logger.info("Initial data fetch complete")

    threading.Thread(target=_initial_fetch, daemon=True).start()

    scheduler.add_job(run_fast_tier, "interval", seconds=60, id="fast_tier")
    scheduler.add_job(run_slow_tier, "interval", minutes=30, id="slow_tier")
    scheduler.start()
    logger.info("Scheduler started")

    yield

    # Shutdown
    scheduler.shutdown(wait=False)
    logger.info("Scheduler stopped")


app = FastAPI(title="DooYouNa API", lifespan=lifespan)

app.add_middleware(GZipMiddleware, minimum_size=500)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/live-data/fast")
def live_data_fast(request: Request):
    """Fast-moving data: flights, CCTV. Supports ETag caching."""
    etag = get_etag()
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304)

    data = get_fast_data()
    return Response(
        content=__import__("json").dumps(data),
        media_type="application/json",
        headers={"ETag": etag},
    )


@app.get("/api/live-data/slow")
def live_data_slow():
    """Slow-changing data: earthquakes, fires, weather, news, air quality."""
    return get_slow_data()


@app.get("/api/health")
def health():
    """Health check with per-source counts."""
    return get_health()


@app.get("/api/refresh")
def refresh():
    """Force immediate data refresh."""
    run_fast_tier()
    run_slow_tier()
    return {"status": "refreshed"}


@app.get("/api/region-dossier")
def region_dossier(lat: float, lon: float):
    """Right-click intelligence: location info, country data, Wikipedia."""
    return get_dossier(lat, lon)
