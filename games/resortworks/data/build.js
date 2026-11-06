// Build Mode / expansions numbers (Milestone 12, bible §6 / §20 / §21 / §27A / §27E / §27G / §27M). Plain data —
// src/systems/site.js runs it. The bible's numbers are exact; picks it leaves open are Cowork's (marked) or Claude Code's,
// and are logged in docs/DECISIONS.md.

// Campaign stages (bible §4 / §27A), in order. rank = the Resort Rank a stage's content is tied to (its base unlock rank for
// facility level gates, bible §27G). rooms / staff = the stage's caps.
export const STAGES = [
  { id: 'roadside', name: 'Roadside Motel', rank: 'E', rooms: 12, staff: 8 },
  { id: 'holiday', name: 'Holiday Lodge', rank: 'D', rooms: 24, staff: 14 },
  { id: 'destination', name: 'Destination Resort', rank: 'C', rooms: 40, staff: 20 },
  { id: 'luxury', name: 'Luxury Retreat', rank: 'B', rooms: 60, staff: 26 },
  { id: 'worldclass', name: 'World-Class Resort', rank: 'A', rooms: 80, staff: 32 },
  { id: 'prestige', name: 'Prestige Grounds', rank: 'S', rooms: 90, staff: 36, secret: true },
];
export const stageById = (id) => STAGES.find((s) => s.id === id) ?? STAGES[0];
export const stageIndex = (id) => Math.max(0, STAGES.findIndex((s) => s.id === id));
// The exact gates (bible §27A). award / prestige / secret: systems that come later (no resort can pass them yet).
export const STAGE_GATES = {
  holiday: { rank: 'D', stars: 2, stays: 60 },
  destination: { rank: 'C', stars: 3, stays: 200, award: 'AWR01' },
  luxury: { rank: 'B', stars: 4, stays: 500, awards: 4 },
  worldclass: { rank: 'A', stars: 5, stays: 900, award: 'AWR06', prestige: 55 },
  prestige: { rank: 'S', award: 'AWR10', prestige: 90, secret: 'SEC19' },
};
export const RANK_ORDER = ['E', 'D', 'C', 'B', 'A', 'S'];
export const rankAtLeast = (have, want) => RANK_ORDER.indexOf(have) >= RANK_ORDER.indexOf(want);

// The whole grid (plan tiles): the Roadside Lot is cols 0–14; the land beyond is bought (Garden Grounds: cols 15–21, the
// same 13 rows, joined to the lot by the lane down its right edge — Claude Code's pick). Unowned land is blocked.
export const GRID = { cols: 22, rows: 13 };
// Land expansions (bible §21). price: Garden Grounds 15,000 Credits (Cowork's pick — the bible gives none). cols = the
// strip it adds. Later ones are listed, locked (no land yet).
export const LAND = [
  { id: 'roadside', name: 'Roadside Lot', rank: 'E', price: 0, cols: [0, 14], art: 'expansion_01', line: 'The starter motel.' },
  { id: 'garden', name: 'Garden Grounds', rank: 'D', price: 15000, cols: [15, 21], art: 'expansion_02', line: 'A strip of open land beside the lot for family and garden rooms.' },
  { id: 'event', name: 'Event Quarter', rank: 'C', price: null, art: 'expansion_03', line: 'Events and entertainment.', later: true },
  { id: 'villa', name: 'Villa District', rank: 'B', price: null, art: 'expansion_04', line: 'Villas and luxury.', later: true },
  { id: 'ridge', name: 'Luxury Ridge', rank: 'A', price: null, art: 'expansion_05', line: 'World-class.', later: true },
  { id: 'prestigeLand', name: 'Prestige Grounds', rank: 'S', price: null, art: 'expansion_06', line: 'Secret.', secret: true, later: true },
];
export const landById = (id) => LAND.find((l) => l.id === id) ?? null;

