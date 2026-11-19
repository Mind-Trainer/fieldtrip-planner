import tags from "./data/tags.json" with { type: "json" };
export const groups = [...new Set(Object.values(tags).flatMap(Object.values))];
export function classify(t) {
  for (const [k, values] of Object.entries(tags))
    if (Object.hasOwn(values, t[k])) return [values[t[k]], t[k]];
}
export function distance(a, b) {
  return (
    Math.hypot(
      (a[0] - b[0]) * Math.cos(((a[1] + b[1]) * Math.PI) / 360),
      a[1] - b[1],
    ) * 111195
  );
}
export function split(line) {
  let parts = [],
    part = [line[0]],
    length = 0;
  for (const p of line.slice(1)) {
    length += distance(part.at(-1), p);
    part.push(p);
    if (length >= 12000) {
      parts.push(part);
      part = [p];
      length = 0;
    }
  }
  if (part.length > 1) parts.push(part);
  return parts;
}
export function bounds(line, km) {
  const xs = line.map((p) => p[0]),
    ys = line.map((p) => p[1]),
    dy = km / 110;
  const dx =
    dy / Math.cos(((Math.max(...ys.map(Math.abs)) + dy) * Math.PI) / 180);
  return [
    Math.min(...ys) - dy,
    Math.min(...xs) - dx,
    Math.max(...ys) + dy,
    Math.max(...xs) + dx,
  ];
}
export function scan(line, km, records) {
  const [south, west, north, east] = bounds(line, km);
  const found = [];
  for (const r of records) {
    const [x, y] = r.xy;
    if (x < west || x > east || y < south || y > north) continue;
    const c = Math.cos((y * Math.PI) / 180);
    let nearest = Infinity,
      at = 0,
      total = 0;
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1],
        b = line[i],
        u = (b[0] - a[0]) * c,
        v = b[1] - a[1],
        px = (x - a[0]) * c,
        py = y - a[1];
      const t = Math.max(
        0,
        Math.min(1, (px * u + py * v) / (u * u + v * v || 1)),
      );
      const d = Math.hypot(px - u * t, py - v * t) * 111195,
        len = distance(a, b);
      if (d < nearest) {
        nearest = d;
        at = total + t * len;
      }
      total += len;
    }
    const label = classify(r.tags);
    if (nearest <= km * 1000 && label)
      found.push({
        ...r,
        group: label[0],
        kind: label[1],
        offset: nearest,
        along: at,
      });
  }
  return found;
}
export function query(box) {
  return (
    "[out:json][timeout:35];(" +
    Object.entries(tags)
      .map(
        ([k, vs]) =>
          'nwr["' +
          k +
          '"~"^(' +
          Object.keys(vs).join("|") +
          ')$"](' +
          box.join(",") +
          ");",
      )
      .join("") +
    ");out meta center;"
  );
}
