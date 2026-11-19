import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
const directory = mkdtempSync(join(tmpdir(), "fieldtrip-live-"));
const port = 19155,
  base = "http://127.0.0.1:" + port;
const server = spawn(process.execPath, ["server.mjs"], {
  env: { ...process.env, PORT: String(port), TRIP_DATA_DIR: directory },
  stdio: ["ignore", "pipe", "inherit"],
});
const results = {};
try {
  await once(server.stdout, "data");
  for (const [name, path] of [
    ["routing", "routes?destination=Tirunelveli&mode=live"],
    ["emergencyDriving", "drive?from=77.594,8.389&to=77.603,8.39"],
  ]) {
    const response = await fetch(base + "/api/" + path);
    const data = await response.json();
    results[name] = {
      status: response.status,
      ...(name === "routing"
        ? {
            routes: data.length,
            distance: data[0]?.distance,
            error: data.error,
          }
        : data),
    };
    console.log(name, results[name]);
  }
  writeFileSync("LIVE-CHECK.json", JSON.stringify(results, null, 2));
} finally {
  const ended = once(server, "exit");
  server.kill();
  await ended;
  rmSync(directory, { recursive: true, force: true });
}
