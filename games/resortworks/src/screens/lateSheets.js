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
import { THEMES, COMBOS, SIGNATURE, themeById } from '../../data/themes.js';
import { comboOn, whyNoCombo, activeCombos } from '../systems/themes.js';
import { PARTNERS, partnerById, PRIYA, SUPPLY_GROUPS, SUPPLY_TIERS, TIER_IDS, TIER_NAMES } from '../../data/partners.js';
import { supplyMult } from '../systems/supplies.js';
import { RIVALS, rivalById, VISIBLE_AWARDS, AWARDS, awardById, EXPO, VICTOR } from '../../data/awards.js';
import { WEATHER, SEASON_OF_MONTH } from '../../data/weather.js';
import { demandParts, rawDemandFor, demandFor, DEMAND_CAP } from '../systems/guests.js';
import { SUPPLIES } from '../../data/finance.js';
import { ROOM_TYPES } from '../../data/bookings.js';
import { SECRETS, SECRET_CATEGORIES, FACT_WORDS, secretById } from '../../data/secrets.js';
import { FACILITY_INFO } from '../../data/facilities.js';

import { STAFF, LEGENDS } from '../../data/roster.js';
import { ACHIEVEMENTS } from '../../data/achievements.js';
const STAFF_NAMES = Object.fromEntries([...STAFF, ...LEGENDS].map((x) => [x.id, x.name]));
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
  const th = run.themes;
  if (th) {
    const top = [...THEMES].sort((a, b) => (th.progress[b.id] ?? 0) - (th.progress[a.id] ?? 0))[0];
    rows.push({ id: 'office:themes', icon: 'ui_05', label: 'Themes & Combos', sub: `${th.signature ? `Signature: ${themeById(th.signature.id).name}` : `Leading: ${top.name} ${Math.round(th.progress[top.id] ?? 0)}`} · ${activeCombos().length} of 10 combos on`, accent: C.progress, onTap: () => act.panel('themes') });
  }
  const pb = run.partners;
  if (pb) {
    const on = pb.active.filter(Boolean).length;
    rows.push({ id: 'office:partners', icon: 'ui_27', label: 'Partners', sub: `${on} of ${pb.slotsNow} on the board · ${plural(pb.offers.length, 'offer')} waiting`, accent: pb.offers.length ? C.action : C.progress, onTap: () => act.panel('partners') });
  }
  const aw = run.awards;
  if (aw) {
    if (aw.expo && !aw.expo.done) rows.push({ id: 'office:expo', icon: 'ui_28', label: EXPO.name, sub: 'This month: enter for a ranked result against the rivals (or skip)', accent: C.action, onTap: () => act.panel('expo') });
    rows.push({ id: 'office:awards', icon: 'ui_29', label: 'Awards & Rivals', sub: `${plural(aw.wins.length, 'award')} won · Prestige ${Math.round(aw.prestige)}`, accent: C.progress, onTap: () => act.panel('awards') });
  }
  if (run.secrets) rows.push({ id: 'office:secrets', icon: 'sec_found', label: 'Secret Archive', sub: `${run.secrets.count} of 50 found${run.secrets.invites.length ? ` · ${plural(run.secrets.invites.length, 'secret applicant')} waiting` : ''}`, accent: run.secrets.invites.length ? C.action : C.progress, onTap: () => act.panel('secrets') });
  if (run.achievements) rows.push({ id: 'office:achievements', icon: 'ach_medal', label: 'Achievements', sub: `${run.achievements.count} of ${ACHIEVEMENTS.length} unlocked`, accent: C.progress, onTap: () => act.panel('achievements') });
  if (run.weather) rows.push({ id: 'office:weather', icon: 'ui_23', label: 'Weather', sub: `${WEATHER[run.weather.now].name} this month · ${WEATHER[run.weather.now].line.split(': ')[1] ?? 'nothing changes.'}`, accent: C.progress, onTap: () => act.panel('weather') });
  if (run.supplies) rows.push({ id: 'office:supplies', icon: 'ui_13', label: 'Suppliers', sub: SUPPLY_GROUPS.map((g) => `${g.name}: ${TIER_NAMES[run.supplies.tier(g.id)]}`).join(' · '), accent: C.progress, onTap: () => act.panel('supplies') });
  const gb = run.guestbook;
  if (gb) rows.push({ id: 'office:guestbook', icon: 'ui_21', label: 'Guestbook', sub: `${plural(gb.guests.length, 'guest')} · ${plural(gb.regulars.length, 'Regular')} · ${plural(gb.stats.returns, 'return')}`, accent: C.progress, onTap: () => act.panel('guestbook') });
  // (Milestone 25) the money: the Finance sheet (profit history across years, the Rescue Investor) and the Rates sheet (yield)
  if (run.finance) rows.push({ id: 'office:finance', icon: 'ui_25', label: 'Money', sub: `${credits(run.finance.cash)}${run.finance.debt ? ` · owes ${credits(run.finance.debt)}` : ''}${run.finance.rescue?.active ? ' · Rescue Investor' : ''}`, accent: run.finance.debt ? C.bad : C.progress, onTap: () => act.finance() }, { id: 'office:rates', icon: 'ui_25', label: 'Rates', sub: 'Prices per room type, with a suggested band', accent: C.progress, onTap: () => act.rates() });
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
  if (run.awards?.expo && !run.awards.expo.done) return `the ${EXPO.name} is on this month (Office).`;
  if (run.partners?.offers.length) return 'Priya has a Partner offer for you (Partners).';
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