// Rooms (bible §27E: capacity, build cost, base rate, daily upkeep, base clean minutes, stage). days = build days (Claude
// Code's pick — the bible gives none for rooms: about one day per 2,500 Credits of build cost, 2 at least, 12 at most).
// size = the footprint's side in tiles (the villas and the Presidential Retreat 3; Claude Code's pick from the art).
export const ROOM_BUILD = {
  RM01: { cost: 2500, days: 2, stage: 'roadside', size: 2 },
  RM02: { cost: 4000, days: 2, stage: 'roadside', size: 2 },
  RM03: { cost: 6500, days: 3, stage: 'holiday', size: 2 },
  RM04: { cost: 7500, days: 3, stage: 'holiday', size: 2 },
  RM05: { cost: 9000, days: 4, stage: 'holiday', size: 2 },
  RM06: { cost: 12000, days: 5, stage: 'destination', size: 2 },
  RM07: { cost: 15000, days: 6, stage: 'destination', size: 2 },
  RM08: { cost: 17500, days: 7, stage: 'destination', size: 2 },
  RM09: { cost: 24000, days: 9, stage: 'luxury', size: 2, luxury: true },
  RM10: { cost: 32000, days: 12, stage: 'luxury', size: 3, luxury: true },
  RM11: { cost: 38000, days: 12, stage: 'luxury', size: 3, luxury: true },
  RM12: { cost: 60000, days: 12, stage: 'worldclass', size: 3, luxury: true },
};

// Facilities (bible §20 / §27G: build cost, build days, upkeep/day). stage = the stage it unlocks at; size = footprint side
// in tiles (the shipped eight keep their M1 sizes; later ones Claude Code's pick from the art: pools, lawns, halls and
// gardens 3, the rest 2). one = only one of it on a resort (every facility, M12 — Claude Code's pick: the guests' day and
// the noise / view sources name one of each). core = the resort can't run without it: it can be moved, never sold.
export const FACILITY_BUILD = {
  F01: { cost: 2000, days: 2, upkeep: 10, stage: 'roadside', size: 2, core: true },
  F02: { cost: 3500, days: 3, upkeep: 14, stage: 'roadside', size: 2, core: true },
  F03: { cost: 5000, days: 4, upkeep: 18, stage: 'roadside', size: 3 },
  F04: { cost: 3000, days: 3, upkeep: 12, stage: 'roadside', size: 2, core: true },
  F05: { cost: 3000, days: 3, upkeep: 12, stage: 'roadside', size: 2, core: true },
  F06: { cost: 4000, days: 3, upkeep: 16, stage: 'roadside', size: 2 },
  F07: { cost: 2500, days: 2, upkeep: 5, stage: 'roadside', size: 3, core: true },
  F08: { cost: 2000, days: 2, upkeep: 4, stage: 'roadside', size: 2 },
  F09: { cost: 12000, days: 6, upkeep: 40, stage: 'holiday', size: 3 },
  F10: { cost: 10000, days: 5, upkeep: 28, stage: 'holiday', size: 2 },
  F11: { cost: 16000, days: 7, upkeep: 55, stage: 'holiday', size: 3 },
  F12: { cost: 9000, days: 5, upkeep: 25, stage: 'holiday', size: 2 },
  F13: { cost: 14000, days: 7, upkeep: 35, stage: 'holiday', size: 3 },
  F14: { cost: 8000, days: 4, upkeep: 18, stage: 'holiday', size: 2 },
  F15: { cost: 9000, days: 5, upkeep: 20, stage: 'holiday', size: 2 },
  F16: { cost: 15000, days: 6, upkeep: 38, stage: 'destination', size: 2 },
  F17: { cost: 22000, days: 8, upkeep: 65, stage: 'destination', size: 3 },
  F18: { cost: 12000, days: 5, upkeep: 32, stage: 'destination', size: 2 },
  F19: { cost: 30000, days: 10, upkeep: 85, stage: 'destination', size: 3 },
  F20: { cost: 25000, days: 8, upkeep: 45, stage: 'destination', size: 3 },
  F21: { cost: 24000, days: 8, upkeep: 60, stage: 'destination', size: 3 },
  F22: { cost: 18000, days: 6, upkeep: 42, stage: 'destination', size: 2 },
  F23: { cost: 14000, days: 5, upkeep: 30, stage: 'destination', size: 2 },
  F24: { cost: 15000, days: 5, upkeep: 20, stage: 'destination', size: 2 },
  F25: { cost: 45000, days: 12, upkeep: 120, stage: 'luxury', size: 3, luxury: true },
  F26: { cost: 38000, days: 10, upkeep: 95, stage: 'luxury', size: 2, luxury: true },
  F27: { cost: 30000, days: 8, upkeep: 55, stage: 'luxury', size: 2, luxury: true },
  F28: { cost: 55000, days: 14, upkeep: 150, stage: 'luxury', size: 3, luxury: true },
  F29: { cost: 42000, days: 10, upkeep: 100, stage: 'luxury', size: 2, luxury: true },
  F30: { cost: 65000, days: 14, upkeep: 180, stage: 'luxury', size: 3, luxury: true },
  F31: { cost: 48000, days: 11, upkeep: 110, stage: 'luxury', size: 2, luxury: true },
  F32: { cost: 80000, days: 16, upkeep: 220, stage: 'luxury', size: 3, luxury: true },
  F33: { cost: 60000, days: 14, upkeep: 90, stage: 'luxury', size: 3, luxury: true },
  F34: { cost: 120000, days: 20, upkeep: 300, stage: 'prestige', size: 3, luxury: true, secret: true },
  F35: { cost: 180000, days: 24, upkeep: 420, stage: 'prestige', size: 3, luxury: true, secret: true },
};

