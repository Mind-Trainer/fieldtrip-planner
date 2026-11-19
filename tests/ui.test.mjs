import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync, readdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as pause } from "node:timers/promises";
test("built interface searches, clusters, filters, inspects a service, plans and simulates", async () => {
  const dir = mkdtempSync(join(tmpdir(), "fieldtrip-ui-")),
    port = process.env.UI_TEST_PORT || "19145",
    base = "http://127.0.0.1:" + port;
  const child = spawn(process.execPath, ["server.mjs"], {
    env: { ...process.env, TRIP_DATA_DIR: dir, PORT: port },
    stdio: ["ignore", "pipe", "inherit"],
  });
  let dom;
  try {
    await once(child.stdout, "data");
    dom = new JSDOM('<div id="root"></div>', {
      url: base,
      runScripts: "outside-only",
      pretendToBeVisual: true,
      virtualConsole: new VirtualConsole().forwardTo(console),
    });
    const w = dom.window,
      doc = w.document;
    w.fetch = (url, init) => fetch(new URL(url, base), init);
    w.HTMLCanvasElement.prototype.getContext = () =>
      new Proxy({}, { get: (o, k) => o[k] || (() => {}) });
    for (const [prop, value] of [
      ["clientHeight", 520],
      ["clientWidth", 840],
    ])
      Object.defineProperty(w.HTMLElement.prototype, prop, {
        get() {
          return this.classList.contains("map") ? value : 0;
        },
      });
    w.eval(
      readFileSync(
        "dist/assets/" +
          readdirSync("dist/assets").find((p) => p.endsWith(".js")),
        "utf8",
      ),
    );
    const button = (t) =>
      [...doc.querySelectorAll("button")].find((b) => b.textContent === t);
    async function until(fn) {
      for (let n = 0; n < 160; n++) {
        if (fn()) return;
        await pause(35);
      }
      assert.fail(
        "UI condition timed out: " + doc.body.textContent.slice(0, 1600),
      );
    }
    await until(
      () =>
        button("Search entire corridor") &&
        !button("Search entire corridor").disabled,
    );
    button("Search entire corridor").click();
    await until(() =>
      doc.querySelector("[role=status]")?.textContent.includes("335 matching"),
    );
    await until(() => doc.querySelector(".marker-cluster"));
    assert.equal(doc.querySelectorAll(".cards button").length, 335);
    button("Hide all").click();
    await until(() => !doc.querySelector(".cards button"));
    button("Show all").click();
    await until(() => doc.querySelector(".cards button"));
    doc.querySelector(".cards button").click();
    await until(() => doc.querySelector("aside"));
    assert.match(doc.querySelector("aside").textContent, /Not Verified/);
    doc.querySelector(".close").click();
    button("Generate stop plan").click();
    await until(() => doc.body.textContent.includes("Planned stops · 1"));
    button("Save journey").click();
    await until(() =>
      doc.body.textContent.includes("Trip and planned stops saved"),
    );
    button("Simulate at route midpoint").click();
    await until(() => doc.body.textContent.includes("Unplanned service"));
    assert.match(doc.body.textContent, /Easwari Nursing Home/);
  } finally {
    dom?.window.close();
    const ended = once(child, "exit");
    child.kill();
    await ended;
    rmSync(dir, { recursive: true, force: true });
  }
});
