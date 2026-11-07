// The booking / room core (Milestone 3, bible §9 / §10 / §27B / §27E / §27F): booking offers, Manual Accept / Decline,
// Auto Room Assignment (the Fit formula) or a pinned room, the room state machine (Ready → Reserved → Occupied → Dirty;
// Cleaning and Maintenance exist but nothing uses them yet), check-in at Midday, nights counting down at the day change
// and check-out at Morning of the last day. Plain, saved state — no walking (src/systems/resortWorld.js shows the stays).
// Milestone 4: with housekeeping attached (attach(hk), src/systems/housekeeping.js) a check-out queues a cleaning job,
// Dirty → Cleaning → Ready (or Reserved for the room's next booking); "free by arrival day" also counts a Dirty / Cleaning
// room with a job queued when the party arrives on a later day; a party whose room isn't Ready at check-in waits at
// Reception (status 'waiting', the room's badge says Late) and checks in the minute it is — late minutes and a Service-loss
// number are stored on the stay, and the late rooms are counted.
// Deterministic: the calendar's band edges are processed one by one in order (sync), and each day's offers come from
// their own seeded Rng (seed + day), so the same seed gives the same offers and stays at every speed and frame size, and
// a player's Accept / Decline never changes what is offered later.
//   createBookingSystem({ seed, saved, bus, day, band }) → bookings
//     saved: a serialize() from the campaign save (or null: a fresh state at day / band, with no guests)
//     bookings.sync(day, bandIndex) — run every band edge up to now (the calendar's band:change; after a debug skip)
//     accept(offerId, { room }) → { ok, booking?, why?, needsRoom? }    decline(offerId)    pin(bookingId, roomId)
//     whyNot(offer) → null or one plain line    freeRoomsFor(x) → rooms    fitOf(x, room) → 0–100    bestRoomFor(x)
//     setAutoAssign(on) · makeAllReady() (debug) · serialize()
//     offers · upcoming · staying · waiting · leaving (checked out today) · roomState(id) · bookingInRoom(id) · byId(id)
//     attach(hk) · arrivalDue(roomId, day) · waitingFor(roomId) · roomCleaning(id) · roomReady(id, minute) (housekeeping)
//   On the bus: 'booking:offers' { day, offers } · 'booking:checkin' { bookings } · 'booking:checkout' { bookings } ·
//   'booking:late' { bookings } · 'booking:change' (any change: the sheets and the map redraw from it)
// Milestone 5: with reviews attached (attachReviews(rv), src/systems/reviews.js) each check-out is scored at once (the
// booking keeps its review id) and every band edge is passed on after it happens (the month's star rating).
// Milestone 6: with finance attached (attachFinance(fin), src/systems/finance.js) each new offer takes its room type's
// rate in the current pricing band, and is kept only with the chance finance gives for that rate and the rolling Service
// (drawn from its own seeded Rng, seed + day, so the offers themselves never change with the price — only which come in);
// each check-out books the room's revenue, and every band edge is passed on after the reviews (café, bills, wages).
// Milestone 7: with complaints attached (attachComplaints(cp), src/systems/complaints.js) every check-in is passed on at its
// game minute (the triggers), the complaint clock moves with each band edge (before it) and the café band is passed on;
// a complaint's recovery can give a guest priority service (setPriority: their room's clean jumps the queue) or move them
// to a better Ready room (changeRoom: a waiting party checks in there at once; a staying party's old room gets a clean).
// Milestone 8: with maintenance attached (attachMaintenance(mt), src/systems/maintenance.js) its jobs move with the game
// minute (before each band edge) and the day change passes on after the edge (wear, breakdowns). A broken room is in
// Maintenance (roomBroken): it can't be sold; the state under it (Dirty, Ready, Occupied …) is kept and still changes (a
// clean, a check-out) and comes back when it is repaired (roomRepaired) — a party waiting for it checks in then. A party
// staying in a room that breaks gets a breakdown complaint (src/systems/complaints.js).
// Milestone 9: with the layout attached (attachLayout(ly), src/systems/layout.js) Fit's viewMatch, noiseMatch and
// distanceMatch are each room's own (Auto Assign prefers quiet rooms with a view, near the café, pool and Reception), and
// every band edge is passed on after maintenance's (each party staying hears its room's noise: booking.noise).
// Milestone 10: with the team side attached (attachStaffing(st), src/systems/staffing.js) fatigue and Auto Schedule move
// with every band edge, before it. Auto Accept (bible §27B, data/staffing.js AUTO_ACCEPT): when on, each band edge from
// Morning takes every offer that passes the player's filters, in the room Auto Assign picks (autoWhy(offerId) says why one
// is left for the player); setAutoAccept(patch) · autoAcceptSettings. Auto Assign also moves an unpinned booking that
// hasn't arrived to the best free room when its room breaks. fitParts(x, room): Fit's six weighted parts.
// Milestone 12: (Cowork's calls on the M10 / M11 questions) a booking holds its room only on the nights of its stay — from
// its arrival day, not from the day it was accepted — so one room can carry several bookings one after another (Reserved
// means "held for its next guest"). Same-day turnaround: before Midday a Dirty / Cleaning room with its clean queued can
// be sold for that day's arrival (it is cleaned before check-in, or the party waits as a late room, M4). With Build Mode
// attached (attachSite(site), src/systems/site.js) a moved room is closed for a day (never sold) and every band edge
// first moves the construction on (builds finish, moved things reopen).
import { Rng } from '../../../../core/Rng.js';
import { BANDS } from '../../data/calendar.js';
import { LATE } from '../../data/housekeeping.js';
import { minuteOf, bandAtMinute } from './calendar.js';
import { ROOMS, roomById } from '../../data/lot.js';
import { ROOM_TYPES, PRICE_BAND, GUEST_TYPES, OFFERS, ROOM_STATES, FIT, FIRST_GUEST, CAPACITY } from '../../data/bookings.js';
import { AUTO_ACCEPT, AUTO_MOVE } from '../../data/staffing.js';
import { packageById } from '../../data/packages.js';
import { teamBonus } from './staff.js';
import { systemValue } from './facilities.js';
import { rx, researched, researchOn } from './research.js';
import { typesNow, wantsOf, demandFor, rawBaseDemand, DEMAND_CAP } from './guests.js';

