// Auto Schedule, department priorities, fatigue and Staff Wellbeing (Milestone 10, bible §27C). The team (src/systems/
// staff.js loadTeam) is the same list of people every system reads; this module keeps four live numbers on each person:
//   m.pattern   — their work pattern (Day / Late / Night): a pinned one, else Auto Schedule's pick, rebalanced once a game
//                 day (the day change) from the role's default shares (bible §27C), pinned people first
//   m.workload  — their department's priority target (Low 0.75 / Normal 1.00 / High 1.20 / Emergency 1.45): Housekeeping and
//                 Maintenance shift capacity, Front Office desk speed, Hospitality / Activities stat pull (m.statShare)
//   m.pace      — what fatigue leaves of their work (1; 0.9 over 75; 0.75 over 90): job and desk minutes ÷ pace
//   m.statShare — the share of their stats the stay scores feel: pace (× workload for Hospitality / Activities)
//   m.absent    — away today (fatigue over 90 at the day change, a seeded roll): they work no band
// and m.fatigue (0–100), moved at every band edge for the band just ended (data/staffing.js FATIGUE).
// Staff Wellbeing (headline score) = base − 0.5 × the team's average fatigue over the last 28 days − Emergency days.
// Plain, saved state moved only by the booking system's band edges (bookings.attachStaffing(st)), so the same seed gives
// the same fatigue, absences and patterns at every speed and frame size.
//   createStaffing({ saved, team, seed, bus, day, band }) → st
//     st.onEdge(day, band) · setPriority(role, id) · priority(role) · pin(memberId, pattern | null) · pinned(memberId)
//     fatigue(memberId) · wellbeing() · rows (one per person, for the sheets) · stats · serialize()
//   On the bus: 'staff:change' · 'staff:absent' { id, day } · 'staff:priority' { role, id } (asks for a save)
import { Rng } from '../../../../core/Rng.js';
import { BANDS } from '../../data/calendar.js';
import { PATTERNS, ROLE_PATTERN_SHARES } from '../../data/staff.js';
import { PRIORITIES, DEFAULT_PRIORITY, FATIGUE, EMERGENCY, WELLBEING, HIRING, priorityById } from '../../data/staffing.js';
import { EARLY_STAFF } from '../../data/staff.js';
import { makeHire, memberFrom } from './staff.js';
import { STAFF_ROLES } from '../../data/lot.js';
import { onShiftAt } from './staff.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
const r2 = (x) => Math.round(x * 100) / 100;
const clamp = (x) => Math.max(0, Math.min(100, x));
const NIGHT = BANDS.findIndex((b) => b.id === 'night');
const ROLE_IDS = Object.keys(STAFF_ROLES);
const STAT_ROLES = new Set(['HS', 'AE']); // their priority works through their stats
const PATTERN_ORDER = ['day', 'late', 'night'];

// Auto Schedule for one role of n people, k of them already pinned (counts by pattern): how many of the unpinned go on
// each pattern — the role's shares × n by largest remainder (ties: Day, Late, Night), less the pinned ones, then any left
// over to the pattern with the biggest share.
export function patternCounts(role, n, pinnedCounts = {}) {
  const shares = ROLE_PATTERN_SHARES[role] ?? { day: 100 };
  const total = Object.values(shares).reduce((t, x) => t + x, 0);
  const raw = PATTERN_ORDER.map((p) => ({ p, x: (n * (shares[p] ?? 0)) / total }));
  const out = Object.fromEntries(raw.map((r) => [r.p, Math.floor(r.x)]));
  let left = n - Object.values(out).reduce((t, x) => t + x, 0);
  for (const r of [...raw].sort((a, b) => b.x - Math.floor(b.x) - (a.x - Math.floor(a.x)) || PATTERN_ORDER.indexOf(a.p) - PATTERN_ORDER.indexOf(b.p))) {
    if (left <= 0) break;
    out[r.p]++;
    left--;
  }
  let free = 0;
  for (const p of PATTERN_ORDER) {
    const take = Math.min(out[p], pinnedCounts[p] ?? 0);
    out[p] -= take;
    free += (pinnedCounts[p] ?? 0) - take;
  }
  // pinned people beyond their pattern's share take places from the others, biggest share last
  for (const p of [...PATTERN_ORDER].sort((a, b) => (shares[a] ?? 0) - (shares[b] ?? 0)))
    while (free > 0 && out[p] > 0) {
      out[p]--;
      free--;
    }
  return out;
}

