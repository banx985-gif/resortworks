// Weather / seasons / transport (Milestone 24, bible §27 / §27O). Each 28-day month's weather is rolled from its season
// band's profile with the run's seed (month by month, so a reload or a debug skip never rerolls it). The weather moves
// demand (Warm: outdoor guests +15%, spa −5%; Wet: indoor +15%; Cool: pool guests −20%, spa / indoor dining +15%) through
// the resort's demand book, where every source stacked together stays within ±20%. Wet weather cuts outdoor places'
// guests a part of the day by 35% (pools, the BBQ Terrace, Mini Golf, the Wedding Lawn …) and gives each day of an
// outdoor event a 10% chance of being rained off (M19's penalty). Mild changes nothing. No transport sim: early guests
// come by car or coach (a code-drawn vehicle at the car park), later ones by the shuttle once a Shuttle Stop is built.
//   createWeather({ saved, bus, seed, demand }) → wx
//     wx.onEdge(day, band) · wx.now (this month's weather id) · wx.month(day) (any month's, seeded) · wx.forecast(n) ·
//     wx.disrupts(event, day) (M19 asks each event day) · wx.demandOf(typeId) · serialize()
//   outdoorCut(facId) — module level: the share Wet weather takes off that facility's places now (facilities.js reads it)
//   On the bus: 'weather:change' { weather, month }
import { Rng } from '../../../../core/Rng.js';
import { SEASON_OF_MONTH, PROFILES, WEATHER, OUTDOOR_FAC, OUTDOOR_VENUES } from '../../data/weather.js';
import { GUEST_TYPES } from '../../data/bookings.js';
import { BANDS } from '../../data/calendar.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
const BAND = Object.fromEntries(BANDS.map((b, i) => [b.id, i]));
const LIVE = { now: 'mild' };
export const freshWeather = () => ({ month: 0, now: null, history: [], stats: { disrupted: 0, byKind: {} } });
export const outdoorCut = (fac) => (OUTDOOR_FAC.includes(fac) ? WEATHER[LIVE.now]?.outdoorCut ?? 0 : 0);
const monthIndex = (day) => Math.floor(day / 28); // 0, 1, 2 … since day 0
export const seasonOf = (mi) => SEASON_OF_MONTH[mi % 12];
// This month's weather, from its season's profile (one seeded roll a month).
export function weatherFor(seed, mi) {
  const prof = PROFILES[seasonOf(mi)];
  let r = new Rng(`${seed}:weather:${mi}`).next();
  for (const [id, p] of Object.entries(prof)) if ((r -= p) < 0) return id;
  return Object.keys(prof).at(-1);
}

export function createWeather({ saved = null, bus = null, seed = 'resortworks', demand = null } = {}) {
  const s = load(saved);
  const set = (day) => {
    const mi = monthIndex(day);
    if (s.now && s.month === mi) return;
    s.month = mi;
    s.now = weatherFor(seed, mi);
    s.history.unshift({ month: mi, id: s.now });
    if (s.history.length > 12) s.history.pop();
    s.stats.byKind[s.now] = (s.stats.byKind[s.now] ?? 0) + 1;
    bus?.emit('weather:change', { weather: s.now, month: mi + 1 });
  };
  LIVE.now = s.now ?? 'mild';
  const demandOf = (typeId) => {
    const w = WEATHER[s.now ?? 'mild'];
    let v = 0;
    for (const d of w.demand) if (d.tags.some((t) => GUEST_TYPES[typeId]?.tags?.includes(t))) v += d.v;
    return v;
  };
  demand?.set('Weather', (typeId) => {
    if (!typeId) return null;
    const v = demandOf(typeId);
    return v ? { type: v, words: `${WEATHER[s.now].name} weather` } : null;
  });
  return {
    onEdge(day, band) {
      if (band !== BAND.night && s.now) return;
      set(day);
      LIVE.now = s.now;
    },
    // Each day of an outdoor event in Wet weather: a 10% chance it is rained off (seeded per event and day).
    disrupts(evt, day) {
      const w = WEATHER[s.now ?? 'mild'];
      if (!w.disruption || !OUTDOOR_VENUES.includes(evt.venue)) return false;
      const hit = new Rng(`${seed}:rain:${evt.id}:${day}`).next() < w.disruption;
      if (hit) s.stats.disrupted++;
      return hit;
    },
    // Tests / ?debug=1: this month's weather now (the next month change rolls as usual).
    force(id) {
      if (!WEATHER[id]) return false;
      s.now = id;
      LIVE.now = id;
      bus?.emit('weather:change', { weather: id, month: s.month + 1 });
      return true;
    },
    demandOf,
    month: (day) => weatherFor(seed, monthIndex(day)),
    forecast: (day, n = 3) => Array.from({ length: n }, (_, i) => ({ month: monthIndex(day) + i + 1, season: seasonOf(monthIndex(day) + i), id: weatherFor(seed, monthIndex(day) + i) })),
    get now() {
      return s.now ?? 'mild';
    },
    get stats() {
      return clone(s.stats);
    },
    serialize: () => clone(s),
  };
}
function load(saved) {
  const f = freshWeather();
  if (!saved || typeof saved !== 'object') return f;
  const s = clone(saved);
  return { month: Number.isFinite(s.month) ? s.month : 0, now: WEATHER[s.now] ? s.now : null, history: Array.isArray(s.history) ? s.history : [], stats: { ...f.stats, ...(s.stats ?? {}) } };
}
