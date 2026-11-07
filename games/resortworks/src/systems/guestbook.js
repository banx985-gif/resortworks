// Repeat guests / Guestbook (Milestone 20, bible §19). Each notable guest — a stay of 4★ or more, or one that made a memory —
// gets a Guestbook entry: a name, every stay (room, satisfaction, stars, package, event), their favourite room and their
// memories (Perfect Honeymoon, Kids Loved the Pool, Best Meal, Saved by Great Service, Disaster Weekend, Celebrity Visit,
// a Great Event). After each stay a seeded roll decides whether they will come back, and when (a month to two years
// later): that Morning they are one of the day's offers (a returning guest takes one of its places), asking for their
// favourite room type, with every past stay kept. A guest with 2+ stays is a Regular (Cowork's pick): +5 satisfaction and
// they book further ahead; a Regular who loves the stay may leave a gift (a Staff Item). Positive and redemption memories
// add Prestige points (kept for M23). The Hall of Fame (Kairosoft rule 3): the best stays, the best reviews, the most returns.
//   createGuestbook({ saved, bus, seed, items }) → gb
//     gb.onReview(review) (the booking system's check-out, through the bus) · gb.onEvent(result) · gb.extraSat(booking)
//     gb.dueOffers(day, pricing) → that Morning's returning guests as offers · gb.byId(id) · gb.guests · gb.regulars ·
//     gb.hallOfFame() · gb.stats · serialize()
//   On the bus: 'guestbook:new' { guest } · 'guestbook:return' { guest } · 'guestbook:memory' { guest, memory }
import { Rng } from '../../../../core/Rng.js';
import { KEEP, RETURN, REGULAR, MEMORIES, memoryById, PRESTIGE_PTS, GIFT, HOF, FIRST, LAST } from '../../data/guestbook.js';
import { GUEST_TYPES, ROOM_TYPES } from '../../data/bookings.js';
import { ROOMS } from '../../data/lot.js';
import { POOL_IDS } from '../../data/research.js';
import { has } from './facilities.js';
import { rx } from './research.js';
import { teamBonus } from './staff.js';
import { wantsOf, fitsType } from './guests.js';
import { OFFERS } from '../../data/bookings.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
export const freshGuestbook = () => ({ nextId: 1, guests: [], stats: { kept: 0, returns: 0, returnOffers: 0, memories: {}, gifts: 0, prestigePts: 0, dropped: 0 } });
const isRegular = (g) => (g?.stays?.length ?? 0) >= REGULAR.stays;

