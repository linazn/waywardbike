// Shared by the Wayward sites (copy changes to the other repos by hand).
// A slim 21-day weather strip: 10 days back, today, 10 ahead. Bars only, a "today" tick,
// days 8-10 ahead faded (low confidence), details on hover or tap.
//   wxStripHTML(wx, {kind: "snow" | "rain", where})  -> HTML string (where: e.g. "at ~1,800 m, mid-mountain")
//   bindWxStrips(root)                             -> wires hover/tap captions inside root
// wx = {start: "YYYY-MM-DD", today: 10, snow?: [cm], rain: [mm], sun: [h], tmax?: [°C]}

const SNOW = "#1c5cab", RAIN = "#2f5f8a", RAIN_ON_SNOW = "#eb6834", DRY = "#eda100";
const W = 20, BASE = 38, TOP = 4;  // svg units: 20 per day, bars grow up from BASE

function css() {
  if (document.getElementById("wx-strip-css")) return;
  const s = document.createElement("style");
  s.id = "wx-strip-css";
  s.textContent = `
.wx { margin-top: 4px; }
.wx-sum { display: grid; grid-template-columns: auto 1fr 1fr; gap: 2px 14px; font-size: 13px; color: var(--text-primary); margin-bottom: 6px; align-items: baseline; }
.wx-sum .h { font-size: 11px; color: var(--text-muted); }
.wx-sum .k { display: inline-flex; align-items: center; gap: 5px; color: var(--text-secondary); }
.wx-sum i { display: inline-block; width: 8px; height: 8px; border-radius: 2px; }
.wx-sub { margin: 14px 0 6px; padding-top: 10px; border-top: 1px dashed var(--border); font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--text-muted); }
.wx-sub:first-child { margin-top: 0; padding-top: 0; border-top: 0; }
.wx svg { display: block; width: 100%; height: auto; touch-action: manipulation; }
.wx .hit { fill: transparent; cursor: pointer; }
.wx .hit.on { fill: rgba(0,0,0,.06); }
.wx-axis { display: flex; justify-content: space-between; font-size: 10.5px; color: var(--text-muted); margin-top: 1px; }
.wx-cap { font-size: 12px; color: var(--text-secondary); min-height: 1.4em; margin-top: 2px; }
.wx-key { display: inline-flex; align-items: center; gap: 3px; margin-right: 8px; }
.wx-key i { display: inline-block; width: 7px; height: 7px; border-radius: 2px; }
.wx-chips { display: flex; flex-wrap: wrap; gap: 4px; }
.wx-chips .chip { font-size: 13px; padding: 3px 10px; }
.wx-rules { font-size: 11.5px; color: var(--text-muted); margin-top: 6px; line-height: 1.45; }
.wx-rules b { color: var(--text-secondary); font-weight: 600; }`;
  document.head.appendChild(s);
}

const day = (wx, i) => { const d = new Date(wx.start + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + i); return d; };
const fmt = (d) => d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const sum = (a) => a.reduce((s, v) => s + (v || 0), 0);
const r0 = (v) => Math.round(v || 0);
const mm = (v) => v < 10 ? (Math.round(v * 10) / 10) + " mm" : Math.round(v) + " mm";

export function wxSummary(wx, kind) {
  // a small table, one row per kind of weather, so snow and rain are never mixed up
  const t = wx.today, past = (k) => wx[k].slice(0, t), next = (k) => wx[k].slice(t, t + 10);
  const days = (a, test) => a.filter(test).length;
  const rainCell = (a) => { const n = days(a, v => v >= 1); return n ? `<b>${n} day${n > 1 ? "s" : ""}</b> <span class="muted">(${r0(sum(a))} mm)</span>` : `<span class="muted">none</span>`; };
  const sw = (c, round) => `<i style="background:${c};${round ? "border-radius:50%" : ""}"></i>`;
  const rows = [];
  if (kind === "snow") rows.push([`${sw(SNOW)}Snow`, `<b>${r0(sum(past("snow")))} cm</b>`, `<b>${r0(sum(next("snow")))} cm</b>`]);
  rows.push([`${sw(kind === "snow" ? RAIN_ON_SNOW : RAIN, kind === "snow")}Rain`, rainCell(past("rain")), rainCell(next("rain"))]);
  if (kind !== "snow") { const dry = (a) => days(a, v => (v || 0) < 1); rows.push([`${sw(DRY, true)}Dry`, `<b>${dry(past("rain"))} days</b>`, `<b>${dry(next("rain"))} days</b>`]); }
  return `<span class="h"></span><span class="h">Last 10 days</span><span class="h">Next 10 days <span class="muted">(forecast)</span></span>` +
    rows.map(r => r.map((c, i) => `<span class="${i ? "" : "k"}">${c}</span>`).join("")).join("");
}

