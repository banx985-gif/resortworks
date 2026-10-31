// The Resort Hub's sheets (Milestone 1, style guide §3, bible §0.2): one builder for every facility, room, guest and the
// Founder, on core/ui/StationSheet — header (picture, name, one line), the live "Now" line, then each one's own parts.
// Tapping the art and the bottom-bar shortcut both come here with the same id, so they always open the same sheet.
// Milestone 3 (bookings, src/systems/bookings.js):
//   Reception (F01) — Auto Assign On / Off, then the Bookings list: new offers (tap one to see it and pick a room; Accept /
//                     Decline — an offer with no free room can't be accepted and says why), upcoming arrivals (tap one to
//                     change its room) and the guests staying (tap one for their sheet).
//   a room          — its number, type and state (Ready / Reserved / Occupied / Dirty …), who is booked or staying, nights
//                     left, "Dirty — needs cleaning".
//   a guest         — type, party, nights left, room and what they are doing now.
//   pickRoomSheet   — the rooms for an offer or an upcoming booking, best Fit first (manual pinning beats Auto Assign).
// Milestone 4 (the opening team, housekeeping — src/systems/staff.js, src/systems/housekeeping.js):
//   a staff member  — portrait, name, role, level, the five stats, work pattern, what they're doing now; the
//                     housekeeper also their current job, the queue and the shift hours left.
//   Laundry (F04)   — linen units left today, what's been used and any short cleans.
//   a room          — Dirty (its place in the queue) / Cleaning (who, time left) / Ready, short on linen, Late.
//   Reception       — a Waiting list flags every party waiting for a late room.
// Milestone 5 (reviews, src/systems/reviews.js):
//   Reception       — a Reviews list, newest first (tap one for its card), and a Resort scores button.
//   resortScoresSheet — the star rating ("New" before the first month ends), Rank and REP, the five headline scores with
//                     one plain line each, last month's Roadside Guide marks.
//   resortSheet(world, id, { accent, bookings, today, dateOf, act, hk, team, reviews }) → a core/ui/BottomSheet menu (key: the id), or null
//     act: { accept(offerId), decline(offerId), pick(offerOrBookingId), open(id), setAuto(on) } — the screen's actions
//   pickRoomSheet(bookings, forId, { accent, today, act: { choose(forId, roomId), open(id) } })
import { stationSheet } from '../../../../core/ui/StationSheet.js';
import { THEME } from '../../../../core/Theme.js';
import { GUEST, ROOMS, roomById } from '../../data/lot.js';
import { ROOM_TYPES, GUEST_TYPES, ROOM_STATES, PRICE_BAND } from '../../data/bookings.js';
import { arrivalWords } from '../systems/bookings.js';
import { ROLES } from '../../data/setup.js';
import { STAT_KEYS, STAT_NAMES, TIERS } from '../../data/staff.js';
import { LINEN, LATE_BADGE } from '../../data/housekeeping.js';
import { linenFor } from '../systems/housekeeping.js';
import { patternWords } from '../systems/staff.js';
import { HEADLINES, WINDOW_DAYS } from '../../data/reviews.js';

const C = THEME.color;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const partyWords = (n) => (n === 1 ? '1 person' : `${n} people`);
const aOrAn = (w) => (/^[AEIOU]/i.test(w) ? 'an' : 'a');
export const rateWords = (rate) => `${rate} Cr a night`;
const NO_ACT = { accept() {}, decline() {}, pick() {}, open() {}, setAuto() {}, choose() {}, review() {}, scores() {} };
// (Milestone 5) the star rating in a few characters: "3★", or "New" before the first month ends.
export const starText = (stars) => (stars ? `${stars}★` : 'New');
const starsLong = (n) => `${'★'.repeat(n)}${'☆'.repeat(5 - n)}`;
const REVIEWS_SHOWN = 20;

export function resortSheet(world, id, { accent = C.progress, bookings = null, today = 0, dateOf = null, act = NO_ACT, hk = null, reviews = null } = {}) {
  const it = world?.byId(id);
  if (!it) return null;
  const now = [world.stateOf(it)];
  let spec;
  if (it.kind === 'guest') spec = guestSpec(world, it, { bookings, today, dateOf });
  else if (it.kind === 'staff') spec = staffSpec(world, it, { hk, now });
  else if (it.kind === 'room') spec = roomSpec(world, it, { bookings, today, act, hk });
  else if (it.id === 'F01' && bookings) spec = receptionSpec(it, { bookings, today, act, accent, reviews, dateOf });
  else if (it.id === 'F04' && hk) spec = laundrySpec(it, { hk, now });
  else spec = { title: it.def.name, line: it.def.line, art: it.def.art, now };
  return { ...stationSheet({ ...spec, accent, text: { now: 'Now' } }), key: id };
}

