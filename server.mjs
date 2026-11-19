import { tripModules } from "./modules.mjs";
import * as http from "node:http";
http.setGlobalProxyFromEnv?.();
import express from "express";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, mkdirSync, existsSync } from "node:fs";
import { randomBytes, createHash } from "node:crypto";
import { split, bounds, scan, query, distance } from "./core.mjs";
import { setTimeout as delay } from "node:timers/promises";
if (existsSync(".env")) process.loadEnvFile(".env");
const app = express();
app.use(express.json({ limit: "32kb" }));
app.use("/api", (req, res, next) => {
  if (
    req.method !== "GET" &&
    req.headers.origin &&
    new URL(req.headers.origin).host !== req.headers.host
  )
    return res.sendStatus(403);
  next();
});
const runtime = process.env.TRIP_DATA_DIR || "runtime";
mkdirSync(runtime, { recursive: true });
const db = new DatabaseSync(runtime + "/trips.sqlite");
db.exec(readFileSync("schema.sql", "utf8"));
const read = (k) => {
  let r = db.prepare("select value from store where key=?").get(k);
  return r && JSON.parse(r.value);
};
const save = (k, v) =>
  db
    .prepare("insert or replace into store values (?,?)")
    .run(k, JSON.stringify(v));
const routes = new Map(),
  cache = {};
const cities = {
  Nagercoil: [77.43, 8.179],
  Tirunelveli: [77.6926, 8.7139],
  Bengaluru: [77.5946, 12.9716],
};
function register(data, offline) {
  return data.routes.map((r) => {
    const id = createHash("sha256")
      .update(JSON.stringify(r.geometry.coordinates))
      .digest("hex");
    const parts = split(r.geometry.coordinates);
    let cumulative = 0;
    const starts = parts.map((part) => {
      const start = cumulative;
      for (let i = 1; i < part.length; i++)
        cumulative += distance(part[i - 1], part[i]);
      return start;
    });
    routes.set(id, {
      parts,
      starts,
      offline: offline || routes.get(id)?.offline,
    });
    return {
      id,
      segments: routes.get(id).parts.length,
      distance: r.distance,
      duration: r.duration,
      line: r.geometry.coordinates,
    };
  });
}
for (const [city, key] of [
  ["Tirunelveli", "short"],
  ["Bengaluru", "long"],
])
  cache[city] = register(
    JSON.parse(readFileSync("data/" + key + ".json")),
    true,
  );
