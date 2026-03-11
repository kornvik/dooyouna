"""
Data fetcher for Thailand/Cambodia OSINT dashboard.
Two-tier scheduled pipeline: fast (60s) and slow (30min).
"""

import json
import logging
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

import feedparser
import httpx

logger = logging.getLogger(__name__)

# Region bounding box: Thailand + Cambodia
REGION_BBOX = {
    "min_lat": 5.5,
    "max_lat": 20.5,
    "min_lon": 97.3,
    "max_lon": 107.7,
}

# Center point for adsb.lol radius query
REGION_CENTER = {"lat": 13.5, "lon": 102.5}
REGION_RADIUS_NM = 500

# In-memory data store
latest_data: dict = {}
_data_lock = threading.Lock()
_last_updated: dict[str, str] = {}
_etag_hash: str = ""

HTTP_TIMEOUT = 15.0


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _client() -> httpx.Client:
    return httpx.Client(
        timeout=HTTP_TIMEOUT,
        headers={"User-Agent": "DooYouNa-OSINT/1.0"},
        follow_redirects=True,
    )


# ---------------------------------------------------------------------------
# Flight tracking via adsb.lol
# ---------------------------------------------------------------------------
def fetch_flights() -> dict:
    """Fetch aircraft in the Thailand/Cambodia region from adsb.lol."""
    url = (
        f"https://api.adsb.lol/v2/lat/{REGION_CENTER['lat']}"
        f"/lon/{REGION_CENTER['lon']}/dist/{REGION_RADIUS_NM}"
    )
    try:
        with _client() as c:
            resp = c.get(url)
            resp.raise_for_status()
            data = resp.json()

        aircraft_list = data.get("ac", [])
        commercial = []
        military = []
        private = []

        for ac in aircraft_list:
            lat = ac.get("lat")
            lon = ac.get("lon")
            if lat is None or lon is None:
                continue

            entry = {
                "hex": ac.get("hex", ""),
                "callsign": (ac.get("flight") or "").strip(),
                "lat": lat,
                "lon": lon,
                "alt": ac.get("alt_baro", ac.get("alt_geom", 0)),
                "speed": ac.get("gs", 0),
                "heading": ac.get("track", 0),
                "squawk": ac.get("squawk", ""),
                "type": ac.get("t", ""),
                "registration": ac.get("r", ""),
                "category": ac.get("category", ""),
                "dbFlags": ac.get("dbFlags", 0),
            }

            db_flags = ac.get("dbFlags", 0)
            if db_flags and db_flags & 1:  # military flag
                military.append(entry)
            elif ac.get("t", "") in (
                "GLEX", "G650", "GLF6", "GLF5", "GL7T",
                "CL60", "CL35", "LJ45", "LJ75", "FA7X",
                "FA8X", "FA50", "E55P", "C68A", "H25B",
            ):
                private.append(entry)
            else:
                commercial.append(entry)

        return {
            "commercial": commercial,
            "military": military,
            "private": private,
            "total": len(commercial) + len(military) + len(private),
        }
    except Exception as e:
        logger.error(f"Flight fetch error: {e}")
        return latest_data.get("flights", {})


def fetch_military_flights() -> list:
    """Fetch globally-flagged military aircraft from adsb.lol, filter to region."""
    try:
        with _client() as c:
            resp = c.get("https://api.adsb.lol/v2/mil")
            resp.raise_for_status()
            data = resp.json()

        result = []
        for ac in data.get("ac", []):
            lat = ac.get("lat")
            lon = ac.get("lon")
            if lat is None or lon is None:
                continue
            if not (REGION_BBOX["min_lat"] <= lat <= REGION_BBOX["max_lat"] and
                    REGION_BBOX["min_lon"] <= lon <= REGION_BBOX["max_lon"]):
                continue
            result.append({
                "hex": ac.get("hex", ""),
                "callsign": (ac.get("flight") or "").strip(),
                "lat": lat,
                "lon": lon,
                "alt": ac.get("alt_baro", ac.get("alt_geom", 0)),
                "speed": ac.get("gs", 0),
                "heading": ac.get("track", 0),
                "type": ac.get("t", ""),
                "registration": ac.get("r", ""),
            })
        return result
    except Exception as e:
        logger.error(f"Military flight fetch error: {e}")
        return latest_data.get("military_flights", [])


