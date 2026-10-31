// Maintenance / Condition (Milestone 8, bible §12 / §18 / §27G). Every facility (F01–F08) and every room has Condition
// 0–100 (all start at 90). Each day change takes the day's wear (facilities 0.6, Parking and Garden 0.3, rooms 0.4, +0.3
// an occupied room-night, +0.02 a guest who used the pool or café). 70+ works fully; 40–70 at Condition / 70; under 40 at
// half, with a daily breakdown roll of (40 − Condition) / 40 × 20% (seeded: the run, the thing and the day). At 0, or after
// a breakdown, it is offline until repaired: a room goes to Maintenance (a party in it gets a breakdown complaint), a
// facility loses its effect (data/maintenance.js).
// The Maintenance person on shift works one queue, like housekeeping (M4): repairs first (maintenance priority jumps the
// line, then oldest first), then the player's Service now jobs, then preventive service of anything under 80, lowest
// first. Service: +30, 60 game minutes × k, parts 1% of the build cost. Repair: back at 60, 180 game minutes × k, 8% of
// the build cost. k = 1.30 − Skill/200 − Speed/400, ÷ 1.10 with the Maintenance Shed working. Walks count (1 game minute
// a tile). The costs go on the ledger at the job's start ("Repairs", "Maintenance parts").
// Plain, saved state in game minutes, moved on event by event (a job's arrival, its end, a shift starting) and at each day
// change — never frame by frame — so the same seed gives the same wear, breakdowns and repairs at every speed.
//   createMaintenance({ saved, team, bookings, finance, complaints, bus, seed, rules }) → mt
//     (bookings.attachMaintenance(mt) wires it to the band edges)
//     mt.advance(minute) · mt.onEdge(day, band, bookings) · mt.serviceNow(id) → { ok, why } · mt.prioritize(id)
//     mt.condition(id) · eff(id) (0–1, offline 0) · isOffline(id) · isWorn(id) · words(id) · jobFor(id) · queuePosition(id)
//     jobOf(staffId) · hasJob(id) · isPriority(id) · costOf(id, kind) · minutesFor(kind, stats) · workers · queue · active
//     stats · log · starts (recent job starts, for the walker on the map) · at · setCondition(id, v) / breakNow(id) (tests,
//     debug) · serialize()
//   On the bus: 'mt:breakdown' { id, minute } · 'mt:start' { job } · 'mt:done' { job } · 'mt:service' { id } · 'mt:change'
import { Rng } from '../../../../core/Rng.js';
import { findPath } from '../../../../core/Pathing.js';
import { FACILITIES, ROOMS, roomById } from '../../data/lot.js';
import { BANDS } from '../../data/calendar.js';
import { CONDITION, WEAR, JOBS, BUILD_COST, STAY_FACILITIES, COND_TEXT, LOG_MAX } from '../../data/maintenance.js';
import { MINUTES_PER_DAY, minuteOf } from './calendar.js';
import { lotGrid, doorOf, windowAt, nextShiftAfter } from './housekeeping.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
const r2 = (x) => Math.round(x * 100) / 100;
const BAND = Object.fromEntries(BANDS.map((b, i) => [b.id, i]));
const MAX_STARTS = 40;
export const TARGETS = [...FACILITIES.map((f) => f.id), ...ROOMS.map((r) => r.id)];
const ORDER = Object.fromEntries(TARGETS.map((id, i) => [id, i]));
export const isRoom = (id) => !!roomById(id);
export const targetName = (id) => roomById(id)?.name ?? FACILITIES.find((f) => f.id === id)?.name ?? id;
export const buildCost = (id) => BUILD_COST[roomById(id)?.typeId ?? id] ?? 0;
export const costOf = (id, kind) => Math.round(buildCost(id) * (kind === 'repair' ? JOBS.repairShare : JOBS.partsShare));