const BAND = Object.fromEntries(BANDS.map((b, i) => [b.id, i])); // night 0 · morning 1 · midday 2 · afternoon 3 · evening 4
export const BAND_INDEX = BAND;
const clone = (x) => JSON.parse(JSON.stringify(x));

// A fresh booking state at a day and band: every room Ready, no guests, that day's offers if Morning has come.
export function freshBookings({ seed, day = 0, band = 'morning' }) {
  const s = { autoAssign: true, autoAccept: clone(AUTO_ACCEPT.defaults), nextId: 1, at: { day, band: BAND[band] ?? 1 }, rooms: Object.fromEntries(ROOMS.map((r) => [r.id, 'ready'])), under: {}, fixedAt: {}, cleanAt: {}, offers: [], bookings: [], stats: { ...STATS0 } };
  if (s.at.band >= BAND.morning) s.offers = makeOffers(seed, day, s.stats);
  return s;
}

// A new resort's booking state (Milestone 3): the M2 lone guest becomes the first real booked guest — a Road Trip Couple
// already in Room 1 for 2 nights — and the morning's first offers are waiting at Reception.
export function firstBookings({ seed, day = 0, band = 'morning' }) {
  const s = freshBookings({ seed, day, band });
  const t = GUEST_TYPES[FIRST_GUEST.type];
  const room = roomById(FIRST_GUEST.room);
  s.bookings.push({ id: `B${s.nextId++}`, type: t.id, party: t.party, nights: FIRST_GUEST.nights, arrival: day, roomType: room.typeId, rate: rateOf(room.typeId), room: room.id, pinned: false, status: 'staying', nightsLeft: FIRST_GUEST.nights, inDay: day - 1, inBand: BAND.midday, outDay: null });
  s.rooms[room.id] = 'occupied';
  s.stats.accepted++;
  s.stats.checkIns++;
  return s;
}

// (Milestone 10) autoAccepted: taken by Auto Accept · autoMoved: moved by Auto Assign when their room broke · manualPicks /
// manualPins: the player picked or changed a room by hand.
const STATS0 = { offered: 0, accepted: 0, declined: 0, expired: 0, checkIns: 0, checkOuts: 0, lateRooms: 0, lateMinutes: 0, pricedOut: 0, autoAccepted: 0, autoMoved: 0, manualPicks: 0, manualPins: 0 };
const HOLDS = new Set(['upcoming', 'waiting', 'staying']); // a booking in one of these holds its room
const rateOf = (roomType) => Math.round(ROOM_TYPES[roomType].rate * PRICE_BAND.mult);
function weighted(rng, entries) {
  const total = entries.reduce((t, [, w]) => t + w, 0);
  let r = rng.next() * total;
  for (const [k, w] of entries) if ((r -= w) < 0) return k;
  return entries[entries.length - 1][0];
}
// One day's offers: 2–4, each its own guest type, party, nights, arrival day and the room type they want.
// (Milestone 6) pricing: { rateOf(roomType), chance(offer) → 0–1 } — the offer's rate in its pricing band, and how likely
// it is to come in at that rate (one that doesn't is counted as priced out). Without it: Standard, and all come in.
// (Milestone 18) only the guest types that can come now (their stage, what draws them, a room they fit — the three
// Roadside types at the start, so a Roadside resort's offers are exactly as before), each weighted × (1 + its stacked
// demand, ±20%); base demand (R31 Local Ads, a partner …, ±20%) is the chance of one more offer (or, below 0, one fewer).
// pk: the package system — an offer from a package's guest types may pick one (its own seeded roll per offer).
export function makeOffers(seed, day, stats = null, pricing = null, pk = null, stage = undefined, book = null) {
  const rng = new Rng(`${seed}:offers:${day}`);
  // (Milestone 17) Local Ads: booking demand +6% — that chance of one more offer each morning (its own seeded roll)
  const base = Math.max(-DEMAND_CAP, Math.min(DEMAND_CAP, rx('demand') + (book ?? { rawBaseDemand }).rawBaseDemand()));
  const avgN = (OFFERS.perMorning[0] + OFFERS.perMorning[1]) / 2;
  let n = rng.int(OFFERS.perMorning[0], OFFERS.perMorning[1]);
  if (base !== 0) {
    const roll = new Rng(`${seed}:ads:${day}`).next();
    if (base > 0 && roll < base * avgN) n++;
    if (base < 0 && roll < -base * avgN) n = Math.max(1, n - 1);
  }
  const out = [];
  const types = typesNow(stage);
  if (!types.length) types.push(GUEST_TYPES.GT01, GUEST_TYPES.GT03, GUEST_TYPES.GT04); // (a lot with no rooms: nobody fits — keep the old draw)
  for (let k = 1; k <= n; k++) {
    const t = GUEST_TYPES[weighted(rng, types.map((g) => [g.id, g.weight * (1 + (book ?? { demandFor }).demandFor(g.id))]))];
    let nights = rng.int(t.nights[0], t.nights[1]);
    const arrival = day + rng.int(OFFERS.arriveWithin[0], OFFERS.arriveWithin[1]);
    const wants = Object.entries(wantsOf(t));
    const roomType = wants.length ? weighted(rng, wants) : (rng.next(), Object.keys(t.wants ?? { RM01: 1 })[0]);
    const o = { id: `O${day}-${k}`, day, type: t.id, party: t.party, nights, arrival, roomType, rate: pricing ? pricing.rateOf(roomType) : rateOf(roomType) };
    const pick = pk?.pick(o, new Rng(`${seed}:pkg:${day}:${k}`));
    if (pick) {
      o.pkg = pick.id;
      o.nights = pick.nights;
    }
    out.push(o);
  }
  let kept = out;
  if (pricing) {
    const roll = new Rng(`${seed}:demand:${day}`); // one roll per offer, always drawn, so one price never shifts the others
    kept = out.filter((o) => roll.next() < pricing.chance(o));
    if (stats) stats.pricedOut = (stats.pricedOut ?? 0) + out.length - kept.length;
  }
  if (stats) stats.offered += kept.length;
  return kept;
}

