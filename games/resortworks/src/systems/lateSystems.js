// The systems from Milestone 18 on, made and wired in one place for the screen (src/main.js openRun) and the headless
// tests (tests/resortworks/harness.mjs), so both run them exactly the same way.
//   attachLate(run, data, { bus, now }) — run has the M3–M17 systems (bookings, team, finance, complaints, maintenance,
//     reviews, site, progress, research, items, staffing, layout, calendar); data = the campaign save (or {} in tests).
//     Adds run.packages (M18) …
//   saveLate(run, data) — writes each one's serialize() into the save
import { createPackages } from './packages.js';
import { createEvents } from './events.js';
import { createGuestbook } from './guestbook.js';

export function attachLate(run, data = {}, { bus = null } = {}) {
  // (Milestone 18) packages: offers pick them, accepting reserves their places, each day gives the inclusions
  run.packages = createPackages({ saved: data.packages ?? null, bus, team: run.team, maintenance: run.maintenance, complaints: run.complaints });
  run.bookings.attachPackages(run.packages);
  run.bookings.attachProgress(run.progress); // who can book follows this resort's stage
  run.finance.attachPackages(run.packages);
  // (Milestone 19) events: enquiries, bookings with their venue places and room blocks, the live choice, the results
  run.events = createEvents({ saved: data.events ?? null, bus, seed: data.seed ?? run.seed ?? 'resortworks', team: run.team, finance: run.finance, reviews: run.reviews, maintenance: run.maintenance, packages: run.packages, bookings: run.bookings, items: run.items });
  run.bookings.attachLate((day, band) => {
    run.packages.onEdge(day, band, run.bookings);
    run.events.onEdge(day, band);
  });
  run.staffing.setExtraLoad((day) => run.events.loadOn(day));
  // (Milestone 20) the Guestbook: every notable stay, memories, returning guests and Regulars
  run.guestbook = createGuestbook({ saved: data.guestbook ?? null, bus, seed: data.seed ?? run.seed ?? 'resortworks', items: run.items, team: run.team });
  run.bookings.attachRepeat((day, pricing) => run.guestbook.dueOffers(day, pricing));
  run.reviews.attachExtraSat((b) => run.guestbook.extraSat(b));
  bus?.on('review:new', ({ review }) => run.guestbook.onReview(review));
  bus?.on('events:result', ({ event }) => run.guestbook.onEvent(event));
  bus?.on('booking:checkin', ({ bookings }) => bookings.forEach((b) => b.repeat && run.guestbook.onReturnStay()));
  return run;
}

export function saveLate(run, data) {
  data.packages = run.packages?.serialize() ?? data.packages; // (Milestone 18)
  data.events = run.events?.serialize() ?? data.events; // (Milestone 19)
  data.guestbook = run.guestbook?.serialize() ?? data.guestbook; // (Milestone 20)
  return data;
}
