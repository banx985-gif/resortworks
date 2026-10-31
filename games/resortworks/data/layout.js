// Movement / noise / views numbers (Milestone 9, bible §13 / §27B / §27F / §27G). Plain data — src/systems/layout.js runs
// it. All numbers are Cowork's starting picks (M9 card) unless marked; Claude Code's readings are logged in docs/DECISIONS.md.
//   Distance between two things = the tiles between their footprints (Chebyshev: 0 when they touch, 1 with one tile
//   between). The road edge is the line past the lot's last row. A source reaches `radius` tiles; at distance d it gives
//   strength × (1 − d / (radius + 1)) (views fall off the same way).

// Walking distance (lanes from M1): lane tiles from a room's doorway to these doorways. Comfort loses perTile for each
// tile the average trip is over freeTiles, at most cap (the Convenience penalty). Fit distanceMatch = 1 − average / fitDiv.
export const WALK = { to: ['F01', 'F06', 'F03'], freeTiles: 6, perTile: 0.5, cap: 8, fitDiv: 20 };

// Noise sources (bands they are active in; 'job' = the Maintenance Shed while a maintenance job is running; 'always').
export const NOISE = [
  { id: 'F03', strength: 30, radius: 3, bands: ['afternoon'] },
  { id: 'F06', strength: 20, radius: 2, bands: ['morning', 'evening'] },
  { id: 'F04', strength: 15, radius: 2, bands: ['morning', 'midday'] },
  { id: 'F05', strength: 15, radius: 2, job: true },
  { id: 'F07', strength: 10, radius: 2, bands: ['morning', 'midday'] },
  { id: 'road', strength: 10, radius: 1, always: true, name: 'the road' },
];
// The effect on a stay: each band they stay (Claude Code's reading: every band of the stay counts — the walkers' day plan
// is a picture, the room is theirs all day), noise over half their Noise tolerance (bible §27F) takes
// (noise − tolerance / 2) / perPoint off Comfort, nightMult × at Night (sleep), cap at most for the stay. Over their full
// tolerance: a noise trigger (M7, data/complaints.js). Fit noiseMatch = 1 − average room noise / fitDiv, where the
// average is over the five bands with the Shed counted in Maintenance's shift bands (shedBands).
export const NOISE_EFFECT = { perPoint: 4, nightMult: 2, cap: 12, fitDiv: 100, shedBands: ['morning', 'midday', 'afternoon'] };

// Views (sum at each room, then capped): the total is a % on the Room category, capped ±cap (bible §13). The Garden's
// part follows its Condition (its working share, M8). Fit viewMatch = (view % + cap) / (2 × cap).
export const VIEWS = [
  { id: 'F08', add: 6, radius: 4, condition: true, name: 'Garden' },
  { id: 'F03', add: 4, radius: 3, name: 'Pool' },
  { id: 'F04', add: -3, radius: 2, name: 'Laundry' },
  { id: 'F05', add: -3, radius: 2, name: 'Maintenance Shed' },
  { id: 'F07', add: -3, radius: 2, name: 'Car park' },
];
export const VIEW_CAP = 12;

// Resort Appeal (live from M9; was fixed at 66): base + the Garden (garden × its working share) + viewMult × the average
// room view %, clamped 0–100. The card's base 60 put the shipped lot at 68.35 — under the 72 every headline needs for 5★
// (M5) — so the base is 65 (the card's "adjust the 60 base if needed"): the shipped lot lands at 73.35 (checked by
// tests/resortworks/m9.test.mjs: 68–76), and a Garden worn under 70 or offline takes it back under 72.
export const APPEAL = { base: 65, garden: 6, gardenId: 'F08', viewMult: 2 };

// The room sheet's three plain lines (thresholds Claude Code's).
//   noise: the loudest band's noise at the room — quiet under quiet, some under loud, loud from loud.
//   walk:  the average trip — short up to freeTiles, long from long.
export const PLACE_TEXT = { quiet: 8, loud: 20, long: 12 };

// The Layout overlay on the map (one tap cycles Off → Noise → Views). Colour-blind-safe: noise is one hue (purple,
// stronger = deeper); views diverge blue (good) / orange (bad). Soft tint per tile; Reduced flashes: no fade, lighter.
export const OVERLAY = {
  modes: ['off', 'noise', 'views'],
  names: { off: 'Layout', noise: 'Noise', views: 'Views' },
  button: { off: '#1FA3A0', noise: '#784AAA', views: '#2E6ED8' }, // the button's colour in each mode
  noise: { rgb: [120, 60, 170], full: 30, maxAlpha: 0.66 },
  views: { good: [40, 110, 220], bad: [235, 120, 20], full: 6, maxAlpha: 0.6 },
  fadeSec: 0.25,
  reducedAlpha: 0.75,
};

// Test layouts (players can't move buildings until M12): each moves things into other things' places on the shipped
// lot (id → the id whose footprint and doorway it takes). Same-size places only, so every layout is as walkable as the
// shipped one. Found by trying every arrangement of the 2×2 places and the Pool ↔ car park swap (Claude Code):
//   garden  — the best 0.7 × average room view − Convenience − ½ noise loss: the Garden and the Pool among the rooms,
//             the Laundry, Shed and car park away, the café and Reception a short walk
//   service — the Laundry, the Shed and the car park beside the rooms (the Pool kept away): the most room noise over 30
//             (a Retired Couple's tolerance), then the lowest average view
export const TEST_LAYOUTS = {
  garden: { F01: 'R4', F02: 'R8', F04: 'F05', F05: 'R6', F06: 'R7', F08: 'R5', R4: 'F01', R5: 'F02', R6: 'F04', R7: 'F06', R8: 'F08' },
  service: { F01: 'F06', F02: 'F08', F04: 'R5', F05: 'R7', F06: 'R1', F08: 'F01', F03: 'F07', F07: 'F03', R1: 'F02', R5: 'F04', R7: 'F05' },
};

// Short names in the sheets' lines and review comments.
export const SHORT_NAMES = { F01: 'Reception', F03: 'pool', F04: 'laundry', F05: 'maintenance shed', F06: 'café', F07: 'car park', F08: 'garden', road: 'road' };

// The review comment (core ReviewText picks the best and worst category): a view of goodView % or more is the Room's
// strong line, badView % or less its weak line; a stay that lost noisy Comfort points or more to noise has a noise line
// as Comfort's weak line.
export const PLACE_REVIEW = {
  goodView: 4,
  badView: -2,
  noisy: 2,
  text: {
    goodView: ['We loved the view from our room.', 'Such a pretty view of the garden.'],
    badView: ['Our window looked out on the service yard.', 'Not much of a view.'],
    noisy: ['It was too noisy to rest.', 'The noise kept us awake.'],
  },
};