// Fit (bible §27B) of a room for an offer or booking, 0–100. (Milestone 9) place: the room's { view, noise, distance }
// matches (0–1, src/systems/layout.js fitParts); without it the three score FIT.neutral.
// (Milestone 10) fitParts: the six weighted parts (the offer sheet shows them); null when the party doesn't fit.
export function fitParts(x, room, place = null) {
  const want = ROOM_TYPES[x.roomType];
  const have = ROOM_TYPES[room.typeId];
  if (x.party > have.cap) return null;
  const type = have.id === want.id ? FIT.type.same : have.rank > want.rank ? FIT.type.upgrade : FIT.type.downgrade;
  const capacity = 1 - ((have.cap - x.party) / have.cap) * 0.5;
  const budget = GUEST_TYPES[x.type].budget;
  const price = Math.max(0, 1 - Math.abs(have.rate - budget) / budget);
  const w = FIT.weights;
  const p = place ?? { view: FIT.neutral, noise: FIT.neutral, distance: FIT.neutral };
  return { type: w.type * type, capacity: w.capacity * capacity, view: w.view * p.view, noise: w.noise * p.noise, distance: w.distance * p.distance, price: w.price * price };
}
export function fitOf(x, room, place = null) {
  const q = fitParts(x, room, place);
  return q ? q.type + q.capacity + q.view + q.noise + q.distance + q.price : -1;
}