// The working share at a Condition (bible §12): 1 at 70+, Condition / 70 down to 40, half under 40.
export function workingShare(c) {
  if (c >= CONDITION.full) return 1;
  if (c >= CONDITION.half) return c / CONDITION.full;
  return CONDITION.halfFactor;
}
// The daily breakdown chance at a Condition (0 at 40+).
export const breakdownChance = (c) => (c >= CONDITION.half ? 0 : ((CONDITION.half - c) / CONDITION.half) * CONDITION.breakdownMax);
// The day's wear on one thing: base, + an occupied room-night, + its users.
export const dailyWear = (id, { occupied = false, users = 0 } = {}) => r2((isRoom(id) ? WEAR.room + (occupied ? WEAR.roomNight : 0) : WEAR.light[id] ?? WEAR.facility) + (WEAR.users.includes(id) ? users * WEAR.perUser : 0));

export function freshMaintenance({ minute = minuteOf(0, BAND.morning), start = CONDITION.start } = {}) {
  return {
    at: minute,
    nextId: 1,
    cond: Object.fromEntries(TARGETS.map((id) => [id, start])),
    offline: {},
    queue: [],
    active: {},
    where: {},
    shift: {},
    stats: { breakdowns: 0, repairs: 0, services: 0, repairCost: 0, partsCost: 0, workMin: 0, walkMin: 0, wearDays: 0, lowest: start },
    log: [],
  };
}