# ---------------------------------------------------------------------------
# Maritime / AIS (simple HTTP fallback - no WebSocket key needed)
# ---------------------------------------------------------------------------
def fetch_ships() -> list:
    """
    Fetch vessel positions. Uses MarineTraffic-style public endpoints.
    Falls back to empty if no AIS_API_KEY configured.
    """
    # We'll use a public AIS endpoint that provides basic vessel data
    # For full data, users should configure AIS_API_KEY for aisstream.io
    try:
        bbox = REGION_BBOX
        url = (
            f"https://meri.digitraffic.fi/api/ais/v1/locations"
            f"?from={bbox['min_lat']},{bbox['min_lon']}"
            f"&to={bbox['max_lat']},{bbox['max_lon']}"
        )
        # This Finnish endpoint only covers Finland waters - for TH/KH we need
        # a different approach. Use a cached/sample dataset or AIS stream.
        # For now, return empty and let AIS stream populate when key is set.
        return latest_data.get("ships", [])
    except Exception as e:
        logger.error(f"Ship fetch error: {e}")
        return []


# ---------------------------------------------------------------------------
# Earthquakes via USGS
# ---------------------------------------------------------------------------
def fetch_earthquakes() -> list:
    """Fetch earthquakes near Thailand/Cambodia from USGS."""
    try:
        with _client() as c:
            resp = c.get(
                "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson"
            )
            resp.raise_for_status()
            data = resp.json()

        result = []
        for feature in data.get("features", []):
            coords = feature["geometry"]["coordinates"]
            lon, lat, depth = coords[0], coords[1], coords[2]
            # Filter to wider SE Asia region
            if not (0 <= lat <= 25 and 90 <= lon <= 115):
                continue
            props = feature["properties"]
            result.append({
                "id": feature["id"],
                "lat": lat,
                "lon": lon,
                "depth": depth,
                "magnitude": props.get("mag", 0),
                "place": props.get("place", ""),
                "time": props.get("time", 0),
                "url": props.get("url", ""),
            })
        return result
    except Exception as e:
        logger.error(f"Earthquake fetch error: {e}")
        return latest_data.get("earthquakes", [])


# ---------------------------------------------------------------------------
# NASA FIRMS fire hotspots
# ---------------------------------------------------------------------------
def fetch_fires() -> list:
    """Fetch fire hotspots from NASA FIRMS VIIRS open CSV for SE Asia."""
    # Use the open data CSV directly (no API key needed)
    return _fetch_firms_fallback()


def _fetch_firms_fallback() -> list:
    """Fallback: use FIRMS open data without API key."""
    try:
        with _client() as c:
            resp = c.get(
                "https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-20-viirs-c2/csv/J1_VIIRS_C2_SouthEast_Asia_24h.csv",
                timeout=30.0,
            )
            resp.raise_for_status()

        lines = resp.text.strip().split("\n")
        if len(lines) < 2:
            return []

        headers = lines[0].split(",")
        lat_idx = headers.index("latitude")
        lon_idx = headers.index("longitude")
        frp_idx = headers.index("frp") if "frp" in headers else -1

        result = []
        bbox = REGION_BBOX
        for line in lines[1:]:
            fields = line.split(",")
            try:
                lat = float(fields[lat_idx])
                lon = float(fields[lon_idx])
                if not (bbox["min_lat"] <= lat <= bbox["max_lat"] and
                        bbox["min_lon"] <= lon <= bbox["max_lon"]):
                    continue
                entry = {"lat": lat, "lon": lon}
                if frp_idx >= 0:
                    entry["frp"] = float(fields[frp_idx])
                result.append(entry)
            except (ValueError, IndexError):
                continue

        result.sort(key=lambda x: x.get("frp", 0), reverse=True)
        return result[:2000]
    except Exception as e:
        logger.error(f"FIRMS fallback error: {e}")
        return []


# ---------------------------------------------------------------------------
# Weather radar timestamps via RainViewer
# ---------------------------------------------------------------------------
def fetch_weather() -> dict:
    """Fetch latest weather radar tile timestamps from RainViewer."""
    try:
        with _client() as c:
            resp = c.get("https://api.rainviewer.com/public/weather-maps.json")
            resp.raise_for_status()
            data = resp.json()
        return {
            "radar": [frame["path"] for frame in data.get("radar", {}).get("past", [])],
            "host": data.get("host", "https://tilecache.rainviewer.com"),
        }
    except Exception as e:
        logger.error(f"Weather fetch error: {e}")
        return latest_data.get("weather", {})


