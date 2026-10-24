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
//   resortSheet(world, id, { accent, bookings, today, dateOf, act }) → a core/ui/BottomSheet menu (key: the id), or null
//     act: { accept(offerId), decline(offerId), pick(offerOrBookingId), open(id), setAuto(on) } — the screen's actions
//   pickRoomSheet(bookings, forId, { accent, today, act: { choose(forId, roomId), open(id) } })
import { stationSheet } from '../../../../core/ui/StationSheet.js';
import { THEME } from '../../../../core/Theme.js';
import { GUEST, ROOMS, roomById } from '../../data/lot.js';
import { ROOM_TYPES, GUEST_TYPES, ROOM_STATES, PRICE_BAND } from '../../data/bookings.js';
import { arrivalWords } from '../systems/bookings.js';

const C = THEME.color;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const partyWords = (n) => (n === 1 ? '1 person' : `${n} people`);
const aOrAn = (w) => (/^[AEIOU]/i.test(w) ? 'an' : 'a');
export const rateWords = (rate) => `${rate} Cr a night`;
const NO_ACT = { accept() {}, decline() {}, pick() {}, open() {}, setAuto() {}, choose() {} };

export function resortSheet(world, id, { accent = C.progress, bookings = null, today = 0, dateOf = null, act = NO_ACT } = {}) {
  const it = world?.byId(id);
  if (!it) return null;
  const now = [world.stateOf(it)];
  let spec;
  if (it.kind === 'guest') spec = guestSpec(world, it, { bookings, today, dateOf });
  else if (it.kind === 'staff') spec = { title: world.founder.name, line: world.role.name, art: world.founder.art, tag: { text: 'FOUNDER', color: C.purple }, now };
  else if (it.kind === 'room') spec = roomSpec(world, it, { bookings, today, act });
  else if (it.id === 'F01' && bookings) spec = receptionSpec(it, { bookings, today, act, accent });
  else spec = { title: it.def.name, line: it.def.line, art: it.def.art, now };
  return { ...stationSheet({ ...spec, accent, text: { now: 'Now' } }), key: id };
}

// --- Reception: the Bookings list -----------------------------------------------------------------------------------
function receptionSpec(it, { bookings: bk, today, act }) {
  const offers = bk.offers;
  const up = bk.upcoming;
  const stay = bk.staying;
  const summary = [offers.length ? plural(offers.length, 'new offer') : 'No new offers', up.length ? `${up.length} arriving` : null, stay.length ? `${stay.length} staying` : null].filter(Boolean).join(' · ');
  const body = [];
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
  return {
    title: it.def.name,
    line: it.def.line,
    art: it.def.art,
    now: [summary],
    more: [{ id: 'auto', label: `Auto Assign: ${bk.autoAssign ? 'On' : 'Off'}`, sub: bk.autoAssign ? 'Accepted guests get the best-fitting room' : 'You pick a room for each booking', accent: bk.autoAssign ? C.progress : C.textMuted, onTap: () => act.setAuto(!bk.autoAssign) }],
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
  if (st === 'cleaning') return 'Being cleaned';
  return 'Closed for maintenance';
}
function roomSpec(world, it, { bookings: bk, today, act }) {
  const room = it.def;
  const rt = ROOM_TYPES[room.typeId];
  if (!bk) return { title: room.name, line: room.type, art: room.art, now: [world.stateOf(it)] };
  const st = ROOM_STATES[bk.roomState(room.id)];
  const b = bk.bookingInRoom(room.id);
  const now = [roomStateLine(bk, room, today)];
  if (st.id === 'occupied') now.push({ text: world.stateOf(it), color: C.textMuted });
  if (st.id === 'dirty') now.push({ text: "It can't be sold or given to a guest until it's clean.", color: C.textMuted });
  const main = [];
  if (b?.status === 'staying') main.push({ id: `guest:${b.id}`, label: 'See the guest', icon: GUEST_TYPES[b.type].art, onTap: () => act.open(b.id) });
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

// --- a guest --------------------------------------------------------------------------------------------------------
function guestSpec(world, p, { bookings: bk, today, dateOf }) {
  const b = bk?.byId(p.id);
  if (!b) return { title: GUEST.title, line: p.name ?? GUEST.type, art: GUEST.sheetArt, now: [world.stateOf(p)] };
  const t = GUEST_TYPES[b.type];
  const room = roomById(b.room);
  const out = b.arrival + b.nights;
  const lines = [
    { text: 'Nights left', right: b.status === 'left' ? 'Checked out' : String(b.nightsLeft) },
    { text: 'Room', right: `${room.name} (${ROOM_TYPES[room.typeId].name})` },
    { text: 'Checks out', right: b.status === 'left' ? 'This morning' : out - today === 1 ? 'Tomorrow morning' : dateOf ? `Morning of ${dateOf(out)}` : `In ${out - today} days` },
    { text: 'Rate', right: rateWords(b.rate) },
  ];
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
