// Facility effects (Milestone 16, bible §20 / §27G): what every facility on the land does, at its level. Plain functions
// over the live list (data/lot.js FACILITIES — each carries its level from the site), so every system can ask without
// being wired to Build Mode. Numbers are data/facilities.js FACILITY_FX; a level multiplies the effect ×1.0 / ×1.5 / ×2.0.
//   has(id) · levelOf(id) · mult(id) — the facility's level multiplier (1 when it isn't built)
//   systemValue(key, effOf?) → the total of one system effect over the facilities built (× level × working share)
//   categoryAdd(cat, { shareOf, guests, family, luxury }) → the points a stay's category gets from the facilities built
//   effectWords(id, level) → the effect in plain words at that level (and "works from M18" for later systems)
import { FACILITIES } from '../../data/lot.js';
import { FACILITY_FX, LEVEL_MULT, FACILITY_INFO } from '../../data/facilities.js';
import { GROWTH } from './staff.js';
import { rx } from './research.js';
import { EVENING_IDS } from '../../data/research.js';

const def = (id) => FACILITIES.find((f) => f.id === id) ?? null;
export const has = (id) => !!def(id);
export const levelOf = (id) => def(id)?.level ?? 1;
export const mult = (id) => (has(id) ? LEVEL_MULT[Math.max(1, Math.min(3, levelOf(id))) - 1] : 1);
// Effects the shipped facilities didn't have before M16 (the Service Block's routing, Parking's arrivals): the older
// milestones' test suites switch them off with GROWTH.facilities (their formulas stay as written then).
const NEW_FOR_SHIPPED = new Set(['routing', 'arrivals']);

export function systemValue(key, effOf = () => 1) {
  if (NEW_FOR_SHIPPED.has(key) && GROWTH.facilities === false) return 0;
  let t = 0;
  for (const f of FACILITIES) {
    const v = FACILITY_FX[f.id]?.system?.[key];
    if (v) t += v * mult(f.id) * effOf(f.id);
  }
  return t;
}
// Each guest's share of a facility that serves `users` a band when `guests` are staying (1 when it isn't full).
export const usersShare = (users, guests) => (!users || !guests || guests <= users ? 1 : users / guests);
export function categoryAdd(cat, { shareOf = () => 1, guests = 0, family = false, luxury = false, list = FACILITIES } = {}) {
  let t = 0;
  for (const f of list) {
    const fx = FACILITY_FX[f.id];
    for (const e of fx?.cats ?? []) {
      if (e.cat !== cat || (e.who === 'family' && !family) || (e.who === 'luxury' && !luxury)) continue;
      // (Milestone 17) Kitchen Basics: food places serve 10% more; Night Entertainment: evening places 15% more
      const users = fx.users ? fx.users * (1 + (e.cat === 'food' ? rx('foodThroughput') : 0) + (EVENING_IDS.includes(f.id) ? rx('eveningThroughput') : 0)) : 0;
      t += e.add * mult(f.id) * shareOf(f.id) * usersShare(users, guests);
    }
  }
  return t;
}
const r1 = (x) => Math.round(x * 10) / 10;
export function effectWords(id, level = 1) {
  const fx = FACILITY_FX[id];
  const m = LEVEL_MULT[level - 1] ?? 1;
  if (!fx) return '';
  if (fx.later) return `${fx.what} (works from ${fx.later})`;
  const bits = [];
  for (const e of fx.cats ?? []) bits.push(`+${r1(e.add * m)} ${e.cat === 'food' ? 'Food' : e.cat === 'comfort' ? 'Comfort' : 'Activities'}${e.who === 'family' ? ' for families (families come later)' : e.who === 'luxury' ? ' for luxury guests' : ''}`);
  if (fx.users) bits.push(`${Math.round(fx.users)} guests a part of the day`);
  const s = fx.system ?? {};
  if (s.desk) bits.push(level > 1 ? `check-ins ${m}× as fast` : 'two check-ins at once');
  if (s.routing) bits.push(`service routes ${Math.round(s.routing * m * 100)}% quicker`);
  if (s.linen) bits.push(`${Math.round(50 * m)} linen a day`);
  if (s.repair) bits.push(`repairs ${Math.round(10 * m)}% faster`);
  if (s.arrivals) bits.push(`${Math.round(s.arrivals * m)} arrivals a day`);
  if (s.hkTravel) bits.push(`housekeeping walks −${Math.round(s.hkTravel * m * 100)}%`);
  if (s.walkPenalty) bits.push(`long-walk penalty −${Math.min(100, Math.round(s.walkPenalty * m * 100))}%`);
  if (s.appeal) bits.push(`+${r1(s.appeal * m)} Appeal${s.radius ? ` (views within ${s.radius} tiles)` : ''}`);
  return bits.join(' · ') || FACILITY_INFO[id]?.line || '';
}
