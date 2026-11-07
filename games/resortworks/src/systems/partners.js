// Partners (Milestone 22, bible §23): the series Sponsor system, presented as Partners. The Partner Board has 1 slot at
// Rank E/D, 2 at C/B, 3 at A/S; each slot is its own core/SponsorSystem (one deal at a time each), so every contract
// keeps the shared rules: a clear goal, a 336-day length, a passive benefit while it runs, the completion reward the
// moment the goal is met (Credits and Staff Items), a renewal offer when it ends met — and a missed goal loses the reward
// and waits before that partner offers again (what was earned is kept). Offers come from partners whose unlock is met
// (one new offer every 7 days at most; each waits 56 days); R33 Partner Network makes both 25% sooner. P09 / P10 are
// Secret: never offered. Priya Lark presents the offers and the goals (the screen's toasts).
//   createPartners({ saved, bus, finance, items, reviews, bookings, site, seed }) → pb
//     pb.onEdge(day, band) · whyNotOffer(id) · offerNow(id) (tests / ?debug=1) · sign(id) · decline(id) · signal(name, payload)
//     pb.slotsNow · active (each slot's deal) · offers · total(key, typeId?) · stats · history · serialize()
//   On the bus: 'partners:offer' · 'partners:signed' · 'partners:met' { id, reward } · 'partners:ended' · 'partners:change'
import { SponsorSystem } from '../../../../core/SponsorSystem.js';
import { Rng } from '../../../../core/Rng.js';
import { PARTNERS, partnerById, PARTNER_RULES } from '../../data/partners.js';
import { ITEM_TYPES } from '../../data/items.js';
import { GUEST_TYPES } from '../../data/bookings.js';
import { BANDS } from '../../data/calendar.js';
import { has } from './facilities.js';
import { rx } from './research.js';
import { setDemandSource } from './guests.js';
import { rankAtLeast } from '../../data/build.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
const BAND = Object.fromEntries(BANDS.map((b, i) => [b.id, i]));
const DEFS = PARTNERS.map((p) => ({ ...p, obligation: { type: 'count', ...p.goal } }));
export const freshPartners = () => ({ slots: [null, null, null], offers: [], cooldown: {}, history: [], nextOffer: 0, stats: { offered: 0, signed: 0, met: 0, notMet: 0, credits: 0, items: 0 } });
const hasTag = (typeId, tags) => !tags?.length || tags.some((t) => GUEST_TYPES[typeId]?.tags?.includes(t));