export { css as wxCSS };
export function wxStripHTML(wx, { kind = "rain", where = "" } = {}) {
  if (!wx || !Array.isArray(wx.rain)) return "";
  css();
  const n = wx.rain.length, t = wx.today, snow = kind === "snow";
  const vals = snow ? wx.snow : wx.rain;
  const max = Math.max(10, ...vals.map(v => v || 0));
  const fade = (i) => i > t + 7 ? ' opacity=".35"' : "";
  let g = "";
  for (let i = 0; i < n; i++) {
    const x = i * W, v = vals[i] || 0, show = snow ? v > 0 : v >= 1, h = show ? Math.max(1.5, (v / max) * (BASE - TOP)) : 0;
    if (h) g += `<rect x="${x + 4}" y="${BASE - h}" width="${W - 8}" height="${h}" rx="2" fill="${snow ? SNOW : RAIN}"${fade(i)}/>`;
    if (snow && (wx.rain[i] || 0) >= 1) {  // rain at the reference elevation: a mark under the line
      const r = wx.rain[i] >= 5 ? 3 : 2;
      g += `<circle cx="${x + W / 2}" cy="${BASE + 6}" r="${r}" fill="${RAIN_ON_SNOW}"${fade(i)}/>`;
    }
    if (!snow && v < 1) g += `<circle cx="${x + W / 2}" cy="${BASE + 6}" r="2" fill="${DRY}"${fade(i)}/>`;
  }
  const tx = t * W + W / 2;
  const today = `<line x1="${tx}" x2="${tx}" y1="0" y2="${BASE + 11}" stroke="var(--text-primary)" stroke-width="1" stroke-dasharray="2 2" opacity=".6"/>`;
  const base = `<line x1="0" x2="${n * W}" y1="${BASE + .5}" y2="${BASE + .5}" stroke="var(--border)" stroke-width="1"/>`;
  const hits = Array.from({ length: n }, (_, i) => `<rect class="hit" data-i="${i}" x="${i * W}" y="0" width="${W}" height="${BASE + 12}"/>`).join("");
  return `<div class="wx" data-wx='${JSON.stringify(wx).replace(/'/g, "&#39;")}' data-kind="${kind}">
    <div class="wx-sum">${wxSummary(wx, kind)}</div>
    <svg viewBox="0 0 ${n * W} ${BASE + 12}" role="img" aria-label="Daily ${snow ? "snowfall" : "rain"}, 10 days back to 10 days ahead">${base}${g}${today}${hits}</svg>
    <div class="wx-axis"><span>10 days ago</span><span>today</span><span>+10 days</span></div>
    <div class="wx-cap"><span class="muted">${where ? "Weather " + where + ". " : ""}Days 8–10 ahead are faded: low confidence. Hover or tap a day.</span></div>
  </div>`;
}

function caption(wx, kind, i) {
  const t = wx.today, rel = i === t ? "today" : i < t ? `${t - i} day${t - i > 1 ? "s" : ""} ago` : `forecast, +${i - t}`;
  const bits = [];
  if (kind === "snow") { const v = wx.snow[i] || 0; bits.push(v >= 0.5 ? `${r0(v)} cm snow` : v > 0 ? "a dusting of snow" : "no snow"); }
  bits.push((wx.rain[i] || 0) >= 0.1 ? `${mm(wx.rain[i])} rain` : "no rain");
  if (wx.tmax && wx.tmax[i] != null) bits.push(`high ${Math.round(wx.tmax[i])}°C`);
  if (wx.sun) bits.push(`${Math.round(wx.sun[i])} h sun`);
  return `<b>${fmt(day(wx, i))}</b> <span class="muted">(${rel})</span> · ${bits.join(" · ")}`;
}

export function bindWxStrips(root = document) {
  root.querySelectorAll(".wx").forEach(el => {
    if (el.dataset.bound) return;
    el.dataset.bound = "1";
    const wx = JSON.parse(el.dataset.wx), kind = el.dataset.kind, cap = el.querySelector(".wx-cap"), dflt = cap.innerHTML;
    let pinned = null;
    const show = (i) => {
      el.querySelectorAll(".hit").forEach(h => h.classList.toggle("on", +h.dataset.i === i));
      cap.innerHTML = i == null ? dflt : caption(wx, kind, i);
    };
    el.addEventListener("pointerover", (e) => { const h = e.target.closest(".hit"); if (h && e.pointerType === "mouse") show(+h.dataset.i); });
    el.addEventListener("pointerleave", () => show(pinned));
    el.addEventListener("click", (e) => { const h = e.target.closest(".hit"); if (!h) return; const i = +h.dataset.i; pinned = pinned === i ? null : i; show(pinned); });
  });
}

