// Housekeeping / laundry (Milestone 4, bible §11 / §27C / §27E / §27G). Every check-out leaves a Dirty room → a cleaning
// job in the queue (oldest first; a room with a party arriving today — or already waiting — jumps the queue). A
// housekeeper on shift takes the next job, walks to the room (1 game minute a tile, from the Laundry Room at the start of
// a shift, else from the last room), cleans it (the room is Cleaning) and it turns Ready (or Reserved for its next
// booking, or the waiting party checks in). Clean minutes = base clean minutes × (1.30 − Speed/200 − Skill/400) × linen
// factor. A shift is 8 game hours of work (walks count); a job started inside it is always finished. F04 Laundry: 50 linen
// units each Morning, 4 per room turn; out of linen → ×1.5 and the room is marked short on linen.
// Plain, saved state in game minutes, moved on event by event (a job's arrival at the room, its end, a shift starting),
// never frame by frame — so the same seed gives the same jobs and the same late rooms at every speed and frame size.
//   createHousekeeping({ saved, team, bookings, bus, rules }) → hk (bookings.attach(hk) wires it to the booking edges)
//     saved: a serialize() (or null: a fresh state at bookings.at, with a job for every room already Dirty)
//     hk.advance(minute) — run every event before `minute` (the screen calls it each frame with calendar.minute; the
//       booking system calls it at each band edge before that edge happens)
//     hk.onEdge(day, band) — a band begins (Morning: the linen is restocked)
//     hk.enqueue(roomIds) — new Dirty rooms (check-outs) · hk.cancelRoom(id) (debug "Rooms Ready")
//     hk.hasJob(id) · queuePosition(id) · jobOf(staffId) · cleaningOf(roomId) · isShort(roomId) · housekeepers ·
//     queue · linen · stats · starts (recent job starts, for the walker on the map) · at · serialize()
//   On the bus: 'hk:start' { job } · 'hk:arrive' { job } · 'hk:done' { job } · 'hk:change'
import { Grid } from '../../../../core/Grid.js';
import { findPath } from '../../../../core/Pathing.js';
import { LOT, FACILITIES, ROOMS, roomById } from '../../data/lot.js';
import { ROOM_TYPES } from '../../data/bookings.js';
import { CLEAN, LINEN } from '../../data/housekeeping.js';
import { PATTERNS } from '../../data/staff.js';
import { BANDS } from '../../data/calendar.js';
import { MINUTES_PER_DAY, bandStartMinute, bandEndMinute, minuteOf } from './calendar.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
const r2 = (x) => Math.round(x * 100) / 100;
const BAND_I = Object.fromEntries(BANDS.map((b, i) => [b.id, i]));
const MAX_STARTS = 40;

// The lot's hidden grid (the same one the walkers use): every facility and room blocks its footprint.
export function lotGrid() {
  const grid = new Grid({ cols: LOT.cols, rows: LOT.rows, tileSize: LOT.cell });
  grid.pathCache = new Map();
  for (const it of [...FACILITIES, ...ROOMS]) grid.blockRect(it.fp.col, it.fp.row, it.fp.w, it.fp.h);
  return grid;
}
const doorOf = (id) => (roomById(id) ?? FACILITIES.find((f) => f.id === id))?.door ?? null;

// A work pattern's shift each day: where it starts (minute of the day) and how long the window is (Night wraps).
function shiftWindow(patternId) {
  const bands = (PATTERNS[patternId] ?? PATTERNS.day).bands.map((b) => BAND_I[b]);
  const start = bandStartMinute(bands[0]);
  const len = bands.reduce((t, i) => t + (bandEndMinute(i) - bandStartMinute(i)), 0);
  return { start, len };
}
// The shift window holding minute t (its start), or null when off shift.
function windowAt(patternId, t) {
  const w = shiftWindow(patternId);
  const d = Math.floor(t / MINUTES_PER_DAY);
  for (const day of [d, d - 1]) {
    const ws = day * MINUTES_PER_DAY + w.start;
    if (t >= ws && t < ws + w.len - 1e-9) return ws;
  }
  return null;
}
// The next shift start after minute t.
function nextShiftAfter(patternId, t) {
  const w = shiftWindow(patternId);
  let ws = Math.floor(t / MINUTES_PER_DAY) * MINUTES_PER_DAY + w.start;
  while (ws <= t + 1e-9) ws += MINUTES_PER_DAY;
  return ws;
}

