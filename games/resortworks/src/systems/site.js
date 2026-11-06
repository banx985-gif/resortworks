// Build Mode / expansions (Milestone 12, bible §6 / §20 / §21 / §27A / §27G / §27M): what stands on the resort's land and
// where. The player places, moves and sells rooms and facilities on the hidden grid and buys the next strip of land.
//   Construction: the Credits leave at once; the plot shows a code-drawn scaffold for the build days (game minutes from
//   the moment it was ordered); cancelling refunds 70% before half the build time, 35% after. Selling returns 50% of all
//   that was spent on it (build + upgrades). Moving is free; the thing is closed for one game day.
//   Walkability: no placement may leave any room door, any facility (Reception and Parking included) or a plot under
//   construction unreachable along the lanes from the road. A refused placement says why in one plain line.
//   Upgrades (Lv1–Lv3, used by Milestones 15 / 16): cost and days from data/build.js, the facility Rank gates.
// One resort is open at a time: the live lists data/lot.js FACILITIES / ROOMS (what is open now) and the grid are this
// module's, rewritten in place on every change (setLive), so every system reading them follows what the player builds.
// Each change bumps siteVersion(); grids and the walking world are remade for the new version.
//   freshSite() → the shipped Roadside Lot (the save's `site`)
//   createSite({ saved, bus, now, finance, reviews, bookings, maintenance, progress }) → site
//     site.check(kind, def, col, row, { moving }) → { ok, why, fp, door } · build(kind, def, col, row) · move(id, col, row)
//     sell(id) · sellValue(id) · cancel(jobId) · cancelValue(jobId) · upgrade(id) · upgradeCost(id) · whyNoUpgrade(id)
//     buyLand(id) · whyNoLand(id) · catalogue() (the build list) · items · jobs · itemById(id) · jobFor(id)
//     isClosed(id) · progressOf(job) (0–1) · onEdge(day, band) · onChange(fn) · serialize()
import { Grid } from '../../../../core/Grid.js';
import { LOT, FACILITIES, ROOMS, START_FACILITIES, START_ROOMS, makeRoom } from '../../data/lot.js';
import { GRID, LAND, landById, ROOM_BUILD, FACILITY_BUILD, CONSTRUCTION, UPGRADE, LEVEL_RANKS, stageById, stageIndex, rankAtLeast, DOUGIE } from '../../data/build.js';
import { FACILITY_INFO } from '../../data/facilities.js';
import { ROOM_TYPES } from '../../data/bookings.js';
import { MINUTES_PER_DAY } from './calendar.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
const fmt = (n) => Math.round(n).toLocaleString('en-GB');

// --- the live land (module-level: the one resort open) ---------------------------------------------------------------
const LIVE = { version: 0, land: ['roadside'], plots: [] }; // plots: footprints under construction (not open yet)
let gridMemo = null;
export const siteVersion = () => LIVE.version;
export const ownedLand = () => [...LIVE.land];
const colOwned = (c, land = LIVE.land) => land.some((id) => {
  const l = landById(id);
  return !!l?.cols && c >= l.cols[0] && c <= l.cols[1];
});
export const tileOwned = (col, row) => row >= 0 && row < GRID.rows && colOwned(col);
// The bare land: the whole grid, unowned columns blocked.
function landGrid(land = LIVE.land) {
  const g = new Grid({ cols: GRID.cols, rows: GRID.rows, tileSize: LOT.cell });
  for (let c = 0; c < GRID.cols; c++) if (!colOwned(c, land)) g.blockRect(c, 0, 1, GRID.rows);
  return g;
}
// The lot's hidden grid (the walkers', housekeeping's and maintenance's): unowned land, every open facility and room and
// every plot under construction blocked. One per site version (path cache with it).
export function lotGrid() {
  if (gridMemo?.version === LIVE.version) return gridMemo.grid;
  const grid = landGrid();
  grid.pathCache = new Map();
  for (const it of [...FACILITIES, ...ROOMS]) grid.blockRect(it.fp.col, it.fp.row, it.fp.w, it.fp.h);
  for (const fp of LIVE.plots) grid.blockRect(fp.col, fp.row, fp.w, fp.h);
  gridMemo = { version: LIVE.version, grid };
  return grid;
}
// A grid for any list of footprints (the layout's test arrangements): unowned land and plots under construction blocked.
export function gridFor(fps) {
  const g = landGrid();
  for (const fp of [...fps, ...LIVE.plots]) g.blockRect(fp.col, fp.row, fp.w, fp.h);
  return g;
}

