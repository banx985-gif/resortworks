// Events (Milestone 19, bible §17 / §27J). Enquiries come in (a seeded roll each Monday, for events whose facilities are
// built); the player books one for its date: the venue's places (and every required facility's) are reserved for its
// days — the same place book packages use, so neither oversells — and a block of rooms is booked for its party (its
// guests stay, walk the lot and leave reviews like any party). On its first day Rocco Sparkle opens it; that Afternoon he
// presents its one live choice (Kairosoft rule 4: two or three options and Skip; Skip if the player doesn't answer by
// the end). The Morning after its last night it is scored — 30% Service + 25% Food + 20% Activity / event delivery + 15%
// room group score + 10% venue condition − penalties (+ the choice, R22 Events +6) — and paid: Failed (< 50, half the
// fee, REP −8), Completed with issues (to Success, 80%), Success (the fee), Great Success (+35%, a positive memory and a
// Staff Item). Its food and service cost 18 Credits an attendee a day. Event days are extra work for everyone on shift.
// Plain, saved state moved on by the booking system's band edges (wired in src/systems/lateSystems.js).
//   createEvents({ saved, bus, seed, team, finance, reviews, maintenance, packages, bookings, items }) → evs
//     evs.onEdge(day, band) · whyNot(evId) · accept(enquiryId) → { ok, why?, event? } · decline(enquiryId) ·
//     choose(eventId, optionId | 'skip') · force(evId) (debug / tests: an enquiry now) · scoreOf(event) (the parts) ·
//     enquiries · booked · running · history · stats · pendingChoice · serialize()
//   On the bus: 'events:enquiry' · 'events:booked' · 'events:start' { event, line } · 'events:choice' { event } ·
//   'events:result' { event } · 'events:change'
import { Rng } from '../../../../core/Rng.js';
import { EVENTS, eventById, ENQUIRY, RESULT, SCORE_W, PER_ATTENDEE_DAY, ROCCO_OPEN } from '../../data/events.js';
import { VENUE_CAP } from '../../data/packages.js';
import { FACILITY_FX } from '../../data/facilities.js';
import { GUEST_TYPES, ROOM_TYPES } from '../../data/bookings.js';
import { ROOMS } from '../../data/lot.js';
import { BANDS } from '../../data/calendar.js';
import { has, mult, categoryAdd, diningCovers } from './facilities.js';
import { rx } from './research.js';
import { teamBonus } from './staff.js';
import { stayCategories } from './reviews.js';
import { supplyCap } from './supplies.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
const BAND = Object.fromEntries(BANDS.map((b, i) => [b.id, i]));
const clamp = (x) => Math.max(0, Math.min(100, x));
const r2 = (x) => Math.round(x * 100) / 100;
export const EVENT_LOAD = 4; // extra fatigue a working band on an event day (Claude Code's pick)
export const freshEvents = () => ({ nextId: 1, enquiries: [], booked: [], history: [], stats: { held: 0, byResult: {}, byEvent: {}, great: 0, best: 0, enquiries: 0, declined: 0, expired: 0 } });

// The venue's places for a group (a hall / lawn its capacity; otherwise its users a part of the day × level).
export const venuePlaces = (fac) => (!has(fac) ? 0 : VENUE_CAP[fac] ?? Math.floor((FACILITY_FX[fac]?.users ?? 0) * mult(fac)));

