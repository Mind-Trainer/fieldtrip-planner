import { standalone } from "./runtime";
import React, { useEffect, useMemo, useState, useRef } from "react";
import { distance } from "../core.mjs";
import { nearby, routeScores } from "../planning.mjs";
import {
  Play,
  Pause,
  RotateCcw,
  Car,
  ShieldAlert,
  CircleCheck,
  MapPin,
  ArrowRight,
  Check,
} from "lucide-react";
import { journeyMap } from "./map";
import { VerificationBadge } from "./ui";
export function GuidedTour({
  route,
  rows,
  reviews,
  map,
  planned,
  destination,
  api,
}) {
  const miniHost = useRef(null),
    miniMap = useRef(null);
  useEffect(() => {
    miniMap.current = journeyMap(
      miniHost.current,
      () => {},
      () => {},
    );
    miniMap.current.route(route);
    miniMap.current.vehicle(route.line[0]);
    return () => miniMap.current?.destroy();
  }, [route.id]);
  const [progress, setProgress] = useState(0),
    [state, setState] = useState("Ready"),
    [event, setEvent] = useState("Medical"),
    [selected, select] = useState(null);
  const [driving, setDriving] = useState(""),
    [checking, setChecking] = useState(false);
  const driveRequest = useRef(0);
  useEffect(() => {
    driveRequest.current++;
    setDriving("");
    setChecking(false);
  }, [selected?.id, progress]);
  const track = useMemo(() => {
    let total = 0;
    return route.line.map((xy, i) => {
      if (i) total += distance(route.line[i - 1], xy);
      return { xy, total };
    });
  }, [route]);
  const length = track.at(-1).total;
  const travelled = length * (progress / 100);
  const next = Math.max(1, track.findIndex((p) => p.total >= travelled));
  const from = track[next - 1], to = track[next] || from;
  const fraction = (travelled - from.total) / (to.total - from.total || 1);
  const point = from.xy.map((value, axis) => value + (to.xy[axis] - value) * fraction);
  const heading = Math.atan2(
    (to.xy[0] - from.xy[0]) * Math.cos(point[1] * Math.PI / 180),
    to.xy[1] - from.xy[1],
  ) * 180 / Math.PI;
  useEffect(() => {
    if (state !== "Travelling") return;
    const timer = setInterval(
      () => setProgress((p) => Math.min(100, (Math.round(p * 5) + 1) / 5)),
      140,
    );
    return () => clearInterval(timer);
  }, [state]);
  useEffect(() => {
    if (progress === 100) setState("Tour completed");
    miniMap.current?.vehicle(point, heading, state === "Travelling");
    map.current?.vehicle(point, heading, state === "Travelling");
  }, [progress, state, route]);
  useEffect(() => {
    setProgress(0);
    setState("Ready");
    select(null);
  }, [route.id, rows]);
  const alternatives = state === "Emergency" ? nearby(rows, point, event) : [];
  const stops = useMemo(() => rows.filter((r) => planned.includes(r.id)), [rows, planned]);
  const stopsPassed = stops.filter((r) => r.along <= travelled).length;
  return (
    <section id="tour" data-nav-section data-travelling={state === "Travelling"} className="tour-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">REHEARSE THE JOURNEY</span>
          <h2>Tour simulation</h2>
          <p>
            Practice travel, planned stops and an emergency response on your
            actual route.
          </p>
        </div>
        <span
          className={
            "tour-state " +
            (state === "Emergency"
              ? "alert"
              : state === "Tour completed"
                ? "completed"
                : "")
          }
        >
          <span />
          {state}
        </span>
      </div>
      <div className="tour-workspace">
        <div className="tour-map-panel">
          <div ref={miniHost} className="map tour-map" />
          <div className="tour-map-label">
            <Car size={15} /> Simulated movement · Real OSM road
          </div>
        </div>
        <div className="tour-console">
          <div className="tour-route">
            <span>
              <b>A</b>Nagercoil
            </span>
            <ArrowRight size={16} />
            <span>
              <b>B</b>
              {destination}
            </span>
          </div>
          <div className="tour-percentage">
            <strong>
              {Math.floor(progress)}
              <span>%</span>
            </strong>
            <span>
              {((length * progress) / 100 / 1000).toFixed(1)} km travelled
              <br />
              <small>of {(length / 1000).toFixed(1)} km</small>
            </span>
          </div>
          <div className="journey-timeline">
            <progress max="100" value={progress} aria-label="Journey completion" />
            {stops.map((r) => (
              <span key={r.id} className="timeline-stop"
                style={{ left: Math.min(100, 100 * r.along / (length || 1)) + "%" }}
                title={r.tags.name || r.kind} />
            ))}
            <span className="timeline-car" aria-hidden="true" style={{ left: progress + "%" }}>
              <Car size={16} />
            </span>
          </div>
          <div className="tour-stats">
            <span>
              <MapPin size={15} />
              {stopsPassed} / {planned.length} planned stops passed
            </span>
            <span aria-live="polite">{state}</span>
          </div>
          <div className="tour-buttons">
            <button
              className="primary"
              disabled={
                !rows.length || state === "Emergency" || progress === 100
              }
              onClick={() =>
                setState(state === "Travelling" ? "Paused" : "Travelling")
              }
            >
              {state === "Travelling" ? (
                <Pause size={15} />
              ) : (
                <Play size={15} />
              )}
              <span>
                {state === "Travelling" ? "Pause tour" : "Start / resume tour"}
              </span>
            </button>
            <button
              onClick={() => {
                setProgress(0);
                setState("Ready");
                select(null);
              }}
              aria-label="Reset tour"
            >
              <RotateCcw size={16} />
            </button>
          </div>
          <label className="scrubber">
            Move to a point on the journey
            <input
              aria-label="Tour progress"
              type="range"
              min="0"
              max="100"
              value={progress}
              disabled={state === "Emergency"}
              onChange={(e) => {
                setState("Paused");
                setProgress(+e.target.value);
              }}
            />
          </label>
          {!rows.length && (
            <p className="hint">Search your corridor to enable the tour.</p>
          )}
          {state === "Tour completed" && (
            <div className="completion-message">
              <CircleCheck size={19} />
              <p>
                Demonstration complete. The simulated vehicle reached the
                destination.
              </p>
            </div>
          )}
        </div>
      </div>
      <div className="emergency-launch">
        <div>
          <span className="emergency-icon">
            <ShieldAlert size={22} />
          </span>
          <div>
            <h3>Practice an emergency response</h3>
            <p>Pause the tour and find assistance near the vehicle.</p>
          </div>
        </div>
        <label>
          Emergency type
          <select
            value={event}
            onChange={(e) => {
              setEvent(e.target.value);
              select(null);
            }}
          >
            <option>Medical</option>
            <option>Mechanics</option>
            <option>Police</option>
            <option>Supplies</option>
          </select>
        </label>
        <button
          className="danger-button"
          disabled={!rows.length || progress === 100}
          onClick={() => {
            setState("Emergency");
            select(null);
          }}
        >
          <ShieldAlert size={16} />
          Trigger emergency
        </button>
      </div>
      {state === "Emergency" && (
        <div className="emergency">
          <div className="emergency-heading">
            <h3>Journey paused for assistance</h3>
            <button onClick={() => {
              select(null);
              setState("Paused");
              miniMap.current.fit();
            }}>Exit emergency drill</button>
          </div>
          <div className="response-steps">
            <span className="done">
              <Check size={13} />
              Journey paused
            </span>
            <span className={selected ? "done" : "current"}>
              <MapPin size={13} />
              Choose assistance
            </span>
            <span>
              <CircleCheck size={13} />
              Resolve & resume
            </span>
          </div>
          <p>
            In a real emergency call <a href="tel:112">112</a>. Review the
            facility's recorded details before deciding. Distances below are
            straight-line estimates.
          </p>
          <label>
            Choose an assistance facility
            <select
              value={selected?.id || ""}
              onChange={(e) => {
                const r = alternatives.find((r) => r.id === e.target.value);
                select(r);
                if (r) {
                  miniMap.current.locate(r.xy, r.tags.name || r.kind);
                  map.current.locate(r.xy, r.tags.name || r.kind);
                }
              }}
            >
              <option value="">
                Select a facility ({alternatives.length} available)
              </option>
              {alternatives.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.tags.name || r.kind} · {(r.air / 1000).toFixed(1)} km ·{" "}
                  {reviews[r.id]?.status || "Not Verified"}
                </option>
              ))}
            </select>
          </label>
          {selected && (
            <div className="assistance-card">
              <div>
                <h3>{selected.tags.name || selected.kind}</h3>
                <VerificationBadge status={reviews[selected.id]?.status} />
                <p>
                  {planned.includes(selected.id)
                    ? "Scheduled stop"
                    : "Discovered emergency alternative"}{" "}
                  · {(selected.air / 1000).toFixed(1)} km away
                </p>
                <p>
                  Phone ·{" "}
                  {selected.tags.phone ||
                    selected.tags["contact:phone"] ||
                    "Unknown"}
                  <br />
                  Emergency department ·{" "}
                  {reviews[selected.id]?.department || "Unknown"}
                </p>
              </div>
              <div>
                {!standalone && <button
                  disabled={checking}
                  onClick={async () => {
                    const request = ++driveRequest.current;
                    setChecking(true);
                    try {
                      const result = await api(
                        "drive?" +
                          new URLSearchParams({
                            from: point.join(","),
                            to: selected.xy.join(","),
                          }),
                      );
                      if (request === driveRequest.current)
                        setDriving(
                          (result.distance / 1000).toFixed(1) +
                            " km by road · " +
                            Math.round(result.duration / 60) +
                            " min estimated",
                        );
                    } catch (error) {
                      if (request === driveRequest.current)
                        setDriving(error.message);
                    } finally {
                      if (request === driveRequest.current) setChecking(false);
                    }
                  }}
                >
                  {checking ? "Checking route…" : "Calculate driving route"}
                </button>}
                <p aria-live="polite">{driving}</p>
                <a
                  target="_blank"
                  rel="noreferrer"
                  href={
                    "https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=" +
                    point[1] +
                    "," +
                    point[0] +
                    ";" +
                    selected.xy[1] +
                    "," +
                    selected.xy[0]
                  }
                >
                  Open driving directions
                </a>
              </div>
              <button
                className="primary"
                onClick={() => {
                  setState("Paused");
                  select(null);
                  miniMap.current.fit();
                }}
              >
                <Check size={16} />
                Simulate assistance completed
              </button>
            </div>
          )}
          {!alternatives.length && (
            <p>
              No matching records in this corridor dataset. Contact official
              emergency services.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

export function RouteQuestions({ routes, choose, setRadius }) {
  const [priority, P] = useState("Balanced"),
    [radius, R] = useState("3"),
    [vehicle, V] = useState("Car"),
    [message, M] = useState("");
  return (
    <section>
      <h2>Choose your journey</h2>
      <p className="hint">
        Your answers guide the route recommendation and service search.
      </p>
      <div className="formgrid">
        <label>
          Which vehicle will you use?
          <select value={vehicle} onChange={(e) => V(e.target.value)}>
            <option>Car</option>
            <option>Bus</option>
            <option>Van</option>
          </select>
        </label>
        <label>
          What matters most?
          <select value={priority} onChange={(e) => P(e.target.value)}>
            <option>Balanced</option>
            <option>Shortest time</option>
            <option>Shortest distance</option>
          </select>
        </label>
        <label>
          How far from the road should services be searched?
          <select value={radius} onChange={(e) => R(e.target.value)}>
            <option value="1">Within 1 km</option>
            <option value="3">Within 3 km</option>
            <option value="5">Within 5 km</option>
          </select>
        </label>
      </div>
      <button
        className="primary"
        disabled={!routes.length}
        onClick={() => {
          if (vehicle !== "Car") {
            M(
              "Vehicle-specific routing is currently available for cars. Select Car to continue.",
            );
            return;
          }
          const best = routeScores(routes, priority)[0];
          choose(best.i);
          setRadius(radius);
          M(
            routes.length === 1
              ? "The provider returned one road route. Selected it with your service radius. Search the corridor below."
              : "Selected route " +
                  (best.i + 1) +
                  " using your " +
                  priority.toLowerCase() +
                  " preference. Search the corridor below.",
          );
        }}
      >
        Apply answers and select route
      </button>
      <p>{message}</p>
    </section>
  );
}
