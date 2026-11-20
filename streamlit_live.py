"""Streamlit Cloud-compatible live route and roadside service logic.

The existing Node algorithms in core.mjs/server.mjs remain unchanged. This module
ports their corridor geometry and OSM taxonomy for a Python-only deployment.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import re
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

TAGS = json.loads((Path(__file__).parent / "data" / "tags.json").read_text(encoding="utf-8"))
CATEGORIES = list(dict.fromkeys(group for values in TAGS.values() for group in values.values()))
GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search"
OSRM_URL = os.environ.get("OSRM_URL", "https://router.project-osrm.org").rstrip("/")
OVERPASS_URL = os.environ.get("OVERPASS_URL", "https://overpass.private.coffee/api/interpreter")
FALLBACK_OVERPASS_URL = os.environ.get("FALLBACK_OVERPASS_URL", "https://overpass-api.de/api/interpreter")
USER_AGENT = "FieldtripPlanner/1.1 (non-commercial university prototype; github.com/Mind-Trainer/fieldtrip-planner)"
COORDINATES = re.compile(r"^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$")


class ProviderError(RuntimeError):
    """An external provider did not supply usable data."""


def request_json(url: str, form: dict | None = None, timeout: int = 22) -> dict:
    payload = urlencode(form).encode("utf-8") if form else None
    headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
    if payload:
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    try:
        with urlopen(Request(url, data=payload, headers=headers), timeout=timeout) as response:
            raw = response.read(12_000_001)
            if len(raw) > 12_000_000:
                raise ProviderError("Provider response exceeded the safety limit.")
        result = json.loads(raw.decode("utf-8"))
    except HTTPError as exc:
        raise ProviderError(f"Provider HTTP {exc.code}; try again later.") from exc
    except (URLError, TimeoutError) as exc:
        raise ProviderError("Provider unavailable or timed out; try again later.") from exc
    except (ValueError, UnicodeError) as exc:
        raise ProviderError("Provider returned an invalid or non-JSON response.") from exc
    if not isinstance(result, dict):
        raise ProviderError("Provider returned an unexpected response.")
    return result


def search_places(text: str) -> list[dict]:
    """Search named towns/cities, or allow exact latitude,longitude input."""
    text = text.strip()
    if not text:
        return []
    coordinate = COORDINATES.fullmatch(text)
    if coordinate:
        lat, lon = map(float, coordinate.groups())
        if not (-85 <= lat <= 85 and -180 <= lon <= 180):
            raise ValueError("Coordinates must be latitude -85..85, longitude -180..180.")
        return [{"label": f"{lat:.5f}, {lon:.5f} (coordinates)", "xy": [lon, lat]}]
    if len(text) < 2 or len(text) > 120:
        raise ValueError("Enter a city or town name (2–120 characters).")
    result = request_json(GEOCODE_URL + "?" + urlencode(
        {"name": text, "count": 5, "language": "en", "format": "json"}
    ))
    places = []
    for place in result.get("results", []):
        if not all(k in place for k in ("name", "latitude", "longitude")):
            continue
        parts = [place["name"], place.get("admin1", ""), place.get("country", "")]
        places.append({
            "label": ", ".join(str(p) for p in parts if p),
            "xy": [float(place["longitude"]), float(place["latitude"])],
        })
    return places


def route_options(start: list[float], end: list[float]) -> list[dict]:
    if len(start) != 2 or len(end) != 2:
        raise ValueError("Two valid location coordinates are required.")
    if start == end:
        raise ValueError("The starting point and destination must be different.")
    for lon, lat in (start, end):
        if not (-180 <= lon <= 180 and -85 <= lat <= 85):
            raise ValueError("Invalid route coordinates.")
    pair = ";".join(",".join(str(v) for v in xy) for xy in (start, end))
    url = (f"{OSRM_URL}/route/v1/driving/{pair}?" +
           urlencode({"overview": "full", "geometries": "geojson", "alternatives": "true"}))
    payload = request_json(url, timeout=30)
    if payload.get("code") != "Ok" or not payload.get("routes"):
        raise ProviderError("No driving route found for these locations.")
    result = []
    for route in payload["routes"][:3]:
        line = route.get("geometry", {}).get("coordinates", [])
        if len(line) < 2:
            continue
        result.append({
            "id": hashlib.sha256(json.dumps(line, separators=(",", ":")).encode()).hexdigest(),
            "line": line, "distance_m": float(route["distance"]),
            "duration_s": float(route["duration"]),
        })
    if not result:
        raise ProviderError("Routing provider returned no valid road geometry.")
    return result


def distance_m(a: list[float], b: list[float]) -> float:
    """Local tangent-plane distance, matching the existing JS prototype."""
    return math.hypot(
        (a[0] - b[0]) * math.cos(math.radians((a[1] + b[1]) / 2)),
        a[1] - b[1],
    ) * 111195


def sections(line: list[list[float]], target_m: float = 25000) -> list[tuple[list, float]]:
    """Overlapping road sections with distance at the first shared vertex."""
    if len(line) < 2:
        return []
    chunks = []
    part = [line[0]]
    total = start = covered = 0.0
    for point in line[1:]:
        step = distance_m(part[-1], point)
        part.append(point)
        total += step
        covered += step
        if covered >= target_m:
            chunks.append((part, start))
            part = [point]
            start = total
            covered = 0.0
    if len(part) > 1:
        chunks.append((part, start))
    return chunks


def bounds(line: list[list[float]], radius_km: float) -> tuple[float, float, float, float]:
    lon = [point[0] for point in line]
    lat = [point[1] for point in line]
    dy = radius_km / 110
    cos_lat = max(0.01, math.cos(math.radians(max(map(abs, lat)) + dy)))
    dx = dy / cos_lat
    return min(lat)-dy, min(lon)-dx, max(lat)+dy, max(lon)+dx


def classify(tags: dict) -> tuple[str, str] | None:
    for key, options in TAGS.items():
        value = tags.get(key)
        if value in options:
            return options[value], value
    return None


def overpass_query(box: tuple[float, float, float, float]) -> str:
    bbox = ",".join(f"{value:.6f}" for value in box)
    selectors = "".join(
        'nwr["' + key + '"~"^(' + "|".join(values) + ')$"](' + bbox + ');'
        for key, values in TAGS.items()
    )
    return "[out:json][timeout:22];(" + selectors + ");out center;"


def project(line: list[list[float]], point: list[float]) -> tuple[float, float]:
    """Return approximate road offset and distance along this section in metres."""
    nearest, along, accumulated = float("inf"), 0.0, 0.0
    c = math.cos(math.radians(point[1]))
    for a, b in zip(line, line[1:]):
        dx = (b[0] - a[0]) * c
        dy = b[1] - a[1]
        px = (point[0] - a[0]) * c
        py = point[1] - a[1]
        t = max(0.0, min(1.0, (px*dx + py*dy) / (dx*dx + dy*dy or 1)))
        offset = math.hypot(px - t*dx, py - t*dy) * 111195
        length = distance_m(a, b)
        if offset < nearest:
            nearest, along = offset, accumulated + t*length
        accumulated += length
    return nearest, along


def scan_section(line: list[list[float]], start_m: float, radius_km: float) -> list[dict]:
    """Fetch actual OSM records. Failed requests MUST NOT produce fabricated results."""
    if not 0 < radius_km <= 10:
        raise ValueError("Search radius must be between 0 and 10 km.")
    box = bounds(line, radius_km)
    payload = None
    failures = []
    # Try independently operated public instances, without repeating failures
    # against the same server; neither instance guarantees uptime.
    for url in dict.fromkeys((OVERPASS_URL, FALLBACK_OVERPASS_URL)):
        try:
            data = request_json(url, {"data": overpass_query(box)}, timeout=27)
            if not isinstance(data.get("elements"), list):
                raise ProviderError("Overpass response had no valid elements list.")
            payload = data
            break
        except ProviderError as exc:
            failures.append(url.split("/")[2] + ": " + str(exc))
    if payload is None:
        raise ProviderError("Both OSM services failed. " + " | ".join(failures))
    found = []
    for obj in payload["elements"]:
        tags = obj.get("tags") or {}
        category = classify(tags)
        centre = obj.get("center") or {}
        lon, lat = obj.get("lon", centre.get("lon")), obj.get("lat", centre.get("lat"))
        if category is None or lon is None or lat is None:
            continue
        xy = [float(lon), float(lat)]
        offset, along = project(line, xy)
        if offset > radius_km * 1000:
            continue
        kind, subtype = category
        found.append({
            "id": f"{obj['type']}/{obj['id']}",
            "name": tags.get("name", subtype.replace("_", " ").title()),
            "category": kind, "kind": subtype,
            "xy": xy, "offset_m": round(offset),
            "along_m": round(start_m + along),
            "tags": tags, "osm_url": f"https://www.openstreetmap.org/{obj['type']}/{obj['id']}",
        })
    return found


def merge_facilities(parts: dict[int, list[dict]]) -> list[dict]:
    result = {}
    for records in parts.values():
        for record in records:
            if record["id"] not in result or record["offset_m"] < result[record["id"]]["offset_m"]:
                result[record["id"]] = record
    return sorted(result.values(), key=lambda item: (item["along_m"], item["name"]))


def sample_path(line: list[list[float]], max_points: int = 1500) -> list[list[float]]:
    """Thin *display geometry only*; section scans retain every original vertex."""
    if len(line) <= max_points:
        return line
    step = math.ceil((len(line)-1) / (max_points-1))
    result = line[::step]
    if result[-1] != line[-1]:
        result.append(line[-1])
    return result
