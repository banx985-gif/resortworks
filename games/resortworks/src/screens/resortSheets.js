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
// Milestone 6 (finance / pricing, src/systems/finance.js):
//   Reception       — Rates and Finance buttons; each offer shows its rate in its room type's pricing band.
//   ratesSheet      — per room type (RM01, RM02): Value / Standard / Premium with the nightly rate of each, and how many
//                     offers each guest type still sends at the current price.
//   financeSheet    — cash and Emergency Credit, today's and this month's income and costs by line in plain words, the
//                     last 6 months' profit as a bar chart.
//   a room / the picker — the rate in the room type's current band.
// Milestone 7 (complaints / recovery, src/systems/complaints.js):
//   Reception       — a Complaints list first: the guest's picture, what's wrong in plain words, how long it has waited
//                     (tap one for its sheet); reviews of recovered stays say "Recovered".
//   complaintSheet  — what's wrong, how long it has waited, then each recovery action: its chance, cost, a "Best fit" hint,
//                     or why it can't be used; what was tried and how it went.
//   a guest         — their complaints.
// Milestone 8 (maintenance / Condition, src/systems/maintenance.js):
//   every facility and room — a Condition bar with a plain line ("Good", "Worn: working at 80%", "Broken: offline"), the
//                     job on it (repair / service, who, time left or place in the line) and a Service now button.
//   Maintenance Shed (F05) — the Maintenance person, their job now and the line of jobs; the breakdowns so far.
//   a staff member  — the Maintenance person also their current job and the line.
//   complaintSheet  — Maintenance priority for a breakdown (not shown for other complaints).
//   resortSheet(world, id, { accent, bookings, today, dateOf, act, hk, team, reviews, finance, complaints, mt }) → a core/ui/BottomSheet menu (key: the id), or null
//     act: { accept(offerId), decline(offerId), pick(offerOrBookingId), open(id), setAuto(on), rates(), finance(),
//            setBand(roomType, bandId), service(id) } — the screen's actions
//   pickRoomSheet(bookings, forId, { accent, today, act: { choose(forId, roomId), open(id) } })
import { stationSheet } from '../../../../core/ui/StationSheet.js';
import { typesNow, wantsOf, canCome } from '../systems/guests.js';
import { packageWords, packageRate } from './lateSheets.js';
import { combosFor, comboOn, whyNoCombo } from '../systems/themes.js';
import { THEME } from '../../../../core/Theme.js';
import { GUEST, ROOMS, roomById } from '../../data/lot.js';
import { ROOM_TYPES, GUEST_TYPES, ROOM_STATES, PRICE_BAND, ROOM_LEVEL, LOVED } from '../../data/bookings.js';
import { arrivalWords } from '../systems/bookings.js';
import { ROLES } from '../../data/setup.js';
import { STAT_KEYS, STAT_NAMES, TIERS, PATTERNS } from '../../data/staff.js';
import { PRIORITIES, FATIGUE, EMERGENCY, AUTO_ACCEPT, HIRING } from '../../data/staffing.js';
import { hireable, hireWhy, hireFee, fireWhy } from '../systems/staffing.js';
import { STAFF, staffDef, TRAIT_KEYS, XP, xpToNext, TRAINING, WHEN_STAGE, WHEN_WORDS, HIREABLE_TIERS } from '../../data/roster.js';
import { stageById, stageIndex } from '../../data/build.js';
import { WAGES } from '../../data/finance.js';
import { specChoice } from '../systems/staff.js';
import { effectWords } from '../systems/facilities.js';
import { EARLY_STAFF } from '../../data/staff.js';
import { staffById } from '../systems/staff.js';
import { LINEN, LATE_BADGE } from '../../data/housekeeping.js';
import { linenFor } from '../systems/housekeeping.js';
import { patternWords } from '../systems/staff.js';
import { HEADLINES, WINDOW_DAYS } from '../../data/reviews.js';
import { PRICE_BANDS, LINES, INCOME_LINES, COST_LINES, CREDIT, HISTORY, bandById } from '../../data/finance.js';
import { credits, signed, bandRate, offerChance } from '../systems/finance.js';
import { COMPLAINT_TYPES, ACTIONS, RECOVERY, REP_UNRESOLVED } from '../../data/complaints.js';
import { bandsBetween } from '../systems/complaints.js';
import { bandAtMinute } from '../systems/calendar.js';
import { complaintLine } from '../systems/complaints.js';
import { CONDITION, BADGE } from '../../data/maintenance.js';
import { targetName } from '../systems/maintenance.js';

const C = THEME.color;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const partyWords = (n) => (n === 1 ? '1 person' : `${n} people`);
const aOrAn = (w) => (/^[AEIOU]/i.test(w) ? 'an' : 'a');
export const rateWords = (rate) => `${rate} Cr a night`;
const NO_ACT = { items() {}, upgrade() {}, fire() {}, train() {}, spec() {}, staffBook() {}, accept() {}, decline() {}, pick() {}, open() {}, setAuto() {}, choose() {}, review() {}, scores() {}, rates() {}, finance() {}, setBand() {}, complaint() {}, recover() {}, service() {}, autoAccept() {}, autoSet() {}, setPriority() {}, pin() {}, hire() {} };
// (Milestone 5) the star rating in a few characters: "3★", or "New" before the first month ends.
export const starText = (stars) => (stars ? `${stars}★` : 'New');
const starsLong = (n) => `${'★'.repeat(n)}${'☆'.repeat(5 - n)}`;
const REVIEWS_SHOWN = 20;

export function resortSheet(world, id, { accent = C.progress, bookings = null, today = 0, dateOf = null, act = NO_ACT, hk = null, reviews = null, finance = null, complaints = null, mt = null, layout = null, staffing = null, confirm = null, site = null, items = null } = {}) {
  const it = world?.byId(id);
  if (!it) return null;
  const now = [world.stateOf(it)];
  let spec;
  if (it.kind === 'guest') spec = guestSpec(world, it, { bookings, today, dateOf, complaints, act });
  else if (it.kind === 'staff') spec = staffSpec(world, it, { hk, now, mt, st: staffing, act, finance, confirm });
  else if (it.kind === 'room') spec = roomSpec(world, it, { bookings, today, act, hk, finance, layout, site });
  else if (it.id === 'F01' && bookings) spec = receptionSpec(it, { bookings, today, act, accent, reviews, dateOf, finance, complaints });
  else if (it.id === 'F04' && hk) spec = laundrySpec(it, { hk, now });
  else if (it.id === 'F05' && mt) spec = shedSpec(it, { mt, now, team: world.team });
  else if (it.id === 'F02' && staffing) spec = serviceBlockSpec(it, { st: staffing, now, act, team: world.team?.map((w) => w.member).filter(Boolean) ?? null, finance, today, items }); // (Milestone 10; M11 Hire; M13 the applicant pool; M14 Staff Items)
  else spec = { title: it.def.name, line: it.def.line, art: it.def.art, now };
  // (Milestone 16) every facility: its level, what it does at it, and its Upgrade
  if (it.kind === 'facility' && site) spec.body = [...(spec.body ?? []), facilityLevel(site, it.id, act)];
  // (Milestone 21) the facility combos it is part of: on, or what is still missing
  if (it.kind === 'facility' && combosFor(it.id).length) spec.body = [...(spec.body ?? []), { title: 'Combos', std: 'combos', lines: combosFor(it.id).map((c) => ({ text: `${comboOn(c.id) ? '✓ ' : ''}${c.name}: ${c.what}`, right: comboOn(c.id) ? 'On' : '', color: comboOn(c.id) ? C.good : C.textMuted })).concat(combosFor(it.id).filter((c) => !comboOn(c.id)).map((c) => ({ text: `${c.name}: ${whyNoCombo(c.id)}`, color: C.textMuted }))) }];
  // (Milestone 8) every facility and room: its Condition (Reception's goes after its lists)
  if (mt && it.kind !== 'guest' && it.kind !== 'staff') {
    const sec = conditionSection(mt, it.id, act);
    spec.body = it.id === 'F01' ? [...(spec.body ?? []), sec] : [sec, ...(spec.body ?? [])];
    if (mt.isOffline(it.id)) spec.tag = { text: 'BROKEN', color: BADGE.broken.color };
  }
  return { ...stationSheet({ ...spec, accent, text: { now: 'Now' } }), key: id };
}

