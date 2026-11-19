import { standalone } from "./runtime";
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { journeyMap, colors } from "./map";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import "./style.css";
import {
  Route,
  ArrowRight,
  Clock3,
  MapPin,
  Search,
  SlidersHorizontal,
  Play,
  ShieldCheck,
  CalendarDays,
  Layers,
  ArrowUpRight,
  LocateFixed,
  LoaderCircle,
  X,
  Phone,
  ChevronRight,
  CircleCheck,
} from "lucide-react";
import { CategoryIcon, categoryNames, VerificationBadge } from "./ui";
import { routeScores } from "../planning.mjs";
import { Extras, Review } from "./modules";
import { GuidedTour, RouteQuestions } from "./tour";
import { FacultyAccount } from "./faculty";
const storedJourney = (() => {
  try {
    return JSON.parse(localStorage.getItem("fieldtrip-journey") || "{}");
  } catch {
    return {};
  }
})();
const groups = Object.keys(colors);
export async function api(path, init?) {
  const response = await fetch("/api/" + path, init);
  const data = await response.json();
  if (!response.ok) throw Error(data.error || response.statusText);
  return data;
}
function App() {
  const [dest, D] = useState(storedJourney.destination || "Tirunelveli"),
    [mode, M] = useState(standalone ? "snapshot" : storedJourney.mode || "snapshot"),
    [routes, R] = useState([]),
    [idx, I] = useState(0),
    [km, K] = useState(storedJourney.km || "3"),
    [rows, F] = useState([]),
    [filters, C] = useState(groups),
    [search, Q] = useState(""),
    [detail, S] = useState(null),
    [status, T] = useState(""),
    [busy, B] = useState(false),
    [searchSection, setSearchSection] = useState(0),
    [tiles, Y] = useState(false),
    [planned, P] = useState([]),
    [custom, U] = useState(storedJourney.custom || { from: "", to: "" });
  const [active, setActive] = useState("route-planner");
  const [stamp, Z] = useState(""),
    [serial, H] = useState(0),
    [reviewFilter, RF] = useState("All statuses"),
    [compare, CP] = useState("Balanced");
  const host = useRef(null),
    map = useRef(null),
    action = useRef(null),
    generation = useRef(0);
  useEffect(() => {
    try {
      localStorage.setItem(
        "fieldtrip-journey",
        JSON.stringify({ destination: dest, mode, km, custom }),
      );
    } catch {}
  }, [dest, mode, km, custom]);
  const [reviews, V] = useState({});
  const [trustedOnly, setTrustedOnly] = useState(false);
  const rank = (r) =>
    ({ Verified: 0, "Partially Verified": 1 })[reviews[r.id]?.status] ?? 2;
  async function reload() {
    const entries = await api("reviews");
    V(Object.fromEntries(entries.map((r) => [r.facility, r])));
  }
  useEffect(() => {
    reload().catch((e) => T(e.message));
  }, []);
  const route = routes[idx],
    visible = React.useMemo(
      () =>
        rows
          .filter(
            (r) =>
              filters.includes(r.group) &&
              (!trustedOnly || rank(r) < 2) &&
              ((r.tags.name || "") + " " + r.kind + " " + r.id)
                .toLowerCase()
                .includes(search.toLowerCase()),
          )
          .sort((a, b) => rank(a) - rank(b)),
      [rows, filters, search, reviews, trustedOnly],
    );
  function clear() {
    generation.current++;
    B(false);
    setSearchSection(0);
    F([]);
    S(null);
    Z("");
    T("");
    action.current = null;
  }
  function endpoints() {
    clear();
    P([]);
    R([]);
    I(0);
  }
  useEffect(() => {
    map.current = journeyMap(host.current, S, (xy) => action.current?.(xy));
    loadRoutes();
  }, []);
  useEffect(() => {
    map.current?.route(route);
  }, [route]);
  useEffect(() => {
    map.current?.places(
      visible,
      planned,
      rows.filter((r) => planned.includes(r.id)),
    );
  }, [visible, planned]);
  useEffect(() => {
    map.current?.tiles(tiles);
  }, [tiles]);
  async function loadRoutes() {
    endpoints();
    const seq = generation.current;
    B(true);
    T("Loading driving routes…");
    try {
      const params = new URLSearchParams({ destination: dest, mode });
      if (mode === "live")
        for (const k of ["from", "to"]) if (custom[k]) params.set(k, custom[k]);
      const arr = await api("routes?" + params);
      if (seq !== generation.current) return;
      R(arr);
      T(
        arr.length === 1
          ? "Routing engine returned one driving route."
          : "Select a driving route.",
      );
    } catch (e) {
      if (seq === generation.current)
        T(
          e.message +
            " · Retry, or select Cached real OSM extract in Data source.",
        );
    } finally {
      if (seq === generation.current) B(false);
    }
  }
  async function discover() {
    clear();
    const seq = generation.current;
    B(true);
    let total = route.segments,
      merged = new Map(),
      failed = [],
      success = 0;
    for (let i = 0; i < total; i++) {
      if (seq !== generation.current) return;
      setSearchSection(i + 1);
      T("Searching section " + (i + 1) + " of " + total + "…");
      try {
        const result = await api(
          "segment?" +
            new URLSearchParams({ id: route.id, mode, km, index: String(i) }),
        );
        if (seq !== generation.current) return;
        for (const r of result.records) {
          const old = merged.get(r.id);
          if (!old || r.offset < old.offset) merged.set(r.id, r);
        }
        success++;
        Z(result.time);
      } catch (e) {
        if (seq !== generation.current) return;
        failed.push(i + 1 + " (" + e.message + ")");
        if (mode === "live" && success === 0) {
          failed.push("remaining sections unqueried");
          break;
        }
      }
    }
    if (seq !== generation.current) return;
    F([...merged.values()].sort((a, b) => a.along - b.along));
    B(false);
    T(
      success +
        "/" +
        total +
        " sections searched within " +
        km +
        " km. " +
        (failed.length
          ? "Failed: " + failed.join(", ")
          : "Entire selected road examined.") +
        " " +
        merged.size +
        " matching OSM records.",
    );
    H((n) => n + 1);
  }
  useEffect(() => {
    if (!detail) return;
    const previous = document.activeElement as HTMLElement;
    const close = () => S(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      if (event.key === "Tab") {
        const targets = Array.from(
          document.querySelectorAll<HTMLElement>(
            ".detail-drawer button,.detail-drawer input,.detail-drawer select,.detail-drawer textarea,.detail-drawer a",
          ),
        ).filter(
          (el) => el.getClientRects().length && !el.hasAttribute("disabled"),
        );
        const first = targets[0],
          last = targets.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        }
        if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.querySelector<HTMLElement>(".detail-drawer .close")?.focus();
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [detail?.id]);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting) setActive(entry.target.id);
      },
      { rootMargin: "-10% 0px -65% 0px" },
    );
    document
      .querySelectorAll("[data-nav-section]")
      .forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [route?.id]);
  function locate(r) {
    S(r);
    map.current.locate(r.xy, r.tags.name || r.kind);
  }
  const confirmed = rows.filter((r) => rank(r) < 2).length;
  const navItems = [
    ["route-planner", "Route planner", Route],
    ["services", "Services", MapPin],
    ["itinerary", "My itinerary", CalendarDays],
    ["tour", "Tour simulation", Play],
    ["faculty", "Faculty review", ShieldCheck],
  ];
  return (
    <div className="app-shell">
      <a className="skip-link" href="#route-planner">
        Skip to journey
      </a>
      <nav className="sidebar" aria-label="Workspace">
        <a className="brand" href="#route-planner">
          <span className="brand-mark">
            <Route size={23} />
          </span>
          fieldtrip<span className="brand-dot">.</span>
        </a>
        <div className="workspace-label">TRIP WORKSPACE</div>
        <div className="side-links">
          {navItems.map(([id, label, Icon]: any) => (
            <a
              key={id}
              href={"#" + id}
              className={active === id ? "active" : ""}
              onClick={() => setActive(id)}
            >
              <Icon size={19} />
              <span>{label}</span>
              {id === "services" && rows.length > 0 && <b>{rows.length}</b>}
            </a>
          ))}
        </div>
        <div className="sidebar-bottom">
          <div className="data-note">
            <Layers size={19} />
            <div>
              <strong>Open map data</strong>
              <p>Powered by OpenStreetMap</p>
            </div>
          </div>
          <div className="workspace-person">
            <span>FT</span>
            <div>
              <strong>Faculty workspace</strong>
              <small>Educational trip planning</small>
            </div>
          </div>
        </div>
      </nav>
      <div className="app-body">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <ChevronRight size={14} />
            <strong>Trip planning</strong>
          </div>
          <span className="source-pill">
            <span />
            {mode === "snapshot" ? "Cached real data" : "Live data mode"}
          </span>
        </header>
        <main>
          <section className="intro" id="route-planner" data-nav-section>
            <div>
              <span className="eyebrow">JOURNEY OVERVIEW</span>
              <h1>
                Nagercoil <ArrowRight aria-label="to" /> {dest}
              </h1>
              <p>Plan the road ahead. Keep essential services within reach.</p>
            </div>
            <a href="#tour" className="button primary">
              <Play size={16} /> Tour simulation
            </a>
          </section>
          <div className="metrics">
            <div>
              <span className="metric-icon">
                <Route />
              </span>
              <div>
                <span>Route distance</span>
                <strong>
                  {route ? (route.distance / 1000).toFixed(1) : "—"}{" "}
                  <small>km</small>
                </strong>
              </div>
            </div>
            <div>
              <span className="metric-icon">
                <Clock3 />
              </span>
              <div>
                <span>Estimated driving</span>
                <strong>
                  {route ? Math.round(route.duration / 60) : "—"}{" "}
                  <small>min</small>
                </strong>
              </div>
            </div>
            <div>
              <span className="metric-icon">
                <MapPin />
              </span>
              <div>
                <span>Services discovered</span>
                <strong>
                  {rows.length.toLocaleString()} <small>on corridor</small>
                </strong>
              </div>
            </div>
            <div>
              <span className="metric-icon">
                <ShieldCheck />
              </span>
              <div>
                <span>Verified / partially verified</span>
                <strong>
                  {confirmed} <small>of {rows.length}</small>
                </strong>
              </div>
            </div>
          </div>
          <details className="preferences-panel">
            <summary>
              <SlidersHorizontal size={18} />
              <strong>Journey preferences</strong>
              <span>Choose your vehicle, priority and search radius</span>
              <ChevronRight size={17} />
            </summary>
            <RouteQuestions
              routes={routes}
              choose={(i) => {
                clear();
                P([]);
                I(i);
              }}
              setRadius={K}
            />
          </details>
          <div className="workspace">
            <section className="controls">
              <div className="section-heading">
                <h2>Plan your route</h2>
                <Route size={19} />
              </div>
              <div className="location-fields">
                <label>
                  Starting point
                  <input
                    value={(mode === "live" && custom.from) || "Nagercoil"}
                    readOnly
                  />
                </label>
                <label>
                  Destination
                  <select
                    aria-label="Destination"
                    value={dest}
                    onChange={(e) => {
                      endpoints();
                      U({ ...custom, to: "" });
                      D(e.target.value);
                    }}
                  >
                    <option>Tirunelveli</option>
                    <option>Bengaluru</option>
                  </select>
                </label>
              </div>
              <button
                className="load-route"
                onClick={loadRoutes}
                disabled={busy}
              >
                Load driving routes <ArrowRight size={16} />
              </button>
              {mode === "live" && (
                <div className="map-pickers">
                  {["from", "to"].map((k) => (
                    <button
                      key={k}
                      onClick={() => {
                        T("Click map to set " + k);
                        action.current = (xy) => {
                          endpoints();
                          U({ ...custom, [k]: xy.join(",") });
                          T("Updated " + k + " coordinates");
                        };
                      }}
                    >
                      Pick {k} on map
                    </button>
                  ))}
                  <p>{custom.to}</p>
                </div>
              )}
              {route && (
                <>
                  <label>
                    Selected road
                    <select
                      value={idx}
                      onChange={(e) => {
                        clear();
                        P([]);
                        I(+e.target.value);
                      }}
                    >
                      {routes.map((r, i) => (
                        <option key={r.id} value={i}>
                          Route {i + 1} · {(r.distance / 1000).toFixed(1)} km ·{" "}
                          {Math.round(r.duration / 60)} min
                        </option>
                      ))}
                    </select>
                  </label>
                  {routes.length > 1 && (
                    <details>
                      <summary>Compare routes</summary>
                      <label>
                        Route priority
                        <select
                          value={compare}
                          onChange={(e) => CP(e.target.value)}
                        >
                          <option>Balanced</option>
                          <option>Shortest time</option>
                          <option>Shortest distance</option>
                        </select>
                      </label>
                      {routeScores(routes, compare).map((r) => (
                        <button
                          key={r.i}
                          onClick={() => {
                            clear();
                            P([]);
                            I(r.i);
                          }}
                        >
                          Route {r.i + 1} · {Math.round(r.score * 100)}/100
                        </button>
                      ))}
                    </details>
                  )}
                  <label>
                    Search distance from road
                    <div className="input-unit">
                      <input
                        aria-label="Corridor radius (km)"
                        type="number"
                        min=".1"
                        max="10"
                        step=".1"
                        value={km}
                        onChange={(e) => {
                          clear();
                          K(e.target.value);
                        }}
                      />
                      <span>km</span>
                    </div>
                  </label>
                  <div className="radius-options">
                    {["1", "3", "5"].map((value) => (
                      <button
                        key={value}
                        aria-pressed={km === value}
                        onClick={() => {
                          clear();
                          K(value);
                        }}
                      >
                        {value} km
                      </button>
                    ))}
                  </div>
                  <button
                    className="primary search-button"
                    disabled={busy || !(+km > 0 && +km <= 10)}
                    onClick={discover}
                  >
                    {busy && searchSection ? <LoaderCircle className="search-spinner" size={17} /> : <Search size={17} />}
                    <span>{busy && searchSection ? "Searching corridor…" : "Search entire corridor"}</span>
                  </button>
                </>
              )}
              <details className="source-control">
                <summary>
                  Data source{" "}
                  <span>
                    {mode === "snapshot" ? "Offline extract" : "Live services"}
                  </span>
                </summary>
                {standalone ? <p>Routes and places come from the bundled OpenStreetMap extract. Live corridor searches require the server app.</p> : <label>
                  Data source
                  <select
                    value={mode}
                    onChange={(e) => {
                      endpoints();
                      M(e.target.value);
                    }}
                  >
                    <option value="snapshot">Cached real OSM extract</option>
                    <option value="live">Live OSRM + Overpass</option>
                  </select>
                </label>}
              </details>
            </section>
            <section className="mapwrap" aria-label="Journey map">
              <div className="map-toolbar">
                <span>
                  <span className="live-dot" />{" "}
                  {mode === "snapshot" ? "Offline road map" : "Route map"}
                </span>
                <div>
                  <label>
                    <input
                      type="checkbox"
                      checked={tiles}
                      onChange={(e) => Y(e.target.checked)}
                    />{" "}
                    Street map tiles (online)
                  </label>
                  <button
                    aria-label="Fit route to map"
                    onClick={() => map.current?.fit()}
                  >
                    <LocateFixed size={18} />
                  </button>
                </div>
              </div>
              <div className="map-stage">
                <div ref={host} className="map"></div>
                {busy && searchSection > 0 && (
                  <div className="map-search-progress">
                    <span><LoaderCircle className="search-spinner" size={15} /> Searching section {searchSection} of {route.segments}</span>
                    <progress max={route.segments} value={searchSection} aria-label="Corridor section being searched" />
                  </div>
                )}
              </div>
              <div className="map-caption">
                <span>
                  <span className="route-swatch" />
                  Selected driving route
                </span>
                <span>★ Planned stop</span>
                <span>
                  <MapPin size={14} />
                  {visible.length} services shown
                </span>
              </div>
            </section>
          </div>
          <div className={"coverage-strip " + (busy ? "is-loading" : "")}>
            <span className="coverage-icon">
              {busy ? <Clock3 size={19} /> : <CircleCheck size={19} />}
            </span>
            <div>
              <p role="status">{status || "Choose your route to begin."}</p>
              {stamp && <small>OSM source date · {stamp}</small>}
            </div>
            <a href="#services">
              View services <ArrowRight size={16} />
            </a>
          </div>
          <section id="services" data-nav-section className="services-section">
            <div className="section-heading">
              <div>
                <span className="eyebrow">ALONG YOUR ROUTE</span>
                <h2>
                  Essential services <em>{rows.length}</em>
                </h2>
                <p>
                  Explore each category. Faculty-reviewed records appear first.
                </p>
              </div>
              <div className="filter-actions">
                <button onClick={() => C(groups)}>Show all</button>
                <button onClick={() => C([])}>Hide all</button>
              </div>
            </div>
            <div className="filters">
              {groups.map((g) => (
                <label
                  key={g}
                  className={filters.includes(g) ? "selected" : ""}
                  style={
                    { "--category-color": colors[g] } as React.CSSProperties
                  }
                >
                  <input
                    type="checkbox"
                    checked={filters.includes(g)}
                    onChange={() =>
                      C(
                        filters.includes(g)
                          ? filters.filter((h) => h !== g)
                          : [...filters, g],
                      )
                    }
                  />
                  <CategoryIcon group={g} />
                  <span>{categoryNames[g]}</span>
                  <b>{rows.filter((r) => r.group === g).length}</b>
                </label>
              ))}
            </div>
            <div className="directory-tools">
              <label className="search-field">
                <Search size={18} />
                <input
                  aria-label="Search directory"
                  value={search}
                  placeholder="Search a place, service type or OSM ID"
                  onChange={(e) => Q(e.target.value)}
                />
              </label>
              <label className="verified-filter">
                <input
                  type="checkbox"
                  checked={trustedOnly}
                  onChange={(e) => setTrustedOnly(e.target.checked)}
                />
                <ShieldCheck size={16} /> Show only Verified and Partially
                Verified
              </label>
            </div>
            {!rows.length && (
              <div className="empty-state">
                <MapPin size={28} />
                <h3>Your route's services will appear here</h3>
                <p>
                  Search the corridor to discover facilities along the entire
                  road.
                </p>
              </div>
            )}
            {rows.length > 0 && !visible.length && (
              <div className="empty-state">
                <Search size={28} />
                <h3>No matching services</h3>
                <p>
                  {trustedOnly
                    ? "No verified or partially verified records match. Clear this filter to inspect available OSM services."
                    : "Adjust the categories or search text to see matching places."}
                </p>
                <button
                  onClick={() => {
                    C(groups);
                    Q("");
                    setTrustedOnly(false);
                  }}
                >
                  Reset filters
                </button>
              </div>
            )}
            {groups
              .filter((g) => filters.includes(g))
              .map((g) => {
                const items = visible.filter((r) => r.group === g);
                if (!items.length) return null;
                return (
                  <details
                    className="service-group"
                    key={g}
                    open={g === "Healthcare"}
                    style={
                      { "--category-color": colors[g] } as React.CSSProperties
                    }
                  >
                    <summary>
                      <span className="category-symbol">
                        <CategoryIcon group={g} />
                      </span>
                      <strong>
                        {g} · {items.length}
                      </strong>
                      <span className="group-description">
                        {g === "Healthcare"
                          ? "Hospitals, clinics & pharmacies"
                          : categoryNames[g]}
                      </span>
                      <ChevronRight size={18} />
                    </summary>
                    <div className="cards">
                      {items.map((r) => (
                        <button
                          className="service-card"
                          key={r.id}
                          onClick={() => locate(r)}
                        >
                          <div className="card-top">
                            <span className="service-type">
                              {r.kind.replaceAll("_", " ")}
                            </span>
                            <ArrowUpRight size={16} />
                          </div>
                          <b>
                            {r.tags.name ||
                              "Unnamed " + r.kind.replaceAll("_", " ")}
                          </b>
                          <span className="road-distance">
                            <MapPin size={13} />
                            {Math.round(r.offset)} m from road
                          </span>
                          <VerificationBadge status={reviews[r.id]?.status} />
                        </button>
                      ))}
                    </div>
                  </details>
                );
              })}
            <p className="data-disclaimer">
              <Layers size={14} />
              OpenStreetMap coverage varies. Missing records can mean unmapped
              facilities. Distances shown are straight-line offsets from the
              road.
            </p>
          </section>
          {route && (
            <Extras
              key={route.id}
              {...{
                api,
                route,
                rows,
                serial,
                planned,
                P,
                action,
                locate,
                reviews,
                mode,
                dest,
                km,
              }}
            />
          )}
          {route && (
            <GuidedTour
              key={"tour-" + route.id}
              {...{ route, rows, reviews, map, planned, api }}
              destination={dest}
            />
          )}
          <section id="faculty" data-nav-section className="faculty-panel">
            {!standalone && <FacultyAccount api={api} />}
            <div className="section-heading">
              <div>
                <span className="eyebrow">FACULTY WORKSPACE</span>
                <h2>Review with confidence</h2>
                <p>
                  {standalone
                    ? "Inspect the source details of each facility here. Sign in to the server app to record verification evidence."
                    : "Inspect source details and record the evidence behind each verification."}
                </p>
              </div>
              <span className="feature-icon">
                <ShieldCheck size={26} />
              </span>
            </div>
            <div className="formgrid">
              <label>
                Review queue
                <select
                  value={reviewFilter}
                  onChange={(e) => RF(e.target.value)}
                >
                  {[
                    "All statuses",
                    "Not Verified",
                    "Verification in Progress",
                    "Partially Verified",
                    "Verified",
                    "Recheck Required",
                  ].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label>
                Inspect a corridor record
                <select
                  value=""
                  onChange={(e) => {
                    const r = rows.find((r) => r.id === e.target.value);
                    if (r) locate(r);
                  }}
                >
                  <option value="">Select a facility</option>
                  {rows
                    .filter(
                      (r) =>
                        reviewFilter === "All statuses" ||
                        (reviews[r.id]?.status || "Not Verified") ===
                          reviewFilter,
                    )
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.tags.name || r.kind} · {r.id}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <div className="verification-key">
              <VerificationBadge status="Verified" />
              <span>Evidence recorded</span>
              <VerificationBadge status="Partially Verified" />
              <span>Some details confirmed</span>
              <VerificationBadge />
              <span>Requires faculty review</span>
            </div>
          </section>
        </main>
        <footer>
          <span>
            fieldtrip. <span>Thoughtful journeys, informed decisions.</span>
          </span>
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noreferrer"
          >
            © OpenStreetMap contributors · ODbL
          </a>
        </footer>
      </div>
      {detail && (
        <div className="drawer-overlay" onClick={() => S(null)}>
          <aside
            className="detail-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="detail-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="drawer-top">
              <span
                className="category-symbol"
                style={{ color: colors[detail.group] }}
              >
                <CategoryIcon group={detail.group} />
              </span>
              <span>{categoryNames[detail.group]}</span>
              <button
                className="close"
                onClick={() => S(null)}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>
            <h2 id="detail-title">
              {detail.tags.name || "Unnamed " + detail.kind}
            </h2>
            <VerificationBadge status={reviews[detail.id]?.status} />
            <div className="detail-facts">
              <div>
                <MapPin size={18} />
                <span>
                  {Math.round(detail.offset)} m from route
                  <small>{detail.kind.replaceAll("_", " ")}</small>
                </span>
              </div>
              <div>
                <Phone size={18} />
                <span>
                  {detail.tags.phone ||
                    detail.tags["contact:phone"] ||
                    "Phone unknown"}
                </span>
              </div>
              <div>
                <Clock3 size={18} />
                <span>
                  {detail.tags.opening_hours || "Opening hours unknown"}
                </span>
              </div>
            </div>
            <a
              className="source-link"
              href={"https://www.openstreetmap.org/" + detail.id}
              target="_blank"
              rel="noreferrer"
            >
              Open source record · {detail.id}
              <ArrowUpRight size={15} />
            </a>
            <Review
              key={detail.id}
              {...{ api, detail, planned, P, reviews, reload }}
            />
          </aside>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
