// Suppliers (Milestone 22, bible §26 / §27N): food, linen, amenities and maintenance parts each bought at Basic, Quality or
// Luxury. A tier sets that group's cost multiplier (food, linen and amenities supplies a room-night, event catering,
// maintenance parts) and the score cap it allows (Food, Clean, Room — and fewer breakdowns for parts). R29 Supply Quality
// takes 15% off the Quality tier's extra cost; FreshFields Foods (P02) takes 6% off food (src/systems/partners.js).
// One resort is open at a time: the tiers are kept at module level too, so every system can ask (like research).
//   createSupplies({ saved, bus }) → sp — sp.setTier(group, tier) · sp.tier(group) · serialize()
//   supplyCap(group) · supplyMult(group) · partsFailure() · suppliesOn() — module level
import { SUPPLY_TIERS, TIER_IDS, SUPPLY_GROUPS } from '../../data/partners.js';
import { rx } from './research.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
export const freshSupplies = () => ({ tiers: { food: 'basic', linen: 'basic', amenities: 'basic', parts: 'basic' }, changes: 0 });
const LIVE = { s: null, foodCut: () => 0 };
export const suppliesOn = () => !!LIVE.s;
const tierOf = (g) => LIVE.s?.tiers?.[g] ?? 'basic';
// The score cap the group's tier allows (Food / Clean / Room); null when supplies aren't live (older tests).
export const supplyCap = (g) => (LIVE.s ? SUPPLY_TIERS[g]?.[tierOf(g)]?.cap ?? null : null);
// The cost multiplier: the tier's, Quality's extra cut 15% by R29; food −P02's cut.
export function supplyMult(g) {
  const t = SUPPLY_TIERS[g]?.[tierOf(g)];
  if (!t) return 1;
  let m = t.mult;
  if (tierOf(g) === 'quality') m = 1 + (m - 1) * (1 - rx('qualitySupplies'));
  if (g === 'food') m *= 1 - (LIVE.foodCut() ?? 0);
  return Math.round(m * 1e4) / 1e4;
}
export const partsFailure = () => SUPPLY_TIERS.parts[tierOf('parts')]?.failure ?? 0;

export function createSupplies({ saved = null, bus = null } = {}) {
  const f = freshSupplies();
  const s = saved && typeof saved === 'object' ? { tiers: { ...f.tiers, ...Object.fromEntries(Object.entries(saved.tiers ?? {}).filter(([g, t]) => SUPPLY_TIERS[g] && TIER_IDS.includes(t))) }, changes: saved.changes ?? 0 } : f;
  LIVE.s = s;
  LIVE.foodCut = () => 0;
  return {
    tier: (g) => s.tiers[g],
    setTier(g, t) {
      if (!SUPPLY_TIERS[g] || !TIER_IDS.includes(t) || s.tiers[g] === t) return false;
      s.tiers[g] = t;
      s.changes++;
      bus?.emit('supplies:change', { group: g, tier: t });
      return true;
    },
    setFoodCut(fn) {
      LIVE.foodCut = fn;
    },
    groups: SUPPLY_GROUPS,
    serialize: () => clone(s),
  };
}