const features = JSON.parse(readFileSync("data/facilities.json"));
const snapshot = JSON.parse(readFileSync("data/source.json"));
const pending = new Map();
const queues = new Map();
async function external(url, options = {}) {
  const key = "http:" + url + (options.body || ""),
    old = read(key);
  if (old && Date.now() - old.time < 86400000) return old;
  if (pending.has(key)) return pending.get(key);
  const host = new URL(url).host;
  let job = (queues.get(host) || Promise.resolve()).then(async () => {
    for (let n = 0; n < 2; n++) {
      await delay(n ? 3000 : 1100);
      let response;
      try {
        response = await fetch(url, {
          ...options,
          headers: { "User-Agent": "AcademicRoutePlanner/1.0" },
          signal: AbortSignal.timeout(20000),
        });
      } catch (error) {
        if (n === 0) continue;
        throw Error(
          "External service timed out or is unreachable. Use cached real data or retry later.",
        );
      }
      if ([429, 503].includes(response.status) && !n) {
        const retry = Number(response.headers.get("retry-after"));
        if (retry > 0 && retry <= 60) await delay(retry * 1000);
        else if (response.headers.has("retry-after"))
          throw Error("Provider requested a later retry");
        continue;
      }
      if (!response.ok) throw Error("Provider HTTP " + response.status);
      const data = await response.json();
      if (data.remark || (data.code && data.code !== "Ok"))
        throw Error(data.remark || data.message || data.code);
      const result = { data, time: Date.now() };
      save(key, result);
      return result;
    }
  });
  queues.set(
    host,
    job.catch(() => {}),
  );
  pending.set(key, job);
  try {
    return await job;
  } finally {
    pending.delete(key);
  }
}
app.get("/api/routes", async (req, res) => {
  const { destination, mode } = req.query;
  if (mode === "snapshot" && cache[destination])
    return res.json(cache[destination]);
  const coord = (s) => {
    const p = String(s).split(",").map(Number);
    if (
      p.length !== 2 ||
      !p.every(Number.isFinite) ||
      Math.abs(p[0]) > 180 ||
      Math.abs(p[1]) > 85
    )
      throw Error("Invalid coordinates");
    return p;
  };
  const a = coord(req.query.from || cities.Nagercoil),
    b = coord(req.query.to || cities[destination]);
  const { data } = await external(
    (process.env.OSRM_URL || "https://router.project-osrm.org") +
      "/route/v1/driving/" +
      a +
      ";" +
      b +
      "?overview=full&geometries=geojson&alternatives=true",
  );
  res.json(register(data, false));
});
app.get("/api/segment", async (req, res) => {
  const { id, mode } = req.query,
    r = routes.get(id),
    km = Number(req.query.km),
    index = Number(req.query.index);
  if (
    !r ||
    !Number.isInteger(index) ||
    !r.parts[index] ||
    !(km > 0 && km <= 10)
  )
    return res.status(400).json({ error: "Invalid corridor parameters" });
  const part = r.parts[index];
  let records = features,
    time = snapshot.date;
  if (mode === "live") {
    const { data, time: when } = await external(
      (process.env.OVERPASS_URL || "https://overpass-api.de/api/interpreter") +
        "?" +
        new URLSearchParams({ data: query(bounds(part, km)) }),
    );
    records = data.elements
      .map((e) => ({
        ...e,
        id: e.type + "/" + e.id,
        xy: [e.lon ?? e.center?.lon, e.lat ?? e.center?.lat],
      }))
      .filter((e) => e.xy.every(Number.isFinite));
    time = data.osm3s?.timestamp_osm_base || new Date(when).toISOString();
  } else if (mode !== "snapshot" || !r.offline)
    return res.status(400).json({ error: "No extract for this route" });
  res.json({
    total: r.parts.length,
    records: scan(part, km, records).map((item) => ({
      ...item,
      along: item.along + r.starts[index],
    })),
    time,
  });
});
tripModules(app, db, read, save, runtime);
app.get("/api/health", (req, res) =>
  res.json({
    status: "ready",
    database: "SQLite",
    facilities: features.length,
    snapshot: snapshot.date,
  }),
);

app.get("/api/drive", async (req, res) => {
  const coords = [req.query.from, req.query.to].map((s) =>
    String(s).split(",").map(Number),
  );
  if (
    coords.some(
      (p) =>
        p.length !== 2 ||
        !p.every(Number.isFinite) ||
        Math.abs(p[0]) > 180 ||
        Math.abs(p[1]) > 85,
    )
  )
    return res.status(400).json({ error: "Invalid location" });
  const { data } = await external(
    (process.env.OSRM_URL || "https://router.project-osrm.org") +
      "/route/v1/driving/" +
      coords.join(";") +
      "?overview=false",
  );
  res.json({
    distance: data.routes[0].distance,
    duration: data.routes[0].duration,
  });
});
app.use(express.static("dist"));
app.use((err, req, res, next) => res.status(502).json({ error: err.message }));
const arg = (name) =>
  process.argv.includes(name)
    ? process.argv[process.argv.indexOf(name) + 1]
    : undefined;
const port = Number(arg("--port") || process.env.PORT || 5173);
app.listen(port, arg("--host") || process.env.BIND_HOST || "127.0.0.1", () =>
  console.log("Route planner listening on " + port),
);
