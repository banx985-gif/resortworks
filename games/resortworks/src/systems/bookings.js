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
  const s = { autoAssign: true, nextId: 1, at: { day, band: BAND[band] ?? 1 }, rooms: Object.fromEntries(ROOMS.map((r) => [r.id, 'ready'])), offers: [], bookings: [], stats: { ...STATS0 } };
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

const STATS0 = { offered: 0, accepted: 0, declined: 0, expired: 0, checkIns: 0, checkOuts: 0, lateRooms: 0, lateMinutes: 0 };
const HOLDS = new Set(['upcoming', 'waiting', 'staying']); // a booking in one of these holds its room
const rateOf = (roomType) => Math.round(ROOM_TYPES[roomType].rate * PRICE_BAND.mult);
function weighted(rng, entries) {
  const total = entries.reduce((t, [, w]) => t + w, 0);
  let r = rng.next() * total;
  for (const [k, w] of entries) if ((r -= w) < 0) return k;
  return entries[entries.length - 1][0];
}
// One day's offers: 2–4, each its own guest type, party, nights, arrival day and the room type they want.
export function makeOffers(seed, day, stats = null) {
  const rng = new Rng(`${seed}:offers:${day}`);
  const n = rng.int(OFFERS.perMorning[0], OFFERS.perMorning[1]);
  const out = [];
  for (let k = 1; k <= n; k++) {
    const t = GUEST_TYPES[weighted(rng, Object.values(GUEST_TYPES).map((g) => [g.id, g.weight]))];
    const nights = rng.int(t.nights[0], t.nights[1]);
    const arrival = day + rng.int(OFFERS.arriveWithin[0], OFFERS.arriveWithin[1]);
    const roomType = weighted(rng, Object.entries(t.wants));
    out.push({ id: `O${day}-${k}`, day, type: t.id, party: t.party, nights, arrival, roomType, rate: rateOf(roomType) });
  }
  if (stats) stats.offered += out.length;
  return out;
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
  const changed = () => {
    version++;
    bus?.emit('booking:change', {});
  };

  const roomState = (id) => s.rooms[id] ?? 'ready';
  const setRoom = (id, state) => {
    s.rooms[id] = state;
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

  function checkIn(b, day, band) {
    b.status = 'staying';
    b.inDay = day;
    b.inBand = band;
    b.nightsLeft = Math.max(1, b.arrival + b.nights - day);
    if (hk?.isShort(b.room)) b.shortLinen = true; // (for M5: the room's last clean was short on linen)
    setRoom(b.room, 'occupied');
    s.stats.checkIns++;
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
          outs.push(b);
        }
      s.at = { day, band };
      if (outs.length) hk?.enqueue(outs.map((b) => b.room));
      fresh = makeOffers(seed, day, s.stats);
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
    if (w) {
      const at = bandAtMinute(minute);
      const mins = Math.max(0, Math.round((minute - w.waitFrom) * 100) / 100);
      w.late = { minutes: mins, serviceLoss: Math.min(LATE.lossCap, Math.round(mins / LATE.lossPerMinutes)) };
      s.stats.lateMinutes = Math.round((s.stats.lateMinutes + mins) * 100) / 100;
      setRoom(id, 'reserved');
      checkIn(w, at.day, at.band);
      bus?.emit('booking:checkin', { bookings: [clone(w)], late: true });
    } else setRoom(id, up ? 'reserved' : 'ready');
    changed();
  }

  const api = {
    // Every band edge from the last one processed up to (day, bandIndex), in order.
    sync(day, band) {
      let n = 0;
      while (s.at.day < day || (s.at.day === day && s.at.band < band)) {
        const next = s.at.band === BANDS.length - 1 ? { day: s.at.day + 1, band: 0 } : { day: s.at.day, band: s.at.band + 1 };
        hk?.advance(minuteOf(next.day, next.band)); // cleaning up to this edge first, then the edge
        hk?.onEdge(next.day, next.band);
        edge(next.day, next.band);
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
        checkIn(b, s.at.day, s.at.band);
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
    // Debug (?debug=1): every Dirty / Cleaning / Maintenance room clean at once (its cleaning job dropped; a room booked
    // next turns Reserved and a waiting party checks in).
    makeAllReady() {
      let n = 0;
      for (const id of Object.keys(s.rooms))
        if (!['reserved', 'occupied'].includes(s.rooms[id]) && s.rooms[id] !== 'ready') {
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
  return s;
}
