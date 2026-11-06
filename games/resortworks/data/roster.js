// All 50 staff (Milestone 13, bible §8 / §27C / §27D): who they are, their tier, trait and when they can apply; levels,
// XP, training, the applicant pool and the Lv8 / Lv16 specialisations. Plain data — src/systems/staff.js and
// src/systems/staffing.js run it. Picks the bible leaves open are Cowork's (marked) or Claude Code's, and are logged in
// docs/DECISIONS.md. (The five work stats, role templates, tiers and patterns stay in data/staff.js.)

// Tier money (bible §27D): the one-off hiring fee (the wage per 28-day month is data/finance.js WAGES).
export const TIER_FEES = { standard: 500, rare: 1500, elite: 5000, legendary: 12000, secret: 0 };

// when = the bible's Eligibility: start / early (Roadside), holiday / destination / luxury (that stage reached),
// legendary (a secret condition, M29) / secret (NG+ or a secret, M29). Legendary and Secret staff stay locked.
// effect = the trait's bible number as { key, pct } (pct: + or − %). What each key changes is TRAIT_KEYS below.
const s = (id, name, role, tier, trait, key, pct, when) => ({ id, name, role, tier, trait, effect: { key, pct }, when, art: `staff_${id.toLowerCase()}` });
export const STAFF = [
  s('S01', 'Maya Bell', 'FO', 'standard', 'Warm Welcome', 'checkin', 4, 'start'),
  s('S02', 'Eli Cross', 'FO', 'standard', 'Quick Desk', 'queue', 5, 'early'),
  s('S03', 'Nina Hart', 'FO', 'rare', 'Problem Solver', 'recovery', 8, 'holiday'),
  s('S04', 'Arun Vale', 'FO', 'rare', 'Concierge Eye', 'vip', 6, 'holiday'),
  s('S05', 'Tess Morgan', 'FO', 'rare', 'Smooth Check-In', 'readiness', 10, 'destination'),
  s('S06', 'Noah Pike', 'FO', 'rare', 'Upsell Sense', 'upsell', 6, 'destination'),
  s('S07', 'Clara Quinn', 'FO', 'elite', 'Perfect Host', 'deskService', 10, 'luxury'),
  s('S08', 'Rafi Stone', 'FO', 'elite', 'Guest Memory', 'repeat', 8, 'luxury'),
  s('S09', 'Sofia Crown', 'FO', 'legendary', 'Golden Concierge', 'recovery', 15, 'legendary'),
  s('S10', 'Ari Lux', 'FO', 'secret', 'Impossible Host', 'recovery', 20, 'secret'),
  s('S11', 'Ruby Hale', 'HK', 'standard', 'Fast Turn', 'cleanSpeed', 5, 'start'),
  s('S12', 'Sam Moss', 'HK', 'standard', 'Neat Eye', 'cleanliness', 4, 'early'),
  s('S13', 'Jae Finch', 'HK', 'rare', 'Laundry Rhythm', 'linen', 8, 'holiday'),
  s('S14', 'Priya Vale', 'HK', 'rare', 'Quiet Worker', 'disturbance', -8, 'holiday'),
  s('S15', 'Milo Reed', 'HK', 'rare', 'Room Reset', 'readiness', 8, 'destination'),
  s('S16', 'Zoe Grant', 'HK', 'rare', 'Detail Clean', 'presentation', 8, 'destination'),
  s('S17', 'Nora Bell', 'HK', 'elite', 'Perfect Rooms', 'cleanliness', 12, 'luxury'),
  s('S18', 'Theo Ward', 'HK', 'elite', 'Zero Delay', 'backlog', -20, 'luxury'),
  s('S19', 'Ivy Pearl', 'HK', 'legendary', 'White Glove', 'cleanliness', 15, 'legendary'),
  s('S20', 'Halo Snow', 'HK', 'secret', 'Never Missed', 'hkGuard', 1, 'secret'),
  s('S21', 'Leo Kitchen', 'HS', 'standard', 'Good Plate', 'food', 4, 'start'),
  s('S22', 'Mina Cole', 'HS', 'standard', 'Fast Serve', 'serviceSpeed', 5, 'early'),
  s('S23', 'Omar Finch', 'HS', 'rare', 'Family Favourite', 'familyDining', 8, 'holiday'),
  s('S24', 'Cleo Bell', 'HS', 'rare', 'Bar Flair', 'leisureSpend', 8, 'holiday'),
  s('S25', 'Niko Vale', 'HS', 'rare', 'Banquet Hand', 'eventCatering', 8, 'destination'),
  s('S26', 'Aria Moss', 'HS', 'rare', 'Room Service', 'roomService', 8, 'destination'),
  s('S27', 'Chef Mira', 'HS', 'elite', 'Signature Dish', 'food', 12, 'luxury'),
  s('S28', 'Juno Reed', 'HS', 'elite', 'Service Flow', 'diningCapacity', 10, 'luxury'),
  s('S29', 'Chef Aurelia', 'HS', 'legendary', 'Golden Table', 'food', 15, 'legendary'),
  s('S30', 'Chef Zero', 'HS', 'secret', 'Perfect Course', 'prestigeFood', 20, 'secret'),
  s('S31', 'Kai West', 'AE', 'standard', 'Pool Energy', 'activity', 4, 'start'),
  s('S32', 'Lena Bell', 'AE', 'standard', 'Kids Smile', 'familyActivity', 5, 'early'),
  s('S33', 'Tara Moss', 'AE', 'rare', 'Event Spark', 'event', 8, 'holiday'),
  s('S34', 'Ben Vale', 'AE', 'rare', 'Tour Guide', 'excursion', 8, 'holiday'),
  s('S35', 'Nia Cross', 'AE', 'rare', 'Wedding Calm', 'wedding', 8, 'destination'),
  s('S36', 'Soren Reed', 'AE', 'rare', 'Night Host', 'evening', 8, 'destination'),
  s('S37', 'Mara Quinn', 'AE', 'elite', 'Crowd Reader', 'utilisation', 12, 'luxury'),
  s('S38', 'Jax Bloom', 'AE', 'elite', 'Perfect Event', 'groupEvent', 10, 'luxury'),
  s('S39', 'Luna Star', 'AE', 'legendary', 'Showstopper', 'activity', 15, 'legendary'),
  s('S40', 'Nova Joy', 'AE', 'secret', 'Unforgettable', 'eventMemory', 20, 'secret'),
  s('S41', 'Gus Hale', 'MG', 'standard', 'Handy', 'repairSpeed', 5, 'start'),
  s('S42', 'Rami Cole', 'MG', 'standard', 'Green Thumb', 'grounds', 5, 'early'),
  s('S43', 'Nora Pike', 'MG', 'rare', 'Preventive', 'prevention', 8, 'holiday'),
  s('S44', 'Dax Moss', 'MG', 'rare', 'Pool Tech', 'poolReliability', 8, 'holiday'),
  s('S45', 'Theo Stone', 'MG', 'rare', 'Quick Fix', 'emergencyRepair', 10, 'destination'),
  s('S46', 'Maya Grove', 'MG', 'rare', 'Landscaper', 'view', 8, 'destination'),
  s('S47', 'Sol Reed', 'MG', 'elite', 'Systems Mind', 'efficiency', 12, 'luxury'),
  s('S48', 'Iris Vale', 'MG', 'elite', 'Perfect Grounds', 'outdoor', 12, 'luxury'),
  s('S49', 'Atlas Forge', 'MG', 'legendary', 'Never Breaks', 'prevention', 15, 'legendary'),
  s('S50', 'Sage Evergreen', 'MG', 'secret', 'Paradise Keeper', 'mgGuard', 1, 'secret'),
];
export const staffDef = (id) => STAFF.find((x) => x.id === id) ?? null;
export const HIREABLE_TIERS = ['standard', 'rare', 'elite'];
// Which stage opens each eligibility (data/build.js STAGES). Legendary / secret: never through the applicant pool.
export const WHEN_STAGE = { start: 'roadside', early: 'roadside', holiday: 'holiday', destination: 'destination', luxury: 'luxury' };
export const WHEN_WORDS = { legendary: 'Legendary · unlocks through a secret', secret: 'Secret · New Game+ or a secret' };

