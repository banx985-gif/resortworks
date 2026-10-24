// Housekeeping / laundry numbers (Milestone 4, bible §11 / §27E / §27G). Plain data — src/systems/housekeeping.js runs it.
// Picks the bible leaves open are Cowork's (marked) or Claude Code's, and are logged in docs/DECISIONS.md.

// Clean time in game minutes = base clean minutes (data/bookings.js ROOM_TYPES.clean) × (base − Speed/speedDiv −
// Skill/skillDiv) × linen factor, plus the walk at walkPerTile game minutes a tile (Cowork's 1.30 / 200 / 400). The
// Housekeeping Hub's −20% comes with F15 later.
//   shiftMinutes: a housekeeper works 8 game hours a shift — their cleaning capacity (walks count).
//   showSec: on screen each clean stays in the room at least this long (game seconds: 1 real second at 1×), with the
//     cleaning pose. The simulation stays in game minutes; the walker catches up (behindMax: skips cleans it is too far
//     behind on, so it never trails by more than a few rooms).
export const CLEAN = { base: 1.3, speedDiv: 200, skillDiv: 400, walkPerTile: 1, shiftMinutes: 480, showSec: 1.0, behindMax: 3, pose: 'world_cleaning_action' };

// F04 Laundry Room (bible §27G): 50 linen units restocked each Morning; each room turn uses 2 units per bed space
// (Budget / Standard rooms: 4). Run out → the clean still happens but takes ×1.5 and the room is marked "short on linen"
// (for M5 to use).
export const LINEN = { perMorning: 50, perBed: 2, shortFactor: 1.5 };

// A late room (a booked party arrived at Midday and their room isn't Ready): they wait at Reception. Service loss stored on
// the stay for M5 / M7 (Claude Code's pick): 1 point per 15 late minutes, 20 at most. No score or complaint yet.
export const LATE = { lossPerMinutes: 15, lossCap: 20 };
export const LATE_BADGE = { name: 'Late', color: '#D64545' }; // the room badge while a party waits for it

export const MINUTES_PER_DAY = 1440;
