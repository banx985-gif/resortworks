// The systems from Milestone 18 on, made and wired in one place for the screen (src/main.js openRun) and the headless
// tests (tests/resortworks/harness.mjs), so both run them exactly the same way.
//   attachLate(run, data, { bus, now }) — run has the M3–M17 systems (bookings, team, finance, complaints, maintenance,
//     reviews, site, progress, research, items, staffing, layout, calendar); data = the campaign save (or {} in tests).
//     Adds run.packages (M18) …
//   saveLate(run, data) — writes each one's serialize() into the save
import { createPackages } from './packages.js';

export function attachLate(run, data = {}, { bus = null } = {}) {
  // (Milestone 18) packages: offers pick them, accepting reserves their places, each day gives the inclusions
  run.packages = createPackages({ saved: data.packages ?? null, bus, team: run.team, maintenance: run.maintenance, complaints: run.complaints });
  run.bookings.attachPackages(run.packages);
  run.bookings.attachProgress(run.progress); // who can book follows this resort's stage
  run.finance.attachPackages(run.packages);
  return run;
}

export function saveLate(run, data) {
  data.packages = run.packages?.serialize() ?? data.packages; // (Milestone 18)
  return data;
}