// What each trait / specialisation key changes now (live) — or, for systems that come later, kept on the person and
// marked with the milestone that makes it work. Every pct adds up across the team (people away today don't count).
export const TRAIT_KEYS = {
  checkin: { live: true, words: 'check-in speed' }, // Front Office desk minutes ÷ (1 + %)
  queue: { live: true, words: 'desk queue speed' }, // the same desk minutes
  recovery: { live: true, words: 'complaint recovery' }, // recovery chance × (1 + %)
  readiness: { live: true, words: 'room-readiness comms (less late-room Service loss)' }, // late Service loss × (1 − %)
  backlog: { live: true, words: 'late-room backlog' }, // late Service loss × (1 + %): the % is negative
  deskService: { live: true, words: 'Service score' },
  cleanSpeed: { live: true, words: 'cleaning speed' }, // clean minutes ÷ (1 + %)
  cleanliness: { live: true, words: 'Clean score' },
  linen: { live: true, words: 'linen a day' },
  disturbance: { live: true, words: 'noise lost' }, // the stay's noise Comfort loss × (1 + %): negative
  presentation: { live: true, words: 'Room score' },
  food: { live: true, words: 'Food score' },
  serviceSpeed: { live: true, words: 'Service score' },
  leisureSpend: { live: true, words: 'café spend' },
  activity: { live: true, words: 'Activities score' },
  utilisation: { live: true, words: 'Activities score' },
  repairSpeed: { live: true, words: 'repair speed' }, // maintenance job minutes ÷ (1 + %)
  efficiency: { live: true, words: 'maintenance speed' },
  emergencyRepair: { live: true, words: 'breakdown repair speed' }, // repairs only
  prevention: { live: true, words: 'breakdown chance' }, // breakdown roll × (1 − %)
  poolReliability: { live: true, words: 'pool breakdowns' }, // the pools' roll × (1 − %)
  grounds: { live: true, words: 'Garden appeal' }, // the Garden's Appeal × (1 + %)
  outdoor: { live: true, words: 'outdoor appeal' },
  view: { live: true, words: 'room views' }, // view % × (1 + %)
  vip: { later: 'M22', words: 'VIP satisfaction' },
  upsell: { later: 'M18', words: 'package upsell' },
  repeat: { later: 'M20', words: 'repeat guests' },
  familyDining: { later: 'M18', words: 'family dining' },
  familyActivity: { later: 'M18', words: 'family activities' },
  eventCatering: { later: 'M19', words: 'event catering' },
  roomService: { later: 'M18', words: 'room service' },
  diningCapacity: { later: 'M18', words: 'dining capacity' },
  event: { later: 'M19', words: 'event enjoyment' },
  excursion: { later: 'M18', words: 'excursions' },
  wedding: { later: 'M19', words: 'weddings' },
  evening: { later: 'M18', words: 'evening entertainment' },
  groupEvent: { later: 'M19', words: 'group events' },
  prestigeFood: { later: 'M29', words: 'prestige food' },
  eventMemory: { later: 'M29', words: 'event memories' },
  hkGuard: { later: 'M29', words: 'first housekeeping slip each week' },
  mgGuard: { later: 'M29', words: 'first breakdown each month' },
};

