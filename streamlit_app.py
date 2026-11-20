"""Streamlit host for the existing Fieldtrip React UI, now with a live API bridge.

The original bundled frontend is shown on ONE page. Its existing snapshot APIs
keep working locally; live route and corridor requests are served by Python.
"""
from __future__ import annotations

import json
import re
import tempfile
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import streamlit as st
import streamlit.components.v1 as components

from streamlit_live import ProviderError, route_options, scan_section, search_places, sections

HERE = Path(__file__).resolve().parent
st.set_page_config(page_title="Fieldtrip Planner", page_icon="🚌", layout="wide")


@st.cache_resource(show_spinner=False)
def component_folder() -> str:
    html = (HERE / "docs" / "index.html").read_text(encoding="utf-8")
    bridge = (HERE / "streamlit_bridge.js").read_text(encoding="utf-8")
    # The bundled shim still supplies the offline records and local browser saves.
    # Remove only the flag that makes React force 'snapshot' and hide live mode.
    html, replacements = re.subn(
        r"window\.fieldtripStandalone\s*=\s*true\s*;",
        "window.fieldtripStandalone = false;",
        html, count=1,
    )
    if replacements != 1:
        raise RuntimeError("The bundled Fieldtrip UI changed; standalone flag not found.")
    anchor = '<script type="module">'
    if anchor not in html:
        raise RuntimeError("The bundled Fieldtrip UI changed; entry script not found.")
    # Script executes AFTER the original snapshot fetch shim, BEFORE React mounts.
    html = html.replace(anchor, "<script>\n" + bridge + "\n</script>" + anchor, 1)
    folder = Path(tempfile.mkdtemp(prefix="fieldtrip-original-ui-"))
    (folder / "index.html").write_text(html, encoding="utf-8")
    return str(folder)


@st.cache_data(ttl=24 * 3600, show_spinner=False)
def geocode(text: str):
    return search_places(text)


@st.cache_data(ttl=3600, show_spinner=False)
def driving_routes(a: tuple, b: tuple):
    return route_options(list(a), list(b))


@st.cache_data(ttl=3600, show_spinner=False)
def corridor_records(part_json: str, start: float, km: float):
    # Cache successful requests only: errors are raised and aren't cached.
    return scan_section(json.loads(part_json), start, km)


def api_reply(message: dict) -> dict:
    path = message.get("path", "")
    method = message.get("method", "GET")
    if method != "GET":
        return {"status": 405, "payload": {"error": "This live API supports GET only."}}
    parsed = urlsplit(path)
    query = {k: v[0] for k, v in parse_qs(parsed.query).items()}
    if parsed.path == "/api/__geocode":
        text = query.get("text", "")
        return {"status": 200, "payload": geocode(text)}
    if parsed.path == "/api/routes":
        if query.get("mode") != "live":
            return {"status": 400, "payload": {"error": "Live routing only."}}
        def coordinates(value: str) -> tuple[float, float]:
            points = value.split(",")
            if len(points) != 2:
                raise ValueError("Choose both locations using the live location picker.")
            xy = tuple(float(x) for x in points)
            if not -180 <= xy[0] <= 180 or not -85 <= xy[1] <= 85:
                raise ValueError("Location coordinates are outside valid bounds.")
            return xy
        start = coordinates(query.get("from", ""))
        end = coordinates(query.get("to", ""))
        data = driving_routes(start, end)
        registered = st.session_state.setdefault("live_registry", {})
        result = []
        for r in data:
            parts = sections(r["line"], target_m=12000)
            registered[r["id"]] = parts
            result.append({
                "id": r["id"], "segments": len(parts),
                "distance": r["distance_m"], "duration": r["duration_s"],
                "line": r["line"],
            })
        return {"status": 200, "payload": result}
    if parsed.path == "/api/segment":
        if query.get("mode") != "live":
            return {"status": 400, "payload": {"error": "Live facility search only."}}
        parts = st.session_state.get("live_registry", {}).get(query.get("id", ""))
        if not parts:
            raise ValueError("Route expired. Load the driving route again.")
        index = int(query.get("index", "-1"))
        km = float(query.get("km", "3"))
        if index not in range(len(parts)) or not 0 < km <= 10:
            raise ValueError("Invalid route section or corridor radius.")
        line, start = parts[index]
        records = corridor_records(
            json.dumps(line, separators=(",", ":")), start, km
        )
        return {
            "status": 200,
            "payload": {
                "total": len(parts),
                "time": "Live OpenStreetMap request",
                "records": [{
                    "id": r["id"], "xy": r["xy"], "group": r["category"],
                    "kind": r["kind"], "tags": r["tags"],
                    "offset": r["offset_m"], "along": r["along_m"],
                } for r in records],
            },
        }
    if parsed.path == "/api/drive":
        def coordinates(value: str):
            xy = tuple(float(x) for x in value.split(","))
            if len(xy) != 2:
                raise ValueError("Invalid driving endpoint.")
            return xy
        routes = driving_routes(coordinates(query.get("from", "")),
                                coordinates(query.get("to", "")))
        return {
            "status": 200,
            "payload": {"distance": routes[0]["distance_m"],
                        "duration": routes[0]["duration_s"]},
        }
    return {"status": 404, "payload": {"error": "Unknown live endpoint."}}


st.caption("Fieldtrip Planner · Original interface · Offline and live journey planning")
fieldtrip = components.declare_component("fieldtrip_original", path=component_folder())
# A component request is issued by the embedded original React UI and returned
# to the same iframe after a Streamlit rerun. No second page or replacement map.
request = fieldtrip(
    reply=st.session_state.get("bridge_reply"),
    key="fieldtrip_same_page",
    default=None,
)
if isinstance(request, dict):
    request_id = request.get("id")
    if request_id and request_id != st.session_state.get("bridge_handled"):
        st.session_state["bridge_handled"] = request_id
        try:
            response = api_reply(request)
        except (ProviderError, ValueError, TypeError, KeyError, IndexError) as exc:
            response = {"status": 502, "payload": {"error": str(exc)}}
        except Exception:
            response = {
                "status": 502,
                "payload": {"error": "Live request failed unexpectedly; check Streamlit logs."},
            }
        st.session_state["bridge_reply"] = {"id": request_id, **response}
        st.rerun()

with st.expander("Watch the story"):
    st.video(str(HERE / "docs" / "story.mp4"))