// --- (Milestone 8) Condition: the bar, the plain line, the job on it, Service now -------------------------------------
const condColor = (mt, id) => (mt.isOffline(id) ? BADGE.broken.color : mt.isWorn(id) ? BADGE.worn.color : C.good);
function jobWords(mt, id) {
  const j = mt.jobFor(id);
  if (!j) return null;
  const what = j.kind === 'repair' ? 'Repair' : 'Service';
  if (j.active) return { text: `${what}: ${j.who} ${j.phase === 'walk' ? 'is on the way' : `· ${minutesWords(j.left)} left`}`, color: C.actionDark };
  return { text: `${what} ${j.priority ? 'first in line (priority)' : `queued · ${ordinal(j.place)} in Maintenance’s line`}`, color: C.textMuted };
}
export function conditionSection(mt, id, act = NO_ACT) {
  const c = mt.condition(id);
  const off = mt.isOffline(id);
  const lines = [{ text: mt.words(id), color: condColor(mt, id) }];
  const job = jobWords(mt, id);
  if (job) lines.push(job);
  if (off && !job?.text.startsWith('Repair:')) lines.push({ text: `Repair: back at ${mt.rules.repairTo} for ${credits(mt.costOf(id, 'repair'))}.`, color: C.textMuted });
  const why = off ? 'Broken: the repair is in the line.' : mt.hasJob(id) ? 'Maintenance is already on it.' : c >= CONDITION.max ? 'In perfect condition.' : null;
  return {
    title: 'Condition',
    std: 'condition',
    lines,
    bars: [{ label: 'Condition', value: Math.round(c), max: CONDITION.max, color: condColor(mt, id), text: off ? 'Offline' : String(Math.round(c)) }],
    columns: 1,
    buttons: [{ id: `service:${id}`, label: 'Service now', sub: why ?? `+${mt.rules.serviceAdd} Condition · after any repairs`, cost: credits(mt.costOf(id, 'service')), accent: why ? C.textMuted : C.progress, disabled: !!why, onTap: () => act.service(id) }],
  };
}
// --- (Milestone 8) the Maintenance Shed: who works the line, their job now, the line, the breakdowns ------------------
function jobLine(mt, j) {
  const what = j.kind === 'repair' ? 'Repair' : j.auto ? 'Service (worn)' : 'Service (asked)';
  return { text: `${what} · ${targetName(j.target)}`, right: j.priority ? 'Priority' : `${Math.round(mt.condition(j.target))}`, color: j.kind === 'repair' ? BADGE.broken.color : C.text };
}
function shedSpec(it, { mt, now }) {
  const m = mt.workers[0];
  const j = m ? mt.jobOf(m.id) : null;
  const head = !m ? 'Nobody on the team works Maintenance.' : j ? `${m.name}: ${j.kind === 'repair' ? 'repairing' : 'servicing'} ${targetName(j.target)}${j.phase === 'walk' ? ' (on the way)' : ` · ${minutesWords(j.left)} left`}` : mt.onShift(m.id) ? `${m.name} is free` : `${m.name} is off shift`;
  const q = mt.queue;
  const st = mt.stats;
  const body = [
    { title: `Maintenance line (${q.length})`, std: 'mtQueue', lines: q.length ? q.slice(0, 8).map((x) => jobLine(mt, x)) : [{ text: `Nothing to do: everything is ${mt.rules.serviceBelow} or better.`, color: C.textMuted }] },
    {
      title: 'So far',
      std: 'mtStats',
      lines: [
        { text: 'Breakdowns', right: String(st.breakdowns), color: st.breakdowns ? C.bad : C.text },
        { text: 'Repairs', right: `${st.repairs} · ${credits(st.repairCost)}` },
        { text: 'Services', right: `${st.services} · ${credits(st.partsCost)}` },
        { text: `Repairs come first, then anything under ${mt.rules.serviceBelow}, lowest first. A service adds ${mt.rules.serviceAdd}; a repair brings it back at ${mt.rules.repairTo}.`, color: C.textMuted },
      ],
    },
  ];
  return { title: it.def.name, line: it.def.line, art: it.def.art, now: [head, ...now.map((x) => ({ text: x, color: C.textMuted }))], body };
}