// Levels and XP (bible §27D): cap 20; to the next level 80 + 25 × (level − 1); 3 XP a working band, +2 for exceptional
// service (Claude Code's reading: every 5★ review gives +2 to everyone at work that day), +12 a training session.
export const XP = { cap: 20, base: 80, per: 25, band: 3, exceptional: 2, training: 12 };
export const xpToNext = (level) => XP.base + XP.per * (level - 1);
// Training (Cowork's pick): 300 Credits a session, +12 XP, once a week (7 days) for each person.
export const TRAINING = { fee: 300, weekDays: 7 };
// The applicant pool (Claude Code's pick): 4 people, a new list every 7 days, from those the stage allows.
export const POOL = { size: 4, weekDays: 7 };

// Specialisations at Lv8 and Lv16 (bible §8 / §27D "two role-specialisation choices"; the bible names none, so these are
// Claude Code's picks — two a level for each role, inside the role, each a small trait-style bonus).
const sp = (id, name, key, pct, line) => ({ id, name, effect: { key, pct }, line });
export const SPECIALISATIONS = {
  FO: { 8: [sp('fo8a', 'Check-in Pro', 'checkin', 8, '+8% check-in speed'), sp('fo8b', 'Guest Relations', 'recovery', 8, '+8% complaint recovery')], 16: [sp('fo16a', 'Front Office Lead', 'deskService', 6, '+6% Service score'), sp('fo16b', 'Concierge', 'vip', 10, '+10% VIP satisfaction (VIPs come later)')] },
  HK: { 8: [sp('hk8a', 'Speed Cleaner', 'cleanSpeed', 8, '+8% cleaning speed'), sp('hk8b', 'Detail Keeper', 'cleanliness', 6, '+6% Clean score')], 16: [sp('hk16a', 'Head Housekeeper', 'readiness', 20, '−20% late-room Service loss'), sp('hk16b', 'Linen Master', 'linen', 15, '+15% linen a day')] },
  HS: { 8: [sp('hs8a', 'Line Cook', 'food', 6, '+6% Food score'), sp('hs8b', 'Café Host', 'leisureSpend', 8, '+8% café spend')], 16: [sp('hs16a', 'Head Chef', 'food', 8, '+8% Food score'), sp('hs16b', 'Service Captain', 'serviceSpeed', 8, '+8% Service score')] },
  AE: { 8: [sp('ae8a', 'Pool Host', 'activity', 6, '+6% Activities score'), sp('ae8b', 'Family Host', 'familyActivity', 8, '+8% family activities (families come later)')], 16: [sp('ae16a', 'Entertainment Lead', 'activity', 8, '+8% Activities score'), sp('ae16b', 'Event Planner', 'event', 10, '+10% event score (events come later)')] },
  MG: { 8: [sp('mg8a', 'Fixer', 'repairSpeed', 10, '+10% repair speed'), sp('mg8b', 'Gardener', 'grounds', 6, '+6% Garden appeal')], 16: [sp('mg16a', 'Chief Engineer', 'prevention', 12, '−12% breakdown chance'), sp('mg16b', 'Landscape Lead', 'view', 8, '+8% room views')] },
};
export const SPEC_LEVELS = [8, 16];
export const specById = (id) => Object.values(SPECIALISATIONS).flatMap((r) => [...r[8], ...r[16]]).find((x) => x.id === id) ?? null;