// (Milestone 21) Themes (worked out each month from the last 84 days), the Signature, and the 10 facility combos.
function themesSheet(run, arg, { act, accent }) {
  const th = run.themes;
  const sections = [{ lines: [{ text: 'Your resort becomes known for what it really does. Each month the last 84 days are scored: 50+ brings +3% of those guests, 75+ +6%. At the World-Class stage a theme at 90+ can be your Signature.', color: C.textMuted }] }];
  if (th.signature) sections.push({ lines: [{ text: `Signature: ${themeById(th.signature.id).name}`, right: `+${Math.round(SIGNATURE.demand * 100)}% demand, +${SIGNATURE.sat} satisfaction`, color: C.good }] });
  sections.push({
    title: 'Themes',
    std: 'th:list',
    columns: 1,
    buttons: [...THEMES].sort((a, b) => (th.progress[b.id] ?? 0) - (th.progress[a.id] ?? 0)).map((t) => {
      const v = th.progress[t.id] ?? 0;
      const lv = th.levelOf(t.id);
      const why = th.whyNoSignature(t.id);
      const sig = th.signature?.id === t.id;
      return { id: `th:${t.id}`, icon: t.art, label: `${sig ? '★ ' : ''}${t.name} · ${Math.round(v)}/100`, sub: `${lv ? lv.name : 'Not yet known for it'}${lv?.demand ? ` (+${Math.round(lv.demand * 100)}% demand)` : ''}`, cost: sig ? 'Signature' : why ? '' : th.signature ? 'Change: 10,000' : 'Make Signature', accent: sig ? C.good : why ? C.progress : C.action, onTap: () => (why ? null : act.do('thSignature', t.id)) };
    }),
  });
  sections.push({
    title: `Facility combos (${activeCombos().length} on)`,
    std: 'th:combos',
    lines: COMBOS.filter((c) => c.id !== 'CB10' || comboOn(c.id)).map((c) => ({ text: `${comboOn(c.id) ? '✓ ' : ''}${c.name}: ${c.what}`, right: comboOn(c.id) ? 'On' : whyNoCombo(c.id).replace(/^Needs /, 'needs '), color: comboOn(c.id) ? C.good : C.textMuted })),
  });
  sections.push(back(act));
  return { key: 'panel:themes', title: 'Themes & Combos', subtitle: 'What your resort is known for.', art: 'theme_th01', accent, sections };
}

