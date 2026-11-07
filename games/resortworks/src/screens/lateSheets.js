// The sheets of the systems from Milestone 18 on (plain specs for core/ui/BottomSheet, like resortSheets.js). The screen
// opens one with act.panel(key, arg) and does what its buttons ask with act.do(op, ...args) (LATE_OPS below: each
// returns { why } to show one plain line, or { say }, and the sheet is drawn again from the live state).
//   LATE_SHEETS[key](run, arg, { act, accent, today, dateOf }) → spec
//   LATE_OPS[op](run, ...args) → { why?, say? }
//   office    — the Resort Office (the series Menu button, bible §0.2): every manager's sheet in one list, with the
//               next step to take
//   packages  — (Milestone 18) the 10 packages: price, stay, inclusions, demand; put each on sale; places today
import { THEME } from '../../../../core/Theme.js';
import { PACKAGES, packageById } from '../../data/packages.js';
import { GUEST_TYPES } from '../../data/bookings.js';
import { credits } from '../systems/finance.js';
import { facilityInfo } from '../../data/facilities.js';
import { EVENTS, eventById, RESULT, ROCCO } from '../../data/events.js';
import { memoryById, REGULAR } from '../../data/guestbook.js';
import { ROOM_TYPES } from '../../data/bookings.js';

const C = THEME.color;
const pct = (x) => `${x > 0 ? '+' : ''}${Math.round(x * 100)}%`;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const nightsWords = (p) => (p.nights[0] === p.nights[1] ? plural(p.nights[0], 'night') : `${p.nights[0]}–${p.nights[1]} nights`);
const back = (act) => ({ columns: 1, buttons: [{ id: 'panel:back', label: '‹ Resort Office', accent: C.textMuted, onTap: () => act.panel('office') }] });

// The Resort Office: one row per manager's sheet (each with its one-line state), the next step first.
function officeSheet(run, arg, { act, accent }) {
  const rows = [];
  const pk = run.packages;
  if (pk) {
    const on = pk.onSale().length;
    const open = PACKAGES.filter((p) => !pk.whyOff(p.id)).length;
    rows.push({ id: 'office:packages', icon: 'ui_26', label: 'Packages', sub: `${on} on sale · ${open} of 10 can be sold`, accent: C.progress, onTap: () => act.panel('packages') });
  }
  const evs = run.events;
  if (evs) {
    const wait = evs.enquiries.length;
    const ch = evs.pendingChoice;
    rows.push({ id: 'office:events', icon: 'ui_22', label: 'Events', sub: ch ? `Rocco needs a choice: ${eventById(ch.ev).name}` : `${plural(wait, 'enquiry', 'enquiries')} · ${evs.booked.length} booked · ${evs.stats.held} held`, accent: ch ? C.action : C.progress, onTap: () => act.panel(ch ? 'eventChoice' : 'events', ch?.id ?? null) });
  }
  const gb = run.guestbook;
  if (gb) rows.push({ id: 'office:guestbook', icon: 'ui_21', label: 'Guestbook', sub: `${plural(gb.guests.length, 'guest')} · ${plural(gb.regulars.length, 'Regular')} · ${plural(gb.stats.returns, 'return')}`, accent: C.progress, onTap: () => act.panel('guestbook') });
  const next = nextStep(run);
  return {
    key: 'panel:office',
    title: 'Resort Office',
    subtitle: 'Everything you manage, in one place.',
    art: 'ui_05',
    accent,
    sections: [{ lines: next ? [{ text: `Next: ${next}`, color: C.action }] : [] }, { title: 'Manage', std: 'office:rows', columns: 1, buttons: rows }],
  };
}
// One plain next step (the series hint line).
export function nextStep(run) {
  const ch = run.events?.pendingChoice;
  if (ch) return `Rocco needs your call at the ${eventById(ch.ev).name} (Events).`;
  if (run.events?.enquiries.length) return 'answer an event enquiry (Events).';
  const pk = run.packages;
  if (pk && !pk.onSale().length && PACKAGES.some((p) => !pk.whyOff(p.id))) return 'put a package on sale (Packages).';
  return null;
}

