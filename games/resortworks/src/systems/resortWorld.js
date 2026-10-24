// The Roadside Lot world (Milestone 1; Milestone 2: the day follows the bands; Milestone 3: booked guests). The hidden grid
// (core/Grid) has the eight starting facilities and the eight rooms blocking their footprints, so every free tile is a
// walkable lane and people go round buildings, never through them (core/Pathing, 4-way moves between tile centres).
// Walkers on core/Agent:
//   each staying party — one walker per booking (its guest type's walking picture). Night in their room, Morning at the
//                 café, Midday at Reception, Afternoon at the pool, Evening at the café then back to their room
//                 (data/lot.js GUEST_PLAN). The band they check in: from the car park to Reception, then to their room
//                 (ARRIVE_PLAN). Their last Morning: from their room to Reception, then to their car, and away (LEAVE_PLAN).
//   the Founder — at their role's station Morning to Evening, resting at the Motel Service Block at Night (STAFF_PLAN)
// Each walks to the doorway tile in front of the place the calendar's band (and how far through it) asks for, and stays
// there. Plan space only — the screen projects it. Nothing here is saved: who is here comes from the bookings
// (src/systems/bookings.js); on open everyone stands where the current band puts them.
// A band is short (0.75–1.25 s of game time at 1× — bible §3's 5 s day), so each walk gets its own pace: fast enough to
// arrive within ARRIVE_SHARE of the time that stop has left (never slower than their normal walking speed), then they
// stand there for the rest of it.
//   createResortWorld({ founder, band = 'morning', bandFrac = 0, day = 0, stays = null }) → world
//     stays() → the parties on the lot now: bookings staying + leaving today ({ id, type, room, status, inDay, inBand,
//       outDay }). Without it (tests of M1 / M2) the world has the M2 lone guest: a Road Trip Couple in Room 1, for good.
//     world.setTime(bandId, bandFrac, bandSec, day) — the calendar's band each step (a new place → they walk there; new
//       parties arrive, leavers go); bandSec = the band's length in game seconds (without it they walk at their normal speed)
//     world.update(dt) — game-speed seconds (0 while paused: nobody moves)
//     world.items (facilities + rooms) · world.people · world.guests · world.guest (the first guest) · world.grid
//     world.stateOf(thing) · byId(id) · world.version (changes when someone arrives or leaves the lot)
//     world.log: [{ who, at, band }] every arrival (tests) · world.offLane: steps found on a blocked tile (should stay 0)
import { Grid } from '../../../../core/Grid.js';
import { Agent } from '../../../../core/Agent.js';
import { findPath } from '../../../../core/Pathing.js';
import { LOT, FACILITIES, ROOMS, PERSON, GUEST, GUEST_ROOM, GUEST_PLAN, ARRIVE_PLAN, LEAVE_PLAN, ARRIVE_FROM, STAFF_ROLES, STAFF_PLAN } from '../../data/lot.js';
import { GUEST_TYPES } from '../../data/bookings.js';
import { ROLES } from '../../data/setup.js';
import { BANDS } from '../../data/calendar.js';

const ARRIVE_SHARE = 0.6; // arrive with at least 40% of the stop's time left to stand there
// Where each stands on a doorway tile, as [right, depth] shares of a tile on screen: the Founder a little left, guests
// spread to the right (up to eight at one place), so nobody stands on another's spot. Still inside the tile, so still
// on the lane.
const STAFF_SPOT = [-0.27, 0];
const GUEST_SPOTS = [
  [0.27, 0],
  [0.27, 0.15],
  [0.27, -0.15],
  [0.08, 0.32],
  [0.08, -0.32],
  [0, 0],
  [-0.1, 0.3],
  [-0.1, -0.3],
];
const BAND_I = Object.fromEntries(BANDS.map((b, i) => [b.id, i]));
// The M2 lone guest (a world made without bookings).
const LONE = [{ id: 'guest', type: GUEST.typeId, room: GUEST_ROOM, status: 'staying', inDay: -Infinity, inBand: null, outDay: null }];

