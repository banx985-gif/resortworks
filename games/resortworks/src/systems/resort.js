// A new resort's campaign save and its slot summary (Milestone 0, bible §5 / §33). The campaign is empty for now — the
// resort's identity and the date; the simulation's state joins it milestone by milestone (with SAVE_MIGRATIONS).
import { founderById, paletteById, ROLES, FOUNDER_FLAG } from '../../data/setup.js';
import { CALENDAR, BANDS } from '../../data/calendar.js';
import { firstBookings } from './bookings.js';
import { makeTeam } from './staff.js';
import { freshHousekeeping } from './housekeeping.js';
import { minuteOf } from './calendar.js';
import { freshReviews } from './reviews.js';
import { freshFinance } from './finance.js';
import { freshComplaints } from './complaints.js';
import { freshMaintenance } from './maintenance.js';
import { freshStaffing } from './staffing.js';
import { freshSite } from './site.js';
import { freshProgress } from './progress.js';
import { freshResearch } from './research.js';
import { freshItems } from './items.js';
import { setStage as setLiveStage } from './guests.js';
import { freshPackages } from './packages.js';
import { freshEvents } from './events.js';
import { freshGuestbook } from './guestbook.js';
import { freshThemes } from './themes.js';
import { freshSupplies } from './supplies.js';
import { freshPartners } from './partners.js';
import { freshAwards } from './awards.js';
import { freshWeather } from './weather.js';
import { freshAchvRun } from './achievements.js';

// A saved calendar (core/Clock's serialize() + band) for a date at the start of Morning — a new resort, or a save made
// before the calendar existed (Milestone 2).
export function calendarFromDate(date = { year: 1, month: 1, day: 1 }) {
  const perYear = CALENDAR.daysPerMonth * CALENDAR.monthsPerYear;
  const totalDays = (date.year - 1) * perYear + (date.month - 1) * CALENDAR.daysPerMonth + (date.day - 1);
  return { year: date.year, month: date.month, day: date.day, totalDays, dayProgress: CALENDAR.startProgress, speed: 1, lastSpeed: 1, band: 'morning' };
}

export const managerLine = (name) => `General Manager ${name || '…'}`;

// setup: { resort, manager, palette, founder } from Resort Setup.
export function newCampaign(setup, now = Date.now()) {
  const seed = `resortworks-${now}`; // the run's seed, fixed at creation (a reload never rerolls it)
  const founder = founderById(setup.founder);
  setLiveStage('roadside'); // (Milestone 18) a new resort's first offers: the Roadside guest types
  if (!founder) throw new Error(`Unknown founder ${setup.founder}`);
  if (!setup.resort?.trim() || !setup.manager?.trim()) throw new Error('A resort needs a name and a General Manager');
  return {
    resort: {
      name: setup.resort.trim(),
      manager: setup.manager.trim(),
      palette: paletteById(setup.palette).id,
      founder: { id: founder.id, [FOUNDER_FLAG]: true }, // the permanent Founder history flag (bible §5)
      createdAt: now,
    },
    seed,
    date: { year: 1, month: 1, day: 1 },
    calendar: calendarFromDate(), // (Milestone 2) the clock exactly as it stands: day, progress, band, speed
    bookings: firstBookings({ seed, day: 0, band: 'morning' }), // (Milestone 3) offers, bookings, stays, room states
    staff: makeTeam(seed, founder.id), // (Milestone 4) the opening team: the Founder + the four other Start staff
    housekeeping: freshHousekeeping({ minute: minuteOf(0, 1) }), // (Milestone 4) cleaning jobs, queue, linen
    reviews: freshReviews(), // (Milestone 5) reviews, REP / Rank, the monthly star rating ("New" until the first month ends)
    finance: freshFinance({ day: 0 }), // (Milestone 6) 32,000 Credits, the ledger, no debt, Standard pricing
    complaints: freshComplaints(), // (Milestone 7) complaints, recovery actions and results
    maintenance: freshMaintenance({ minute: minuteOf(0, 1) }), // (Milestone 8) Condition 90 everywhere, no jobs yet
    staffing: freshStaffing({ day: 0, band: 1 }), // (Milestone 10) Normal priorities, Auto Schedule, everyone rested
    site: freshSite(), // (Milestone 12) the shipped Roadside Lot: what stands where, no construction, the starter land
    progress: freshProgress(), // (Milestone 12) the Roadside Motel stage
    research: freshResearch(), // (Milestone 17) nothing researched yet
    items: freshItems(), // (Milestone 14) an empty Staff Items store
    packages: freshPackages(), // (Milestone 18) no package on sale yet
    events: freshEvents(), // (Milestone 19) no events yet
    guestbook: freshGuestbook(), // (Milestone 20) an empty Guestbook
    themes: freshThemes(), // (Milestone 21) no theme yet
    supplies: freshSupplies(), // (Milestone 22) Basic everything
    partners: freshPartners(), // (Milestone 22) an empty Partner Board
    awards: freshAwards(), // (Milestone 23) no awards, Prestige 0
    weather: freshWeather(), // (Milestone 24) rolled at the first band edge
    achv: freshAchvRun(), // (Milestone 26) this run's achievement counters
    secrets: null, // (Milestone 27) made at the first open (its first staff are the run's)
    ending: null, // (Milestone 28) the Year-20 ending, once reached
    legacy: null, // (Milestone 28) an NG+ run's Legacy Staff and Signature legacy
    parent: null, // (Milestone 28) an NG+ run's parent (its name, level and grade; never its slot)
    guide: null, // (Milestone 33) the first-time guide starts with the resort
    opal: { welcomed: false }, // (M6b) Dame Opal's welcome card is due (a save from before M6b has none: no welcome)
    playSec: 0,
    ngPlus: 0,
  };
}

