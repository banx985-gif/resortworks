// Early finance / pricing numbers (Milestone 6, bible §26 / §27D / §27E / §27G / §27M / §27N). Plain data —
// src/systems/finance.js runs it. Picks the bible leaves open are Cowork's (marked) or Claude Code's, and are logged in
// docs/DECISIONS.md. All money is whole Credits.
import { FACILITY_BUILD } from './build.js';

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
export const WAGES = { standard: 850, rare: 1450, elite: 2600, legendary: 4200, secret: 5800, divine: 5800 }; // (M28b: Divine 5,800)

// Daily upkeep (bible §27G facilities, §27E rooms), paid at each day change for the day just ended.
// (Milestone 12) every facility's from data/build.js (the shipped eight are unchanged); rooms: all twelve (bible §27E).
export const FACILITY_UPKEEP = Object.fromEntries(Object.entries(FACILITY_BUILD).map(([id, f]) => [id, f.upkeep]));
export const ROOM_UPKEEP = { RM01: 5, RM02: 7, RM03: 10, RM04: 11, RM05: 13, RM06: 17, RM07: 22, RM08: 24, RM09: 32, RM10: 42, RM11: 48, RM12: 75 };

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
  packages: { kind: 'income', name: 'Packages' }, // (Milestone 18) a package's price over the room's rate
  dining: { kind: 'income', name: 'Dining' }, // (Milestone 18) Restaurant, BBQ Terrace, Premium Restaurant
  retail: { kind: 'income', name: 'Gift Shop' },
  evening: { kind: 'income', name: 'Evening spend' }, // (Milestone 18) Rooftop Lounge
  events: { kind: 'income', name: 'Event fees' }, // (Milestone 19)
  eventCosts: { kind: 'cost', name: 'Event food & service' },
  signature: { kind: 'cost', name: 'Signature change' },
  partners: { kind: 'income', name: 'Partner rewards' }, // (Milestone 22) a contract goal met
  revenueShare: { kind: 'cost', name: 'Rescue Investor share' }, // (Milestone 25) 8% of revenue for a year
  rescue: { kind: 'credit', name: 'Rescue Investor' }, // (Milestone 25) debt written down (not income) // (Milestone 21) 10,000 to change the Signature // (Milestone 19) 18 Cr an attendee a day, the live choice's cost
  wages: { kind: 'cost', name: 'Wages' },
  facilityUpkeep: { kind: 'cost', name: 'Facility upkeep' },
  roomUpkeep: { kind: 'cost', name: 'Room upkeep' },
  food: { kind: 'cost', name: 'Food supplies' },
  linen: { kind: 'cost', name: 'Linen' },
  amenities: { kind: 'cost', name: 'Amenities' },
  utilities: { kind: 'cost', name: 'Utilities' },
  interest: { kind: 'cost', name: 'Credit interest' },
  comps: { kind: 'cost', name: 'Comped meals' }, // (Milestone 7) complaint recovery
  refunds: { kind: 'cost', name: 'Refunds' }, // (Milestone 7) complaint recovery
  repairs: { kind: 'cost', name: 'Repairs' }, // (Milestone 8) 8% of the build cost a repair
  parts: { kind: 'cost', name: 'Maintenance parts' }, // (Milestone 8) 1% of the build cost a preventive service
  hiring: { kind: 'cost', name: 'Hiring fees' }, // (Milestone 11) a new staff member's one-off fee
  training: { kind: 'cost', name: 'Training' }, // (Milestone 13) 300 Cr a session
  research: { kind: 'cost', name: 'Research' }, // (Milestone 17) paid when a project starts
  itemSales: { kind: 'income', name: 'Staff Items sold', noRevenue: true }, // (Milestone 14) spares sold back
  construction: { kind: 'cost', name: 'Building' }, // (Milestone 12) Build Mode: builds, upgrades and land, paid at once
  buildBack: { kind: 'income', name: 'Building sold or cancelled', noRevenue: true }, // (Milestone 12) sale and cancel refunds (not revenue)
  creditDraw: { kind: 'credit', name: 'Emergency Credit taken' },
  creditRepay: { kind: 'credit', name: 'Emergency Credit paid back' },
};
export const INCOME_LINES = Object.keys(LINES).filter((k) => LINES[k].kind === 'income');
export const COST_LINES = Object.keys(LINES).filter((k) => LINES[k].kind === 'cost');

// How much history the save keeps: closed months (the sheet's chart shows the last chartMonths) and ledger lines (core
// EconomySystem folds older ones into one line).
export const HISTORY = { months: 12, chartMonths: 6, ledgerLines: 400 };

// (Milestone 25) Full finance / yield (bible §26 / §27M; Claude Code's picks where the bible gives no number):
//   STAGE_SCALE — wages and every upkeep grow with the stage (a bigger resort runs a bigger operation): ×1.00 Roadside,
//     1.05 Holiday Lodge, 1.10 Destination, 1.15 Luxury Retreat, 1.20 World-Class, 1.25 Prestige Grounds
//   RESCUE — bible §27M exact: debt over 80% of the ceiling at 3 month ends in a row → the Rescue Investor: debt down to
//     35% of the ceiling, Prestige −5 (never below 0), 8% of revenue for one year (336 days); no save deletion, no restart
//   YIELD — the Rates sheet's suggested band per room type, from its last 28 nights: occupancy 85%+ (and Service 70+)
//     → Premium; under 55% → Value; otherwise Standard
//   YEARS — closed years kept for the profit history (every year of the run, small)
export const STAGE_SCALE = { roadside: 1, holiday: 1.05, destination: 1.1, luxury: 1.15, worldclass: 1.2, prestige: 1.25 };
export const RESCUE = { over: 0.8, months: 3, downTo: 0.35, prestige: 5, share: 0.08, shareDays: 336 };
export const YIELD = { window: 28, premiumAt: 0.85, valueBelow: 0.55, serviceMin: 70 };