// --- Reception: the Bookings list -----------------------------------------------------------------------------------
function receptionSpec(it, { bookings: bk, today, act, reviews = null, dateOf = null }) {
  const offers = bk.offers;
  const up = bk.upcoming;
  const stay = bk.staying;
  const wait = bk.waiting ?? [];
  const summary = [offers.length ? plural(offers.length, 'new offer') : 'No new offers', wait.length ? `${wait.length} waiting` : null, up.length ? `${up.length} arriving` : null, stay.length ? `${stay.length} staying` : null].filter(Boolean).join(' · ');
  const body = [];
  // (Milestone 4) Parties waiting for a late room come first.
  if (wait.length) {
    body.push({ title: `Waiting for a late room (${wait.length})`, lines: [{ text: 'Their room isn’t clean yet. They check in the moment it is.', color: C.bad }], std: 'waiting' });
    body.push({
      columns: 1,
      buttons: wait.map((b) => {
        const t = GUEST_TYPES[b.type];
        return { id: `guest:${b.id}`, icon: t.art, label: `LATE · ${t.name} → ${roomById(b.room).name}`, sub: `Waiting at Reception · ${partyWords(b.party)} · ${plural(b.nights, 'night')}`, accent: LATE_BADGE.color, onTap: () => act.open(b.id) };
      }),
    });
  }
  body.push({ title: `New offers (${offers.length})`, lines: offers.length ? [] : ['New booking offers arrive each Morning. Unanswered ones expire at the end of the day.'], std: 'offers' });
  for (const o of offers) {
    const t = GUEST_TYPES[o.type];
    const why = bk.whyNot(o);
    body.push({
      columns: 1,
      buttons: [{ id: `offer:${o.id}`, icon: t.art, label: t.name, sub: `${partyWords(o.party)} · ${plural(o.nights, 'night')} · arrives ${arrivalWords(o.arrival, today)} · wants ${ROOM_TYPES[o.roomType].name.replace(' Room', '')}`, cost: rateWords(o.rate), accent: C.progress, onTap: () => act.pick(o.id) }],
    });
    body.push({
      lines: why ? [{ text: why, color: C.bad }] : [],
      columns: 2,
      buttons: [
        { id: `accept:${o.id}`, label: 'Accept', accent: C.action, disabled: !!why, onTap: () => act.accept(o.id) },
        { id: `decline:${o.id}`, label: 'Decline', accent: C.textMuted, onTap: () => act.decline(o.id) },
      ],
    });
  }
  body.push({ title: `Arriving (${up.length})`, lines: up.length ? [] : ['No guests booked to arrive yet.'], std: 'arriving' });
  if (up.length)
    body.push({
      columns: 1,
      buttons: up.map((b) => {
        const t = GUEST_TYPES[b.type];
        return { id: `booking:${b.id}`, icon: t.art, label: `${t.name} → ${roomById(b.room).name}`, sub: `Arrives ${arrivalWords(b.arrival, today)} · ${plural(b.nights, 'night')}${b.pinned ? ' · room picked by you' : ''}`, cost: 'Change room', accent: C.progress, onTap: () => act.pick(b.id) };
      }),
    });
  body.push({ title: `Staying (${stay.length})`, lines: stay.length ? [] : ['Nobody is staying right now.'], std: 'staying' });
  if (stay.length)
    body.push({
      columns: 1,
      buttons: stay.map((b) => {
        const t = GUEST_TYPES[b.type];
        return { id: `guest:${b.id}`, icon: t.art, label: `${t.name} · ${roomById(b.room).name}`, sub: `${nightsLeftWords(b.nightsLeft)} · ${partyWords(b.party)}`, accent: C.progress, onTap: () => act.open(b.id) };
      }),
    });
  // (Milestone 5) the reviews, newest first
  if (reviews) {
    const list = reviews.list;
    body.push({ title: `Reviews (${reviews.counts.reviews})`, lines: list.length ? (list.length > REVIEWS_SHOWN ? [{ text: `The newest ${REVIEWS_SHOWN}.`, color: C.textMuted }] : []) : ['Every guest leaves a review when they check out.'], std: 'reviews' });
    if (list.length)
      body.push({
        columns: 1,
        buttons: list.slice(0, REVIEWS_SHOWN).map((v) => {
          const t = GUEST_TYPES[v.type];
          const when = v.day === today ? 'today' : dateOf ? dateOf(v.day) : `Day ${v.day + 1}`;
          return { id: `review:${v.id}`, icon: t.art, label: `${starsLong(v.stars)} ${t.name}`, sub: `${roomById(v.room)?.name ?? ''} · left ${when} · ${Math.round(v.sat)}/100`, accent: v.stars >= 4 ? C.good : v.stars <= 2 ? C.bad : C.progress, onTap: () => act.review(v.id) };
        }),
      });
  }
  return {
    title: it.def.name,
    line: it.def.line,
    art: it.def.art,
    now: [summary],
    more: [...(reviews ? [{ id: 'scores', label: `Resort scores · ${starText(reviews.stars)}`, sub: `Rank ${reviews.rank.id} · the five headline scores`, accent: C.progress, onTap: () => act.scores() }] : []), { id: 'auto', label: `Auto Assign: ${bk.autoAssign ? 'On' : 'Off'}`, sub: bk.autoAssign ? 'Accepted guests get the best-fitting room' : 'You pick a room for each booking', accent: bk.autoAssign ? C.progress : C.textMuted, onTap: () => act.setAuto(!bk.autoAssign) }],
    body,
  };
}
const nightsLeftWords = (n) => (n <= 0 ? 'Leaving this morning' : `${plural(n, 'night')} left`);

