import { MONTHS, monthBars, showTip, hideTip } from "./charts.js";
import { DEFS, info } from "./defs.js";
import { aboutHTML, siteLinksHTML } from "./about.js";
import { track, initTracking } from "./track.js";
import { wxStripHTML, bindWxStrips, wxChipsHTML, wxPasses, wxCSS } from "./strip.js";

const CAT = {
  mtb:    { label: "Mountain bike", short: "MTB", color: "#eda100", desc: "Lifts, trails, enduro" },
  road:   { label: "Road",          short: "Road", color: "#9085e9", desc: "Day rides, climbs, cobbles" },
  gravel: { label: "Gravel",        short: "Gravel", color: "#199e70", desc: "Dirt and back roads" },
};
/** What you can ride from a base, per discipline (the filter chips under each discipline). */
const OFFERS = {
  mtb: { lift: "Lifts & shuttles", trails: "Trails" },
  road: { day: "Day rides", climbs: "Big climbs", cobbles: "Cobbles" },
  gravel: { day: "Day rides" },
};
/** Multi-day routes: how supported the trip is. */
const SUPPORT = { hotel: "Hotel-to-hotel", bikepacking: "Bikepacking", remote: "Remote" };
const MULTI = { label: "Multi-day routes", color: "#6f6b52", desc: "Several days, one-way or loop" };
const CHIPS = { ...OFFERS, multi: SUPPORT };
const HIRE = { easy: "Easy to hire", limited: "Limited", byo: "Bring your own" };
const hireText = (d) => d.hire ? `<b>${HIRE[d.hire]}</b>${d.hireNote ? `: ${esc(d.hireNote)}` : ""}` : "";
const isRoute = (d) => d.kind === "route";
/** riding conditions over the next 7 days: blue (good) / grey (mixed) / red (poor), out of season = white.
 *  Same red–grey–blue scale as the ski site's snow, which stays readable with colour blindness (unlike red–green). */
const COND = {
  good:  { color: "#1c5cab", label: "Good" },
  mixed: { color: "#c9c8c3", label: "Mixed" },
  poor:  { color: "#c43c3b", label: "Poor" },
};
const COND_ORDER = ["poor", "mixed", "good"];
const SLOTS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300"];
const NODATA = "#ffffff";
const ACCENT = "#1a4c2a";

// ---------- state ----------
const saved = JSON.parse(localStorage.getItem("waywardbike2") || "{}");
const state = Object.assign({
  picks: [],          // whole rows selected: a discipline (mtb/road/gravel) or "multi"
  types: {},          // chips selected within each category; nothing selected anywhere = show everything
  months: [],         // travel months (multi-select)
  hideOut: false,
  colorBy: "category",
  minCond: "any",
  wxChips: [],        // dry chips (all must match)
  wxWhen: "week",     // "week" or "weekend"
  crowdMax: 5,
  search: "",
  sort: "zone",
  compare: [],        // [{id, slot}]
}, saved, { selected: null, search: "" });
for (const k of Object.keys(CHIPS)) if (!Array.isArray(state.types[k])) state.types[k] = [];
if (!Array.isArray(state.wxChips)) state.wxChips = [];
const persist = () => {
  const { selected, ...rest } = state;
  localStorage.setItem("waywardbike2", JSON.stringify(rest));
};

let DEST = [], BY_ID = {}, CONDDATA = { destinations: {} }, ZONES = {}, MACROS = {}, STORIES = {}, map, popup;
const ZONE_TIER_MAX = 4; // below this zoom, show named region pills instead of individual pins

// ---------- helpers ----------
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const condOf = (d) => CONDDATA.destinations[d.id];
const inSeason = (d, m) => { const [s, e] = d.season; return s <= e ? m >= s && m <= e : m >= s || m <= e; };
const isBest = (d, m) => d.best.includes(m);
const monthsLabel = () => state.months.map(m => MONTHS[m - 1]).join(", ");
/** dim = months picked and the place is in season in none of them */
const outForMonths = (d) => state.months.length > 0 && !state.months.some(m => inSeason(d, m));
const bestForMonths = (d) => state.months.some(m => isBest(d, m));
function fitText(d) {
  const ms = state.months; if (!ms.length) return null;
  const inMs = ms.filter(m => inSeason(d, m));
  if (bestForMonths(d)) return { cls: "fit-good", text: inMs.length === ms.length ? "prime time" : "prime time (partly in season)" };
  if (inMs.length === ms.length) return { cls: "fit-ok", text: "in season" };
  if (inMs.length) return { cls: "fit-ok", text: `in season ${inMs.map(m => MONTHS[m - 1]).join(", ")} only` };
  return { cls: "fit-bad", text: "out of season" };
}
const meter = (n, max = 5) => `<span class="meter">${Array.from({ length: max }, (_, i) => `<i class="${i < n ? "f" : ""}"></i>`).join("")}</span>`;
/** "Trails, Lifts & shuttles · Road: Big climbs" for a base; "Multi-day · Remote" for a route */
const subLabel = (d) => isRoute(d) ? `Multi-day · ${SUPPORT[d.support]}`
  : Object.entries(d.offers).map(([c, xs]) => (c === d.category ? "" : CAT[c].short + ": ") + xs.map(x => OFFERS[c][x]).join(", ")).join(" · ");
const typeLine = (d) => isRoute(d) ? `${CAT[d.category].label} · multi-day route · ${SUPPORT[d.support].toLowerCase()}` : `${CAT[d.category].label} base${Object.keys(d.offers).length > 1 ? " · also " + Object.keys(d.offers).filter(c => c !== d.category).map(c => CAT[c].label.toLowerCase()).join(", ") : ""}`;
const fmtDay = (iso) => { const d = new Date(iso); return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`; };
/** "Nov 18, 2026": month spelled out so it reads the same in every country */
const fmtDate = (iso) => { if (!iso) return "–"; const d = new Date(iso.length === 10 ? iso + "T00:00:00Z" : iso); return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`; };
const weekday = (iso) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(iso + "T12:00:00Z").getUTCDay()];
const num = (n) => Number(n).toLocaleString("en-US");
const statsText = (d) => d.stats ? `${num(d.stats.km)} km · ${d.stats.days} days · ~${num(d.stats.climb)} m climbing` : "";
const seasonText = (d) => d.season[0] === 1 && d.season[1] === 12 ? "all year" : `${MONTHS[d.season[0] - 1]}–${MONTHS[d.season[1] - 1]}`;
/** Where a destination is in its riding season this month. Conditions only count in season. */
function status(d) {
  const c = condOf(d), m = new Date().getMonth() + 1;
  if (!c?.rated) return { key: "nodata", live: false, label: "No conditions data yet" };
  if (!inSeason(d, m)) return { key: "off", live: false, label: `Off-season · usually ${seasonText(d)}` };
  return { key: "in", live: true, label: "In season" };
}
// ---- staleness: flag data that fell behind (a failed update) ----
const daysOld = (iso) => iso ? Math.floor((Date.now() - new Date(iso + "T00:00:00Z")) / 864e5) : null;
const latestAsOf = () => Object.values(CONDDATA?.destinations || {}).map(c => c.asOf).filter(Boolean).sort().at(-1);
function staleNote(d) {
  const c = condOf(d); if (!c || !status(d).live) return "";
  const lag = daysOld(c.asOf) - daysOld(latestAsOf());
  return lag >= 3 ? `This forecast is from ${fmtDay(c.asOf)}, ${lag} days older than the other places: the last updates failed for this one.` : "";
}
/** the rating only while it means something now; null when out of season */
const liveCond = (d) => status(d).live ? condOf(d).rated.rating : null;
function condText(d) {
  const r = liveCond(d);
  return r ? `${COND[r].label} riding this week` : status(d).label;
}


// ---------- filtering ----------
const anyPicked = () => state.picks.length > 0 || Object.values(state.types).some(a => a.length);
function picked(d) {
  if (!anyPicked()) return true;
  if (isRoute(d)) return state.picks.includes("multi") || state.picks.includes(d.category) || state.types.multi.includes(d.support);
  return Object.entries(d.offers).some(([c, xs]) => state.picks.includes(c) || state.types[c]?.some(t => xs.includes(t)));
}
function passes(d) {
  if (!picked(d)) return false;
  if (state.crowdMax < 5 && d.crowds > state.crowdMax) return false;
  if (state.minCond !== "any") { const r = liveCond(d); if (!r || COND_ORDER.indexOf(r) < COND_ORDER.indexOf(state.minCond)) return false; }
  if (state.wxChips.length && (!status(d).live || !wxPasses(condOf(d)?.wx, "rain", state.wxChips, state.wxWhen))) return false; // in season now only
  if (state.hideOut && outForMonths(d)) return false;
  if (state.search) {
    const q = state.search.toLowerCase();
    const hay = [d.name, d.country, d.region, subLabel(d), ...(d.children || []).map(c => c.name)].join(" ").toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}
function markerColor(d) {
  if (state.colorBy === "cond") { const r = liveCond(d); return r ? COND[r].color : NODATA; }
  return CAT[d.category].color;
}

// ---------- map ----------
/** Sub-areas: a riding area, a bike park, a famous climb, or a highlight along a route. Same colour as their destination. */
const kidKind = (c) => c.kind || "area";
const KID_KINDS = { area: "Riding area", park: "Bike park", climb: "Climb", section: "Highlight" };
const kidColor = (c, d) => markerColor(d);
/** Where a sub-area dot is drawn. If it sits almost on top of its main dot at the current zoom (Sun Valley's
 *  Bald Mountain, say), it is nudged out in screen space so both stay clickable; the dotted link still ties it home. */
const KID_MIN_PX = 28;
function kidPlace(d, c, i) {
  if (!map || !map.getZoom || map.getZoom() < 5) return { pos: [c.lon, c.lat], anchor: "top" };
  const P = map.project([d.lon, d.lat]), K = map.project([c.lon, c.lat]);
  let dx = K.x - P.x, dy = K.y - P.y, dist = Math.hypot(dx, dy), pos = [c.lon, c.lat];
  if (dist < 2) { const a = -Math.PI / 2 + i * 2.4; dx = Math.cos(a); dy = Math.sin(a); dist = 1; } // fan out spokes when they coincide
  if (dist < KID_MIN_PX) { const q = map.unproject([P.x + dx / dist * KID_MIN_PX, P.y + dy / dist * KID_MIN_PX]); pos = [q.lng, q.lat]; }
  // label on the far side from the main dot, so it never sits on top of it
  const anchor = Math.abs(dy) >= Math.abs(dx) ? (dy < 0 ? "bottom" : "top") : (dx < 0 ? "right" : "left");
  return { pos, anchor };
}
const kidPos = (d, c, i) => kidPlace(d, c, i).pos;
const KID_LABEL_OFFSET = { top: [0, 0.8], bottom: [0, -0.8], left: [0.9, 0], right: [-0.9, 0] };
function kidFeatures() {
  return { type: "FeatureCollection", features: DEST.filter(passes).flatMap(d => (d.children || []).map((c, i) => ({
    type: "Feature", geometry: { type: "Point", coordinates: kidPos(d, c, i) },
    properties: { anchor: kidPlace(d, c, i).anchor, name: c.name, note: c.note || "", parent: d.id, i, color: kidColor(c, d), dim: outForMonths(d), bc: false },
  }))) };
}
/** thin lines tying each sub-area back to its destination, so groups read as groups */
function kidLinkFeatures() {
  return { type: "FeatureCollection", features: DEST.filter(passes).flatMap(d => (d.children || []).map((c, i) => ({
    type: "Feature", geometry: { type: "LineString", coordinates: [[d.lon, d.lat], kidPos(d, c, i)] }, properties: { dim: outForMonths(d) },
  }))) };
}
function features() {
  return {
    type: "FeatureCollection",
    features: DEST.filter(passes).map(d => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [d.lon, d.lat] },
      properties: {
        id: d.id, name: d.name, cat: d.category, kind: d.kind || "base",
        color: markerColor(d),
        ring: state.colorBy === "cond" ? CAT[d.category].color : "#fcfcfb",
        dim: outForMonths(d),
        best: bestForMonths(d),
      },
    })),
  };
}