function packagesSheet(run, arg, { act, accent, today = 0 }) {
  const pk = run.packages;
  const st = pk.stats;
  const sections = [{ lines: [{ text: 'A package is a room plus extras at one price: the room’s nightly rate × the package’s multiplier. Its places are kept for the guest when you accept.', color: C.textMuted }, { text: 'Sold so far', right: String(Object.values(st.sold).reduce((t, n) => t + n, 0)) }, { text: 'Extras given / missed', right: `${st.delivered} / ${st.failed}` }] }];
  for (const p of PACKAGES) {
    const why = pk.whyOff(p.id);
    const on = pk.isOn(p.id);
    const incl = p.incl.map((i) => i.name).join(' + ');
    const sub = why ?? `${nightsWords(p)} · ×${p.mult.toFixed(2)} the room rate · ${incl} · ${p.demandWords}${st.sold[p.id] ? ` · ${st.sold[p.id]} sold` : ''}`;
    sections.push({
      std: `pkg:${p.id}`,
      columns: 1,
      buttons: [{ id: `pkg:${p.id}`, icon: p.art, label: `${on ? '✓ ' : ''}${p.name}`, sub, cost: why ? 'Locked' : on ? 'On sale' : 'Off', accent: why ? C.textMuted : on ? C.good : C.action, disabled: !!why, onTap: () => act.do('pkgToggle', p.id) }],
    });
  }
  // places reserved today at each facility that gives package places
  const facs = [...new Set(PACKAGES.flatMap((p) => p.incl.flatMap((i) => i.facs ?? [])))].filter((f) => pk.placesFor(f) > 0);
  if (facs.length) sections.push({ title: 'Package places today', std: 'pkg:places', lines: facs.map((f) => ({ text: facilityInfo(f)?.name ?? f, right: `${pk.reservedOn(today, f)} of ${pk.placesFor(f)}` })) });
  sections.push(back(act));
  return { key: 'panel:packages', title: 'Packages', subtitle: 'Bundles that bring the guests they suit.', art: 'ui_26', accent, sections };
}

const fac = (id) => facilityInfo(id)?.name ?? id;
const dayWords = (d, today) => (d <= today ? 'today' : d === today + 1 ? 'tomorrow' : `in ${d - today} days`);
// (Milestone 19) Events: enquiries to answer, what is booked or on now, the results; and every event's needs.
function eventsSheet(run, arg, { act, accent, today = 0 }) {
  const evs = run.events;
  const sections = [{ lines: [{ text: 'Groups book the resort for a few days. The venue and rooms are kept for them; they pay the fee by how well it goes.', color: C.textMuted }, { text: 'Events held', right: String(evs.stats.held) }] }];
  const ch = evs.pendingChoice;
  if (ch) sections.push({ columns: 1, buttons: [{ id: `evchoice:${ch.id}`, icon: ROCCO.art, label: `Rocco: ${eventById(ch.ev).choice.q}`, sub: 'Tap to choose (or skip)', accent: C.action, onTap: () => act.panel('eventChoice', ch.id) }] });
  sections.push({ title: `Enquiries (${evs.enquiries.length})`, std: 'ev:enquiries', lines: evs.enquiries.length ? [] : [{ text: 'Enquiries come in some Mondays for the events your facilities can hold.', color: C.textMuted }] });
  for (const q of evs.enquiries) {
    const e = eventById(q.ev);
    const why = evs.whyNoBook(q.id);
    sections.push({ columns: 1, buttons: [{ id: `enq:${q.id}`, icon: e.art, label: e.name, sub: `${q.group} guests · ${plural(q.nights, 'night')} · starts ${dayWords(q.date, today)} · Success at ${e.success}, Great at ${e.great}`, cost: credits(q.fee), accent: C.progress, onTap: () => {} }] });
    sections.push({ lines: why ? [{ text: why, color: C.bad }] : [], columns: 2, buttons: [{ id: `evaccept:${q.id}`, label: 'Book it', accent: C.action, disabled: !!why, onTap: () => act.do('evAccept', q.id) }, { id: `evdecline:${q.id}`, label: 'Decline', accent: C.textMuted, onTap: () => act.do('evDecline', q.id) }] });
  }
  if (evs.booked.length)
    sections.push({
      title: 'Booked and on now',
      std: 'ev:booked',
      columns: 1,
      buttons: evs.booked.map((x) => {
        const e = eventById(x.ev);
        return { id: `evb:${x.id}`, icon: e.art, label: `${e.name}${x.status === 'running' ? ' · ON NOW' : ''}`, sub: `${x.group} guests · ${fac(x.venue)} · ${x.housed} staying in your rooms · ${x.status === 'running' ? 'running' : `starts ${dayWords(x.date, today)}`}`, cost: credits(x.fee), accent: x.status === 'running' ? C.good : C.progress, onTap: () => (x.status === 'running' && !x.choice && x.asked ? act.panel('eventChoice', x.id) : null) };
      }),
    });
  if (evs.history.length)
    sections.push({ title: 'Results', std: 'ev:results', lines: evs.history.slice(0, 8).map((x) => ({ text: `${eventById(x.ev).name}: ${RESULT[x.result].name}`, right: `${Math.round(x.score)}/100`, color: x.result === 'fail' ? C.bad : x.result === 'great' ? C.good : C.text })) });
  sections.push({ title: 'What each event needs', std: 'ev:needs', lines: EVENTS.map((e) => ({ text: `${e.name}${e.rare ? ' (rare)' : ''}`, right: evs.whyNot(e.id) ? 'not yet' : 'can be held', color: evs.whyNot(e.id) ? C.textMuted : C.good })) });
  sections.push(back(act));
  return { key: 'panel:events', title: 'Events', subtitle: 'Birthdays to summits: book them, host them.', art: 'ui_22', accent, sections };
}
// (Milestone 19) Rocco Sparkle's live choice: the question, two or three options and Skip.
function eventChoiceSheet(run, id, { act, accent }) {
  const evs = run.events;
  const x = evs.booked.find((y) => y.id === id) ?? evs.pendingChoice;
  if (!x || x.choice) return eventsSheet(run, null, { act, accent });
  const e = eventById(x.ev);
  const opts = e.choice.options.map((o) => ({ id: `evopt:${o.id}`, label: o.label, sub: [o.cost ? `costs ${credits(o.cost)}` : null, o.risk ? 'a gamble' : null].filter(Boolean).join(' · ') || 'no cost', accent: C.action, onTap: () => act.do('evChoose', x.id, o.id) }));
  opts.push({ id: 'evopt:skip', label: 'Skip', sub: 'Carry on as planned', accent: C.textMuted, onTap: () => act.do('evChoose', x.id, 'skip') });
  return { key: 'panel:eventChoice', title: `${ROCCO.name} · ${e.name}`, subtitle: e.choice.q, art: ROCCO.art, accent, sections: [{ std: 'ev:choice', columns: 1, buttons: opts }] };
}

