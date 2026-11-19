import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { createServer } from "node:http";
import { recommendations, nearby } from "../planning.mjs";
test("constraints exclude unknown access and diet, emergency list includes unplanned hospitals", () => {
  const row = {
    id: "way/1",
    kind: "restaurant",
    tags: {},
    offset: 20,
    along: 4000,
    group: "Food",
    xy: [77, 8],
  };
  const qualified = {
    ...row,
    id: "node/2",
    tags: { wheelchair: "yes", "diet:vegetarian": "yes" },
  };
  const rows = [
    row,
    qualified,
    { ...row, id: "node/3", kind: "hospital", group: "Healthcare" },
  ];
  const chosen = recommendations(
    rows,
    { distance: 8000 },
    { maxOffset: 1, breaks: 1, category: "Food", access: true, veg: true },
    {},
  );
  assert.deepEqual(
    chosen.map((r) => r.id),
    ["node/2"],
  );
  assert.deepEqual(
    nearby(rows, [77, 8], "Medical").map((r) => r.id),
    ["node/3"],
  );
});
test("running application, real data, provider outage, faculty history and restart persistence", async () => {
  const dir = mkdtempSync(join(tmpdir(), "fieldtrip-test-"));
  const upstream = createServer((req, res) => {
    res.writeHead(502);
    res.end("outage");
  }).listen(0, "127.0.0.1");
  await once(upstream, "listening");
  const probe = createServer().listen(0, "127.0.0.1");
  await once(probe, "listening");
  const port = probe.address().port;
  await new Promise((r) => probe.close(r));
  const base = "http://127.0.0.1:" + port;
  let child;
  async function start() {
    child = spawn(process.execPath, ["server.mjs"], {
      env: {
        ...process.env,
        PORT: String(port),
        TRIP_DATA_DIR: dir,
        FACULTY_KEY: "test-only",
        OVERPASS_URL: "http://127.0.0.1:" + upstream.address().port,
      },
      stdio: ["ignore", "pipe", "inherit"],
    });
    await Promise.race([
      once(child.stdout, "data"),
      once(child, "exit").then(() => {
        throw Error("server exited");
      }),
    ]);
  }
  async function stop() {
    if (child && child.exitCode === null) {
      const exited = once(child, "exit");
      child.kill();
      await exited;
    }
    child = null;
  }
  const get = async (path) => (await fetch(base + "/api/" + path)).json();
  const post = (path, data, key = "") =>
    fetch(base + "/api/" + path, {
      method: "POST",
      headers: { "content-type": "application/json", "x-faculty-key": key },
      body: JSON.stringify(data),
    });
  try {
    await start();
    assert.match(await (await fetch(base)).text(), /Fieldtrip/);
    const [route] = await get("routes?destination=Tirunelveli&mode=snapshot");
    const query = "segment?id=" + route.id + "&index=3&km=3&mode=";
    const middle = await get(query + "snapshot");
    const hospital = middle.records.find((r) => r.kind === "hospital");
    assert.ok(hospital);
    assert.ok(hospital.along > 30000);
    const trip = { prefs: { students: 24 }, planned: [hospital.id] };
    assert.equal((await post("trip/" + route.id, trip)).status, 200);
    const review = {
      facility: hospital.id,
      evidence: "Test fixture",
      notes: "Local automated test",
      status: "Verification in Progress",
      department: "Unknown",
    };
    assert.equal((await post("reviews", review)).status, 403);
    assert.equal((await post("reviews", review, "test-only")).status, 200);
    assert.equal(
      (
        await post(
          "reviews",
          { ...review, status: "Recheck Required" },
          "test-only",
        )
      ).status,
      200,
    );
    const failure = await fetch(base + "/api/" + query + "live");
    assert.equal(failure.status, 502);
    assert.match((await failure.json()).error, /502/);
    assert.deepEqual(await get("trip/" + route.id), trip);
    const setup = await post("faculty/setup", {
      name: "Restart test",
      password: "test-password-123",
    });
    assert.equal(setup.status, 200);
    assert.equal(
      (
        await post("faculty/setup", {
          name: "Another",
          password: "another-pass",
        })
      ).status,
      409,
    );
    assert.equal(
      (await post("faculty/login", { password: "incorrect" })).status,
      403,
    );
    await stop();
    await start();
    const login = await post("faculty/login", {
      password: "test-password-123",
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie").split(";")[0];
    const session = await fetch(base + "/api/faculty/session", {
      headers: { cookie },
    });
    assert.equal((await session.json()).authenticated, true);
    const logout = await fetch(base + "/api/faculty/logout", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: "{}",
    });
    assert.equal(logout.status, 200);
    assert.equal(
      (
        await (
          await fetch(base + "/api/faculty/session", { headers: { cookie } })
        ).json()
      ).authenticated,
      false,
    );
    assert.deepEqual(await get("trip/" + route.id), trip);
    const history = await get("history?id=" + hospital.id);
    assert.equal(history.length, 2);
    assert.equal(history[0].status, "Recheck Required");
    assert.equal(
      (await get(query + "snapshot")).records.length,
      middle.records.length,
    );
  } finally {
    await stop();
    upstream.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
import { routeScores } from "../planning.mjs";
test("route comparison normalizes each unit and preserves user choice", () => {
  const r = [
    { distance: 100, duration: 60 },
    { distance: 90, duration: 100 },
  ];
  assert.equal(routeScores(r, "Shortest time")[0].i, 0);
  assert.equal(routeScores(r, "Shortest distance")[0].i, 1);
  assert.equal(routeScores(r.slice(0, 1), "Balanced")[0].score, 1);
});
