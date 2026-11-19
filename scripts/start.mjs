import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { existsSync } from "node:fs";
if (existsSync(".env")) process.loadEnvFile(".env");
const server = spawn(process.execPath, ["server.mjs"], { stdio: "inherit" });
const url = "http://127.0.0.1:" + (process.env.PORT || 5173);
let ready = false;
server.on("exit", (code) => process.exit(code || 0));
for (let attempt = 0; attempt < 50; attempt++) {
  try {
    const response = await fetch(url + "/api/health");
    if (response.ok) {
      ready = true;
      break;
    }
  } catch {}
  await delay(200);
}
if (ready) {
  console.log("Open " + url);
  if (process.platform === "win32")
    spawn("cmd.exe", ["/c", "start", "", url], { stdio: "ignore" });
} else
  console.log(
    "Startup is taking longer than expected. Review the server output above.",
  );
process.on("SIGINT", () => server.kill());
