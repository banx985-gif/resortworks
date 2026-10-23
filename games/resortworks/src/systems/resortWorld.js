// The Roadside Lot world (Milestone 1): the hidden grid (core/Grid) with the eight starting facilities and the first two
// rooms blocking their footprints, so every free tile is a walkable lane and people go round buildings, never through
// them (core/Pathing, 4-way moves between tile centres). Two walkers on core/Agent:
//   the guest  — Parking → Reception → their room → Small Pool → Snack Café → their room → Parking … (data/lot.js GUEST)
//   the Founder — their role's station → the guest's room door → Motel Service Block (rest) → back (STAFF_ROUTE)
// Each stops at the doorway tile in front of a place, waits there a moment, then walks on. Plan space only — the screen
// projects it. Nothing here is saved: both start at their first stop each time the resort opens.
//   createResortWorld({ founder }) → world
//     world.items (facilities + rooms) · world.people · world.grid · world.update(dt) · world.stateOf(thing) · byId(id)
//     world.log: [{ who, at }] every stop reached (tests) · world.offLane: steps found on a blocked tile (should stay 0)
import { Grid } from '../../../../core/Grid.js';
import { Agent } from '../../../../core/Agent.js';
import { LOT, FACILITIES, ROOMS, PERSON, GUEST, STAFF_ROLES, STAFF_ROUTE, GUEST_ROOM } from '../../data/lot.js';
import { ROLES } from '../../data/setup.js';

export function createResortWorld({ founder }) {
  const grid = new Grid({ cols: LOT.cols, rows: LOT.rows, tileSize: LOT.cell });
  grid.pathCache = new Map();
  const items = [
    ...FACILITIES.map((def) => ({ kind: 'facility', id: def.id, def, fp: def.fp, door: def.door })),
    ...ROOMS.map((def) => ({ kind: 'room', id: def.id, def, fp: def.fp, door: def.door })),
  ];
  for (const it of items) grid.blockRect(it.fp.col, it.fp.row, it.fp.w, it.fp.h);
  const byId = (id) => items.find((it) => it.id === id) ?? people.find((p) => p.id === id) ?? null;
  const placeName = (id) => {
    const it = items.find((x) => x.id === id);
    return it ? it.def.name : id;
  };

  const log = [];
  let offLane = 0;

  // A walker: an Agent plus its loop. stop = index into route; phase 'walking' | 'at'; t = time left at a stop.
  function walker({ id, kind, name, art, speed, route }) {
    const p = { id, kind, name, art, route, stop: 0, phase: 'at', t: route[0].dwell, facing: 1, agent: new Agent({ id, name, speed, width: 100, height: PERSON.height }) };
    const first = byIdItem(route[0].at);
    p.agent.placeAtTile(grid, first.door.col, first.door.row);
    p.agent.setState('working');
    return p;
  }
  const byIdItem = (id) => items.find((it) => it.id === id);

  function nextStop(p) {
    p.stop = (p.stop + 1) % p.route.length;
    const target = byIdItem(p.route[p.stop].at);
    p.phase = 'walking';
    p.agent.walkTo(grid, target.door.col, target.door.row, () => {
      p.phase = 'at';
      p.t = p.route[p.stop].dwell;
      p.agent.setState('working');
      log.push({ who: p.id, at: p.route[p.stop].at });
      if (log.length > 400) log.shift();
    });
  }

  const role = STAFF_ROLES[founder.role];
  const staffRoute = STAFF_ROUTE.map((s) => ({ ...s, at: s.at === 'station' ? role.station : s.at === 'guestRoom' ? GUEST_ROOM : s.at }));
  const people = [
    walker({ id: 'guest', kind: 'guest', name: GUEST.type, art: GUEST.art, speed: PERSON.guestSpeed, route: GUEST.route }),
    walker({ id: 'staff', kind: 'staff', name: founder.name, art: role.art, speed: PERSON.staffSpeed, route: staffRoute }),
  ];
  const guest = people[0];
  const staff = people[1];

  function update(dt) {
    for (const p of people) {
      const a = p.agent;
      const px = a.x;
      const py = a.y;
      if (p.phase === 'at') {
        if ((p.t -= dt) <= 0) nextStop(p);
      } else a.update(dt, grid);
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
      const s = thing.route[thing.stop];
      const words = thing.phase === 'at' ? s.doing : s.going;
      return words.replace('{name}', placeName(s.at));
    }
    const here = people.filter((p) => p.phase === 'at' && p.route[p.stop].at === thing.id);
    const coming = people.filter((p) => p.phase === 'walking' && p.route[p.stop].at === thing.id);
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
    get offLane() {
      return offLane;
    },
    get teleports() {
      return people.reduce((n, p) => n + p.agent.teleports, 0);
    },
    byId,
    update,
    stateOf,
  };
}
