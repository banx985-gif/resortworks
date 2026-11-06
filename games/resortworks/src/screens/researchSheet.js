// The Research sheet (Milestone 17, bible §22 / §27H): the project being researched (its bar, days left), the queue (up to
// 3, each can be taken out) and the six branches of six tiers — each project's effect, cost and days, and whether it is
// done, being researched, queued, open or waiting for the tier before. A tap on an open project starts it (or queues it).
// Opened from the Build list (bible §6: "Develop — research, build, expansions"). A plain spec for core/ui/BottomSheet.
//   researchSheet(rs, { finance, act, accent }) — act: { research(id), unqueue(id), list() }
import { THEME } from '../../../../core/Theme.js';
import { RESEARCH, BRANCHES, TIERS, QUEUE, researchById } from '../../data/research.js';
import { credits } from '../systems/finance.js';

const C = THEME.color;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function researchSheet(rs, { finance = null, act, accent = C.progress } = {}) {
  const sections = [];
  const a = rs.active;
  const now = a ? researchById(a.id) : null;
  sections.push({
    title: 'Researching',
    std: 'research:now',
    lines: now ? [{ text: `${now.name} · ${now.line}`, color: C.actionDark }, { text: 'Done in', right: plural(rs.daysLeft(), 'day') }] : [{ text: 'Nothing yet. Pick a project below: its Credits are paid when it starts.', color: C.textMuted }],
    bars: now ? [{ label: 'Progress', value: Math.round(rs.progressOf() * 100), max: 100, color: C.progress, text: `${Math.round(rs.progressOf() * 100)}%` }] : [],
  });
  const q = rs.queue;
  sections.push({
    title: `Queue (${q.length} of ${QUEUE.size})`,
    std: 'research:queue',
    lines: q.length ? [] : [{ text: 'Projects you pick while one is running wait here and start in turn.', color: C.textMuted }],
    columns: 1,
    buttons: q.map((id, i) => {
      const x = researchById(id);
      return { id: `unqueue:${id}`, icon: x.art, label: `${i + 1}. ${x.name}`, sub: `${credits(TIERS[x.tier].cost)} when it starts · ${plural(TIERS[x.tier].days, 'day')}`, cost: 'Remove', accent: C.textMuted, onTap: () => act.unqueue(id) };
    }),
  });
  for (const br of BRANCHES) {
    sections.push({
      title: br.name,
      std: `research:${br.id}`,
      columns: 1,
      buttons: RESEARCH.filter((x) => x.branch === br.id).map((x) => {
        const st = rs.state(x.id);
        const why = st === 'open' ? rs.whyNot(x.id) : null;
        const later = x.later ? ` (works from ${x.later})` : '';
        const subs = { done: `✓ Done · ${x.line}${later}`, active: `Researching · ${Math.round(rs.progressOf() * 100)}% · ${x.line}`, queued: `Queued · ${x.line}${later}`, locked: `Needs ${RESEARCH.find((y) => y.branch === x.branch && y.tier === x.tier - 1)?.name} first · ${x.line}${later}` };
        const sub = subs[st] ?? `${why ? `${why} · ` : ''}${x.line}${later} · ${plural(TIERS[x.tier].days, 'day')}`;
        return { id: `research:${x.id}`, icon: x.art, label: `${x.tier}. ${x.name}`, sub, cost: st === 'open' ? credits(TIERS[x.tier].cost) : '', accent: st === 'done' ? C.good : st === 'open' && !why ? br.color : C.textMuted, disabled: st !== 'open' || !!why, onTap: () => act.research(x.id) };
      }),
    });
  }
  sections.push({ columns: 1, buttons: [{ id: 'research:back', label: '‹ Build list', accent: C.textMuted, onTap: () => act.list() }] });
  return { key: 'research', title: 'Research', subtitle: `One project at a time, ${QUEUE.size} more in the queue. ${finance ? credits(finance.cash) : ''}`.trim(), art: 'research_r07', accent, sections };
}