export function freshStaffing({ day = 0, band = 1 } = {}) {
  return { at: { day, band }, priority: {}, pins: {}, patterns: {}, fatigue: {}, peak: {}, absent: {}, streak: {}, days: [], today: { sum: 0, n: 0, em: 0 }, stats: { absences: 0, tiredBands: 0, emergencyDays: 0, rebalances: 0 } };
}

export function createStaffing({ saved = null, team = [], seed = 'resortworks', bus = null, day = 0, band = 'morning' } = {}) {
  const s = load(saved);
  let version = 0;
  const changed = () => {
    version++;
    bus?.emit('staff:change', {});
  };

  function load(x) {
    const f = freshStaffing({ day, band: typeof band === 'number' ? band : BANDS.findIndex((b) => b.id === band) });
    if (!x) return f;
    const o = clone(x);
    const ids = new Set(team.map((m) => m.id));
    return {
      at: o.at && Number.isFinite(o.at.day) && Number.isFinite(o.at.band) ? o.at : f.at,
      priority: Object.fromEntries(Object.entries(o.priority ?? {}).filter(([r, p]) => ROLE_IDS.includes(r) && priorityById(p))),
      pins: Object.fromEntries(Object.entries(o.pins ?? {}).filter(([id, p]) => ids.has(id) && PATTERNS[p])),
      patterns: Object.fromEntries(Object.entries(o.patterns ?? {}).filter(([id, p]) => ids.has(id) && PATTERNS[p])),
      fatigue: Object.fromEntries(Object.entries(o.fatigue ?? {}).filter(([id, v]) => ids.has(id) && Number.isFinite(v)).map(([id, v]) => [id, clamp(v)])),
      peak: Object.fromEntries(Object.entries(o.peak ?? {}).filter(([id, v]) => ids.has(id) && Number.isFinite(v))),
      absent: Object.fromEntries(Object.entries(o.absent ?? {}).filter(([id, d]) => ids.has(id) && Number.isFinite(d))),
      streak: Object.fromEntries(Object.entries(o.streak ?? {}).filter(([r, n]) => ROLE_IDS.includes(r) && Number.isFinite(n))),
      days: Array.isArray(o.days) ? o.days.filter((d) => Number.isFinite(d?.day)).slice(-WELLBEING.window) : [],
      today: { ...f.today, ...(o.today ?? {}) },
      stats: { ...f.stats, ...(o.stats ?? {}) },
    };
  }

  const priorityOf = (role) => priorityById(s.priority[role] ?? DEFAULT_PRIORITY);
  const fatigueOf = (id) => s.fatigue[id] ?? 0;
  const paceAt = (f) => (f > FATIGUE.worn ? FATIGUE.wornShare : f > FATIGUE.tired ? FATIGUE.tiredShare : 1);
  // The live numbers on each person (every system reads them from the team).
  function apply() {
    for (const m of team) {
      const pr = priorityOf(m.role);
      m.fatigue = fatigueOf(m.id);
      m.pace = paceAt(m.fatigue);
      m.workload = pr.target;
      m.statShare = r2(m.pace * (STAT_ROLES.has(m.role) ? pr.target : 1));
      m.absent = s.absent[m.id] === s.at.day;
    }
  }
  // Auto Schedule: pinned people keep their pattern; the rest of each role share out the role's default split, the most
  // rested first onto the role's most common pattern.
  function rebalance() {
    for (const role of ROLE_IDS) {
      const people = team.filter((m) => m.role === role);
      if (!people.length) continue;
      const pinnedCounts = {};
      for (const m of people)
        if (s.pins[m.id]) {
          m.pattern = s.pins[m.id];
          pinnedCounts[m.pattern] = (pinnedCounts[m.pattern] ?? 0) + 1;
        }
      const free = people.filter((m) => !s.pins[m.id]).sort((a, b) => fatigueOf(a.id) - fatigueOf(b.id) || (a.id < b.id ? -1 : 1));
      const counts = patternCounts(role, people.length, pinnedCounts);
      const shares = ROLE_PATTERN_SHARES[role] ?? { day: 100 };
      const order = [...PATTERN_ORDER].sort((a, b) => (shares[b] ?? 0) - (shares[a] ?? 0));
      let i = 0;
      for (const p of order) for (let k = 0; k < counts[p] && i < free.length; k++) free[i++].pattern = p;
      while (i < free.length) free[i++].pattern = order[0];
    }
    s.patterns = Object.fromEntries(team.map((m) => [m.id, m.pattern]));
    s.stats.rebalances++;
  }
  // A save keeps today's patterns (so a reload mid-day changes nobody's shift); a new one, or new people, are scheduled now.
  if (team.every((m) => s.patterns[m.id])) for (const m of team) m.pattern = s.pins[m.id] ?? s.patterns[m.id];
  else rebalance();
  apply();

  // Fatigue for the band just ended (the edge (day, band) has just begun).
  function bandEnded(day, band) {
    const prev = band === 0 ? { day: day - 1, band: BANDS.length - 1 } : { day, band: band - 1 };
    const bandId = BANDS[prev.band].id;
    let sum = 0;
    for (const m of team) {
      const away = s.absent[m.id] === prev.day;
      const working = !away && onShiftAt(m.pattern, bandId);
      const f0 = fatigueOf(m.id);
      const pr = priorityOf(m.role);
      const extra = pr.extra * (pr.id === 'emergency' && (s.streak[m.role] ?? 0) > EMERGENCY.maxDays ? 2 : 1);
      const add = working ? (FATIGUE.work + extra) * (1 - (m.stats?.stamina ?? 0) / FATIGUE.staminaDiv) : -FATIGUE.rest;
      const f = r2(clamp(f0 + add));
      s.fatigue[m.id] = f;
      s.peak[m.id] = Math.max(s.peak[m.id] ?? 0, f);
      if (working && f > FATIGUE.tired) s.stats.tiredBands++;
      sum += f;
    }
    if (team.length) {
      s.today.sum = r2(s.today.sum + sum / team.length);
      s.today.n++;
    }
  }
  // The day change: the day just ended goes into the Wellbeing window, Emergency streaks move, absences are rolled for
  // the new day, then Auto Schedule rebalances.
  function dayChange(day) {
    let em = 0;
    for (const role of ROLE_IDS) {
      if (!team.some((m) => m.role === role)) continue;
      if (priorityOf(role).id === 'emergency') {
        s.streak[role] = (s.streak[role] ?? 0) + 1;
        em += WELLBEING.emergencyDay * (s.streak[role] > EMERGENCY.maxDays ? 2 : 1);
        s.stats.emergencyDays++;
      } else s.streak[role] = 0;
    }
    s.days.push({ day: day - 1, fat: s.today.n ? r2(s.today.sum / s.today.n) : avgNow(), em });
    if (s.days.length > WELLBEING.window) s.days.shift();
    s.today = { sum: 0, n: 0, em: 0 };
    for (const id of Object.keys(s.absent)) if (s.absent[id] < day) delete s.absent[id];
    // (the day's peak: a Day worker has rested through the Evening by the day change)
    for (const m of team)
      if ((s.peak[m.id] ?? 0) > FATIGUE.worn && new Rng(`${seed}:absent:${m.id}:${day}`).next() < FATIGUE.absentChance) {
        s.absent[m.id] = day;
        s.stats.absences++;
        bus?.emit('staff:absent', { id: m.id, day });
      }
    s.peak = {};
    rebalance();
  }
  const avgNow = () => (team.length ? r2(team.reduce((t, m) => t + fatigueOf(m.id), 0) / team.length) : 0);

  const st = {
    // A band begins (the booking system calls it at every edge, in order, before the edge happens).
    onEdge(day, band) {
      bandEnded(day, band);
      if (band === NIGHT) {
        s.at = { day, band };
        dayChange(day);
      }
      s.at = { day, band };
      apply();
      changed();
    },
    setPriority(role, id) {
      if (!ROLE_IDS.includes(role) || !priorityById(id) || priorityOf(role).id === id) return false;
      if (id === DEFAULT_PRIORITY) delete s.priority[role];
      else s.priority[role] = id;
      if (id !== 'emergency') s.streak[role] = 0;
      apply();
      changed();
      bus?.emit('staff:priority', { role, id });
      return true;
    },
    priority: (role) => priorityOf(role).id,
    // Pin a person's work pattern (null: back to Auto Schedule). Takes effect at once.
    pin(memberId, pattern) {
      const m = team.find((x) => x.id === memberId);
      if (!m || (pattern != null && !PATTERNS[pattern])) return false;
      if (pattern == null) delete s.pins[memberId];
      else s.pins[memberId] = pattern;
      rebalance();
      apply();
      changed();
      bus?.emit('staff:priority', { role: m.role, id: null });
      return true;
    },
    pinned: (memberId) => s.pins[memberId] ?? null,
    // (Milestone 11) someone new has joined the team (hireStaff): Auto Schedule gives them a pattern now.
    joined() {
      rebalance();
      apply();
      changed();
    },
    fatigue: fatigueOf,
    // Staff Wellbeing now (two decimals).
    wellbeing() {
      const fat = s.days.length ? s.days.reduce((t, d) => t + d.fat, 0) / s.days.length : avgNow();
      const em = s.days.reduce((t, d) => t + d.em, 0);
      return r2(clamp(WELLBEING.base - WELLBEING.perFatigue * fat - em));
    },
    get rows() {
      return team.map((m) => ({ id: m.id, name: m.name, role: m.role, pattern: m.pattern, pinned: s.pins[m.id] ?? null, fatigue: fatigueOf(m.id), pace: m.pace, absent: !!m.absent }));
    },
    get priorities() {
      return Object.fromEntries(ROLE_IDS.map((r) => [r, priorityOf(r).id]));
    },
    streak: (role) => s.streak[role] ?? 0,
    get stats() {
      return { ...s.stats };
    },
    get at() {
      return { ...s.at };
    },
    get version() {
      return version;
    },
    serialize: () => clone(s),
  };
  return st;
}
export { PRIORITIES };

