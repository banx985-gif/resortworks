// Auto Schedule / automation numbers (Milestone 10, bible §27B / §27C). Plain data — src/systems/staffing.js runs the
// team side (patterns, priorities, fatigue, Staff Wellbeing), src/systems/bookings.js the Auto Accept filters. Picks the
// bible leaves open are Claude Code's, and are logged in docs/DECISIONS.md.

// Department priority (bible §27C): the workload target. Housekeeping / Maintenance: their shift capacity (8 h × target);
// Front Office: check-ins per hour (desk minutes ÷ target); Hospitality / Activities: their stat's pull on the stay
// categories (stat × target). extra = fatigue added on every working band on top of FATIGUE.work.
export const PRIORITIES = [
  { id: 'low', name: 'Low', target: 0.75, extra: 0, line: 'Less work, more rest.' },
  { id: 'normal', name: 'Normal', target: 1.0, extra: 0, line: 'A steady pace the team can keep up.' },
  { id: 'high', name: 'High', target: 1.2, extra: 2, line: 'More work done; the team tires slowly.' },
  { id: 'emergency', name: 'Emergency', target: 1.45, extra: 5, line: 'All hands. After 2 days it hurts Staff Wellbeing twice as much.' },
];
export const DEFAULT_PRIORITY = 'normal';
export const priorityById = (id) => PRIORITIES.find((p) => p.id === id) ?? null;

// Fatigue 0–100 (bible §27C), moved at every band edge for the band just ended. A working band adds work + the priority's
// extra, × (1 − Stamina / staminaDiv) (Claude Code's pick: with the bible's +8 / −10 alone a 3-band shift gains 24 and
// the 2 rest bands take off only 20, so everyone would end at 100 — Stamina makes Normal sustainable); a resting band
// takes off rest. Over tired: contribution × tiredShare; over worn: × wornShare and, at each day change, if they went
// over worn that day, absentChance of being away the whole next day (rests every band; seeded: the run, the person and the day).
export const FATIGUE = { work: 8, rest: 10, staminaDiv: 200, tired: 75, tiredShare: 0.9, worn: 90, wornShare: 0.75, absentChance: 0.25 };

// Emergency (bible §27C): up to maxDays days in a row before its Staff Wellbeing penalty doubles.
export const EMERGENCY = { maxDays: 2 };

// Staff Wellbeing (headline score, bible §7) once the team side is live: base − perFatigue × the team's average fatigue,
// − each Emergency department-day in the last `window` days (1 point; 2 after EMERGENCY.maxDays in a row). Normal play
// sits at ~75, the fixed number M5 used. Clamped 0–100.
export const WELLBEING = { base: 80, perFatigue: 0.5, emergencyDay: 1, window: 28 };

// Auto Accept filters (bible §27B). minRate: the room type the guest asks for — Any, Standard+ (a Standard Room or
// better), Premium+ (no Roadside room is Premium: nothing passes). maxOcc: the share of rooms held on every night of the
// stay, this booking included. reserve: rooms of each type kept free for the player to give out by hand. minSat: the
// expected satisfaction (the stay scored as if it went perfectly in the room Auto Assign would give) must reach it.
// preferRepeat / preferPackage: those offers are taken first (no repeat or package guests exist yet: no effect today).
export const AUTO_ACCEPT = {
  minRates: [
    { id: 'any', name: 'Any', rank: 0 },
    { id: 'standard', name: 'Standard+', rank: 2 },
    { id: 'premium', name: 'Premium+', rank: 3 },
  ],
  maxOccs: [70, 80, 90, 95, 100],
  reserveMax: 10,
  minSats: [null, 60, 70, 80], // null = Off
  defaults: { on: false, minRate: 'any', types: null, maxOcc: 100, reserve: {}, minSat: null, preferRepeat: false, preferPackage: false }, // types null = every type
};

// Hiring (Milestone 11, bible §27D / §27M): the Early staff (data/staff.js EARLY_STAFF) can join a Roadside team, up to
// cap people (the Founder included). fee = the Standard tier's hiring fee, paid at once; the wage (850 a month, data/
// finance.js WAGES) is paid with everyone's at each month end, a whole month for someone hired part-way through.
export const HIRING = { cap: 8, fee: 500 };

// Auto Assign (bible §27B): an unpinned upcoming booking whose room breaks down is moved to the best free room at once
// (Claude Code's pick for "Manual pinning overrides automation": a pinned one stays and waits).
export const AUTO_MOVE = { onBreakdown: true };
