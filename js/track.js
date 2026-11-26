// Anonymous usage events for GoatCounter (no cookies). Kept identical on every Wayward site: copy across by hand.
// GoatCounter itself skips localhost and browsers opened once with ?notrack.
// index.html sets no_onload, so nothing is counted until watchForHuman() decides the visitor is a person.
let site = "", last = "", human = false;

// Automated browsers that say so. Crawlers that don't are caught by the wait below.
const isBot = () => { try { return navigator.webdriver || /headless|\bbot\b|bot\/|crawl|spider|slurp|lighthouse|phantom/i.test(navigator.userAgent); } catch (e) { return true; } };

/** The page view is only counted once the visit looks like a person: they click, tap, scroll or type,
 *  or the page stays open and visible for 10 seconds. Most crawlers load the page and leave sooner. */
function watchForHuman() {
  if (isBot()) return;
  const evs = ["pointerdown", "keydown", "wheel", "touchstart", "scroll"];
  let shown = 0;
  const timer = setInterval(() => { if (document.visibilityState === "visible" && (shown += 1) >= 10) yes(); }, 1000);
  function yes() {
    if (human) return;
    human = true; clearInterval(timer);
    evs.forEach(ev => removeEventListener(ev, yes, true));
    countView();
  }
  evs.forEach(ev => addEventListener(ev, yes, { capture: true, passive: true }));
}
// GoatCounter's script loads async, so wait for it (up to ~10 s)
function countView(tries = 0) {
  if (window.goatcounter?.count) { try { window.goatcounter.count(); } catch (e) {} return; }
  if (tries < 40) setTimeout(() => countView(tries + 1), 250);
}

/** Record one action, e.g. track("open davos", "Davos & Klosters"). Repeats of the same action in a row count once. */
export function track(name, title = "") {
  if (!human) return;
  const path = `${site}: ${name}`;
  if (path === last) return;
  last = path;
  try { window.goatcounter?.count?.({ path, title: title || name, event: true }); } catch (e) { /* counting must never break the site */ }
}

/** Start tracking for this site, plus a rough "did they stay" signal:
 *  one event after 1 minute and one after 5 minutes of the page being open and visible. */
export function initTracking(siteKey) {
  site = siteKey;
  watchForHuman();
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
