import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
export default defineConfig({
  workers: 1,
  testDir: "./browser-tests",
  use: {
    baseURL: "http://127.0.0.1:19149",
    viewport: { width: 1350, height: 900 },
  },
  webServer: {
    command: "node server.mjs",
    port: 19149,
    reuseExistingServer: false,
    env: {
      PORT: "19149",
      TRIP_DATA_DIR: mkdtempSync(join(tmpdir(), "fieldtrip-browser-")),
    },
  },
});