// --- Reception: the Bookings list -----------------------------------------------------------------------------------
function receptionSpec(it, { bookings: bk, today, act, reviews = null, dateOf = null, finance = null, complaints = null }) {
  const offers = bk.offers;
  const up = bk.upcoming;
  const stay = bk.staying;
  const wait = bk.waiting ?? [];
  const needing = complaints?.needing ?? [];
  const summary = [needing.length ? plural(needing.length, 'complaint') : null, offers.length ? plural(offers.length, 'new offer') : 'No new offers', wait.length ? `${wait.length} waiting` : null, up.length ? `${up.length} arriving` : null, stay.length ? `${stay.length} staying` : null].filter(Boolean).join(' · ');
  const body = [];
  // (Milestone 7) Complaints come first: the guests still here who complained.
  const list = complaints?.open ?? [];
  if (list.length) {
    body.push({ title: `Complaints (${list.length})`, lines: needing.length ? [{ text: 'Sort them out quickly: every band they wait makes it harder.', color: C.bad }] : [], std: 'complaints' });
    body.push({ columns: 1, buttons: list.map((c) => complaintRow(c, complaints, act)) });
  }
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
    // (M20) a returning guest / Regular is marked on its offer
    body.push({
      columns: 1,
      buttons: [{ id: `offer:${o.id}`, icon: t.art, label: `${t.name}${o.repeat ? (o.regular ? ' · Regular' : ' · returning') : ''}${o.pkg ? ` · ${packageWords(o)}` : ''}`, sub: `${partyWords(o.party)} · ${plural(o.nights, 'night')} · arrives ${arrivalWords(o.arrival, today)} · wants ${ROOM_TYPES[o.roomType].name.replace(' Room', '')}`, cost: rateWords(packageRate(o)), accent: C.progress, onTap: () => act.pick(o.id) }], // (M18) a package offer: its name and price
    });
    const auto = !why && bk.autoAcceptSettings?.on ? bk.autoWhy(o.id) : null; // (Milestone 10) why Auto Accept left it
    body.push({
      lines: why ? [{ text: why, color: C.bad }] : auto ? [{ text: `Auto Accept left this for you: ${auto}`, color: C.textMuted }] : [],
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
        return { id: `booking:${b.id}`, icon: t.art, label: `${t.name} → ${roomById(b.room).name}`, sub: `Arrives ${arrivalWords(b.arrival, today)} · ${plural(b.nights, 'night')}${b.pkg ? ` · ${packageWords(b)}${b.pkgRisk ? ' AT RISK' : ''}` : ''}${b.pinned ? ' · room picked by you' : ''}`, cost: 'Change room', accent: C.progress, onTap: () => act.pick(b.id) };
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
          return { id: `review:${v.id}`, icon: t.art, label: `${starsLong(v.stars)} ${t.name}`, sub: `${roomById(v.room)?.name ?? ''} · left ${when} · ${Math.round(v.sat)}/100${v.recovered ? ' · Recovered' : v.unresolved ? ' · complaint not sorted' : ''}`, accent: v.stars >= 4 ? C.good : v.stars <= 2 ? C.bad : C.progress, onTap: () => act.review(v.id) };
        }),
      });
  }
  return {
    title: it.def.name,
    line: it.def.line,
    art: it.def.art,
    now: [summary],
    more: [...(bk.autoAcceptSettings ? [{ id: 'autoAccept', label: `Auto Accept: ${bk.autoAcceptSettings.on ? 'On' : 'Off'}`, sub: autoAcceptWords(bk), accent: bk.autoAcceptSettings.on ? C.action : C.textMuted, onTap: () => act.autoAccept() }] : []), ...(finance ? financeButtons(finance, act) : []), ...(reviews ? [{ id: 'scores', label: `Resort scores · ${starText(reviews.stars)}`, sub: `Rank ${reviews.rank.id} · the five headline scores`, accent: C.progress, onTap: () => act.scores() }] : []), { id: 'auto', label: `Auto Assign: ${bk.autoAssign ? 'On' : 'Off'}`, sub: bk.autoAssign ? 'Accepted guests get the best-fitting room' : 'You pick a room for each booking', accent: bk.autoAssign ? C.progress : C.textMuted, onTap: () => act.setAuto(!bk.autoAssign) }],
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
  return 'Broken — closed for repairs';
}
function roomSpec(world, it, { bookings: bk, today, act, hk = null, finance = null, layout = null, site = null }) {
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
    body: [
      // (Milestone 9) its noise, view and walks in three plain lines
      ...(layout ? [{ title: 'Where it is', std: 'place', lines: layout.lines(room.id) }] : []),
      { title: 'Room', lines: [finance ? { text: `${bandById(finance.bandOf(rt.id)).name} rate (Reception → Rates)`, right: rateWords(Math.round(finance.rateOf(rt.id) * (site?.rateMult(room.id) ?? 1))) } : { text: `${PRICE_BAND.name} rate`, right: rateWords(Math.round(rt.rate * PRICE_BAND.mult)) }] },
      ...(site ? [roomGrowth(site, room.id, act)] : []), // (Milestone 15) level, Loved points, Upgrade
    ],
  };
}

// (Milestone 16) a facility's level, its effect now and at the next level, and its Upgrade (cost, days, the Rank it needs).
function facilityLevel(site, id, act) {
  const lv = site.levelOf(id);
  const job = site.jobFor(id);
  const lines = [{ text: 'Level', right: `${lv} of 3` }, { text: 'Now', right: effectWords(id, lv) }];
  if (lv < 3) lines.push({ text: `At Level ${lv + 1}`, right: effectWords(id, lv + 1), color: C.textMuted });
  if (job) lines.push({ text: `Upgrading to Level ${job.level}: ${Math.round(site.progressOf(job) * 100)}% done`, color: C.actionDark });
  const why = site.whyNoUpgrade(id);
  return { title: 'Level', std: 'facilityLevel', lines, columns: 1, buttons: lv < 3 && !job ? [{ id: `upgrade:${id}`, label: `Upgrade to Level ${lv + 1}`, sub: why ?? `×${[1, 1.5, 2][lv]} effect · ${site.upgradeInfo(id).days} days`, cost: credits(site.upgradeCost(id)), accent: why ? C.textMuted : C.progress, disabled: !!why, onTap: () => act.upgrade(id) }] : [] };
}
// (Milestone 15) a room's level and Loved points, and its Upgrade (the build sheet: cost, days, Rank).
function roomGrowth(site, id, act) {
  const lv = site.levelOf(id);
  const loved = site.lovedOf(id);
  const next = LOVED.steps.find((x) => loved < x.at);
  const job = site.jobFor(id);
  const lines = [
    { text: 'Level', right: `${lv} of 3${lv > 1 ? ` · +${(lv - 1) * ROOM_LEVEL.score} Room score, +${Math.round((lv - 1) * ROOM_LEVEL.rate * 100)}% rate` : ''}` },
    { text: `Loved: ${loved} great stay${loved === 1 ? '' : 's'}`, right: site.lovedBonus(id) ? `♥ +${site.lovedBonus(id)} Room score` : next ? `♥ at ${next.at}` : '' },
  ];
  if (job) lines.push({ text: `Upgrading to Level ${job.level}: ${Math.round(site.progressOf(job) * 100)}% done`, color: C.actionDark });
  return { title: 'Level', std: 'roomLevel', lines, columns: 1, buttons: lv < 3 && !job ? [{ id: `upgrade:${id}`, label: `Upgrade to Level ${lv + 1}`, sub: site.whyNoUpgrade(id) ?? `+${ROOM_LEVEL.score} Room score, +${Math.round(ROOM_LEVEL.rate * 100)}% rate · ${site.upgradeInfo(id).days} days`, cost: credits(site.upgradeCost(id)), accent: site.whyNoUpgrade(id) ? C.textMuted : C.progress, disabled: !!site.whyNoUpgrade(id), onTap: () => act.upgrade(id) }] : [] };
}