// --- a room ---------------------------------------------------------------------------------------------------------
export function roomStateLine(bk, room, today) {
  const st = bk.roomState(room.id);
  const b = bk.bookingInRoom(room.id);
  const tname = b ? GUEST_TYPES[b.type].name : '';
  if (st === 'ready') return 'Ready for its next guest';
  if (st === 'reserved') return b ? `Reserved for ${aOrAn(tname)} ${tname}, arriving ${arrivalWords(b.arrival, today)}` : 'Reserved';
  if (st === 'occupied') return b ? `Occupied by ${aOrAn(tname)} ${tname} · ${nightsLeftWords(b.nightsLeft).toLowerCase()}` : 'Occupied';
  if (st === 'dirty') return 'Dirty — needs cleaning';
  if (st === 'cleaning') return 'Cleaning';
  return 'Closed for maintenance';
}
function roomSpec(world, it, { bookings: bk, today, act, hk = null }) {
  const room = it.def;
  const rt = ROOM_TYPES[room.typeId];
  if (!bk) return { title: room.name, line: room.type, art: room.art, now: [world.stateOf(it)] };
  const st = ROOM_STATES[bk.roomState(room.id)];
  const b = bk.bookingInRoom(room.id);
  const now = [roomStateLine(bk, room, today)];
  if (st.id === 'occupied') now.push({ text: world.stateOf(it), color: C.textMuted });
  // (Milestone 4) the cleaning: who and how long, or its place in the queue; a party waiting; short on linen.
  const job = hk?.cleaningOf(room.id);
  if (st.id === 'cleaning' && job) now[0] = `Cleaning — ${job.who} · ${minutesWords(job.left)} left`;
  else if (job) now[0] = `Dirty — ${job.who} is on the way to clean it`;
  else if (st.id === 'dirty' && hk?.queuePosition(room.id)) now[0] = `Dirty — ${ordinal(hk.queuePosition(room.id))} in the cleaning queue`;
  const waiting = bk.waitingFor?.(room.id);
  if (waiting) now.push({ text: `Late: ${aOrAn(GUEST_TYPES[waiting.type].name)} ${GUEST_TYPES[waiting.type].name} is waiting at Reception`, color: LATE_BADGE.color });
  else if ((st.id === 'dirty' || st.id === 'cleaning') && b?.status === 'upcoming') now.push({ text: `Booked next: ${aOrAn(GUEST_TYPES[b.type].name)} ${GUEST_TYPES[b.type].name}, arriving ${arrivalWords(b.arrival, today)}`, color: C.textMuted });
  if (st.id === 'dirty' && !hk) now.push({ text: "It can't be sold or given to a guest until it's clean.", color: C.textMuted });
  if (hk?.isShort(room.id)) now.push({ text: 'Short on linen at its last clean', color: C.bad });
  const main = [];
  if (b?.status === 'staying' || b?.status === 'waiting') main.push({ id: `guest:${b.id}`, label: 'See the guest', icon: GUEST_TYPES[b.type].art, onTap: () => act.open(b.id) });
  if (b?.status === 'upcoming') main.push({ id: `booking:${b.id}`, label: 'Change this booking’s room', onTap: () => act.pick(b.id) });
  return {
    title: room.name,
    line: `${rt.name} · sleeps ${rt.cap}`,
    art: room.art,
    tag: { text: st.name.toUpperCase(), color: st.color },
    now,
    main,
    body: [{ title: 'Room', lines: [{ text: `${PRICE_BAND.name} rate`, right: rateWords(Math.round(rt.rate * PRICE_BAND.mult)) }] }],
  };
}