// (Milestone 22) the Partner Board (Priya Lark): contracts running, offers, every partner and how they unlock.
function partnersSheet(run, arg, { act, accent }) {
  const pb = run.partners;
  const sections = [{ lines: [{ text: 'Partners give a bonus while their contract runs (336 days) and a reward — Credits and Staff Items — when you meet their goal. Miss it and the reward is lost; what you earned is kept.', color: C.textMuted }, { text: 'Board slots at your Rank', right: String(pb.slotsNow) }] }];
  const act0 = pb.active.filter(Boolean);
  sections.push({ title: 'On the board', std: 'pb:active', lines: act0.length ? act0.map((a) => ({ text: `${a.def.name}: ${a.def.goalWords} — ${a.met ? 'goal met ✓' : `${a.count} of ${a.def.goal.min}`}`, right: `${a.daysLeft} days`, color: a.met ? C.good : C.text })).concat(act0.map((a) => ({ text: `${a.def.name}: ${a.def.benefitWords}`, color: C.textMuted }))) : [{ text: 'No contracts yet.', color: C.textMuted }] });
  if (pb.offers.length) {
    sections.push({ title: `Offers from Priya (${pb.offers.length})`, std: 'pb:offers' });
    for (const o of pb.offers) {
      const d = partnerById(o.id);
      sections.push({ columns: 1, buttons: [{ id: `pof:${o.id}`, icon: d.art, label: `${d.name}${o.renewal ? ' (renewal)' : ''}`, sub: `${d.benefitWords} · goal: ${d.goalWords} · reward ${credits(d.reward.credits)} + items`, accent: C.progress, onTap: () => {} }] });
      sections.push({ columns: 2, buttons: [{ id: `psign:${o.id}`, label: 'Sign', accent: C.action, onTap: () => act.do('pSign', o.id) }, { id: `pdecline:${o.id}`, label: 'Not now', accent: C.textMuted, onTap: () => act.do('pDecline', o.id) }] });
    }
  }
  sections.push({ title: 'All partners', std: 'pb:all', lines: PARTNERS.map((d) => (d.secret ? { text: '??? (a secret partner)', color: C.textMuted } : { text: `${d.name}: ${d.benefitWords}`, right: pb.whyNotOffer(d.id) ?? 'can offer', color: pb.whyNotOffer(d.id) ? C.textMuted : C.good })) });
  sections.push(back(act));
  return { key: 'panel:partners', title: 'Partner Board', subtitle: `${PRIYA.name}, your partner liaison.`, art: PRIYA.art, accent, sections };
}
// (Milestone 22) Suppliers: each group's tier — its cost multiplier and the score cap it allows.
function suppliesSheet(run, arg, { act, accent }) {
  const sp = run.supplies;
  const sections = [{ lines: [{ text: 'Better supplies cost more but let scores go higher: Basic food caps Food at 78, Luxury at 100.', color: C.textMuted }] }];
  for (const g of SUPPLY_GROUPS) {
    const cur = sp.tier(g.id);
    const per = SUPPLIES[g.id] != null ? ` · ${Math.round(SUPPLIES[g.id] * supplyMult(g.id) * 100) / 100} Cr a room-night now` : '';
    sections.push({
      title: `${g.name}${per}`,
      std: `sup:${g.id}`,
      columns: 3,
      buttons: TIER_IDS.map((t) => {
        const x = SUPPLY_TIERS[g.id][t];
        return { id: `sup:${g.id}:${t}`, label: `${cur === t ? '✓ ' : ''}${TIER_NAMES[t]}`, sub: `×${x.mult}${x.cap ? ` · cap ${x.cap}` : x.failure ? ` · −${Math.round(x.failure * 100)}% breakdowns` : ''}`, accent: cur === t ? C.good : C.action, onTap: () => act.do('supTier', g.id, t) };
      }),
    });
  }
  sections.push(back(act));
  return { key: 'panel:supplies', title: 'Suppliers', subtitle: 'Food, linen, amenities and parts.', art: 'ui_13', accent, sections };
}