const ordinal = (n) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;
export const minutesWords = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${String(Math.round(m % 60)).padStart(2, '0')} min` : `${Math.max(1, Math.ceil(m))} min`);

// --- a staff member (Milestone 4) -----------------------------------------------------------------------------------
function staffSpec(world, p, opts) {
  const { hk, now, mt = null, st = null, act = NO_ACT } = opts;
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
  // (Milestone 13) tier, level and XP, trait, specialisations, wage; Train and Let go
  if (m.model) body.splice(1, 1, ...growthSections(m, { st, act, finance: opts.finance, team: world.team?.map((w) => w.member).filter(Boolean) ?? [] }));
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
  // (Milestone 8) the Maintenance person: their job now and the line
  const mj = m.role === 'MG' ? mt?.jobOf(m.id) : null;
  if (mj) nowLines[0] = `${mj.phase === 'walk' ? 'Walking to' : mj.kind === 'repair' ? 'Repairing' : 'Servicing'} ${targetName(mj.target)}${mj.phase === 'walk' ? '' : ` · ${minutesWords(mj.left)} left`}`;
  if (m.role === 'MG' && mt)
    body.push({
      title: 'Maintenance',
      lines: [
        { text: 'Current job', right: mj ? `${mj.kind === 'repair' ? 'Repair' : 'Service'} · ${targetName(mj.target)}` : 'None' },
        { text: 'Jobs in the line', right: String(mt.queue.length) },
        { text: 'Shift', right: mt.onShift(m.id) ? 'On shift' : 'Off shift' },
      ],
    });
  if (st) body.splice(1, 0, ...staffWork(m, st, act)); // (Milestone 10) fatigue, priority, pattern
  if (m.absent) nowLines[0] = 'Away today: worn out, resting at home';
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
function guestSpec(world, p, { bookings: bk, today, dateOf, complaints = null, act = NO_ACT }) {
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
  if (b.priority) lines.push({ text: 'Priority service', right: 'Yes', color: C.good });
  const mine = complaints?.forBooking(b.id) ?? []; // (Milestone 7)
  const body = [{ title: 'Stay', lines }];
  if (mine.length) body.unshift({ title: 'Complaints', columns: 1, buttons: mine.map((c) => complaintRow(c, complaints, act)) });
  return { title: t.name, line: `${partyWords(b.party)} · ${room.name}`, art: t.art, now: [world.stateOf(p)], body };
}

// --- (Milestone 7) complaints ---------------------------------------------------------------------------------------
const bandWords = (n) => (n <= 0 ? 'this band' : n === 1 ? '1 band ago' : `${n} bands ago`);
function statusWords(c, cp) {
  if (c.status === 'recovered') return { text: 'Sorted out', color: C.good, tag: 'RECOVERED' };
  if (c.status === 'failed') return { text: 'No more tries', color: C.textMuted, tag: 'NO MORE TRIES' };
  if (c.status === 'unresolved') return { text: 'Never sorted out', color: C.bad, tag: 'UNRESOLVED' };
  return { text: `Waiting ${minutesWords(Math.max(0, cp.at - c.at))}`, color: C.bad, tag: 'COMPLAINT' };
}
function complaintRow(c, cp, act) {
  const t = GUEST_TYPES[c.type];
  const st = statusWords(c, cp);
  const left = c.status === 'open' && c.tries.length ? ' · 1 try left' : '';
  return { id: `complaint:${c.id}`, icon: t.art, label: `${COMPLAINT_TYPES[c.kind].name} · ${t.name}`, sub: `${roomById(c.room)?.name ?? ''} · ${st.text}${left}`, accent: c.status === 'recovered' ? C.good : c.status === 'failed' ? C.textMuted : C.bad, onTap: () => act.complaint(c.id) };
}
// One complaint: what's wrong, how long it has waited, the recovery actions (chance, cost, best fit or why not), the tries.
export function complaintSheet(cp, id, { accent = C.progress, act = NO_ACT, bookings = null } = {}) {
  const c = cp?.byId(id);
  if (!c) return null;
  const t = GUEST_TYPES[c.type];
  const kind = COMPLAINT_TYPES[c.kind];
  const st = statusWords(c, cp);
  const room = roomById(c.room);
  const b = c.closed ? null : bookings?.byId(c.booking);
  const now = [complaintLine(c), { text: `${st.text} · came in ${bandWords(bandsBetween(c, bandAtMinute(cp.at)))}`, color: st.color }];
  const last = c.tries[c.tries.length - 1];
  if (last) now.push(last.ok ? { text: `${ACTIONS[last.action].name} worked! They're happy again.`, color: C.good } : { text: `${ACTIONS[last.action].name} didn't work (−${-RECOVERY.fail} satisfaction).${c.status === 'open' ? ' You can try once more.' : ''}`, color: C.bad });
  const body = [];
  if (!c.closed) {
    const opts = cp.options(id);
    body.push({
      title: c.status === 'open' ? 'What will you do?' : 'Recovery actions',
      std: 'actions',
      lines: c.status === 'open' ? [{ text: `Each band they wait takes ${RECOVERY.perBand}% off the chance. Front Office Service: ${Math.round(cp.serviceStat())}.`, color: C.textMuted }] : [],
      columns: 1,
      buttons: opts
        .filter((o) => o.on && !o.hidden)
        .sort((x, y) => (y.best ? 1 : 0) - (x.best ? 1 : 0)) // (Milestone 8) the best fit first, so it shows without scrolling
        .map((o) => ({
          id: `recover:${o.id}`,
          label: `${o.best ? '★ ' : ''}${o.name}${o.room ? ` → ${roomById(o.room).name}` : ''}`,
          sub: o.ok ? `${o.best ? 'Best fit · ' : ''}${o.chance}% chance · ${o.line}` : o.why,
          cost: o.cost ? credits(o.cost) : 'Free',
          accent: !o.ok ? C.textMuted : o.best ? C.action : C.progress,
          disabled: !o.ok,
          onTap: () => act.recover(c.id, o.id),
        })),
    });
    const later = opts.filter((o) => !o.on && !o.hidden);
    if (later.length) body.push({ title: 'Coming later', std: 'later', lines: later.map((o) => ({ text: `${o.name}: ${o.why}`, color: C.textMuted })) });
  }
  if (c.tries.length) body.push({ title: 'Tried', std: 'tries', lines: c.tries.map((x) => ({ text: `${ACTIONS[x.action].name}${x.cost ? ` (${credits(x.cost)})` : ''}`, right: `${x.ok ? 'Worked' : "Didn't work"} · ${x.chance}%`, color: x.ok ? C.good : C.bad })) });
  body.push({ title: 'How recovery works', std: 'how', lines: [{ text: `Put right, the problem stops counting against their review and they leave ${RECOVERY.bonus} points happier (${RECOVERY.bonus + RECOVERY.sameBand} if fixed in the band it came in). Still not sorted when they check out: REP ${REP_UNRESOLVED}.`, color: C.textMuted }] });
  body.push({ columns: 1, buttons: [{ id: 'back', label: '‹ Back to Reception', accent: C.textMuted, onTap: () => act.open('F01') }] });
  const main = b ? [{ id: `guest:${b.id}`, label: 'See the guest', icon: t.art, onTap: () => act.open(b.id) }] : [];
  const tagColor = c.status === 'recovered' ? C.good : c.status === 'failed' ? C.textMuted : C.bad;
  return { ...stationSheet({ title: kind.name, line: `${t.name} · ${room?.name ?? ''} · ${partyWords(c.party)}`, art: t.art, tag: { text: st.tag, color: tagColor }, accent, now, main, body, text: { now: 'Now' } }), key: `complaint:${id}` };
}

// --- the room picker (manual pinning) ------------------------------------------------------------------------------
export function pickRoomSheet(bk, forId, { accent = C.progress, today = 0, act = NO_ACT, finance = null } = {}) {
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
        cost: rateWords(finance ? finance.rateOf(r.typeId) : ROOM_TYPES[r.typeId].rate),
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
      { lines: [why ? { text: why, color: C.bad } : `Wants ${aOrAn(ROOM_TYPES[x.roomType].name)} ${ROOM_TYPES[x.roomType].name}. ${isOffer ? 'Picking a room accepts the booking in that room.' : 'The room you pick is kept for them.'}`, ...(best && bk.fitParts ? [{ text: `Auto Assign picks ${best.name}: ${fitPartsWords(bk.fitParts(x, best))}`, color: C.textMuted }] : [])] },
      { title: 'Rooms', columns: 1, buttons: rows },
      { columns: 1, buttons: [{ id: 'back', label: '‹ Back to Reception', accent: C.textMuted, onTap: () => act.open('F01') }] },
    ],
  };
}

// --- (Milestone 5) the Resort sheet: star rating, Rank / REP, the five headline scores ------------------------------
export function resortScoresSheet(rv, { today = 0, accent = C.progress, act = NO_ACT, finance = null } = {}) {
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
  const more = finance ? financeButtons(finance, act) : []; // (Milestone 6)
  return { ...stationSheet({ title: 'Resort scores', line: 'Your star rating, Rank and headline scores.', art: 'facility_f01', accent, now, more, body, text: { now: 'Now' } }), key: 'scores' };
}

// --- (Milestone 6) Rates: a pricing band per room type ---------------------------------------------------------------
const ratesSub = (fin) => Object.keys(ROOM_TYPES).map((rt) => `${ROOM_TYPES[rt].name.replace(' Room', '')}: ${bandById(fin.bandOf(rt)).name}`).join(' · ');
function financeButtons(fin, act) {
  return [
    ...(act.panel ? [{ id: 'packages', label: 'Packages', sub: 'Room + extras at one price', accent: C.progress, onTap: () => act.panel('packages') }] : []), // (Milestone 18)
    { id: 'rates', label: 'Rates', sub: ratesSub(fin), accent: C.progress, onTap: () => act.rates() },
    { id: 'finance', label: `Finance · ${credits(fin.cash)}`, sub: fin.debt > 0 ? `Emergency Credit ${credits(fin.debt)}` : 'Income, costs and profit', accent: fin.debt > 0 ? C.bad : C.progress, onTap: () => act.finance() },
  ];
}
const pct = (k) => `${Math.round(k * 100)}%`;
// The guest types that ask for this room type (data/bookings.js wants), most likely first.
// (Milestone 18) only the guest types that can come now, with the rooms built (src/systems/guests.js)
const askers = (rt) => typesNow().filter((g) => (wantsOf(g)[rt] ?? 0) > 0).sort((a, b) => wantsOf(b)[rt] - wantsOf(a)[rt]);
// service: the rolling 28-day Service (null before any review) — Premium under 70 loses more guests.
export function ratesSheet(fin, { accent = C.progress, act = NO_ACT, service = null } = {}) {
  const body = [];
  for (const rt of Object.keys(ROOM_TYPES)) {
    const t = ROOM_TYPES[rt];
    const n = ROOMS.filter((r) => r.typeId === rt).length;
    const cur = fin.bandOf(rt);
    body.push({
      title: `${t.name} · ${plural(n, 'room')} · ${rateWords(fin.rateOf(rt))}`,
      std: `rates:${rt}`,
      lines: [
        ...askers(rt).map((g) => {
          const k = offerChance({ type: g.id, rate: fin.rateOf(rt) }, { band: cur, service });
          return { text: `${g.name} (spends about ${g.budget} a night)`, right: k >= 1 ? 'all book' : `${pct(k)} book`, color: k >= 1 ? C.good : k < 0.75 ? C.bad : C.text };
        }),
        // (Milestone 25) yield: the band its last 28 nights suggest
        ...(n && fin.suggestBand?.(rt, service) ? [{ text: `Suggested: ${bandById(fin.suggestBand(rt, service)).name} (${pct(fin.occupancyOf(rt))} sold over 28 nights)`, color: fin.suggestBand(rt, service) === cur ? C.good : C.action }] : []),
      ],
      columns: 3,
      buttons: PRICE_BANDS.map((b) => ({ id: `band:${rt}:${b.id}`, label: b.id === cur ? `✓ ${b.name}` : b.name, sub: rateWords(bandRate(rt, b.id)), accent: b.id === cur ? C.action : C.textMuted, onTap: () => act.setBand(rt, b.id) })),
    });
  }
  const how = PRICE_BANDS.map((b) => ({ text: `${b.name} (${Math.round(b.mult * 100)}%): ${b.line}`, color: C.textMuted }));
  how.push({ text: 'A new price is used for new offers. Guests already booked keep the rate they booked at. Guests judge Value by the price they pay.', color: C.textMuted });
  if (service != null && service < 70) how.push({ text: `Service is ${Math.round(service)} (under 70): Premium loses even more guests.`, color: C.bad });
  body.push({ title: 'How prices work', std: 'how', lines: how });
  return { ...stationSheet({ title: 'Rates', line: 'Pick a price for each kind of room.', art: 'facility_f01', accent, now: [ratesSub(fin)], body, text: { now: 'Now' } }), key: 'rates' };
}

// --- (Milestone 6) Finance: cash, Emergency Credit, income and costs by line, the last months' profit -----------------
function linesSection(title, lines, std) {
  const income = INCOME_LINES.reduce((a, k) => a + (lines[k] ?? 0), 0);
  const costs = COST_LINES.reduce((a, k) => a + (lines[k] ?? 0), 0);
  const rows = [
    ...INCOME_LINES.filter((k) => lines[k]).map((k) => ({ text: LINES[k].name, right: signed(lines[k]), color: C.good })),
    ...COST_LINES.filter((k) => lines[k]).map((k) => ({ text: LINES[k].name, right: signed(-lines[k]) })),
  ];
  if (!rows.length) rows.push({ text: 'Nothing yet.', color: C.textMuted });
  else rows.push({ text: 'Profit', right: signed(income - costs), color: income - costs < 0 ? C.bad : C.good });
  if (lines.creditDraw) rows.push({ text: LINES.creditDraw.name, right: signed(lines.creditDraw), color: C.textMuted });
  if (lines.creditRepay) rows.push({ text: LINES.creditRepay.name, right: signed(-lines.creditRepay), color: C.textMuted });
  return { title, lines: rows, std };
}
export function financeSheet(fin, { today = 0, accent = C.progress } = {}) {
  const m = fin.month;
  const cr = fin.credit;
  const now = [`Cash: ${credits(fin.cash)}`, fin.debt > 0 ? { text: `Emergency Credit: ${credits(fin.debt)} owed (limit ${credits(cr.ceiling)}) · ${CREDIT.interestPct}% a month`, color: C.bad } : { text: 'No debt', color: C.good }];
  const body = [linesSection('Today so far', fin.dayLines(today), 'today'), linesSection(`This month (Month ${m.n})`, m.lines, 'month')];
  // (Milestone 25) the Rescue Investor's year, and the profit history across years
  if (fin.rescue?.active) body.push({ title: 'Rescue Investor', std: 'rescue', lines: [{ text: `Your debt was cut to 35% of the limit. They take 8% of revenue until Day ${fin.rescue.shareUntil + 1}.`, color: C.bad }] });
  if (fin.years?.length || fin.yearNow) body.push({ title: 'Years', std: 'years', lines: [...(fin.years ?? []).map((y) => ({ text: `Year ${y.n}: income ${credits(y.income)} · costs ${credits(y.costs)}`, right: signed(y.profit), color: y.profit < 0 ? C.bad : C.good })), ...(fin.yearNow ? [{ text: `Year ${fin.yearNow.n} so far: income ${credits(fin.yearNow.income)} · costs ${credits(fin.yearNow.costs)}`, right: signed(fin.yearNow.profit), color: C.textMuted }] : [])] });
  const shown = fin.months.slice(-HISTORY.chartMonths);
  const top = Math.max(1, ...shown.map((x) => Math.abs(x.profit)));
  body.push({
    title: `Profit, last ${HISTORY.chartMonths} months`,
    std: 'chart',
    lines: shown.length ? [] : [{ text: 'Each month’s profit shows here when the month ends.', color: C.textMuted }],
    bars: shown.map((x) => ({ label: `Month ${x.n}`, value: Math.abs(x.profit), max: top, color: x.profit < 0 ? C.bad : C.good, text: signed(x.profit) })),
  });
  body.push({
    title: 'Emergency Credit',
    std: 'credit',
    lines: [
      { text: 'Owed now', right: credits(fin.debt), color: fin.debt > 0 ? C.bad : C.text },
      { text: 'The most you can owe', right: credits(cr.ceiling) },
      { text: `If cash runs out, the bank lends what you need, up to 20,000 or a quarter of everything you have earned (at most 250,000). It costs ${CREDIT.interestPct}% a month and is paid back by itself once cash allows.`, color: C.textMuted },
    ],
  });
  body.push({ title: 'When money moves', std: 'when', lines: [{ text: 'Rooms are paid at check-out. The Snack Café takes 12 Cr a guest each evening. Upkeep and supplies are paid each night, wages at the end of each month. Repairs and maintenance parts are paid when the job starts.', color: C.textMuted }] });
  return { ...stationSheet({ title: 'Finance', line: 'Cash, income, costs and profit.', art: 'facility_f01', accent, now, body, text: { now: 'Now' } }), key: 'finance' };
}

// --- (Milestone 10) the team: Staff Wellbeing, each department's priority, everyone's pattern and fatigue ------------
const PATTERN_NAMES = { day: 'Day', late: 'Late', night: 'Night' };
export function fatigueWords(f, absent = false) {
  if (absent) return { text: 'Away today (worn out)', color: C.bad };
  if (f > FATIGUE.worn) return { text: `Worn out · ${Math.round(f)} (works at ${Math.round(FATIGUE.wornShare * 100)}%)`, color: C.bad };
  if (f > FATIGUE.tired) return { text: `Tired · ${Math.round(f)} (works at ${Math.round(FATIGUE.tiredShare * 100)}%)`, color: C.bad };
  return { text: `${f < 40 ? 'Rested' : 'Busy'} · ${Math.round(f)}`, color: f < 40 ? C.good : C.text };
}
function teamSection(st, act) {
  const body = [];
  const wb = st.wellbeing();
  body.push({ title: `Staff Wellbeing ${Math.round(wb)}`, std: 'wellbeing', lines: [{ text: 'Each department works to its priority. Higher gets more done but tires people; over 75 tired they work slower, over 90 they may miss a day.', color: C.textMuted }] });
  for (const role of Object.keys(ROLES)) {
    const rows = st.rows.filter((r) => r.role === role);
    if (!rows.length) continue;
    const cur = st.priority(role);
    const pr = PRIORITIES.find((p) => p.id === cur);
    const em = cur === 'emergency' && st.streak(role) >= EMERGENCY.maxDays ? [{ text: `Emergency for ${plural(st.streak(role), 'day')}: Wellbeing is hurting twice as much.`, color: C.bad }] : [];
    body.push({
      title: `${ROLES[role].name} · ${pr.name}`,
      std: `prio:${role}`,
      lines: [{ text: pr.line, color: C.textMuted }, ...em],
      columns: 2,
      buttons: PRIORITIES.map((p) => ({ id: `prio:${role}:${p.id}`, label: p.id === cur ? `✓ ${p.name}` : p.name, sub: `${Math.round(p.target * 100)}% workload`, accent: p.id === cur ? (p.id === 'emergency' ? C.bad : C.action) : C.textMuted, onTap: () => act.setPriority(role, p.id) })),
    });
    body.push({
      columns: 1,
      buttons: rows.map((r) => {
        const fw = fatigueWords(r.fatigue, r.absent);
        return { id: `member:${r.id}`, icon: staffById(r.id)?.art ?? null, label: r.name, sub: `${PATTERN_NAMES[r.pattern]}${r.pinned ? ' (set by you)' : ''} · ${fw.text}`, accent: fw.color === C.bad ? C.bad : C.progress, onTap: () => act.open(r.id) };
      }),
    });
  }
  return body;
}
function serviceBlockSpec(it, { st, now, act, team = null, finance = null, today = 0, items = null }) {
  const tired = st.rows.filter((r) => r.absent || r.fatigue > FATIGUE.tired).length;
  // (Milestone 14) the Staff Items store, one tap from the team
  const main = items ? [{ id: 'items', icon: 'ui_35', label: `Staff Items (${items.inventory.length})`, sub: items.inbox.length ? `${items.inbox.length} waiting in the Inbox` : 'Give items to raise stats for good', onTap: () => act.items() }] : [];
  return { title: it.def.name, line: it.def.line, art: it.def.art, main, now: [tired ? `${plural(tired, 'person', 'people')} tired or away` : 'The team is rested', ...now.map((x) => ({ text: x, color: C.textMuted }))], body: [...teamSection(st, act), ...(team ? hireSection(team, finance, act, st, today) : [])] };
}
// (Milestone 13) Hire: this week's applicants (4, from the people the stage allows), each at their tier's fee and wage;
// the next list's day; and the book of all 50 staff.
function hireSection(team, finance, act, st, today) {
  const cap = st.cap;
  const full = team.length >= cap;
  const pool = st.pool;
  const left = Math.max(0, st.nextPoolDay() - today);
  return [
    {
      title: `Hire (${team.length} of ${cap} people)`,
      std: 'hire',
      lines: [{ text: full ? `Your team is full (${cap} people).` : pool.length ? 'Looking for work this week. A fee now, then their wage each month.' : 'Nobody new is looking for work this week.', color: full ? C.bad : C.textMuted }, { text: 'New applicants', right: left <= 1 ? 'tomorrow' : `in ${left} days` }],
      columns: 1,
      buttons: [
        ...pool.map((id) => {
          const e = staffDef(id);
          const why = hireWhy(team, id, finance?.cash ?? Infinity, st);
          return { id: `hire:${id}`, icon: e.art, label: `${e.name} · ${TIERS[e.tier].name}`, sub: why ?? `${ROLES[e.role].name} · ${e.trait}: ${traitWords(e.effect)} · ${credits(WAGES[e.tier])} a month`, cost: credits(hireFee(id)), accent: why ? C.textMuted : C.action, disabled: !!why, onTap: () => act.hire(id) };
        }),
        { id: 'staffBook', label: 'All 50 staff', sub: 'Who is on the team, who can apply, and who is still a secret', accent: C.progress, onTap: () => act.staffBook() },
      ],
    },
  ];
}
// (Milestone 13) a trait's effect in plain words: "+4% check-in speed" (and when a later system makes it work).
export function traitWords(e) {
  const k = TRAIT_KEYS[e.key];
  const n = e.key === 'hkGuard' ? 'stops the first housekeeping slip each week' : e.key === 'mgGuard' ? 'stops the first breakdown each month' : `${e.pct > 0 ? '+' : '−'}${Math.abs(e.pct)}% ${k?.words ?? e.key}`;
  return k?.later ? `${n} (works from ${k.later})` : n;
}
// (Milestone 13) tier, level, the XP bar, trait, specialisations, wage; Train (once a week) and Let go (two taps).
function growthSections(m, { st, act, finance, team }) {
  const d = staffDef(m.id);
  const top = m.level >= XP.cap;
  const lines = [
    { text: 'Tier', right: TIERS[m.tier]?.name ?? 'Standard' },
    { text: 'Level', right: `${m.level} of ${XP.cap}` },
    { text: 'Wage', right: `${credits(WAGES[m.tier] ?? WAGES.standard)} a month` },
  ];
  if (d) lines.push({ text: `Trait: ${d.trait}`, right: traitWords(d.effect) });
  if (d?.signatureWords) lines.push({ text: d.signatureWords, color: C.gold }); // (Milestone 27b) Aaron's signature in plain words
  if (d?.title) lines.push({ text: d.title, color: C.textMuted });
  for (const x of m.specs ?? []) lines.push({ text: `Specialisation: ${x.name}`, right: x.line });
  if (!st) lines.push({ text: 'Work pattern', right: patternWords(m.pattern) }); // (no team side: the pattern here)
  const out = [{ title: 'Work', std: 'growth', lines, bars: [{ label: 'XP', value: top ? 1 : m.model.xp, max: top ? 1 : xpToNext(m.level), color: C.progress, text: top ? 'Top level' : `${Math.floor(m.model.xp)} / ${xpToNext(m.level)}` }] }];
  const due = specChoice(m);
  if (due)
    out.push({
      title: `Level ${due.level}: pick a specialisation`,
      std: 'spec',
      lines: [{ text: 'Choose one. It stays for good.', color: C.textMuted }],
      columns: 1,
      buttons: due.options.map((o) => ({ id: `spec:${o.id}`, label: o.name, sub: o.line, accent: C.gold, onTap: () => act.spec(m.id, o.id) })),
    });
  if (st) {
    const tw = st.trainWhy(m.id, finance?.cash ?? Infinity);
    const fw = fireWhy(team, m.id);
    out.push({
      std: 'staffActions',
      columns: 1,
      buttons: [
        { id: `train:${m.id}`, label: 'Train', sub: tw ?? `+${XP.training} XP · once a week`, cost: credits(TRAINING.fee), accent: tw ? C.textMuted : C.progress, disabled: !!tw, onTap: () => act.train(m.id) },
        { id: `fire:${m.id}`, label: act.confirming?.() === `fire:${m.id}` ? `Tap again to let ${m.name} go` : 'Let go', sub: fw ?? 'They leave the team today (no refund of the hiring fee).', accent: C.bad, disabled: !!fw, onTap: () => act.fire(m.id) },
      ],
    });
  }
  return out;
}
// (Milestone 13) the book of all 50 staff: on the team, could apply (and from which stage), or ??? (Legendary / Secret).
// (Milestone 27) known(id): that Legendary / Secret person's secret has been found (they show by name from then on)
export function staffBookSheet(team, { st = null, accent = C.progress, act = NO_ACT, stage = 'roadside', known = () => false } = {}) {
  const sections = [];
  for (const role of Object.keys(ROLES)) {
    const people = STAFF.filter((x) => x.role === role);
    sections.push({
      title: ROLES[role].name,
      std: `book:${role}`,
      columns: 1,
      buttons: people.map((x) => {
        const on = team.some((m) => m.id === x.id);
        if (!HIREABLE_TIERS.includes(x.tier)) {
          if (!on && !st?.pool.includes(x.id) && !known(x.id)) return { id: `book:${x.id}`, icon: 'staff_silhouette', label: '???', sub: WHEN_WORDS[x.when], accent: C.textMuted, disabled: true, onTap: () => {} };
          const sub = on ? 'On your team' : st?.pool.includes(x.id) ? 'Looking for work now (a secret found)' : 'Found through a secret';
          return { id: `book:${x.id}`, icon: x.art, label: `${on ? '✓ ' : ''}${x.name} · ${TIERS[x.tier].name}`, sub: `${sub} · ${x.trait}: ${traitWords(x.effect)}`, accent: on ? C.good : C.gold, disabled: true, onTap: () => {} };
        }
        const need = WHEN_STAGE[x.when];
        const open = stageIndex(stage) >= stageIndex(need);
        const sub = on ? 'On your team' : st?.pool.includes(x.id) ? 'Looking for work this week' : open ? 'May apply in a later week' : `Applies from the ${stageById(need).name} stage`;
        return { id: `book:${x.id}`, icon: x.art, label: `${on ? '✓ ' : ''}${x.name} · ${TIERS[x.tier].name}`, sub: `${sub} · ${x.trait}: ${traitWords(x.effect)}`, accent: on ? C.good : open ? C.action : C.textMuted, disabled: true, onTap: () => {} };
      }),
    });
  }
  sections.push({ columns: 1, buttons: [{ id: 'back', label: '‹ Back to the team', accent: C.textMuted, onTap: () => act.open('F02') }] });
  return { key: 'staffBook', title: 'All 50 staff', subtitle: 'Legendary and Secret staff stay hidden until their secrets are found.', art: 'facility_f02', accent, sections };
}
// A staff member's (Milestone 10) part: fatigue, their department's priority, and their pattern (Auto or pinned).
function staffWork(m, st, act) {
  const row = st.rows.find((r) => r.id === m.id);
  const pin = st.pinned(m.id);
  const pr = PRIORITIES.find((p) => p.id === st.priority(m.role));
  return [
    { title: 'Fatigue', std: 'fatigue', lines: [fatigueWords(row?.fatigue ?? 0, row?.absent), { text: 'Department priority', right: pr.name }] },
    {
      title: `Work pattern · ${PATTERN_NAMES[m.pattern]}`,
      std: 'pattern',
      lines: [{ text: pin ? 'Set by you: Auto Schedule leaves it alone.' : 'Auto Schedule picks it each day.', color: C.textMuted }],
      columns: 2,
      buttons: [
        { id: 'pattern:auto', label: pin ? 'Auto' : '✓ Auto', accent: pin ? C.textMuted : C.action, onTap: () => act.pin(m.id, null) },
        ...Object.keys(PATTERN_NAMES).map((p) => ({ id: `pattern:${p}`, label: pin === p ? `✓ ${PATTERN_NAMES[p]}` : PATTERN_NAMES[p], sub: PATTERNS[p].bands.map((b) => b[0].toUpperCase() + b.slice(1)).join(', '), accent: pin === p ? C.action : C.textMuted, onTap: () => act.pin(m.id, p) })),
      ],
    },
    { columns: 1, buttons: [{ id: 'team', label: 'Team & priorities', sub: 'The Motel Service Block', accent: C.progress, onTap: () => act.open('F02') }] },
  ];
}

// --- (Milestone 10) Auto Accept: on / off and the filters (bible §27B) ------------------------------------------------
export function autoAcceptSheet(bk, { accent = C.progress, act = NO_ACT } = {}) {
  const f = bk.autoAcceptSettings;
  const set = (patch) => () => act.autoSet(patch);
  const types = f.types ?? Object.keys(GUEST_TYPES);
  const sections = [
    {
      lines: [{ text: f.on ? 'New offers that pass your filters are accepted by themselves, each in the room Auto Assign picks. Anything left waits for you.' : 'Off: you accept or decline every offer yourself.', color: C.textMuted }],
      columns: 1,
      buttons: [bk.autoAcceptLocked && !f.on ? { id: 'aa:on', label: 'Auto Accept: locked', sub: 'Needs the research Package Marketing (R32, Marketing & Prestige)', accent: C.textMuted, disabled: true, onTap: () => {} } : { id: 'aa:on', label: `Auto Accept: ${f.on ? 'On' : 'Off'}`, sub: f.on ? 'Tap to turn it off' : 'Tap to turn it on', accent: f.on ? C.action : C.textMuted, onTap: set({ on: !f.on }) }], // (M17: unlocks through R32)
    },
    { title: 'Room they ask for', std: 'aa:rate', columns: 3, buttons: AUTO_ACCEPT.minRates.map((m) => ({ id: `aa:rate:${m.id}`, label: f.minRate === m.id ? `✓ ${m.name}` : m.name, accent: f.minRate === m.id ? C.action : C.textMuted, onTap: set({ minRate: m.id }) })) },
    {
      title: 'Guests',
      std: 'aa:types',
      columns: 1,
      buttons: Object.values(GUEST_TYPES).filter((g) => canCome(g) || !types.includes(g.id)).map((g) => { // (M18) the types that can come now
        const on = types.includes(g.id);
        const next = on ? types.filter((x) => x !== g.id) : [...types, g.id];
        return { id: `aa:type:${g.id}`, icon: g.art, label: `${on ? '✓ ' : ''}${g.name}`, sub: on ? 'Accepted' : 'Left for you', accent: on ? C.action : C.textMuted, disabled: on && types.length === 1, onTap: set({ types: next }) };
      }),
    },
    { title: 'Fill at most', std: 'aa:occ', columns: 3, buttons: AUTO_ACCEPT.maxOccs.map((n) => ({ id: `aa:occ:${n}`, label: f.maxOcc === n ? `✓ ${n}%` : `${n}%`, accent: f.maxOcc === n ? C.action : C.textMuted, onTap: set({ maxOcc: n }) })) },
  ];
  for (const rt of Object.keys(ROOM_TYPES)) {
    const n = f.reserve?.[rt] ?? 0;
    const have = ROOMS.filter((r) => r.typeId === rt).length;
    const max = Math.min(AUTO_ACCEPT.reserveMax, have);
    sections.push({
      title: `Keep ${ROOM_TYPES[rt].name}s free: ${n}`,
      std: `aa:keep:${rt}`,
      columns: 2,
      buttons: [
        { id: `aa:keep:${rt}:-`, label: '− One fewer', accent: C.textMuted, disabled: n <= 0, onTap: set({ reserve: { ...f.reserve, [rt]: n - 1 } }) },
        { id: `aa:keep:${rt}:+`, label: '+ One more', accent: C.progress, disabled: n >= max, onTap: set({ reserve: { ...f.reserve, [rt]: n + 1 } }) },
      ],
    });
  }
  sections.push({ title: 'Expected satisfaction at least', std: 'aa:sat', lines: [{ text: 'How the stay would score if it went well, in the room Auto Assign gives.', color: C.textMuted }], columns: 2, buttons: AUTO_ACCEPT.minSats.map((n) => ({ id: `aa:sat:${n ?? 'off'}`, label: f.minSat === n ? `✓ ${n ?? 'Off'}` : `${n ?? 'Off'}`, accent: f.minSat === n ? C.action : C.textMuted, onTap: set({ minSat: n }) })) });
  sections.push({
    title: 'Take first',
    std: 'aa:prefer',
    lines: [{ text: 'No repeat or package guests come to the Roadside yet.', color: C.textMuted }],
    columns: 2,
    buttons: [
      { id: 'aa:repeat', label: `Repeat guests: ${f.preferRepeat ? 'On' : 'Off'}`, accent: f.preferRepeat ? C.action : C.textMuted, onTap: set({ preferRepeat: !f.preferRepeat }) },
      { id: 'aa:package', label: `Package guests: ${f.preferPackage ? 'On' : 'Off'}`, accent: f.preferPackage ? C.action : C.textMuted, onTap: set({ preferPackage: !f.preferPackage }) },
    ],
  });
  sections.push({ columns: 1, buttons: [{ id: 'back', label: '‹ Back to Reception', accent: C.textMuted, onTap: () => act.open('F01') }] });
  return { key: 'autoAccept', title: 'Auto Accept', subtitle: 'Let offers you’d say yes to book themselves.', art: 'facility_f01', accent, sections };
}
export const autoAcceptWords = (bk) => {
  const f = bk.autoAcceptSettings;
  if (!f.on) return 'You answer every offer';
  const bits = [f.types ? plural(f.types.length, 'guest type') : 'every guest', f.maxOcc < 100 ? `up to ${f.maxOcc}% full` : null, f.minSat != null ? `${f.minSat}+ expected` : null, f.minRate !== 'any' ? AUTO_ACCEPT.minRates.find((m) => m.id === f.minRate).name : null].filter(Boolean);
  const words = bits.join(' · ');
  return words[0].toUpperCase() + words.slice(1);
};
// Fit's parts in plain words (the picker's Auto Assign line).
const FIT_WORDS = { type: 'room type', capacity: 'beds', view: 'view', noise: 'quiet', distance: 'walks', price: 'price' };
export const fitPartsWords = (q) => Object.keys(FIT_WORDS).map((k) => `${FIT_WORDS[k]} ${Math.round(q[k])}`).join(' · ');
