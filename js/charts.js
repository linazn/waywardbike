// Lightweight hand-rolled SVG charts (no dependencies).
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
export { MONTHS };

const tip = () => document.getElementById("tooltip");
export function showTip(html, x, y) {
  const t = tip(); t.innerHTML = html; t.classList.remove("hidden");
  const w = t.offsetWidth, h = t.offsetHeight;
  t.style.left = Math.min(window.innerWidth - w - 8, x + 14) + "px";
  t.style.top = Math.max(8, y - h - 10) + "px";
}
export function hideTip() { tip().classList.add("hidden"); }

function niceMax(v) {
  if (v <= 0) return 10;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

/** Typical weather by month, Jan–Dec: bars = rain days (days with ≥1 mm), numbers under = typical daytime high.
 *  Best months get a dot under the month letter; picked travel months are shaded. */
export function monthBars(container, climate, opts = {}) {
  if (!climate) { container.innerHTML = ""; return; }
  const months = Array.from({ length: 12 }, (_, i) => i + 1).filter(k => climate[k]);
  const W = opts.width || 360, H = opts.height || 118, m = { l: 4, r: 4, t: 14, b: opts.compact ? 16 : 38 };
  const yMax = opts.yMax || niceMax(Math.max(...months.map(k => climate[k].rainDays)));
  const bw = (W - m.l - m.r) / months.length;
  const bars = months.map((k, i) => {
    const c = climate[k], h = (c.rainDays / yMax) * (H - m.t - m.b), x0 = m.l + i * bw + 2;
    const sel = (opts.months || []).includes(k), best = (opts.best || []).includes(k);
    const fill = opts.color || "#8fa9c2";
    const yb = H - m.b, cx = x0 + (bw - 4) / 2;
    const r = Math.min(4, h, (bw - 4) / 2);
    const d = h > 0 ? `M${x0},${yb}V${yb - h + r}Q${x0},${yb - h} ${x0 + r},${yb - h}H${x0 + bw - 4 - r}Q${x0 + bw - 4},${yb - h} ${x0 + bw - 4},${yb - h + r}V${yb}Z` : "";
    return `<g data-m="${k}">
      ${sel ? `<rect x="${x0 - 2}" y="${m.t - 12}" width="${bw}" height="${H - m.t - m.b + 12}" fill="#efeee6" rx="4"/>` : ""}
      <path d="${d}" fill="${fill}"/>
      ${opts.compact ? "" : `<text x="${cx}" y="${yb - h - 3}" text-anchor="middle">${Math.round(c.rainDays)}</text>`}
      <text x="${cx}" y="${H - m.b + 12}" text-anchor="middle" style="${sel ? "fill:#0b0b0b;" : ""}${best ? "font-weight:700;fill:#1a4c2a" : ""}">${MONTHS[k - 1][0]}${opts.compact ? "" : MONTHS[k - 1].slice(1)}</text>
      ${opts.compact ? "" : `<text x="${cx}" y="${H - m.b + 24}" text-anchor="middle">${Math.round(c.tmax)}°</text>`}
      ${!opts.compact && best ? `<circle cx="${cx}" cy="${H - m.b + 32}" r="2.5" fill="#1a4c2a"/>` : ""}
      <rect x="${x0 - 2}" y="0" width="${bw}" height="${H}" fill="transparent" class="hit"/>
    </g>`;
  }).join("");
  container.innerHTML = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Typical rain days and temperatures by month">${bars}</svg>`;
  container.querySelectorAll("g[data-m]").forEach(g => {
    const k = +g.dataset.m, c = climate[k];
    g.addEventListener("mousemove", (ev) => showTip(`<b>${MONTHS[k - 1]}</b> (typical)<br>Highs ${c.tmax}°C · lows ${c.tmin}°C<br>Rain: ${c.rain} mm over ${c.rainDays} days<br>Sunshine: ${c.sun} h/day<br>Max wind (avg): ${c.wind} km/h`, ev.clientX, ev.clientY));
    g.addEventListener("mouseleave", hideTip);
  });
}