// A saved item → the live list's entry (a facility's def, or a room).
function liveDef(it) {
  if (it.kind === 'room') return { ...makeRoom(it.number, it.def, ROOM_TYPES[it.def]?.name ?? it.def, it.fp, it.door), level: it.level ?? 1 };
  const info = FACILITY_INFO[it.def];
  return { id: it.id, name: info.name, art: info.art, fp: { ...it.fp }, door: { ...it.door }, line: info.line, level: it.level ?? 1 };
}
// Rewrite the live lists from a site state (open items only; plots under construction block the grid).
export function setLive(state) {
  const open = state.items.filter((it) => it.open);
  FACILITIES.splice(0, FACILITIES.length, ...open.filter((it) => it.kind === 'facility').map(liveDef));
  ROOMS.splice(0, ROOMS.length, ...open.filter((it) => it.kind === 'room').sort((a, b) => a.number - b.number).map(liveDef));
  LIVE.land = [...state.land];
  LIVE.plots = state.items.filter((it) => !it.open).map((it) => ({ ...it.fp }));
  LIVE.version++;
}

// The shipped Roadside Lot (bible §27M): the eight facilities and eight rooms, each worth its build cost.
export function freshSite() {
  const items = [
    ...START_FACILITIES.map((f) => ({ id: f.id, kind: 'facility', def: f.id, fp: { ...f.fp }, door: { ...f.door }, level: 1, spent: FACILITY_BUILD[f.id].cost, open: true })),
    ...START_ROOMS.map((r) => ({ id: r.id, kind: 'room', def: r.typeId, number: r.number, fp: { ...r.fp }, door: { ...r.door }, level: 1, spent: ROOM_BUILD[r.typeId].cost, open: true })),
  ];
  return { land: ['roadside'], items, nextRoom: START_ROOMS.length + 1, nextJob: 1, jobs: [], closed: {}, stats: { built: 0, sold: 0, moved: 0, cancelled: 0, upgraded: 0, land: 0, spent: 0, back: 0 } };
}

// Front-face door tiles for a footprint, in the order they are tried (the M1 rule: a door is on a front face).
function doorCandidates(fp) {
  const out = [];
  for (let c = fp.col; c < fp.col + fp.w; c++) out.push({ col: c, row: fp.row + fp.h });
  for (let r = fp.row; r < fp.row + fp.h; r++) out.push({ col: fp.col + fp.w, row: r });
  return out;
}

