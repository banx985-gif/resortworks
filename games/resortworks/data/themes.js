// Emergent resort themes, Signature and facility combos (Milestone 21, bible §14 / §16 / §27K). Plain data —
// src/systems/themes.js runs it. The formulas' weights, the thresholds, the Signature cost and cooldown and the combos'
// requirements are the bible's; how each input is measured is Claude Code's pick (DECISIONS M21).
//
// Each theme: 0–100, recalculated at each month end from the last 84 days of play (WINDOW). parts: [weight, input] —
// inputs (each 0–100):
//   share:TAG        the share of stays (check-outs) by guests with that tag (data/bookings.js tags) × 100
//   sat:TAG          the average satisfaction of those guests' stays (0 when none)
//   util:SET         how busy those facilities were: the average guests staying a day ÷ their places together, × 100,
//                    at most 100 (0 when none is built)
//   events:IDS       the average score of those events held (any event when IDS is empty; 0 when none)
//   luxRooms         the share of stays in a Luxury Suite or better × 100
//   food             the average Food category of the stays
//   appeal           Resort Appeal now (M9)
//   views            the share of rooms with a good view (view % > 0) × 100
//   eco              energy-efficiency research / operation: R27 Energy Efficiency 60 + the Signature Garden 40 (the Garden
//                    Strip 20 without it)
//   eveningSpend     the evening and dining spend a guest-night ÷ 25 × 100, at most 100
export const WINDOW = 84;
const FAMILY_FAC = ['F10', 'F11', 'F12'];
const LUX_FAC = ['F27', 'F28', 'F29', 'F30'];
const ADV_FAC = ['F12', 'F13', 'F14'];
const WELL_FAC = ['F16', 'F17', 'F18', 'F30'];
const EVENING_FAC = ['F21', 'F22', 'F26'];
const DINING_FAC = ['F06', 'F09', 'F22', 'F25'];
const ACT_FAC = ['F03', 'F11', 'F12', 'F13', 'F21', 'F28'];
export const THEMES = [
  { id: 'TH01', name: 'Family Resort', tags: ['family'], parts: [[40, 'share:family'], [30, `util:${FAMILY_FAC}`], [30, 'sat:family']] },
  { id: 'TH02', name: 'Luxury Retreat', tags: ['luxury'], parts: [[35, 'luxRooms'], [35, 'sat:luxury'], [30, `util:${LUX_FAC}`]] },
  { id: 'TH03', name: 'Adventure Resort', tags: ['adventure'], parts: [[50, `util:${ADV_FAC}`], [30, 'share:adventure'], [20, 'events:EV06,EV08']] },
  { id: 'TH04', name: 'Wellness Resort', tags: ['wellness'], parts: [[40, `util:${WELL_FAC}`], [35, 'share:wellness'], [25, 'sat:wellness']] },
  { id: 'TH05', name: 'Party Resort', tags: ['night', 'event'], parts: [[45, `util:${EVENING_FAC}`], [35, 'share:night|event'], [20, 'eveningSpend']] },
  { id: 'TH06', name: 'Romantic Escape', tags: ['romance'], parts: [[40, 'share:romance|wedding|honeymoon'], [35, 'sat:romance'], [25, 'events:EV03,EV11']] },
  { id: 'TH07', name: 'Eco Garden Resort', tags: ['quiet'], parts: [[40, 'appeal'], [30, 'views'], [30, 'eco']] },
  { id: 'TH08', name: 'Food Destination', tags: ['foodie'], parts: [[45, 'food'], [35, `util:${DINING_FAC}`], [20, 'share:foodie']] },
  { id: 'TH09', name: 'Entertainment Resort', tags: ['event', 'group'], parts: [[45, `util:${ACT_FAC}`], [35, 'events:'], [20, 'share:event|group']] },
].map((t) => ({ ...t, art: `theme_${t.id.toLowerCase()}` }));
export const themeById = (id) => THEMES.find((t) => t.id === id) ?? null;
// Thresholds (bible §27K): 25 recognised; 50 +3% matching demand; 75 +6%; 90 eligible as Signature at World-Class.
export const LEVELS = [
  { at: 90, name: 'Signature-ready', demand: 0.06 },
  { at: 75, name: 'Strong', demand: 0.06 },
  { at: 50, name: 'Known for it', demand: 0.03 },
  { at: 25, name: 'Recognised', demand: 0 },
];
// Signature (bible §16 / §27K): only one at once, at the World-Class stage, from a theme at 90+; changing it costs 10,000
// Credits and has a 180-day cooldown (setting the first one is free — Claude Code's reading). Its small permanent bonus
// (Claude Code's pick): +5% demand from its guests (through the ±20% stack) and +2 satisfaction for them. It never locks
// other content.
export const SIGNATURE = { stage: 'worldclass', min: 90, changeCost: 10000, cooldownDays: 180, demand: 0.05, sat: 2 };