# ---------------------------------------------------------------------------
# News from regional RSS feeds
# ---------------------------------------------------------------------------
def fetch_news() -> list:
    """Fetch and parse regional news from configured RSS feeds."""
    config_path = Path(__file__).parent.parent / "config" / "news_feeds.json"
    try:
        feeds_config = json.loads(config_path.read_text())
    except Exception:
        feeds_config = []

    articles = []

    def _parse_feed(feed_cfg: dict) -> list:
        try:
            parsed = feedparser.parse(feed_cfg["url"])
            items = []
            for entry in parsed.entries[:10]:
                items.append({
                    "title": entry.get("title", ""),
                    "link": entry.get("link", ""),
                    "source": feed_cfg["name"],
                    "weight": feed_cfg.get("weight", 3),
                    "published": entry.get("published", entry.get("updated", "")),
                    "summary": (entry.get("summary") or "")[:200],
                })
            return items
        except Exception as e:
            logger.error(f"RSS error for {feed_cfg['name']}: {e}")
            return []

    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(_parse_feed, fc): fc for fc in feeds_config}
        for future in as_completed(futures):
            articles.extend(future.result())

    # Sort by weight (higher first), then by recency
    articles.sort(key=lambda a: a.get("weight", 0), reverse=True)
    return articles[:50]


# ---------------------------------------------------------------------------
# CCTV cameras (Thai DOH / BMA traffic cameras)
# ---------------------------------------------------------------------------
def fetch_cctv() -> list:
    """Fetch Thai highway and Bangkok traffic camera feeds."""
    cameras = []

    # Thai Department of Highways CCTV
    try:
        with _client() as c:
            resp = c.get(
                "https://api.dfrg.go.th/cctv/",
                timeout=10.0,
            )
            if resp.status_code == 200:
                data = resp.json()
                for cam in (data if isinstance(data, list) else data.get("data", [])):
                    lat = cam.get("latitude") or cam.get("lat")
                    lon = cam.get("longitude") or cam.get("lon") or cam.get("lng")
                    if lat and lon:
                        cameras.append({
                            "id": cam.get("id", ""),
                            "name": cam.get("name", cam.get("title", "DOH Camera")),
                            "lat": float(lat),
                            "lon": float(lon),
                            "url": cam.get("url", cam.get("image", "")),
                            "source": "DOH Thailand",
                        })
    except Exception as e:
        logger.debug(f"DOH CCTV error: {e}")

    # BMA (Bangkok Metropolitan Administration) traffic cameras
    try:
        with _client() as c:
            resp = c.get("http://www.bmatraffic.com/api/cctv", timeout=10.0)
            if resp.status_code == 200:
                data = resp.json()
                for cam in (data if isinstance(data, list) else data.get("data", [])):
                    lat = cam.get("lat") or cam.get("latitude")
                    lon = cam.get("lng") or cam.get("lon") or cam.get("longitude")
                    if lat and lon:
                        cameras.append({
                            "id": cam.get("id", ""),
                            "name": cam.get("name", "BMA Camera"),
                            "lat": float(lat),
                            "lon": float(lon),
                            "url": cam.get("image", cam.get("url", "")),
                            "source": "BMA Bangkok",
                        })
    except Exception as e:
        logger.debug(f"BMA CCTV error: {e}")

    return cameras if cameras else latest_data.get("cctv", [])


# ---------------------------------------------------------------------------
# Air quality / PM2.5 (critical for Thailand burning season)
# ---------------------------------------------------------------------------
def fetch_air_quality() -> list:
    """
    Fetch PM2.5/AQI data from Thailand PCD (air4thai.pcd.go.th) official API.
    189+ stations across Thailand with real-time PM2.5 readings.
    """
    result = []

    # Thailand PCD (Pollution Control Department) - official, no key needed
    try:
        with _client() as c:
            resp = c.get(
                "http://air4thai.pcd.go.th/services/getNewAQI_JSON.php",
                timeout=15.0,
            )
            resp.raise_for_status()
            data = resp.json()

        stations = data.get("stations", data) if isinstance(data, dict) else data
        for stn in stations:
            try:
                lat = float(stn.get("lat", 0))
                lon = float(stn.get("long", stn.get("lon", 0)))
                if lat == 0 or lon == 0:
                    continue

                aqi_last = stn.get("AQILast", {})
                pm25_data = aqi_last.get("PM25", {})
                pm25_val = pm25_data.get("value", "-1")
                pm25_aqi = pm25_data.get("aqi", "-1")

                # Skip stations with no PM2.5 data
                if pm25_val == "-1" and pm25_aqi == "-1":
                    continue

                result.append({
                    "location": stn.get("nameEN", stn.get("nameTH", "")),
                    "city": stn.get("areaEN", stn.get("areaTH", "")),
                    "country": "TH",
                    "lat": lat,
                    "lon": lon,
                    "pm25": float(pm25_val) if pm25_val != "-1" else None,
                    "pm25_aqi": int(pm25_aqi) if pm25_aqi != "-1" else None,
                    "color": pm25_data.get("color_id", "0"),
                    "lastUpdated": f"{aqi_last.get('date', '')} {aqi_last.get('time', '')}",
                })
            except (ValueError, TypeError):
                continue
    except Exception as e:
        logger.error(f"Thai PCD air quality error: {e}")

    return result if result else latest_data.get("air_quality", [])