const starStr = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
// (Milestone 20) the Guestbook: notable guests (Regulars first), each with their stays and memories; the Hall of Fame.
function guestbookSheet(run, arg, { act, accent, dateOf = (d) => `Day ${d + 1}` }) {
  const gb = run.guestbook;
  const st = gb.stats;
  const sections = [
    { lines: [{ text: 'Guests who loved their stay (or made a memory) are kept here. Some come back — months or years later — with every stay remembered.', color: C.textMuted }, { text: 'Guests', right: String(gb.guests.length) }, { text: `Regulars (${REGULAR.stays}+ stays: +${REGULAR.sat} satisfaction, book early)`, right: String(gb.regulars.length) }, { text: 'Returns', right: String(st.returns) }] },
    { columns: 1, buttons: [{ id: 'gb:hof', icon: 'ui_29', label: 'Hall of Fame', sub: 'Best stays, best reviews, most returns', accent: C.gold ?? C.action, onTap: () => act.panel('hallOfFame') }] },
  ];
  const list = [...gb.guests].sort((a, b) => b.stays.length - a.stays.length || b.lastDay - a.lastDay).slice(0, 30);
  sections.push({
    title: list.length ? `Guests (the ${list.length} most notable)` : 'Guests',
    std: 'gb:list',
    columns: 1,
    lines: list.length ? [] : [{ text: 'The first guest to leave a 4★ review will be the first entry.', color: C.textMuted }],
    buttons: list.map((g) => ({ id: `gb:${g.id}`, icon: GUEST_TYPES[g.type].art, label: `${g.name}${g.stays.length >= REGULAR.stays ? ' · Regular' : ''}`, sub: `${GUEST_TYPES[g.type].name} · ${plural(g.stays.length, 'stay')} · last ${dateOf(g.lastDay)}${g.memories.length ? ` · ${g.memories.map((m) => memoryById(m).name).join(', ')}` : ''}`, accent: g.stays.length >= REGULAR.stays ? C.good : C.progress, onTap: () => act.panel('guest', g.id) })),
  });
  sections.push(back(act));
  return { key: 'panel:guestbook', title: 'Guestbook', subtitle: 'Who stayed, what they loved, who came back.', art: 'ui_21', accent, sections };
}
function guestSheet(run, id, { act, accent, dateOf = (d) => `Day ${d + 1}` }) {
  const gb = run.guestbook;
  const g = gb.byId(id);
  if (!g) return guestbookSheet(run, null, { act, accent, dateOf });
  const t = GUEST_TYPES[g.type];
  const lines = g.stays.map((x) => ({ text: `${dateOf(x.day)} · ${ROOM_TYPES[x.roomType]?.name ?? ''} · ${plural(x.nights, 'night')}${x.pkg ? ' · package' : ''}${x.event ? ' · event' : ''}`, right: `${starStr(x.stars)} ${Math.round(x.sat)}` }));
  const mem = g.memories.map((m) => ({ text: memoryById(m).name, color: memoryById(m).kind === 'negative' ? C.bad : C.good }));
  return {
    key: `panel:guest`,
    title: g.name,
    subtitle: `${t.name}${g.stays.length >= REGULAR.stays ? ' · a Regular' : ''} · favourite room: ${ROOM_TYPES[g.favRoomType]?.name ?? '—'}`,
    art: t.art,
    accent,
    sections: [{ title: 'Stays', std: 'guest:stays', lines }, { title: 'Memories', std: 'guest:memories', lines: mem.length ? mem : [{ text: 'No memories yet.', color: C.textMuted }] }, { columns: 1, buttons: [{ id: 'guest:back', label: '‹ Guestbook', accent: C.textMuted, onTap: () => act.panel('guestbook') }] }],
  };
}
// Kairosoft rule 3: the Hall of Fame page.
function hallOfFameSheet(run, arg, { act, accent, dateOf = (d) => `Day ${d + 1}` }) {
  const h = run.guestbook.hallOfFame();
  const empty = (w) => [{ text: w, color: C.textMuted }];
  return {
    key: 'panel:hallOfFame',
    title: 'Hall of Fame',
    subtitle: 'The best of the Guestbook.',
    art: 'ui_29',
    accent,
    sections: [
      { title: 'Best stays', std: 'hof:stays', lines: h.bestStays.length ? h.bestStays.map((x, i) => ({ text: `${i + 1}. ${x.name} · ${dateOf(x.day)}`, right: `${Math.round(x.sat)}/100` })) : empty('No stays yet.') },
      { title: 'Best reviews', std: 'hof:reviews', lines: h.bestReviews.length ? h.bestReviews.flatMap((x, i) => [{ text: `${i + 1}. ${starStr(x.stars)} ${x.name}`, right: `${Math.round(x.sat)}` }, ...(x.text ? [{ text: `“${x.text}”`, color: C.textMuted }] : [])]) : empty('No reviews yet.') },
      { title: 'Most returns', std: 'hof:returns', lines: h.mostReturns.length ? h.mostReturns.map((g, i) => ({ text: `${i + 1}. ${g.name} (${GUEST_TYPES[g.type].name})`, right: plural(g.stays.length, 'stay') })) : empty('Nobody has come back yet.') },
      { columns: 1, buttons: [{ id: 'hof:back', label: '‹ Guestbook', accent: C.textMuted, onTap: () => act.panel('guestbook') }] },
    ],
  };
}

