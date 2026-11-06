// Build Mode's sheets (Milestone 12, bible §6 / §20 / §21 / §27G, style guide station sheets): plain specs for
// core/ui/BottomSheet, like src/screens/resortSheets.js. The screen (src/screens/ResortScreen.js) opens them and does
// what their buttons ask (act.*).
//   buildListSheet(site, { finance, progress, act, accent }) — what can be built now (the stage's rooms and facilities),
//     the land, and everything under construction (with its cancel refund)
//   buildItemSheet(site, id, { act, accent, confirm }) — a building tapped in Build Mode: Move, Sell (two taps), Upgrade,
//     or Cancel its construction
import { THEME } from '../../../../core/Theme.js';
import { LAND, FACILITY_BUILD, ROOM_BUILD, CONSTRUCTION, DOUGIE } from '../../data/build.js';
import { FACILITY_INFO } from '../../data/facilities.js';
import { ROOM_TYPES } from '../../data/bookings.js';
import { credits } from '../systems/finance.js';
import { MINUTES_PER_DAY } from '../systems/calendar.js';

const C = THEME.color;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const daysLeft = (site, j, now) => Math.max(0, Math.ceil((j.end - now) / MINUTES_PER_DAY - 1e-9));
const artOf = (it) => (it.kind === 'room' ? `room_${it.def.toLowerCase()}` : FACILITY_INFO[it.def]?.art);

export function buildListSheet(site, { finance = null, progress = null, act, accent = C.progress, now = 0 } = {}) {
  const sections = [];
  const stage = progress?.stageInfo;
  sections.push({
    lines: [
      { text: 'Pick something, then tap the land to place it. Tap a building to move, sell or upgrade it.', color: C.textMuted },
      { text: `${stage?.name ?? 'Roadside Motel'} · ${plural(site.items.filter((it) => it.kind === 'room').length, 'room')} of ${stage?.rooms ?? 12}`, right: finance ? credits(finance.cash) : '' },
    ],
  });
  if (site.jobs.length)
    sections.push({
      title: 'Being built',
      std: 'build:jobs',
      columns: 1,
      buttons: site.jobs.map((j) => {
        const it = site.itemById(j.target);
        const pct = Math.round(site.progressOf(j) * 100);
        const what = j.kind === 'build' ? site.nameOf(j.target) : `${site.nameOf(j.target)} → Level ${j.level}`;
        return { id: `job:${j.id}`, icon: artOf(it), label: `${what} · ${pct}%`, sub: `${plural(daysLeft(site, j, now), 'day')} left · cancel: ${credits(site.cancelValue(j.id))} back`, cost: 'Cancel', accent: C.progress, onTap: () => act.item(j.target) };
      }),
    });
  const cat = site.catalogue();
  const row = (x) => ({ id: `build:${x.kind}:${x.def}`, icon: x.art, label: x.name, sub: x.why ?? `${plural(x.days, 'day')} to build · ${x.size}×${x.size} tiles${x.line ? ` · ${x.line}` : ''}`, cost: credits(x.cost), disabled: !!x.why, accent: C.action, onTap: () => act.pickBuild(x.kind, x.def) });
  const rooms = cat.filter((x) => x.kind === 'room');
  const facs = cat.filter((x) => x.kind === 'facility');
  if (rooms.length) sections.push({ title: 'Rooms', std: 'build:rooms', columns: 1, buttons: rooms.map(row) });
  sections.push(facs.length ? { title: 'Facilities', std: 'build:facilities', columns: 1, buttons: facs.map(row) } : { title: 'Facilities', std: 'build:facilities', lines: [{ text: 'Every facility this stage allows is built. More open at the Holiday Lodge stage.', color: C.textMuted }] });
  sections.push({
    title: 'Land',
    std: 'build:land',
    columns: 1,
    buttons: LAND.filter((l) => !l.secret).map((l) => {
      const owned = site.owns(l.id);
      const why = owned ? null : site.whyNoLand(l.id);
      return { id: `land:${l.id}`, icon: l.art, label: owned ? `✓ ${l.name}` : l.name, sub: owned ? 'Yours' : why ?? l.line, cost: owned || l.price == null ? '' : credits(l.price), disabled: owned || !!why, accent: owned ? C.good : C.action, onTap: () => act.buyLand(l.id) };
    }),
  });
  sections.push({ columns: 1, buttons: [{ id: 'build:done', label: 'Done building', accent: C.textMuted, onTap: () => act.done() }] });
  return { key: 'build', title: 'Build', subtitle: 'Rooms, facilities and land. Paid when you order it.', art: DOUGIE.art, accent, sections };
}