# ---------------------------------------------------------------------------
# Scheduler: two-tier fetch pipeline
# ---------------------------------------------------------------------------
def run_fast_tier():
    """Fast tier: runs every 60 seconds."""
    tasks = {
        "flights": fetch_flights,
        "military_flights": fetch_military_flights,
        "cctv": fetch_cctv,
    }

    results = {}
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = {pool.submit(fn): key for key, fn in tasks.items()}
        for future in as_completed(futures):
            key = futures[future]
            try:
                results[key] = future.result()
            except Exception as e:
                logger.error(f"Fast tier error for {key}: {e}")

    with _data_lock:
        for key, value in results.items():
            latest_data[key] = value
            _last_updated[key] = _now_iso()
        _update_etag()


def run_slow_tier():
    """Slow tier: runs every 30 minutes."""
    tasks = {
        "earthquakes": fetch_earthquakes,
        "fires": fetch_fires,
        "weather": fetch_weather,
        "news": fetch_news,
        "air_quality": fetch_air_quality,
        "ships": fetch_ships,
    }

    results = {}
    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = {pool.submit(fn): key for key, fn in tasks.items()}
        for future in as_completed(futures):
            key = futures[future]
            try:
                results[key] = future.result()
            except Exception as e:
                logger.error(f"Slow tier error for {key}: {e}")

    with _data_lock:
        for key, value in results.items():
            latest_data[key] = value
            _last_updated[key] = _now_iso()
        _update_etag()


def _update_etag():
    global _etag_hash
    import hashlib
    content = json.dumps(_last_updated, sort_keys=True)
    _etag_hash = hashlib.md5(content.encode()).hexdigest()


def get_fast_data() -> dict:
    """Return fast-tier data."""
    with _data_lock:
        return {
            "flights": latest_data.get("flights", {}),
            "military_flights": latest_data.get("military_flights", []),
            "cctv": latest_data.get("cctv", []),
            "updated": {k: _last_updated.get(k, "") for k in ["flights", "military_flights", "cctv"]},
        }


def get_slow_data() -> dict:
    """Return slow-tier data."""
    with _data_lock:
        return {
            "earthquakes": latest_data.get("earthquakes", []),
            "fires": latest_data.get("fires", []),
            "weather": latest_data.get("weather", {}),
            "news": latest_data.get("news", []),
            "air_quality": latest_data.get("air_quality", []),
            "ships": latest_data.get("ships", []),
            "updated": {
                k: _last_updated.get(k, "")
                for k in ["earthquakes", "fires", "weather", "news", "air_quality", "ships"]
            },
        }


def get_etag() -> str:
    return _etag_hash


def get_health() -> dict:
    """Return health status with per-source counts and freshness."""
    with _data_lock:
        flights = latest_data.get("flights", {})
        return {
            "status": "ok",
            "sources": {
                "flights_commercial": len(flights.get("commercial", [])),
                "flights_military": len(flights.get("military", [])) + len(latest_data.get("military_flights", [])),
                "flights_private": len(flights.get("private", [])),
                "ships": len(latest_data.get("ships", [])),
                "earthquakes": len(latest_data.get("earthquakes", [])),
                "fires": len(latest_data.get("fires", [])),
                "news": len(latest_data.get("news", [])),
                "cctv": len(latest_data.get("cctv", [])),
                "air_quality": len(latest_data.get("air_quality", [])),
            },
            "last_updated": dict(_last_updated),
        }
