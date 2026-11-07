// Partners, sponsors and suppliers (Milestone 22, bible §23 / §26 / §27N). Plain data — src/systems/partners.js and
// src/systems/supplies.js run it. The table numbers are the bible's; the rest Claude Code's picks (DECISIONS M22).
//
// Partners on core/SponsorSystem (bible §23 shared contract): 336-day contracts, offers wait 56 days, a missed goal waits
// COOLDOWN days before that partner offers again (R33 Partner Network −25%) and loses its completion reward (money and
// items already earned are kept). Board slots: 1 at Rank E/D, 2 at C/B, 3 at A/S. P09 / P10 are Secret: never offered.
//   unlock   when they start offering: stays (completed), built (all of these), rank, stars
//   benefits passive while the contract runs: demand (tags +pct, through the ±20% stack), foodCost (−pct food supplies),
//            enquiries (+pct event enquiries), legendary (later)
//   goal     { signal, min, tags?, minSat?, minScore? } — counted by core SponsorSystem signals: 'stay' (a check-out of
//            those guests at minSat+), 'foodDay' (a day with the 28-day Food score 80+), 'event' (an event at minScore+),
//            'award' (a visible award won, M23), 'tour' (a stay with a tour or adventure package)
//   reward   Credits + Staff Items { group | rarity, n } (the items' Partner source)
export const PARTNER_RULES = { contractDays: 336, offerDays: 56, cooldownDays: 168, offerEvery: 7, slots: { E: 1, D: 1, C: 2, B: 2, A: 3, S: 3 } };
export const PARTNERS = [
  { id: 'P01', name: 'Roadline Travel', unlock: { stays: 10 }, benefits: [{ key: 'demand', value: 0.06 }], benefitWords: 'booking demand +6%', goal: { signal: 'stay', min: 40 }, goalWords: 'complete 40 stays', reward: { credits: 4000, items: [{ group: 'service', n: 2 }] } },
  { id: 'P02', name: 'FreshFields Foods', unlock: { built: ['F09'] }, benefits: [{ key: 'foodCost', value: 0.06 }], benefitWords: 'food supply cost −6%', goal: { signal: 'foodDay', min: 28 }, goalWords: 'Food score 80+ for 28 days', reward: { credits: 6000, items: [{ group: 'skill', n: 2 }] } },
  { id: 'P03', name: 'Sunloop Tours', unlock: { built: ['F14'] }, benefits: [{ key: 'demand', value: 0.08, tags: ['adventure'] }], benefitWords: 'adventure demand +8%', goal: { signal: 'stay', min: 20, tags: ['adventure'], orPkg: ['PK04'] }, goalWords: 'complete 20 tour / adventure stays', reward: { credits: 7500, items: [{ group: 'speed', n: 2 }] } },
  { id: 'P04', name: 'FamilyFun Co.', unlock: { built: ['F10', 'F11'] }, benefits: [{ key: 'demand', value: 0.1, tags: ['family'] }], benefitWords: 'family demand +10%', goal: { signal: 'stay', min: 30, tags: ['family'], minSat: 85 }, goalWords: '30 family stays at 85+', reward: { credits: 10000, items: [{ group: 'charm', n: 3 }] } },
  { id: 'P05', name: 'PureWell', unlock: { built: ['F17', 'F16'] }, benefits: [{ key: 'demand', value: 0.1, tags: ['wellness'] }], benefitWords: 'wellness demand +10%', goal: { signal: 'stay', min: 20, tags: ['wellness'], minSat: 88 }, goalWords: '20 wellness stays at 88+', reward: { credits: 12000, items: [{ group: 'stamina', n: 3 }] } },
  { id: 'P06', name: 'EventWorks', unlock: { built: ['F19'] }, benefits: [{ key: 'enquiries', value: 0.12 }], benefitWords: 'event enquiries +12%', goal: { signal: 'event', min: 5, minScore: 85 }, goalWords: '5 events at 85+', reward: { credits: 18000, items: [{ group: 'mastery', n: 3 }] } },
  { id: 'P07', name: 'SilverWing Travel', unlock: { rank: 'A' }, benefits: [{ key: 'demand', value: 0.1, tags: ['luxury', 'vip'] }], benefitWords: 'luxury / VIP demand +10%', goal: { signal: 'stay', min: 20, tags: ['luxury'], minSat: 90 }, goalWords: '20 luxury stays at 90+', reward: { credits: 25000, items: [{ rarity: 'rare', n: 4 }] } },
  { id: 'P08', name: 'Crown Escapes', unlock: { rank: 'A', stars: 5 }, benefits: [{ key: 'demand', value: 0.1, tags: ['prestige', 'luxury'] }], benefitWords: 'international / prestige demand +10%', goal: { signal: 'award', min: 1 }, goalWords: 'win one visible award during the contract', reward: { credits: 35000, items: [{ rarity: 'elite', n: 1 }, { rarity: 'rare', n: 3 }] } },
  { id: 'P09', name: 'Legacy Hospitality', secret: true, unlock: { secret: 'SEC39' }, benefits: [{ key: 'legendary', value: 0.1 }], benefitWords: 'Legendary staff appearance check +10% (relative)', goal: { signal: 'headlines90', min: 56 }, goalWords: 'all five headline scores 90+ for 56 days', reward: { credits: 50000, items: [{ rarity: 'elite', n: 2 }] } },
  { id: 'P10', name: 'Paradise Circle', secret: true, unlock: { secret: 'SEC40' }, benefits: [{ key: 'demand', value: 0.15, tags: ['prestige'] }], benefitWords: 'prestige-guest demand +15%', goal: { signal: 'stay', min: 3, tags: ['prestige'], minSat: 95 }, goalWords: 'host 3 prestige guests at 95+', reward: { credits: 75000, items: [{ rarity: 'legendary', n: 1 }, { rarity: 'elite', n: 2 }] } },
].map((p) => ({ ...p, art: `partner_${p.id.toLowerCase()}` }));
export const partnerById = (id) => PARTNERS.find((p) => p.id === id) ?? null;
// Priya Lark (chibi 28) presents every Partner offer and goal (data/cast.js).
export const PRIYA = { name: 'Priya Lark', art: 'cast_priya' };