const ordinal = (n) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;
export const minutesWords = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${String(Math.round(m % 60)).padStart(2, '0')} min` : `${Math.max(1, Math.ceil(m))} min`);

// --- a staff member (Milestone 4) -----------------------------------------------------------------------------------
function staffSpec(world, p, { hk, now }) {
  const m = p.member;
  const tag = p.founder ? { text: 'FOUNDER', color: C.purple } : { text: 'STAFF', color: C.progress };
  if (!m?.stats) return { title: p.name, line: ROLES[p.role]?.name ?? world.role.name, art: m?.art ?? world.founder.art, tag, now };
  const job = hk?.jobOf(m.id);
  const nowLines = [...now];
  if (job) nowLines[0] = job.phase === 'walk' ? `Walking to ${roomById(job.room).name} to clean it` : `Cleaning ${roomById(job.room).name} · ${minutesWords(job.left)} left`;
  const body = [
    { title: 'Stats', lines: STAT_KEYS.map((k) => ({ text: STAT_NAMES[k], right: String(Math.round(m.stats[k])) })) },
    { title: 'Work', lines: [{ text: 'Level', right: `${m.level} · ${TIERS[m.tier]?.name ?? 'Standard'}` }, { text: 'Work pattern', right: patternWords(m.pattern) }] },
  ];
  if (m.role === 'HK' && hk) {
    body.push({
      title: 'Cleaning',
      lines: [
        { text: 'Current job', right: job ? `${roomById(job.room).name} · ${job.phase === 'walk' ? 'on the way' : `${minutesWords(job.left)} left`}` : 'None' },
        { text: 'Rooms in the queue', right: String(hk.queue.length) },
        { text: 'Shift hours left', right: hk.onShift(m.id) ? minutesWords(hk.hoursLeft(m.id)) : 'Off shift' },
      ],
    });
  }
  return { title: m.name, line: ROLES[m.role].name, art: m.art, tag, now: nowLines, body };
}

// --- F04 Laundry Room (Milestone 4) ---------------------------------------------------------------------------------
function laundrySpec(it, { hk, now }) {
  const l = hk.linen;
  const lines = [
    { text: 'Linen left today', right: `${l.left} of ${l.cap}` },
    { text: 'Used today', right: `${l.used} units · ${plural(l.rooms, 'room')}` },
    { text: 'Each room turn', right: `${linenFor('R1')} units (${LINEN.perBed} a bed)` },
  ];
  if (l.short) lines.push({ text: 'Short on linen today', right: plural(l.short, 'room'), color: C.bad });
  lines.push({ text: `Restocked to ${l.cap} each Morning. Out of linen, cleaning takes ${LINEN.shortFactor} times as long.`, color: C.textMuted });
  return { title: it.def.name, line: it.def.line, art: it.def.art, now: [`${l.left} of ${l.cap} linen units left today`, ...now.map((x) => ({ text: x, color: C.textMuted }))], body: [{ title: 'Linen', lines }] };
}

// --- a guest --------------------------------------------------------------------------------------------------------
function guestSpec(world, p, { bookings: bk, today, dateOf }) {
  const b = bk?.byId(p.id);
  if (!b) return { title: GUEST.title, line: p.name ?? GUEST.type, art: GUEST.sheetArt, now: [world.stateOf(p)] };
  const t = GUEST_TYPES[b.type];
  const room = roomById(b.room);
  const out = b.arrival + b.nights;
  const lines = [
    { text: 'Nights left', right: b.status === 'left' ? 'Checked out' : b.status === 'waiting' ? 'Not checked in yet' : String(b.nightsLeft) },
    { text: 'Room', right: `${room.name} (${ROOM_TYPES[room.typeId].name})` },
    { text: 'Checks out', right: b.status === 'left' ? 'This morning' : out - today === 1 ? 'Tomorrow morning' : dateOf ? `Morning of ${dateOf(out)}` : `In ${out - today} days` },
    { text: 'Rate', right: rateWords(b.rate) },
  ];
  if (b.status === 'waiting') lines.unshift({ text: 'Late room', right: `${room.name} isn’t clean yet`, color: LATE_BADGE.color });
  else if (b.late) lines.push({ text: 'Waited for their room', right: minutesWords(b.late.minutes) });
  return { title: t.name, line: `${partyWords(b.party)} · ${room.name}`, art: t.art, now: [world.stateOf(p)], body: [{ title: 'Stay', lines }] };
}

// --- the room picker (manual pinning) ------------------------------------------------------------------------------
export function pickRoomSheet(bk, forId, { accent = C.progress, today = 0, act = NO_ACT } = {}) {
  const x = bk.byId(forId);
  if (!x) return null;
  const t = GUEST_TYPES[x.type];
  const isOffer = !x.status;
  const free = new Set(bk.freeRoomsFor(x).map((r) => r.id));
  const best = bk.bestRoomFor(x);
  const rows = ROOMS.map((r) => ({ r, fit: bk.fitOf(x, r), free: free.has(r.id) || r.id === x.room }))
    .sort((a, b) => b.free - a.free || b.fit - a.fit || a.r.number - b.r.number)
    .map(({ r, fit, free: ok }) => {
      const st = ROOM_STATES[bk.roomState(r.id)];
      const current = r.id === x.room;
      return {
        id: `room:${r.id}`,
        label: `${r.name} · ${ROOM_TYPES[r.typeId].name}`,
        sub: current ? 'Their room now' : ok ? `Fit ${Math.round(fit)}${best?.id === r.id ? ' · Auto Assign’s pick' : ''}` : st.name,
        cost: rateWords(ROOM_TYPES[r.typeId].rate),
        accent: ok ? (best?.id === r.id ? C.action : C.progress) : C.textMuted,
        disabled: !ok,
        onTap: () => act.choose(forId, r.id),
      };
    });
  const why = isOffer ? bk.whyNot(x) : null;
  return {
    key: `pick:${forId}`,
    title: isOffer ? `Pick a room` : 'Change room',
    subtitle: `${t.name} · ${partyWords(x.party)} · ${plural(x.nights, 'night')} · arrives ${arrivalWords(x.arrival, today)}`,
    art: t.art,
    accent,
    sections: [
      { lines: [why ? { text: why, color: C.bad } : `Wants ${aOrAn(ROOM_TYPES[x.roomType].name)} ${ROOM_TYPES[x.roomType].name}. ${isOffer ? 'Picking a room accepts the booking in that room.' : 'The room you pick is kept for them.'}`] },
      { title: 'Rooms', columns: 1, buttons: rows },
      { columns: 1, buttons: [{ id: 'back', label: '‹ Back to Reception', accent: C.textMuted, onTap: () => act.open('F01') }] },
    ],
  };
}

// --- (Milestone 5) the Resort sheet: star rating, Rank / REP, the five headline scores ------------------------------
export function resortScoresSheet(rv, { today = 0, accent = C.progress } = {}) {
  const h = rv.headline(today);
  const last = rv.lastMonth;
  const next = rv.nextRank;
  const rank = rv.rank;
  const score = (k) => (h[k] == null ? '—' : String(Math.round(h[k])));
  const now = [
    rv.stars ? `Star rating: ${starsLong(rv.stars)} (${plural(rv.stars, 'star')})` : 'Star rating: New — the first rating comes at the end of Month 1.',
    `Rank ${rank.id} · ${rank.name} · ${rv.repValue} REP${next ? ` (Rank ${next.id} at ${next.min})` : ''}`,
  ];
  const body = [
    { title: `Headline scores (last ${WINDOW_DAYS} days)`, lines: HEADLINES.flatMap((x) => [{ text: x.name, right: score(x.id) }, { text: x.line, color: C.textMuted }]), std: 'headlines' },
    {
      title: 'How the stars are worked out',
      lines: ['At the end of each month the Roadside Guide rates the resort from these scores and the guests’ Value. 5 stars also needs every score but Prestige at 72 or more.', 'Reviews give REP: +1 a stay, +3 for 4 stars, +7 for 5 stars, −12 for 1 star. REP never drops below your Rank.'],
      std: 'how',
    },
  ];
  if (last) body.push({ title: `Last rating: Month ${last.n}`, lines: [...last.marks.map((m) => ({ text: `${m.name} (${m.area})`, right: `${m.mark.toFixed(1)}/10` })), { text: 'Quality', right: last.qi.toFixed(1) }, { text: 'Stars', right: starsLong(last.stars) }], std: 'lastMonth' });
  return { ...stationSheet({ title: 'Resort scores', line: 'Your star rating, Rank and headline scores.', art: 'facility_f01', accent, now, body, text: { now: 'Now' } }), key: 'scores' };
}
