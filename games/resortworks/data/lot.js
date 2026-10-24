// The Roadside Lot (Milestone 1, bible §21 / §27M): the starting plot on a hidden grid, the eight starting facilities and
// the first two rooms, where each one's doorway (use point) is, and the two walkers' loops. Plain data — the world
// (src/systems/resortWorld.js) blocks the footprints and walks the routes; the screen (src/screens/ResortScreen.js)
// projects it in the 3/4 view.
//   Grid: cols run down-right, rows down-left on screen. The road runs along the front-left edge (beyond the last row).
//   fp = footprint { col, row, w, h } (square, like the art) · door = the free tile in front where people stop — always on
//   a front face (row + h or col + w side), so nobody stops behind a building.

export const LOT = {
  cols: 15,
  rows: 13,
  cell: 200, // plan units per tile (walking speed and pathing)
  view: { halfW: 144, halfH: 72 }, // one tile draws as a 288 × 144 diamond (2:1, the art's angle — same as the series)
  margin: 200, // verge round the lot (the camera stops at the lot plus this)
  road: { from: 0.35, to: 2.35 }, // the road beyond the front edge, in tiles past the last row (kerb strip before it)
  topOverhang: 420, // room above the lot's back corner for the tallest art (roofs, palms)
  zoom: { min: 0.22, max: 1.4, start: 0.5 }, // min: pinch out until the whole lot just fits across
  floorMaxPixels: 7e6, // the cached ground picture is capped at this many device pixels
};

// The eight starting facilities (bible §20 / §27G). line = the Lv1 effect in plain words.
export const FACILITIES = [
  { id: 'F01', name: 'Reception Desk', art: 'facility_f01', fp: { col: 5, row: 10, w: 2, h: 2 }, door: { col: 5, row: 12 }, line: 'Checks in two guests at the same time.' },
  { id: 'F02', name: 'Motel Service Block', art: 'facility_f02', fp: { col: 0, row: 0, w: 2, h: 2 }, door: { col: 2, row: 1 }, line: 'The staff rest point. Early service jobs are sent out 10% quicker.' },
  { id: 'F03', name: 'Small Pool', art: 'facility_f03', fp: { col: 5, row: 4, w: 3, h: 3 }, door: { col: 6, row: 7 }, line: 'Guests who swim here get +8 Activity.' },
  { id: 'F04', name: 'Laundry Room', art: 'facility_f04', fp: { col: 4, row: 0, w: 2, h: 2 }, door: { col: 4, row: 2 }, line: 'Washes 50 units of linen a day.' },
  { id: 'F05', name: 'Maintenance Shed', art: 'facility_f05', fp: { col: 12, row: 0, w: 2, h: 2 }, door: { col: 12, row: 2 }, line: 'Repairs are done 10% faster.' },
  { id: 'F06', name: 'Snack Café', art: 'facility_f06', fp: { col: 9, row: 5, w: 2, h: 2 }, door: { col: 9, row: 7 }, line: 'Serves 20 guests in each part of the day: +6 Food.' },
  { id: 'F07', name: 'Parking Area', art: 'facility_f07', fp: { col: 0, row: 10, w: 3, h: 3 }, door: { col: 3, row: 12 }, line: 'Room for 20 more guest arrivals a day.' },
  { id: 'F08', name: 'Garden Strip', art: 'facility_f08', fp: { col: 8, row: 8, w: 2, h: 2 }, door: { col: 8, row: 10 }, line: 'Makes everything within 4 tiles more appealing (+6 Appeal).' },
];

// The eight starting rooms (bible §10 / §27M, Milestone 3): 4 × RM01 Budget Room and 4 × RM02 Standard Room. Rooms 1 and 2
// are Milestone 1's; the six new ones fill the free land so every doorway is on a front face and on a lane. Odd numbers are
// Budget, even numbers Standard (Cowork's 4 + 4 split). id = the room's own id (its sheet, its saved state); typeId = its
// room type (data/bookings.js ROOM_TYPES: capacity, rate).
const room = (n, typeId, col, row, door) => ({
  id: `R${n}`,
  number: n,
  name: `Room ${n}`,
  typeId,
  type: typeId === 'RM01' ? 'Budget Room' : 'Standard Room',
  art: typeId === 'RM01' ? 'room_rm01' : 'room_rm02',
  fp: { col, row, w: 2, h: 2 },
  door,
});
export const ROOMS = [
  room(1, 'RM01', 0, 5, { col: 1, row: 7 }),
  room(2, 'RM02', 12, 5, { col: 12, row: 7 }),
  room(3, 'RM01', 2, 5, { col: 3, row: 7 }),
  room(4, 'RM02', 8, 0, { col: 8, row: 2 }),
  room(5, 'RM01', 0, 2, { col: 1, row: 4 }),
  room(6, 'RM02', 10, 0, { col: 10, row: 2 }),
  room(7, 'RM01', 0, 8, { col: 2, row: 9 }),
  room(8, 'RM02', 12, 8, { col: 12, row: 10 }),
];
export const roomById = (id) => ROOMS.find((r) => r.id === id) ?? null;

