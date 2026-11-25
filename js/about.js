// The About page and the links between the Wayward sites. Kept identical on every site: copy across by hand.
export const SITES = [
  { key: "ski", name: "Wayward Ski", url: "https://waywardski.com", what: "ski trips, from resorts to backcountry and expeditions, with this week's snow" },
  { key: "bike", name: "Wayward Bike", url: "https://waywardbike.com", what: "mountain bike, road and gravel trips, with this week's riding conditions" },
];

// The parts that differ by sport: examples beyond the usual suspects, and what "good right now" means there.
const SPORT = {
  ski: {
    beyond: "Whistler, Chamonix and Niseko are all here. So are freeride in Georgia's Caucasus, cat skiing in North Macedonia, powder in Kyrgyzstan's Tian Shan, and sailing to ski in Antarctica.",
    now: "Every place shows how the snow season is going, this week's conditions, and typical weather by month.",
  },
  bike: {
    beyond: "Whistler, Moab and Finale Ligure are all here. So are Lesotho's highlands, the medieval tower villages of Svaneti, Cappadocia's fairy chimneys, and the Haul Road to the Arctic Ocean.",
    now: "Every place shows this week's riding conditions and typical weather by month.",
  },
};

export function aboutHTML(here) {
  const s = SPORT[here];
  return `<article class="story about">
    <h2>Seeing the world through outdoor sports</h2>
    <p class="pitch">Wayward is a set of maps for planning trips worldwide around the things you love doing outside.</p>
    <p><b>Beyond the usual suspects.</b> ${s.beyond} Browse the map, learn what makes each place special, and find somewhere new for your next adventure.</p>
    <p><b>Where it's good right now.</b> ${s.now} Spot what's in season and good right now, and plan a short-notice trip somewhere new with confidence.</p>
    <h3>Why I made it</h3>
    <p>Over time, I found I kept going back to the same places, and the trips got further apart. In 2026 I changed that, with trips from Antarctica and Argentina to Nepal, Swedish Lapland and southern Utah. That reset inspired Wayward: a way to make it easier to keep exploring.</p>
    <h3>The Wayward sites</h3>
    <ul class="about-sites">
      ${SITES.map(x => `<li>${x.key === here ? `<b>${x.name}</b>` : `<a href="${x.url}">${x.name}</a>`}, for ${x.what}${x.key === here ? " (you're here)" : ""}</li>`).join("")}
      <li><b>Hiking and backpacking</b>, coming next</li>
    </ul>
    <p>This is a side project, done for fun. Some of the places here I know first-hand; many more are researched and checked against sources. If you know a place better than I do, or think I've missed one, please <button type="button" class="link-btn" data-feedback="">send feedback</button>. I hope it nudges you somewhere new. Go a little wayward.</p>
    <p class="about-sign">— Lina, Nov 2026</p>
  </article>`;
}

export const siteLinksHTML = (here) =>
  `<button type="button" class="link-btn" data-about="">About</button>` +
  SITES.filter(s => s.key !== here).map(s => ` · <a href="${s.url}">${s.name} →</a>`).join("");
