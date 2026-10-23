// The Roadside Lot world (Milestone 1; Milestone 2: the day follows the bands). The hidden grid (core/Grid) has the eight
// starting facilities and the first two rooms blocking their footprints, so every free tile is a walkable lane and people
// go round buildings, never through them (core/Pathing, 4-way moves between tile centres). Two walkers on core/Agent:
//   the guest   — Night in their room, Morning at the café, Midday at Reception, Afternoon at the pool, Evening at the
//                 café then back to their room (data/lot.js GUEST.plan)
//   the Founder — at their role's station Morning to Evening, resting at the Motel Service Block at Night (STAFF_PLAN)
// Each walks to the doorway tile in front of the place the calendar's band (and how far through it) asks for, and stays
// there. Plan space only — the screen projects it. Nothing here is saved: on open both stand where the current band puts
// them.
// A band is short (0.75–1.25 s of game time at 1× — bible §3's 5 s day), so each walk gets its own pace: fast enough to
// arrive within ARRIVE_SHARE of the time that stop has left (never slower than their normal walking speed), then they
// stand there for the rest of it.
//   createResortWorld({ founder, band = 'morning', bandFrac = 0 }) → world
//     world.setTime(bandId, bandFrac, bandSec) — the calendar's band each step (a new place → they walk there); bandSec =
//       the band's length in game seconds (without it they walk at their normal speed)
//     world.update(dt) — game-speed seconds (0 while paused: nobody moves)
//     world.items (facilities + rooms) · world.people · world.grid · world.stateOf(thing) · byId(id)
//     world.log: [{ who, at, band }] every arrival (tests) · world.offLane: steps found on a blocked tile (should stay 0)
import { Grid } from '../../../../core/Grid.js';
import { Agent } from '../../../../core/Agent.js';
import { findPath } from '../../../../core/Pathing.js';

const ARRIVE_SHARE = 0.6; // arrive with at least 40% of the stop's time left to stand there
// Where each stands on a doorway tile (a share of a tile, along the screen's left–right): the guest a little right, the
// Founder a little left — so the two never stand on one spot (the café, Reception or the pool can be both of theirs).
// Still inside the tile, so still on the lane.
const SPOT = { guest: 0.27, staff: -0.27 };
import { LOT, FACILITIES, ROOMS, PERSON, GUEST, STAFF_ROLES, STAFF_PLAN } from '../../data/lot.js';
import { ROLES } from '../../data/setup.js';

export function createResortWorld({ founder, band = 'morning', bandFrac = 0 }) {
  const grid = new Grid({ cols: LOT.cols, rows: LOT.rows, tileSize: LOT.cell });
  grid.pathCache = new Map();
  const items = [
    ...FACILITIES.map((def) => ({ kind: 'facility', id: def.id, def, fp: def.fp, door: def.door })),
    ...ROOMS.map((def) => ({ kind: 'room', id: def.id, def, fp: def.fp, door: def.door })),
  ];
  for (const it of items) grid.blockRect(it.fp.col, it.fp.row, it.fp.w, it.fp.h);
  const itemById = (id) => items.find((it) => it.id === id) ?? null;
  const placeName = (id) => itemById(id)?.def.name ?? id;

  const log = [];
  let offLane = 0;

  const role = STAFF_ROLES[founder.role];
  const staffPlan = (b) => (b === 'night' ? STAFF_PLAN.night : STAFF_PLAN.work).map((s) => ({ ...s, at: s.at === 'station' ? role.station : s.at }));
  // The stop a plan asks for at this band and point in it.
  function stopFor(person, b, frac) {
    const list = person.kind === 'guest' ? GUEST.plan[b] : staffPlan(b);
    return list.find((s) => s.until == null || frac < s.until) ?? list[list.length - 1];
  }

  // A walker: an Agent plus where it is heading. phase 'walking' | 'at'. baseSpeed = their normal pace.
  function walker({ id, kind, name, art, speed }) {
    return { id, kind, name, art, stop: null, phase: 'at', facing: 1, baseSpeed: speed, agent: new Agent({ id, name, speed, width: 100, height: PERSON.height, noPathTeleportSec: 1 }) };
  }
  const people = [
    walker({ id: 'guest', kind: 'guest', name: GUEST.type, art: GUEST.art, speed: PERSON.guestSpeed }),
    walker({ id: 'staff', kind: 'staff', name: founder.name, art: role.art, speed: PERSON.staffSpeed }),
  ];
  const guest = people[0];
  const staff = people[1];
  let bandNow = band;

  // Step to their own spot on the doorway tile (plan +x −y = screen right, same depth).
  function standAside(p) {
    const k = SPOT[p.kind] * grid.tileSize;
    p.agent.x += k;
    p.agent.y -= k;
  }
  // Stand at the stop straight away (opening the hub, after a reload).
  function placeAt(p, stop) {
    const it = itemById(stop.at);
    p.stop = stop;
    p.phase = 'at';
    p.agent.placeAtTile(grid, it.door.col, it.door.row);
    standAside(p);
    p.agent.setState('working');
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
    });
  }
  for (const p of people) placeAt(p, stopFor(p, band, bandFrac));

  function setTime(b, frac, bandSec = null) {
    bandNow = b;
    for (const p of people) {
      const s = stopFor(p, b, frac);
      if (s !== p.stop && (s.at !== p.stop?.at || s.doing !== p.stop?.doing)) {
        if (s.at === p.stop?.at) p.stop = s; // same place, new words
        else walkTo(p, s, bandSec ? ((s.until ?? 1) - frac) * bandSec : null);
      }
    }
  }

  function update(dt) {
    if (!(dt > 0)) return; // paused: nobody moves
    for (const p of people) {
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
    const here = people.filter((p) => p.phase === 'at' && p.stop.at === thing.id);
    const coming = people.filter((p) => p.phase === 'walking' && p.stop.at === thing.id);
    const who = (p) => (p.kind === 'guest' ? 'The guest' : p.name);
    if (here.length) return `${here.map(who).join(' and ')} ${here.length > 1 ? 'are' : 'is'} here`;
    if (coming.length) return `${coming.map(who).join(' and ')} ${coming.length > 1 ? 'are' : 'is'} on the way`;
    return thing.kind === 'room' ? 'Ready for its guest' : 'Quiet for now';
  }

  return {
    grid,
    items,
    people,
    guest,
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
      return people.reduce((n, p) => n + p.agent.teleports, 0);
    },
    byId: (id) => itemById(id) ?? people.find((p) => p.id === id) ?? null,
    setTime,
    update,
    stateOf,
  };
}