// Suppliers (bible §27N): each group's tier sets its cost multiplier and the score cap it allows. Basic is where a new
// resort starts (and an older save). R29 Supply Quality cuts the Quality tier's extra cost by 15%.
//   food → the Food category's cap (and its supplies, event catering) · linen → Clean's cap · amenities → Room's cap ·
//   parts → maintenance parts' cost and breakdown chance (failure)
export const SUPPLY_GROUPS = [
  { id: 'food', name: 'Food', capWhat: 'Food score cap', line: 'food' },
  { id: 'linen', name: 'Linen', capWhat: 'Clean score cap', line: 'linen' },
  { id: 'amenities', name: 'Amenities', capWhat: 'Room score cap', line: 'amenities' },
  { id: 'parts', name: 'Maintenance parts', capWhat: 'breakdowns', line: 'parts' },
];
export const SUPPLY_TIERS = {
  food: { basic: { mult: 1, cap: 78 }, quality: { mult: 1.25, cap: 90 }, luxury: { mult: 1.65, cap: 100 } },
  linen: { basic: { mult: 1, cap: 82 }, quality: { mult: 1.2, cap: 93 }, luxury: { mult: 1.55, cap: 100 } },
  amenities: { basic: { mult: 1, cap: 82 }, quality: { mult: 1.25, cap: 93 }, luxury: { mult: 1.7, cap: 100 } },
  parts: { basic: { mult: 1, failure: 0 }, quality: { mult: 1.2, failure: 0.12 }, luxury: { mult: 1.55, failure: 0.25 } },
};
export const TIER_IDS = ['basic', 'quality', 'luxury'];
export const TIER_NAMES = { basic: 'Basic', quality: 'Quality', luxury: 'Luxury' };
