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
    stage: data.stage ?? null,
    stars: data.reviews?.stars ?? data.stars ?? 0, // (Milestone 5) 0 = New
    cash: data.finance?.econ?.balances?.credits ?? null, // (Milestone 6)
    prestige: data.prestige ?? 0,
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
};