export function createBookingSystem({ seed, saved = null, bus = null, day = 0, band = 'morning' }) {
  let s = saved ? load(saved) : freshBookings({ seed, day, band });
  let version = 0;
  let hk = null; // (Milestone 4) the housekeeping system, once attached
  let rv = null; // (Milestone 5) the reviews system, once attached
  let fin = null; // (Milestone 6) the finance system, once attached
  let cp = null; // (Milestone 7) the complaints system, once attached
  let mt = null; // (Milestone 8) the maintenance system, once attached
  let ly = null; // (Milestone 9) the layout (walks, noise, views), once attached
  let st = null; // (Milestone 10) the team side (patterns, priorities, fatigue), once attached
  let site = null; // (Milestone 12) Build Mode, once attached
  let rs = null; // (Milestone 17) research, once attached
  let items = null; // (Milestone 14) Staff Items, once attached
  let pk = null; // (Milestone 18) packages, once attached
  let pg = null; // (Milestone 18) the stage (who can book), once attached
  let late = null; // (Milestone 18 on) the later systems' band edge (src/systems/lateSystems.js)
  let book = null; // (Milestone 18) this resort's demand book (src/systems/guests.js)
  let repeat = null; // (Milestone 20) the Guestbook's returning guests for a Morning
  const fit = (x, r) => fitOf(x, r, ly?.fitParts(r.id) ?? null);
  const pricing = (day) => (fin ? { rateOf: fin.rateOf, chance: (o) => fin.offerChance(o, rv?.headline(day).service ?? null) } : null);
  const changed = () => {
    version++;
    bus?.emit('booking:change', {});
  };

  const roomState = (id) => s.rooms[id] ?? 'ready';
  // (Milestone 8) a room in Maintenance keeps the state under it: changes go there until it is repaired.
  const setRoom = (id, state) => {
    if (s.rooms[id] === 'maintenance' && state !== 'maintenance') s.under[id] = state;
    else s.rooms[id] = state;
  };
  // Rooms an offer / booking could have by its arrival day (the one place this is decided): a room nobody else holds that
  // is Ready now, or (Milestone 4) Dirty / Cleaning with a cleaning job queued when the party arrives on a later day — it
  // will be Ready in time. A Reserved room is held for its own guest; Maintenance rooms are never sold or assigned.
  // (Milestone 12) only a booking whose nights overlap x's holds the room against it.
  const overlaps = (b, x) => b.arrival < x.arrival + (x.nights ?? 1) && x.arrival < b.arrival + (b.nights ?? 1); // (a bare query with no nights: one night)
  const heldBy = (id, x) => s.bookings.find((b) => b.room === id && b !== x && HOLDS.has(b.status) && overlaps(b, x)) ?? null;
  function freeBy(id, x) {
    if (site?.isClosed(id) || heldBy(id, x)) return false;
    const st = roomState(id);
    if (ROOM_STATES[st].sellable || st === 'reserved') return true; // (Reserved: held for a later stay that doesn't overlap)
    if (st === 'occupied') return x.arrival > s.at.day; // (its guest leaves first: the room is cleaned in between)
    if (st !== 'dirty' && st !== 'cleaning') return false;
    if (x.arrival > s.at.day) return !!hk?.hasJob(id);
    // (M12 same-day turnaround; M18: not a room whose leaver had a package's late checkout today)
    return x.arrival === s.at.day && s.at.band < BAND.midday && !!hk?.hasJob(id) && !s.bookings.some((b) => b.room === id && b.status === 'left' && b.outDay === s.at.day && b.lateOut);
  }
  const upcomingIn = (id) => s.bookings.some((b) => b.room === id && b.status === 'upcoming');
  // (Milestone 15) capacity: the whole party in one room (no splitting before World-Class); a family needs 4+ beds
  const fitsParty = (r, x) => ROOM_TYPES[r.typeId].cap >= x.party && (!GUEST_TYPES[x.type]?.family || ROOM_TYPES[r.typeId].cap >= CAPACITY.familyMin);
  function freeRoomsFor(x) {
    return ROOMS.filter((r) => fitsParty(r, x) && freeBy(r.id, x) && (!pk || pk.roomOk(x, r))); // (M18) a package's room needs
  }
  // A booking takes its room: a Ready room turns Reserved (a Dirty / Cleaning one stays so until it is clean).
  const hold = (id) => roomState(id) === 'ready' && setRoom(id, 'reserved');
  const release = (id) => roomState(id) === 'reserved' && !upcomingIn(id) && setRoom(id, 'ready'); // (M12: still Reserved for another booking)
  function bestRoomFor(x) {
    let best = null;
    let bestFit = -Infinity;
    for (const r of freeRoomsFor(x)) {
      const f = fit(x, r);
      if (f > bestFit + 1e-9) {
        best = r;
        bestFit = f;
      }
    }
    return best;
  }
  // Why an offer can't be accepted (one plain line), or null when it can.
  function whyNot(x) {
    // (Milestone 16) the Parking Area takes 20 arrivals a day (× its level)
    const cap = systemValue('arrivals');
    if (cap > 0 && s.bookings.filter((b) => b.arrival === x.arrival && b !== x && HOLDS.has(b.status)).length >= cap) return 'Parking is full on their arrival day.';
    // (Milestone 18) a package's places must be free on their dates
    if (x.pkg && !x.status && !pk?.plan(x.pkg, x)) return pk ? 'The package’s places are full on their dates.' : 'Packages aren’t open.';
    if (freeRoomsFor(x).length) return null;
    const dirty = ROOMS.filter((r) => roomState(r.id) === 'dirty').length;
    return dirty ? `No free room: ${dirty} ${dirty === 1 ? 'room is' : 'rooms are'} Dirty and the rest are taken.` : 'No free room: every room is taken.';
  }

  // minute: the game minute it happens (M7's triggers; a band-edge check-in is at the band's start).
  function checkIn(b, day, band, minute = minuteOf(day, band)) {
    b.status = 'staying';
    b.inDay = day;
    b.inBand = band;
    b.nightsLeft = Math.max(1, b.arrival + b.nights - day);
    if (hk?.isShort(b.room)) b.shortLinen = true; // (for M5: the room's last clean was short on linen)
    setRoom(b.room, 'occupied');
    s.stats.checkIns++;
    cp?.onCheckIn(b, minute); // (Milestone 7) late room, front desk queue, short linen, price over budget
  }
  // (Milestone 4) A waiting party checks in at this minute: their late minutes and Service loss go on the stay.
  function lateCheckIn(w, id, minute) {
    const at = bandAtMinute(minute);
    const mins = Math.max(0, Math.round((minute - w.waitFrom) * 100) / 100);
    const traits = Math.max(0, 1 - teamBonus(st?.team, 'readiness') + teamBonus(st?.team, 'backlog')); // (M13) Smooth Check-In, Zero Delay …
    w.late = { minutes: mins, serviceLoss: Math.min(LATE.lossCap, Math.round((mins / LATE.lossPerMinutes) * traits)) };
    s.stats.lateMinutes = Math.round((s.stats.lateMinutes + mins) * 100) / 100;
    setRoom(id, 'reserved');
    checkIn(w, at.day, at.band, minute);
    bus?.emit('booking:checkin', { bookings: [clone(w)], late: true });
  }
  // (Milestone 4) Their room isn't Ready at check-in: they wait at Reception and the room is late.
  function startWaiting(b, day, band) {
    b.status = 'waiting';
    b.waitDay = day;
    b.waitFrom = minuteOf(day, band);
    s.stats.lateRooms++;
  }

  // One band edge: what happens as this band begins.
  function edge(day, band) {
    const ins = [];
    const outs = [];
    let fresh = [];
    if (band === BAND.night) {
      // The day change: yesterday's unanswered offers expire, every staying guest has slept one more night, and
      // yesterday's leavers are gone for good.
      const old = s.offers.filter((o) => o.day < day);
      s.stats.expired += old.length;
      s.offers = s.offers.filter((o) => o.day >= day);
      for (const b of s.bookings) if (b.status === 'staying') b.nightsLeft = Math.max(0, b.nightsLeft - 1);
      s.bookings = s.bookings.filter((b) => !(b.status === 'left' && b.outDay < day));
    }
    if (band === BAND.morning) {
      // Check-out on the last morning: the room is Dirty and a cleaning job is queued (M4). Then the day's new offers.
      for (const b of s.bookings)
        if (b.status === 'staying' && b.nightsLeft <= 0) {
          b.status = 'left';
          b.outDay = day;
          setRoom(b.room, 'dirty');
          s.stats.checkOuts++;
          const v = rv?.checkout(b, day); // (Milestone 5) the stay is scored and leaves a review
          if (v) b.review = v.id;
          fin?.checkout(b, day); // (Milestone 6) the room's revenue: rate × nights
          outs.push(b);
        }
      s.at = { day, band };
      if (outs.length) hk?.enqueue(outs.map((b) => b.room));
      fresh = makeOffers(seed, day, s.stats, pricing(day), pk, pg?.stage, book);
      // (Milestone 20) returning guests: each takes one of the Morning's offer places (returns change who books, not how many)
      const back = repeat?.(day, pricing(day)) ?? [];
      if (back.length) {
        fresh.splice(Math.max(0, fresh.length - back.length), back.length);
        fresh.push(...back);
        s.stats.repeatOffers = (s.stats.repeatOffers ?? 0) + back.length;
      }
      s.offers.push(...fresh);
    }
    const late = [];
    if (band >= BAND.midday)
      for (const b of s.bookings)
        if (b.status === 'upcoming' && b.arrival <= day) {
          if (roomState(b.room) === 'maintenance') rehome(b); // (Milestone 10) broke when no other room was free
          if (['reserved', 'ready'].includes(roomState(b.room))) {
            checkIn(b, day, band);
            ins.push(b);
          } else {
            startWaiting(b, day, band);
            late.push(b);
          }
        }
    s.at = { day, band };
    if (band >= BAND.morning) autoAccept(); // (Milestone 10) new offers, and rooms freed since the last band
    if (outs.length) bus?.emit('booking:checkout', { bookings: outs.map(clone) });
    fresh = fresh.filter((o) => s.offers.includes(o)); // (Milestone 10) only those Auto Accept left for the player
    if (fresh.length) bus?.emit('booking:offers', { day, offers: fresh.map(clone) });
    if (ins.length) bus?.emit('booking:checkin', { bookings: ins.map(clone) });
    if (late.length) bus?.emit('booking:late', { bookings: late.map(clone) });
  }
  // An offer becomes a booking in room r (pinned: the player chose the room). Accepted on its arrival day after check-in
  // time began: they check in straight away.
  function take(o, r, pinned, auto = false) {
    s.offers = s.offers.filter((x) => x !== o);
    const b = { id: `B${s.nextId++}`, type: o.type, party: o.party, nights: o.nights, arrival: o.arrival, roomType: o.roomType, rate: Math.round(o.rate * (site?.rateMult(r.id) ?? 1)), room: r.id, pinned, status: 'upcoming', nightsLeft: o.nights, inDay: null, inBand: null, outDay: null };
    if (auto) b.auto = true;
    if (o.guestId) {
      b.guestId = o.guestId; // (Milestone 20) a returning guest keeps who they are
      b.repeat = true;
    }
    // (Milestone 18) a package: its price is the room's nightly rate × the multiplier, its places reserved now
    if (o.pkg && pk) {
      const pl = pk.plan(o.pkg, o);
      if (pl) {
        b.pkg = o.pkg;
        b.baseRate = b.rate;
        b.rate = Math.round(b.rate * packageById(o.pkg).mult);
        if (packageById(o.pkg).incl.some((i) => i.id === 'late')) b.lateOut = true;
        pk.reserve(b, pl);
      }
    }
    s.bookings.push(b);
    hold(r.id);
    s.stats.accepted++;
    if (b.arrival <= s.at.day && s.at.band >= BAND.midday) {
      checkIn(b, s.at.day, s.at.band, Math.max(hk?.at ?? 0, cp?.at ?? 0, minuteOf(s.at.day, s.at.band)));
      bus?.emit('booking:checkin', { bookings: [clone(b)] });
    }
    return b;
  }

  // --- (Milestone 10) Auto Accept (bible §27B) -------------------------------------------------------------------
  // Rooms held on night n (a booking holds its room from its arrival night to the night before it leaves), all or of one
  // room type.
  const holdsNight = (b, n) => HOLDS.has(b.status) && b.arrival <= n && n < b.arrival + b.nights;
  const heldOn = (n, type = null) => s.bookings.filter((b) => holdsNight(b, n) && (!type || roomById(b.room).typeId === type)).length;
  const nightsOf = (x) => Array.from({ length: x.nights }, (_, i) => x.arrival + i);
  // Why Auto Accept leaves an offer for the player (one plain line), or null when it would take it — and the room.
  function autoCheck(o) {
    const f = s.autoAccept;
    const t = GUEST_TYPES[o.type];
    if (f.types && !f.types.includes(o.type)) return { why: `${t.name}s aren’t on your list.` };
    const min = AUTO_ACCEPT.minRates.find((m) => m.id === f.minRate) ?? AUTO_ACCEPT.minRates[0];
    if (ROOM_TYPES[o.roomType].rank < min.rank) return { why: `Asks for a ${ROOM_TYPES[o.roomType].name}: under ${min.name}.` };
    if (o.pkg && pk && !pk.plan(o.pkg, o)) return { why: 'The package’s places are full on their dates.' }; // (M18)
    const r = bestRoomFor(o);
    if (!r) return { why: whyNot(o) ?? 'No free room.' };
    const type = r.typeId;
    const keep = f.reserve?.[type] ?? 0;
    const sellable = ROOMS.filter((x) => roomState(x.id) !== 'maintenance');
    const ofType = sellable.filter((x) => x.typeId === type).length;
    for (const n of nightsOf(o)) {
      if (((heldOn(n) + 1) / Math.max(1, sellable.length)) * 100 > f.maxOcc + 1e-9) return { why: `Would fill more than ${f.maxOcc}% of the rooms.` };
      if (keep && ofType - heldOn(n, type) - 1 < keep) return { why: `Would use a ${ROOM_TYPES[type].name} you keep free.` };
    }
    if (f.minSat != null && rv) {
      const e = rv.expected(o, r.id);
      if (e < f.minSat) return { why: `Expected satisfaction ${Math.round(e)}: under ${f.minSat}.` };
    }
    return { why: null, room: r };
  }
  // Take every offer that passes (preferred guests first — no repeat or package guests exist yet — then oldest).
  function autoAccept() {
    if (!s.autoAccept.on) return 0;
    let n = 0;
    const pri = (o) => (s.autoAccept.preferRepeat && o.repeat ? 2 : 0) + (s.autoAccept.preferPackage && o.pkg ? 1 : 0); // (M18 / M20) package and returning guests first
    const list = [...s.offers].sort((a, b) => pri(b) - pri(a));
    for (const o of list) {
      const c = autoCheck(o);
      if (c.why) continue;
      take(o, c.room, false, true);
      s.stats.autoAccepted++;
      n++;
    }
    if (n) bus?.emit('booking:auto', { n });
    return n;
  }
  // (Milestone 10) Auto Assign: an unpinned booking that hasn't arrived moves to the best free room when its room breaks.
  function rehome(b) {
    if (!AUTO_MOVE.onBreakdown || !s.autoAssign || b.pinned || b.status !== 'upcoming') return false;
    const r = bestRoomFor(b);
    if (!r || r.id === b.room) return false;
    const old = b.room;
    b.room = r.id;
    b.movedFrom = old;
    if (s.rooms[old] === 'maintenance' && s.under[old] === 'reserved' && !upcomingIn(old)) s.under[old] = 'ready';
    hold(r.id);
    s.stats.autoMoved++;
    return true;
  }

  // (Milestone 4) A room is clean at this minute: the waiting party checks in now (late minutes and Service loss on the
  // stay), or it is held for its next booking (Reserved), or it is Ready.
  function roomReady(id, minute) {
    const w = s.bookings.find((b) => b.room === id && b.status === 'waiting');
    const up = s.bookings.find((b) => b.room === id && b.status === 'upcoming');
    if (s.rooms[id] === 'maintenance') {
      // (Milestone 8) clean but broken: held for its party, who checks in when it is repaired
      s.under[id] = w || up ? 'reserved' : 'ready';
      s.cleanAt[id] = minute;
    } else if (w) lateCheckIn(w, id, Math.max(minute, s.fixedAt[id] ?? minute));
    else setRoom(id, up ? 'reserved' : 'ready');
    changed();
  }

  const api = {
    // Every band edge from the last one processed up to (day, bandIndex), in order.
    sync(day, band) {
      let n = 0;
      while (s.at.day < day || (s.at.day === day && s.at.band < band)) {
        const next = s.at.band === BANDS.length - 1 ? { day: s.at.day + 1, band: 0 } : { day: s.at.day, band: s.at.band + 1 };
        site?.onEdge(next.day, next.band); // (Milestone 12) builds finish and moved things reopen at the edge's minute
        rs?.onEdge(); // (Milestone 17) research finishes on time; the next in the queue starts
        items?.onEdge(next.day, next.band); // (Milestone 14) a new year's item points, the Inbox, a month's well-wisher
        hk?.advance(minuteOf(next.day, next.band)); // cleaning up to this edge first, then the edge
        mt?.advance(minuteOf(next.day, next.band)); // (Milestone 8) maintenance jobs up to this edge
        cp?.advance(minuteOf(next.day, next.band)); // (Milestone 7) late parties' 30 minutes up to this edge
        st?.onEdge(next.day, next.band); // (Milestone 10) fatigue for the band just ended; the day change's Auto Schedule
        hk?.onEdge(next.day, next.band);
        edge(next.day, next.band);
        late ? late(next.day, next.band) : pk?.onEdge(next.day, next.band, api); // (Milestone 18 on) packages, events …
        mt?.onEdge(next.day, next.band, api); // (Milestone 8) the day change: wear, breakdowns
        ly?.onEdge(next.day, next.band, api); // (Milestone 9) each party staying hears its room's noise this band
        cp?.onEdge(next.day, next.band, api); // (Milestone 7) the café band
        rv?.onEdge(next.day, next.band); // (Milestone 5) a new month rates the month just ended
        fin?.onEdge(next.day, next.band, api); // (Milestone 6) the café at Evening, the bills at the day change
        n++;
      }
      if (n) changed();
      return n;
    },
    accept(offerId, { room = null } = {}) {
      const o = s.offers.find((x) => x.id === offerId);
      if (!o) return { ok: false, why: 'That offer has gone.' };
      const why = whyNot(o);
      if (why) return { ok: false, why };
      let r;
      if (room) {
        r = freeRoomsFor(o).find((x) => x.id === room);
        if (!r) return { ok: false, why: `${roomById(room)?.name ?? 'That room'} isn't free for this booking.` };
      } else if (s.autoAssign) r = bestRoomFor(o);
      else return { ok: false, needsRoom: true, why: 'Auto Assign is off: pick a room for this booking.' };
      if (room) s.stats.manualPicks++; // (Milestone 10)
      const b = take(o, r, !!room);
      changed();
      return { ok: true, booking: b };
    },
    decline(offerId) {
      const n = s.offers.length;
      s.offers = s.offers.filter((x) => x.id !== offerId);
      if (s.offers.length === n) return false;
      s.stats.declined++;
      changed();
      return true;
    },
    // Manual pinning: move an upcoming booking to a room of the player's choice (it overrides Auto Assign).
    pin(bookingId, roomId) {
      const b = s.bookings.find((x) => x.id === bookingId);
      if (!b || b.status !== 'upcoming') return { ok: false, why: 'Only a booking that hasn’t arrived yet can change room.' };
      if (b.room === roomId) {
        b.pinned = true;
        changed();
        return { ok: true, booking: b };
      }
      const r = freeRoomsFor(b).find((x) => x.id === roomId);
      if (!r) return { ok: false, why: `${roomById(roomId)?.name ?? 'That room'} isn't free.` };
      const old = b.room;
      b.room = r.id;
      release(old);
      b.pinned = true;
      s.stats.manualPins++; // (Milestone 10)
      hold(r.id);
      changed();
      return { ok: true, booking: b };
    },
    setAutoAssign(on) {
      s.autoAssign = !!on;
      changed();
    },
    // Debug (?debug=1): every Dirty / Cleaning room clean at once (Milestone 8: a Maintenance room is broken and waits for its repair) (its cleaning job dropped; a room booked
    // next turns Reserved and a waiting party checks in).
    makeAllReady() {
      let n = 0;
      for (const id of Object.keys(s.rooms))
        if (!['reserved', 'occupied', 'maintenance'].includes(s.rooms[id]) && s.rooms[id] !== 'ready') {
          hk?.cancelRoom(id);
          roomReady(id, Math.max(hk?.at ?? 0, minuteOf(s.at.day, s.at.band)));
          n++;
        }
      changed();
      return n;
    },
    attach(h) {
      hk = h;
    },
    // (Milestone 12) Build Mode: closed rooms are never sold; the construction moves with the band edges.
    attachSite(x) {
      site = x;
    },
    attachResearch(x) {
      rs = x;
    },
    attachItems(x) {
      items = x;
    },
    attachPackages(x) {
      pk = x;
    },
    attachProgress(x) {
      pg = x;
    },
    attachLate(fn) {
      late = fn;
    },
    attachDemand(x) {
      book = x;
    },
    attachRepeat(fn) {
      repeat = fn;
    },
    // (Milestone 19) an event's room block: as many rooms as are free on its dates (the biggest first, up to half the
    // rooms — Claude Code's pick), each a booking of the event's guest type at the room's rate, tagged with the event.
    addGroup({ type, arrival, nights, people, tag }) {
      const t = GUEST_TYPES[type];
      const out = [];
      let left = people;
      const max = Math.ceil(ROOMS.length / 2);
      const probe = { arrival, nights };
      const free = ROOMS.filter((r) => !site?.isClosed(r.id) && freeBy(r.id, probe) && (!t?.family || ROOM_TYPES[r.typeId].cap >= CAPACITY.familyMin)).sort((a, b) => ROOM_TYPES[b.typeId].cap - ROOM_TYPES[a.typeId].cap || a.number - b.number);
      for (const r of free) {
        if (left <= 0 || out.length >= max) break;
        const party = Math.min(left, ROOM_TYPES[r.typeId].cap);
        const o = { id: `G${s.nextId}`, day: s.at.day, type, party, nights, arrival, roomType: r.typeId, rate: fin ? fin.rateOf(r.typeId) : rateOf(r.typeId) };
        const b = take(o, r, true);
        b.event = tag;
        out.push(b);
        left -= party;
      }
      if (out.length) changed();
      return out;
    },
    get packages() {
      return pk;
    },
    hasBooking: (id) => s.bookings.some((b) => b.room === id && HOLDS.has(b.status)),
    // (Milestone 5) the reviews system: every check-out is scored, every band edge passed on.
    attachReviews(r) {
      rv = r;
    },
    // (Milestone 6) the finance system: offer rates and demand, check-out revenue, every band edge passed on.
    attachFinance(f) {
      fin = f;
    },
    // (Milestone 7) the complaints system: check-ins, the minute and the café band passed on.
    attachComplaints(c) {
      cp = c;
    },
    // (Milestone 8) the maintenance system: its jobs and the day change passed on.
    attachMaintenance(m) {
      mt = m;
    },
    // (Milestone 9) the layout: Fit's view / noise / distance, and each band's noise passed on.
    attachLayout(l) {
      ly = l;
    },
    // (Milestone 10) the team side: fatigue and Auto Schedule move with every band edge, before it.
    attachStaffing(x) {
      st = x;
    },
    // (Milestone 10) Auto Accept: its settings (data/staffing.js AUTO_ACCEPT), changed one or several at a time; offers
    // already waiting are checked at once.
    get autoAcceptSettings() {
      return clone(s.autoAccept);
    },
    // (Milestone 17) Auto Accept unlocks through R32 Package Marketing (a save that had it on keeps it: grandfathered).
    get autoAcceptLocked() {
      return researchOn() && !researched('R32') && !s.autoAccept.grand;
    },
    setAutoAccept(patch) {
      if (patch.on && !s.autoAccept.on && api.autoAcceptLocked) return null;
      const f = { ...s.autoAccept, ...patch };
      if (!('grand' in f)) f.grand = false; // (M17: a resort that switched it on itself — not grandfathered)
      if (!AUTO_ACCEPT.minRates.some((m) => m.id === f.minRate)) f.minRate = 'any';
      if (!AUTO_ACCEPT.maxOccs.includes(f.maxOcc)) f.maxOcc = 100;
      if (!AUTO_ACCEPT.minSats.includes(f.minSat)) f.minSat = null;
      f.types = Array.isArray(f.types) ? Object.keys(GUEST_TYPES).filter((id) => f.types.includes(id)) : null;
      if (f.types && f.types.length === Object.keys(GUEST_TYPES).length) f.types = null;
      f.reserve = Object.fromEntries(Object.entries(f.reserve ?? {}).filter(([rt, n]) => ROOM_TYPES[rt] && n > 0).map(([rt, n]) => [rt, Math.min(AUTO_ACCEPT.reserveMax, Math.round(n))]));
      f.on = !!f.on;
      f.preferRepeat = !!f.preferRepeat;
      f.preferPackage = !!f.preferPackage;
      s.autoAccept = f;
      if (s.at.band >= BAND.morning) autoAccept();
      changed();
      return clone(f);
    },
    // Why Auto Accept leaves this offer for the player, or null when it would take it.
    autoWhy: (offerId) => {
      const o = s.offers.find((x) => x.id === offerId);
      return o ? autoCheck(o).why : null;
    },
    fitParts: (x, r) => fitParts(x, r, ly?.fitParts(r.id) ?? null),
    // (Milestone 8) a room breaks down at this minute: Maintenance (the state under it kept); a party staying in it gets a
    // breakdown complaint.
    roomBroken(id, minute) {
      if (s.rooms[id] === 'maintenance') return null;
      s.under[id] = s.rooms[id];
      s.rooms[id] = 'maintenance';
      delete s.fixedAt[id];
      delete s.cleanAt[id];
      const b = s.bookings.find((x) => x.room === id && x.status === 'staying') ?? null;
      if (b) cp?.onRoomBreakdown?.(b, minute, id);
      for (const u of s.bookings.filter((x) => x.room === id && x.status === 'upcoming')) rehome(u); // (Milestone 10)
      changed();
      return b;
    },
    // (Milestone 8) repaired at this minute: the state under it comes back; a party waiting for it checks in now (or when
    // it was cleaned, if later).
    roomRepaired(id, minute) {
      if (s.rooms[id] !== 'maintenance') return false;
      s.rooms[id] = s.under[id] ?? 'ready';
      delete s.under[id];
      s.fixedAt[id] = minute;
      const w = s.bookings.find((b) => b.room === id && b.status === 'waiting');
      if (w && ['ready', 'reserved'].includes(s.rooms[id])) lateCheckIn(w, id, Math.max(minute, s.cleanAt[id] ?? minute));
      changed();
      return true;
    },
    underState: (id) => (s.rooms[id] === 'maintenance' ? s.under[id] ?? 'ready' : null),
    // (Milestone 7) a complaint's apology: priority service for this guest (their room's clean jumps the queue).
    setPriority(bookingId) {
      const b = s.bookings.find((x) => x.id === bookingId);
      if (!b) return false;
      b.priority = true;
      changed();
      return true;
    },
    priorityRoom: (id) => s.bookings.some((b) => b.room === id && b.priority && (b.status === 'waiting' || b.status === 'upcoming')),
    // (Milestone 7) Ready rooms a waiting or staying guest could move to: nobody holds it, it sleeps the party and it is the
    // same type as their room or better — same type first, then the lowest number.
    roomChangeOptions(bookingId) {
      const b = s.bookings.find((x) => x.id === bookingId);
      if (!b || !['waiting', 'staying'].includes(b.status) || !roomById(b.room)) return []; // (M21 fix: a room sold since)
      const rank = ROOM_TYPES[roomById(b.room).typeId].rank;
      return ROOMS.filter((r) => r.id !== b.room && roomState(r.id) === 'ready' && !heldBy(r.id, b) && ROOM_TYPES[r.typeId].cap >= b.party && ROOM_TYPES[r.typeId].rank >= rank).sort(
        (x, y) => ROOM_TYPES[x.typeId].rank - ROOM_TYPES[y.typeId].rank || x.number - y.number,
      );
    },
    // (Milestone 7) a complaint's room change at this minute: a waiting party checks in to the new room now (their old
    // room keeps its cleaning job and turns Ready / Reserved for its next booking when clean); a staying party moves and
    // their old room is Dirty with a cleaning job.
    changeRoom(bookingId, roomId, minute) {
      const b = s.bookings.find((x) => x.id === bookingId);
      const r = api.roomChangeOptions(bookingId).find((x) => x.id === roomId);
      if (!b || !r) return { ok: false, why: `${roomById(roomId)?.name ?? 'That room'} isn't free.` };
      const old = b.room;
      b.room = r.id;
      b.movedFrom = old;
      if (b.status === 'waiting') {
        lateCheckIn(b, r.id, minute);
        if (roomState(old) === 'reserved') setRoom(old, s.bookings.some((x) => x.room === old && x.status === 'upcoming') ? 'reserved' : 'ready');
      } else {
        setRoom(r.id, 'occupied');
        b.shortLinen = !!hk?.isShort(r.id);
        setRoom(old, 'dirty');
        hk?.enqueue([old]);
      }
      changed();
      return { ok: true, booking: b, from: old };
    },
    // A party arriving today (or earlier and waiting) holds this room: its cleaning jumps the queue.
    arrivalDue: (id, day) => s.bookings.some((b) => b.room === id && (b.status === 'waiting' || (b.status === 'upcoming' && b.arrival <= day))),
    waitingFor: (id) => s.bookings.find((b) => b.room === id && b.status === 'waiting') ?? null,
    roomCleaning(id) {
      setRoom(id, 'cleaning');
      changed();
    },
    roomReady,
    freeRoomsFor,
    bestRoomFor,
    fitOf: fit,
    whyNot,
    roomState,
    bookingInRoom: (id) => s.bookings.find((b) => b.room === id && HOLDS.has(b.status)) ?? null,
    byId: (id) => s.bookings.find((b) => b.id === id) ?? s.offers.find((o) => o.id === id) ?? null,
    get offers() {
      return s.offers;
    },
    get upcoming() {
      return s.bookings.filter((b) => b.status === 'upcoming').sort((a, b) => a.arrival - b.arrival || ROOM_N(a) - ROOM_N(b));
    },
    get waiting() {
      return s.bookings.filter((b) => b.status === 'waiting').sort((a, b) => a.waitFrom - b.waitFrom || ROOM_N(a) - ROOM_N(b));
    },
    get staying() {
      return s.bookings.filter((b) => b.status === 'staying').sort((a, b) => ROOM_N(a) - ROOM_N(b));
    },
    // Checked out today (they walk to their car this Morning).
    get leaving() {
      return s.bookings.filter((b) => b.status === 'left' && b.outDay === s.at.day);
    },
    get autoAssign() {
      return s.autoAssign;
    },
    get at() {
      return { ...s.at };
    },
    get stats() {
      return { ...s.stats };
    },
    get version() {
      return version;
    },
    // (Milestone 12) the room states of the rooms open now (a room built since is Ready; a sold one is gone), as a reload has them
    serialize: () => clone({ ...s, rooms: Object.fromEntries(ROOMS.map((r) => [r.id, s.rooms[r.id] ?? 'ready'])) }),
  };
  return api;
}
const ROOM_N = (b) => roomById(b.room)?.number ?? 99;

