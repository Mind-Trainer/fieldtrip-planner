import assert from "node:assert/strict";
const base = process.env.APP_URL || "http://127.0.0.1:5173";
async function get(endpoint) {
  const r = await fetch(base + "/api/" + endpoint);
  assert.equal(r.status, 200);
  return r.json();
}
for (const city of ["Tirunelveli", "Bengaluru"]) {
  const [r] = await get("routes?mode=snapshot&destination=" + city);
  const records = new Map(),
    sections = [];
  for (let index = 0; index < r.segments; index++) {
    const data = await get(
      "segment?" +
        new URLSearchParams({ mode: "snapshot", id: r.id, index, km: 3 }),
    );
    sections.push(data.records.length);
    for (const item of data.records) {
      assert.ok(item.offset <= 3000);
      const prev = records.get(item.id);
      if (!prev || item.offset < prev.offset) records.set(item.id, item);
    }
  }
  const hospitals = [...records.values()]
    .filter((i) => i.kind === "hospital")
    .sort(
      (a, b) =>
        Math.abs(a.along - r.distance / 2) - Math.abs(b.along - r.distance / 2),
    );
  assert.ok(hospitals.length);
  console.log(city, {
    distance: r.distance,
    sections,
    unique: records.size,
    midrouteHospital: hospitals[0].tags.name,
    id: hospitals[0].id,
    chainageKm: (hospitals[0].along / 1000).toFixed(1),
  });
}
