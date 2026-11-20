"""Streamlit Community Cloud entrypoint: live planner plus unchanged offline showcase."""
from pathlib import Path

import pydeck as pdk
import streamlit as st

from streamlit_live import (
    CATEGORIES, ProviderError, merge_facilities, route_options, sample_path,
    scan_section, search_places, sections,
)

assets = Path(__file__).resolve().parent / "docs"

st.set_page_config(page_title="Fieldtrip Planner", page_icon="🚌", layout="wide")


@st.cache_data(ttl=24 * 3600, show_spinner=False)
def cached_places(text):
    return search_places(text)


@st.cache_data(ttl=3600, show_spinner=False)
def cached_routes(start, end):
    return route_options(list(start), list(end))


def reset_trip():
    for key in ("routes", "route_key", "scanned", "errors", "stops", "route_choice"):
        st.session_state.pop(key, None)


def route_map(route, facilities, origin, destination):
    path = sample_path(route["line"])
    # These markers and the path are drawn from returned API coordinates.
    pins = [
        {"position": route["line"][0], "label": origin, "color": [25, 108, 82]},
        {"position": route["line"][-1], "label": destination, "color": [175, 71, 46]},
    ]
    for facility in facilities[:400]:
        pins.append({
            "position": facility["xy"],
            "label": facility["name"] + " · " + facility["category"],
            "color": [44, 110, 177],
        })
    lons = [p[0] for p in path]
    lats = [p[1] for p in path]
    span = max(max(lons) - min(lons), (max(lats)-min(lats))*1.5, 0.05)
    import math
    zoom = max(3.0, min(12.0, math.log2(180 / span) - 1))
    return pdk.Deck(
        map_style="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
        initial_view_state=pdk.ViewState(
            latitude=(min(lats)+max(lats))/2,
            longitude=(min(lons)+max(lons))/2, zoom=zoom,
        ),
        layers=[
            pdk.Layer("PathLayer", data=[{"path": path}], get_path="path",
                      get_color=[20, 106, 83], width_min_pixels=4, get_width=6),
            pdk.Layer("ScatterplotLayer", data=pins, get_position="position",
                      get_fill_color="color", get_radius=90,
                      radius_min_pixels=5, pickable=True),
        ],
        tooltip={"text": "{label}"},
    )


live, offline, story = st.tabs([
    "Plan any journey · Live", "Existing offline demonstration", "Watch the story"
])