// The small record the Campaign Slots screen reads (bible §5: resort, manager, Founder, Year/Month, stage, star rating,
// Prestige, NG+, playtime and ending grade) without loading the campaign. Stage / stars / Prestige / grade stay blank or
// zero until their systems exist.
export function slotSummary(data) {
  const r = data.resort;
  const founder = founderById(r.founder.id);
  return {
    resort: r.name,
    manager: r.manager,
    palette: r.palette,
    founderId: founder?.id ?? r.founder.id,
    founderName: founder?.name ?? r.founder.id,
    founderRole: founder ? ROLES[founder.role].name : '',
    year: data.date.year,
    month: data.date.month,
    stage: data.progress?.stage ?? data.stage ?? null, // (Milestone 12)
    stars: data.reviews?.stars ?? data.stars ?? 0, // (Milestone 5) 0 = New
    cash: data.finance?.econ?.balances?.credits ?? null, // (Milestone 6)
    prestige: data.awards?.prestige?.value ?? data.prestige ?? 0, // (Milestone 23) live Prestige
    ngPlus: data.ngPlus ?? 0,
    playSec: data.playSec ?? 0,
    grade: data.grade ?? null,
  };
}

// "2h 05m" (playtime on the slot card).
export function playTime(sec) {
  const m = Math.floor((sec ?? 0) / 60);
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

// Save version → upgrade. 1 → 2 (Milestone 2): a save from before the calendar gets one at its date, start of Morning.
// 2 → 3 (Milestone 3): a save from before bookings gets them at its calendar's day and band — the lone guest as the first
// booked guest in Room 1 (2 nights from now), every other room Ready, and that day's offers if Morning has come.
export const SAVE_MIGRATIONS = {
  1: (record) => ({ ...record, data: { ...record.data, calendar: record.data.calendar ?? calendarFromDate(record.data.date) } }),
  2: (record) => {
    const d = record.data;
    const cal = d.calendar ?? calendarFromDate(d.date);
    return { ...record, data: { ...d, bookings: d.bookings ?? firstBookings({ seed: d.seed ?? 'resortworks', day: cal.totalDays ?? 0, band: cal.band ?? 'morning' }) } };
  },
  // 3 → 4 (Milestone 4): the opening team joins (from the run's seed and Founder), and housekeeping starts at the save's
  // last band edge with a cleaning job for every room already Dirty and a full day of linen.
  3: (record) => {
    const d = record.data;
    const seed = d.seed ?? 'resortworks';
    const at = d.bookings?.at ?? { day: d.calendar?.totalDays ?? 0, band: 1 };
    const dirty = Object.entries(d.bookings?.rooms ?? {})
      .filter(([, st]) => st === 'dirty' || st === 'cleaning')
      .map(([id]) => id);
    const rooms = { ...(d.bookings?.rooms ?? {}) };
    for (const id of dirty) rooms[id] = 'dirty'; // (nobody was cleaning before M4)
    const hk = freshHousekeeping({ minute: minuteOf(at.day, Math.max(0, Math.min(BANDS.length - 1, at.band))), dirty });
    if (at.band === 0) hk.linen.day = at.day - 1; // (Night: today's linen arrives with the Morning)
    return { ...record, data: { ...d, bookings: d.bookings ? { ...d.bookings, rooms } : d.bookings, staff: d.staff ?? makeTeam(seed, d.resort?.founder?.id ?? 'S01'), housekeeping: d.housekeeping ?? hk } };
  },
  // 4 → 5 (Milestone 5): no reviews yet, REP 0 (Rank E) and the star rating "New" — stays already over left no review.
  4: (record) => ({ ...record, data: { ...record.data, reviews: record.data.reviews ?? freshReviews() } }),
  // 5 → 6 (Milestone 6): 32,000 Credits from the save's day, no debt, Standard pricing (no money was kept before).
  5: (record) => ({ ...record, data: { ...record.data, finance: record.data.finance ?? freshFinance({ day: record.data.calendar?.totalDays ?? 0 }) } }),
  // 6 → 7 (Milestone 7): no complaints yet; the complaint clock starts at the save's last band edge (no trigger is rolled
  // for anything that happened before).
  6: (record) => {
    const d = record.data;
    const at = d.bookings?.at ?? { day: d.calendar?.totalDays ?? 0, band: 1 };
    return { ...record, data: { ...d, complaints: d.complaints ?? { ...freshComplaints(), at: minuteOf(at.day, Math.max(0, Math.min(BANDS.length - 1, at.band))) } } };
  },
  // 7 → 8 (Milestone 8): every facility and room starts at Condition 90, no jobs, nothing offline; the maintenance clock
  // starts at the save's last band edge.
  7: (record) => {
    const d = record.data;
    const at = d.bookings?.at ?? { day: d.calendar?.totalDays ?? 0, band: 1 };
    return { ...record, data: { ...d, maintenance: d.maintenance ?? freshMaintenance({ minute: minuteOf(at.day, Math.max(0, Math.min(BANDS.length - 1, at.band))) }) } };
  },
  // 8 → 9 (Milestone 9): every stay starts its noise from now (nothing heard before the update counts).
  8: (record) => {
    const d = record.data;
    if (!d.bookings?.bookings) return record;
    const bookings = d.bookings.bookings.map((b) => (b.noise ? b : { ...b, noise: { bands: 0, sum: 0, worst: 0, loss: 0, over: 0 } }));
    return { ...record, data: { ...d, bookings: { ...d.bookings, bookings } } };
  },
  // 9 → 10 (Milestone 10): Normal priority everywhere, every pattern on Auto Schedule, everyone rested, from the save's
  // last band edge; Auto Accept off (the booking state fills in its settings on load).
  9: (record) => {
    const d = record.data;
    const at = d.bookings?.at ?? { day: d.calendar?.totalDays ?? 0, band: 1 };
    return { ...record, data: { ...d, staffing: d.staffing ?? freshStaffing({ day: at.day, band: Math.max(0, Math.min(BANDS.length - 1, at.band)) }) } };
  },
  // 10 → 11 (Milestone 12): the shipped lot as the site (nothing was ever moved before), the Roadside Motel stage — a
  // resort that already passes the Holiday Lodge gate moves on at its next band edge.
  10: (record) => ({ ...record, data: { ...record.data, site: record.data.site ?? freshSite(), progress: record.data.progress ?? freshProgress() } }),
  // 11 → 12 (Milestone 13): nobody has trained yet; this week's applicants are drawn when the resort opens (from the run's
  // seed and the week). Everyone keeps their level, starting at 0 XP.
  11: (record) => {
    const d = record.data;
    return { ...record, data: { ...d, staffing: d.staffing ? { ...d.staffing, pool: d.staffing.pool ?? null, trained: d.staffing.trained ?? {} } : d.staffing } };
  },
  // 12 → 13 (Milestone 15): every room starts with no Loved points.
  12: (record) => {
    const d = record.data;
    if (!d.site?.items) return record;
    return { ...record, data: { ...d, site: { ...d.site, items: d.site.items.map((it) => (it.kind === 'room' ? { loved: 0, ...it } : it)) } } };
  },
  // 13 → 14 (Milestone 17): nothing researched yet. Auto Accept that was on stays on (grandfathered: it now needs R32).
  13: (record) => ({ ...record, data: { ...record.data, research: record.data.research ?? freshResearch() } }),
  // 14 → 15 (Milestone 14): an empty Staff Items store; everyone's likes are drawn when the resort opens (from their id).
  14: (record) => ({ ...record, data: { ...record.data, items: record.data.items ?? freshItems() } }),
  // 15 → 16 (Milestone 18): no package on sale, no places reserved (every booking already made is a plain room booking).
  15: (record) => ({ ...record, data: { ...record.data, packages: record.data.packages ?? freshPackages() } }),
  // 16 → 17 (Milestone 19): no enquiries, no events booked or held yet.
  16: (record) => ({ ...record, data: { ...record.data, events: record.data.events ?? freshEvents() } }),
  // 17 → 18 (Milestone 20): an empty Guestbook (stays before it left no entry; guests start coming back from new stays).
  17: (record) => ({ ...record, data: { ...record.data, guestbook: record.data.guestbook ?? freshGuestbook() } }),
  // 18 → 19 (Milestone 21): every theme at 0 until the first month end works it out from the play from then on; no Signature.
  18: (record) => ({ ...record, data: { ...record.data, themes: record.data.themes ?? freshThemes() } }),
  // 19 → 20 (Milestone 22): every supply group at Basic (what the costs always were); an empty Partner Board.
  19: (record) => ({ ...record, data: { ...record.data, supplies: record.data.supplies ?? freshSupplies(), partners: record.data.partners ?? freshPartners() } }),
  // 20 → 21 (Milestone 23): no awards yet, Prestige 0; the year's rival variance is rolled at the next month change.
  20: (record) => ({ ...record, data: { ...record.data, awards: record.data.awards ?? freshAwards() } }),
  // 21 → 22 (Milestone 24): the weather is rolled for the save's month at its next band edge (seeded: the same month
  // always gets the same weather).
  21: (record) => ({ ...record, data: { ...record.data, weather: record.data.weather ?? freshWeather() } }),
  // 22 → 23 (Milestone 25): no closed years yet (the profit history starts with the year running), no nights counted for
  // the suggested rates, no Rescue Investor strikes.
  22: (record) => {
    const d = record.data;
    if (!d.finance) return record;
    const day = d.calendar?.totalDays ?? 0;
    return { ...record, data: { ...d, finance: { years: [], year: { n: Math.floor(day / 336) + 1, lines: {} }, nights: [], strikes: 0, rescue: null, ...d.finance } } };
  },
  // 23 → 24 (Milestone 26): this run's achievement counters start now (the unlocks check what the resort already did at
  // the next tick: its stage, awards, research, Guestbook …).
  23: (record) => ({ ...record, data: { ...record.data, achv: record.data.achv ?? freshAchvRun() } }),
  // 24 → 25 (Milestone 27): no secrets found in this run yet; its counters start now (what the resort already has — its
  // awards, Prestige, facilities, Guestbook — is read at the next tick).
  24: (record) => ({ ...record, data: { ...record.data, secrets: record.data.secrets ?? null } }),
  // 25 → 26 (Milestone 28): no ending yet (an older resort past Year 20 gets it at the next night), no NG+ legacy.
  25: (record) => ({ ...record, data: { ...record.data, ending: record.data.ending ?? null, legacy: record.data.legacy ?? null, parent: record.data.parent ?? null } }),
  // 26 → 27 (Milestone 28b): no gods yet — their secrets' run half starts empty inside the secrets' save.
  26: (record) => (record.data.secrets ? { ...record, data: { ...record.data, secrets: { ...record.data.secrets, gods: record.data.secrets.gods ?? null } } } : record),
  // 27 → 28 (Milestone 33): a resort already under way gets the guide switched off (it can be replayed from Help).
  27: (record) => ({ ...record, data: { ...record.data, guide: record.data.guide ?? { state: { done: [], seen: [], events: [], off: true }, understood: false, finished: false, answers: [] } } }),
};

// (Milestone 32) The campaign's own check (core SaveSlot validate): a copy whose checksum is fine but whose data is not
// a RESORTWORKS campaign is skipped like a damaged one. → [problems] (empty: fine)
export function validateCampaign(data) {
  const out = [];
  if (!data || typeof data !== 'object') return ['not a campaign'];
  if (!data.resort?.name || !data.resort?.founder?.id) out.push('no resort identity');
  if (!data.date || !Number.isFinite(data.date.year)) out.push('no date');
  if (!data.seed) out.push('no seed');
  if (data.calendar && !Number.isFinite(data.calendar.totalDays)) out.push('a broken calendar');
  if (data.staff && !Array.isArray(data.staff)) out.push('a broken team');
  if (data.ngPlus != null && !(data.ngPlus >= 0 && data.ngPlus <= 3)) out.push('a broken NG+ level');
  return out;
}
