import { distance } from "./core.mjs";
export function recommendations(rows, route, prefs, reviews) {
  const slots = Math.min(12, Math.max(0, Number(prefs.breaks) || 0)),
    chosen = [];
  const weights =
    prefs.priority === "Verification first"
      ? [0.2, 0.2, 0.6]
      : prefs.priority === "Closest to road"
        ? [0.65, 0.25, 0.1]
        : [0.4, 0.4, 0.2];
  for (let i = 1; i <= slots; i++) {
    const target = (route.distance * i) / (slots + 1);
    const options = rows.filter(
      (r) =>
        r.group === prefs.category &&
        !chosen.some((c) => c.id === r.id) &&
        r.offset <= prefs.maxOffset * 1000 &&
        (!prefs.access || r.tags.wheelchair === "yes") &&
        (!prefs.veg ||
          r.group !== "Food" ||
          ["yes", "only"].includes(r.tags["diet:vegetarian"])),
    );
    const scored = options
      .map((r) => {
        const proximity =
          1 - Math.min(1, r.offset / Math.max(1, prefs.maxOffset * 1000));
        const timing =
          1 -
          Math.min(
            1,
            Math.abs(r.along - target) /
              Math.max(1, route.distance / (slots + 1)),
          );
        const verification =
          { Verified: 1, "Partially Verified": 0.5 }[reviews[r.id]?.status] ||
          0;
        return {
          id: r.id,
          score: Math.round(
            100 *
              (weights[0] * proximity +
                weights[1] * timing +
                weights[2] * verification),
          ),
          target,
        };
      })
      .sort((a, b) => b.score - a.score);
    if (scored.length) chosen.push(scored[0]);
  }
  return chosen;
}
export function nearby(rows, point, group) {
  return rows
    .filter((r) =>
      group === "Medical" ? r.kind === "hospital" : r.group === group,
    )
    .map((r) => ({ ...r, air: distance(point, r.xy) }))
    .sort((a, b) => a.air - b.air);
}
export function routeScores(routes, priority) {
  function normalized(value, field) {
    const values = routes.map((r) => r[field]),
      min = Math.min(...values),
      max = Math.max(...values);
    return max === min ? 1 : 1 - (value - min) / (max - min);
  }
  const weight =
    priority === "Shortest time"
      ? 1
      : priority === "Shortest distance"
        ? 0
        : 0.5;
  return routes
    .map((r, i) => ({
      i,
      score:
        weight * normalized(r.duration, "duration") +
        (1 - weight) * normalized(r.distance, "distance"),
    }))
    .sort((a, b) => b.score - a.score);
}