with live:
    st.title("Plan a fieldtrip between any supported towns")
    st.caption(
        "Select towns/cities or enter exact latitude,longitude coordinates. "
        "Live driving routes use OSRM; roadside facilities use OpenStreetMap through Overpass."
    )

    with st.form("place_search"):
        start_col, end_col = st.columns(2)
        with start_col:
            from_text = st.text_input("Starting town/city", value="Nagercoil",
                                      help="Or enter coordinates as latitude,longitude")
        with end_col:
            to_text = st.text_input("Destination town/city", value="Tirunelveli",
                                    help="Or enter coordinates as latitude,longitude")
        find_places = st.form_submit_button("Find matching locations", type="primary")

    if find_places:
        reset_trip()
        st.session_state.pop("from_places", None)
        st.session_state.pop("to_places", None)
        try:
            with st.spinner("Resolving both locations…"):
                from_places = cached_places(from_text)
                to_places = cached_places(to_text)
            if not from_places or not to_places:
                st.warning("No location matches found. Try the town and state, or exact coordinates.")
            else:
                st.session_state["from_places"] = from_places
                st.session_state["to_places"] = to_places
        except (ProviderError, ValueError) as exc:
            st.error(str(exc))

    if st.session_state.get("from_places") and st.session_state.get("to_places"):
        left, right = st.columns(2)
        origins = st.session_state["from_places"]
        destinations = st.session_state["to_places"]
        with left:
            origin_index = st.selectbox("Confirm starting location", range(len(origins)),
                                        format_func=lambda i: origins[i]["label"])
        with right:
            dest_index = st.selectbox("Confirm destination", range(len(destinations)),
                                      format_func=lambda i: destinations[i]["label"])
        if st.button("Calculate driving routes", type="primary"):
            reset_trip()
            start = origins[origin_index]
            end = destinations[dest_index]
            try:
                with st.spinner("Requesting driving geometry from OSRM…"):
                    st.session_state["routes"] = cached_routes(
                        tuple(start["xy"]), tuple(end["xy"])
                    )
                st.session_state["trip_names"] = (start["label"], end["label"])
            except (ProviderError, ValueError) as exc:
                st.error(str(exc))

    routes = st.session_state.get("routes") or []
    if routes:
        st.divider()
        route_index = st.selectbox(
            "Select road option", range(len(routes)), key="route_choice",
            format_func=lambda i: (
                f"Route {i+1} · {routes[i]['distance_m']/1000:.1f} km · "
                f"{routes[i]['duration_s']/3600:.1f} estimated hours"
            ),
        )
        route = routes[route_index]
        if st.session_state.get("route_key") != route["id"]:
            st.session_state["route_key"] = route["id"]
            st.session_state["scanned"] = {}
            st.session_state["errors"] = {}
            st.session_state["stops"] = []
        chunks = sections(route["line"])
        scanned = st.session_state["scanned"]
        errors = st.session_state["errors"]
        facilities = merge_facilities(scanned)
        from_name, to_name = st.session_state["trip_names"]
        metrics = st.columns(3)
        metrics[0].metric("Road distance", f"{route['distance_m']/1000:.1f} km")
        metrics[1].metric("Estimated driving time", f"{route['duration_s']/60:.0f} min")
        metrics[2].metric("Roadside facilities found", len(facilities))
        st.pydeck_chart(route_map(route, facilities, from_name, to_name),
                        use_container_width=True)
        st.caption(
            "Road estimates exclude live traffic. City searches select a city-centre coordinate; "
            "use exact coordinates for a specific campus or destination. "
            "The map baselayer requires internet."
        )

        st.subheader("Discover facilities along the road")
        radius = st.select_slider("Maximum straight-line distance from route (km)",
                                   options=[1, 2, 3, 5, 10], value=3)
        # A changing radius invalidates earlier results; every record needs the same filter.
        scope = (route["id"], radius)
        if st.session_state.get("scan_scope") != scope:
            st.session_state["scan_scope"] = scope
            scanned.clear()
            errors.clear()
            st.session_state["stops"] = []
        remaining = [i for i in range(len(chunks)) if i not in scanned and i not in errors]
        attempted = len(chunks) - len(remaining)
        st.progress(attempted / max(len(chunks), 1),
                    text=f"{attempted}/{len(chunks)} sections attempted; "
                         f"{len(errors)} failed")
        col_next, col_retry = st.columns(2)
        scan_next = col_next.button("Scan next road sections (up to 4)",
                                    disabled=not remaining, type="primary")
        retry_failed = col_retry.button("Retry failed sections (up to 4)",
                                        disabled=not errors)
        targets = (remaining[:4] if scan_next else list(errors)[:4] if retry_failed else [])
        if targets:
            for index in targets:
                line, start_m = chunks[index]
                try:
                    with st.spinner(f"Querying real OSM services · section {index+1}/{len(chunks)}"):
                        scanned[index] = scan_section(line, start_m, radius)
                    errors.pop(index, None)
                except (ProviderError, ValueError) as exc:
                    errors[index] = str(exc)
            facilities = merge_facilities(scanned)
        if errors:
            st.warning(
                f"{len(errors)} section(s) could not be checked. Results are incomplete. "
                "Retry failed sections, or configure another permitted Overpass provider."
            )
            with st.expander("Section errors"):
                for index, error in sorted(errors.items()):
                    st.write(f"Section {index+1}: {error}")
        if remaining:
            st.info(
                "The route has not yet been searched completely. Click **Scan next road sections** "
                "to continue. Public API services have quotas and may be temporarily unavailable."
            )
        if not remaining and not errors:
            st.success("All road sections queried successfully (OSM records may still be incomplete).")

        if facilities:
            categories = st.multiselect("Service categories", CATEGORIES, default=CATEGORIES)
            visible = [f for f in facilities if f["category"] in categories]
            st.caption(
                f"{len(visible)} matching OSM records. These are not verified as currently open "
                "or reachable by vehicle; route offset is straight-line distance."
            )
            if visible:
                st.dataframe(
                    [{
                        "Service": f["name"],
                        "Category": f["category"],
                        "Type": f["kind"],
                        "Along route (km)": round(f["along_m"]/1000, 1),
                        "Road offset (km)": round(f["offset_m"]/1000, 2),
                        "Opening hours (OSM)": f["tags"].get("opening_hours", "Unknown"),
                        "Phone (OSM)": f["tags"].get("phone", "Unknown"),
                        "OSM source": f["osm_url"],
                    } for f in visible],
                    use_container_width=True, hide_index=True,
                    column_config={"OSM source": st.column_config.LinkColumn("OSM source")},
                )
            st.subheader("Draft itinerary")
            st.caption("Stops are held in this browser session. Driving detours have not been verified.")
            options = {f["id"]: f for f in facilities}
            pick_id = st.selectbox("Add a facility as a planned stop", list(options),
                                   format_func=lambda i: (
                                       f"{options[i]['name']} · "
                                       f"{options[i]['along_m']/1000:.1f} km"
                                   ))
            if st.button("Add selected stop") and pick_id not in st.session_state["stops"]:
                st.session_state["stops"].append(pick_id)
            stops = st.session_state["stops"]
            if stops:
                st.write(" → ".join(options[i]["name"] for i in stops if i in options))
                if st.button("Clear planned stops"):
                    stops.clear()
        elif attempted:
            st.info("No matching facilities returned for the successfully queried sections.")

    st.caption(
        "Sources: © OpenStreetMap contributors (ODbL), OSRM routing, "
        "Open-Meteo geocoding (CC BY-NC 4.0, non-commercial). "
        "Data and provider availability are not guaranteed."
    )
    st.link_button("Open-Meteo attribution", "https://open-meteo.com/")

with offline:
    st.caption("Existing bundled demonstration: Nagercoil → Tirunelveli or Bengaluru. "
               "This retains the earlier offline interface and its simulated tour.")
    import streamlit.components.v1 as components
    components.html(
        (assets / "index.html").read_text(encoding="utf-8"),
        height=900, scrolling=True,
    )

with story:
    st.video(str(assets / "story.mp4"))