export function createGuestbook({ saved = null, bus = null, seed = 'resortworks', items = null, team = [] } = {}) {
  const s = load(saved);
  const byId = (id) => s.guests.find((g) => g.id === id) ?? null;
  const changed = () => bus?.emit('guestbook:change', {});
  function nameFor(id, type) {
    const rng = new Rng(`${seed}:guestname:${id}`);
    const first = rng.pick(FIRST);
    const last = rng.pick(LAST);
    const t = GUEST_TYPES[type];
    if ((t?.party ?? 1) === 1) return `${first} ${last}`;
    return t?.family ? `The ${last} family` : t?.tags?.includes('group') ? `${last} & Co.` : `The ${last}s`;
  }
  // The memories this stay made (seeded per review).
  function memoriesOf(v) {
    const out = [];
    const t = GUEST_TYPES[v.type];
    const rng = new Rng(`${seed}:memory:${v.id}`);
    const roll = () => rng.next();
    if (t?.tags?.includes('honeymoon') && v.sat >= 90) out.push('honeymoon');
    if (t?.family && POOL_IDS.some(has) && v.cats.activities >= 80 && roll() < memoryById('pool').chance) out.push('pool');
    else roll();
    if (v.cats.food >= 88 && roll() < memoryById('meal').chance + rx('diningMemory')) out.push('meal');
    if (v.recovered && v.memory) out.push('saved');
    if (v.stars <= 2) out.push('disaster');
    if (t?.tags?.includes('celebrity')) out.push('celebrity');
    return out;
  }
  function addMemory(g, id) {
    if (g.memories.includes(id) && id !== 'event') return;
    g.memories.push(id);
    const m = memoryById(id);
    s.stats.memories[id] = (s.stats.memories[id] ?? 0) + 1;
    s.stats.prestigePts += PRESTIGE_PTS[m.kind] ?? 0;
    bus?.emit('guestbook:memory', { guest: clone(g), memory: m.name });
  }
  function returnChance(g, sat, mems) {
    if (mems.includes('disaster')) return 0;
    let p = RETURN.bySat.find((x) => sat >= x.min)?.p ?? 0;
    if (mems.some((m) => memoryById(m).kind === 'positive')) p += RETURN.memory;
    if (mems.includes('saved')) p += RETURN.redemption;
    return Math.min(0.9, p * (1 + rx('repeat') + teamBonus(team, 'repeat')));
  }
  // A stay has ended (its review): a returning guest's entry grows; a new notable guest gets one; the return roll.
  function onReview(v) {
    const mems = memoriesOf(v);
    let g = v.guest ? byId(v.guest) : null;
    if (!g && v.stars < KEEP.minStars && !mems.length) return null;
    const regularBefore = isRegular(g);
    if (!g) {
      g = { id: `P${s.nextId++}`, type: v.type, name: null, stays: [], memories: [], returnDay: null, firstDay: v.day };
      g.name = nameFor(g.id, v.type);
      s.guests.push(g);
      s.stats.kept++;
      bus?.emit('guestbook:new', { guest: clone(g) });
    }
    const stay = { day: v.day, booking: v.booking, room: v.room, roomType: v.got, nights: v.nights, sat: Math.round(v.sat * 10) / 10, stars: v.stars, review: v.id };
    if (v.stars >= 5 && v.text) stay.text = String(v.text).slice(0, 120); // (the Hall of Fame's best reviews)
    if (v.pkg) stay.pkg = v.pkg;
    if (v.event) stay.event = v.event;
    g.stays.push(stay);
    for (const m of mems) addMemory(g, m);
    g.lastDay = v.day;
    // favourite room: the room type they rated best
    const best = [...g.stays].sort((a, b) => b.sat - a.sat)[0];
    g.favRoomType = best.roomType;
    // a Regular who loved it may leave a gift
    if (regularBefore && v.stars >= GIFT.minStars && new Rng(`${seed}:gift:${v.id}`).next() < GIFT.chance && items?.grant('gift')) s.stats.gifts++;
    // will they come back, and when?
    const rng = new Rng(`${seed}:return:${g.id}:${g.stays.length}`);
    const p = returnChance(g, v.sat, mems);
    g.returnDay = rng.next() < p ? v.day + rng.int(RETURN.delay[0], RETURN.delay[1]) : null;
    trim();
    changed();
    return g;
  }
  // (M19) an event's Great Success: every guest of its room block remembers it.
  function onEvent(evt) {
    if (evt.result !== 'great') return;
    for (const g of s.guests) if (g.stays.some((x) => x.event === evt.id) && !g.memories.includes('event')) addMemory(g, 'event');
  }
  // Keep the book to KEEP.max: the least notable one-off guests (one stay, no memory, no return due) go first.
  function trim() {
    while (s.guests.length > KEEP.max) {
      let worst = -1;
      for (let i = 0; i < s.guests.length; i++) {
        const g = s.guests[i];
        if (g.stays.length > 1 || g.memories.length || g.returnDay != null) continue;
        if (worst < 0 || g.stays[0].sat < s.guests[worst].stays[0].sat) worst = i;
      }
      if (worst < 0) worst = 0;
      s.guests.splice(worst, 1);
      s.stats.dropped++;
    }
  }
  // That Morning's returning guests, as offers (a Regular books further ahead), asking for their favourite room type
  // when it is still built and fits them.
  function dueOffers(day, pricing = null) {
    const out = [];
    for (const g of s.guests) {
      if (g.returnDay !== day) continue;
      const t = GUEST_TYPES[g.type];
      const rng = new Rng(`${seed}:back:${g.id}:${day}`);
      const nights = rng.int(t.nights[0], t.nights[1]);
      const reg = isRegular(g);
      const arrival = day + (reg ? rng.int(REGULAR.ahead[0], REGULAR.ahead[1]) : rng.int(OFFERS.arriveWithin[0], OFFERS.arriveWithin[1]));
      const built = new Set(ROOMS.map((r) => r.typeId));
      let roomType = g.favRoomType && built.has(g.favRoomType) && fitsType(t, g.favRoomType) ? g.favRoomType : null;
      if (!roomType) {
        const w = Object.entries(wantsOf(t)).sort((a, b) => b[1] - a[1]);
        roomType = w[0]?.[0] ?? null;
      }
      g.returnDay = null;
      if (!roomType || !ROOM_TYPES[roomType]) continue;
      out.push({ id: `R${day}-${g.id}`, day, type: g.type, party: t.party, nights, arrival, roomType, rate: pricing ? pricing.rateOf(roomType) : ROOM_TYPES[roomType].rate, guestId: g.id, repeat: true, regular: reg });
      s.stats.returnOffers++;
      bus?.emit('guestbook:return', { guest: clone(g) });
    }
    if (out.length) changed();
    return out;
  }
  // A returning guest checked in (their stay counts as a return).
  function onReturnStay() {
    s.stats.returns++;
  }
  const extraSat = (b) => (b?.guestId && isRegular(byId(b.guestId)) ? REGULAR.sat : 0);
  function hallOfFame() {
    const stays = s.guests.flatMap((g) => g.stays.map((x) => ({ ...x, guest: g.id, name: g.name, type: g.type })));
    return {
      bestStays: [...stays].sort((a, b) => b.sat - a.sat || a.day - b.day).slice(0, HOF.n),
      bestReviews: [...stays].sort((a, b) => b.stars - a.stars || b.sat - a.sat || a.day - b.day).slice(0, HOF.n),
      mostReturns: [...s.guests].filter((g) => g.stays.length > 1).sort((a, b) => b.stays.length - a.stays.length || a.firstDay - b.firstDay).slice(0, HOF.n),
    };
  }
  return {
    onReview,
    onEvent,
    onReturnStay,
    dueOffers,
    extraSat,
    hallOfFame,
    byId,
    isRegular: (id) => isRegular(byId(id)),
    get guests() {
      return s.guests;
    },
    get regulars() {
      return s.guests.filter(isRegular);
    },
    get stats() {
      return clone(s.stats);
    },
    serialize: () => clone(s),
  };
}
function load(saved) {
  const f = freshGuestbook();
  if (!saved || typeof saved !== 'object') return f;
  const s = clone(saved);
  return { nextId: Number.isFinite(s.nextId) ? s.nextId : 1, guests: Array.isArray(s.guests) ? s.guests.filter((g) => GUEST_TYPES[g.type] && Array.isArray(g.stays)) : [], stats: { ...f.stats, ...(s.stats ?? {}), memories: { ...(s.stats?.memories ?? {}) } } };
}
export { MEMORIES };
