// Movement / noise / views (Milestone 9, bible §13 / §27B / §27F / §27G). Where things stand on the lot now changes how a
// stay goes: each room's lane walk to Reception, the Café and the Pool (a Convenience penalty on Comfort past 6 tiles on
// the average trip), the noise reaching it in each band (the Pool in the Afternoon, the Café at Morning and Evening, the
// Laundry and the car park at Morning and Midday, the Maintenance Shed while a maintenance job runs, the road always) and
// its view (the Garden by its Condition and the Pool lift it; the Laundry, the Shed and the car park pull it down; the sum
// is a % on the Room category, capped ±12%). Resort Appeal is live: 60 + the Garden × its working share + 2 × the average
// room view %. Fit's viewMatch, noiseMatch and distanceMatch are live, so Auto Assign prefers quiet rooms with a view.
// All numbers are in data/layout.js. Players can't move buildings until M12: tests swap places with TEST_LAYOUTS.
// The only state is on the stays (booking.noise: bands counted, the loudest band, the Comfort lost — saved with the
// bookings): each band edge the booking system passes on (bookings.attachLayout(ly)) every party staying hears its room's
// noise for that band. Over half their Noise tolerance costs Comfort, Night double, at most 12 a stay; over their full
// tolerance is a noise trigger (src/systems/complaints.js, rolled from the run's seed) — so the same seed gives the same
// stays at every speed.
//   measureLayout(items) → the fixed facts for every room (walks, noise sources, view sources) — no Condition, no jobs
//   createLayout({ spec, mt }) → ly
//     ly.viewPct(roomId) · noiseAt(roomId, band, shedOn) · convenience(roomId) · avgWalk(roomId) · fitParts(roomId)
//     ly.appeal() · ly.place(roomId) (the review's inputs) · ly.lines(roomId) (the room sheet's three lines)
//     ly.tileNoise(col, row) · ly.tileView(col, row) (the map overlay) · ly.onEdge(day, band, bookings)
//     ly.attachMaintenance(mt) · ly.attachComplaints(cp) · ly.items · ly.facts
import { Grid } from '../../../../core/Grid.js';
import { findPath } from '../../../../core/Pathing.js';
import { LOT, FACILITIES, ROOMS } from '../../data/lot.js';
import { GUEST_TYPES } from '../../data/bookings.js';
import { BANDS } from '../../data/calendar.js';
import { WALK, NOISE, NOISE_EFFECT, VIEWS, VIEW_CAP, APPEAL, PLACE_TEXT, TEST_LAYOUTS, SHORT_NAMES } from '../../data/layout.js';
import { minuteOf } from './calendar.js';

const r2 = (x) => Math.round(x * 100) / 100;
const r1 = (x) => Math.round(x * 10) / 10;
const r6 = (x) => Math.round(x * 1e6) / 1e6; // (the stay's noise loss: no drift from rounding each band)
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const BAND = Object.fromEntries(BANDS.map((b, i) => [b.id, i]));
const NIGHT = BAND.night;
const NB = BANDS.length;

// The shipped lot, or a test layout (id → the id whose footprint and doorway it takes; data/layout.js TEST_LAYOUTS).
export function layoutItems(spec = null) {
  const map = typeof spec === 'string' ? TEST_LAYOUTS[spec] : spec;
  if (spec && !map) throw new Error(`No test layout ${spec}`);
  const all = [...FACILITIES, ...ROOMS];
  const place = (it) => {
    const to = map?.[it.id];
    if (!to || to === it.id) return { ...it };
    const at = all.find((x) => x.id === to);
    if (!at) throw new Error(`Test layout: no place ${to}`);
    return { ...it, fp: { ...at.fp }, door: { ...at.door } };
  };
  return { facilities: FACILITIES.map(place), rooms: ROOMS.map(place) };
}

// Tiles between two footprints (0 when they touch).
export function gapBetween(a, b) {
  const dx = Math.max(0, b.col - (a.col + a.w), a.col - (b.col + b.w));
  const dy = Math.max(0, b.row - (a.row + a.h), a.row - (b.row + b.h));
  return Math.max(dx, dy);
}
const roadGap = (fp) => Math.max(0, LOT.rows - (fp.row + fp.h));
const falloff = (d, radius) => (d <= radius ? 1 - d / (radius + 1) : 0);

