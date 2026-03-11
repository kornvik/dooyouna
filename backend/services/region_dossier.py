"""
Region dossier: right-click intelligence for any location on the map.
Fetches location info, country data, and Wikipedia summary in parallel.
"""

import logging
from concurrent.futures import ThreadPoolExecutor, as_completed

import httpx
from cachetools import TTLCache

logger = logging.getLogger(__name__)

_cache = TTLCache(maxsize=500, ttl=86400)  # 24h cache
HTTP_TIMEOUT = 10.0


def _round_coord(val: float, precision: float = 0.1) -> float:
    return round(val / precision) * precision


def get_dossier(lat: float, lon: float) -> dict:
    """Build a location dossier from multiple sources in parallel."""
    cache_key = f"{_round_coord(lat)},{_round_coord(lon)}"
    if cache_key in _cache:
        return _cache[cache_key]

    result = {"lat": lat, "lon": lon}

    def _reverse_geocode():
        with httpx.Client(timeout=HTTP_TIMEOUT) as c:
            resp = c.get(
                "https://nominatim.openstreetmap.org/reverse",
                params={"lat": lat, "lon": lon, "format": "json", "zoom": 10},
                headers={"User-Agent": "DooYouNa-OSINT/1.0"},
            )
            resp.raise_for_status()
            return resp.json()

    def _country_info(country_code: str):
        with httpx.Client(timeout=HTTP_TIMEOUT) as c:
            resp = c.get(f"https://restcountries.com/v3.1/alpha/{country_code}")
            resp.raise_for_status()
            data = resp.json()
            if isinstance(data, list):
                data = data[0]
            return {
                "name": data.get("name", {}).get("common", ""),
                "official_name": data.get("name", {}).get("official", ""),
                "capital": data.get("capital", []),
                "population": data.get("population", 0),
                "area": data.get("area", 0),
                "languages": data.get("languages", {}),
                "currencies": {
                    k: v.get("name", "") for k, v in data.get("currencies", {}).items()
                },
                "flag": data.get("flags", {}).get("svg", ""),
                "borders": data.get("borders", []),
                "region": data.get("subregion", data.get("region", "")),
            }

    def _wikipedia(place_name: str):
        with httpx.Client(timeout=HTTP_TIMEOUT) as c:
            resp = c.get(
                f"https://en.wikipedia.org/api/rest_v1/page/summary/{place_name}",
                headers={"User-Agent": "DooYouNa-OSINT/1.0"},
            )
            if resp.status_code != 200:
                return None
            data = resp.json()
            return {
                "title": data.get("title", ""),
                "extract": data.get("extract", ""),
                "thumbnail": data.get("thumbnail", {}).get("source", ""),
            }

    # Step 1: Reverse geocode
    try:
        geo = _reverse_geocode()
        address = geo.get("address", {})
        result["location"] = geo.get("display_name", "")
        result["city"] = address.get("city", address.get("town", address.get("village", "")))
        result["state"] = address.get("state", "")
        result["country"] = address.get("country", "")
        country_code = address.get("country_code", "").upper()
        result["country_code"] = country_code
    except Exception as e:
        logger.error(f"Reverse geocode error: {e}")
        _cache[cache_key] = result
        return result

    # Step 2: Fetch country info and Wikipedia in parallel
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = {}
        if country_code:
            futures[pool.submit(_country_info, country_code)] = "country"

        wiki_name = result["city"] or result["state"] or result["country"]
        if wiki_name:
            futures[pool.submit(_wikipedia, wiki_name)] = "wikipedia"

        for future in as_completed(futures):
            key = futures[future]
            try:
                data = future.result()
                if data:
                    result[key] = data
            except Exception as e:
                logger.error(f"Dossier {key} error: {e}")

    _cache[cache_key] = result
    return result