// A fresh state at a minute, with a job for each room already Dirty (a new resort has none; an M3 save may).
export function freshHousekeeping({ minute = minuteOf(0, BAND_I.morning), dirty = [] } = {}) {
  const day = Math.floor(minute / MINUTES_PER_DAY);
  const s = { at: minute, nextId: 1, queue: [], active: {}, where: {}, shift: {}, linen: { day, left: LINEN.perMorning, used: 0, rooms: 0, short: 0 }, shortRooms: {}, stats: { jobs: 0, cleaned: 0, shortCleans: 0, workMin: 0, walkMin: 0 } };
  for (const id of dirty) s.queue.push({ id: `J${s.nextId++}`, room: id, created: minute });
  return s;
}

export function cleanMinutes(roomId, stats, short = false, rules = CLEAN) {
  const rt = ROOM_TYPES[roomById(roomId).typeId];
  const k = Math.max(0.1, rules.base - (stats.speed ?? 0) / rules.speedDiv - (stats.skill ?? 0) / rules.skillDiv);
  return r2(rt.clean * k * (short ? LINEN.shortFactor : 1));
}
export const linenFor = (roomId) => ROOM_TYPES[roomById(roomId).typeId].beds * LINEN.perBed;

export function createHousekeeping({ saved = null, team = [], bookings = null, bus = null, rules = {} } = {}) {
  const R = { ...CLEAN, ...rules };
  const linenCap = rules.linen ?? LINEN.perMorning;
  const hks = team.filter((m) => m.role === 'HK');
  const grid = lotGrid();
  let s = saved ? load(saved) : freshHousekeeping({ minute: bookings ? minuteOf(bookings.at.day, bookings.at.band) : undefined, dirty: bookings ? ROOMS.filter((r) => bookings.roomState(r.id) === 'dirty').map((r) => r.id) : [] });
  const starts = Object.values(s.active).map((j) => ({ ...j })); // (in memory only: the walker catches up from here)
  let version = 0;
  const changed = () => {
    version++;
    bus?.emit('hk:change', {});
  };

  function load(x) {
    const o = clone(x);
    const f = freshHousekeeping({ minute: Number.isFinite(o.at) ? o.at : 0 });
    o.at = f.at;
    o.nextId = Number.isFinite(o.nextId) ? o.nextId : 1;
    o.queue = Array.isArray(o.queue) ? o.queue.filter((j) => roomById(j.room)) : [];
    o.active = Object.fromEntries(Object.entries(o.active ?? {}).filter(([id, j]) => hks.some((m) => m.id === id) && roomById(j.room)));
    o.where = o.where ?? {};
    o.shift = o.shift ?? {};
    o.linen = { ...f.linen, ...(o.linen ?? {}) };
    o.shortRooms = o.shortRooms ?? {};
    o.stats = { ...f.stats, ...(o.stats ?? {}) };
    return o;
  }

  const walkTiles = (from, to) => findPath(grid, doorOf(from), doorOf(to))?.length ?? 0;
  const capacityLeft = (m, ws) => R.shiftMinutes - (s.shift[m.id]?.key === ws ? s.shift[m.id].used : 0);
  const canStart = (m, t) => {
    if (s.active[m.id]) return false;
    const ws = windowAt(m.pattern, t);
    return ws != null && capacityLeft(m, ws) > 1e-9;
  };
  // Oldest first; a room with a party arriving today (or waiting now) jumps the queue; then the lower room number.
  function nextJob(t) {
    const day = Math.floor(t / MINUTES_PER_DAY);
    const due = (j) => (bookings?.arrivalDue(j.room, day) ? 0 : 1);
    return [...s.queue].sort((a, b) => due(a) - due(b) || a.created - b.created || roomById(a.room).number - roomById(b.room).number)[0] ?? null;
  }
  function start(m, q, t) {
    const ws = windowAt(m.pattern, t);
    if (s.shift[m.id]?.key !== ws) {
      s.shift[m.id] = { key: ws, used: 0 }; // a new shift: from the Laundry Room, the full 8 hours
      s.where[m.id] = null;
    }
    const from = s.where[m.id] ?? m.station;
    const walk = r2(walkTiles(from, q.room) * R.walkPerTile);
    const need = linenFor(q.room);
    const short = s.linen.left < need;
    s.linen.used += Math.min(s.linen.left, need);
    s.linen.left = Math.max(0, s.linen.left - need);
    s.linen.rooms++;
    if (short) s.linen.short++;
    const clean = cleanMinutes(q.room, m.stats, short, R);
    const job = { id: q.id, room: q.room, created: q.created, staff: m.id, start: t, walk, clean, arrive: r2(t + walk), end: r2(t + walk + clean), short, phase: 'walk' };
    s.queue = s.queue.filter((x) => x !== q);
    s.active[m.id] = job;
    s.shift[m.id].used = r2(s.shift[m.id].used + walk + clean);
    s.stats.jobs++;
    s.stats.walkMin = r2(s.stats.walkMin + walk);
    s.stats.workMin = r2(s.stats.workMin + clean);
    starts.push({ ...job });
    if (starts.length > MAX_STARTS) starts.shift();
    bus?.emit('hk:start', { job: { ...job } });
    if (walk <= 0) arrive(job);
  }
  function tryStart() {
    let any = false;
    for (const m of hks) {
      if (!s.queue.length) break;
      if (!canStart(m, s.at)) continue;
      start(m, nextJob(s.at), s.at);
      any = true;
    }
    return any;
  }
  function arrive(job) {
    job.phase = 'clean';
    bookings?.roomCleaning(job.room);
    bus?.emit('hk:arrive', { job: { ...job } });
  }
  function finish(job) {
    delete s.active[job.staff];
    s.where[job.staff] = job.room;
    s.stats.cleaned++;
    if (job.short) {
      s.stats.shortCleans++;
      s.shortRooms[job.room] = true;
    } else delete s.shortRooms[job.room];
    bus?.emit('hk:done', { job: { ...job } });
    bookings?.roomReady(job.room, job.end);
  }
  function nextEvent() {
    let t = Infinity;
    for (const j of Object.values(s.active)) t = Math.min(t, j.phase === 'walk' ? j.arrive : j.end);
    if (s.queue.length) for (const m of hks) if (!s.active[m.id]) t = Math.min(t, nextShiftAfter(m.pattern, s.at));
    return t;
  }

  const hk = {
    // Every event before `minute`, in order (events exactly at `minute` wait for the next call, after that minute's band
    // edge has happened).
    advance(minute) {
      if (!(minute > s.at)) return 0;
      let n = 0;
      for (let guard = 0; guard < 100000; guard++) {
        if (tryStart()) n++;
        const t = nextEvent();
        if (!(t < minute)) break;
        s.at = t;
        for (const m of hks) {
          const j = s.active[m.id];
          if (j?.phase === 'walk' && j.arrive === t) arrive(j);
          if (j?.phase === 'clean' && j.end === t) finish(j);
        }
        n++;
      }
      s.at = minute;
      if (n) changed();
      return n;
    },
    onEdge(day, band) {
      if (band === BAND_I.morning && s.linen.day !== day) s.linen = { day, left: linenCap, used: 0, rooms: 0, short: 0 };
    },
    enqueue(ids) {
      for (const id of ids) if (!hk.hasJob(id)) s.queue.push({ id: `J${s.nextId++}`, room: id, created: s.at });
      tryStart();
      changed();
    },
    cancelRoom(id) {
      const n = s.queue.length;
      s.queue = s.queue.filter((j) => j.room !== id);
      let hit = s.queue.length !== n;
      for (const [sid, j] of Object.entries(s.active))
        if (j.room === id) {
          delete s.active[sid];
          s.where[sid] = id;
          hit = true;
        }
      if (hit) changed();
      return hit;
    },
    hasJob: (id) => s.queue.some((j) => j.room === id) || Object.values(s.active).some((j) => j.room === id),
    // 1-based place in the queue (the order the next pick would take), or 0 when not waiting.
    queuePosition(id) {
      const day = Math.floor(s.at / MINUTES_PER_DAY);
      const due = (j) => (bookings?.arrivalDue(j.room, day) ? 0 : 1);
      const order = [...s.queue].sort((a, b) => due(a) - due(b) || a.created - b.created || roomById(a.room).number - roomById(b.room).number);
      return order.findIndex((j) => j.room === id) + 1;
    },
    jobOf: (staffId) => {
      const j = s.active[staffId];
      return j ? { ...j, left: Math.max(0, r2(j.end - s.at)) } : null;
    },
    cleaningOf: (roomId) => {
      const j = Object.values(s.active).find((x) => x.room === roomId);
      return j ? { ...j, who: hks.find((m) => m.id === j.staff)?.name ?? j.staff, left: Math.max(0, r2(j.end - s.at)) } : null;
    },
    isShort: (roomId) => !!s.shortRooms[roomId],
    // The shift hours a housekeeper has left now (0 off shift).
    hoursLeft(staffId) {
      const m = hks.find((x) => x.id === staffId);
      const ws = m && windowAt(m.pattern, s.at);
      return ws == null ? 0 : Math.max(0, capacityLeft(m, ws));
    },
    onShift: (staffId) => {
      const m = hks.find((x) => x.id === staffId);
      return !!m && windowAt(m.pattern, s.at) != null;
    },
    get housekeepers() {
      return hks;
    },
    get queue() {
      return s.queue.map((j) => ({ ...j }));
    },
    get active() {
      return Object.values(s.active).map((j) => ({ ...j }));
    },
    get linen() {
      return { ...s.linen, cap: linenCap };
    },
    get stats() {
      return { ...s.stats };
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
  return hk;
}
