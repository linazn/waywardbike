// Anonymous usage events for GoatCounter (no cookies). Kept identical on every Wayward site: copy across by hand.
// GoatCounter itself skips localhost and browsers opened once with ?notrack.
let site = "", last = "";

/** Record one action, e.g. track("open davos", "Davos & Klosters"). Repeats of the same action in a row count once. */
export function track(name, title = "") {
  const path = `${site}: ${name}`;
  if (path === last) return;
  last = path;
  try { window.goatcounter?.count?.({ path, title: title || name, event: true }); } catch (e) { /* counting must never break the site */ }
}

/** Start tracking for this site, plus a rough "did they stay" signal:
 *  one event after 1 minute and one after 5 minutes of the page being open and visible. */
export function initTracking(siteKey) {
  site = siteKey;
  const marks = [[60, "stayed 1 min+"], [300, "stayed 5 min+"]];
  let seen = 0;
  const tick = setInterval(() => {
    if (document.visibilityState !== "visible") return;
    seen += 5;
    while (marks.length && seen >= marks[0][0]) track(marks.shift()[1]);
    if (!marks.length) clearInterval(tick);
  }, 5000);
  // clicks to the other Wayward sites
  document.addEventListener("click", (e) => {
    const a = e.target.closest?.("a[href*='wayward']");
    if (a && a.host && a.host !== location.host) track(`go to ${a.host.replace(/^www\./, "")}`);
  });
}
