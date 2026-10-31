// Complaints / recovery (Milestone 7, bible §18 / §27A / §27F / §27P). A stay's bad moments are triggers — a late room
// (30+ game minutes at Reception, M4), a room short on linen, a slow check-in (20+ minutes at the front desk because the
// Front Office person was busy or off shift), a nightly rate more than 10% over the guest type's budget, a café over its
// covers. Each trigger becomes a complaint with chance (100 − Patience) / 100 × severity (data/complaints.js), rolled from
// the run's seed, the booking and the kind — so the same seed gives the same complaints at every speed and frame size.
// The player answers with a recovery action (apology & priority service, room change, a comped café meal, a partial
// refund); it works with chance 50 + (Front Office Service − 50) + 25 if a best fit − 10 per band waited (5–95), also
// seeded. Success cancels that category's loss and gives the stay a Recovery Bonus (+8 final satisfaction, +4 more in
// the same band; the stay is "Saved by great service"); a fail costs 5 and the complaint can be tried once more. At
// check-out an unresolved complaint costs REP 5 and the review says so (src/systems/reviews.js reads closeStay()).
// Plain, saved state moved on with the booking system (bookings.attachComplaints(cp)): its check-ins, its band edges and
// the game minute (advance, every step — a late party's 30 minutes can pass inside a band).
//   createComplaints({ saved, bus, team, seed, bookings, finance }) → cp
//     cp.advance(minute) · cp.onCheckIn(booking, minute) · cp.onEdge(day, band, bookings) · cp.closeStay(booking, day)
//     cp.options(id) → each action: { id, name, line, ok, why, best, chance, cost, room } · cp.act(id, actionId)
//     cp.open (complaints of guests still here, oldest first) · cp.byId(id) · cp.forBooking(bid) · cp.history · cp.counts
//     cp.force(bid, kind) · cp.setEnabled(on) (tests / debug) · cp.firstShown · cp.markFirstShown() · cp.at · serialize()
//   On the bus: 'complaint:new' { complaint, first } · 'complaint:result' { complaint, ok, action } · 'complaint:change'
// Milestone 8: with maintenance attached (attachMaintenance(mt), src/systems/maintenance.js) a room breaking with a party
// in it gives them a breakdown complaint (onRoomBreakdown, no roll: they need a room change); Reception, the Pool or the
// Café going offline is a rolled breakdown trigger for each party staying (onFacilityBreakdown; its category is the one
// that facility feeds). Maintenance priority (best fit for a breakdown) puts the repair first in Maintenance's line. A
// worn Reception slows the front desk (offline: check-ins take twice as long); a worn Café serves fewer covers.
// Milestone 9: noise in a party's room over their Noise tolerance (src/systems/layout.js passes it on: onNoise) is a
// rolled noise trigger, once a stay; a recovered one cancels the stay's Comfort losses.
import { Rng } from '../../../../core/Rng.js';
import { GUEST_TYPES, ROOM_TYPES } from '../../data/bookings.js';
import { FACILITIES, roomById } from '../../data/lot.js';
import { BANDS } from '../../data/calendar.js';
import { COMPLAINT_TYPES, TRIGGERS, DESK, ACTIONS, ACTION_IDS, RECOVERY, HISTORY_MAX } from '../../data/complaints.js';
import { FELT, CONDITION } from '../../data/maintenance.js';
import { minuteOf, bandAtMinute } from './calendar.js';
import { onShiftAtMinute } from './housekeeping.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
const r2 = (x) => Math.round(x * 100) / 100;
const BAND = Object.fromEntries(BANDS.map((b, i) => [b.id, i]));
const NB = BANDS.length;
const STATS0 = { triggers: 0, raised: 0, recovered: 0, failedTries: 0, unresolved: 0, stays: 0, staysWithComplaint: 0, byKind: {}, triggersByKind: {}, actions: {} };

