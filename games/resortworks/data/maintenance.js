// Maintenance / Condition numbers (Milestone 8, bible §12 / §27E / §27G). Plain data — src/systems/maintenance.js runs it.
// Cowork's starting picks (M8 card) and Claude Code's, logged in docs/DECISIONS.md.

// Condition 0–100 on every facility and room (bible §12). Everything starts at `start`.
//   70+ (full): full effect · 40–70: the main effect × Condition / 70 · under 40 (half): × halfFactor, and a daily breakdown
//   roll of (40 − Condition) / 40 × breakdownMax · at 0, or after a breakdown: offline until repaired.
//   worn: the wrench badge and "Worn" line show under `full`.
export const CONDITION = { start: 90, max: 100, full: 70, half: 40, halfFactor: 0.5, breakdownMax: 0.2 };

// Wear (M8 card), taken at each day change for the day just ended:
//   facility  every facility a day (light: Parking and Garden)
//   room      every room a day, + roomNight for each occupied room-night
//   perUser   each guest who used the pool or café that day (every guest staying uses both, bible §27G GUEST_PLAN) —
//             nobody uses one that is offline
export const WEAR = { facility: 0.6, light: { F07: 0.3, F08: 0.3 }, room: 0.4, roomNight: 0.3, perUser: 0.02, users: ['F03', 'F06'] };

// Maintenance jobs (M8 card): the Maintenance person on shift works one queue, like housekeeping (M4).
//   Repairs first (offline things, oldest first; maintenance priority jumps the line), then preventive service: anything
//   under serviceBelow, lowest first (a Service now from the player comes before those, oldest first).
//   service: +serviceAdd Condition, serviceMinutes × k, parts cost partsShare of the build cost
//   repair:  back online at repairTo, repairMinutes × k, costs repairShare of the build cost
//   k = (base − Skill/skillDiv − Speed/speedDiv) ÷ (1 + shedBonus × the Maintenance Shed's working share)
//   Walks count at walkPerTile game minutes a tile (from the Maintenance Shed at the start of a shift, else from the last
//   job). A shift is shiftMinutes of work (as housekeeping, Claude Code's pick); a job started inside it is finished.
//   On screen each job shows at least showSec game seconds (1 real second at 1×) in the repair pose.
export const JOBS = {
  role: 'MG',
  serviceBelow: 80,
  serviceAdd: 30,
  serviceMinutes: 60,
  repairTo: 60,
  repairMinutes: 180,
  base: 1.3,
  skillDiv: 200,
  speedDiv: 400,
  shed: 'F05',
  shedBonus: 0.1,
  partsShare: 0.01,
  repairShare: 0.08,
  walkPerTile: 1,
  shiftMinutes: 480,
  showSec: 1.0,
  behindMax: 3,
  pose: 'world_repair_action',
};

// Build costs (bible §27G facilities, §27E rooms by type) — the parts and repair costs are shares of them.
export const BUILD_COST = { F01: 2000, F02: 3500, F03: 5000, F04: 3000, F05: 3000, F06: 4000, F07: 2500, F08: 2000, RM01: 2500, RM02: 4000 };

// What a facility's Condition does to it (M8 card): its main effect follows the working share (offline: none).
//   F01 Reception: a check-in takes deskMinutes ÷ share (offline: twice as long) · F03 Pool: the +8 Activity · F04 Laundry:
//   the linen restock · F05 Shed: the repair speed bonus · F06 Café: the +6 Food and the covers (offline: no café income
//   either) · F08 Garden: the +6 Appeal · a room: the stay's Comfort.
// The worst share a stay saw is kept on the booking (src/systems/maintenance.js), so a review counts the pool that was
// broken on day 2 even if it was fixed by check-out.
export const STAY_FACILITIES = ['F03', 'F06'];

// A breakdown guests feel (M8 card: the breakdown complaint trigger, severity in data/complaints.js): a room breaking with a
// party in it always gives them a breakdown complaint (they need a room change); a facility they use going offline is a
// rolled trigger for each party staying, its category the one that facility feeds.
export const FELT = { F01: 'service', F03: 'activities', F06: 'food' };

// Badges on the map (bible §36: colour-blind-safe shapes): worn = an amber disc with a wrench, broken = a red warning
// triangle with a wrench (a different shape, not only a different colour).
export const BADGE = { worn: { color: '#E0A93A', shape: 'disc' }, broken: { color: '#D64545', shape: 'triangle' } };

// The plain Condition words on a sheet.
export const COND_TEXT = { good: 'Good', worn: (pct) => `Worn: working at ${pct}%`, broken: 'Broken: offline' };

// The breakdown log kept in the save (for the sheets and tests).
export const LOG_MAX = 60;
