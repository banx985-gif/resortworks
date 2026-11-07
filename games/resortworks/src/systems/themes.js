// Emergent themes, the Signature and facility combos (Milestone 21, bible §14 / §16 / §27K). Themes follow what the
// resort actually did: every check-out (who, how satisfied, Food, the room), every day (guests staying, evening spend) and
// every event result are kept for 84 days, and at each month end the nine themes are worked out again from them (the
// §27K formulas, data/themes.js). 50+ / 75+ bring +3% / +6% demand from the guests a theme suits; at the World-Class
// stage a theme at 90+ can become the Signature (one at a time; changing costs 10,000 and waits 180 days) — +5% demand
// and +2 satisfaction for its guests, never a lock. Facility combos (§14) are on while every facility they list is built
// (and their extra condition holds): +10% each, never needed.
//   createThemes({ saved, bus, layout, finance, progress, seed }) → th
//     th.onReview(review) · th.onEvent(event) · th.onEdge(day, band) · th.recalc(day) · th.progress · th.levelOf(id) ·
//     th.inputs() (the live inputs, for the sheet and tests) · th.history · th.signature · th.whyNoSignature(id) ·
//     th.setSignature(id) · th.extraSat(booking, raw) · th.eventMult(event) · th.spendMult(line) · serialize()
//   activeCombos() / comboOn(id) / whyNoCombo(id) — module level (the facility sheets ask)
//   On the bus: 'themes:month' { progress } · 'themes:signature' { id } · 'themes:change'
import { THEMES, themeById, WINDOW, LEVELS, SIGNATURE, COMBOS, comboById, COMBO_BONUS, COMBO_QUIET } from '../../data/themes.js';
import { GUEST_TYPES, ROOM_TYPES } from '../../data/bookings.js';
import { ROOMS, FACILITIES } from '../../data/lot.js';
import { FACILITY_FX } from '../../data/facilities.js';
import { LUXURY_RANK } from '../../data/facilities.js';
import { VENUE_CAP, TOUR_PLACES } from '../../data/packages.js';
import { BANDS } from '../../data/calendar.js';
import { stageIndex } from '../../data/build.js';
import { has, mult } from './facilities.js';
import { researched } from './research.js';
import { setDemandSource } from './guests.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
const r1 = (x) => Math.round(x * 10) / 10;
const BAND = Object.fromEntries(BANDS.map((b, i) => [b.id, i]));
const TYPE_IDS = Object.keys(GUEST_TYPES).sort();
const LIVE = { layout: null, prestige: () => 0 };
export const freshThemes = () => ({ days: [], stays: [], events: [], progress: Object.fromEntries(THEMES.map((t) => [t.id, 0])), history: [], signature: null, stats: { changes: 0, months: 0 } });
const hasTag = (typeId, tags) => tags.some((t) => GUEST_TYPES[typeId]?.tags?.includes(t));

// --- facility combos (module level: one resort at a time, like the site) ------------------------------------------
const built = (id) => (id.startsWith('RM') ? ROOMS.some((r) => r.typeId === id) : has(id));
function extraOk(c) {
  if (c.extra === 'quiet') {
    const ly = LIVE.layout;
    if (!ly || !ROOMS.length) return false;
    return ROOMS.reduce((t, r) => t + (ly.avgNoise(r.id) ?? 0), 0) / ROOMS.length <= COMBO_QUIET;
  }
  if (c.extra === 'evening') return researched('R23');
  if (c.extra === 'prestige100') return (LIVE.prestige() ?? 0) >= 100;
  return true;
}
export function whyNoCombo(id) {
  const c = comboById(id);
  const miss = c.need.filter((x) => !built(x));
  if (miss.length) return `Needs ${miss.length} more: ${miss.join(', ')}`;
  if (!extraOk(c)) return c.extra === 'quiet' ? 'Needs quieter rooms' : c.extra === 'evening' ? 'Needs evening programming (R23 Night Entertainment)' : 'Needs Prestige 100';
  return null;
}
export const comboOn = (id) => !whyNoCombo(id);
export const activeCombos = () => COMBOS.filter((c) => comboOn(c.id)).map((c) => c.id);
export const combosFor = (facId) => COMBOS.filter((c) => c.need.includes(facId));
const comboFx = (k) => COMBOS.filter((c) => comboOn(c.id)).flatMap((c) => c.fx.filter((f) => f.k === k));