export function createEvents({ saved = null, bus = null, seed = 'resortworks', team = [], finance = null, reviews = null, maintenance = null, packages = null, bookings = null, items = null } = {}) {
  const s = load(saved);
  let wx = null; // (Milestone 24) the weather: an outdoor event's disruption
  let demand = () => 0; // (Milestone 22) P06 EventWorks: event enquiries +12%
  let scoreMult = null; // (Milestone 21) combos
  const changed = () => bus?.emit('events:change', {});
  const tb = (k) => teamBonus(team, k);

  // The facilities this event would use: [{ fac, group }] (the venue first) — or null when one isn't built.
  function facsFor(e) {
    const out = [];
    for (const [gi, g] of e.need.entries()) {
      const built = g.filter(has).sort((a, b) => venuePlaces(b) - venuePlaces(a)); // (the roomiest first)
      const n = gi === 0 && e.distinct ? e.distinct : 1;
      if (built.length < n) return null;
      for (const f of built.slice(0, n)) out.push({ fac: f, group: gi });
    }
    return out;
  }
  function whyNot(id) {
    const e = eventById(id);
    if (!e) return 'No such event.';
    if (!facsFor(e)) return `Needs ${e.need.map((g) => g.map((f) => f).join(' or ')).join(' + ')}.`;
    if (e.roomRank && !ROOMS.some((r) => ROOM_TYPES[r.typeId].rank >= e.roomRank)) return 'Needs Premium rooms.';
    return null;
  }
  const canHold = () => EVENTS.filter((e) => !whyNot(e.id));
  // An enquiry for this event: its group (within §27J's range and what the venue holds), its date and nights.
  // The venue's places: its first group's facilities together (Festival Stay: both activity places).
  const capOf = (e) => (facsFor(e) ?? []).filter((f) => f.group === 0).reduce((t, f) => t + venuePlaces(f.fac), 0);
  function makeEnquiry(e, day, rng) {
    const cap = Math.max(e.group[0], capOf(e));
    const group = rng.int(e.group[0], Math.min(e.group[1], cap));
    const nights = rng.int(e.nights[0], e.nights[1]);
    const date = day + rng.int(ENQUIRY.ahead[0], ENQUIRY.ahead[1]);
    const q = { id: `E${s.nextId++}`, ev: e.id, made: day, date, nights, group, until: day + ENQUIRY.waitDays, fee: e.fee };
    s.enquiries.push(q);
    s.stats.enquiries++;
    bus?.emit('events:enquiry', { enquiry: clone(q), name: e.name });
    return q;
  }
  function weekly(day) {
    const rng = new Rng(`${seed}:events:${day}`);
    const roll = rng.next();
    const list = canHold();
    if (!list.length || roll >= ENQUIRY.chance * (1 + demand())) return null;
    const rareK = 1 + (has('F31') ? 0.2 : 0) + rx('prestigeEvents');
    const w = list.map((e) => [e, e.rare ? ENQUIRY.rareWeight * rareK : ENQUIRY.weight]);
    let r = rng.next() * w.reduce((t, [, x]) => t + x, 0);
    let pick = w[w.length - 1][0];
    for (const [e, x] of w) if ((r -= x) < 0) {
      pick = e;
      break;
    }
    return makeEnquiry(pick, day, rng);
  }
  // Can this enquiry be booked now? Its facilities built and the venue's places free for its group every day.
  function whyNoBook(q) {
    const e = eventById(q.ev);
    const why = whyNot(e.id);
    if (why) return why;
    const venue = facsFor(e)[0].fac;
    if (capOf(e) < q.group) return 'The venue is too small for this group now.';
    for (let d = q.date; d < q.date + q.nights; d++) if (packages && VENUE_CAP[venue] && packages.reservedOn(d, venue) + q.group > VENUE_CAP[venue]) return 'The venue is already booked on those days.';
    for (const b of s.booked) if (b.status !== 'done' && b.venue === venue && b.date < q.date + q.nights && q.date < b.date + b.nights) return 'The venue is already booked on those days.';
    return null;
  }
  function accept(qid) {
    const q = s.enquiries.find((x) => x.id === qid);
    if (!q) return { ok: false, why: 'That enquiry has gone.' };
    const why = whyNoBook(q);
    if (why) return { ok: false, why };
    const e = eventById(q.ev);
    const facs = facsFor(e);
    s.enquiries = s.enquiries.filter((x) => x !== q);
    const evt = { ...q, venue: facs[0].fac, facs: facs.map((f) => f.fac), status: 'booked', rooms: [], housed: 0, choice: null, score: null, result: null };
    // the places every day: the venue's (and each other facility's) for the group
    for (let d = q.date; d < q.date + q.nights; d++) for (const f of evt.facs) packages?.hold(d, f, Math.min(q.group, Math.max(1, venuePlaces(f))));
    // a room block for the party (as many rooms as are free on its dates, best Fit first)
    const blk = bookings?.addGroup({ type: e.guest, arrival: q.date, nights: q.nights, people: q.group, tag: evt.id }) ?? [];
    evt.rooms = blk.map((b) => b.id);
    evt.housed = blk.reduce((t, b) => t + b.party, 0);
    s.booked.push(evt);
    bus?.emit('events:booked', { event: clone(evt), name: e.name });
    changed();
    return { ok: true, event: evt };
  }
  function decline(qid) {
    const n = s.enquiries.length;
    s.enquiries = s.enquiries.filter((x) => x.id !== qid);
    if (s.enquiries.length === n) return false;
    s.stats.declined++;
    changed();
    return true;
  }
  // The live choice: an option (its cost paid now, its risk rolled now — seeded) or Skip.
  function choose(id, opt) {
    const evt = s.booked.find((x) => x.id === id);
    if (!evt || evt.status !== 'running' || evt.choice) return { ok: false, why: 'Nothing to choose now.' };
    const e = eventById(evt.ev);
    if (opt === 'skip') evt.choice = { id: 'skip', score: 0 };
    else {
      const o = e.choice.options.find((x) => x.id === opt);
      if (!o) return { ok: false, why: 'No such option.' };
      let score = o.score;
      if (o.risk && new Rng(`${seed}:events:risk:${evt.id}`).next() < o.risk.p) score = o.risk.score;
      if (o.cost) finance?.spend('eventCosts', o.cost, today, evt.venue);
      evt.choice = { id: o.id, score, cost: o.cost ?? 0, unlucky: score !== o.score };
    }
    changed();
    return { ok: true, choice: evt.choice };
  }
  // The event's score now (its parts). Inputs: the rolling Service, the food and activity facilities shared by the group,
  // the rooms it was given, the venue's Condition; penalties: the venue offline, an outdoor event rained off (M24).
  function scoreOf(evt) {
    const e = eventById(evt.ev);
    const h = reviews?.headline(evt.date + evt.nights) ?? {};
    const group = evt.group;
    const service = clamp((h.service ?? 70) * (1 + tb('groupEvent')));
    const covers = diningCovers((id) => maintenance?.eff(id) ?? 1, team);
    const foodBase = 60 + categoryAdd('food', { guests: group }) + rx('food');
    const food = clamp(Math.min(supplyCap('food') ?? 78, foodBase) * Math.min(1, Math.max(0.5, covers / group)) * (1 + rx('eventCatering') + tb('eventCatering')));
    const hall = !!VENUE_CAP[evt.venue];
    const delivery = clamp((55 + (hall ? 15 : 0) + categoryAdd('activities', { guests: group })) * (1 + tb('event') + (e.id === 'EV03' || e.id === 'EV11' ? tb('wedding') : 0)));
    const roomOf = (bid) => {
      const b = bookings?.byId(bid) ?? null;
      if (!b) return null;
      return stayCategories({ type: b.type, roomType: b.roomType, room: b.room, rate: b.rate }, { team, roomType: ROOMS.find((r) => r.id === b.room)?.typeId ?? b.roomType }).room;
    };
    const roomScores = evt.rooms.map(roomOf).filter((x) => x != null);
    const avgRoom = roomScores.length ? roomScores.reduce((t, x) => t + x, 0) / roomScores.length : 50;
    const rooms = clamp((Math.min(1, evt.housed / group) * 100) * 0.5 + avgRoom * 0.5);
    const venue = clamp(maintenance?.condition?.(evt.venue) ?? 90);
    const pen = (evt.offline ? 25 : 0) + (evt.rained ? 15 : 0) + (evt.bias ?? 0);
    const parts = { service: r2(service), food: r2(food), delivery: r2(delivery), rooms: r2(rooms), venue: r2(venue) };
    const base = Object.entries(SCORE_W).reduce((t, [k, w]) => t + w * parts[k], 0);
    const total = r2(clamp((base + (evt.choice?.score ?? 0) + rx('eventScore')) * (scoreMult?.(evt) ?? 1) - pen)); // (M21) Event Resort / Wedding Destination ×1.1
    return { parts, base: r2(base), choice: evt.choice?.score ?? 0, research: rx('eventScore'), penalty: pen, total };
  }
  function finish(evt, day) {
    const e = eventById(evt.ev);
    if (!evt.choice) evt.choice = { id: 'skip', score: 0, auto: true };
    const sc = scoreOf(evt);
    evt.score = sc.total;
    evt.parts = sc;
    const res = sc.total < RESULT.fail.below ? RESULT.fail : sc.total < e.success ? RESULT.issues : sc.total < e.great ? RESULT.success : RESULT.great;
    evt.result = res.id;
    evt.status = 'done';
    evt.ended = day;
    const pay = Math.round(evt.fee * res.feeShare);
    finance?.earn('events', pay, day, evt.venue);
    finance?.spend('eventCosts', PER_ATTENDEE_DAY * evt.group * evt.nights * (finance?.foodMult?.() ?? 1), day, evt.venue);
    if (res.rep) reviews?.addRepFor?.(res.rep, `${e.name}: ${res.name}`);
    if (res.id === 'great') {
      evt.memory = `Great ${e.name}`;
      s.stats.great++;
      items?.grant?.('event');
    }
    s.stats.held++;
    s.stats.byResult[res.id] = (s.stats.byResult[res.id] ?? 0) + 1;
    s.stats.byEvent[e.id] = (s.stats.byEvent[e.id] ?? 0) + 1;
    s.stats.best = Math.max(s.stats.best, sc.total);
    s.booked = s.booked.filter((x) => x !== evt);
    s.history.unshift(evt);
    if (s.history.length > 30) s.history.pop();
    bus?.emit('events:result', { event: clone(evt), name: e.name, pay });
  }
  let today = 0;
  function onEdge(day, band) {
    today = day;
    if (band === BAND.morning) {
      for (const q of s.enquiries.filter((x) => x.until < day)) s.stats.expired++;
      s.enquiries = s.enquiries.filter((x) => x.until >= day);
      for (const evt of s.booked.filter((x) => x.status === 'running' && day >= x.date + x.nights)) finish(evt, day);
      if (day > 0 && day % ENQUIRY.everyDays === 0) weekly(day);
    }
    for (const evt of s.booked) {
      if (evt.status === 'booked' && day >= evt.date && band === BAND.midday) {
        evt.status = 'running';
        const line = new Rng(`${seed}:rocco:${evt.id}`).pick(ROCCO_OPEN).replace('{event}', eventById(evt.ev).name);
        bus?.emit('events:start', { event: clone(evt), line });
      }
      if (evt.status === 'running') {
        if (maintenance?.isOffline?.(evt.venue)) evt.offline = true;
        if (band === BAND.afternoon && day === evt.date && !evt.choice) {
          evt.asked = true;
          bus?.emit('events:choice', { event: clone(evt) });
        }
        if (band === BAND.midday && wx?.disrupts?.(evt, day)) evt.rained = true; // (M24) an outdoor event rained off
      }
    }
    changed();
  }
  // Debug / tests: an enquiry for this event now (rare ones too), if it can be held.
  function force(id) {
    const e = eventById(id);
    if (!e || whyNot(id)) return null;
    return makeEnquiry(e, today, new Rng(`${seed}:events:force:${s.nextId}`));
  }
  const loadOn = (day) => (s.booked.some((x) => x.status !== 'done' && day >= x.date && day < x.date + x.nights) ? EVENT_LOAD : 0);

  return {
    onEdge,
    whyNot,
    whyNoBook: (qid) => {
      const q = s.enquiries.find((x) => x.id === qid);
      return q ? whyNoBook(q) : 'That enquiry has gone.';
    },
    accept,
    decline,
    choose,
    force,
    scoreOf,
    canHold,
    loadOn,
    setBias(id, n) {
      const evt = s.booked.find((x) => x.id === id);
      if (evt) evt.bias = n;
    },
    attachWeather(w) {
      wx = w;
    },
    setDemand(fn) {
      demand = fn;
    },
    setScoreMult(fn) {
      scoreMult = fn;
    },
    get enquiries() {
      return s.enquiries;
    },
    get booked() {
      return s.booked;
    },
    get running() {
      return s.booked.filter((x) => x.status === 'running');
    },
    get pendingChoice() {
      return s.booked.find((x) => x.status === 'running' && x.asked && !x.choice) ?? null;
    },
    get history() {
      return s.history;
    },
    get stats() {
      return clone(s.stats);
    },
    serialize: () => clone(s),
  };
}

function load(saved) {
  const f = freshEvents();
  if (!saved || typeof saved !== 'object') return f;
  const s = clone(saved);
  return {
    nextId: Number.isFinite(s.nextId) ? s.nextId : 1,
    enquiries: Array.isArray(s.enquiries) ? s.enquiries.filter((q) => eventById(q.ev)) : [],
    booked: Array.isArray(s.booked) ? s.booked.filter((q) => eventById(q.ev)) : [],
    history: Array.isArray(s.history) ? s.history : [],
    stats: { ...f.stats, ...(s.stats ?? {}) },
  };
}
export { GUEST_TYPES };