// The chance a trigger becomes a complaint for this guest type (0–1).
export const complaintChance = (typeId, kind) => {
  const t = COMPLAINT_TYPES[kind];
  if (!t?.on) return 0;
  const p = GUEST_TYPES[typeId]?.patience ?? 50;
  return Math.max(0, Math.min(1, ((100 - p) / 100) * t.severity));
};
// The recovery success chance (whole %, clamped).
export function recoveryChance({ service = 50, best = false, bandsWaited = 0 } = {}) {
  const R = RECOVERY;
  const c = R.base + (service - R.pivot) + (best ? R.bestFit : 0) - R.perBand * Math.max(0, bandsWaited);
  return Math.max(R.min, Math.min(R.max, Math.round(c)));
}
// Bands from (day, band) a to b (both band indexes of the day).
export const bandsBetween = (a, b) => b.day * NB + b.band - (a.day * NB + a.band);

export function freshComplaints() {
  return { at: 0, list: [], history: [], seen: {}, desk: { freeAt: 0 }, firstShown: false, stats: clone(STATS0) };
}

// The best stat on the team in that role (50 = neutral when nobody holds it).
function roleStat(team, role, stat) {
  const v = (team ?? []).filter((m) => m.role === role).map((m) => m.stats?.[stat] ?? 50);
  return v.length ? Math.max(...v) : 50;
}

