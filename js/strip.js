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
.wx { margin-top: 10px; }
.wx-sum { font-size: 13px; color: var(--text-primary); margin-bottom: 4px; }
.wx svg { display: block; width: 100%; height: auto; touch-action: manipulation; }
.wx .hit { fill: transparent; cursor: pointer; }
.wx .hit.on { fill: rgba(0,0,0,.06); }
.wx-axis { display: flex; justify-content: space-between; font-size: 10.5px; color: var(--text-muted); margin-top: 1px; }
.wx-cap { font-size: 12px; color: var(--text-secondary); min-height: 1.4em; margin-top: 2px; }
.wx-key { display: inline-flex; align-items: center; gap: 3px; margin-right: 8px; }
.wx-key i { display: inline-block; width: 7px; height: 7px; border-radius: 2px; }`;
  document.head.appendChild(s);
}

const day = (wx, i) => { const d = new Date(wx.start + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + i); return d; };
const fmt = (d) => d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const sum = (a) => a.reduce((s, v) => s + (v || 0), 0);
const r0 = (v) => Math.round(v || 0);
const mm = (v) => v < 10 ? (Math.round(v * 10) / 10) + " mm" : Math.round(v) + " mm";

export function wxSummary(wx, kind) {
  const t = wx.today, past = (k) => wx[k].slice(0, t), next = (k) => wx[k].slice(t, t + 10);
  if (kind === "snow") {
    const rainDays = (a) => a.filter(v => v >= 1).length;
    const rp = rainDays(past("rain")), rn = rainDays(next("rain"));
    const rainBit = rp || rn ? ` · rain on ${[rp && `${rp} recent day${rp > 1 ? "s" : ""}`, rn && `${rn} coming day${rn > 1 ? "s" : ""}`].filter(Boolean).join(" and ")}` : "";
    return `Last 10 days <b>${r0(sum(past("snow")))} cm</b> · next 10 days <b>${r0(sum(next("snow")))} cm</b>${rainBit}`;
  }
  const wet = (a) => a.filter(v => v >= 1).length;
  const wp = wet(past("rain")), wn = wet(next("rain"));
  const part = (n, total) => n ? `<b>${n} wet day${n > 1 ? "s" : ""}</b> (${r0(total)} mm)` : `<b>dry</b>`;
  return `Last 10 days ${part(wp, sum(past("rain")))} · next 10 days ${part(wn, sum(next("rain")))}`;
}

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
  const key = snow
    ? `<span class="wx-key"><i style="background:${SNOW}"></i>snow</span><span class="wx-key"><i style="background:${RAIN_ON_SNOW};border-radius:50%"></i>rain</span>`
    : `<span class="wx-key"><i style="background:${RAIN}"></i>rain</span><span class="wx-key"><i style="background:${DRY};border-radius:50%"></i>dry</span>`;
  return `<div class="wx" data-wx='${JSON.stringify(wx).replace(/'/g, "&#39;")}' data-kind="${kind}">
    <div class="wx-sum">${wxSummary(wx, kind)}</div>
    <svg viewBox="0 0 ${n * W} ${BASE + 12}" role="img" aria-label="Daily ${snow ? "snowfall" : "rain"}, 10 days back to 10 days ahead">${base}${g}${today}${hits}</svg>
    <div class="wx-axis"><span>10 days ago</span><span>today</span><span>+10 days</span></div>
    <div class="wx-cap">${key}<span class="muted">${snow ? "Snow" : "Rain"}${where ? " " + where : ""}. Days 8–10 ahead are faded: low confidence. Hover or tap a day.</span></div>
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
