"""
AIS vessel tracking via aisstream.io WebSocket.
Maintains a live vessel store for the Gulf of Thailand / Andaman Sea region.

AIS data comes from a global network of terrestrial and satellite AIS receivers.
Ships are legally required to broadcast their position via AIS transponders.
aisstream.io aggregates these public radio signals into a WebSocket feed.
"""

import json
import logging
import os
import threading
import time
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# Vessel store: keyed by MMSI
_vessels: dict[str, dict] = {}
_lock = threading.Lock()
_running = False
_thread: threading.Thread | None = None

# Thailand/Cambodia maritime bounding boxes
# Gulf of Thailand + Andaman Sea + South China Sea approaches
BOUNDING_BOXES = [
    # Gulf of Thailand
    [[5.0, 99.0], [14.0, 105.0]],
    # Andaman Sea (west coast Thailand)
    [[5.0, 95.0], [11.0, 99.0]],
    # Cambodian coast + Vietnam approach
    [[10.0, 103.0], [14.0, 108.0]],
]

# Vessel type classification from AIS type codes
VESSEL_TYPES = {
    range(60, 70): "passenger",
    range(70, 80): "cargo",
    range(80, 90): "tanker",
    range(36, 38): "yacht",
    range(40, 50): "high-speed",
    range(50, 56): "special",
    range(35, 36): "military",
}


def _classify_vessel(ship_type: int) -> str:
    for type_range, label in VESSEL_TYPES.items():
        if ship_type in type_range:
            return label
    return "other"


# MID (Maritime Identification Digit) to country - first 3 digits of MMSI
MID_COUNTRIES = {
    "567": "TH", "514": "KH", "574": "VN", "533": "MY",
    "563": "SG", "525": "ID", "548": "PH", "520": "MM",
    "416": "TW", "412": "CN", "431": "JP", "440": "KR",
    "351": "PA", "370": "PA", "371": "PA", "372": "PA",
    "636": "LR", "637": "LR", "538": "MH", "211": "DE",
    "229": "MT", "240": "GR", "241": "GR", "244": "NL",
    "245": "NL", "246": "NL", "247": "IT", "256": "MT",
    "205": "BE", "209": "CY", "210": "CY", "212": "CY",
    "219": "DK", "220": "DK", "224": "ES", "225": "ES",
    "226": "FR", "227": "FR", "228": "FR", "230": "FI",
    "231": "FI", "232": "GB", "233": "GB", "234": "GB",
    "235": "GB", "236": "GI", "249": "MT", "250": "IE",
    "255": "PT", "256": "MT", "257": "NO", "258": "NO",
    "259": "NO", "261": "PL", "263": "PT", "303": "US",
    "338": "US", "366": "US", "367": "US", "368": "US",
    "369": "US", "316": "CA",
}


def _mmsi_to_country(mmsi: str) -> str:
    if len(mmsi) >= 3:
        return MID_COUNTRIES.get(mmsi[:3], "")
    return ""


def _stream_worker():
    """Background thread: connect to aisstream.io WebSocket and process messages."""
    global _running

    api_key = os.environ.get("AIS_API_KEY", "")
    if not api_key:
        logger.warning("AIS_API_KEY not set, vessel tracking disabled")
        return

    import websockets.sync.client as ws_client

    backoff = 1
    while _running:
        try:
            logger.info("Connecting to aisstream.io WebSocket...")
            subscribe_msg = json.dumps({
                "APIKey": api_key,
                "BoundingBoxes": BOUNDING_BOXES,
                "FilterMessageTypes": ["PositionReport", "ShipStaticData"],
            })

            with ws_client.connect(
                "wss://stream.aisstream.io/v0/stream",
                additional_headers={"User-Agent": "DooYouNa-OSINT/1.0"},
                open_timeout=30,
                close_timeout=5,
            ) as conn:
                conn.send(subscribe_msg)
                logger.info("AIS stream connected, receiving vessel data...")
                backoff = 1  # reset on successful connect

                while _running:
                    try:
                        raw = conn.recv(timeout=30)
                        msg = json.loads(raw)
                        _process_message(msg)
                    except TimeoutError:
                        continue
                    except Exception as e:
                        logger.debug(f"AIS message error: {e}")
                        continue

        except Exception as e:
            if _running:
                logger.error(f"AIS stream error: {e}, reconnecting in {backoff}s")
                time.sleep(backoff)
                backoff = min(60, backoff * 2)


def _process_message(msg: dict):
    """Process a single AIS message and update vessel store."""
    msg_type = msg.get("MessageType", "")
    meta = msg.get("MetaData", {})
    mmsi = str(meta.get("MMSI", ""))
    if not mmsi:
        return

    now = datetime.now(timezone.utc).isoformat()

    with _lock:
        vessel = _vessels.get(mmsi, {
            "mmsi": mmsi,
            "name": "",
            "lat": 0,
            "lon": 0,
            "course": 0,
            "speed": 0,
            "heading": 0,
            "type": "other",
            "ship_type_code": 0,
            "country": _mmsi_to_country(mmsi),
            "lastUpdated": now,
        })

        if msg_type == "PositionReport":
            pos = msg.get("Message", {}).get("PositionReport", {})
            vessel["lat"] = pos.get("Latitude", vessel["lat"])
            vessel["lon"] = pos.get("Longitude", vessel["lon"])
            vessel["course"] = pos.get("Cog", vessel["course"])
            vessel["speed"] = pos.get("Sog", vessel["speed"])
            vessel["heading"] = pos.get("TrueHeading", vessel["heading"])
            vessel["lastUpdated"] = now

        elif msg_type == "ShipStaticData":
            static = msg.get("Message", {}).get("ShipStaticData", {})
            vessel["name"] = static.get("Name", vessel["name"]).strip()
            ship_type = static.get("Type", 0)
            vessel["ship_type_code"] = ship_type
            vessel["type"] = _classify_vessel(ship_type)

        # Update name from metadata if we don't have one
        if not vessel["name"]:
            vessel["name"] = meta.get("ShipName", "").strip()

        _vessels[mmsi] = vessel

    # Periodic cleanup: remove stale vessels (no update in 15 min)
    if len(_vessels) % 100 == 0:
        _prune_stale()


def _prune_stale():
    """Remove vessels not updated in the last 15 minutes."""
    cutoff = time.time() - 900
    with _lock:
        stale = []
        for mmsi, v in _vessels.items():
            try:
                ts = datetime.fromisoformat(v["lastUpdated"]).timestamp()
                if ts < cutoff:
                    stale.append(mmsi)
            except (ValueError, KeyError):
                stale.append(mmsi)
        for mmsi in stale:
            del _vessels[mmsi]
        if stale:
            logger.debug(f"Pruned {len(stale)} stale vessels")


def start_ais_stream():
    """Start the AIS stream background thread."""
    global _running, _thread
    if _running:
        return

    _running = True
    _thread = threading.Thread(target=_stream_worker, daemon=True)
    _thread.start()
    logger.info("AIS stream thread started")


def stop_ais_stream():
    """Stop the AIS stream."""
    global _running
    _running = False
    logger.info("AIS stream stopping")


def get_vessels() -> list:
    """Return current vessel list."""
    with _lock:
        return [v for v in _vessels.values() if v["lat"] != 0 and v["lon"] != 0]