export function createSite({ saved = null, bus = null, now = () => 0, finance = null, reviews = null, bookings = null, maintenance = null, progress = null } = {}) {
  const s = load(saved);
  const listeners = [];
  setLive(s);
  const dayNow = () => Math.floor(now() / MINUTES_PER_DAY);
  const itemById = (id) => s.items.find((it) => it.id === id) ?? null;
  const nameOf = (it) => (it.kind === 'room' ? `Room ${it.number}` : FACILITY_INFO[it.def]?.name ?? it.def);
  const theName = (it) => (it.kind === 'room' ? nameOf(it) : `the ${nameOf(it)}`);
  const buildOf = (kind, def) => (kind === 'room' ? ROOM_BUILD[def] : FACILITY_BUILD[def]);
  const defName = (kind, def) => (kind === 'room' ? ROOM_TYPES[def]?.name ?? def : FACILITY_INFO[def]?.name ?? def);
  const stage = () => progress?.stage ?? 'roadside';
  const rank = () => reviews?.rank?.id ?? 'E';
  const cash = () => finance?.cash ?? Infinity;

  function changed(what, data = {}) {
    setLive(s);
    bus?.emit('site:change', { what, ...data });
    for (const fn of listeners) fn(what, data);
  }
  const say = (key, it, extra = {}) => {
    const list = DOUGIE.lines[key];
    const line = list[(s.stats.built + s.stats.upgraded + s.stats.land) % list.length].replace('{name}', it ? nameOf(it) : '').replace('{level}', String(extra.level ?? ''));
    bus?.emit('site:dougie', { key, line, id: it?.id ?? null });
  };

  // --- walkability -----------------------------------------------------------------------------------------------
  // Can every door be reached along the lanes from the road (the free tiles on the front row)? items: { id, name, fp, door }.
  // Returns null (all fine) or the first item cut off (its own door blocked counts).
  function cutOff(list, land = LIVE.land) {
    const g = landGrid(land);
    for (const it of list) g.blockRect(it.fp.col, it.fp.row, it.fp.w, it.fp.h);
    for (const it of list) if (g.isBlocked(it.door.col, it.door.row)) return { it, blocked: true };
    const seen = new Uint8Array(g.cols * g.rows);
    const queue = [];
    for (let c = 0; c < g.cols; c++) if (!g.isBlocked(c, g.rows - 1)) {
      seen[(g.rows - 1) * g.cols + c] = 1;
      queue.push([c, g.rows - 1]);
    }
    while (queue.length) {
      const [c, r] = queue.pop();
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = c + dc;
        const nr = r + dr;
        if (g.isBlocked(nc, nr) || seen[nr * g.cols + nc]) continue;
        seen[nr * g.cols + nc] = 1;
        queue.push([nc, nr]);
      }
    }
    for (const it of list) if (!seen[it.door.row * g.cols + it.door.col]) return { it, blocked: false };
    return null;
  }
  const asPlaced = (it) => ({ id: it.id, name: theName(it), fp: it.fp, door: it.door });

  // Where a thing of this kind / def could go with its back corner at (col, row): { ok, why, fp, door }. moving = the id of
  // an item being moved (it leaves its old place).
  function check(kind, def, col, row, { moving = null } = {}) {
    const b = buildOf(kind, def);
    if (!b) return { ok: false, why: 'That can’t be built.' };
    const fp = { col, row, w: b.size, h: b.size };
    const name = defName(kind, def);
    for (let r = row; r < row + fp.h; r++)
      for (let c = col; c < col + fp.w; c++) {
        if (c < 0 || r < 0 || c >= GRID.cols || r >= GRID.rows) return { ok: false, why: 'That goes off the edge of your land.', fp };
        if (!colOwned(c)) return { ok: false, why: landById('garden') && c >= landById('garden').cols[0] && !LIVE.land.includes('garden') ? 'That land isn’t yours yet: buy the Garden Grounds first.' : 'That land isn’t yours.', fp };
      }
    const others = s.items.filter((it) => it.id !== moving);
    const hit = others.find((it) => fp.col < it.fp.col + it.fp.w && it.fp.col < fp.col + fp.w && fp.row < it.fp.row + it.fp.h && it.fp.row < fp.row + fp.h);
    if (hit) return { ok: false, why: `${cap(theName(hit))} is in the way.`, fp };
    const blockedDoor = others.find((it) => it.door.col >= fp.col && it.door.col < fp.col + fp.w && it.door.row >= fp.row && it.door.row < fp.row + fp.h);
    if (blockedDoor) return { ok: false, why: `That would block the way into ${theName(blockedDoor)}.`, fp };
    let first = null;
    for (const door of doorCandidates(fp)) {
      if (door.col >= GRID.cols || door.row >= GRID.rows || !colOwned(door.col)) continue;
      const me = { id: moving ?? 'new', name: `the new ${name}`, fp, door };
      const bad = cutOff([...others.map(asPlaced), me]);
      if (!bad) return { ok: true, why: null, fp, door };
      first ??= bad;
    }
    if (!first || first.it.id === (moving ?? 'new')) return { ok: false, why: 'Its door would face a wall: leave a free lane in front of it.', fp };
    return { ok: false, why: `That would cut ${first.it.name} off from the lanes.`, fp };
  }

  // Why this can't be ordered at all (before where): stage / rank, the room cap, one of each facility, debt, Credits.
  function whyNot(kind, def) {
    const b = buildOf(kind, def);
    if (!b || b.secret) return 'That can’t be built.';
    if (stageIndex(stage()) < stageIndex(b.stage)) return `Opens at the ${stageById(b.stage).name} stage.`;
    if (kind === 'room') {
      const cap = stageById(stage()).rooms;
      if (s.items.filter((it) => it.kind === 'room').length >= cap) return `A ${stageById(stage()).name} has room for ${cap} rooms at most.`;
    } else if (s.items.some((it) => it.def === def)) return `You already have a ${defName(kind, def)}.`;
    if (b.luxury && (finance?.debt ?? 0) > 0) return 'While you owe the Emergency Credit, luxury buildings can’t be started.';
    if (cash() < b.cost) return `Not enough Credits: it costs ${fmt(b.cost)}.`;
    return null;
  }
  const pay = (amount, source) => {
    finance?.spend('construction', amount, dayNow(), source);
    s.stats.spent += amount;
  };
  const payBack = (amount, source) => {
    if (amount > 0) finance?.earn('buildBack', amount, dayNow(), source);
    s.stats.back += amount;
  };

  // Order a build: paid now, a plot with a scaffold for its build days.
  function build(kind, def, col, row) {
    const why = whyNot(kind, def);
    if (why) return { ok: false, why };
    const c = check(kind, def, col, row);
    if (!c.ok) return c;
    const b = buildOf(kind, def);
    const id = kind === 'room' ? `R${s.nextRoom}` : def;
    const it = { id, kind, def, fp: c.fp, door: c.door, level: 1, spent: b.cost, open: false };
    if (kind === 'room') it.number = s.nextRoom++;
    s.items.push(it);
    const t = now();
    s.jobs.push({ id: `C${s.nextJob++}`, kind: 'build', target: id, start: t, end: t + b.days * MINUTES_PER_DAY, cost: b.cost, half: false });
    pay(b.cost, id);
    s.stats.built++;
    say('start', it);
    changed('build', { id });
    return { ok: true, id };
  }

  // Booked / busy things can't be moved or sold (one plain line), or null.
  function busyWhy(it) {
    if (s.jobs.some((j) => j.target === it.id)) return `${cap(theName(it))} is being built or upgraded.`;
    if (it.kind === 'room') {
      const st = bookings?.roomState?.(it.id) ?? 'ready';
      if (bookings?.hasBooking?.(it.id)) return `${nameOf(it)} has a booking: move it when it’s free.`;
      if (st !== 'ready') return `${nameOf(it)} is ${st === 'maintenance' ? 'under repair' : st}: wait until it’s Ready.`;
    }
    if (maintenance?.hasJob?.(it.id)) return `Maintenance is working on ${theName(it)}.`;
    if (maintenance?.isOffline?.(it.id)) return `${cap(theName(it))} is broken: repair it first.`;
    return null;
  }
  function move(id, col, row) {
    const it = itemById(id);
    if (!it) return { ok: false, why: 'Nothing there.' };
    if (!it.open) return { ok: false, why: `${cap(theName(it))} is still being built.` };
    if (it.fp.col === col && it.fp.row === row) return { ok: false, why: 'It’s already there.' };
    const busy = busyWhy(it);
    if (busy) return { ok: false, why: busy };
    const c = check(it.kind, it.def, col, row, { moving: id });
    if (!c.ok) return c;
    it.fp = c.fp;
    it.door = c.door;
    s.closed[id] = now() + CONSTRUCTION.moveDays * MINUTES_PER_DAY;
    s.stats.moved++;
    changed('move', { id });
    return { ok: true, id };
  }
  const sellValue = (id) => Math.round((itemById(id)?.spent ?? 0) * CONSTRUCTION.sell);
  function whyNoSell(id) {
    const it = itemById(id);
    if (!it) return 'Nothing there.';
    if (!it.open) return 'Still being built: cancel it instead.';
    if (it.kind === 'facility' && FACILITY_BUILD[it.def]?.core) return `The resort can’t run without ${theName(it)}: move it instead.`;
    if (it.kind === 'room' && s.items.filter((x) => x.kind === 'room' && x.open).length <= 1) return 'You need at least one room.';
    return busyWhy(it);
  }
  function sell(id) {
    const why = whyNoSell(id);
    if (why) return { ok: false, why };
    const it = itemById(id);
    const back = sellValue(id);
    s.items = s.items.filter((x) => x.id !== id);
    delete s.closed[id];
    payBack(back, id);
    s.stats.sold++;
    changed('sell', { id, kind: it.kind });
    return { ok: true, back };
  }

  // --- construction jobs -------------------------------------------------------------------------------------------
  const progressOf = (j) => Math.max(0, Math.min(1, (now() - j.start) / Math.max(1, j.end - j.start)));
  const cancelValue = (jobId) => {
    const j = s.jobs.find((x) => x.id === jobId);
    if (!j) return 0;
    return Math.round(j.cost * (progressOf(j) < CONSTRUCTION.half ? CONSTRUCTION.early : CONSTRUCTION.late));
  };
  function cancel(jobId) {
    const j = s.jobs.find((x) => x.id === jobId);
    if (!j) return { ok: false, why: 'Nothing is being built.' };
    const back = cancelValue(jobId);
    s.jobs = s.jobs.filter((x) => x !== j);
    const it = itemById(j.target);
    if (j.kind === 'build') s.items = s.items.filter((x) => x.id !== j.target);
    else if (it) it.spent -= j.cost;
    payBack(back, j.target);
    s.stats.cancelled++;
    changed('cancel', { id: j.target, kind: j.kind });
    return { ok: true, back };
  }
  function finish(j) {
    s.jobs = s.jobs.filter((x) => x !== j);
    const it = itemById(j.target);
    if (!it) return;
    if (j.kind === 'build') {
      it.open = true;
      changed('built', { id: it.id, kind: it.kind });
      maintenance?.addTarget?.(it.id);
      say('done', it);
      bus?.emit('site:built', { id: it.id, kind: it.kind, def: it.def });
    } else {
      it.level = j.level;
      s.stats.upgraded++;
      changed('upgraded', { id: it.id, level: it.level });
      say('upgraded', it, { level: it.level });
      bus?.emit('site:upgraded', { id: it.id, level: it.level });
    }
  }
  // Each band edge: builds and upgrades finish (half-way lines too), moved things reopen.
  function onEdge() {
    const t = now();
    for (const j of [...s.jobs].sort((a, b) => a.end - b.end)) {
      if (t >= j.end - 1e-6) finish(j);
      else if (!j.half && j.kind === 'build' && progressOf(j) >= 0.5) {
        j.half = true;
        say('half', itemById(j.target));
      }
    }
    let reopened = false;
    for (const [id, until] of Object.entries(s.closed))
      if (t >= until - 1e-6) {
        delete s.closed[id];
        reopened = true;
      }
    if (reopened) changed('reopen');
    progress?.check?.();
  }

  // --- upgrades (Lv1–Lv3) ------------------------------------------------------------------------------------------
  function upgradeInfo(id) {
    const it = itemById(id);
    if (!it) return null;
    const next = (it.level ?? 1) + 1;
    const up = UPGRADE[it.kind]?.[next];
    if (!up) return { it, next, max: true };
    return { it, next, cost: Math.round(buildOf(it.kind, it.def).cost * up.share), days: up.days };
  }
  const upgradeCost = (id) => upgradeInfo(id)?.cost ?? null;
  function whyNoUpgrade(id) {
    const u = upgradeInfo(id);
    if (!u) return 'Nothing there.';
    if (u.max) return 'It’s at the top level.';
    if (!u.it.open) return 'Still being built.';
    if (s.jobs.some((j) => j.target === id)) return 'It’s already being upgraded.';
    if (u.it.kind === 'facility') {
      const base = stageById(FACILITY_BUILD[u.it.def].stage).rank;
      const need = LEVEL_RANKS[base]?.[u.next - 2];
      if (need == null) return `Level ${u.next} comes after the main game.`;
      if (!rankAtLeast(rank(), need)) return `Level ${u.next} needs Rank ${need}.`;
    }
    if (buildOf(u.it.kind, u.it.def).luxury && (finance?.debt ?? 0) > 0) return 'While you owe the Emergency Credit, luxury buildings can’t be started.';
    if (cash() < u.cost) return `Not enough Credits: it costs ${fmt(u.cost)}.`;
    return null;
  }
  function upgrade(id) {
    const why = whyNoUpgrade(id);
    if (why) return { ok: false, why };
    const u = upgradeInfo(id);
    const t = now();
    s.jobs.push({ id: `C${s.nextJob++}`, kind: 'upgrade', target: id, level: u.next, start: t, end: t + u.days * MINUTES_PER_DAY, cost: u.cost, half: false });
    u.it.spent += u.cost;
    pay(u.cost, id);
    say('upgrade', u.it);
    changed('upgrade', { id });
    return { ok: true };
  }

  // --- land --------------------------------------------------------------------------------------------------------
  function whyNoLand(id) {
    const l = landById(id);
    if (!l || l.secret) return 'Not for sale.';
    if (s.land.includes(id)) return 'It’s yours.';
    if (l.later || l.price == null) return `Opens later (needs Rank ${l.rank}).`;
    if (!rankAtLeast(rank(), l.rank)) return `Needs Rank ${l.rank}.`;
    if (cash() < l.price) return `Not enough Credits: it costs ${fmt(l.price)}.`;
    return null;
  }
  function buyLand(id) {
    const why = whyNoLand(id);
    if (why) return { ok: false, why };
    const l = landById(id);
    s.land.push(id);
    pay(l.price, id);
    s.stats.land++;
    say('land', null);
    changed('land', { id });
    return { ok: true };
  }

  // The build list: what the stage and Rank allow (rooms of each type; facilities not built yet), each with why it
  // can't be ordered now (or null).
  function catalogue() {
    const out = [];
    for (const [def, b] of Object.entries(ROOM_BUILD)) {
      if (!ROOM_TYPES[def] || stageIndex(stage()) < stageIndex(b.stage)) continue;
      out.push({ kind: 'room', def, name: ROOM_TYPES[def].name, art: `room_${def.toLowerCase()}`, cost: b.cost, days: b.days, size: b.size, why: whyNot('room', def) });
    }
    for (const [def, b] of Object.entries(FACILITY_BUILD)) {
      if (b.secret || stageIndex(stage()) < stageIndex(b.stage) || s.items.some((it) => it.def === def)) continue;
      out.push({ kind: 'facility', def, name: FACILITY_INFO[def].name, art: FACILITY_INFO[def].art, cost: b.cost, days: b.days, size: b.size, line: FACILITY_INFO[def].line, why: whyNot('facility', def) });
    }
    return out;
  }

  const site = {
    check,
    whyNot,
    build,
    move,
    sell,
    sellValue,
    whyNoSell,
    cancel,
    cancelValue,
    upgrade,
    upgradeCost,
    upgradeInfo,
    whyNoUpgrade,
    buyLand,
    whyNoLand,
    catalogue,
    onEdge,
    progressOf,
    itemById,
    nameOf: (id) => (itemById(id) ? nameOf(itemById(id)) : id),
    jobFor: (id) => s.jobs.find((j) => j.target === id) ?? null,
    isClosed: (id) => s.closed[id] != null,
    closedUntil: (id) => s.closed[id] ?? null,
    levelOf: (id) => itemById(id)?.level ?? 1,
    owns: (id) => s.land.includes(id),
    onChange(fn) {
      listeners.push(fn);
    },
    attach({ finance: f, reviews: r, bookings: b, maintenance: m, progress: p } = {}) {
      if (f) finance = f;
      if (r) reviews = r;
      if (b) bookings = b;
      if (m) maintenance = m;
      if (p) progress = p;
    },
    get items() {
      return s.items;
    },
    get jobs() {
      return s.jobs;
    },
    get land() {
      return [...s.land];
    },
    get stats() {
      return { ...s.stats };
    },
    get version() {
      return LIVE.version;
    },
    serialize: () => clone(s),
  };
  return site;
}