export function createPartners({ demand = null, saved = null, bus = null, finance = null, items = null, reviews = null, bookings = null, seed = 'resortworks' } = {}) {
  const s = load(saved);
  const R = PARTNER_RULES;
  const soon = () => 1 - rx('partnerCooldown');
  const makeSlot = (data) => {
    const sp = new SponsorSystem({ defs: DEFS, dealDays: R.contractDays, offerDays: R.offerDays, cooldownDays: Math.round(R.cooldownDays * soon()), hooks: { eligible: () => true, matches } });
    sp.load(data);
    return sp;
  };
  const slots = s.slots.map((x) => makeSlot(x));
  let today = 0;
  const changed = () => bus?.emit('partners:change', {});
  const sync = () => {
    s.slots = slots.map((sp) => sp.serialize());
  };
  // Does this signal count for the goal? (tags, a minimum satisfaction or score, a package)
  function matches(ob, p) {
    if (ob.tags && !(hasTag(p.type, ob.tags) || (ob.orPkg && ob.orPkg.includes(p.pkg)))) return false;
    if (ob.minSat != null && !(p.sat >= ob.minSat)) return false;
    if (ob.minScore != null && !(p.score >= ob.minScore)) return false;
    return true;
  }
  const rank = () => reviews?.rank?.id ?? 'E';
  const slotsNow = () => R.slots[rank()] ?? 1;
  const activeIds = () => slots.map((sp) => sp.active?.id).filter(Boolean);
  // Why this partner isn't offering now (one plain line), or null.
  let secretOpen = () => false; // (Milestone 27)
  let rewardMult = null; // (Milestone 28b)
  function whyNotOffer(id) {
    const p = partnerById(id);
    if (!p) return 'No such partner.';
    if (p.secret && !secretOpen(id)) return 'Secret.'; // (Milestone 27) P09 / P10 through SEC39 / SEC40
    const u = p.unlock;
    if (u.stays && (bookings?.stats?.checkOuts ?? 0) < u.stays) return `After ${u.stays} completed stays.`;
    if (u.built && !u.built.every(has)) return `Needs ${u.built.join(' + ')} built.`;
    if (u.rank && !rankAtLeast(rank(), u.rank)) return `Needs Rank ${u.rank}.`;
    if (u.stars && (reviews?.stars ?? 0) < u.stars) return `Needs a ${u.stars}★ rating.`;
    if (activeIds().includes(id)) return 'Under contract.';
    if (s.offers.some((o) => o.id === id)) return 'Offer waiting.';
    if ((s.cooldown[id] ?? -1) > today) return `Offers again in ${s.cooldown[id] - today} days.`;
    return null;
  }
  function offerNow(id, renewal = false) {
    if (!renewal && whyNotOffer(id)) return null;
    const o = { id, day: today, untilDay: today + R.offerDays, renewal };
    s.offers.push(o);
    s.stats.offered++;
    bus?.emit('partners:offer', { offer: clone(o), name: partnerById(id).name, renewal });
    changed();
    return o;
  }
  function sign(id) {
    const o = s.offers.find((x) => x.id === id);
    if (!o) return { ok: false, why: 'That offer has gone.' };
    const i = slots.findIndex((sp, k) => k < slotsNow() && !sp.active);
    if (i < 0) return { ok: false, why: `The Partner Board is full (${slotsNow()} at Rank ${rank()}).` };
    const sp = slots[i];
    sp.offers = [{ id, day: today, untilDay: o.untilDay, renewal: o.renewal }];
    const r = sp.sign(id, today);
    if (!r.ok) return { ok: false, why: r.reason };
    s.offers = s.offers.filter((x) => x !== o);
    s.stats.signed++;
    sync();
    bus?.emit('partners:signed', { id, name: partnerById(id).name });
    changed();
    return { ok: true, slot: i };
  }
  function decline(id) {
    const n = s.offers.length;
    s.offers = s.offers.filter((x) => x.id !== id);
    if (n !== s.offers.length) changed();
    return n !== s.offers.length;
  }
  // The completion reward, the moment the goal is met: Credits and Staff Items (the Partner source).
  function reward(id) {
    const p = partnerById(id);
    const rng = new Rng(`${seed}:partner:${id}:${s.stats.met}`);
    finance?.earn('partners', Math.round(p.reward.credits * (rewardMult?.() ?? 1)), today, id); // (M28b: Kaching +20%)
    s.stats.credits += p.reward.credits;
    const got = [];
    for (const it of p.reward.items) {
      const pool = ITEM_TYPES.filter((t) => (it.group ? t.group === it.group : t.rarity === it.rarity));
      for (let k = 0; k < it.n && pool.length; k++) {
        const t = pool[Math.floor(rng.next() * pool.length)];
        if (items?.grant('partner', { type: t.id })) {
          got.push(t.id);
          s.stats.items++;
        }
      }
    }
    s.stats.met++;
    bus?.emit('partners:met', { id, name: p.name, credits: p.reward.credits, items: got });
  }
  // Something happened that a goal may count: each running contract hears it.
  function signal(name, payload = {}) {
    for (const sp of slots) {
      const a = sp.active;
      if (!a) continue;
      const was = a.met;
      sp.signal(name, payload, today);
      if (!was && sp.active?.met) reward(a.id);
    }
    sync();
  }
  // The rolling Food score (the stays of the last 28 days).
  function food28() {
    const l = (reviews?.list ?? []).filter((v) => v.day > today - 28);
    return l.length ? l.reduce((t, v) => t + v.cats.food, 0) / l.length : 0;
  }
  function onEdge(day, band) {
    today = day;
    if (band !== BAND.morning) return;
    s.offers = s.offers.filter((o) => o.untilDay >= day);
    for (const sp of slots) {
      const rec = sp.dailyTick(day);
      if (!rec) continue;
      s.history.push(rec);
      if (s.history.length > 40) s.history.shift();
      if (rec.result === 'met') {
        sp.offers = [];
        offerNow(rec.id, true); // renew on the same terms
      } else {
        s.stats.notMet++;
        s.cooldown[rec.id] = day + Math.round(R.cooldownDays * soon());
      }
      bus?.emit('partners:ended', { record: rec, name: partnerById(rec.id).name });
    }
    if (food28() >= 80) signal('foodDay', {});
    if (day >= s.nextOffer) {
      const p = PARTNERS.find((x) => !whyNotOffer(x.id));
      if (p) {
        offerNow(p.id);
        s.nextOffer = day + Math.max(1, Math.round(R.offerEvery * soon()));
      }
    }
    sync();
  }
  // A benefit's total over the running contracts (for a guest type: only benefits for its tags).
  function total(key, typeId = null) {
    let t = 0;
    for (const sp of slots) {
      const d = sp.activeDef;
      if (!d) continue;
      for (const b of d.benefits ?? []) if (b.key === key && (typeId === null ? !b.tags : b.tags ? hasTag(typeId, b.tags) : false)) t += b.value;
    }
    return t;
  }
  setDemandSource('Partners', (typeId) => {
    const v = typeId ? total('demand', typeId) : total('demand');
    return v ? (typeId ? { type: v, words: 'Partners' } : { base: v, words: 'Partners' }) : null;
  }, demand);

  return {
    onEdge,
    whyNotOffer,
    offerNow,
    sign,
    decline,
    signal,
    total,
    food28,
    setSecretOpen(fn) {
      secretOpen = fn ?? (() => false);
    },
    setRewardMult(fn) {
      rewardMult = fn;
    },
    get slotsNow() {
      return slotsNow();
    },
    get active() {
      return slots.map((sp, i) => (sp.active ? { slot: i, ...clone(sp.active), def: partnerById(sp.active.id), daysLeft: sp.daysLeft(today) } : null));
    },
    get offers() {
      return s.offers;
    },
    get history() {
      return s.history;
    },
    get stats() {
      return clone(s.stats);
    },
    serialize: () => {
      sync();
      return clone(s);
    },
  };
}
function load(saved) {
  const f = freshPartners();
  if (!saved || typeof saved !== 'object') return f;
  const s = clone(saved);
  return { slots: Array.isArray(s.slots) ? [0, 1, 2].map((i) => s.slots[i] ?? null) : f.slots, offers: Array.isArray(s.offers) ? s.offers.filter((o) => partnerById(o.id)) : [], cooldown: s.cooldown ?? {}, history: Array.isArray(s.history) ? s.history : [], nextOffer: Number.isFinite(s.nextOffer) ? s.nextOffer : 0, stats: { ...f.stats, ...(s.stats ?? {}) } };
}