// "today" / "tomorrow" / "Day 14" style words for an arrival day (relative to today).
export function arrivalWords(arrival, today) {
  const d = arrival - today;
  if (d <= 0) return 'today';
  if (d === 1) return 'tomorrow';
  return `in ${d} days`;
}

// A saved state, checked and filled in (an older or damaged save never crashes the hub).
function load(saved) {
  const s = clone(saved);
  s.autoAssign = s.autoAssign !== false;
  s.autoAccept = { ...clone(AUTO_ACCEPT.defaults), ...(s.autoAccept && typeof s.autoAccept === 'object' ? s.autoAccept : {}) }; // (Milestone 10)
  if (s.autoAccept.on && !('grand' in s.autoAccept)) s.autoAccept.grand = true; // (M17) switched on before it needed R32: kept (grandfathered)
  s.nextId = Number.isFinite(s.nextId) ? s.nextId : 1;
  s.at = s.at && Number.isFinite(s.at.day) && Number.isFinite(s.at.band) ? s.at : { day: 0, band: 1 };
  s.rooms = Object.fromEntries(ROOMS.map((r) => [r.id, ROOM_STATES[s.rooms?.[r.id]] ? s.rooms[r.id] : 'ready']));
  s.offers = Array.isArray(s.offers) ? s.offers.filter((o) => GUEST_TYPES[o.type] && ROOM_TYPES[o.roomType]) : [];
  s.bookings = Array.isArray(s.bookings) ? s.bookings.filter((b) => GUEST_TYPES[b.type] && roomById(b.room)) : [];
  s.stats = { ...STATS0, ...(s.stats ?? {}) };
  s.under = Object.fromEntries(Object.entries(s.under ?? {}).filter(([id, st]) => s.rooms[id] === 'maintenance' && ROOM_STATES[st]));
  for (const id of Object.keys(s.rooms)) if (s.rooms[id] === 'maintenance' && !s.under[id]) s.under[id] = 'ready';
  s.fixedAt = s.fixedAt && typeof s.fixedAt === 'object' ? s.fixedAt : {};
  s.cleanAt = s.cleanAt && typeof s.cleanAt === 'object' ? s.cleanAt : {};
  return s;
}