// (Milestone 23) the award calendar (this year: each award's month, eligibility, result), the rivals, Prestige.
const MONTHS = ['', 'Month 1', 'Month 2', 'Month 3', 'Month 4', 'Month 5', 'Month 6', 'Month 7', 'Month 8', 'Month 9', 'Month 10', 'Month 11', 'Month 12'];
function awardsSheet(run, arg, { act, accent, today = 0 }) {
  const aw = run.awards;
  const year = Math.floor(today / 336) + 1;
  const sections = [{ lines: [{ text: 'Each visible award is judged once a year in its month against the rivals in its field. Win: REP +150, Prestige and a Staff Item.', color: C.textMuted }, { text: 'Prestige', right: `${Math.round(aw.prestige)} / 100` }, { text: 'Awards won', right: String(aw.wins.length) }] }];
  sections.push({
    title: `Year ${year} calendar`,
    std: 'aw:calendar',
    columns: 1,
    buttons: VISIBLE_AWARDS.map((a) => {
      const r = aw.results.find((x) => x.id === a.id && x.year === year);
      const why = aw.whyNotEligible(a.id);
      const sub = r ? (r.eligible ? `${r.won ? 'WON' : `#${r.rank}`} · you ${Math.round(r.score)} · best rival ${Math.round(r.field[0].score)} (${rivalById(r.field[0].id).name})` : `Not eligible: ${r.why}`) : `${MONTHS[a.month]} · ${why ? `needs: ${a.eligWords}` : `eligible · you'd score about ${Math.round(aw.scoreOf(a.id))}`}`;
      return { id: `aw:${a.id}`, icon: a.art, label: `${aw.won(a.id) ? '★ ' : ''}${a.name}`, sub, accent: r?.won ? C.good : r ? C.textMuted : why ? C.progress : C.action, onTap: () => {} };
    }),
  });
  sections.push({ title: 'Secret awards', std: 'aw:secret', lines: AWARDS.filter((a) => a.secret).map(() => ({ text: '??? (a secret award)', color: C.textMuted })) });
  sections.push({ title: 'Rivals', std: 'aw:rivals', lines: RIVALS.map((r) => ({ text: `${r.name} · ${r.specWords}`, right: String(Math.round(r.base + r.growth * (year - 1))) })) });
  if (aw.prestigeLog.length) sections.push({ title: 'Prestige lately', std: 'aw:prestige', lines: aw.prestigeLog.slice(0, 5).map((x) => ({ text: x.why, right: `${x.n > 0 ? '+' : ''}${x.n}` })) });
  sections.push(back(act));
  return { key: 'panel:awards', title: 'Awards & Rivals', subtitle: 'The award calendar, the rivals, your Prestige.', art: 'ui_29', accent, sections };
}
// (Milestone 23) Kairosoft rule 1: the Roadside Travel Expo (Month 9): Enter or Skip; then the ranked table.
function expoSheet(run, arg, { act, accent }) {
  const x = run.awards.expo;
  const sections = [];
  if (!x) sections.push({ lines: [{ text: `The ${EXPO.name} comes every Month 9.`, color: C.textMuted }] });
  else if (!x.done) sections.push({ lines: [{ text: 'Show the resort at the Expo: your score is the average of three general award scores (Local Traveller Choice, Regional Clean Stay, National Resort Award), against all eight rivals. 1st: REP +60 and +5% bookings for 28 days; 2nd–3rd: REP +30 and +3%; anywhere else: REP +10.', color: C.textMuted }], columns: 2, buttons: [{ id: 'expo:enter', label: 'Enter', accent: C.action, onTap: () => act.do('expoEnter') }, { id: 'expo:skip', label: 'Skip', accent: C.textMuted, onTap: () => act.do('expoSkip') }] });
  else if (x.entered) {
    sections.push({ title: `You came #${x.place} of ${x.table.length}`, std: 'expo:table', lines: x.table.map((r, i) => ({ text: `${i + 1}. ${r.id === 'you' ? run.data?.resort?.name ?? 'Your resort' : rivalById(r.id).name}`, right: String(Math.round(r.score)), color: r.id === 'you' ? C.good : C.text })) });
    sections.push({ lines: [{ text: `${VICTOR.name}: “${x.line}”`, color: C.textMuted }, { text: `REP +${x.rep}${x.demand ? ` · bookings +${Math.round(x.demand * 100)}% for 28 days` : ''}` }] });
  } else sections.push({ lines: [{ text: 'You skipped this year’s Expo.', color: C.textMuted }] });
  sections.push(back(act));
  return { key: 'panel:expo', title: EXPO.name, subtitle: 'The yearly show, every Month 9.', art: 'ui_28', accent, sections };
}

// (Milestone 24) the weather: this month, the next months (seeded, so it is a true forecast), and every demand source
// for the guests now, with the ±20% cap shown.
const SEASON_NAME = { mild: 'Mild season', warm: 'Warm season', wet: 'Wet season', cool: 'Cool season' };
function weatherSheet(run, arg, { act, accent, today = 0 }) {
  const wx = run.weather;
  const w = WEATHER[wx.now];
  const sections = [{ lines: [{ text: `${w.name} weather this month`, right: SEASON_NAME[SEASON_OF_MONTH[Math.floor(today / 28) % 12]] }, { text: w.line, color: C.textMuted }] }];
  sections.push({ title: 'The next months', std: 'wx:forecast', lines: wx.forecast(today, 3).map((f) => ({ text: `Month ${((f.month - 1) % 12) + 1}`, right: WEATHER[f.id].name })) });
  const types = Object.keys(GUEST_TYPES).filter((id) => rawDemandFor(id) !== 0).slice(0, 8);
  sections.push({ title: `Demand now (every source together stays within ±${Math.round(DEMAND_CAP * 100)}%)`, std: 'wx:demand', lines: types.length ? types.map((id) => ({ text: `${GUEST_TYPES[id].name}: ${demandParts(id).filter((p) => p.type).map((p) => `${p.words} ${pct(p.type)}`).join(', ')}`, right: pct(demandFor(id)) })) : [{ text: 'Nothing is moving demand right now.', color: C.textMuted }] });
  sections.push(back(act));
  return { key: 'panel:weather', title: 'Weather', subtitle: 'Seasons change who comes.', art: 'ui_23', accent, sections };
}

// (Milestone 26) the 40 achievements: unlocked first (when), then the rest with their goal and progress bar words.
function achievementsSheet(run, arg, { act, accent, dateOf = (d) => `Day ${d + 1}` }) {
  const ach = run.achievements;
  const list = ach.list;
  const done = list.filter((x) => x.unlocked);
  const rest = list.filter((x) => !x.unlocked);
  ach.markSeen?.();
  const row = (x) => ({ id: `ach:${x.def.id}`, icon: x.unlocked ? 'ach_medal' : 'ach_locked', label: x.def.name, sub: x.unlocked ? `${x.def.text} · ${dateOf(x.unlocked.day ?? 0)}` : `${x.def.text}${x.progress ? ` · ${x.progress.value} / ${x.progress.target}` : ''}`, accent: x.unlocked ? C.good : C.textMuted, onTap: () => {} });
  return {
    key: 'panel:achievements',
    title: 'Achievements',
    subtitle: `${done.length} of ${list.length} · kept on your account in every resort.`,
    art: 'ach_medal',
    accent,
    sections: [
      { title: `Unlocked (${done.length})`, std: 'ach:done', columns: 1, lines: done.length ? [] : [{ text: 'Your first comes with your first booked guest.', color: C.textMuted }], buttons: done.map(row) },
      { title: `Still to do (${rest.length})`, std: 'ach:rest', columns: 1, buttons: rest.map(row) },
      back(act),
    ],
  };
}

// (Milestone 27) the Secret Archive: the 50 by category. Found: the name, the reward and (tap) the exact conditions. A
// clue: a rumour (stage 1), then what kind of thing is still missing (stage 2). Not heard of yet: "???".
const condName = (fact, need) => {
  const [g, id] = fact.split('.');
  if (g === 'level') return `${FACILITY_INFO[id]?.name ?? id} at Lv${need}`;
  if (g === 'built') return `${FACILITY_INFO[id]?.name ?? id} built`;
  return FACT_WORDS[fact] ?? fact;
};
export function secretCondLines(check) {
  return (check?.parts ?? []).map((p) => {
    const [g] = p.fact.split('.');
    const yesNo = typeof p.need === 'boolean' || g === 'built' || ['hiredEver', 'hiredRun', 'awardsWon'].includes(p.fact);
    const val = yesNo ? '' : ` · ${p.value ?? 0} / ${p.need}`;
    return { text: `${p.ok ? '✓' : '·'} ${condName(p.fact, p.need)}${['hiredEver', 'hiredRun', 'awardsWon'].includes(p.fact) ? `: ${p.need}` : ''}${g === 'level' ? '' : val}`, color: p.ok ? C.good : C.textMuted };
  });
}
function secretsSheet(run, arg, { act, accent }) {
  const sec = run.secrets;
  const rows = sec.archive();
  const ng = run.ngPlus ?? 0;
  const row = (r) => {
    if (r.found) return { id: `sec:${r.id}`, icon: 'sec_found', label: r.name, sub: `${r.reward}${r.foundNow ? '' : ' · found in an earlier run'}`, accent: C.good, onTap: () => act.panel('secret', r.id) };
    if (r.stage >= 1) return { id: `sec:${r.id}`, icon: 'sec_hidden', label: 'A rumour…', sub: r.stage >= 2 ? `${r.rumour} Still missing: ${r.missing.join(', ') || 'one last thing'}.` : r.rumour, accent: C.progress, onTap: () => {} };
    return { id: `sec:${r.id}`, icon: 'sec_hidden', label: '???', sub: r.ng > ng ? `New Game+${r.ng} or later.` : 'Not heard of yet.', accent: C.textMuted, onTap: () => {} };
  };
  const inv = sec.invites;
  return {
    key: 'panel:secrets',
    title: 'Secret Archive',
    subtitle: `${sec.count} of 50 found · kept on your account. Prestige Tokens: ${sec.prestigeTokens}.`,
    art: 'sec_found',
    accent,
    sections: [
      ...(inv.length ? [{ title: 'Secret applicants (hire them at the Motel Service Block)', std: 'sec:invites', columns: 1, lines: inv.map((id) => ({ text: `${staffNameOf(id)} · until ${sec.inviteUntil(id) + 1 > 0 ? `Day ${sec.inviteUntil(id) + 1}` : ''}`, color: C.action })) }] : []),
      ...SECRET_CATEGORIES.map((cat) => ({ title: `${cat} (${rows.filter((r) => r.category === cat && r.found).length} / ${rows.filter((r) => r.category === cat).length})`, std: `sec:${cat}`, columns: 1, buttons: rows.filter((r) => r.category === cat).map(row) })),
      // (Milestone 27b) beyond the 50: the Founder's secret (shown once it has a clue)
      ...(rows.some((r) => r.extra && r.stage >= 1) ? [{ title: 'Beyond the 50', std: 'sec:extra', columns: 1, buttons: rows.filter((r) => r.extra && r.stage >= 1).map(row) }] : []),
      back(act),
    ],
  };
}
const staffNameOf = (id) => STAFF_NAMES[id] ?? id;
// One found secret: its exact conditions (met in this run or not) and its reward.
function secretSheet(run, id, { act, accent }) {
  const sec = run.secrets;
  const r = secretById(id);
  const row = sec.archive().find((x) => x.id === id);
  if (!r || !row?.found) return secretsSheet(run, null, { act, accent });
  return {
    key: `panel:secret:${id}`,
    title: r.name,
    subtitle: `${r.category} · ${row.foundNow ? 'found in this run' : 'found in an earlier run (a repeat run needs a little less)'}`,
    art: 'sec_found',
    accent,
    sections: [
      { title: 'Exact conditions (now)', std: 'sec:exact', columns: 1, lines: [...(r.ngPlusMin ? [{ text: `New Game+${r.ngPlusMin} or later`, color: C.textMuted }] : []), ...secretCondLines(row.check)] },
      { title: 'Reward', std: 'sec:reward', columns: 1, lines: [{ text: row.reward, color: C.good }] },
      { columns: 1, buttons: [{ id: 'panel:back', label: '‹ Secret Archive', accent: C.textMuted, onTap: () => act.panel('secrets') }] },
    ],
  };
}

export const LATE_SHEETS = { office: officeSheet, packages: packagesSheet, events: eventsSheet, eventChoice: eventChoiceSheet, guestbook: guestbookSheet, guest: guestSheet, hallOfFame: hallOfFameSheet, themes: themesSheet, partners: partnersSheet, supplies: suppliesSheet, awards: awardsSheet, expo: expoSheet, weather: weatherSheet, achievements: achievementsSheet, secrets: secretsSheet, secret: secretSheet };

export const LATE_OPS = {
  expoEnter(run) {
    const r = run.awards?.enterExpo();
    return r?.ok ? { say: `${EXPO.name}: you came #${r.result.place}!`, panel: ['expo'] } : { why: r?.why };
  },
  expoSkip(run) {
    run.awards?.skipExpo();
    return { say: 'Skipped the Expo this year.', panel: ['expo'] };
  },
  pSign(run, id) {
    const r = run.partners?.sign(id);
    return r?.ok ? { say: `${partnerById(id).name} signed: ${partnerById(id).benefitWords}.` } : { why: r?.why };
  },
  pDecline(run, id) {
    run.partners?.decline(id);
    return null;
  },
  supTier(run, g, t) {
    if (!run.supplies?.setTier(g, t)) return null;
    return { say: `${SUPPLY_GROUPS.find((x) => x.id === g).name}: ${TIER_NAMES[t]} from now on.` };
  },
  thSignature(run, id) {
    const r = run.themes?.setSignature(id);
    return r?.ok ? { say: `${themeById(id).name} is your Signature.` } : { why: r?.why };
  },
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