// A saved site, checked and filled in (none — a save from before Milestone 12 — is the shipped lot).
function load(saved) {
  const f = freshSite();
  if (!saved || typeof saved !== 'object' || !Array.isArray(saved.items)) return f;
  const s = clone(saved);
  const okFp = (fp) => fp && [fp.col, fp.row, fp.w, fp.h].every(Number.isFinite);
  const items = s.items.filter((it) => it && okFp(it.fp) && it.door && (it.kind === 'room' ? ROOM_BUILD[it.def] && Number.isFinite(it.number) : FACILITY_INFO[it.def]));
  if (!items.some((it) => it.def === 'F01') || !items.some((it) => it.def === 'F07')) return f; // (damaged: no Reception or Parking)
  const ids = new Set(items.map((it) => it.id));
  return {
    land: Array.isArray(s.land) && s.land.includes('roadside') ? s.land.filter((id) => landById(id)) : ['roadside'],
    items: items.map((it) => ({ ...it, level: Math.max(1, Math.min(UPGRADE.maxLevel, it.level ?? 1)), spent: Number.isFinite(it.spent) ? it.spent : 0, open: it.open !== false })),
    nextRoom: Number.isFinite(s.nextRoom) ? s.nextRoom : Math.max(0, ...items.filter((it) => it.kind === 'room').map((it) => it.number)) + 1,
    nextJob: Number.isFinite(s.nextJob) ? s.nextJob : 1,
    jobs: Array.isArray(s.jobs) ? s.jobs.filter((j) => j && ids.has(j.target) && Number.isFinite(j.end)) : [],
    closed: Object.fromEntries(Object.entries(s.closed ?? {}).filter(([id, t]) => ids.has(id) && Number.isFinite(t))),
    stats: { ...f.stats, ...(s.stats ?? {}) },
  };
}
const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);