// Facility combos (bible §14): on while every listed facility exists (and the extra condition); +10% each, never needed.
//   need: facility ids (and room types RMxx) that must all be built; extra: 'quiet' (rooms' average noise at most
//   COMBO_QUIET), 'evening' (R23 Night Entertainment — "evening programming"), 'prestige100' (Prestige 100: M29+).
//   fx: what the +10% is on — sat:TAGS (those guests' final satisfaction ×1.1), demand:TAGS (those guests' demand
//   +10%, through the ±20% stack), eventScore (every event's score ×1.1), weddingScore (weddings ×1.1 too),
//   eveningSpend (the Rooftop Lounge / dining evening spend ×1.1), prestige (prestige guests' demand +10%).
export const COMBO_BONUS = 0.1;
export const COMBO_QUIET = 8;
export const COMBOS = [
  { id: 'CB01', name: 'Family Paradise', need: ['F10', 'F11', 'F12'], fx: [{ k: 'sat', tags: ['family'] }], what: '+10% family satisfaction' },
  { id: 'CB02', name: 'Wellness Retreat', need: ['F17', 'F16', 'F18'], fx: [{ k: 'sat', tags: ['wellness'] }], what: '+10% wellness satisfaction' },
  { id: 'CB03', name: 'Wedding Destination', need: ['F20', 'F25', 'RM11'], fx: [{ k: 'sat', tags: ['romance', 'wedding'] }, { k: 'weddingScore' }], what: '+10% wedding / romance' },
  { id: 'CB04', name: 'Food Destination', need: ['F09', 'F25', 'F22'], fx: [{ k: 'demand', tags: ['foodie'] }], what: '+10% foodie demand' },
  { id: 'CB05', name: 'Event Resort', need: ['F19', 'F32', 'F31'], fx: [{ k: 'eventScore' }], what: '+10% event score' },
  { id: 'CB06', name: 'Luxury Escape', need: ['F28', 'F29', 'F30'], fx: [{ k: 'sat', tags: ['luxury'] }], what: '+10% luxury satisfaction' },
  { id: 'CB07', name: 'Garden Sanctuary', need: ['F33', 'RM04'], extra: 'quiet', fx: [{ k: 'sat', tags: ['quiet'] }], what: '+10% quiet / retiree satisfaction' },
  { id: 'CB08', name: 'Adventure Base', need: ['F14', 'F13', 'F23'], fx: [{ k: 'demand', tags: ['adventure'] }], what: '+10% adventure demand' },
  { id: 'CB09', name: 'Night Resort', need: ['F26', 'F21'], extra: 'evening', fx: [{ k: 'eveningSpend' }], what: '+10% evening spend' },
  { id: 'CB10', name: 'Paradise', need: ['F34', 'F35'], extra: 'prestige100', fx: [{ k: 'demand', tags: ['prestige'] }], what: 'prestige guest multiplier' },
];
export const comboById = (id) => COMBOS.find((c) => c.id === id) ?? null;
