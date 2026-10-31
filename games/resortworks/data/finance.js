// Early finance / pricing numbers (Milestone 6, bible §26 / §27D / §27E / §27G / §27M / §27N). Plain data —
// src/systems/finance.js runs it. Picks the bible leaves open are Cowork's (marked) or Claude Code's, and are logged in
// docs/DECISIONS.md. All money is whole Credits.

// A new resort's cash (bible §27M). Old saves get the same on load (M6 card).
export const START_CASH = 32000;

// Pricing bands (bible §27E): the share of the room type's base nightly rate. Set per room type in the Rates sheet.
export const PRICE_BANDS = [
  { id: 'value', name: 'Value', mult: 0.85, line: 'Cheaper: more guests book, each night earns less.' },
  { id: 'standard', name: 'Standard', mult: 1.0, line: 'The base rate.' },
  { id: 'premium', name: 'Premium', mult: 1.2, line: 'Dearer: fewer guests book, and fewer still if Service is under 70.' },
];
export const DEFAULT_BAND = 'standard';
export const bandById = (id) => PRICE_BANDS.find((b) => b.id === id) ?? null;

// Demand (Cowork's pick, M6 card; bible §27E): an offer whose nightly rate is above the guest type's budget is less likely
// to come in — it is kept with chance max(floor, 1 − slope × (rate / budget − 1)). Premium pricing with Service under
// serviceMin loses up to premiumCut more: (serviceMin − Service) / serviceMin × premiumCut. Service is the rolling 28-day
// score (no reviews yet: no Premium cut).
export const DEMAND = { slope: 1.5, floor: 0.4, serviceMin: 70, premiumCut: 0.3 };

// Income (Cowork's pick until M18 adds food spend): the Snack Café takes this much per guest per staying day, at Evening.
export const CAFE = { facility: 'F06', perGuestDay: 12 };

// Wages per 28-day month by tier (bible §27D), paid at the month end to everyone employed (the Founder too).
export const WAGES = { standard: 850, rare: 1450, elite: 2600, legendary: 4200, secret: 5800 };

// Daily upkeep (bible §27G facilities, §27E rooms), paid at each day change for the day just ended.
export const FACILITY_UPKEEP = { F01: 10, F02: 14, F03: 18, F04: 12, F05: 12, F06: 16, F07: 5, F08: 4 };
export const ROOM_UPKEEP = { RM01: 5, RM02: 7 };

// Supplies per occupied room-night at Basic quality (bible §27N), paid at each day change for the night just slept.
export const SUPPLIES = { food: 11, linen: 5, amenities: 4, utilities: 6 };

// Emergency Credit (bible §27M): starts by itself the moment cash would go below 0. Ceiling = max(floor, share × lifetime
// revenue), never above cap. Interest per 28-day month on the debt at the month end. It is paid back by itself at each
// day change from any cash above `keep` (Claude Code's pick, so a small working balance stays). Over warnShare of the
// ceiling a test warning is logged (the Rescue Investor is Milestone 25).
export const CREDIT = { floor: 20000, share: 0.25, cap: 250000, interestPct: 1.5, keep: 1000, warnShare: 0.8 };

// The lines of the Finance sheet, in plain words. kind: income / cost / credit (credit moves cash but is not profit).
export const LINES = {
  rooms: { kind: 'income', name: 'Room nights' },
  cafe: { kind: 'income', name: 'Snack Café' },
  wages: { kind: 'cost', name: 'Wages' },
  facilityUpkeep: { kind: 'cost', name: 'Facility upkeep' },
  roomUpkeep: { kind: 'cost', name: 'Room upkeep' },
  food: { kind: 'cost', name: 'Food supplies' },
  linen: { kind: 'cost', name: 'Linen' },
  amenities: { kind: 'cost', name: 'Amenities' },
  utilities: { kind: 'cost', name: 'Utilities' },
  interest: { kind: 'cost', name: 'Credit interest' },
  creditDraw: { kind: 'credit', name: 'Emergency Credit taken' },
  creditRepay: { kind: 'credit', name: 'Emergency Credit paid back' },
};
export const INCOME_LINES = Object.keys(LINES).filter((k) => LINES[k].kind === 'income');
export const COST_LINES = Object.keys(LINES).filter((k) => LINES[k].kind === 'cost');

// How much history the save keeps: closed months (the sheet's chart shows the last chartMonths) and ledger lines (core
// EconomySystem folds older ones into one line).
export const HISTORY = { months: 12, chartMonths: 6, ledgerLines: 400 };
