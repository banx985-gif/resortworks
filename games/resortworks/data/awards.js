// Rivals, the award calendar, Prestige and the yearly Expo (Milestone 23, bible §24 / §25 / §27A / §27L; Kairosoft rule 1).
// Plain data — src/systems/awards.js runs it. Exact from the bible: the rivals' base / growth / specialty, the award months,
// each category formula's weights, the ±4 seeded variance, REP +150 a visible award, Prestige's sources. Claude Code's
// picks (DECISIONS M23): each award's field of rivals and eligibility, how each formula input is measured, the Expo.
export const RIVALS = [
  { id: 'RV01', name: 'Sunset Motor Lodge', base: 54, growth: 0.8, bonus: 8, spec: ['AWR01'], specWords: '+8 Value / Local' },
  { id: 'RV02', name: 'Happy Trails Resort', base: 58, growth: 1.0, bonus: 10, spec: ['AWR03'], specWords: '+10 Family' },
  { id: 'RV03', name: 'Green Haven', base: 61, growth: 1.0, bonus: 10, spec: ['AWR08'], specWords: '+10 Wellness / Eco' },
  { id: 'RV04', name: 'Pulse Resort', base: 63, growth: 1.2, bonus: 10, spec: ['AWR05'], specWords: '+10 Events / Entertainment' },
  { id: 'RV05', name: 'Serenity House', base: 66, growth: 1.2, bonus: 12, spec: ['AWR08'], specWords: '+12 Wellness' },
  { id: 'RV06', name: 'Grand Vale Resort', base: 70, growth: 1.4, bonus: 12, spec: ['AWR07'], specWords: '+12 Luxury' },
  { id: 'RV07', name: 'Crown Bay', base: 76, growth: 1.5, bonus: 10, spec: ['AWR09', 'AWR10'], specWords: '+10 World / Prestige' },
  { id: 'RV08', name: 'Mirage One', base: 84, growth: 1.0, bonus: 8, spec: [], adaptive: true, specWords: 'adaptive +8 to your strongest category' },
].map((r) => ({ ...r, art: `rival_${r.id.toLowerCase()}` }));
export const rivalById = (id) => RIVALS.find((r) => r.id === id) ?? null;
// (Milestone 34 tuning, DECISIONS M34) rivals grow for their first 10 years, then hold; no rival is stronger than 92 (+ the
// year's ±4) in any award, specialty included.
export const RIVAL_TUNE = { growthYears: 10, cap: 92 };
export const VARIANCE = 4; // ± seeded per rival per award per year, rolled and saved at the start of each year

// The visible awards: the month judged (bible §27L), the category formula (weights out of 100), the field of rivals
// (local awards meet local rivals; the world ones everybody), and the eligibility the resort must meet before the 1st.
//   inputs: sat · value · service · reviews (average stars × 20) · clean · wellbeing · famSat · famAct (family stays'
//   Activities) · food · diningAppeal (Appeal + 5 a food place, ≤ 100) · eventAvg · venue (event venues' Condition) ·
//   appeal · finance (FinanceHealth) · luxSat · comfort · wellSat · wellUtil (spa / gym use) · prestige · guestbook ·
//   awardHistory (10 a visible award won, ≤ 100) · vip (VIP guests' satisfaction) · awr09 (this year's AWR09 score)
export const AWARDS = [
  { id: 'AWR01', name: 'Local Traveller Choice', month: 2, w: { sat: 40, value: 25, service: 20, reviews: 15 }, field: ['RV01', 'RV02', 'RV03'], elig: { stays: 30 }, eligWords: '30 completed stays' },
  { id: 'AWR02', name: 'Regional Clean Stay', month: 3, w: { clean: 60, service: 25, wellbeing: 15 }, field: ['RV01', 'RV02', 'RV03', 'RV04'], elig: { rank: 'D' }, eligWords: 'Rank D' },
  { id: 'AWR03', name: 'Family Favourite', month: 4, w: { famSat: 35, famAct: 30, service: 20, value: 15 }, field: ['RV01', 'RV02', 'RV03', 'RV04'], elig: { familyStays: 10 }, eligWords: '10 family stays' },
  { id: 'AWR04', name: 'Best Resort Dining', month: 5, w: { food: 60, service: 20, diningAppeal: 20 }, field: ['RV02', 'RV03', 'RV04', 'RV05'], elig: { built: ['F09', 'F22', 'F25'] }, eligWords: 'a Restaurant, BBQ Terrace or Premium Restaurant' },
  { id: 'AWR05', name: 'Best Event Destination', month: 6, w: { eventAvg: 45, service: 25, food: 20, venue: 10 }, field: ['RV03', 'RV04', 'RV05', 'RV06'], elig: { events: 1 }, eligWords: 'an event held' },
  { id: 'AWR06', name: 'National Resort Award', month: 7, w: { sat: 25, service: 20, appeal: 20, wellbeing: 15, finance: 10, reviews: 10 }, field: ['RV03', 'RV04', 'RV05', 'RV06', 'RV07'], elig: { rank: 'C' }, eligWords: 'Rank C' },
  { id: 'AWR07', name: 'Luxury Escape Award', month: 8, w: { luxSat: 35, service: 25, appeal: 20, comfort: 20 }, field: ['RV05', 'RV06', 'RV07', 'RV08'], elig: { roomRank: 9 }, eligWords: 'a Luxury Suite or better' },
  { id: 'AWR08', name: 'Wellness Destination Award', month: 9, w: { wellSat: 35, comfort: 25, service: 20, wellUtil: 20 }, field: ['RV03', 'RV05', 'RV06', 'RV07'], elig: { built: ['F17', 'F30'] }, eligWords: 'a Spa or Luxury Spa' },
  { id: 'AWR09', name: 'World Hospitality Award', month: 10, w: { sat: 25, service: 20, appeal: 20, prestige: 15, wellbeing: 10, guestbook: 10 }, field: ['RV05', 'RV06', 'RV07', 'RV08'], elig: { rank: 'A' }, eligWords: 'Rank A' },
  { id: 'AWR10', name: 'Global Destination Crown', month: 12, w: { awr09: 20, prestige: 20, awardHistory: 20, vip: 15, guestbook: 15, finance: 10 }, field: ['RV06', 'RV07', 'RV08'], elig: { rank: 'A', won: 'AWR09' }, eligWords: 'Rank A and a World Hospitality Award won' },
  // (Milestone 27) the secret two (bible §25): judged only once SEC37 / SEC38 is found. Month, formula and field are
  // Claude Code's picks (DECISIONS M27): the bible gives none.
  { id: 'AWR11', name: 'Hidden Paradise Medal', secret: true, month: 11, w: { prestige: 30, sat: 25, guestbook: 25, appeal: 20 }, field: ['RV06', 'RV07', 'RV08'], elig: {}, eligWords: 'found through a secret' },
  { id: 'AWR12', name: 'Legendary Resort Circle', secret: true, month: 12, w: { prestige: 35, awardHistory: 25, vip: 20, guestbook: 20 }, field: ['RV07', 'RV08'], elig: {}, eligWords: 'found through a secret' },
].map((a) => ({ ...a, art: `award_${a.id.toLowerCase()}` }));
export const awardById = (id) => AWARDS.find((a) => a.id === id) ?? null;
export const VISIBLE_AWARDS = AWARDS.filter((a) => !a.secret);
// A win (bible §27A): REP +150 (+400 secret, M27), Prestige +3 on an award's first win (+8 secret), a Staff Item (the
// items' award source). "Rival prestige victory" (Claude Code's reading): beating Mirage One in an award: Prestige +2,
// at most +8 a run.
export const WIN = { rep: 150, prestigeFirst: 3, rivalVictory: 2, rivalVictoryCap: 8, repSecret: 400, prestigeFirstSecret: 8 }; // (M27: a secret award REP +400, Prestige +8)