// What reaches a footprint: each noise source's value when active, each view source's points (the Garden at full
// Condition).
function sourcesAt(fp, facilities, skip = null) {
  const noise = [];
  for (const n of NOISE) {
    const f = n.always ? null : facilities.find((x) => x.id === n.id);
    if (!n.always && (!f || f.id === skip)) continue;
    const d = n.id === 'road' ? roadGap(fp) : gapBetween(fp, f.fp);
    const k = falloff(d, n.radius);
    if (k > 0) noise.push({ id: n.id, d, value: r2(n.strength * k), bands: n.bands ?? null, job: !!n.job, always: !!n.always });
  }
  const views = [];
  for (const v of VIEWS) {
    const f = facilities.find((x) => x.id === v.id);
    if (!f || f.id === skip) continue;
    const d = gapBetween(fp, f.fp);
    const k = falloff(d, v.radius);
    if (k > 0) views.push({ id: v.id, d, value: r2(v.add * k), condition: !!v.condition });
  }
  return { noise, views };
}
const activeIn = (src, band, shedOn) => src.always || (src.job ? shedOn : src.bands.includes(BANDS[band].id));
const noiseIn = (noise, band, shedOn) => r2(noise.reduce((t, x) => t + (activeIn(x, band, shedOn) ? x.value : 0), 0));
const shedBand = (band) => NOISE_EFFECT.shedBands.includes(BANDS[band].id);

// The fixed facts for every room on a layout.
export function measureLayout(items = layoutItems()) {
  const grid = new Grid({ cols: LOT.cols, rows: LOT.rows, tileSize: LOT.cell });
  for (const it of [...items.facilities, ...items.rooms]) grid.blockRect(it.fp.col, it.fp.row, it.fp.w, it.fp.h);
  const doorOf = (id) => items.facilities.find((f) => f.id === id)?.door ?? null;
  const rooms = {};
  for (const r of items.rooms) {
    const walk = {};
    for (const id of WALK.to) {
      const d = doorOf(id);
      if (!d) continue;
      const p = findPath(grid, r.door, d);
      if (!p) throw new Error(`Layout: no lane from ${r.id} to ${id}`);
      walk[id] = p.length;
    }
    const trips = Object.values(walk);
    const avgWalk = trips.length ? r2(trips.reduce((t, x) => t + x, 0) / trips.length) : 0;
    const src = sourcesAt(r.fp, items.facilities);
    const byBand = BANDS.map((_, i) => noiseIn(src.noise, i, shedBand(i)));
    rooms[r.id] = {
      walk,
      avgWalk,
      convenience: r2(Math.min(WALK.cap, Math.max(0, avgWalk - WALK.freeTiles) * WALK.perTile)),
      distanceMatch: r2(clamp01(1 - avgWalk / WALK.fitDiv)),
      noise: src.noise,
      avgNoise: r2(byBand.reduce((t, x) => t + x, 0) / NB),
      views: src.views,
    };
  }
  return { rooms, grid };
}

