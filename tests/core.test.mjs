import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { split, scan, classify } from "../core.mjs";
const load = (k) => JSON.parse(readFileSync("data/" + k + ".json"));
test("all road vertices survive splitting, including shared boundaries", () => {
  const line = load("short").routes[0].geometry.coordinates,
    parts = split(line);
  assert.deepEqual(
    parts.flatMap((p, i) => (i ? p.slice(1) : p)),
    line,
  );
  for (let i = 1; i < parts.length; i++)
    assert.deepEqual(parts[i][0], parts[i - 1].at(-1));
});
test("interior services survive exact polyline filter; off-road and unsupported tags are excluded", () => {
  const mk = (id, xy, tags) => ({ id, xy, tags });
  const line = [
    [0, 0],
    [0, 0.2],
    [0.2, 0.2],
  ];
  const rows = scan(line, 1, [
    mk("node/1", [0.003, 0.1], { amenity: "hospital" }),
    mk("node/2", [0.1, 0.1], { amenity: "hospital" }),
    mk("way/3", [0, 0.1], {}),
  ]);
  assert.deepEqual(
    rows.map((r) => r.id),
    ["node/1"],
  );
  assert.ok(rows[0].offset > 300 && rows[0].offset < 340);
  assert.deepEqual(classify({ amenity: "pharmacy" }), [
    "Healthcare",
    "pharmacy",
  ]);
});
for (const key of ["short", "long"])
  test(key + " real snapshot corridor", () => {
    const route = load(key).routes[0],
      parts = split(route.geometry.coordinates),
      records = load("facilities"),
      seen = new Map();
    let middle = [];
    for (const [i, part] of parts.entries()) {
      const found = scan(part, 3, records);
      for (const r of found) {
        assert.match(r.id, /^(node|way|relation)\/\d+$/);
        seen.set(r.id, r);
      }
      if (i === Math.floor(parts.length / 2)) middle = found;
    }
    const counts = Object.fromEntries(
      [...new Set([...seen.values()].map((r) => r.group))].map((g) => [
        g,
        [...seen.values()].filter((r) => r.group === g).length,
      ]),
    );
    console.log(
      key,
      parts.length,
      "sections",
      seen.size,
      "unique",
      counts,
      "middle section",
      middle.length,
    );
    assert.ok(middle.length > 0);
    assert.ok(seen.size > 10);
  });