/** Diamond markers for multi-day routes, drawn on demand as "diamond|<fill>|<ring>" images (fill + ring baked in). */
function addDiamond() {
  map.on("styleimagemissing", (e) => {
    if (!e.id.startsWith("diamond|") || map.hasImage(e.id)) return;
    const [, fill, ring] = e.id.split("|"), n = 40, c = document.createElement("canvas"); c.width = c.height = n;
    const g = c.getContext("2d");
    const dia = (r) => { g.beginPath(); g.moveTo(n / 2, n / 2 - r); g.lineTo(n / 2 + r, n / 2); g.lineTo(n / 2, n / 2 + r); g.lineTo(n / 2 - r, n / 2); g.closePath(); g.fill(); };
    g.fillStyle = ring; dia(19);
    g.fillStyle = fill; dia(14);
    map.addImage(e.id, g.getImageData(0, 0, n, n), { pixelRatio: 2 });
  });
}

function initMap() {
  map = new maplibregl.Map({
    container: "map",
    style: "https://tiles.openfreemap.org/styles/positron",
    center: [10, 20], zoom: 1, minZoom: -1, renderWorldCopies: false, attributionControl: { compact: true },
  });
  window.bikeMap = map; // handy for debugging in the console
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), "top-right");
  // hover previews only where there is a real hover (mouse/trackpad); on touch a tap opens the full panel directly
  const canHover = matchMedia("(hover: hover) and (pointer: fine)").matches;
  popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10, maxWidth: "280px" });

  map.on("style.load", () => {
    // Terrain shading under the water layer → gives a sense of mountain ranges on a clean basemap
    map.addSource("dem", {
      type: "raster-dem", encoding: "terrarium", tileSize: 256, maxzoom: 12,
      tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
      attribution: "Terrain: Mapzen/AWS",
    });
    winterizeBasemap();
    const waterLayer = map.getStyle().layers.find(l => l.id.includes("water"))?.id;
    map.addLayer({ id: "hillshade", type: "hillshade", source: "dem", paint: {
      "hillshade-exaggeration": 0.55, "hillshade-shadow-color": "#7a7a5c", "hillshade-highlight-color": "#ffffff", "hillshade-accent-color": "#a3a283",
      "hillshade-illumination-direction": 315,
    } }, waterLayer);

    map.addSource("dest", { type: "geojson", data: features(), cluster: true, clusterRadius: 16, clusterMaxZoom: 7 });
    map.addLayer({ id: "clusters", type: "circle", source: "dest", filter: ["has", "point_count"], paint: {
      "circle-color": "#ffffff", "circle-stroke-color": "#7a7656", "circle-stroke-width": 1.5,
      "circle-radius": ["step", ["get", "point_count"], 12, 5, 15, 12, 19],
    } });
    map.addLayer({ id: "cluster-count", type: "symbol", source: "dest", filter: ["has", "point_count"], layout: {
      "text-field": ["get", "point_count_abbreviated"], "text-size": 12, "text-font": ["Noto Sans Bold"],
    }, paint: { "text-color": "#0b0b0b" } });
    // bases are circles, multi-day routes are diamonds
    addDiamond();
    map.addLayer({ id: "routes", type: "symbol", source: "dest", filter: ["all", ["!", ["has", "point_count"]], ["==", ["get", "kind"], "route"]], layout: {
      "icon-image": ["concat", "diamond|", ["get", "color"], "|", ["case", ["==", ["get", "color"], NODATA], "#6f6e69", ["get", "ring"]]],
      "icon-allow-overlap": true, "icon-ignore-placement": true,
      "icon-size": ["interpolate", ["linear"], ["zoom"], 1, ["case", ["get", "best"], 0.85, 0.72], 6, ["case", ["get", "best"], 1.1, 0.95]],
    }, paint: { "icon-opacity": ["case", ["get", "dim"], 0.45, 1] } });
    map.addLayer({ id: "points", type: "circle", source: "dest", filter: ["all", ["!", ["has", "point_count"]], ["!=", ["get", "kind"], "route"]], paint: {
      "circle-color": ["get", "color"],
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, ["case", ["get", "best"], 7, 5.5], 6, ["case", ["get", "best"], 10, 8]],
      "circle-stroke-color": ["case", ["==", ["get", "color"], NODATA], "#6f6e69", ["get", "ring"]],
      "circle-stroke-width": ["case", ["get", "best"], 3, 2],
      "circle-opacity": ["case", ["==", ["get", "color"], NODATA], 1, ["get", "dim"], 0.4, 1],
      "circle-stroke-opacity": ["case", ["get", "dim"], 0.6, 1],
    } });
    map.addLayer({ id: "labels", type: "symbol", source: "dest", filter: ["!", ["has", "point_count"]], minzoom: 4.5, layout: {
      "text-field": ["get", "name"], "text-size": 12, "text-font": ["Noto Sans Regular"], "text-offset": [0, 1.1], "text-anchor": "top", "text-max-width": 12, "text-optional": true,
    }, paint: { "text-color": "#1f2a1c", "text-halo-color": "#fbf9f2", "text-halo-width": 1.5, "text-opacity": ["case", ["get", "dim"], 0.35, 1] } });

    // every sub-resort / sub-area as its own small dot once zoomed in (Vail, Breckenridge, A-Basin…)
    map.addSource("kidlinks", { type: "geojson", data: kidLinkFeatures() });
    // light casing under the dashes so they read over hillshade
    map.addLayer({ id: "kidlinks-casing", type: "line", source: "kidlinks", minzoom: 5, layout: { "line-cap": "round" }, paint: {
      "line-color": "#fcfcfb", "line-width": ["interpolate", ["linear"], ["zoom"], 5, 3.5, 9, 5], "line-opacity": ["case", ["get", "dim"], 0.2, 0.75],
    } }, "points");
    map.addLayer({ id: "kidlinks", type: "line", source: "kidlinks", minzoom: 5, paint: {
      "line-color": ACCENT, "line-width": ["interpolate", ["linear"], ["zoom"], 5, 1.8, 9, 2.8], "line-dasharray": [2, 1.2], "line-opacity": ["case", ["get", "dim"], 0.25, 0.9],
    } }, "points");
    map.addSource("kids", { type: "geojson", data: kidFeatures() });
    // every sub-area is a smaller version of a destination dot: filled with its own type colour (or the parent's snow colour), white ring
    map.addLayer({ id: "kids", type: "circle", source: "kids", minzoom: 5, paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 3.5, 9, 6.5],
      "circle-color": ["get", "color"], "circle-stroke-color": ["case", ["==", ["get", "color"], NODATA], "#6f6e69", "#fcfcfb"], "circle-stroke-width": 1.5,
      "circle-opacity": ["case", ["==", ["get", "color"], NODATA], 1, ["get", "dim"], 0.4, 1], "circle-stroke-opacity": ["case", ["get", "dim"], 0.6, 1],
    } });
    map.addLayer({ id: "kids-labels", type: "symbol", source: "kids", minzoom: 6.3, layout: {
      "text-field": ["get", "name"], "text-size": 11, "text-font": ["case", ["get", "bc"], ["literal", ["Noto Sans Italic"]], ["literal", ["Noto Sans Regular"]]], "text-offset": ["match", ["get", "anchor"], "bottom", ["literal", KID_LABEL_OFFSET.bottom], "left", ["literal", KID_LABEL_OFFSET.left], "right", ["literal", KID_LABEL_OFFSET.right], ["literal", KID_LABEL_OFFSET.top]], "text-anchor": ["get", "anchor"], "text-optional": true, "text-max-width": 10,
    }, paint: { "text-color": "#52514e", "text-halo-color": "#fbf9f2", "text-halo-width": 1.5, "text-opacity": ["case", ["get", "dim"], 0.4, 1] } });
    map.on("click", "kids", (e) => { const f = e.features[0].properties; openSub(f.parent, +f.i); });
    map.on("mouseenter", "kids", (e) => { map.getCanvas().style.cursor = "pointer"; if (!canHover) return; const f = e.features[0].properties, d = BY_ID[f.parent];
      popup.setLngLat(e.lngLat).setHTML(`<div class="pop"><h4>${esc(f.name)}</h4><div class="row">${esc(f.note)}</div><div class="row muted">Part of ${esc(d.name)} · click for more</div></div>`).addTo(map); });
    map.on("mouseleave", "kids", () => { map.getCanvas().style.cursor = ""; popup.remove(); });

    map.addSource("children", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer({ id: "children", type: "circle", source: "children", paint: { "circle-radius": 9, "circle-color": "transparent", "circle-stroke-color": ACCENT, "circle-stroke-width": ["case", ["get", "on"], 2.5, 1.2] } }, "kids");
    map.addSource("sel", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer({ id: "sel", type: "circle", source: "sel", paint: { "circle-radius": 14, "circle-color": "transparent", "circle-stroke-color": ACCENT, "circle-stroke-width": 2 } }, "points");

    bindZoneEvents();
    fitAll(false);
    renderZones();
    if (location.hash.startsWith("#place/")) routeFromHash(); // a shared link: fly straight there
    map.once("idle", () => { map.resize(); if (!state.selected) fitAll(false); renderZones(); }); // re-fit once the tray/layout has settled (unless a place is already open)
  });

  map.on("click", "clusters", async (e) => {
    const f = e.features[0];
    const z = await map.getSource("dest").getClusterExpansionZoom(f.properties.cluster_id);
    map.easeTo({ center: f.geometry.coordinates, zoom: z + 0.3 });
  });
  map.on("mouseenter", "clusters", () => map.getCanvas().style.cursor = "pointer");
  map.on("mouseleave", "clusters", () => map.getCanvas().style.cursor = "");
  for (const layer of ["points", "routes"]) {
    map.on("mouseenter", layer, (e) => {
      map.getCanvas().style.cursor = "pointer";
      if (!canHover) return;
      const d = BY_ID[e.features[0].properties.id];
      popup.setLngLat([d.lon, d.lat]).setHTML(popupHTML(d)).addTo(map);
    });
    map.on("mouseleave", layer, () => { map.getCanvas().style.cursor = ""; popup.remove(); });
    map.on("click", layer, (e) => openDetail(e.features[0].properties.id, false));
  }
}


