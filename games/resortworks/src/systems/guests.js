// Who comes to the resort, and how much (Milestone 18, bible §9 / §27F; M24 caps the stack). One resort is open at a time:
// its stage and every demand source are kept here at module level (like the site and research), so the booking system can
// ask without being wired to each system.
//   setStage(id) — the progress system calls it (a stage reached for good)        liveStage()
//   typesNow() → the guest types that can book today: their stage reached, one of their `needs` built (when they have
//     any) and a built room they fit (a family: 4+ beds)
//   wantsOf(type) → { roomType: weight } — the fixed Roadside wants, or (wants: null) every built room type they fit,
//     weighted by (1 − |rate − budget| / budget)², at least WANT_FLOOR
//   setDemandSource(name, fn) — fn(typeId) → { type: pct, base: pct } (a package on sale, a theme, a partner, the weather …)
//   demandFor(typeId) → the stacked % for that guest type, every source added, held within ±DEMAND_CAP (bible §27O / M24
//     card: "all stacked modifiers stay within ±20%") · demandParts(typeId) → each source's part (the sheets)
//   baseDemand() → the stacked % for every guest (Local Ads, a partner …), held within ±DEMAND_CAP
import { GUEST_TYPES, ROOM_TYPES, CAPACITY } from '../../data/bookings.js';
import { STAGES, stageIndex } from '../../data/build.js';
import { ROOMS, FACILITIES } from '../../data/lot.js';
import { rx } from './research.js';

const ADVENTURE_R21 = 0.08; // R21 Tours & Excursions: adventure demand +8% (its stored key is the +25% tour places)

export const DEMAND_CAP = 0.2;
const WANT_FLOOR = 0.02;
const LIVE = { stage: 'roadside', book: null };

export const setStage = (id) => {
  if (STAGES.some((s) => s.id === id)) LIVE.stage = id;
};
export const liveStage = () => LIVE.stage;
export const stageReached = (id, stage = LIVE.stage) => stageIndex(stage) >= stageIndex(id);
export const fitsType = (t, rt) => ROOM_TYPES[rt].cap >= t.party && (!t.family || ROOM_TYPES[rt].cap >= CAPACITY.familyMin);
const builtTypes = () => [...new Set(ROOMS.map((r) => r.typeId))];

// stage: the resort's own (the booking system passes its progress's, so two resorts in one test process never share it)
export function canCome(t, stage = LIVE.stage) {
  if (!stageReached(t.stage, stage)) return false;
  if (t.needs?.length && !t.needs.some((id) => FACILITIES.some((f) => f.id === id))) return false;
  return builtTypes().some((rt) => fitsType(t, rt));
}
export const typesNow = (stage = LIVE.stage) => Object.values(GUEST_TYPES).filter((t) => canCome(t, stage));

export function wantsOf(t) {
  if (t.wants) return t.wants;
  const out = {};
  for (const rt of builtTypes().sort()) {
    if (!fitsType(t, rt)) continue;
    const k = Math.max(0, 1 - Math.abs(ROOM_TYPES[rt].rate - t.budget) / t.budget);
    out[rt] = Math.max(WANT_FLOOR, k * k);
  }
  return out;
}

// --- demand ------------------------------------------------------------------------------------------------------
// Each resort has its own demand book (createDemand: its sources), so two resorts in one test process never share them;
// the module functions read the book made last (the resort open now) — the sheets and tests use them.
const clampCap = (x) => Math.max(-DEMAND_CAP, Math.min(DEMAND_CAP, x));
export function createDemand() {
  const sources = new Map();
  const book = {
    set: (name, fn) => (fn ? sources.set(name, fn) : sources.delete(name)),
    parts(typeId = null) {
      const out = [];
      for (const [name, fn] of sources) {
        const v = fn(typeId) ?? {};
        if (v.type || v.base) out.push({ name, type: v.type ?? 0, base: v.base ?? 0, words: v.words ?? name });
      }
      return out;
    },
    rawDemandFor: (typeId) => book.parts(typeId).reduce((t, p) => t + p.type, 0),
    rawBaseDemand: () => book.parts(null).reduce((t, p) => t + p.base, 0),
    demandFor: (typeId) => clampCap(book.rawDemandFor(typeId)),
    baseDemand: () => clampCap(book.rawBaseDemand()),
  };
  book.set('Research', researchDemand);
  LIVE.book = book;
  return book;
}
const live = () => LIVE.book ?? createDemand();
export const setDemandSource = (name, fn, book = null) => (book ?? live()).set(name, fn);
export const demandParts = (typeId = null) => live().parts(typeId);
// The raw sums (tests of the cap) and the capped ones the offers use.
export const rawDemandFor = (typeId) => live().rawDemandFor(typeId);
export const rawBaseDemand = () => live().rawBaseDemand();
export const demandFor = (typeId) => live().demandFor(typeId);
export const baseDemand = () => live().baseDemand();

// Research's demand (bible §27H): R09 foodie +5%, R21 adventure +8%, R34 celebrity / influencer +15%, R35 international /
// luxury +10% (R31 Local Ads is the base demand, read where the offers are made).
const has = (typeId, tag) => !!GUEST_TYPES[typeId]?.tags?.includes(tag);
function researchDemand(typeId) {
  if (!typeId) return null;
  const v = (has(typeId, 'foodie') ? rx('foodieDemand') : 0) + (has(typeId, 'adventure') ? rx('tours') > 0 ? ADVENTURE_R21 : 0 : 0) + (has(typeId, 'celebrity') ? rx('celebrity') : 0) + (has(typeId, 'luxury') ? rx('luxDemand') : 0);
  return v ? { type: v, words: 'Research' } : null;
}
