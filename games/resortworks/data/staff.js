// The opening team (Milestone 4, bible §5 / §8 / §27C / §27D): the Founder + the four other Start staff, one per role.
// Plain data — src/systems/staff.js builds each worker on core/StaffModel. Picks the bible leaves open are Cowork's
// (marked) or Claude Code's, and are logged in docs/DECISIONS.md.

// The five work stats (bible §8), in the bible's template order.
export const STAT_KEYS = ['service', 'speed', 'skill', 'stamina', 'charm'];
export const STAT_NAMES = { service: 'Service', speed: 'Speed', skill: 'Skill', stamina: 'Stamina', charm: 'Charm' };

// Role Lv1 Standard templates [Service, Speed, Skill, Stamina, Charm] (bible §27D).
export const ROLE_TEMPLATES = {
  FO: [52, 44, 40, 36, 56],
  HK: [32, 54, 52, 48, 28],
  HS: [46, 46, 52, 40, 42],
  AE: [48, 44, 42, 48, 54],
  MG: [28, 44, 56, 52, 24],
};

// Tiers (bible §27D): add = added to all five stats; levels = the starting level range. Only Standard is used yet.
export const TIERS = {
  standard: { id: 'standard', name: 'Standard', add: 0, levels: [1, 3] },
  rare: { id: 'rare', name: 'Rare', add: 8, levels: [4, 7] },
  elite: { id: 'elite', name: 'Elite', add: 16, levels: [8, 12] },
  legendary: { id: 'legendary', name: 'Legendary', add: 24, levels: [12, 16] },
  secret: { id: 'secret', name: 'Secret', add: 30, levels: [15, 18] },
};

// Each level above 1 adds `top` to the role's two highest template stats and `other` to the other three, capped at
// `cap` (bible §27D). A tie for second-highest goes to the stat that comes first in STAT_KEYS (Claude Code's pick).
export const LEVEL_ADD = { top: 0.7, other: 0.35, cap: 100 };

// The three automatic work patterns (bible §27C): the bands they work, in order (Night wraps over midnight).
export const PATTERNS = {
  day: { id: 'day', name: 'Day', bands: ['morning', 'midday', 'afternoon'] },
  late: { id: 'late', name: 'Late', bands: ['midday', 'afternoon', 'evening'] },
  night: { id: 'night', name: 'Night', bands: ['evening', 'night', 'morning'] },
};
// The default share of each role on each pattern (bible §27C). With one person per role (Milestone 4), each gets their
// role's most common pattern (the card): Front Office Day, Housekeeping Day, Hospitality Late, Activities Late,
// Maintenance Day.
export const ROLE_PATTERN_SHARES = {
  FO: { day: 50, late: 35, night: 15 },
  HK: { day: 75, late: 20, night: 5 },
  HS: { day: 35, late: 60, night: 5 },
  AE: { day: 40, late: 55, night: 5 },
  MG: { day: 60, late: 25, night: 15 },
};
export const rolePattern = (role) => Object.entries(ROLE_PATTERN_SHARES[role] ?? { day: 1 }).sort((a, b) => b[1] - a[1])[0][0];

// The Start staff (bible §8 "Start" eligibility): one per role. They are the five Founder choices (data/setup.js
// FOUNDERS), so the run's Founder is one of them and the other four join as the opening team.
export const START_STAFF = ['S01', 'S11', 'S21', 'S31', 'S41'];