// ---------- world view: named region pills (semantic zoom) ----------
// Below ZONE_TIER_MAX the map shows one pill per region, with one dot per destination inside it,
// so every destination stays visible and scannable at world scale. If the regions would crowd
// each other too much (small window / far zoomed out) they merge into bigger "macro" regions.
const zoneOrder = (d) => { const keys = Object.keys(ZONES); return keys.indexOf(d.zone); };
let zoneTier = null, zoneEls = [], zoneRaf = 0;

/** merged = set of macro keys shown as one big pill; every other region keeps its own pill. "all" merges everything. */
function groupsFor(merged) {
  const groups = new Map();
  for (const d of DEST) {
    const macro = ZONES[d.zone]?.macro, big = merged === "all" || merged.has(macro);
    const key = big ? "m:" + macro : d.zone;
    if (!groups.has(key)) groups.set(key, { key, macro, name: big ? MACROS[macro] : ZONES[d.zone]?.name, all: [], shown: [] });
    const g = groups.get(key); g.all.push(d);
    if (passes(d)) g.shown.push(d);
  }
  return [...groups.values()].filter(g => g.shown.length).map(g => {
    // anchor = mean of all members (stable when filters change); wrap-safe enough for these regions
    g.lon = g.all.reduce((a, d) => a + d.lon, 0) / g.all.length;
    g.lat = g.all.reduce((a, d) => a + d.lat, 0) / g.all.length;
    return g;
  });
}

function pillHTML(g) {
  const dots = g.shown.map(d => {
    const col = markerColor(d), out = outForMonths(d), best = bestForMonths(d);
    return `<i data-id="${d.id}" class="${out ? "out" : ""} ${best ? "best" : ""} ${isRoute(d) ? "route" : ""}" style="background:${col};${col === NODATA ? "box-shadow:inset 0 0 0 1.5px #6f6e69" : ""}"></i>`;
  }).join("");
  return `<div class="zname" data-zone="${g.key}">${esc(g.name)} <span>${g.shown.length}</span></div><div class="zdots">${dots}</div>`;
}

function buildZones(merged) {
  const layer = $("#zoneLayer");
  layer.querySelectorAll(".zpill").forEach(e => e.remove());
  zoneEls = groupsFor(merged).map(g => {
    const el = document.createElement("div");
    el.className = "zpill"; el.innerHTML = pillHTML(g);
    layer.appendChild(el);
    return { g, el, w: 0, h: 0 };
  });
  zoneEls.forEach(z => { z.w = z.el.offsetWidth; z.h = z.el.offsetHeight; });
}

/** Place pills at their anchors, then push overlapping pills apart. Returns the largest displacement. */
function layoutZones() {
  const W = map.getContainer().clientWidth, H = map.getContainer().clientHeight, pad = 6, margin = 24;
  const boxes = [];
  // On a phone the whole world can't fit across the screen, so regions off to the side get a small
  // edge tab ("‹ Japan 10") instead of disappearing. Only in the world view, not once zoomed in.
  const hints = W < 600 && map.getZoom() < 1.5;
  zoneEls.forEach(z => {
    const p = map.project([z.g.lon, z.g.lat]);
    const onScreen = p.x > -margin && p.x < W + margin && p.y > -margin && p.y < H + margin;
    const side = !onScreen && hints && p.y > -margin && p.y < H + margin ? (p.x < 0 ? "left" : "right") : null;
    if (z.el.classList.contains("edge") !== !!side || z.el.dataset.side !== (side || "")) {
      z.el.classList.toggle("edge", !!side); z.el.dataset.side = side || "";
      z.w = z.el.offsetWidth; z.h = z.el.offsetHeight;
    }
    z.el.style.display = onScreen || side ? "" : "none";
    if (onScreen) boxes.push({ z, ax: p.x, ay: p.y, x: p.x - z.w / 2, y: p.y - z.h / 2, w: z.w, h: z.h });
    else if (side) boxes.push({ z, ax: p.x, ay: p.y, x: side === "left" ? 4 : W - z.w - 4, y: p.y - z.h / 2, w: z.w, h: z.h, edge: true });
  });
  for (let it = 0; it < 120; it++) {
    let moved = false;
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) + pad;
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) + pad;
      if (ox > 0 && oy > 0) {
        moved = true;
        if (oy < ox) { const s = (a.ay + a.h / 2 < b.ay + b.h / 2 || (a.ay === b.ay && i < j)) ? -1 : 1; a.y += s * oy / 2; b.y -= s * oy / 2; }
        else { const s = a.ax < b.ax ? -1 : 1; a.x += s * ox / 2; b.x -= s * ox / 2; }
      }
    }
    boxes.forEach(b => { b.x = Math.max(4, Math.min(W - b.w - 4, b.x)); b.y = Math.max(4, Math.min(H - b.h - 4, b.y)); });
    if (!moved) break;
  }
  let maxDisp = 0, lines = "";
  boxes.forEach(b => {
    b.z.el.style.transform = `translate(${Math.round(b.x)}px, ${Math.round(b.y)}px)`;
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2, disp = Math.hypot(cx - b.ax, cy - b.ay);
    b.z.disp = b.edge ? 0 : disp;
    if (b.edge) return;
    maxDisp = Math.max(maxDisp, disp);
    if (disp > b.h / 2 + 4) {
      // leader line from the true location to the nearest edge of the pill
      const ex = Math.max(b.x, Math.min(b.ax, b.x + b.w)), ey = Math.max(b.y, Math.min(b.ay, b.y + b.h));
      lines += `<line x1="${b.ax}" y1="${b.ay}" x2="${ex}" y2="${ey}"/><circle cx="${b.ax}" cy="${b.ay}" r="2.5"/>`;
    }
  });
  $("#zoneLines").innerHTML = lines;
  return maxDisp;
}

function setPinLayers(visible) {
  ["points", "routes", "clusters", "cluster-count", "labels", "kids", "kids-labels", "kidlinks", "kidlinks-casing"].forEach(id => map.getLayer(id) && map.setLayoutProperty(id, "visibility", visible ? "visible" : "none"));
}

/** Decide tier for the current zoom and (re)build. Called on zoomend and on filter changes. */
function renderZones() {
  if (!map?.getLayer("points")) return;
  const layer = $("#zoneLayer");
  if (map.getZoom() >= ZONE_TIER_MAX) {
    zoneTier = "pins"; layer.classList.add("hidden"); setPinLayers(true); zoneEls = []; return;
  }
  layer.classList.remove("hidden"); setPinLayers(false);
  // Start with one pill per region. Where pills had to be pushed far from their real location to fit
  // (crowded parts of the world, small screens), merge that part of the world into one bigger pill.
  // Roomy areas keep their detail, and zooming in brings the regions back.
  const merged = new Set(), limit = Math.max(28, Math.min(70, map.getContainer().clientWidth / 18));
  buildZones(merged); layoutZones();
  // only at world scale: once someone zooms in to a part of the world, always show its regions
  for (let pass = 0; pass < 4 && map.getZoom() < 2.2; pass++) {
    const crowded = zoneEls.filter(z => z.el.style.display !== "none" && z.disp > limit && !merged.has(z.g.macro)).map(z => z.g.macro);
    if (!crowded.length) break;
    crowded.forEach(m => merged.add(m));
    buildZones(merged); layoutZones();
  }
  zoneTier = merged.size ? "mixed" : "zone";
}