// Prestige (bible §27A): 0–100, never bought. The sources live now (the rest come with their systems): a visible award's
// first win +3, the first successful stay of each Prestige guest type +3, a positive memory of a VIP / prestige guest
// +1 (at most +12 a run), reaching World-Class +5, a Signature +3, beating Mirage One +2 (at most +8). A year ending
// under 3 stars: −5. R36 World Prestige: +20% from first-time sources (not repeats).
export const PRESTIGE = { firstPrestigeGuest: 3, vipMemory: 1, vipMemoryCap: 12, worldClass: 5, signature: 3, yearDecay: 5, decayBelowStars: 3, firstSat: 78 };
// REP from §27A that comes with these systems (Claude Code wired them here): a positive Guestbook memory +5, the first
// stay of each guest type +15, a facility combo's first time +40.
export const REP_EXTRA = { memory: 5, firstType: 15, firstCombo: 40 };

// Kairosoft rule 1 — the yearly show (Cowork's pick): the Roadside Travel Expo, every Month 9. The invitation comes on
// the 1st; Enter (or Skip) during the month. The resort's Expo score = the average of the three general award categories
// (Local Traveller Choice, Regional Clean Stay, National Resort Award — what any resort can show); every
// rival's = its base + growth × (year − 1) + its own ±4. Rewards by place (Claude Code's picks): 1st REP +60 and +5%
// demand for 28 days; 2nd–3rd REP +30 and +3%; anything else REP +10. Victor Crane has a line.
export const EXPO = { name: 'Roadside Travel Expo', month: 9, categories: ['AWR01', 'AWR02', 'AWR06'], rewards: [{ upTo: 1, rep: 60, demand: 0.05 }, { upTo: 3, rep: 30, demand: 0.03 }, { upTo: 99, rep: 10, demand: 0 }], demandDays: 28 };
// Victor Crane (chibi 29), General Manager of Crown Bay: one line on award nights and at the Expo.
export const VICTOR = { name: 'Victor Crane', art: 'cast_victor' };
export const VICTOR_LINES = {
  win: ['Enjoy it while it lasts. Crown Bay doesn’t lose twice.', 'Beginner’s luck. Next year, the trophy comes home to the Bay.', 'Hm. Your little place has teeth.'],
  lose: ['Another one for Crown Bay. Do try to keep up.', 'Polish the pool tiles, maybe next year?', 'The Bay sends its regards.'],
  absent: ['Not even on the list? Pity.', 'Crown Bay will save you a seat at the back.'],
  expo: ['Lovely little stand you have there.', 'The Expo is where real resorts shine. Do watch closely.', 'Crown Bay always draws the crowd.'],
};
