// Research (Milestone 17, bible §22 / §27H): 36 projects in six branches. One project runs at a time; up to three more wait
// in the queue. A project needs the tier before it in its branch; its Credits are paid when it starts (a queued one that
// can't be paid yet waits); it takes its tier's game days. Done projects are for good.
// One resort is open at a time: what is done is kept here at module level too (like the site), so every system can ask
// rx(key) — the total of that effect over the projects done — without being wired to research.
//   freshResearch() → the save's `research`
//   createResearch({ saved, bus, finance, now }) → rs
//     rs.whyNot(id) · start(id) (start now, or queue it) · unqueue(id) · onEdge() (every band edge: finish, start the next)
//     rs.done(id) · rs.active · rs.queue · rs.progressOf() (0–1) · rs.state(id) ('done' | 'active' | 'queued' | 'open' | 'locked')
//     rs.grant(id) (tests / ?debug=1) · serialize()
//   researched(id) · rx(key) — module level
import { RESEARCH, TIERS, QUEUE, researchById } from '../../data/research.js';
import { MINUTES_PER_DAY } from './calendar.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
const LIVE = { done: new Set(), on: false }; // on: a resort with research is open (older tests have none: no R32 gate)
export const researched = (id) => LIVE.done.has(id);
export const researchOn = () => LIVE.on;
// The total of one effect over the projects done (effects for later systems count too: those systems read them later).
export function rx(key) {
  let t = 0;
  for (const id of LIVE.done) {
    const fx = researchById(id)?.fx;
    for (const e of Array.isArray(fx) ? fx : fx ? [fx] : []) if (e.key === key) t += e.v;
  }
  return t;
}
export const freshResearch = () => ({ done: [], active: null, queue: [], stats: { started: 0, finished: 0, spent: 0 } });
const fmt = (n) => Math.round(n).toLocaleString('en-GB');

export function createResearch({ saved = null, bus = null, finance = null, now = () => 0 } = {}) {
  const s = load(saved);
  LIVE.done = new Set(s.done);
  LIVE.on = true;
  const prev = (x) => RESEARCH.find((y) => y.branch === x.branch && y.tier === x.tier - 1) ?? null;
  const day = () => Math.floor(now() / MINUTES_PER_DAY);
  const changed = (what, id) => {
    LIVE.done = new Set(s.done);
    bus?.emit('research:change', { what, id });
  };
  // Can it be started (or queued) now? One plain line, or null.
  function whyNot(id) {
    const x = researchById(id);
    if (!x) return 'No such project.';
    if (s.done.includes(id)) return 'Done.';
    if (s.active?.id === id) return 'Being researched now.';
    if (s.queue.includes(id)) return 'Already in the queue.';
    const p = prev(x);
    if (p && !s.done.includes(p.id) && s.active?.id !== p.id && !s.queue.includes(p.id)) return `Needs ${p.name} first.`;
    if (s.active && s.queue.length >= QUEUE.size) return `The queue is full (${QUEUE.size} waiting).`;
    if (!s.active && (finance?.cash ?? Infinity) < TIERS[x.tier].cost) return `Not enough Credits: it costs ${fmt(TIERS[x.tier].cost)}.`;
    return null;
  }
  // The project at the front starts if its tier before is done and it can be paid.
  function begin(id) {
    const x = researchById(id);
    const cost = TIERS[x.tier].cost;
    if ((finance?.cash ?? Infinity) < cost) return false;
    const p = prev(x);
    if (p && !s.done.includes(p.id)) return false;
    finance?.spend('research', cost, day(), id);
    const t = now();
    s.active = { id, start: t, end: t + TIERS[x.tier].days * MINUTES_PER_DAY, cost };
    s.stats.started++;
    s.stats.spent += cost;
    bus?.emit('research:start', { id });
    return true;
  }
  function next() {
    while (!s.active && s.queue.length) {
      if (!begin(s.queue[0])) return; // (not paid for yet, or waiting for the tier before: it waits at the front)
      s.queue.shift();
    }
  }
  function finish() {
    const id = s.active.id;
    s.done.push(id);
    s.active = null;
    s.stats.finished++;
    changed('done', id);
    bus?.emit('research:done', { id, name: researchById(id).name });
  }
  const rs = {
    whyNot,
    start(id) {
      const why = whyNot(id);
      if (why) return { ok: false, why };
      if (s.active) s.queue.push(id);
      else if (!begin(id)) return { ok: false, why: 'It can’t start yet.' };
      changed('start', id);
      return { ok: true, queued: s.active?.id !== id };
    },
    unqueue(id) {
      if (!s.queue.includes(id)) return false;
      // anything waiting on it waits on its tier-before again: drop those behind it in the same branch too
      const x = researchById(id);
      s.queue = s.queue.filter((q) => q !== id && !(researchById(q).branch === x.branch && researchById(q).tier > x.tier));
      changed('unqueue', id);
      return true;
    },
    // Every band edge: the active project finishes on time; the next in the queue starts (paid then).
    onEdge() {
      if (s.active && now() >= s.active.end - 1e-6) finish();
      const had = s.active;
      next();
      if (s.active && s.active !== had) changed('next', s.active.id);
    },
    progressOf: () => (s.active ? Math.max(0, Math.min(1, (now() - s.active.start) / (s.active.end - s.active.start))) : 0),
    daysLeft: () => (s.active ? Math.max(0, Math.ceil((s.active.end - now()) / MINUTES_PER_DAY - 1e-9)) : 0),
    done: (id) => s.done.includes(id),
    state(id) {
      if (s.done.includes(id)) return 'done';
      if (s.active?.id === id) return 'active';
      if (s.queue.includes(id)) return 'queued';
      const p = prev(researchById(id));
      return !p || s.done.includes(p.id) || s.active?.id === p.id || s.queue.includes(p.id) ? 'open' : 'locked';
    },
    grant(id) {
      if (!researchById(id) || s.done.includes(id)) return false;
      s.done.push(id);
      changed('grant', id);
      return true;
    },
    get active() {
      return s.active ? { ...s.active } : null;
    },
    get queue() {
      return [...s.queue];
    },
    get doneList() {
      return [...s.done];
    },
    get stats() {
      return { ...s.stats };
    },
    serialize: () => clone(s),
  };
  return rs;
}

function load(saved) {
  const f = freshResearch();
  if (!saved || typeof saved !== 'object') return f;
  const s = clone(saved);
  const ok = (id) => !!researchById(id);
  return {
    done: Array.isArray(s.done) ? [...new Set(s.done.filter(ok))] : [],
    active: s.active && ok(s.active.id) && Number.isFinite(s.active.end) && Number.isFinite(s.active.start) ? s.active : null,
    queue: Array.isArray(s.queue) ? s.queue.filter(ok).slice(0, QUEUE.size) : [],
    stats: { ...f.stats, ...(s.stats ?? {}) },
  };
}