function bindZoneEvents() {
  map.on("zoomend", renderZones);
  map.on("zoom", refreshKidPositions);
  map.on("move", () => { if (zoneEls.length && !zoneRaf) zoneRaf = requestAnimationFrame(() => { zoneRaf = 0; layoutZones(); }); });
  map.on("resize", renderZones);
  const layer = $("#zoneLayer");
  // let the scroll wheel zoom the map even when the pointer is over a pill
  layer.addEventListener("wheel", (e) => { e.preventDefault(); map.getCanvas().dispatchEvent(new WheelEvent("wheel", e)); }, { passive: false });
  layer.addEventListener("mouseover", (e) => {
    const dot = e.target.closest("i[data-id]"), nm = e.target.closest(".zname");
    if (dot) { const d = BY_ID[dot.dataset.id]; showTip(`<b>${esc(d.name)}</b><br>${CAT[d.category].label}${subLabel(d) ? " · " + esc(subLabel(d)) : ""}<br>${esc(condText(d))}`, e.clientX, e.clientY); }
    else if (nm) {
      const z = zoneEls.find(z => z.g.key === nm.dataset.zone);
      if (z) showTip(`<b>${esc(z.g.name)}</b><br>` + z.g.shown.map(d => `<span style="color:${markerColor(d) === NODATA ? "#8a8984" : markerColor(d)}">●</span> ${esc(d.name)} <span style="opacity:.7">${liveCond(d) ? COND[liveCond(d)].label.toLowerCase() : ""}</span>`).join("<br>") + `<br><span style="opacity:.7">Click to zoom in</span>`, e.clientX, e.clientY);
    }
  });
  layer.addEventListener("mouseout", (e) => { if (e.target.closest("i[data-id], .zname")) hideTip(); });
  layer.addEventListener("click", (e) => {
    const dot = e.target.closest("i[data-id]"), pill = e.target.closest(".zpill");
    hideTip();
    if (dot) { openDetail(dot.dataset.id, true); return; }
    if (pill) {
      const z = zoneEls.find(z => z.el === pill); if (!z) return;
      const b = new maplibregl.LngLatBounds(); z.g.shown.forEach(d => b.extend([d.lon, d.lat]));
      // a merged pill opens up into its regions; a region pill zooms on to the individual places
      map.fitBounds(b, z.g.key.startsWith("m:") ? { padding: 60, maxZoom: ZONE_TIER_MAX - 0.3 } : { padding: 80, maxZoom: 7, minZoom: ZONE_TIER_MAX + 0.2 });
    }
  });
}

/** Warm, neutral basemap: sand-yellow water and cream land, so the coloured dots stand out. */
function winterizeBasemap() {
  for (const l of map.getStyle().layers) {
    const id = l.id;
    try {
      if (l.type === "background") map.setPaintProperty(id, "background-color", "#fbf9f2");
      else if (l.type === "fill" && /water|ocean|lake/.test(id)) map.setPaintProperty(id, "fill-color", "#ebe2c3");
      else if (l.type === "line" && /water|river|stream/.test(id)) map.setPaintProperty(id, "line-color", "#e2d7b2");
      else if (l.type === "fill" && /glacier|ice/.test(id)) map.setPaintProperty(id, "fill-color", "#ffffff");
      else if (l.type === "fill" && /landcover|landuse|park|wood|grass/.test(id)) map.setPaintProperty(id, "fill-color", "#eef0e2");
      else if (l.type === "symbol" && /water/.test(id)) map.setPaintProperty(id, "text-color", "#9a8c5e");
      else if (l.type === "line" && /boundary|admin/.test(id)) map.setPaintProperty(id, "line-color", "#bdb59a");
    } catch (e) { /* layer doesn't support that property: skip */ }
  }
}

function fitAll(animate = true) {
  const c = map.getContainer(), W = c.clientWidth, H = c.clientHeight;
  // the map can't zoom out past the point where the world fills the screen's height
  const zMin = Math.log2(H / 512), span = W / (512 * 2 ** zMin) * 360;
  if (span < 300) {
    // narrow screen: the whole world doesn't fit across, so centre on the stretch with the most places
    let best = 0, bestN = -1;
    for (let lon = -180 + span / 2; lon <= 180 - span / 2; lon += 5) {
      const n = DEST.filter(d => Math.abs(d.lon - lon) < span / 2 - 8).length;
      if (n > bestN) { bestN = n; best = lon; }
    }
    map[animate ? "easeTo" : "jumpTo"]({ center: [best, 25], zoom: zMin + 0.01 });
    return;
  }
  const b = new maplibregl.LngLatBounds();
  DEST.forEach(d => b.extend([d.lon, d.lat]));
  map.fitBounds(b, { padding: { top: 40, bottom: 40, left: 40, right: 90 }, animate });
}

function popupHTML(d) {
  const c = condOf(d), r = liveCond(d);
  const ft = fitText(d), month = ft ? `${monthsLabel()}: ${ft.text}` : "";
  return `<div class="pop">
    <h4>${esc(d.name)}</h4>
    <div class="row"><span style="color:${CAT[d.category].color}">${isRoute(d) ? "◆" : "●"}</span> ${esc(typeLine(d))} · ${esc(d.country)}</div>
    ${isRoute(d) ? "" : `<div class="row muted">${esc(subLabel(d))}</div>`}
    <div class="big">${r ? `<span style="color:${COND[r].color}">●</span> ` : ""}<b>${esc(condText(d))}</b></div>
    ${r ? `<div class="row">${esc(c.rated.reasons[0])}</div>` : ""}
    ${d.stats ? `<div class="row">${statsText(d)}</div>` : ""}
    ${month ? `<div class="row">${month}</div>` : ""}
    ${d.advisory ? `<div class="row" style="color:#a3341f">⚠ Travel advisory: see details</div>` : ""}
    <div class="row muted">${c?.asOf ? `Forecast from ${fmtDate(c.asOf)}${staleNote(d) ? ` <span class="stale-tag">· out of date</span>` : ""} · ` : ""}click for details</div>
  </div>`;
}

function refresh() {
  persist();
  if (map?.getSource("dest")) map.getSource("dest").setData(features());
  if (map?.getSource("kids")) map.getSource("kids").setData(kidFeatures());
  if (map?.getSource("kidlinks")) map.getSource("kidlinks").setData(kidLinkFeatures());
  renderZones();
  renderList();
  renderLegend();
  renderFilterBar();
  renderTray();
  if (state.selected) renderDetail(state.selected);
}

// ---------- sidebar ----------
const FILTER_DEFAULTS = { picks: [], types: Object.fromEntries(Object.keys(CHIPS).map(k => [k, []])), months: [], hideOut: false, minCond: "any", wxChips: [], crowdMax: 5, search: "" };
const activeFilters = () => state.picks.length + Object.values(state.types).reduce((a, x) => a + x.length, 0) + state.months.length + (state.hideOut ? 1 : 0) + (state.minCond !== "any" ? 1 : 0) + state.wxChips.length + (state.crowdMax < 5 ? 1 : 0) + (state.search.trim() ? 1 : 0);
function clearFilters() {
  Object.assign(state, structuredClone(FILTER_DEFAULTS));
  $("#search").value = "";
  renderControls(); refresh();
}
function renderFilterBar() {
  const n = activeFilters();
  $("#filterCount").textContent = n ? `· ${n} on` : "";
  $("#clearAll").disabled = !n;
}
function renderControls() {
  const any = anyPicked();
  const rowState = (k) => state.picks.includes(k) ? "sel" : state.types[k].length ? "part" : any ? "off" : "";
  const chips = (k) => `<div class="subs">${Object.entries(CHIPS[k]).map(([v, l]) => { const on = state.types[k].includes(v);
    return `<button class="chip ${on ? "on" : ""}" data-of="${k}" data-type="${v}" aria-pressed="${on}">${l}</button>`; }).join("")}${info("chips_" + k)}</div>`;
  $("#catToggles").innerHTML = Object.entries({ ...CAT, multi: MULTI }).map(([k, c]) => `
    <button type="button" class="cat-row ${rowState(k)} ${k === "multi" ? "multi" : ""}" data-cat="${k}" aria-pressed="${state.picks.includes(k)}" style="--c:${c.color}"><span class="dot" aria-hidden="true"></span><b>${c.label}</b><span class="muted" style="font-size:12px">${c.desc}</span></button>
    ${chips(k)}
  `).join("") + `<div class="pick-note">${any ? `Showing only what you've selected · <a href="#" id="clearPicks">show everything</a>` : "Showing everything · tap any category or type to show only those"}</div>`;
  $("#clearPicks") && ($("#clearPicks").onclick = (e) => { e.preventDefault(); state.picks = []; for (const k in state.types) state.types[k] = []; renderControls(); refresh(); });
  $("#months").innerHTML = MONTHS.map((m, i) => `<button data-m="${i + 1}" class="${state.months.includes(i + 1) ? "on" : ""}">${m}</button>`).join("") +
    `<button data-m="" class="any ${state.months.length ? "" : "on"}">Any time</button>`;
  $("#hideOut").checked = state.hideOut;
  document.querySelectorAll("#colorBy button").forEach(b => b.classList.toggle("on", b.dataset.v === state.colorBy));
  document.querySelectorAll("#crowdMax button").forEach(b => b.classList.toggle("on", +b.dataset.v === state.crowdMax));
  document.querySelectorAll("#minCond button").forEach(b => b.classList.toggle("on", b.dataset.v === state.minCond));
  wxCSS(); $("#wxChips").innerHTML = wxChipsHTML("rain", state.wxChips, state.wxWhen);
  $("#sortBy").value = state.sort;
}