export function createLayout({ spec = null, mt = null } = {}) {
  const items = layoutItems(spec);
  const facts = measureLayout(items);
  let cp = null;
  const gardenShare = () => (mt ? mt.eff(APPEAL.gardenId) : 1);
  const factsOf = (id) => facts.rooms[id] ?? null;

  // View % at a room (the Garden by its working share), capped ±12, one decimal.
  function viewOf(views) {
    const g = gardenShare();
    const sum = views.reduce((t, v) => t + v.value * (v.condition ? g : 1), 0);
    return r1(Math.max(-VIEW_CAP, Math.min(VIEW_CAP, sum)));
  }
  const viewPct = (id) => (factsOf(id) ? viewOf(factsOf(id).views) : 0);
  const noiseAt = (id, band, shedOn = false) => (factsOf(id) ? noiseIn(factsOf(id).noise, band, shedOn) : 0);
  const shedRunning = (minute) => !!mt && mt.active.some((j) => j.start <= minute + 1e-9 && j.end > minute);
  const fitParts = (id) => {
    const f = factsOf(id);
    if (!f) return null;
    return { view: r2(clamp01((viewPct(id) + VIEW_CAP) / (2 * VIEW_CAP))), noise: r2(clamp01(1 - f.avgNoise / NOISE_EFFECT.fitDiv)), distance: f.distanceMatch };
  };
  const avgView = () => {
    const ids = items.rooms.map((r) => r.id);
    return ids.reduce((t, id) => t + viewPct(id), 0) / ids.length;
  };
  const appeal = () => {
    const garden = items.facilities.some((f) => f.id === APPEAL.gardenId) ? APPEAL.garden * gardenShare() : 0;
    return r2(Math.max(0, Math.min(100, APPEAL.base + garden + APPEAL.viewMult * avgView())));
  };

  // Each band edge: every party staying hears its room's noise for this band.
  function onEdge(day, band, bk) {
    const minute = minuteOf(day, band);
    const shed = shedRunning(minute);
    for (const b of bk?.staying ?? []) {
      const n = noiseAt(b.room, band, shed);
      const tol = GUEST_TYPES[b.type]?.noise ?? 50;
      const z = (b.noise ??= { bands: 0, sum: 0, worst: 0, loss: 0, over: 0 });
      z.bands++;
      z.sum = r2(z.sum + n);
      z.worst = Math.max(z.worst, n);
      if (n > tol / 2) z.loss = r6(Math.min(NOISE_EFFECT.cap, z.loss + ((n - tol / 2) / NOISE_EFFECT.perPoint) * (band === NIGHT ? NOISE_EFFECT.nightMult : 1)));
      if (n > tol) {
        z.over++;
        cp?.onNoise?.(b, minute, n);
      }
    }
  }

  // The room sheet's three plain lines: noise, view, walk.
  function lines(id) {
    const f = factsOf(id);
    if (!f) return [];
    let peak = { n: 0, band: null };
    for (let i = 0; i < NB; i++) {
      const n = noiseIn(f.noise, i, shedBand(i));
      if (n > peak.n) peak = { n, band: i };
    }
    let noise;
    if (peak.n < PLACE_TEXT.quiet) noise = 'Quiet day and night';
    else {
      const loud = f.noise.filter((x) => activeIn(x, peak.band, shedBand(peak.band))).sort((a, b) => b.value - a.value)[0];
      const night = noiseIn(f.noise, NIGHT, false) < PLACE_TEXT.quiet;
      noise = `${peak.n >= PLACE_TEXT.loud ? 'Noisy' : 'Some noise'}: ${SHORT_NAMES[loud.id]} in the ${BANDS[peak.band].name.toLowerCase()}${night ? ', quiet at night' : ''}`;
    }
    const v = viewPct(id);
    const sign = f.views.filter((x) => (v >= 0 ? x.value > 0 : x.value < 0)).sort((a, b) => Math.abs(b.value) - Math.abs(a.value))[0];
    const view = Math.abs(v) < 1 || !sign ? 'No special view' : v > 0 ? `${cap(SHORT_NAMES[sign.id])} view +${Math.round(v)}%` : `Poor view: ${the(sign.id)} −${Math.round(-v)}%`;
    const far = Object.entries(f.walk).sort((a, b) => b[1] - a[1])[0];
    const near = Object.entries(f.walk).sort((a, b) => a[1] - b[1])[0];
    let walk;
    if (f.avgWalk <= WALK.freeTiles) walk = `Short walk to ${the(near[0])}`;
    else if (f.avgWalk >= PLACE_TEXT.long) walk = `Long walks: ${the(far[0])} is ${far[1]} tiles away (−${f.convenience} Comfort)`;
    else walk = `Near ${the(near[0])}; ${the(far[0])} is ${far[1]} tiles away`;
    return [noise, view, walk];
  }

  // The overlay: the loudest band's noise on a tile (the Shed counted on), and its view points (uncapped).
  const tileFp = (col, row) => ({ col, row, w: 1, h: 1 });
  const tileCache = new Map();
  function tileSources(col, row) {
    const k = `${col},${row}`;
    if (!tileCache.has(k)) tileCache.set(k, sourcesAt(tileFp(col, row), items.facilities));
    return tileCache.get(k);
  }
  const tileNoise = (col, row) => {
    const s = tileSources(col, row);
    let m = 0;
    for (let i = 0; i < NB; i++) m = Math.max(m, noiseIn(s.noise, i, true));
    return m;
  };
  const tileView = (col, row) => {
    const g = gardenShare();
    return r2(tileSources(col, row).views.reduce((t, v) => t + v.value * (v.condition ? g : 1), 0));
  };

  return {
    items,
    facts,
    viewPct,
    noiseAt,
    shedRunning,
    fitParts,
    appeal,
    avgView: () => r2(avgView()),
    convenience: (id) => factsOf(id)?.convenience ?? 0,
    avgWalk: (id) => factsOf(id)?.avgWalk ?? 0,
    avgNoise: (id) => factsOf(id)?.avgNoise ?? 0,
    // The review's inputs for a stay in this room now.
    place: (id) => ({ view: viewPct(id), convenience: factsOf(id)?.convenience ?? 0 }),
    lines,
    tileNoise,
    tileView,
    onEdge,
    attachMaintenance(m) {
      mt = m;
    },
    attachComplaints(c) {
      cp = c;
    },
  };
}
const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);
const the = (id) => (id === 'F01' ? SHORT_NAMES[id] : `the ${SHORT_NAMES[id]}`); // "Reception", "the café"
