// Staff Items (Milestone 14, bible §27D2): 24 types in 6 groups — given to a staff member, used up, and a permanent raise
// to the same stats training raises. Plain data — src/systems/items.js runs it on the shared core/ItemSystem. The icons
// (items/item_itXX.png, ui/ui_35.png) aren't drawn yet: code-drawn placeholders stand in under the same keys (src/main.js),
// so Aaron's files need no code change. Picks the bible leaves open are Claude Code's (DECISIONS).

export const ITEM_GROUPS = [
  { id: 'service', name: 'Service', letter: 'S', color: '#E0508A' },
  { id: 'speed', name: 'Speed', letter: 'Sp', color: '#3A9BE0' },
  { id: 'skill', name: 'Skill', letter: 'Sk', color: '#3E9B4F' },
  { id: 'stamina', name: 'Stamina', letter: 'St', color: '#F07A5A' },
  { id: 'charm', name: 'Charm', letter: 'C', color: '#D9A43A' },
  { id: 'mastery', name: 'Role Mastery', letter: 'M', color: '#784AAA' },
];
// Rarity: item points (each staff member can take 12 a campaign year), the sell price in Credits, the code-drawn frame
// colour, and the drop weight for random rewards (Legendary never drops at random: a prestige reward only).
export const ITEM_RARITIES = {
  common: { name: 'Common', points: 1, sell: 150, frame: '#9AA4AE', weight: 75 },
  rare: { name: 'Rare', points: 2, sell: 400, frame: '#3A9BE0', weight: 22 },
  elite: { name: 'Elite', points: 3, sell: 1000, frame: '#784AAA', weight: 3 },
  legendary: { name: 'Legendary', points: 4, sell: 2500, frame: '#D9A43A', weight: 0 },
};
// stat: the stat it raises ('primary' = the role's first Role Mastery stat; 'both' = both of them); gain: points.
const it = (id, group, name, rarity, stat, gain) => ({ id, group, name, rarity, stat, gain, art: `item_${id.toLowerCase()}` });
export const ITEM_TYPES = [
  it('IT01', 'service', 'Guest Notes', 'common', 'service', 1),
  it('IT02', 'service', 'Welcome Pin', 'common', 'service', 1),
  it('IT03', 'service', 'Service Handbook', 'rare', 'service', 2),
  it('IT04', 'service', 'Golden Service Badge', 'elite', 'service', 3),
  it('IT05', 'speed', 'Comfortable Work Shoes', 'common', 'speed', 1),
  it('IT06', 'speed', 'Pocket Timer', 'common', 'speed', 1),
  it('IT07', 'speed', 'Express Headset', 'rare', 'speed', 2),
  it('IT08', 'speed', 'Rapid-Service Kit', 'elite', 'speed', 3),
  it('IT09', 'skill', 'Training Manual', 'common', 'skill', 1),
  it('IT10', 'skill', 'Specialist Toolkit', 'common', 'skill', 1),
  it('IT11', 'skill', 'Masterclass Notes', 'rare', 'skill', 2),
  it('IT12', 'skill', 'Expert Toolkit', 'elite', 'skill', 3),
  it('IT13', 'stamina', 'Hydration Bottle', 'common', 'stamina', 1),
  it('IT14', 'stamina', 'Recovery Snack Pack', 'common', 'stamina', 1),
  it('IT15', 'stamina', 'Support Insoles', 'rare', 'stamina', 2),
  it('IT16', 'stamina', 'Pro Recovery Kit', 'elite', 'stamina', 3),
  it('IT17', 'charm', 'Smart Name Badge', 'common', 'charm', 1),
  it('IT18', 'charm', 'Presentation Kit', 'common', 'charm', 1),
  it('IT19', 'charm', 'Tailored Uniform Voucher', 'rare', 'charm', 2),
  it('IT20', 'charm', 'Prestige Brooch', 'elite', 'charm', 3),
  it('IT21', 'mastery', 'Department Tips Card', 'common', 'primary', 1),
  it('IT22', 'mastery', 'Specialist Workshop Pass', 'rare', 'both', 1),
  it('IT23', 'mastery', 'Excellence Certificate', 'elite', 'primary', 3),
  it('IT24', 'mastery', 'Legendary Hospitality Medal', 'legendary', 'both', 2),
];
export const itemType = (id) => ITEM_TYPES.find((x) => x.id === id) ?? null;
// Role Mastery stat mapping (bible §27D2): the first is the "primary role-weighted stat".
export const MASTERY = { FO: ['service', 'charm'], HK: ['speed', 'skill'], HS: ['skill', 'service'], AE: ['charm', 'stamina'], MG: ['skill', 'stamina'] };

// The universal rules (bible §27D2): loved ×1.5 rounded up + 3 Morale; disliked ×0.5 rounded down (at least 1); 12 item
// points a person a campaign year; stats never past their cap (100, as levels — the overflow is lost and the sheet warns
// first); each person loves 2 groups and dislikes 0–1, fixed from who they are (Claude Code's pick: seeded by their staff
// id alone, a dislike half the time).
export const ITEM_RULES = { loveMult: 1.5, dislikeMult: 0.5, loveMorale: 3, yearPoints: 12, statCap: 100, loves: 2, dislikeChance: 0.5, inboxDays: 28 };
// Inventory size by stage (bible §27D2); a full inventory sends new rewards to the Inbox for 28 days.
export const INVENTORY = { roadside: 40, holiday: 50, destination: 60, luxury: 70, worldclass: 80, prestige: 80 };

// Where items come from (bible §27D2). live: works now (Claude Code's chances, aiming at the bible's 1–3 items a month
// early): an excellent stay (each review of 4★+), a great training session, a random well-wisher (each month end).
// The rest come with their systems. Nothing is ever bought: no Credits, Resort Tokens, premium currency or real money
// path exists (grant() refuses any source not listed here).
export const ITEM_SOURCES = {
  stay: { name: 'An excellent stay', live: true, chance: 0.3 },
  training: { name: 'A great training session', live: true, chance: 0.25 },
  wellwisher: { name: 'A well-wisher', live: true, chance: 0.6 },
  gift: { name: 'A guest’s gift', live: true }, // (Milestone 20) a Regular who loved the stay
  partner: { name: 'A Partner', live: false, later: 'M22' },
  event: { name: 'A Great Success event', live: true }, // (Milestone 19)
  award: { name: 'An award', live: false, later: 'M23' },
  achievement: { name: 'An achievement', live: false, later: 'M26' },
  debug: { name: 'Test', live: true, debug: true }, // (?debug=1 and tests only)
};
// The Staff Items sheet's icon (ui_35, not drawn yet: a code-drawn placeholder).
export const ITEMS_ICON = 'ui_35';
