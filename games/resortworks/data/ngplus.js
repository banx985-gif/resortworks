// The Year-20 ending and New Game+1–3 (Milestone 28, bible §30 / §31). Plain data — src/systems/ending.js runs it on
// core/GradeEngine and core/NgPlusSystem. The grade's nine categories are the bible's (§31); their points, parts and
// bands are Claude Code's picks (DECISIONS M28), set so S+ stays rare (Kairosoft rule 5).
export const END = { year: 20, day: 20 * 336 }; // the ending: the first day after Year 20 (Year 21, Day 1); play goes on

// §31: Guest Satisfaction, Service Quality, Resort Appeal, Staff Wellbeing / development, finances, awards, Prestige,
// Guestbook / history and discovery — 100 points in all.
export const GRADE_CATEGORIES = [
  { id: 'sat', name: 'Guest Satisfaction', max: 15, parts: [{ fact: 'satisfaction', label: 'Satisfaction (last 28 days)', floor: 60, full: 95, points: 15 }] },
  { id: 'service', name: 'Service Quality', max: 12, parts: [{ fact: 'service', label: 'Service (last 28 days)', floor: 60, full: 95, points: 12 }] },
  { id: 'appeal', name: 'Resort Appeal', max: 12, parts: [{ fact: 'appeal', label: 'Resort Appeal', floor: 50, full: 95, points: 12 }] },
  { id: 'staff', name: 'Staff Wellbeing & development', max: 10, parts: [{ fact: 'wellbeing', label: 'Staff Wellbeing', floor: 50, full: 90, points: 6 }, { fact: 'avgLevel', label: 'the team’s average level', floor: 1, full: 15, points: 4 }] },
  { id: 'money', name: 'Finances', max: 12, parts: [{ fact: 'profitYears', label: 'share of years in profit', floor: 0, full: 1, points: 6 }, { fact: 'cash', label: 'Credits in the bank', floor: 0, full: 500000, points: 6 }] },
  { id: 'awards', name: 'Awards', max: 12, parts: [{ fact: 'visibleAwards', label: 'different visible awards won', floor: 0, full: 10, points: 8 }, { fact: 'awardWins', label: 'award wins in all', floor: 0, full: 30, points: 4 }] },
  { id: 'prestige', name: 'Prestige', max: 12, parts: [{ fact: 'prestige', label: 'Prestige', floor: 0, full: 100, points: 12 }] },
  { id: 'history', name: 'Guestbook & history', max: 8, parts: [{ fact: 'guests', label: 'guests in the Guestbook', floor: 0, full: 200, points: 5 }, { fact: 'regulars', label: 'Regulars', floor: 0, full: 30, points: 3 }] },
  { id: 'discovery', name: 'Discovery', max: 7, parts: [{ fact: 'secrets', label: 'secrets found this run', floor: 0, full: 30, points: 5 }, { fact: 'achievements', label: 'achievements (account)', floor: 0, full: 40, points: 2 }] },
];
export const GRADE_BANDS = [{ id: 'C', min: 0 }, { id: 'B', min: 55 }, { id: 'A', min: 70 }, { id: 'S', min: 82 }, { id: 'S+', min: 92 }];
export const ENDING_BONUS = 2; // SEC44 Twenty Years Open's "ending grade bonus" (+2 points)

// New Game+ (§30): what a new run keeps. The account half (achievements, secrets, Prestige Tokens, keepsakes, the
// highest NG+, Resort Tokens and entitlements from M29) lives in the account store and is never touched by a run.
export const NG_RULES = {
  maxLevel: 3,
  fields: {
    always: [{ id: 'identity', label: 'the resort’s name, General Manager, colours and Founder' }],
    chosen: [{ id: 'legacyStaff', label: 'one Legacy Staff member (level, stats and specialisations kept)' }, { id: 'signatureLegacy', label: 'a Signature Theme legacy perk (NG+2 and later)' }],
    reset: [
      { id: 'layout', label: 'the layout, rooms and facilities' }, { id: 'bookings', label: 'bookings and guests' }, { id: 'team', label: 'the rest of the team' },
      { id: 'research', label: 'research' }, { id: 'finance', label: 'Credits and the books' }, { id: 'partners', label: 'partners' }, { id: 'rivals', label: 'rivals and awards' },
      { id: 'events', label: 'events' }, { id: 'weather', label: 'weather' }, { id: 'memories', label: 'the Guestbook (its summary goes to the account)' }, { id: 'runSecrets', label: 'this run’s secret counters' },
      { id: 'items', label: 'Staff Items' },
    ],
  },
  legacy: { picksByLevel: [0, 1, 1, 1], statPct: 100 },
  advantages: { perRun: {}, maxRuns: 0 },
};
// What each NG+ level adds (§30): NG+1 a Legacy Staff member, stronger rivals, the Paradise Circle path (SEC40, P10);
// NG+2 + a Signature Theme legacy perk and the deepest prestige paths (SEC06 / 08 / 10 / 15 / 38 / 49); NG+3 every
// prestige system and the True RESORTWORKS ending through SEC50.
export const NG_LEVELS = [
  null,
  { n: 1, words: 'One Legacy Staff member, stronger rivals, the Paradise Circle path.' },
  { n: 2, words: 'Legacy Staff, a Signature Theme legacy perk, the deepest prestige guests and awards.' },
  { n: 3, words: 'Every prestige system, and the True RESORTWORKS ending.' },
];
export const RIVAL_NG = 3; // every rival's score +3 a NG+ level (Claude Code's pick: "stronger rivals")
// The Signature legacy perk (NG+2+): the parent's Signature theme's guests book a little more (+3%, inside the ±20% cap)
// and enjoy it a little more (+2 satisfaction). Claude Code's pick.
export const SIGNATURE_LEGACY = { demand: 0.03, sat: 2 };