export const LATE_SHEETS = { office: officeSheet, packages: packagesSheet, events: eventsSheet, eventChoice: eventChoiceSheet, guestbook: guestbookSheet, guest: guestSheet, hallOfFame: hallOfFameSheet };

export const LATE_OPS = {
  evAccept(run, id) {
    const r = run.events?.accept(id);
    return r?.ok ? { say: `${eventById(r.event.ev).name} booked: ${r.event.housed} guests in your rooms.` } : { why: r?.why };
  },
  evDecline(run, id) {
    run.events?.decline(id);
    return null;
  },
  evChoose(run, id, opt) {
    const r = run.events?.choose(id, opt);
    if (!r?.ok) return { why: r?.why };
    return { say: opt === 'skip' ? 'Rocco carries on as planned.' : r.choice.unlucky ? 'That didn’t go to plan…' : 'Rocco: great call!', panel: ['events'] };
  },
  pkgToggle(run, id) {
    const pk = run.packages;
    if (!pk) return null;
    const why = pk.whyOff(id);
    if (why) return { why };
    pk.setOn(id, !pk.isOn(id));
    return { say: `${packageById(id).name}: ${pk.isOn(id) ? 'on sale' : 'off sale'}.` };
  },
};

// (Reception) a package offer's words: "Family Week package · 1,940 Cr a night".
export const packageWords = (o) => {
  const p = packageById(o?.pkg);
  return p ? `${p.name} package` : '';
};
export const packageRate = (o) => {
  const p = packageById(o?.pkg);
  return p ? Math.round(o.rate * p.mult) : o.rate;
};
export { GUEST_TYPES, credits };
