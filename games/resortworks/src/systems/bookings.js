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
import { Rng } from '../../../../core/Rng.js';
import { BANDS } from '../../data/calendar.js';
import { LATE } from '../../data/housekeeping.js';
import { minuteOf, bandAtMinute } from './calendar.js';
import { ROOMS, roomById } from '../../data/lot.js';
import { ROOM_TYPES, PRICE_BAND, GUEST_TYPES, OFFERS, ROOM_STATES, FIT, FIRST_GUEST } from '../../data/bookings.js';

const BAND = Object.fromEntries(BANDS.map((b, i) => [b.id, i])); // night 0 · morning 1 · midday 2 · afternoon 3 · evening 4
export const BAND_INDEX = BAND;
const clone = (x) => JSON.parse(JSON.stringify(x));

// A fresh booking state at a day and band: every room Ready, no guests, that day's offers if Morning has come.
export function freshBookings({ seed, day = 0, band = 'morning' }) {
  const s = { autoAssign: true, nextId: 1, at: { day, band: BAND[band] ?? 1 }, rooms: Object.fromEntries(ROOMS.map((r) => [r.id, 'ready'])), under: {}, fixedAt: {}, cleanAt: {}, offers: [], bookings: [], stats: { ...STATS0 } };
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

const STATS0 = { offered: 0, accepted: 0, declined: 0, expired: 0, checkIns: 0, checkOuts: 0, lateRooms: 0, lateMinutes: 0, pricedOut: 0 };
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
export function makeOffers(seed, day, stats = null, pricing = null) {
  const rng = new Rng(`${seed}:offers:${day}`);
  const n = rng.int(OFFERS.perMorning[0], OFFERS.perMorning[1]);
  const out = [];
  for (let k = 1; k <= n; k++) {
    const t = GUEST_TYPES[weighted(rng, Object.values(GUEST_TYPES).map((g) => [g.id, g.weight]))];
    const nights = rng.int(t.nights[0], t.nights[1]);
    const arrival = day + rng.int(OFFERS.arriveWithin[0], OFFERS.arriveWithin[1]);
    const roomType = weighted(rng, Object.entries(t.wants));
    out.push({ id: `O${day}-${k}`, day, type: t.id, party: t.party, nights, arrival, roomType, rate: pricing ? pricing.rateOf(roomType) : rateOf(roomType) });
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

// Fit (bible §27B) of a room for an offer or booking, 0–100.
export function fitOf(x, room) {
  const want = ROOM_TYPES[x.roomType];
  const have = ROOM_TYPES[room.typeId];
  if (x.party > have.cap) return -1;
  const type = have.id === want.id ? FIT.type.same : have.rank > want.rank ? FIT.type.upgrade : FIT.type.downgrade;
  const capacity = 1 - ((have.cap - x.party) / have.cap) * 0.5;
  const budget = GUEST_TYPES[x.type].budget;
  const price = Math.max(0, 1 - Math.abs(have.rate - budget) / budget);
  const w = FIT.weights;
  return w.type * type + w.capacity * capacity + (w.view + w.noise + w.distance) * FIT.neutral + w.price * price;
}

export function createBookingSystem({ seed, saved = null, bus = null, day = 0, band = 'morning' }) {
  let s = saved ? load(saved) : freshBookings({ seed, day, band });
  let version = 0;
  let hk = null; // (Milestone 4) the housekeeping system, once attached
  let rv = null; // (Milestone 5) the reviews system, once attached
  let fin = null; // (Milestone 6) the finance system, once attached
  let cp = null; // (Milestone 7) the complaints system, once attached
  let mt = null; // (Milestone 8) the maintenance system, once attached
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
  const heldBy = (id, x) => s.bookings.find((b) => b.room === id && b !== x && HOLDS.has(b.status)) ?? null;
  function freeBy(id, x) {
    if (heldBy(id, x)) return false;
    const st = roomState(id);
    if (ROOM_STATES[st].sellable) return true;
    return (st === 'dirty' || st === 'cleaning') && x.arrival > s.at.day && !!hk?.hasJob(id);
  }
  function freeRoomsFor(x) {
    return ROOMS.filter((r) => ROOM_TYPES[r.typeId].cap >= x.party && freeBy(r.id, x));
  }
  // A booking takes its room: a Ready room turns Reserved (a Dirty / Cleaning one stays so until it is clean).
  const hold = (id) => roomState(id) === 'ready' && setRoom(id, 'reserved');
  const release = (id) => roomState(id) === 'reserved' && setRoom(id, 'ready');
  function bestRoomFor(x) {
    let best = null;
    let bestFit = -Infinity;
    for (const r of freeRoomsFor(x)) {
      const f = fitOf(x, r);
      if (f > bestFit + 1e-9) {
        best = r;
        bestFit = f;
      }
    }
    return best;
  }
  // Why an offer can't be accepted (one plain line), or null when it can.
  function whyNot(x) {
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
    w.late = { minutes: mins, serviceLoss: Math.min(LATE.lossCap, Math.round(mins / LATE.lossPerMinutes)) };
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
      fresh = makeOffers(seed, day, s.stats, pricing(day));
      s.offers.push(...fresh);
    }
    const late = [];
    if (band >= BAND.midday)
      for (const b of s.bookings)
        if (b.status === 'upcoming' && b.arrival <= day) {
          if (['reserved', 'ready'].includes(roomState(b.room))) {
            checkIn(b, day, band);
            ins.push(b);
          } else {
            startWaiting(b, day, band);
            late.push(b);
          }
        }
    s.at = { day, band };
    if (outs.length) bus?.emit('booking:checkout', { bookings: outs.map(clone) });
    if (fresh.length) bus?.emit('booking:offers', { day, offers: fresh.map(clone) });
    if (ins.length) bus?.emit('booking:checkin', { bookings: ins.map(clone) });
    if (late.length) bus?.emit('booking:late', { bookings: late.map(clone) });
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
        hk?.advance(minuteOf(next.day, next.band)); // cleaning up to this edge first, then the edge
        mt?.advance(minuteOf(next.day, next.band)); // (Milestone 8) maintenance jobs up to this edge
        cp?.advance(minuteOf(next.day, next.band)); // (Milestone 7) late parties' 30 minutes up to this edge
        hk?.onEdge(next.day, next.band);
        edge(next.day, next.band);
        mt?.onEdge(next.day, next.band, api); // (Milestone 8) the day change: wear, breakdowns
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
      s.offers = s.offers.filter((x) => x !== o);
      const b = { id: `B${s.nextId++}`, type: o.type, party: o.party, nights: o.nights, arrival: o.arrival, roomType: o.roomType, rate: o.rate, room: r.id, pinned: !!room, status: 'upcoming', nightsLeft: o.nights, inDay: null, inBand: null, outDay: null };
      s.bookings.push(b);
      hold(r.id);
      s.stats.accepted++;
      // Accepted on its arrival day after check-in time began: they check in straight away.
      if (b.arrival <= s.at.day && s.at.band >= BAND.midday) {
        checkIn(b, s.at.day, s.at.band, Math.max(hk?.at ?? 0, cp?.at ?? 0, minuteOf(s.at.day, s.at.band)));
        bus?.emit('booking:checkin', { bookings: [clone(b)] });
      }
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
      release(b.room);
      b.room = r.id;
      b.pinned = true;
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
      if (!b || !['waiting', 'staying'].includes(b.status)) return [];
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
    fitOf,
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
    serialize: () => clone(s),
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