export function buildItemSheet(site, id, { act, accent = C.progress, confirm = null, now = 0 } = {}) {
  const it = site.itemById(id);
  if (!it) return null;
  const name = site.nameOf(id);
  const job = site.jobFor(id);
  const isRoom = it.kind === 'room';
  const b = isRoom ? ROOM_BUILD[it.def] : FACILITY_BUILD[it.def];
  const lines = [
    { text: isRoom ? `${ROOM_TYPES[it.def]?.name ?? it.def} · sleeps ${ROOM_TYPES[it.def]?.cap ?? '?'}` : FACILITY_INFO[it.def].line },
    { text: 'Level', right: `${it.level ?? 1} of 3` },
    { text: 'Spent on it', right: credits(it.spent) },
  ];
  if (site.isClosed(id)) lines.push({ text: 'Moved: opens again tomorrow', color: C.bad });
  const sections = [{ lines }];
  if (job) {
    const pct = Math.round(site.progressOf(job) * 100);
    sections.push({
      title: job.kind === 'build' ? 'Being built' : `Upgrading to Level ${job.level}`,
      std: 'item:job',
      lines: [{ text: `${pct}% done · ${plural(daysLeft(site, job, now), 'day')} left` }, { text: `Cancel now and get ${credits(site.cancelValue(job.id))} back (${Math.round((site.progressOf(job) < CONSTRUCTION.half ? CONSTRUCTION.early : CONSTRUCTION.late) * 100)}% of ${credits(job.cost)}).`, color: C.textMuted }],
      columns: 1,
      buttons: [{ id: `cancel:${job.id}`, label: confirm === `cancel:${job.id}` ? 'Tap again to cancel it' : job.kind === 'build' ? 'Cancel the build' : 'Cancel the upgrade', cost: credits(site.cancelValue(job.id)), accent: C.bad, onTap: () => act.cancelJob(job.id) }],
    });
  } else {
    const sellWhy = site.whyNoSell(id);
    const up = site.upgradeInfo(id);
    const upWhy = site.whyNoUpgrade(id);
    sections.push({
      std: 'item:actions',
      columns: 1,
      buttons: [
        { id: `move:${id}`, label: 'Move', sub: 'Free. It closes for one day.', accent: C.action, onTap: () => act.startMove(id) },
        up && !up.max ? { id: `upgrade:${id}`, label: `Upgrade to Level ${up.next}`, sub: upWhy ?? `${plural(up.days, 'day')} · it keeps working meanwhile`, cost: credits(up.cost), disabled: !!upWhy, accent: C.progress, onTap: () => act.upgrade(id) } : null,
        { id: `sell:${id}`, label: confirm === `sell:${id}` ? `Tap again to sell ${name}` : 'Sell', sub: sellWhy ?? `Get back ${Math.round(CONSTRUCTION.sell * 100)}% of all you spent on it`, cost: sellWhy ? '' : credits(site.sellValue(id)), disabled: !!sellWhy, accent: C.bad, onTap: () => act.sell(id) },
      ].filter(Boolean),
    });
  }
  sections.push({ columns: 1, buttons: [{ id: 'item:back', label: '‹ Build list', accent: C.textMuted, onTap: () => act.list() }] });
  return { key: `build:${id}`, title: name, subtitle: `Build cost ${credits(b?.cost ?? 0)}`, art: artOf(it), accent, sections };
}