function bindControls() {
  $("#catToggles").addEventListener("click", (e) => {
    const row = e.target.closest("[data-cat]"), chip = e.target.closest("[data-type]");
    const toggle = (arr, v) => arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v];
    if (chip) {
      // a chip selects just that kind; if its whole category was selected, narrow the category to this chip
      const cat = chip.dataset.of, v = chip.dataset.type;
      if (state.picks.includes(cat)) { state.picks = state.picks.filter(x => x !== cat); state.types[cat] = [v]; }
      else state.types[cat] = toggle(state.types[cat], v);
    } else if (row) {
      // a category row selects (or deselects) the whole category, replacing any chips within it
      const cat = row.dataset.cat;
      state.picks = toggle(state.picks, cat);
      state.types[cat] = [];
    }
    renderControls(); refresh();
  });
  $("#months").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (!b.dataset.m) state.months = [];
    else { const m = +b.dataset.m; state.months = state.months.includes(m) ? state.months.filter(x => x !== m) : [...state.months, m].sort((a, b) => a - b); }
    renderControls(); refresh();
  });
  $("#hideOut").addEventListener("change", (e) => { state.hideOut = e.target.checked; refresh(); });
  $("#colorBy").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; state.colorBy = b.dataset.v; state.colorByChosen = true; renderControls(); refresh(); });
  $("#crowdMax").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; state.crowdMax = +b.dataset.v; renderControls(); refresh(); });
  $("#wxChips").addEventListener("click", (e) => {
    const c = e.target.closest("[data-wxchip]"), w = e.target.closest("[data-wxwhen]");
    if (c) { const k = c.dataset.wxchip; state.wxChips = state.wxChips.includes(k) ? state.wxChips.filter(x => x !== k) : [...state.wxChips, k]; }
    else if (w) state.wxWhen = w.dataset.wxwhen; else return;
    renderControls(); refresh();
  });
  // count clicks on the plan-it links (forecast, directions, flights)
  document.addEventListener("click", (e) => { const a = e.target.closest("a[data-out]"); if (a) track(`out ${a.dataset.out} ${state.selected || ""}`.trim(), a.textContent.replace(" ↗", "")); });
  $("#minCond").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; state.minCond = b.dataset.v; renderControls(); refresh(); });
  $("#search").addEventListener("input", (e) => { state.search = e.target.value; refresh(); });
  $("#sortBy").addEventListener("change", (e) => { state.sort = e.target.value; refresh(); });
  $("#list").addEventListener("click", (e) => { const li = e.target.closest("li[data-id]"); if (li) openDetail(li.dataset.id, true); });
  $("#clearAll").addEventListener("click", clearFilters);
  const desktop = () => window.innerWidth > 820;
  const setSidebar = (open) => {
    if (desktop()) {
      document.body.classList.toggle("sb-collapsed", !open); state.sbCollapsed = !open; persist();
      map?.resize(); renderZones();
      return;
    }
    $("#sidebar").classList.toggle("open", open); document.body.classList.toggle("sb-open", open);
  };
  document.body.classList.toggle("sb-collapsed", !!state.sbCollapsed);
  $("#brandChip").addEventListener("click", () => setSidebar(true));
  $("#toggleSidebar").addEventListener("click", () => setSidebar(desktop() ? true : !$("#sidebar").classList.contains("open")));
  for (const id of ["#closeSidebar", "#showMap", "#sbBackdrop"]) $(id).addEventListener("click", () => setSidebar(false));
  openSidebar = () => setSidebar(true);
}
let openSidebar = () => {};

// One-time welcome card: two ways in, then it never shows again
function showWelcome() {
  if (state.welcomed || new URLSearchParams(location.search).has("nowelcome")) return;
  const el = $("#welcome");
  el.innerHTML = `
    <h2 id="welcomeTitle">Welcome to Wayward Bike</h2>
    <p>A map of ${Math.floor(DEST.length / 10) * 10}+ places to ride worldwide, from bike parks and famous climbs to gravel back roads and multi-day routes, with riding conditions updated daily.</p>
    <div class="welcome-btns">
      <button class="primary" data-welcome="now">Where's good right now?</button>
      <button data-welcome="explore">Explore beyond the usual</button>
    </div>
    <p class="muted">Tap any dot for its card. Filters live in the side panel.</p>`;
  el.classList.remove("hidden");
  el.onclick = (e) => {
    const b = e.target.closest("[data-welcome]"); if (!b) return;
    state.welcomed = true; el.classList.add("hidden"); track(`welcome ${b.dataset.welcome}`);
    if (b.dataset.welcome === "now") {
      state.colorBy = "cond"; state.colorByChosen = true; renderControls(); refresh();
      openSidebar();
      const sec = $("#wxChips").closest("section");
      setTimeout(() => { sec.scrollIntoView({ behavior: "smooth", block: "start" }); sec.classList.add("flash"); setTimeout(() => sec.classList.remove("flash"), 2200); }, 250);
    } else persist();
  };
}

function renderLegend() {
  $("#legend").innerHTML = state.colorBy === "cond"
    ? Object.values(COND).map(c => `<span><i style="background:${c.color}"></i>${c.label}</span>`).join("") + `<span><i style="background:#fff;border:1.5px solid #6f6e69"></i>no data / off-season</span><span><i class="route-key"></i>multi-day route</span><span class="muted" style="width:100%">Riding conditions over the next 7 days. Ring = main type.</span>`
    : Object.values(CAT).map(c => `<span><i style="background:${c.color}"></i>${c.label}</span>`).join("") + `<span><i class="route-key"></i>multi-day route</span>` + (state.months.length ? `<span class="muted" style="width:100%">Ringed dot = a best month · faded = out of season in all picked months</span>` : "");
}

function renderList() {
  let list = DEST.filter(passes);
  const rank = (d) => COND_ORDER.indexOf(liveCond(d));
  const key = {
    name: (a, b) => a.name.localeCompare(b.name),
    cond: (a, b) => rank(b) - rank(a) || zoneOrder(a) - zoneOrder(b),
    zone: (a, b) => zoneOrder(a) - zoneOrder(b) || a.name.localeCompare(b.name),
  }[state.sort] || ((a, b) => zoneOrder(a) - zoneOrder(b));
  list.sort(key);
  $("#count").textContent = list.length;
  $("#countMap").textContent = list.length === 1 ? "1 place" : `${list.length} places`;
  const hidden = DEST.length - list.length;
  $("#hiddenNote").innerHTML = hidden ? `${hidden} of ${DEST.length} hidden by filters · <a href="#" id="resetFilters">show all</a>` : "";
  $("#resetFilters") && ($("#resetFilters").onclick = (e) => { e.preventDefault(); clearFilters(); });
  let lastZone = null;
  $("#list").innerHTML = list.map(d => {
    const r = liveCond(d), st = status(d);
    const pill = r ? COND[r].label.toLowerCase() : st.key === "off" ? "off-season" : "–";
    const head = state.sort === "zone" && d.zone !== lastZone ? `<li class="group">${esc(ZONES[d.zone]?.name)}<span>${esc(MACROS[ZONES[d.zone]?.macro] ?? "")}</span></li>` : "";
    lastZone = d.zone;
    const dim = outForMonths(d);
    return `${head}<li data-id="${d.id}" class="${dim ? "dim" : ""}"><span class="dot ${isRoute(d) ? "route" : ""}" style="background:${markerColor(d)};${markerColor(d) === NODATA ? "border:1.5px solid #6f6e69" : ""}"></span>
      <span>${esc(d.name)}<div class="sub">${esc(d.country)}${subLabel(d) ? " · " + esc(subLabel(d)) : ""}</div></span>
      <span class="pill" title="${esc(st.label)}">${pill}</span></li>`;
  }).join("");
}

// ---------- detail ----------
// Map links generated from coordinates, chosen by the kind of riding:
// mountain bike → Trailforks (trails, difficulty, conditions); road/gravel → Komoot (route planner, rider highlights);
// everyone → Strava's heatmap (where people actually ride, set to the right sport) and CalTopo topo (terrain).
const trailMapUrl = (lat, lon, z = 12) => `https://www.trailforks.com/map/?z=${z}&lat=${lat}&lon=${lon}`; // Trailforks ignores ll=
const heatmapUrl = (lat, lon, z = 12, disc = "road") => `https://www.strava.com/maps/global-heatmap?sport=${({ mtb: "MountainBikeRide", gravel: "GravelRide", road: "Ride" })[disc]}&style=standard#${z}/${lat}/${lon}`;
const komootUrl = (lat, lon, z = 12) => `https://www.komoot.com/plan/@${lat},${lon},${z}z`;
const topoUrl = (lat, lon, z = 12) => `https://caltopo.com/map.html#ll=${lat},${lon}&z=${z}&b=mbt`;
/** the disciplines a place (or one of its highlights) is about: a highlight's own kind wins */
const discsOf = (d, c) => c ? (["area", "park"].includes(kidKind(c)) ? ["mtb"] : kidKind(c) === "climb" ? ["road"] : [d.category])
  : d.offers ? Object.keys(d.offers) : [d.category];