export function createMaintenance({ saved = null, team = [], bookings = null, finance = null, complaints = null, bus = null, seed = 'resortworks', rules = {} } = {}) {
  const R = { ...JOBS, ...rules };
  const workers = rules.never ? [] : team.filter((m) => m.role === R.role); // (rules.never: tests — nobody ever on shift)
  const grid = lotGrid();
  let s = saved ? load(saved) : freshMaintenance({ minute: bookings ? minuteOf(bookings.at.day, bookings.at.band) : undefined });
  const starts = Object.values(s.active).map((j) => ({ ...j }));
  let version = 0;
  let cp = complaints;
  const changed = () => {
    version++;
    bus?.emit('mt:change', {});
  };

  function load(x) {
    const o = clone(x);
    const f = freshMaintenance({ minute: Number.isFinite(o.at) ? o.at : 0 });
    return {
      at: f.at,
      nextId: Number.isFinite(o.nextId) ? o.nextId : 1,
      cond: Object.fromEntries(TARGETS.map((id) => [id, Number.isFinite(o.cond?.[id]) ? Math.max(0, Math.min(CONDITION.max, o.cond[id])) : CONDITION.start])),
      offline: Object.fromEntries(Object.entries(o.offline ?? {}).filter(([id]) => TARGETS.includes(id))),
      queue: Array.isArray(o.queue) ? o.queue.filter((j) => TARGETS.includes(j.target)) : [],
      active: Object.fromEntries(Object.entries(o.active ?? {}).filter(([id, j]) => workers.some((m) => m.id === id) && TARGETS.includes(j.target))),
      where: o.where ?? {},
      shift: o.shift ?? {},
      stats: { ...f.stats, ...(o.stats ?? {}) },
      log: Array.isArray(o.log) ? o.log.slice(0, LOG_MAX) : [],
    };
  }

  const eff = (id) => (s.offline[id] ? 0 : workingShare(s.cond[id] ?? CONDITION.start));
  const shedShare = () => eff(R.shed);
  // Job minutes for this worker's stats (k, ÷ the Maintenance Shed's working bonus).
  function minutesFor(kind, stats = {}) {
    const k = Math.max(0.1, R.base - (stats.skill ?? 0) / R.skillDiv - (stats.speed ?? 0) / R.speedDiv);
    return r2(((kind === 'repair' ? R.repairMinutes : R.serviceMinutes) * k) / (1 + R.shedBonus * shedShare()));
  }
  const walkTiles = (from, to) => findPath(grid, doorOf(from), doorOf(to))?.length ?? 0;
  const capacityLeft = (m, ws) => R.shiftMinutes - (s.shift[m.id]?.key === ws ? s.shift[m.id].used : 0);
  const canStart = (m, t) => {
    if (s.active[m.id]) return false;
    const ws = windowAt(m.pattern, t);
    return ws != null && capacityLeft(m, ws) > 1e-9;
  };
  const busy = (id) => Object.values(s.active).some((j) => j.target === id);
  const queued = (id) => s.queue.some((j) => j.target === id);
  // The order the next pick takes: repairs (priority first, then oldest), Service now jobs (oldest), then preventive
  // service of anything under serviceBelow that isn't offline, queued or being worked on (lowest first).
  function ordered() {
    const rep = s.queue.filter((j) => j.kind === 'repair').sort((a, b) => (b.priority ? 1 : 0) - (a.priority ? 1 : 0) || a.created - b.created || ORDER[a.target] - ORDER[b.target]);
    const asked = s.queue.filter((j) => j.kind === 'service').sort((a, b) => a.created - b.created || ORDER[a.target] - ORDER[b.target]);
    const auto = TARGETS.filter((id) => !s.offline[id] && s.cond[id] < R.serviceBelow && !queued(id) && !busy(id))
      .sort((a, b) => s.cond[a] - s.cond[b] || ORDER[a] - ORDER[b])
      .map((id) => ({ id: null, target: id, kind: 'service', created: s.at, auto: true }));
    return [...rep, ...asked, ...auto].filter((j) => !busy(j.target));
  }

  function start(m, q, t) {
    const ws = windowAt(m.pattern, t);
    if (s.shift[m.id]?.key !== ws) {
      s.shift[m.id] = { key: ws, used: 0 }; // a new shift: from the Maintenance Shed
      s.where[m.id] = null;
    }
    const from = s.where[m.id] ?? m.station ?? R.shed;
    const walk = r2(walkTiles(from, q.target) * R.walkPerTile);
    const work = minutesFor(q.kind, m.stats);
    const cost = costOf(q.target, q.kind);
    const day = Math.floor(t / MINUTES_PER_DAY);
    const job = { id: q.id ?? `M${s.nextId++}`, target: q.target, kind: q.kind, created: q.created, priority: !!q.priority, auto: !!q.auto, staff: m.id, start: t, walk, work, arrive: r2(t + walk), end: r2(t + walk + work), cost, phase: 'walk' };
    s.queue = s.queue.filter((x) => x !== q);
    s.active[m.id] = job;
    s.shift[m.id].used = r2(s.shift[m.id].used + walk + work);
    s.stats.walkMin = r2(s.stats.walkMin + walk);
    s.stats.workMin = r2(s.stats.workMin + work);
    if (q.kind === 'repair') s.stats.repairCost += cost;
    else s.stats.partsCost += cost;
    finance?.spend(q.kind === 'repair' ? 'repairs' : 'parts', cost, day, q.target);
    starts.push({ ...job });
    if (starts.length > MAX_STARTS) starts.shift();
    bus?.emit('mt:start', { job: { ...job } });
    if (walk <= 0) job.phase = 'work';
  }
  function tryStart() {
    let any = false;
    for (const m of workers) {
      if (!canStart(m, s.at)) continue;
      const q = ordered()[0];
      if (!q) break;
      start(m, q, s.at);
      any = true;
    }
    return any;
  }
  function finish(job) {
    delete s.active[job.staff];
    s.where[job.staff] = job.target;
    const id = job.target;
    if (job.kind === 'repair') {
      s.cond[id] = Math.max(s.cond[id], R.repairTo);
      delete s.offline[id];
      s.stats.repairs++;
      if (isRoom(id)) bookings?.roomRepaired(id, job.end);
    } else {
      if (!s.offline[id]) s.cond[id] = Math.min(CONDITION.max, r2(s.cond[id] + R.serviceAdd));
      s.stats.services++;
    }
    bus?.emit('mt:done', { job: { ...job } });
  }
  function nextEvent() {
    let t = Infinity;
    for (const j of Object.values(s.active)) t = Math.min(t, j.phase === 'walk' ? j.arrive : j.end);
    if (ordered().length) for (const m of workers) if (!s.active[m.id]) t = Math.min(t, nextShiftAfter(m.pattern, s.at));
    return t;
  }

  // It breaks down (a roll, Condition 0, or a test): offline, a repair job queued (a Service now for it is dropped).
  function breakDown(id, minute, why) {
    if (s.offline[id]) return false;
    s.offline[id] = true;
    s.queue = s.queue.filter((j) => j.target !== id);
    s.queue.push({ id: `M${s.nextId++}`, target: id, kind: 'repair', created: minute, priority: false });
    s.stats.breakdowns++;
    s.log.unshift({ id, minute: r2(minute), day: Math.floor(minute / MINUTES_PER_DAY), cond: s.cond[id], why });
    if (s.log.length > LOG_MAX) s.log.length = LOG_MAX;
    bus?.emit('mt:breakdown', { id, minute, why });
    if (isRoom(id)) bookings?.roomBroken(id, minute);
    else cp?.onFacilityBreakdown?.(id, minute);
    return true;
  }
  // The worst working share each staying party has seen (their room, the pool, the café): their review counts it.
  function markStays(bk) {
    for (const b of bk?.staying ?? []) {
      const c = (b.cond ??= {});
      c.room = Math.min(c.room ?? 1, eff(b.room));
      for (const f of STAY_FACILITIES) c[f] = Math.min(c[f] ?? 1, eff(f));
    }
  }
  // The day change into `day`: the wear of the day just ended, then the breakdown rolls, then the stays are marked.
  function dayChange(day, bk) {
    if (R.noWear) return markStays(bk); // (rules.noWear: ?debug=1&maint=0 — the older milestones' browser runs)
    const stay = bk?.staying ?? [];
    const occupied = new Set(stay.map((b) => b.room));
    const guests = stay.reduce((t, b) => t + (b.party ?? 1), 0);
    for (const id of TARGETS) {
      const users = WEAR.users.includes(id) && !s.offline[id] ? guests : 0;
      s.cond[id] = Math.max(0, r2(s.cond[id] - dailyWear(id, { occupied: occupied.has(id), users })));
    }
    s.stats.wearDays++;
    const minute = minuteOf(day, BAND.night);
    for (const id of TARGETS) {
      if (s.offline[id] || busy(id)) continue; // (someone working on it right now: it holds)
      if (s.cond[id] <= 0) breakDown(id, minute, 'worn out');
      else {
        const p = breakdownChance(s.cond[id]);
        if (p > 0 && new Rng(`${seed}:breakdown:${id}:${day}`).next() < p) breakDown(id, minute, 'roll');
      }
    }
    s.stats.lowest = Math.min(s.stats.lowest, ...TARGETS.map((id) => s.cond[id]));
    markStays(bk);
  }

  const mt = {
    // Every job event before `minute`, in order (as housekeeping).
    advance(minute) {
      if (!(minute > s.at)) return 0;
      let n = 0;
      for (let guard = 0; guard < 100000; guard++) {
        if (tryStart()) n++;
        const t = nextEvent();
        if (!(t < minute)) break;
        s.at = t;
        for (const m of workers) {
          const j = s.active[m.id];
          if (j?.phase === 'walk' && j.arrive === t) j.phase = 'work';
          if (j?.phase === 'work' && j.end === t) finish(j);
        }
        n++;
      }
      s.at = minute;
      if (n) changed();
      return n;
    },
    // A band begins (the booking system calls it after its own edge): the day change takes the wear and rolls breakdowns.
    onEdge(day, band, bk) {
      if (band !== BAND.night || day <= 0) return;
      dayChange(day, bk);
      tryStart();
      changed();
    },
    // The player asks for a preventive service now (it goes after the repairs).
    serviceNow(id) {
      if (!TARGETS.includes(id)) return { ok: false, why: 'Unknown.' };
      if (s.offline[id]) return { ok: false, why: 'It’s broken: the repair is already in the queue.' };
      if (queued(id) || busy(id)) return { ok: false, why: 'Maintenance is already on it.' };
      if (s.cond[id] >= CONDITION.max) return { ok: false, why: 'It’s in perfect condition.' };
      s.queue.push({ id: `M${s.nextId++}`, target: id, kind: 'service', created: s.at, asked: true });
      bus?.emit('mt:service', { id });
      tryStart();
      changed();
      return { ok: true };
    },
    // (A breakdown complaint's Maintenance priority) its repair jumps the line.
    prioritize(id) {
      const j = s.queue.find((x) => x.target === id && x.kind === 'repair');
      if (!j && !Object.values(s.active).some((x) => x.target === id && x.kind === 'repair')) return false;
      if (j) j.priority = true;
      else for (const x of Object.values(s.active)) if (x.target === id) x.priority = true;
      tryStart();
      changed();
      return true;
    },
    isPriority: (id) => s.queue.some((j) => j.target === id && j.priority) || Object.values(s.active).some((j) => j.target === id && j.priority),
    attachComplaints(c) {
      cp = c;
    },
    condition: (id) => s.cond[id] ?? CONDITION.start,
    eff,
    isOffline: (id) => !!s.offline[id],
    isWorn: (id) => !s.offline[id] && (s.cond[id] ?? CONDITION.start) < CONDITION.full,
    // The plain line: "Good", "Worn: working at 80%", "Broken: offline".
    words(id) {
      if (s.offline[id]) return COND_TEXT.broken;
      const c = s.cond[id] ?? CONDITION.start;
      return c >= CONDITION.full ? COND_TEXT.good : COND_TEXT.worn(Math.round(workingShare(c) * 100));
    },
    // The job on this thing: active (with who and time left) or queued (its place), or null.
    jobFor(id) {
      const a = Object.values(s.active).find((j) => j.target === id);
      if (a) return { ...a, active: true, who: workers.find((m) => m.id === a.staff)?.name ?? a.staff, left: Math.max(0, r2(a.end - s.at)) };
      const q = s.queue.find((j) => j.target === id);
      return q ? { ...q, active: false, place: mt.queuePosition(id) } : null;
    },
    hasJob: (id) => queued(id) || busy(id),
    // 1-based place in the line (queued jobs and the preventive picks), or 0.
    queuePosition: (id) => ordered().findIndex((j) => j.target === id) + 1,
    jobOf(staffId) {
      const j = s.active[staffId];
      return j ? { ...j, left: Math.max(0, r2(j.end - s.at)) } : null;
    },
    onShift: (staffId) => {
      const m = workers.find((x) => x.id === staffId);
      return !!m && windowAt(m.pattern, s.at) != null;
    },
    minutesFor,
    costOf,
    // Tests / debug: set a Condition (≤ 0 breaks it at once), or break it now.
    setCondition(id, v) {
      if (!TARGETS.includes(id)) return false;
      s.cond[id] = Math.max(0, Math.min(CONDITION.max, v));
      if (s.cond[id] <= 0) breakDown(id, s.at, 'worn out');
      tryStart();
      changed();
      return true;
    },
    breakNow(id) {
      const ok = TARGETS.includes(id) && breakDown(id, s.at, 'test');
      if (ok) {
        s.cond[id] = Math.min(s.cond[id], CONDITION.half - 1);
        tryStart();
        changed();
      }
      return ok;
    },
    get workers() {
      return workers;
    },
    get queue() {
      return ordered().map((j) => ({ ...j }));
    },
    get active() {
      return Object.values(s.active).map((j) => ({ ...j }));
    },
    get offline() {
      return Object.keys(s.offline);
    },
    get conditions() {
      return { ...s.cond };
    },
    get stats() {
      return { ...s.stats };
    },
    get log() {
      return s.log;
    },
    get at() {
      return s.at;
    },
    get version() {
      return version;
    },
    starts,
    rules: R,
    serialize: () => clone(s),
  };
  return mt;
}
