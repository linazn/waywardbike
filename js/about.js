// The About page and the links between the Wayward sites. Kept identical on every site: copy across by hand.
export const SITES = [
  { key: "ski", name: "Wayward Ski", url: "https://waywardski.com", what: "ski trips, from resorts to backcountry and expeditions, with this week's snow" },
  { key: "bike", name: "Wayward Bike", url: "https://waywardbike.com", what: "mountain bike, road and gravel trips, with this week's riding conditions" },
];

export function aboutHTML(here) {
  const others = SITES.filter(s => s.key !== here);
  return `<article class="story about">
    <h2>Seeing the world through sport</h2>
    <p class="pitch">Wayward is a set of maps for planning trips worldwide around the things you love doing outside.</p>
    <p>For years I travelled a lot and spent a lot of time in the mountains, but I rarely put the two together. Trips were trips, and adventures mostly happened close to home.</p>
    <p>Then somewhere along the way, work got busy, and the big trips and long adventures outside slipped down the list. In 2026 I decided to make room for them again, and this time to bring travel and adventure together.</p>
    <p>It's been quite a year already: skiing in Antarctica and Argentina, trekking in Nepal's Manaslu region, nine days on the Kungsleden in Swedish arctic Lapland, backpacking and exploring canyons in southern Utah, and getting back on the road bike and the mountain bike, including classic rides in California and Utah. Add that to years of travel before that, and I've come to know a good number of places.</p>
    <p>Planning those trips, I kept asking the same questions. Where is really worth the journey? When should I go? What's it like there right now? Wayward is my answer: a global map of places worth travelling for, some I know first-hand and many more researched and checked against sources, with this week's conditions and typical weather by month to help you scope a trip.</p>
    <h3>The Wayward sites</h3>
    <ul class="about-sites">
      ${SITES.map(s => `<li>${s.key === here ? `<b>${s.name}</b>` : `<a href="${s.url}">${s.name}</a>`}, for ${s.what}${s.key === here ? " (you're here)" : ""}</li>`).join("")}
      <li><b>Hiking and backpacking</b>, coming next</li>
    </ul>
    <p>This is a side project, done for fun. It has gaps. If you know a place better than I do, or think I've missed one, please <button type="button" class="link-btn" data-feedback="">send feedback</button>. I hope it nudges you somewhere new. Go a little wayward.</p>
    <p class="about-sign">— Lina, Nov 2026</p>
  </article>`;
}

export const siteLinksHTML = (here) =>
  `<button type="button" class="link-btn" data-about="">About</button>` +
  SITES.filter(s => s.key !== here).map(s => ` · <a href="${s.url}">${s.name} →</a>`).join("");