// A web search that lands on useful pages: the place's plain name (no bracketed lists), where it is, and what kind of riding.
const plainName = (n) => n.replace(/\s*\(.*?\)\s*/g, " ").replace(/\s+/g, " ").trim();
const searchUrl = (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`;
const rideWord = (d) => ({ mtb: "mountain biking", road: "road cycling", gravel: "gravel riding" })[d.category];
const destSearch = (d) => searchUrl(`${plainName(d.name)} ${d.country} ${d.stats ? "bike route" : rideWord(d)}`);
const kidSearch = (c, d) => searchUrl(`${plainName(c.name)} ${d.region} ${kidKind(c) === "climb" ? "cycling climb" : rideWord(d)}`);
const climbSearch = (c, d) => searchUrl(`${plainName(c.name)} ${d.country} climb profile gradient (PJAMM OR climbfinder)`);
const tourSearch = (t, d) => searchUrl(`${plainName(t.name)} ${d.region} ${rideWord(d)}`);
const searchLink = (url, label = "web search") => `<a href="${url}" target="_blank" rel="noopener" class="search-link" title="Search the web for this place"><svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"><circle cx="6.5" cy="6.5" r="4.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10 10l4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>${label} ↗</a>`;
const mapLinks = (d, short = false, lat = d.lat, lon = d.lon, z = d.stats ? 8 : d.children ? 11 : 12, c = null) => {
  const ds = discsOf(d, c), main = c ? ds[0] : d.category;
  const a = (url, label) => `<a href="${url}" target="_blank" rel="noopener">${label} ↗</a>`;
  return [
    ds.includes("mtb") && a(trailMapUrl(lat, lon, z), short ? "trails" : "Trailforks"),
    a(heatmapUrl(lat, lon, z, main), short ? "heatmap" : "Strava heatmap"),
    (ds.includes("road") || ds.includes("gravel")) && a(komootUrl(lat, lon, z), "Komoot"),
    a(topoUrl(lat, lon, z), "topo")].filter(Boolean);
};
const hostLabel = (u) => { try { const h = new URL(u).hostname.replace(/^www\./, ""); return h; } catch { return u; } };
// Plan-it links, built from coordinates
const meteoblueUrl = (d) => `https://www.meteoblue.com/en/weather/week/${(+d.lat).toFixed(3)}N${(+d.lon).toFixed(3)}E${d.refElev ? Math.round(d.refElev) : ""}`;
const windyUrl = (d) => `https://www.windy.com/?${d.lat},${d.lon},10`;
const directionsUrl = (d) => `https://www.google.com/maps/dir/?api=1&destination=${d.lat},${d.lon}`;
// "Getting there" sometimes names a route's start town rather than an airport: these places get a hand-picked airport instead
const FLY_TO = { lhasakathmandu: "Lhasa", arizonatrail: "Tucson", maahdaahey: "Bismarck", oregontimber: "Medford", blueridge: "Charlottesville",
  oregoncoast: "Portland", raidpyreneen: "Biarritz", claudia: "Munich", hebrides: "Glasgow", c2c: "Newcastle", highland550: "Glasgow",
  manalileh: "Kullu", transam: "Portland", bigbend: "Midland", moselrhine: "Luxembourg", curonian: "Palanga", lejog: "Newquay",
  medellin: "Medellín", vallnord: "Barcelona" };
const flightsTo = (d) => FLY_TO[d.id] || (d.airport || "").split(/[,/;~(]| \d| then | or /)[0].trim().replace(/ airport$/i, "");
const outLink = (url, label, kind) => `<a href="${url}" target="_blank" rel="noopener" data-out="${kind}">${label} ↗</a>`;
const forecastLinks = (d) => [outLink(meteoblueUrl(d), "meteoblue", "meteoblue"), outLink(windyUrl(d), "Windy", "windy")];
const travelLinks = (d) => [!d.stats && outLink(directionsUrl(d), "Directions", "directions"), // routes: no single place to drive to
  flightsTo(d) && outLink(`https://www.google.com/travel/flights?q=${encodeURIComponent("Flights to " + flightsTo(d))}`, `Flights to ${esc(flightsTo(d))}`, "flights")].filter(Boolean);
const fcUrl = (d) => `https://api.open-meteo.com/v1/forecast?latitude=${d.lat}&longitude=${d.lon}&elevation=${d.refElev}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max&past_days=3&forecast_days=7&timezone=auto`;
function openDetail(id, fly) {
  popup?.remove(); // the full panel replaces the hover preview
  track(`open ${id}`, BY_ID[id]?.name);
  state.selected = id;
  const d = BY_ID[id];
  if (fly) map.flyTo({ center: [d.lon, d.lat], zoom: Math.max(map.getZoom(), d.children ? 7 : 7.5), speed: 1.4, padding: panelPadding() });
  markGroup(d);
  map.getSource("sel")?.setData({ type: "Feature", geometry: { type: "Point", coordinates: [d.lon, d.lat] }, properties: {} });
  $("#sidebar").classList.remove("open"); document.body.classList.remove("sb-open");
  renderDetail(id);
}
let markedGroup = null;
function markGroup(d, on = -1) {
  markedGroup = d ? [d, on] : null;
  map.getSource("children")?.setData({ type: "FeatureCollection", features: (d?.children || []).map((c, i) => ({ type: "Feature", geometry: { type: "Point", coordinates: kidPos(d, c, i) }, properties: { on: i === on } })) });
}
/** keep nudged sub-area dots (and their links and rings) in step with the zoom */
let kidRaf = 0;
function refreshKidPositions() {
  if (kidRaf) return;
  kidRaf = requestAnimationFrame(() => {
    kidRaf = 0;
    map.getSource("kids")?.setData(kidFeatures());
    map.getSource("kidlinks")?.setData(kidLinkFeatures());
    if (markedGroup) markGroup(...markedGroup);
  });
}
const toursList = (d, filter) => `<ul class="tours">${d.tours.filter(t => !filter || filter(t)).map(t => `<li><b>${esc(t.name)}</b>${t.grade ? ` <span class="muted">· ${esc(t.grade)}</span>` : ""} ${searchLink(tourSearch(t, d), "search")}<div>${esc(t.note)}</div></li>`).join("")}</ul>`;
/** A lighter card for one area inside a destination (Slickrock inside Moab, the Stelvio inside Bormio). */
function openSub(id, i) {
  popup?.remove(); // the full panel replaces the hover preview
  const d = BY_ID[id], c = d?.children?.[i]; if (!c) return;
  track(`open ${id} / ${c.name}`, `${c.name} (${d.name})`);
  state.selected = id;
  const k = kidKind(c), col = CAT[d.category].color;
  map.getSource("sel")?.setData({ type: "Feature", geometry: { type: "Point", coordinates: [d.lon, d.lat] }, properties: {} });
  markGroup(d, i);
  map.flyTo({ center: [c.lon, c.lat], zoom: Math.max(map.getZoom(), 10), speed: 1.4, padding: panelPadding() });
  $("#sidebar").classList.remove("open"); document.body.classList.remove("sb-open");
  const el = $("#detail"); el.classList.remove("hidden"); el.scrollTop = 0;
  el.innerHTML = `
    <div class="sticky-close"><button class="close" id="detailClose" aria-label="Close">×</button></div>
    <a href="#" class="crumb" id="toParent">‹ ${esc(plainName(d.name))}</a>
    <div class="d-type"><span class="dot" style="background:${col}"></span>${KID_KINDS[k]} · part of ${esc(plainName(d.name))}</div>
    <h3>${esc(c.name)}</h3>
    <div class="muted" style="font-size:13px">${esc(d.region)}, ${esc(d.country)}</div>
    <p class="pitch">${esc(c.note)}</p>
    ${c.more ? `<p style="font-size:14px;line-height:1.5">${esc(c.more)}</p>` : ""}
    <div class="section-title">Look it up</div>
    <div class="sub-links">${[c.url && `<a href="${c.url}" target="_blank" rel="noopener">${hostLabel(c.url)} ↗</a>`, ...mapLinks(d, false, c.lat, c.lon, 13, c), kidKind(c) === "climb" && searchLink(climbSearch(c, d), "climb profile"), searchLink(kidSearch(c, d))].filter(Boolean).join(" · ")}</div>
    <div class="section-title">Conditions, season &amp; essentials</div>
    <div class="callout">Shared with the whole destination: <b>${esc(plainName(d.name))}</b> has <b>${esc(condText(d).toLowerCase())}</b>, best ${d.best.map(m => MONTHS[m - 1]).join(", ") || "any month"}.
      <div style="margin-top:8px"><button class="btn primary" id="parentCard">Full card for ${esc(plainName(d.name))}</button>${STORIES[id] ? ` <button class="btn" id="readMore">Read more →</button>` : ""}</div></div>
    ${d.children.length > 1 ? `<div class="section-title">Other areas in ${esc(plainName(d.name))}</div><ul class="children">${d.children.map((x, j) => j === i ? "" : `<li data-i="${j}"><span class="dot sm" style="background:${col}"></span><div><b>${esc(x.name)}</b></div><span class="chev" aria-hidden="true">›</span></li>`).join("")}</ul>` : ""}
    <div class="fb-line">Spot something off, or know this place well? <button type="button" class="link-btn" data-feedback="${esc(c.name + " (" + plainName(d.name) + ")")}">Send feedback</button></div>
  `;
  $("#detailClose").onclick = closeDetail;
  const back = (e) => { e?.preventDefault(); openDetail(id, true); };
  $("#toParent").onclick = back; $("#parentCard").onclick = back;
  if (STORIES[id]) $("#readMore").onclick = () => openStory(id);
  el.querySelectorAll(".children li").forEach(li => li.onclick = () => openSub(id, +li.dataset.i));
}
// keep the target visible beside (desktop) or above (mobile) the detail panel
function panelPadding() {
  return window.innerWidth > 820 ? { right: 420, left: 0, top: 0, bottom: 0 } : { bottom: Math.round(window.innerHeight * 0.6), top: 0, left: 0, right: 0 };
}
function closeDetail() {
  state.selected = null;
  $("#detail").classList.add("hidden");
  markGroup(null);
  map.getSource("sel")?.setData({ type: "FeatureCollection", features: [] });
}

function renderDetail(id) {
  const d = BY_ID[id], c = condOf(d), st = status(d), r = liveCond(d);
  const inCmp = state.compare.some(x => x.id === id);
  const el = $("#detail");
  el.classList.remove("hidden");
  el.innerHTML = `
    <div class="sticky-close"><button class="close" id="detailClose" aria-label="Close">×</button></div>
    <div class="d-type"><span class="dot ${isRoute(d) ? "route" : ""}" style="background:${CAT[d.category].color}"></span>${esc(typeLine(d))}</div>
    <h3>${esc(d.name)}</h3>
    <div class="muted" style="font-size:13px">${esc(d.region)}, ${esc(d.country)}</div>
    <p class="pitch">${esc(d.pitch)}</p>
    ${d.advisory ? `<div class="callout warn"><b>⚠ Travel advisory.</b> ${esc(d.advisory)}</div>` : ""}
    ${isRoute(d) ? "" : `<div class="offers">${Object.entries(d.offers).map(([c, xs]) => `<div><span class="dot sm" style="background:${CAT[c].color}"></span><b>${CAT[c].label}</b> ${xs.map(x => `<span class="offer">${OFFERS[c][x]}</span>`).join("")}</div>`).join("")}<div class="note" style="margin:2px 0 0">What you can ride from here ${info("offers")}</div></div>`}
    ${d.stats ? `<div class="route-stats"><div><b>${num(d.stats.km)}</b><span>km</span></div><div><b>${d.stats.days}</b><span>days</span></div><div><b>~${num(d.stats.climb)}</b><span>m climbing ${info("route")}</span></div></div><div class="note" style="margin:-6px 0 10px">${SUPPORT[d.support]} ${info("support")}</div>` : ""}
    <div class="actions">
      <button class="btn primary" id="addCmp" ${inCmp || state.compare.length >= 6 ? "disabled" : ""}>${inCmp ? "In compare ✓" : "+ Compare"}</button>
      <button class="btn" id="zoomTo">Zoom to</button>
      ${STORIES[id] ? `<button class="btn" id="readMore">Read more →</button>` : ""}
    </div>

    <div class="section-title">Riding conditions ${info("cond")}</div>
    ${staleNote(d) ? `<div class="callout"><b>Out of date.</b> ${staleNote(d)}</div>` : ""}
    <div class="snowcard">
      ${c?.rated ? `
      <div class="wx-sub">Next 7 days</div>
      <div class="snow-head">
        <div><div class="hero" style="${r ? "" : "color:#8a8984"}">${r ? `<i class="cdot" style="background:${COND[r].color}"></i>${COND[r].label}` : "n/a"}</div><div class="hero-sub">${r ? "next 7 days" : esc(st.label)}</div></div>
        <div class="hero-sub" style="flex:1">${r ? c.rated.reasons.map(esc).join("<br>") : `Forecast for the next 7 days, for reference: ${c.rated.reasons.map(esc).join("; ")}`}</div>
      </div>
      <div class="days">${c.next7.map(x => `<div class="day ${x.rain >= 3 ? "wet" : ""}"><b>${weekday(x.date)}</b><span class="hi">${Math.round(x.tmax)}°</span><span class="lo">${Math.round(x.tmin)}°</span><span class="rain">${x.rain >= 0.5 ? (x.rain < 10 ? x.rain.toFixed(1) : Math.round(x.rain)) + " mm" : "dry"}</span></div>`).join("")}</div>
      ${c.wx ? `<div class="wx-sub">Right now</div>${wxStripHTML(c.wx, { kind: "rain", where: `at ~${num(d.refElev)} m (modelled)` })}` : ""}
      <div class="note">Last 3 days: ${c.past3rain} mm of rain${c.snowDepth ? ` · snow on the ground ~${c.snowDepth} cm` : ""}. Modelled at ~${num(d.refElev)} m${d.stats ? ", near the middle of the route, so its ends can be very different" : ""}. Forecast from ${fmtDate(c.asOf)} via Open-Meteo · <a href="${fcUrl(d)}" target="_blank" rel="noopener">raw forecast ↗</a></div>`
      : `<p class="note">No conditions data yet for this destination.</p>`}
    </div>

    <div class="section-title">When to go ${info("whenToGo")}</div>
    <div class="season-bar">${MONTHS.map((m, i) => `<div class="${isBest(d, i + 1) ? "best" : inSeason(d, i + 1) ? "in" : ""} ${state.months.includes(i + 1) ? "sel" : ""}">${m[0]}</div>`).join("")}</div>
    <div class="note" style="margin-top:4px">Light = in season · dark = best months · grey = off season</div>

    <div class="section-title">Typical weather by month ${info("weather")}</div>
    <div id="monthBars"></div>
    <div class="note">Rain days per month (bars) and typical daytime high (°C), averaged over 8 years at ~${num(d.refElev)} m. Hover for more.${d.weather ? " " + esc(d.weather) : ""}</div>

    <div class="section-title">Essentials</div>
    <dl class="facts">
      <dt>Terrain</dt><dd>${esc(d.terrain)}</dd>
      <dt>Elevation</dt><dd>${num(d.elev[0])}–${num(d.elev[1])} m</dd>
      <dt>Crowds ${info("crowds")}</dt><dd>${meter(d.crowds)}</dd>
      <dt>Cost ${info("cost")}</dt><dd>${meter(d.cost, 5)}</dd>
      <dt>Guide ${info("guide")}</dt><dd>${esc(d.guide)}</dd>
      <dt>Bike hire ${info("hire")}</dt><dd>${hireText(d)}</dd>
      <dt>Forecast ${info("forecastLinks")}</dt><dd>${forecastLinks(d).join(" · ")}</dd>
      <dt>Getting there</dt><dd>${esc(d.airport)}<div class="note" style="margin-top:2px">${travelLinks(d).join(" · ")}</div></dd>
      <dt>Look it up ${info("lookAround")}</dt><dd>${[...mapLinks(d), searchLink(destSearch(d))].join(" · ")}</dd>
      ${d.links?.website ? `<dt>Website</dt><dd><a href="${d.links.website}" target="_blank" rel="noopener">${hostLabel(d.links.website)} ↗</a></dd>` : ""}
    </dl>

    ${d.children ? `<div class="section-title">Highlights ${info("areas")}</div>
    <div class="note" style="margin:-2px 0 6px">${isRoute(d) ? "A few highlights along the way" : "A few to start with, not every ride"}.</div>
    <ul class="children">${d.children.map((x, i) => `<li data-i="${i}"><span class="dot sm" style="background:${CAT[d.category].color}"></span><div><b>${esc(x.name)}</b> <span class="bc-tag">${KID_KINDS[kidKind(x)].toLowerCase()}</span><div class="muted" style="font-size:12px">${esc(x.note)}</div></div><span class="chev" aria-hidden="true">›</span></li>`).join("")}</ul>` : ""}
    <div class="fb-line">Spot something off, or know this place well? <button type="button" class="link-btn" data-feedback="${esc(plainName(d.name))}">Send feedback</button></div>
  `;
  $("#detailClose").onclick = closeDetail;
  $("#addCmp").onclick = () => addCompare(id);
  if (STORIES[id]) $("#readMore").onclick = () => openStory(id);
  $("#zoomTo").onclick = () => map.flyTo({ center: [d.lon, d.lat], zoom: d.stats ? 6.5 : d.children ? 9 : 10, padding: panelPadding() });
  el.querySelectorAll(".children li").forEach(li => li.onclick = () => openSub(id, +li.dataset.i));
  monthBars($("#monthBars"), c?.climate, { months: state.months, best: d.best });
  bindWxStrips($("#detail") || document);
}

// ---------- compare ----------
function addCompare(id) {
  if (state.compare.some(x => x.id === id) || state.compare.length >= 6) return;
  const used = state.compare.map(x => x.slot);
  const slot = [0, 1, 2, 3, 4, 5].find(i => !used.includes(i));
  state.compare.push({ id, slot });
  refresh();
}
function renderTray() {
  const tray = $("#tray");
  tray.classList.toggle("hidden", !state.compare.length);
  $("#cmpCount").textContent = state.compare.length;
  const body = $("#trayBody");
  body.innerHTML = `<div class="tray-row">
    ${state.compare.map(x => `<span class="tchip"><i style="background:${SLOTS[x.slot]}"></i>${esc(BY_ID[x.id].name)}<button data-rm="${x.id}" aria-label="Remove ${esc(BY_ID[x.id].name)}">×</button></span>`).join("")}
    ${state.compare.length ? `<button class="btn primary" id="openCmp">Compare ${state.compare.length}</button><button class="btn" id="clrCmp">Clear</button>` : ""}
  </div>`;
  body.querySelectorAll("[data-rm]").forEach(b => b.onclick = () => { state.compare = state.compare.filter(x => x.id !== b.dataset.rm); refresh(); });
  $("#openCmp") && ($("#openCmp").onclick = openCompare);
  $("#clrCmp") && ($("#clrCmp").onclick = () => { state.compare = []; refresh(); });
  setTimeout(() => map?.resize(), 0);
}

// ---------- "More about this place" pages (linkable: #place/<id>) ----------
const richText = (t) => esc(t).split(/\n\s*\n/).map(p => `<p>${p.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\*(.+?)\*/g, "<i>$1</i>")}</p>`).join("");
/** A photo with its credit. Photos are Wikimedia Commons files under free licences, shown with author and licence as they require. */
const photoFig = (p, cls = "") => `<figure class="photo ${cls}"><a href="${p.page}" target="_blank" rel="noopener"><img src="${p.src}" alt="${esc(p.alt)}" loading="lazy" /></a><figcaption>${esc(p.caption)} <span class="credit">Photo: ${esc(p.author)}, ${p.licenseUrl ? `<a href="${p.licenseUrl}" target="_blank" rel="noopener">${esc(p.license)}</a>` : esc(p.license)}, via <a href="${p.page}" target="_blank" rel="noopener">Wikimedia Commons</a></span></figcaption></figure>`;
function openStory(id, push = true) {
  const d = BY_ID[id], st = STORIES[id]; if (!d || !st) return;
  track(`read story ${id}`, `Story: ${d.name}`);
  const mo = (m) => m.length ? m.map(x => MONTHS[x - 1]).join(", ") : "any month";
  const links = [d.links?.website && [hostLabel(d.links.website), d.links.website]].filter(Boolean);
  $("#modalBody").innerHTML = `<article class="story">
    <div class="d-type"><span class="dot ${isRoute(d) ? "route" : ""}" style="background:${CAT[d.category].color}"></span>${esc(typeLine(d))}</div>
    <h2>${esc(d.name)}</h2>
    <div class="muted">${esc(d.region)}, ${esc(d.country)}</div>
    <p class="pitch">${esc(d.pitch)}</p>
    ${st.draft ? `<div class="callout"><b>Draft.</b> Not reviewed yet, and hidden on the live site.</div>` : ""}
    ${st.photos?.length ? photoFig(st.photos[0], "hero") : ""}
    <h3>The riding</h3>${richText(st.riding)}
    ${st.photos?.length > 1 ? photoFig(st.photos[1]) : ""}
    <h3>Off the bike</h3>${richText(st.beyond)}
    ${st.photos?.length > 2 ? `<div class="photo-grid">${st.photos.slice(2).map(p => photoFig(p)).join("")}</div>` : ""}
    <h3>Good to know</h3>${richText(st.know)}
    <dl class="facts">
      <dt>Season</dt><dd>${seasonText(d)} · best ${mo(d.best)}</dd>
      ${d.stats ? `<dt>Route</dt><dd>${statsText(d)}</dd>` : ""}
      <dt>Cost ${info("cost")}</dt><dd>${meter(d.cost, 5)}</dd>
      <dt>Crowds ${info("crowds")}</dt><dd>${meter(d.crowds, 5)}</dd>
      <dt>Guide ${info("guide")}</dt><dd>${esc(d.guide)}</dd>
      <dt>Bike hire ${info("hire")}</dt><dd>${hireText(d)}</dd>
      <dt>Getting there</dt><dd>${esc(d.airport)}<div class="note" style="margin-top:2px">${travelLinks(d).join(" · ")}</div></dd>
    </dl>
    <div class="story-links">${[...links.map(([l, u]) => `<a href="${u}" target="_blank" rel="noopener">${esc(l)} ↗</a>`), searchLink(destSearch(d))].join(" · ")}</div>
    ${st.sources?.length ? `<div class="note">Sources: ${st.sources.map(x => `<a href="${x.url}" target="_blank" rel="noopener">${esc(x.label)}</a>`).join(" · ")}</div>` : ""}
    <div class="note">This page describes what a place is like, not turn-by-turn routes. Check current conditions, access and permits before you go.</div>
    <div class="fb-line">Spot something off, or know this place well? <button type="button" class="link-btn" data-feedback="${esc(plainName(d.name))}">Send feedback</button></div>
  </article>`;
  $("#modal").classList.add("story-mode"); $("#modal").classList.remove("hidden");
  $("#modal .modal-card").scrollTop = 0;
  if (push && location.hash !== `#place/${id}`) history.pushState(null, "", `#place/${id}`);
}
/** Feedback form (Tally), opened as a pop-up over the page. Its script loads only on the first click. */
const FEEDBACK_FORM = "LDK2Yv";
let tallyLoad = null;
function loadTally() {
  return tallyLoad ||= new Promise((ok, fail) => {
    const sc = document.createElement("script"); sc.src = "https://tally.so/widgets/embed.js";
    sc.onload = ok; sc.onerror = () => { tallyLoad = null; fail(); }; document.head.appendChild(sc);
  });
}
function openFeedback(place = "", btn = null) {
  track("open feedback");
  const page = !$("#modal").classList.contains("hidden") && $("#modal").classList.contains("story-mode") ? "read-more"
    : !$("#detail").classList.contains("hidden") ? "detail" : "map";
  const hiddenFields = { place, page };
  const fallback = () => window.open(`https://tally.so/r/${FEEDBACK_FORM}?` + new URLSearchParams(hiddenFields), "_blank", "noopener");
  // the first open fetches Tally's script and the form, which takes a moment: say so on the button
  const label = btn?.textContent;
  if (btn) { btn.textContent = "Opening…"; btn.disabled = true; }
  const done = () => { if (btn) { btn.textContent = label; btn.disabled = false; } };
  setTimeout(done, 8000);
  loadTally().then(() => window.Tally ? window.Tally.openPopup(FEEDBACK_FORM, { layout: "modal", width: 460, overlay: true, hiddenFields, onOpen: done }) : (done(), fallback()))
    .catch(() => { done(); fallback(); });
}
/** About: the story behind the Wayward sites, in the reading layout used for stories */
function openAbout() {
  track("open about");
  $("#modalBody").innerHTML = aboutHTML("bike");
  $("#modal").classList.add("story-mode"); $("#modal").classList.remove("hidden");
  $("#modal .modal-card").scrollTop = 0;
}
function closeModal() {
  $("#modal").classList.add("hidden"); $("#modal").classList.remove("story-mode");
  if (location.hash.startsWith("#place/")) history.pushState(null, "", location.pathname + location.search);
}
function routeFromHash() {
  const m = location.hash.match(/^#place\/([\w-]+)$/);
  if (m && BY_ID[m[1]] && STORIES[m[1]]) { if (state.selected !== m[1]) openDetail(m[1], true); openStory(m[1], false); }
  else if (m && BY_ID[m[1]]) { if (state.selected !== m[1]) openDetail(m[1], true); $("#modal").classList.add("hidden"); $("#modal").classList.remove("story-mode"); }
  else if (!$("#modal").classList.contains("hidden") && $("#modal").classList.contains("story-mode")) { $("#modal").classList.add("hidden"); $("#modal").classList.remove("story-mode"); }
}

function openCompare() {
  track(`compare ${state.compare.length} places`);
  const items = state.compare.map(x => ({ d: BY_ID[x.id], c: condOf(BY_ID[x.id]), color: SLOTS[x.slot] }));
  const m = state.months[0] || null;
  const monthOf = (it) => state.months.find(x => inSeason(it.d, x)) || m || it.d.best[0] || 1;
  const clim = (it) => it.c?.climate?.[monthOf(it)];
  const yMax = Math.max(1, ...items.flatMap(it => Object.values(it.c?.climate || {}).map(x => x.rainDays)));
  const row = (label, f) => `<tr><th>${label}</th>${items.map(it => `<td>${f(it)}</td>`).join("")}</tr>`;
  $("#modalBody").innerHTML = `
    <h2>Compare ${items.length} destinations</h2>
    <div class="muted" style="font-size:13px">${m ? `Travel months: <b>${monthsLabel()}</b>` : "Pick months in the sidebar to compare timing"}</div>
    <div class="section-title">Typical rain days by month (same scale) ${info("weather")}</div>
    <div class="small-multiples">${items.map((it, i) => `<div class="sm"><h5><i style="background:${it.color}"></i>${esc(it.d.name)}</h5><div id="sm${i}"></div></div>`).join("")}</div>
    <table class="cmp-table">
      <thead><tr><th></th>${items.map(it => `<td><i style="background:${it.color}"></i>${esc(it.d.name)}</td>`).join("")}</tr></thead>
      <tbody>
        ${row("Type", it => `${esc(typeLine(it.d))}<br><span class='muted'>${esc(subLabel(it.d))}</span>`)}
        ${row("Where", it => `${esc(it.d.region)}, ${esc(it.d.country)}`)}
        ${row(`This week ${info("cond")}`, it => { const r = liveCond(it.d); return `${r ? `<i class="cdot sm" style="background:${COND[r].color}"></i>` : ""}<b>${esc(condText(it.d))}</b>${r ? `<br><span class="muted">${esc(it.c.rated.reasons[0])}</span>` : ""}`; })}
        ${row(`Season / best ${info("whenToGo")}`, it => `${seasonText(it.d)} / <b>${it.d.best.map(b => MONTHS[b - 1]).join(", ") || "any month"}</b>`)}
        ${row((m ? `In ${monthsLabel()}` : "Timing fit"), it => { const ft = fitText(it.d); return ft ? `<span class="${ft.cls}">● ${ft.text}</span>` : "<span class='muted'>pick months</span>"; })}
        ${row(`Weather in ${m ? "your months" : "best month"} ${info("weather")}`, it => { const c = clim(it); return c ? `${Math.round(c.tmax)}°C highs, ${Math.round(c.tmin)}°C lows · ${Math.round(c.rainDays)} rain days · ${c.sun} h sun/day <span class="muted">(${MONTHS[monthOf(it) - 1]})</span>` : "–"; })}
        ${row("Terrain", it => esc(it.d.terrain))}
        ${items.some(it => it.d.stats) ? row(`Route ${info("route")}`, it => it.d.stats ? statsText(it.d) : "–") : ""}
        ${row("Elevation", it => `${num(it.d.elev[0])}–${num(it.d.elev[1])} m`)}
        ${row(`Crowds ${info("crowds")}`, it => meter(it.d.crowds))}
        ${row(`Cost ${info("cost")}`, it => meter(it.d.cost, 5))}
        ${row(`Guide ${info("guide")}`, it => esc(it.d.guide))}
        ${row("Getting there", it => esc(it.d.airport))}
        ${items.some(it => it.d.advisory) ? row("Travel advisory", it => it.d.advisory ? `<span style="color:#a3341f">⚠ ${esc(it.d.advisory)}</span>` : "–") : ""}
        ${row("Links", it => [...mapLinks(it.d, true), searchLink(destSearch(it.d), "search")].join(" · "))}
      </tbody>
    </table>`;
  items.forEach((it, i) => monthBars($(`#sm${i}`), it.c?.climate, { compact: true, width: 200, height: 80, yMax, color: it.color, months: state.months }));
  $("#modal").classList.remove("hidden", "story-mode");
}

// ---------- boot ----------
async function boot() {
  const [dj, cj, stj] = await Promise.all([
    fetch("data/destinations.json").then(r => r.json()),
    fetch("data/conditions.json").then(r => r.ok ? r.json() : { destinations: {} }).catch(() => ({ destinations: {} })),
    fetch("data/stories.json").then(r => r.ok ? r.json() : {}).catch(() => ({})),
  ]);
  DEST = dj.destinations; DEST.forEach(d => BY_ID[d.id] = d); CONDDATA = cj; STORIES = stj; delete STORIES._about;
  // pages marked "draft" stay hidden on the live site until reviewed; add ?drafts to the URL to see them
  const showDrafts = new URLSearchParams(location.search).has("drafts");
  for (const k of Object.keys(STORIES)) if (STORIES[k].draft && !showDrafts) delete STORIES[k];
  ZONES = dj.zones || {}; MACROS = dj.macros || {};
  state.compare = state.compare.filter(x => BY_ID[x.id]);
  const gen = cj.generated ? new Date(cj.generated) : null;
  const age = gen ? Math.floor((Date.now() - gen) / 864e5) : null;
  $("#asof").innerHTML = gen ? `Riding conditions updated <b>${fmtDate(cj.generated)}</b>` : "No conditions data yet: run scripts/update_conditions.py";
  if (age != null && age >= 4) {
    $("#asof").classList.add("stale");
    $("#asof").innerHTML += `<br>⚠ Not updated for ${age} days (it normally updates daily), so the forecasts may be out of date.`;
  }
  renderControls(); bindControls(); initMap(); refresh();
  $("#loadingNote").remove(); showWelcome();
  const infoAt = (el) => { const r = el.getBoundingClientRect(); showTip(DEFS[el.dataset.info] || "", r.right, r.top); };
  document.addEventListener("mouseover", (e) => { const el = e.target.closest?.("[data-info]"); if (el) infoAt(el); });
  document.addEventListener("mouseout", (e) => { if (e.target.closest?.("[data-info]")) hideTip(); });
  document.addEventListener("focusin", (e) => { const el = e.target.closest?.("[data-info]"); if (el) infoAt(el); });
  document.addEventListener("focusout", (e) => { if (e.target.closest?.("[data-info]")) hideTip(); });
  document.addEventListener("click", (e) => { const el = e.target.closest?.("[data-info]"); if (el) { e.stopPropagation(); infoAt(el); } }, true);
  $("#showAll").onclick = () => fitAll(true);
  document.addEventListener("click", (e) => { const b = e.target.closest?.("[data-feedback]"); if (b) { e.preventDefault(); openFeedback(b.dataset.feedback, b); } });
  $("#siteLinks").innerHTML = siteLinksHTML("bike");
  initTracking("bike");
  document.addEventListener("click", (e) => { if (e.target.closest?.("[data-about]")) { e.preventDefault(); openAbout(); } });
  // start fetching Tally as soon as someone heads for a feedback link
  const warmTally = (e) => { if (e.target.closest?.("[data-feedback]")) loadTally().catch(() => {}); };
  document.addEventListener("pointerover", warmTally); document.addEventListener("focusin", warmTally);
  $("#modalClose").onclick = closeModal;
  $("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { if (!$("#modal").classList.contains("hidden")) closeModal(); else if ($("#sidebar").classList.contains("open")) { $("#sidebar").classList.remove("open"); document.body.classList.remove("sb-open"); } hideTip(); } });
  window.addEventListener("popstate", routeFromHash);
  window.addEventListener("hashchange", routeFromHash);
}
boot();