export function createThemes({ saved = null, bus = null, layout = null, finance = null, progress = null } = {}) {
  const s = load(saved);
  LIVE.layout = layout;
  const changed = () => bus?.emit('themes:change', {});

  // --- the inputs (0–100 each) over the last 84 days ---------------------------------------------------------------
  const placesOf = (id) => (!has(id) ? 0 : VENUE_CAP[id] ?? (TOUR_PLACES[id] ? TOUR_PLACES[id] * mult(id) : (FACILITY_FX[id]?.users ?? 0) * mult(id)));
  function inputs(day = s.days.at(-1)?.[0] ?? 0) {
    const from = day - WINDOW;
    const stays = s.stays.filter((x) => x[0] > from);
    const days = s.days.filter((x) => x[0] > from);
    const evs = s.events.filter((x) => x[0] > from);
    const avgGuests = days.length ? days.reduce((t, x) => t + x[1], 0) / days.length : 0;
    const typeOf = (x) => TYPE_IDS[x[1]];
    const pick = (tags) => stays.filter((x) => hasTag(typeOf(x), tags));
    const f = {};
    f.share = (tags) => (stays.length ? (pick(tags).length / stays.length) * 100 : 0);
    f.sat = (tags) => {
      const l = pick(tags);
      return l.length ? l.reduce((t, x) => t + x[2], 0) / l.length : 0;
    };
    f.util = (set) => {
      const cap = set.reduce((t, id) => t + placesOf(id), 0);
      return cap > 0 ? Math.min(100, (avgGuests / cap) * 100) : 0;
    };
    f.events = (ids) => {
      const l = evs.filter((x) => !ids.length || ids.includes(x[1]));
      return l.length ? l.reduce((t, x) => t + x[2], 0) / l.length : 0;
    };
    f.luxRooms = () => (stays.length ? (stays.filter((x) => x[4] >= LUXURY_RANK).length / stays.length) * 100 : 0);
    f.food = () => (stays.length ? stays.reduce((t, x) => t + x[3], 0) / stays.length : 0);
    f.appeal = () => layout?.appeal?.() ?? 60;
    f.views = () => (ROOMS.length && layout ? (ROOMS.filter((r) => (layout.viewPct?.(r.id) ?? 0) > 0).length / ROOMS.length) * 100 : 0);
    f.eco = () => (researched('R27') ? 60 : 0) + (has('F33') ? 40 : has('F08') ? 20 : 0);
    f.eveningSpend = () => {
      const nights = days.reduce((t, x) => t + x[1], 0);
      return nights ? Math.min(100, (days.reduce((t, x) => t + x[2], 0) / nights / 25) * 100) : 0;
    };
    return f;
  }
  function value(f, spec) {
    const [k, arg = ''] = spec.split(':');
    const list = arg ? arg.split(/[,|]/).filter(Boolean) : [];
    if (k === 'share' || k === 'sat') return f[k](list);
    if (k === 'util' || k === 'events') return f[k](list);
    return f[k]();
  }
  // Every theme now from the last 84 days (each part 0–100 × its weight %).
  function compute(day) {
    const f = inputs(day);
    const out = {};
    const parts = {};
    for (const t of THEMES) {
      parts[t.id] = t.parts.map(([w, spec]) => ({ spec, w, v: r1(value(f, spec)) }));
      out[t.id] = r1(Math.max(0, Math.min(100, parts[t.id].reduce((acc, p) => acc + (p.w * p.v) / 100, 0))));
    }
    return { progress: out, parts };
  }
  function recalc(day) {
    const { progress: p } = compute(day);
    s.progress = p;
    s.history.push({ day, progress: p });
    if (s.history.length > 12) s.history.shift();
    s.stats.months++;
    bus?.emit('themes:month', { progress: clone(p) });
    changed();
    return p;
  }
  const levelOf = (id) => LEVELS.find((l) => (s.progress[id] ?? 0) >= l.at) ?? null;

  // --- what the resort did ------------------------------------------------------------------------------------------
  function onReview(v) {
    s.stays.push([v.day, TYPE_IDS.indexOf(v.type), Math.round(v.sat), v.cats?.food ?? 0, ROOM_TYPES[v.got]?.rank ?? 0]);
  }
  function onEvent(evt) {
    s.events.push([evt.ended ?? evt.date, evt.ev, Math.round(evt.score)]);
  }
  function onEdge(day, band, bk) {
    if (band !== BAND.night) return;
    const d = day - 1;
    const guests = (bk?.staying ?? []).reduce((t, b) => t + (b.party ?? 1), 0);
    const L = finance?.dayLines?.(d) ?? {};
    s.days.push([d, guests, (L.evening ?? 0) + (L.dining ?? 0)]);
    const from = day - WINDOW - 1;
    s.days = s.days.filter((x) => x[0] > from);
    s.stays = s.stays.filter((x) => x[0] > from);
    s.events = s.events.filter((x) => x[0] > from);
    if (day > 0 && day % 28 === 0) recalc(day);
  }

  // --- the Signature ------------------------------------------------------------------------------------------------
  let today = 0;
  function whyNoSignature(id) {
    const t = themeById(id);
    if (!t) return 'No such theme.';
    if (stageIndex(progress?.stage ?? 'roadside') < stageIndex(SIGNATURE.stage)) return 'Opens at the World-Class Resort stage.';
    if ((s.progress[id] ?? 0) < SIGNATURE.min) return `Needs ${SIGNATURE.min}+ (now ${Math.round(s.progress[id] ?? 0)}).`;
    if (s.signature?.id === id) return 'It is your Signature.';
    if (s.signature) {
      if (today < s.signature.since + SIGNATURE.cooldownDays) return `It can change in ${s.signature.since + SIGNATURE.cooldownDays - today} days.`;
      if ((finance?.cash ?? Infinity) < SIGNATURE.changeCost) return 'Not enough Credits: a change costs 10,000.';
    }
    return null;
  }
  function setSignature(id) {
    const why = whyNoSignature(id);
    if (why) return { ok: false, why };
    if (s.signature) {
      finance?.spend('signature', SIGNATURE.changeCost, today);
      s.stats.changes++;
    }
    s.signature = { id, since: today };
    bus?.emit('themes:signature', { id });
    changed();
    return { ok: true };
  }
  const sigTags = () => (s.signature ? themeById(s.signature.id).tags : []);
  // A stay's extra satisfaction: each satisfaction combo for the guest's tags +10% of it; the Signature's guests +2.
  function extraSat(b, raw) {
    let add = 0;
    for (const f of comboFx('sat')) if (hasTag(b.type, f.tags)) add += raw * COMBO_BONUS;
    if (s.signature && hasTag(b.type, sigTags())) add += SIGNATURE.sat;
    return add;
  }
  const eventMult = (evt) => (comboFx('eventScore').length ? 1 + COMBO_BONUS : 1) * (comboFx('weddingScore').length && ['EV03', 'EV11'].includes(evt.ev) ? 1 + COMBO_BONUS : 1);
  const spendMult = (line) => (line === 'evening' && comboFx('eveningSpend').length ? 1 + COMBO_BONUS : 1);

  // Demand: themes at 50+ / 75+ (and the Signature), combos' demand +10% — through the ±20% stack.
  setDemandSource('Themes', (typeId) => {
    if (!typeId) return null;
    let v = 0;
    for (const t of THEMES) if (hasTag(typeId, t.tags)) v += levelOf(t.id)?.demand ?? 0;
    if (s.signature && hasTag(typeId, sigTags())) v += SIGNATURE.demand;
    return v ? { type: v, words: 'Resort themes' } : null;
  });
  setDemandSource('Combos', (typeId) => {
    if (!typeId) return null;
    const v = comboFx('demand').filter((f) => hasTag(typeId, f.tags)).length * COMBO_BONUS;
    return v ? { type: v, words: 'Facility combos' } : null;
  });

  return {
    onReview,
    onEvent,
    onEdge(day, band, bk) {
      today = day;
      onEdge(day, band, bk);
    },
    recalc,
    compute: (day) => compute(day ?? today),
    inputs,
    levelOf,
    whyNoSignature,
    setSignature,
    extraSat,
    eventMult,
    spendMult,
    setPrestige(fn) {
      LIVE.prestige = fn;
    },
    // Tests / ?debug=1: a theme's progress now (the next month end works it out again from play).
    force(id, v) {
      if (themeById(id)) s.progress[id] = v;
      changed();
    },
    get progress() {
      return { ...s.progress };
    },
    get history() {
      return s.history;
    },
    get signature() {
      return s.signature;
    },
    get stats() {
      return clone(s.stats);
    },
    serialize: () => clone(s),
  };
}
function load(saved) {
  const f = freshThemes();
  if (!saved || typeof saved !== 'object') return f;
  const s = clone(saved);
  return { days: Array.isArray(s.days) ? s.days : [], stays: Array.isArray(s.stays) ? s.stays : [], events: Array.isArray(s.events) ? s.events : [], progress: { ...f.progress, ...(s.progress ?? {}) }, history: Array.isArray(s.history) ? s.history : [], signature: s.signature && themeById(s.signature.id) ? s.signature : null, stats: { ...f.stats, ...(s.stats ?? {}) } };
}
export { THEMES, COMBOS, FACILITIES };