// How each picture sits on its footprint: width = the footprint diamond's width × width; the diamond's front corner sits
// at foot (a share of the picture's height, from the top). One scale for every piece of art.
export const ART_LOOK = { width: 1.06, foot: 0.97 };
export const ART_TWEAK = Object.fromEntries(ROOMS.map((r) => [r.id, { width: 1.0, foot: 0.985 }]));

// People: drawn height at zoom 1 (logical px); feet = where the feet sit in the picture (share of its height).
export const PERSON = { height: 200, feet: 0.985, guestSpeed: 260, staffSpeed: 280 };

// A staying guest's day follows the bands (Milestone 2's lone guest; Milestone 3: every booked guest). Each band lists
// where they go; a band with two stops splits at `until` (a share of the band). at: 'room' = their own room. going =
// while walking there, doing = while there (their sheet's "Now" line; {room} = their room's name).
export const GUEST_PLAN = {
  night: [{ at: 'room', going: 'Heading to bed', doing: 'Sleeping' }],
  morning: [{ at: 'F06', going: 'Walking to the café for breakfast', doing: 'Having breakfast at the café' }],
  midday: [{ at: 'F01', going: 'Walking to Reception', doing: 'At Reception' }],
  afternoon: [{ at: 'F03', going: 'Walking to the pool', doing: 'At the pool' }],
  evening: [
    { at: 'F06', until: 0.55, going: 'Walking to the café for dinner', doing: 'Having dinner at the café' },
    { at: 'room', going: 'Walking back to their room', doing: 'Back in their room' },
  ],
};
// Milestone 3: the band they check in (Midday of the arrival day): from the car park to Reception, then to their room.
// The band they check out (Morning of the last day): from their room to Reception, then to their car — and away.
export const ARRIVE_PLAN = [
  { at: 'F01', until: 0.45, going: 'Walking to Reception to check in', doing: 'Checking in at Reception' },
  { at: 'room', going: 'Walking to {room}', doing: 'Settling into {room}' },
];
export const LEAVE_PLAN = [
  { at: 'F01', until: 0.5, going: 'Walking to Reception to check out', doing: 'Checking out at Reception' },
  { at: 'F07', going: 'Walking back to their car', doing: 'Driving away', leaves: true },
];
export const ARRIVE_FROM = 'F07'; // a new party appears at the car park's doorway

// The M2 lone guest's look (a Road Trip Couple in Room 1). Milestone 3: they are the first real booked guest of a new
// resort (src/systems/resort.js), and a world made without bookings (tests) still has them.
export const GUEST_ROOM = 'R1';
export const GUEST = {
  art: 'world_guest_adult_a',
  sheetArt: 'guest_gt01',
  title: 'Guest',
  type: 'Road Trip Couple',
  typeId: 'GT01',
  plan: GUEST_PLAN,
};

// The one staff member is the run's Founder: their role's station and walking picture (bible §8 roles).
export const STAFF_ROLES = {
  FO: { station: 'F01', art: 'world_staff_frontoffice_base' },
  HK: { station: 'F04', art: 'world_staff_housekeeping_base' },
  HS: { station: 'F06', art: 'world_staff_hospitality_base' },
  AE: { station: 'F03', art: 'world_staff_activities_base' },
  MG: { station: 'F05', art: 'world_staff_maintenance_base' },
};
// Their day: at their role's station Morning to Evening, resting at the Motel Service Block at Night. 'station' is filled
// in per run; {name} is the place's name.
export const REST_POINT = 'F02';
export const STAFF_PLAN = {
  night: [{ at: REST_POINT, going: 'Walking to the {name}', doing: 'Resting' }],
  work: [{ at: 'station', going: 'Walking to the {name}', doing: 'Working at the {name}' }],
};

// The ground's colours (bright, sunny; the lot's kerb and path edging take the slot's accent colour).
export const LOOK = {
  verge: '#BFE39A', // grass round the lot
  grassA: '#8FD16A',
  grassB: '#84C962',
  grassLine: 'rgba(60,110,40,0.18)',
  path: '#F3DFAE', // sandy paths
  road: '#6E7378',
  roadEdge: '#4F5357',
  roadLine: '#FFF3C4',
  kerb: '#E9E2D2',
  shade: 'rgba(40,70,30,0.16)', // under the art, to seat it on the grass
};