export function createResortWorld({ founder, band = 'morning', bandFrac = 0, day = 0, stays = null }) {
  const grid = new Grid({ cols: LOT.cols, rows: LOT.rows, tileSize: LOT.cell });
  grid.pathCache = new Map();
  const items = [
    ...FACILITIES.map((def) => ({ kind: 'facility', id: def.id, def, fp: def.fp, door: def.door })),
    ...ROOMS.map((def) => ({ kind: 'room', id: def.id, def, fp: def.fp, door: def.door })),
  ];
  for (const it of items) grid.blockRect(it.fp.col, it.fp.row, it.fp.w, it.fp.h);
  const itemById = (id) => items.find((it) => it.id === id) ?? null;
  const placeName = (id) => itemById(id)?.def.name ?? id;
  const staysNow = stays ?? (() => LONE);

  const log = [];
  let offLane = 0;
  let version = 0;
  let pastTeleports = 0; // teleports of parties no longer on the lot

  const role = STAFF_ROLES[founder.role];
  const staffPlan = (b) => (b === 'night' ? STAFF_PLAN.night : STAFF_PLAN.work).map((s) => ({ ...s, at: s.at === 'station' ? role.station : s.at }));
  // A guest's plan for this band: arriving, leaving or an ordinary day. 'room' becomes their room.
  function guestPlan(p, b, d) {
    const st = p.stay;
    let list = GUEST_PLAN[b];
    if (st.status === 'left' && b === 'morning') list = LEAVE_PLAN;
    else if (st.inDay === d && st.inBand === BAND_I[b]) list = ARRIVE_PLAN;
    const roomName = placeName(st.room);
    return list.map((s) => ({ ...s, at: s.at === 'room' ? st.room : s.at, going: s.going.replace('{room}', roomName), doing: s.doing.replace('{room}', roomName) }));
  }
  // The stop a plan asks for at this band and point in it.
  function stopFor(person, b, frac, d) {
    const list = person.kind === 'guest' ? guestPlan(person, b, d) : staffPlan(b);
    return list.find((s) => s.until == null || frac < s.until) ?? list[list.length - 1];
  }
  const sameStop = (a, b) => a && b && a.at === b.at && a.doing === b.doing && a.going === b.going;

  // A walker: an Agent plus where it is heading. phase 'walking' | 'at'. baseSpeed = their normal pace.
  function walker({ id, kind, name, art, speed, spot }) {
    return { id, kind, name, art, stop: null, phase: 'at', facing: 1, spot, baseSpeed: speed, stay: null, agent: new Agent({ id, name, speed, width: 100, height: PERSON.height, noPathTeleportSec: 1 }) };
  }
  const staff = walker({ id: 'staff', kind: 'staff', name: founder.name, art: role.art, speed: PERSON.staffSpeed, spot: STAFF_SPOT });
  const guests = []; // in arrival order
  let spotN = 0;
  const gone = new Set(); // parties who drove away today (not brought back while their booking still says "left")
  let bandNow = band;
  let fracNow = bandFrac;
  let dayNow = day;

  // Step to their own spot on the doorway tile (plan +x −y = screen right, +x +y = deeper).
  function standAside(p) {
    const [r, d] = p.spot;
    const t = grid.tileSize;
    p.agent.x += (r + d) * t;
    p.agent.y += (d - r) * t;
  }
  function placeAtDoor(p, id) {
    const it = itemById(id);
    p.agent.placeAtTile(grid, it.door.col, it.door.row);
    standAside(p);
  }
  // Stand at the stop straight away (opening the hub, after a reload).
  function placeAt(p, stop) {
    p.stop = stop;
    p.phase = 'at';
    placeAtDoor(p, stop.at);
    p.agent.setState('working');
    if (stop.leaves) leave(p);
  }
  // timeLeft: game seconds this stop has left (null: no deadline, normal pace).
  function walkTo(p, stop, timeLeft = null) {
    const it = itemById(stop.at);
    p.stop = stop;
    const here = p.agent.tile(grid);
    if (here && here.col === it.door.col && here.row === it.door.row) {
      p.phase = 'at';
      p.agent.setState('working');
      return;
    }
    const tiles = findPath(grid, here, it.door);
    const dist = ((tiles?.length ?? 0) + 1) * grid.tileSize;
    p.agent.speed = timeLeft != null ? Math.max(p.baseSpeed, dist / (Math.max(0.05, timeLeft) * ARRIVE_SHARE)) : p.baseSpeed;
    p.phase = 'walking';
    p.agent.walkTo(grid, it.door.col, it.door.row, () => {
      p.phase = 'at';
      standAside(p);
      p.agent.setState('working');
      log.push({ who: p.id, at: stop.at, band: bandNow });
      if (log.length > 400) log.shift();
      if (stop.leaves) leave(p);
    });
  }
  // A leaving party reached their car: they drive away.
  function leave(p) {
    gone.add(p.id);
    const i = guests.indexOf(p);
    if (i >= 0) {
      guests.splice(i, 1);
      pastTeleports += p.agent.teleports;
    }
    version++;
  }

  // The parties on the lot follow the bookings: new ones appear (at the car park when they arrive now; where the band
  // puts them when the hub opens), ones no longer there go.
  function syncGuests(live, bandSec) {
    const list = staysNow() ?? [];
    const ids = new Set(list.map((s) => s.id));
    for (let i = guests.length - 1; i >= 0; i--)
      if (!ids.has(guests[i].id)) {
        pastTeleports += guests[i].agent.teleports;
        guests.splice(i, 1);
        version++;
      }
    for (const g of guests) g.stay = list.find((s) => s.id === g.id) ?? g.stay;
    for (const st of list) {
      if (gone.has(st.id) || guests.some((g) => g.id === st.id)) continue;
      if (st.status === 'left' && (bandNow !== 'morning' || st.outDay !== dayNow)) continue; // already away
      const t = GUEST_TYPES[st.type] ?? GUEST_TYPES[GUEST.typeId];
      const p = walker({ id: st.id, kind: 'guest', name: t.name, art: t.sprite, speed: PERSON.guestSpeed, spot: GUEST_SPOTS[spotN++ % GUEST_SPOTS.length] });
      p.stay = st;
      p.typeId = t.id;
      guests.push(p);
      version++;
      const stop = stopFor(p, bandNow, fracNow, dayNow);
      if (live && st.inDay === dayNow && st.inBand === BAND_I[bandNow]) {
        // They have just arrived: out of their car at the car park, then on their way.
        p.stop = { at: ARRIVE_FROM, doing: '', going: '' };
        placeAtDoor(p, ARRIVE_FROM);
        walkTo(p, stop, bandSec ? ((stop.until ?? 1) - fracNow) * bandSec : null);
      } else placeAt(p, stop);
    }
  }

  function setTime(b, frac, bandSec = null, d = dayNow) {
    bandNow = b;
    fracNow = frac;
    if (d !== dayNow) gone.clear();
    dayNow = d;
    syncGuests(true, bandSec);
    for (const p of [...guests, staff]) {
      const s = stopFor(p, b, frac, d);
      if (!sameStop(s, p.stop)) {
        if (s.at === p.stop?.at) {
          p.stop = s; // same place, new words
          if (s.leaves && p.phase === 'at') leave(p);
        } else walkTo(p, s, bandSec ? ((s.until ?? 1) - frac) * bandSec : null);
      }
    }
  }
  // Everyone where the opening band puts them.
  syncGuests(false, null);
  placeAt(staff, stopFor(staff, band, bandFrac, day));

  function update(dt) {
    if (!(dt > 0)) return; // paused: nobody moves
    for (const p of [...guests, staff]) {
      if (p.phase !== 'walking') continue;
      const a = p.agent;
      const px = a.x;
      const py = a.y;
      a.update(dt, grid);
      // Facing on screen: the 3/4 view turns plan x − y into screen x.
      const sdx = a.x - px - (a.y - py);
      if (Math.abs(sdx) > 0.01) p.facing = sdx > 0 ? 1 : -1;
      const tile = a.tile(grid);
      if (!tile || grid.isBlocked(tile.col, tile.row)) offLane++;
    }
  }

  // Plain words for a sheet's "Now" line.
  function stateOf(thing) {
    if (thing.kind === 'guest' || thing.kind === 'staff') {
      const words = thing.phase === 'at' ? thing.stop.doing : thing.stop.going;
      return words.replace('{name}', placeName(thing.stop.at));
    }
    const people = [...guests, staff];
    const here = people.filter((p) => p.phase === 'at' && p.stop.at === thing.id);
    const coming = people.filter((p) => p.phase === 'walking' && p.stop.at === thing.id);
    const who = (p) => (p.kind === 'guest' ? (p.id === 'guest' ? 'The guest' : thing.kind === 'room' ? 'Their guests' : `A ${p.name}`) : p.name);
    const names = (list) => {
      const words = list.map(who);
      return words.length > 2 ? `${words.length} guests` : words.join(' and ');
    };
    if (here.length) return `${names(here)} ${here.length > 1 ? 'are' : 'is'} here`;
    if (coming.length) return `${names(coming)} ${coming.length > 1 ? 'are' : 'is'} on the way`;
    return thing.kind === 'room' ? 'Nobody in the room right now' : 'Quiet for now';
  }

  return {
    grid,
    items,
    get people() {
      return [...guests, staff];
    },
    get guests() {
      return guests;
    },
    get guest() {
      return guests[0] ?? null;
    },
    staff,
    founder,
    role: { ...role, id: founder.role, name: ROLES[founder.role].name },
    log,
    get band() {
      return bandNow;
    },
    get offLane() {
      return offLane;
    },
    get teleports() {
      return [...guests, staff].reduce((n, p) => n + p.agent.teleports, pastTeleports);
    },
    get version() {
      return version;
    },
    byId: (id) => itemById(id) ?? guests.find((p) => p.id === id) ?? (id === 'staff' ? staff : null),
    setTime,
    update,
    stateOf,
  };
}