// ---------- filter chips built on the same 21-day series ----------
// when = "week" (the 7 days either side of today) or "weekend" (the coming Sat + Sun; on a Sunday, just today)
export function weekendIdx(wx) {
  const t = wx.today, n = wx.rain.length;
  if (day(wx, t).getUTCDay() === 0) return [t];
  for (let i = t; i < n; i++) if (day(wx, i).getUTCDay() === 6) return [i, i + 1].filter(j => j < n);
  return [];
}
const total = (a, from, to) => { let s = 0; for (let i = Math.max(0, from); i <= Math.min(a.length - 1, to); i++) s += a[i] || 0; return s; };
const sunnyDay = (wx, i) => (wx.sun[i] || 0) >= 5 && (wx.snow ? (wx.snow[i] || 0) < 1 : true) && (wx.rain[i] || 0) < 1;
export const WX_CHIPS = {
  snow: {
    fresh: { label: "Fresh snow", week: "30+ cm in the last 7 days", weekend: "30+ cm in the 7 days up to Saturday",
      test: (wx, w) => w === "weekend" ? (() => { const k = weekendIdx(wx); return k.length && total(wx.snow, k[0] - 6, k[0]) >= 30; })() : total(wx.snow, wx.today - 7, wx.today - 1) >= 30 },
    coming: { label: "Snow coming", week: "20+ cm forecast over the next 7 days", weekend: "10+ cm forecast over the weekend",
      test: (wx, w) => w === "weekend" ? (() => { const k = weekendIdx(wx); return k.length && total(wx.snow, k[0], k[k.length - 1]) >= 10; })() : total(wx.snow, wx.today, wx.today + 6) >= 20 },
    sunny: { label: "Sunny spell", week: "4+ sunny days in the next 7 (5+ h of sun, no snow or rain)", weekend: "sunny on Saturday and Sunday",
      test: (wx, w) => { const k = w === "weekend" ? weekendIdx(wx) : [0, 1, 2, 3, 4, 5, 6].map(j => wx.today + j);
        const n = k.filter(i => sunnyDay(wx, i)).length; return w === "weekend" ? k.length > 0 && n === k.length : n >= 4; } },
  },
  rain: {
    dryLately: { label: "Dry lately", week: "under 5 mm of rain in the last 7 days", weekend: "under 5 mm of rain in the 5 days before Saturday",
      test: (wx, w) => w === "weekend" ? (() => { const k = weekendIdx(wx); return k.length && total(wx.rain, k[0] - 5, k[0] - 1) < 5; })() : total(wx.rain, wx.today - 7, wx.today - 1) < 5 },
    dryAhead: { label: "Dry ahead", week: "at most 1 wet day (1+ mm) in the next 7", weekend: "dry on Saturday and Sunday",
      test: (wx, w) => { const k = w === "weekend" ? weekendIdx(wx) : [0, 1, 2, 3, 4, 5, 6].map(j => wx.today + j);
        const wet = k.filter(i => (wx.rain[i] || 0) >= 1).length; return w === "weekend" ? k.length > 0 && wet === 0 : wet <= 1; } },
  },
};
// true if the place passes every chip picked; places with no strip data never pass
export function wxPasses(wx, kind, picked, when) {
  if (!picked.length) return true;
  if (!wx || !Array.isArray(wx.rain) || (kind === "snow" && !wx.snow)) return false;
  return picked.every(k => WX_CHIPS[kind][k] ? !!WX_CHIPS[kind][k].test(wx, when) : true);
}
// the chip row + week/weekend switch, and a line spelling out what the picked chips mean
export function wxChipsHTML(kind, picked, when) {
  const defs = WX_CHIPS[kind];
  const chips = Object.entries(defs).map(([k, c]) => { const on = picked.includes(k);
    return `<button class="chip ${on ? "on" : ""}" data-wxchip="${k}" aria-pressed="${on}">${c.label}</button>`; }).join("");
  const seg = `<div class="seg wx-when"><button data-wxwhen="week" class="${when === "week" ? "on" : ""}">Around now</button><button data-wxwhen="weekend" class="${when === "weekend" ? "on" : ""}">This weekend</button></div>`;
  const rules = (picked.length ? picked : Object.keys(defs)).map(k => `<b>${defs[k].label}</b>: ${defs[k][when]}`).join("<br>");
  return `${seg}<div class="wx-chips">${chips}</div><div class="wx-rules">${rules}</div>`;
}