// Construction (bible §27G): cash leaves at once; cancelling refunds `early` of it before `half` of the build days have
// passed, `late` after. Selling returns `sell` of everything spent on it (build + upgrades). Moving is free; the thing
// is offline for moveDays game days (Cowork's M12 card).
export const CONSTRUCTION = { early: 0.7, late: 0.35, half: 0.5, sell: 0.5, moveDays: 1 };
// Upgrades (bible §27G facilities / §27E rooms): the cost as a share of the Lv1 build cost and the game days it takes.
// Facilities: Lv2 70%, Lv3 110%; rooms: Lv2 60%, Lv3 90%; days 3 / 5 for both (rooms: Cowork's M15 pick).
export const UPGRADE = {
  facility: { 2: { share: 0.7, days: 3 }, 3: { share: 1.1, days: 5 } },
  room: { 2: { share: 0.6, days: 3 }, 3: { share: 0.9, days: 5 } },
  maxLevel: 3,
};
// Facility level rank gates (bible §27G): by the Rank of the stage it unlocks at → [Lv2 rank, Lv3 rank]. A/S facilities need
// S for Lv2 and postgame / NG+ for Lv3 (null: not yet).
export const LEVEL_RANKS = { E: ['D', 'C'], D: ['C', 'B'], C: ['B', 'A'], B: ['A', 'S'], A: ['S', null], S: ['S', null] };

// Dougie Barnes (chibi 13, the builder — M6b cast) gives one-line build updates. {name} = what is being built.
export const DOUGIE = {
  id: 'dougie',
  name: 'Dougie Barnes',
  art: 'cast_dougie',
  lines: {
    start: ['Right, the {name} is under way. I’ll shout when it’s up.', 'Spades in the ground for the {name}!'],
    half: ['The {name} is half way there.', 'Walls are up on the {name}: half done.'],
    done: ['The {name} is finished. Open for business!', 'All done: the {name} is ready.'],
    upgrade: ['The {name} upgrade is under way.'],
    upgraded: ['The {name} is now Level {level}.'],
    land: ['The Garden Grounds are ours. Plenty of room to build!'],
  },
};

// The scaffold drawn over a plot under construction (code-drawn, bible §27G "a code-drawn scaffold").
export const SCAFFOLD = { pole: '#A8743A', plank: '#D9A55B', net: 'rgba(240,170,60,0.28)', bar: '#3E9B4F', barBack: 'rgba(0,0,0,0.25)' };
// The Build Mode grid: free tiles a placement can use, the ghost (green fits, red doesn't), unowned land.
export const BUILD_LOOK = { grid: 'rgba(255,255,255,0.35)', ok: 'rgba(62,155,79,0.45)', bad: 'rgba(214,69,69,0.45)', okEdge: '#2E7D3E', badEdge: '#B03030', land: 'rgba(90,70,40,0.35)', landEdge: 'rgba(90,70,40,0.6)' };
