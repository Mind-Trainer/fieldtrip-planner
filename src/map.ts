import L from "leaflet";
import type { Facility } from "./types";
import settlements from "../data/places.json";
import roadData from "../data/roads.json";
const roads = roadData.map((road) => {
  const points = road.line as [number, number][];
  return {
    ...road,
    bounds: L.latLngBounds(points.map(([x, y]) => [y, x] as [number, number])),
    points: points.map(([x, y]) => [y, x] as [number, number]),
  };
});
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
export const colors = {
  Healthcare: "#c43849",
  Police: "#4454ab",
  Fuel: "#9b6216",
  Mechanics: "#655d55",
  Food: "#c45518",
  Lodging: "#885499",
  Supplies: "#257463",
};
export function journeyMap(el, select, pick) {
  const m = L.map(el, { preferCanvas: true, maxZoom: 19 }).setView(
    [8.45, 77.58],
    10,
  );
  const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
  });
  const backdrop = L.layerGroup().addTo(m);
  let online = false,
    currentRoute = null;
  function drawRoads() {
    backdrop.clearLayers();
    if (online) return;
    const viewport = m.getBounds().pad(0.2),
      zoom = m.getZoom();
    const major = [],
      minor = [];
    for (const road of roads) {
      if (!viewport.intersects(road.bounds)) continue;
      const main = ["motorway", "trunk", "primary"].includes(road.kind);
      if (!main && zoom < 9) continue;
      (main ? major : minor).push(road.points);
    }
    L.polyline(minor, {
      color: "#dfe5d7",
      weight: 1.2,
      interactive: false,
      smoothFactor: 2,
    }).addTo(backdrop);
    L.polyline(major, {
      color: "#dfd5b7",
      weight: 2.8,
      interactive: false,
      smoothFactor: 2,
    }).addTo(backdrop);
    L.polyline(major, {
      color: "#fffcf1",
      weight: 1.4,
      interactive: false,
      smoothFactor: 2,
    }).addTo(backdrop);
    backdrop.eachLayer((layer) => {
      if (layer instanceof L.Path) layer.bringToBack();
    });
  }
  m.on("moveend zoomend", drawRoads);
  drawRoads();
  const vehicleLayer = L.layerGroup().addTo(m);
  const route = L.layerGroup().addTo(m),
    places = L.markerClusterGroup({ chunkedLoading: false }).addTo(m),
    highlights = L.layerGroup().addTo(m);
  m.attributionControl.addAttribution(
    "Route and facilities © OpenStreetMap contributors",
  );
  const labels = L.layerGroup().addTo(m);
  function redraw() {
    labels.clearLayers();
    const zoom = m.getZoom(),
      occupied = new Set();
    for (const [x, y, name, kind] of settlements as [
      number,
      number,
      string,
      string,
    ][]) {
      if (
        (zoom < 8 && kind !== "city") ||
        (zoom < 11 && kind === "village") ||
        !m.getBounds().contains([y, x])
      )
        continue;
      const screen = m.latLngToContainerPoint([y, x]),
        cell = Math.floor(screen.x / 100) + "," + Math.floor(screen.y / 30);
      if (occupied.has(cell)) continue;
      occupied.add(cell);
      const label = document.createElement("span");
      label.textContent = String(name);
      L.marker([y, x], {
        interactive: false,
        keyboard: false,
        zIndexOffset: -1000,
        icon: L.divIcon({ className: "town", html: label }),
      }).addTo(labels);
    }
  }
  m.on("moveend zoomend", redraw);
  redraw();
  m.on("click", (e) => pick([e.latlng.lng, e.latlng.lat]));
  const sizeObserver =
    typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(() => m.invalidateSize());
  sizeObserver?.observe(el);
  return {
    tiles(on) {
      online = on;
      drawRoads();
      if (on) tiles.addTo(m);
      else tiles.remove();
    },
    fit() {
      if (currentRoute) {
        m.invalidateSize();
        m.fitBounds(L.latLngBounds(currentRoute.line.map(([x, y]) => [y, x])), {
          padding: [45, 45],
        });
      }
    },
    destroy() {
      sizeObserver?.disconnect();
      m.remove();
    },
    vehicle(xy) {
      vehicleLayer.clearLayers();
      L.marker([xy[1], xy[0]], {
        icon: L.divIcon({
          className: "vehicle-pin",
          html: "↑",
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        }),
        title: "Simulated vehicle",
        zIndexOffset: 2000,
      }).addTo(vehicleLayer);
    },
    route(r) {
      currentRoute = r;
      route.clearLayers();
      highlights.clearLayers();
      if (!r) return;
      L.polyline(
        r.line.map(([x, y]) => [y, x]),
        { color: "#fff", weight: 8, opacity: 0.95 },
      ).addTo(route);
      const path = L.polyline(
        r.line.map(([x, y]) => [y, x]),
        { color: "#147166", weight: 5 },
      ).addTo(route);
      for (const [index, xy] of [r.line[0], r.line.at(-1)].entries()) {
        L.marker([xy[1], xy[0]], {
          icon: L.divIcon({
            className: "endpoint",
            html: index ? "B" : "A",
            iconSize: [23, 23],
          }),
          title: index ? "Destination" : "Starting point",
          zIndexOffset: 1500,
        }).addTo(route);
      }
      m.fitBounds(path.getBounds(), { padding: [45, 45] });
    },
    places(rows: Facility[], planned: string[], stops: Facility[]) {
      places.clearLayers();
      const visible = new Map(rows.map((r) => [r.id, r]));
      for (const r of stops) visible.set(r.id, r);
      places.addLayers(
        [...visible.values()].map((r) => {
          const icon = L.divIcon({
            className: "pin",
            html:
              '<span style="background:' +
              colors[r.group] +
              '">' +
              (planned.includes(r.id) ? "★" : "") +
              "</span>",
            iconSize: [17, 17],
          });
          return L.marker([r.xy[1], r.xy[0]], {
            icon,
            title: r.tags.name || r.kind,
          }).on("click", () => select(r));
        }),
      );
    },
    locate(xy, text) {
      highlights.clearLayers();
      const p = L.circleMarker([xy[1], xy[0]], {
        radius: 11,
        fill: false,
        color: "#202e3a",
      }).addTo(highlights);
      const label = document.createElement("strong");
      label.textContent = text;
      p.bindPopup(label).openPopup();
      m.panTo(p.getLatLng());
    },
  };
}
