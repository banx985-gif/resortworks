// The resort calendar (Milestone 2, bible §3) on core/Clock: 5 s a day at 1× (2.5 s at 2×, 1.25 s at 4×), 28-day months,
// 12-month years, Pause. Each day is split into the five bands of data/calendar.js; time moves band edge by band edge, so
// the same start gives the same dates and band changes at every speed and frame rate (a long frame just crosses several
// edges, in order). On the bus: core Clock's 'clock:day' / 'clock:month' / 'clock:year' / 'clock:speed', and
// 'band:change' { band, from, totalDays } each time a band begins.
// Speed unlocks (bible §3) through Clock.speedAllowed: 1× always; 2× from Year 2 or the first award; 4× from Year 4 or
// Rank C (award and rank read from src/systems/progressHooks.js — "not yet" until their milestones).
//   createCalendar({ bus, saved, run, hooks }) → calendar
//     saved: a serialize() from the campaign save (or null for a new resort)   run() → the campaign save (for the hooks)
//   calendar.update(dt) · setSpeed(s) → { ok, why } · togglePause() · skipDays(n) (debug) · serialize()
//   calendar.band (data entry) · bandFrac (0–1 through the band) · clock (core Clock) · lockedLine(s)
import { Clock } from '../../../../core/Clock.js';
import { CALENDAR, BANDS, SPEED_UNLOCK } from '../../data/calendar.js';
import { PROGRESS_HOOKS } from './progressHooks.js';

// Where each band starts and ends in the day (0–1); the last ends at exactly 1.
const EDGES = (() => {
  let at = 0;
  return BANDS.map((b, i) => {
    const e = { start: at, end: i === BANDS.length - 1 ? 1 : at + b.share };
    at = e.end;
    return e;
  });
})();
export const bandIndexAt = (progress) => Math.max(0, EDGES.findIndex((e) => progress >= e.start && progress < e.end));

// Game minutes (Milestone 4: housekeeping runs in game minutes, 1440 a day). A band edge's minute is rounded so the same
// edge always gives exactly the same number, whatever frame crossed it.
export const MINUTES_PER_DAY = 1440;
const r6 = (x) => Math.round(x * 1e6) / 1e6;
export const bandStartMinute = (band) => r6(EDGES[band].start * MINUTES_PER_DAY);
export const bandEndMinute = (band) => r6(EDGES[band].end * MINUTES_PER_DAY);
export const minuteOf = (day, band) => day * MINUTES_PER_DAY + bandStartMinute(band);
// The day and band a game minute falls in.
export function bandAtMinute(minute) {
  const day = Math.floor(minute / MINUTES_PER_DAY);
  const m = minute - day * MINUTES_PER_DAY;
  let band = BANDS.length - 1;
  for (let i = 0; i < BANDS.length; i++)
    if (m < bandEndMinute(i)) {
      band = i;
      break;
    }
  return { day, band };
}

export function createCalendar({ bus = null, saved = null, run = () => null, hooks = PROGRESS_HOOKS } = {}) {
  const clock = new Clock({ bus, daysPerMonth: CALENDAR.daysPerMonth, monthsPerYear: CALENDAR.monthsPerYear, secondsPerDay: CALENDAR.secondsPerDay, speeds: CALENDAR.speeds });
  const speedOpen = (s) => {
    if (s === 0 || s === 1) return true;
    const rule = SPEED_UNLOCK[s];
    if (!rule) return false;
    return clock.year >= rule.year || (rule.award && hooks.firstAwardWon(run())) || (!!rule.rank && hooks.rankAtLeast(run(), rule.rank));
  };
  clock.speedAllowed = speedOpen;
  if (saved) clock.load(saved);
  else clock.dayProgress = CALENDAR.startProgress;
  let band = bandIndexAt(clock.dayProgress);

  function enterBand(i) {
    const from = BANDS[band].id;
    band = i;
    bus?.emit('band:change', { band: BANDS[band].id, from, totalDays: clock.totalDays });
  }

  const cal = {
    clock,
    get band() {
      return BANDS[band];
    },
    get bandIndex() {
      return band;
    },
    // How far through the current band (0–1).
    get bandFrac() {
      const e = EDGES[band];
      return Math.min(1, Math.max(0, (clock.dayProgress - e.start) / (e.end - e.start)));
    },
    // The current band's length in game seconds (its share of the 5 s day).
    get bandSeconds() {
      const e = EDGES[band];
      return (e.end - e.start) * clock.secondsPerDay;
    },
    get speed() {
      return clock.speed;
    },
    get paused() {
      return clock.paused;
    },
    get today() {
      return clock.totalDays;
    },
    // (Milestone 4) now in game minutes since the resort opened.
    get minute() {
      return (clock.totalDays + clock.dayProgress) * MINUTES_PER_DAY;
    },
    speedOpen,
    lockedLine: (s) => SPEED_UNLOCK[s]?.line ?? '',
    // Real seconds at 1× → game time, band edge by band edge.
    update(dt) {
      if (clock.paused || !(dt > 0)) return;
      let left = (dt * clock.speed) / clock.secondsPerDay;
      for (let guard = 0; left > 0 && guard < 10000; guard++) {
        const e = EDGES[band];
        const room = e.end - clock.dayProgress;
        if (left < room) {
          clock.dayProgress += left;
          return;
        }
        left -= room;
        if (band === BANDS.length - 1) {
          clock.dayProgress = 0;
          clock.advanceDay();
          enterBand(0);
        } else {
          clock.dayProgress = EDGES[band + 1].start;
          enterBand(band + 1);
        }
      }
    },
    setSpeed(s) {
      if (s !== 0 && !clock.canUseSpeed(s)) return { ok: false, why: cal.lockedLine(s) };
      clock.setSpeed(s);
      return { ok: true };
    },
    togglePause() {
      clock.togglePause();
    },
    // Debug: jump whole days at the same time of day (the unlocks follow the year).
    skipDays(n) {
      for (let i = 0; i < n; i++) clock.advanceDay();
    },
    serialize() {
      return { ...clock.serialize(), band: BANDS[band].id };
    },
    dateText() {
      return `Y${clock.year} · Month ${clock.month} · Day ${clock.day}`;
    },
  };
  return cal;
}
