import { standalone } from "./runtime";
import {
  CalendarDays,
  Route,
  MapPin,
  ArrowRight,
  ShieldAlert,
  CircleCheck,
} from "lucide-react";
import { VerificationBadge } from "./ui";
import type { Facility } from "./types";
import React, { useEffect, useState } from "react";
import { recommendations, nearby } from "../planning.mjs";
const defaults = {
  students: 1,
  faculty: 1,
  departure: "",
  priority: "Balanced",
  category: "Food",
  breaks: 1,
  maxOffset: 3,
  access: false,
  veg: false,
  efficiency: "",
  price: "",
  notes: "",
};
const states = [
  "Not Verified",
  "Verification in Progress",
  "Partially Verified",
  "Verified",
  "Recheck Required",
];
function post(body, key = "") {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-faculty-key": key },
    body: JSON.stringify(body),
  };
}
export function Review({ api, detail, planned, P, reviews, reload }) {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    if (standalone) return;
    const refresh = () =>
      api("faculty/session")
        .then((s) => setSignedIn(!!s.authenticated))
        .catch(() => {});
    refresh();
    window.addEventListener("faculty-session-changed", refresh);
    return () => window.removeEventListener("faculty-session-changed", refresh);
  }, []);
  const prior = reviews[detail.id],
    [status, S] = useState(prior?.status || states[0]),
    [dept, D] = useState(prior?.department || "Unknown"),
    [evidence, E] = useState(""),
    [notes, N] = useState(""),
    [key, K] = useState(""),
    [msg, M] = useState(""),
    [history, H] = useState([]);
  async function historyLoad() {
    H(await api("history?id=" + encodeURIComponent(detail.id)));
  }
  useEffect(() => {
    if (standalone) return;
    historyLoad().catch((e) => M(e.message));
  }, []);
  const phone = detail.tags.phone || detail.tags["contact:phone"];
  return (
    <>
      <p>
        Mapped location ·{" "}
        {detail.xy
          .slice()
          .reverse()
          .map((n) => n.toFixed(5))
          .join(", ")}
        <br />
        Faculty status · {prior?.status || states[0]}
        {detail.kind === "hospital" && (
          <>
            <br />
            Emergency department · {prior?.department || "Unknown"}
          </>
        )}
      </p>
      {phone && /^[+\d ()-]+$/.test(phone) && (
        <p>
          <a href={"tel:" + phone.replace(/[ ()-]/g, "")}>Call listed number</a>
        </p>
      )}
      <button
        onClick={() =>
          P(
            planned.includes(detail.id)
              ? planned.filter((id) => id !== detail.id)
              : [...planned, detail.id],
          )
        }
      >
        {planned.includes(detail.id)
          ? "Remove planned stop"
          : "Add planned stop"}
      </button>
      {!standalone && <details>
        <summary>Faculty verification</summary>
        {!signedIn && (
          <p>
            Use Faculty review to create an account or sign in. The server key
            remains available as an alternative.
          </p>
        )}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api(
                "reviews",
                post(
                  {
                    facility: detail.id,
                    status,
                    department: dept,
                    evidence,
                    notes,
                  },
                  key,
                ),
              );
              await reload();
              await historyLoad();
              M("Verification recorded");
              K("");
            } catch (err) {
              M(err.message);
            }
          }}
        >
          {!signedIn && (
            <label>
              Faculty key (or sign in from Faculty review)
              <input
                required
                type="password"
                value={key}
                onChange={(e) => K(e.target.value)}
              />
            </label>
          )}
          <label>
            Status
            <select
              aria-label="Status"
              value={status}
              onChange={(e) => S(e.target.value)}
            >
              {states.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          {detail.kind === "hospital" && (
            <label>
              Emergency department
              <select value={dept} onChange={(e) => D(e.target.value)}>
                {["Unknown", "Confirmed operating", "Reported unavailable"].map(
                  (s) => (
                    <option key={s}>{s}</option>
                  ),
                )}
              </select>
            </label>
          )}
          <label>
            Evidence or confirmation method
            <input
              required
              value={evidence}
              onChange={(e) => E(e.target.value)}
            />
          </label>
          <label>
            Faculty notes
            <textarea value={notes} onChange={(e) => N(e.target.value)} />
          </label>
          <button>Record verification</button>
        </form>
        <p>{msg}</p>
        <h3>Edit history</h3>
        {history.map((r) => (
          <p key={r.id}>
            {r.time} UTC · {r.status} · {r.evidence} · {r.department} ·{" "}
            {r.notes}
          </p>
        ))}
      </details>}
    </>
  );
}
export function Extras({
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
}) {
  const [prefs, U] = useState(defaults),
    [msg, M] = useState(""),
    [scores, A] = useState([]),
    [point, X] = useState(null),
    [group, G] = useState("Medical"),
    [drive, D] = useState(""),
    [awaiting, W] = useState(false),
    [ep, EP] = useState(0);
  const set = (key, value) => {
    U({ ...prefs, [key]: value });
    A([]);
  };
  useEffect(() => {
    let current = true;
    api("trip/" + route.id)
      .then((data) => {
        if (current && data.prefs) {
          U({ ...defaults, ...data.prefs });
          P(data.planned);
          M("Saved journey reopened");
        }
      })
      .catch((e) => M(e.message));
    return () => {
      current = false;
    };
  }, [route.id]);
  useEffect(() => {
    X(null);
    D("");
    W(false);
    EP(0);
    A([]);
  }, [rows]);
  const ranked = point ? nearby(rows, point, group) : [];
  const byId = new Map<string, Facility>(rows.map((r) => [r.id, r]));
  const fuel =
    Number(prefs.efficiency) > 0
      ? route.distance / 1000 / Number(prefs.efficiency)
      : 0;
  function simulate(xy) {
    X(xy);
    D("");
    W(false);
    EP(0);
    action.current = null;
  }
  return (
    <>
      <section id="itinerary" data-nav-section className="itinerary-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">MAKE IT YOUR JOURNEY</span>
            <h2>Trip questionnaire &amp; itinerary</h2>
          </div>
          <span className="feature-icon">
            <CalendarDays size={25} />
          </span>
        </div>
        <p>
          Car journey · {Math.round(route.duration / 60)} minutes estimated
          driving time
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api(
                "trip/" + route.id,
                post({ prefs, planned, mode, dest, km }),
              );
              M("Trip and planned stops saved");
            } catch (err) {
              M(err.message);
            }
          }}
        >
          <div className="formgrid">
            {Object.entries({
              departure: "Departure (local time)",
              students: "Students",
              faculty: "Faculty",
              breaks: "Number of planned breaks",
              maxOffset: "Maximum straight-line offset (km)",
              efficiency: "Vehicle efficiency (km/L)",
              price: "Fuel price (₹/L)",
            }).map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  type={key === "departure" ? "datetime-local" : "number"}
                  step={
                    ["efficiency", "price", "maxOffset"].includes(key)
                      ? ".1"
                      : "1"
                  }
                  min={key === "efficiency" ? ".1" : "0"}
                  max={key === "breaks" ? 12 : undefined}
                  value={prefs[key]}
                  onChange={(e) => set(key, e.target.value)}
                />
              </label>
            ))}
            {Object.entries({
              priority: ["Balanced", "Closest to road", "Verification first"],
              category: ["Food", "Fuel", "Lodging", "Supplies"],
            }).map(([key, opts]) => (
              <label key={key}>
                {key === "priority"
                  ? "Planning priority"
                  : "Break service category"}
                <select
                  value={prefs[key]}
                  onChange={(e) => set(key, e.target.value)}
                >
                  {opts.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <label>
            <input
              type="checkbox"
              checked={prefs.access}
              onChange={(e) => set("access", e.target.checked)}
            />{" "}
            Require wheelchair access tagged yes
          </label>
          <label>
            <input
              type="checkbox"
              checked={prefs.veg}
              onChange={(e) => set("veg", e.target.checked)}
            />{" "}
            Require tagged vegetarian food
          </label>
          <label>
            Additional preferences for faculty
            <textarea
              value={prefs.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </label>
          <button
            className="primary"
            type="button"
            disabled={!rows.length}
            onClick={() => {
              const rec = recommendations(rows, route, prefs, reviews);
              A(rec);
              P(rec.map((r) => r.id));
              M(rec.length + " eligible stops suggested");
            }}
          >
            Generate stop plan
          </button>{" "}
          <button className="save-journey">Save journey</button>
        </form>
        <p>{msg}</p>
        {fuel > 0 && (
          <p>
            Estimated fuel · {fuel.toFixed(1)} L{" "}
            {Number(prefs.price) > 0 &&
              " · ₹" + Math.round(fuel * Number(prefs.price))}
          </p>
        )}
        <details className="scoring-details">
          <summary>How stop recommendations are scored</summary>
          <p>
            Stops are scored on road proximity, spacing along the route and
            faculty verification. Balanced weights are 40/40/20. Closest to road
            uses 65/25/10. Verification first uses 20/20/60. Required access and
            diet tags exclude ineligible candidates.
          </p>
        </details>
        <h3 className="stops-heading">Planned stops · {planned.length}</h3>
        {!planned.length && (
          <div className="itinerary-empty">
            <Route size={22} />
            <p>Generate a stop plan or add a facility from the directory.</p>
          </div>
        )}
        {planned.map((id) => (
          <div className="stop-row" key={id}>
            <span className="stop-dot">
              <MapPin size={16} />
            </span>
            <button
              disabled={!byId.has(id)}
              onClick={() => locate(byId.get(id))}
            >
              {byId.get(id)?.tags.name || id}
            </button>{" "}
            {scores.find((r) => r.id === id)?.score != null &&
              "Score " + scores.find((r) => r.id === id).score + "/100"}{" "}
            <button onClick={() => P(planned.filter((v) => v !== id))}>
              Remove
            </button>
          </div>
        ))}
      </section>
      <section id="emergency" className="emergency-explorer">
        <div className="section-heading">
          <div>
            <span className="eyebrow">EXPLORE ASSISTANCE OPTIONS</span>
            <h2>Emergency simulation</h2>
          </div>
          <ShieldAlert size={24} />
        </div>
        <p>
          In an actual emergency in India, call <a href="tel:112">112</a>. A
          mapped hospital’s emergency capability requires confirmation.
        </p>
        <label>
          Assistance
          <select
            value={group}
            onChange={(e) => {
              G(e.target.value);
              D("");
              EP(0);
            }}
          >
            {["Medical", "Mechanics", "Police", "Supplies"].map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </label>
        <button
          disabled={!rows.length}
          onClick={() => {
            W(true);
            action.current = simulate;
            document.querySelector(".map").scrollIntoView({ block: "center" });
          }}
        >
          Choose simulation point on map
        </button>{" "}
        <button
          disabled={!rows.length}
          onClick={() => {
            let sum = 0;
            for (let i = 1; i < route.line.length; i++) {
              sum += distance(route.line[i - 1], route.line[i]);
              if (sum >= route.distance / 2 || i === route.line.length - 1) {
                simulate(route.line[i]);
                break;
              }
            }
          }}
        >
          Simulate at route midpoint
        </button>
        {awaiting && <p>Click the map to place the emergency.</p>}
        {point && (
          <>
            <p>
              {ranked.length} matching records near{" "}
              {point
                .slice()
                .reverse()
                .map((v) => v.toFixed(4))
                .join(", ")}
              . Ordered by straight-line distance.
            </p>
            {ranked.slice(ep * 8, ep * 8 + 8).map((r) => (
              <div className="emergency-result" key={r.id}>
                <button onClick={() => locate(r)}>
                  {r.tags.name || "Unnamed " + r.kind}
                </button>{" "}
                <span className="distance-chip">
                  {(r.air / 1000).toFixed(2)} km
                </span>
                <VerificationBadge status={reviews[r.id]?.status} />{" "}
                {planned.includes(r.id) ? "Planned stop" : "Unplanned service"}{" "}
                {standalone ? (
                  <a href={`https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${point[1]},${point[0]};${r.xy[1]},${r.xy[0]}`} target="_blank" rel="noreferrer">
                    Open driving directions
                  </a>
                ) : <button
                  onClick={async () => {
                    try {
                      const d = await api(
                        "drive?" +
                          new URLSearchParams({
                            from: point.join(","),
                            to: r.xy.join(","),
                          }),
                      );
                      D(
                        (r.tags.name || r.id) +
                          " · " +
                          (d.distance / 1000).toFixed(1) +
                          " km by road · " +
                          Math.round(d.duration / 60) +
                          " min",
                      );
                    } catch (e) {
                      D(e.message);
                    }
                  }}
                >
                  Check road distance online
                </button>}
              </div>
            ))}
            <button disabled={!ep} onClick={() => EP(ep - 1)}>
              Previous alternatives
            </button>{" "}
            <button
              disabled={(ep + 1) * 8 >= ranked.length}
              onClick={() => EP(ep + 1)}
            >
              More alternatives
            </button>
            <p>{drive}</p>
          </>
        )}
      </section>
    </>
  );
}
import { distance } from "../core.mjs";