export function createComplaints({ saved = null, bus = null, team = [], seed = 'resortworks', bookings = null, finance = null, facilities = FACILITIES } = {}) {
  const s = load(saved);
  let version = 0;
  let mt = null; // (Milestone 8) the maintenance system, once attached
  const changed = () => {
    version++;
    bus?.emit('complaint:change', {});
  };
  const fo = () => (team ?? []).filter((m) => m.role === DESK.role);
  const service = () => roleStat(team, RECOVERY.role, RECOVERY.stat);
  const at = (minute) => {
    const b = bandAtMinute(minute);
    return { day: b.day, band: b.band };
  };
  const nowAt = () => at(s.at);
  const bump = (o, k) => (o[k] = (o[k] ?? 0) + 1);

  // A trigger for one stay (each kind at most once a stay): rolled, and a complaint if it comes up. key: what counts as
  // "the same trigger" and seeds its roll (the kind; Milestone 8: each facility breakdown its own, 'breakdown:F03').
  let enabled = true; // (?debug=1&complaints=0: the older milestones' browser runs switch triggers off)
  function trigger(b, kind, minute, info = {}, key = kind) {
    if (!enabled || !COMPLAINT_TYPES[kind]?.on) return null;
    const seen = (s.seen[b.id] ??= {});
    if (seen[key]) return null;
    seen[key] = true;
    s.stats.triggers++;
    bump(s.stats.triggersByKind, kind);
    const roll = new Rng(`${seed}:complaint:${b.id}:${key}`).next();
    if (!(roll < complaintChance(b.type, kind))) return null;
    return raise(b, kind, minute, info);
  }
  function raise(b, kind, minute, info = {}) {
    const w = at(minute);
    const c = { id: `${b.id}-${kind}`, booking: b.id, type: b.type, party: b.party ?? 1, room: b.room, rate: b.rate, kind, at: r2(minute), day: w.day, band: w.band, status: 'open', tries: [], info };
    if (s.list.some((x) => x.id === c.id)) return null;
    s.list.push(c);
    s.list.sort((a, x) => a.at - x.at || (a.id < x.id ? -1 : 1));
    s.stats.raised++;
    bump(s.stats.byKind, kind);
    const first = !s.firstShown; // the first complaint ever (Opal's line): marked at once, so it is saved with it
    s.firstShown = true;
    bus?.emit('complaint:new', { complaint: clone(c), first });
    changed();
    return c;
  }

  // The front desk: how long this party waits to check in (DESK).
  function deskWait(b, t) {
    const people = fo();
    if (!people.length || b.priority) return 0;
    const onShift = people.some((m) => onShiftAtMinute(m.pattern, t));
    if (!onShift) return DESK.offShiftWait;
    const start = Math.max(t, s.desk.freeAt);
    const desk = mt ? Math.max(CONDITION.halfFactor, mt.eff('F01')) : 1; // (Milestone 8) worn: slower; offline: twice as long
    s.desk.freeAt = r2(start + DESK.checkInMinutes / desk);
    return r2(start - t);
  }

  // The room a room change would give: a Ready room nobody holds, sleeping the party, of the same or a better type (same
  // type first, then the lowest number).
  function roomChangeTo(c) {
    const b = bookings?.byId(c.booking);
    if (!b || !['waiting', 'staying'].includes(b.status)) return null;
    return bookings.roomChangeOptions(b.id)[0] ?? null;
  }

  // Every recovery action for a complaint: can it be used now, why not, best fit, the chance and what it costs.
  function options(id) {
    const c = s.list.find((x) => x.id === id);
    if (!c) return [];
    const t = COMPLAINT_TYPES[c.kind];
    const b = bookings?.byId(c.booking);
    const waited = Math.max(0, bandsBetween(c, nowAt()));
    const closed = c.status !== 'open';
    return ACTION_IDS.map((aid) => {
      const a = ACTIONS[aid];
      const best = t.best.includes(aid);
      const o = { id: aid, name: a.name, line: a.line, best, on: a.on, ok: true, why: null, chance: recoveryChance({ service: service(), best, bandsWaited: waited }), cost: 0, room: null };
      if (!a.on) return { ...o, ok: false, why: `Comes with ${a.from === 'later' ? 'a later update' : `Milestone ${a.from.slice(1)}`}.` };
      if (a.only && a.only !== c.kind) return { ...o, on: false, hidden: true, ok: false, why: 'Only for a breakdown.' }; // (not shown for other complaints)
      if (closed) return { ...o, ok: false, why: c.status === 'recovered' ? 'Already sorted out.' : 'No more tries.' };
      if (aid === 'apology' && b?.priority) return { ...o, ok: false, why: 'They already have priority service.' };
      if (aid === 'maintenance') {
        const target = c.info?.target;
        if (!mt || !target || !mt.isOffline(target)) return { ...o, ok: false, why: 'It’s already repaired.' };
        if (mt.isPriority(target)) return { ...o, ok: false, why: 'Maintenance is already going there first.' };
        o.target = target;
      }
      if (aid === 'roomChange') {
        const r = roomChangeTo(c);
        if (!r) return { ...o, ok: false, why: 'No Ready room as good or better is free.' };
        o.room = r.id;
      }
      if (aid === 'comp') o.cost = a.perGuest * (c.party ?? 1);
      if (aid === 'refund') o.cost = Math.round((c.rate ?? 0) * a.share);
      return o;
    });
  }

  // The player answers a complaint: the action happens, then the seeded roll says whether it worked.
  function act(id, actionId) {
    const c = s.list.find((x) => x.id === id);
    if (!c) return { ok: false, why: 'That complaint has gone.' };
    const o = options(id).find((x) => x.id === actionId);
    if (!o) return { ok: false, why: 'Unknown action.' };
    if (!o.ok) return { ok: false, why: o.why };
    const w = nowAt();
    const day = w.day;
    if (actionId === 'apology') bookings?.setPriority(c.booking);
    if (actionId === 'maintenance') mt?.prioritize(o.target); // (Milestone 8) the repair jumps Maintenance's line
    if (actionId === 'roomChange') {
      const r = bookings?.changeRoom(c.booking, o.room, s.at);
      if (!r?.ok) return { ok: false, why: r?.why ?? 'The room change didn’t work.' };
      c.room = o.room;
    }
    if (o.cost && ACTIONS[actionId].ledger) finance?.spend(ACTIONS[actionId].ledger, o.cost, day, c.room);
    const n = c.tries.length + 1;
    const roll = Math.floor(new Rng(`${seed}:recover:${c.id}:${n}`).next() * 100);
    const success = roll < o.chance;
    const waited = Math.max(0, bandsBetween(c, w));
    c.tries.push({ action: actionId, chance: o.chance, roll, ok: success, at: r2(s.at), day, band: w.band, waited, best: o.best, cost: o.cost });
    bump(s.stats.actions, actionId);
    if (success) {
      c.status = 'recovered';
      c.sameBand = waited === 0;
      s.stats.recovered++;
    } else {
      s.stats.failedTries++;
      if (c.tries.length >= RECOVERY.tries) c.status = 'failed';
    }
    bus?.emit('complaint:result', { complaint: clone(c), ok: success, action: actionId });
    changed();
    return { ok: true, success, chance: o.chance, complaint: c };
  }

  // A stay ends: its complaints are settled (still open or out of tries = unresolved) and what they do to the review.
  function closeStay(b) {
    const mine = s.list.filter((c) => c.booking === b.id);
    s.stats.stays++;
    delete s.seen[b.id];
    const fx = { cancel: {}, bonus: 0, penalty: 0, unresolved: 0, recovered: 0, saved: false, complaints: [] };
    if (!mine.length) return fx;
    s.stats.staysWithComplaint++;
    for (const c of mine) {
      fx.penalty += RECOVERY.fail * c.tries.filter((x) => !x.ok).length;
      if (c.status === 'recovered') {
        fx.recovered++;
        fx.cancel[c.info?.category ?? COMPLAINT_TYPES[c.kind].category] = true;
        fx.bonus = Math.max(fx.bonus, RECOVERY.bonus + (c.sameBand ? RECOVERY.sameBand : 0)); // one Recovery Bonus a stay
      } else {
        c.status = 'unresolved';
        fx.unresolved++;
        s.stats.unresolved++;
      }
      fx.complaints.push({ kind: c.kind, status: c.status });
      c.closed = true;
    }
    fx.saved = fx.recovered > 0;
    s.list = s.list.filter((c) => c.booking !== b.id);
    s.history.unshift(...mine.reverse());
    if (s.history.length > HISTORY_MAX) s.history.length = HISTORY_MAX;
    changed();
    return fx;
  }

  const cp = {
    // The game minute moves on: a party waiting for a late room passes 30 minutes at Reception.
    advance(minute) {
      if (!(minute > s.at)) return;
      s.at = minute;
      for (const b of bookings?.waiting ?? []) if (b.waitFrom + TRIGGERS.lateMinutes <= minute) trigger(b, 'late', b.waitFrom + TRIGGERS.lateMinutes);
    },
    // A party checks in (the booking system calls it): a late room it waited 30+ minutes for, the front desk queue, a room
    // short on linen, a price over their budget.
    onCheckIn(b, minute) {
      if (minute > s.at) s.at = minute;
      if (b.late && b.late.minutes >= TRIGGERS.lateMinutes) trigger(b, 'late', b.waitFrom + TRIGGERS.lateMinutes);
      const wait = deskWait(b, minute);
      b.deskWait = wait;
      if (wait >= TRIGGERS.queueMinutes) trigger(b, 'queue', minute + TRIGGERS.queueMinutes, { minutes: wait });
      if (b.shortLinen) trigger(b, 'clean', minute);
      const budget = GUEST_TYPES[b.type]?.budget;
      if (budget && b.rate > budget * (1 + TRIGGERS.valueOver)) trigger(b, 'value', minute, { rate: b.rate, budget });
    },
    // A band begins: in the café's band, more guests than its covers → each party staying has a food trigger. (Milestone 8)
    // A worn café serves covers × its working share; an offline one serves nobody (its breakdown is its own trigger).
    onEdge(day, band, bk) {
      const f = TRIGGERS.food;
      if (band !== BAND[f.band] || !facilities.some((x) => x.id === f.facility)) return;
      const share = mt ? mt.eff(f.facility) : 1;
      if (share <= 0) return;
      const stay = bk?.staying ?? [];
      const guests = stay.reduce((t, b) => t + (b.party ?? 1), 0);
      if (guests > Math.floor(f.covers * share)) for (const b of stay) trigger(b, 'food', minuteOf(day, band), { guests });
    },
    // (Milestone 8) a room breaks with this party in it: a breakdown complaint, no roll (they need a room change).
    onRoomBreakdown(b, minute, roomId) {
      if (!enabled) return null;
      const seen = (s.seen[b.id] ??= {});
      if (seen.breakdown) return null;
      seen.breakdown = true;
      s.stats.triggers++;
      bump(s.stats.triggersByKind, 'breakdown');
      if (minute > s.at) s.at = minute;
      return raise(b, 'breakdown', minute, { target: roomId, category: COMPLAINT_TYPES.breakdown.category });
    },
    // (Milestone 8) Reception, the Pool or the Café goes offline: a rolled breakdown trigger for each party staying.
    onFacilityBreakdown(id, minute) {
      const category = FELT[id];
      if (!category) return;
      for (const b of bookings?.staying ?? []) trigger(b, 'breakdown', minute, { target: id, category }, `breakdown:${id}`);
    },
    // (Milestone 9) noise in their room over their tolerance this band (a rolled trigger, once a stay).
    onNoise(b, minute, noise) {
      if (minute > s.at) s.at = minute;
      return trigger(b, 'noise', minute, { noise, category: COMPLAINT_TYPES.noise.category });
    },
    attachMaintenance(m) {
      mt = m;
    },
    closeStay,
    options,
    act,
    // Debug only: no new triggers (force still works).
    setEnabled(on) {
      enabled = !!on;
    },
    // Tests / debug: a complaint of this kind for this guest now, no roll.
    force(bid, kind) {
      const b = bookings?.byId(bid);
      if (!b || !b.status) return null;
      (s.seen[b.id] ??= {})[kind] = true;
      return raise(b, kind, s.at, { forced: true });
    },
    get open() {
      return s.list;
    },
    byId: (id) => s.list.find((c) => c.id === id) ?? s.history.find((c) => c.id === id) ?? null,
    forBooking: (bid) => s.list.filter((c) => c.booking === bid),
    // Open complaints still needing an answer (not recovered, tries left).
    get needing() {
      return s.list.filter((c) => c.status === 'open');
    },
    get history() {
      return s.history;
    },
    get counts() {
      return clone(s.stats);
    },
    get firstShown() {
      return s.firstShown;
    },
    markFirstShown() {
      s.firstShown = true;
    },
    serviceStat: () => service(),
    get at() {
      return s.at;
    },
    get version() {
      return version;
    },
    serialize: () => clone(s),
  };
  return cp;
}