// (Milestone 11) Who can be hired now: the Early staff not on the team, while it has fewer than HIRING.cap people.
export const hireable = (team) => (team.length >= HIRING.cap ? [] : EARLY_STAFF.filter((e) => !team.some((m) => m.id === e.id)));
// Why this person can't be hired (one plain line), or null.
export function hireWhy(team, id, cash = Infinity) {
  if (!EARLY_STAFF.some((e) => e.id === id)) return 'Not someone you can hire yet.';
  if (team.some((m) => m.id === id)) return 'Already on your team.';
  if (team.length >= HIRING.cap) return `Your team is full (${HIRING.cap} people).`;
  if (cash < HIRING.fee) return `Hiring costs ${HIRING.fee} Cr.`;
  return null;
}
// Hire one of the Early staff: the fee on the ledger, them on the team (the same list every system reads), housekeeping
// and maintenance told, Auto Schedule's pattern for them. run: { team, staffing, finance, housekeeping, maintenance, seed,
// day, bus }. → { ok, member?, why? }
export function hireStaff(run, id) {
  const why = hireWhy(run.team, id, run.finance?.cash ?? Infinity);
  if (why) return { ok: false, why };
  const founderId = run.team.find((m) => m.founder)?.id ?? null;
  const m = memberFrom(makeHire(run.seed, id), founderId);
  run.team.push(m);
  run.finance?.spend('hiring', HIRING.fee, run.day);
  run.housekeeping?.refresh();
  run.maintenance?.refresh();
  run.staffing?.joined();
  run.bus?.emit('staff:hired', { id });
  return { ok: true, member: m };
}