function load(saved) {
  const f = freshComplaints();
  if (!saved || typeof saved !== 'object') return f;
  const s = clone(saved);
  const okC = (c) => c && COMPLAINT_TYPES[c.kind] && GUEST_TYPES[c.type] && roomById(c.room);
  return {
    at: Number.isFinite(s.at) ? s.at : 0,
    list: Array.isArray(s.list) ? s.list.filter(okC) : [],
    history: Array.isArray(s.history) ? s.history.filter(okC).slice(0, HISTORY_MAX) : [],
    seen: s.seen && typeof s.seen === 'object' ? s.seen : {},
    desk: { freeAt: Number.isFinite(s.desk?.freeAt) ? s.desk.freeAt : 0 },
    firstShown: !!s.firstShown,
    stats: { ...clone(STATS0), ...(s.stats ?? {}) },
  };
}

// "Late room · Road Trip Couple · Room 3" helpers for the sheets.
export const complaintTitle = (c) => COMPLAINT_TYPES[c.kind]?.name ?? 'Complaint';
export function complaintLine(c) {
  const f = c.kind === 'breakdown' && FACILITIES.find((x) => x.id === c.info?.target); // (Milestone 8) a facility broke
  return f ? `The ${f.name} broke down during their stay.` : COMPLAINT_TYPES[c.kind]?.line ?? '';
}
export const roomTypeRank = (roomId) => ROOM_TYPES[roomById(roomId)?.typeId]?.rank ?? 0;
