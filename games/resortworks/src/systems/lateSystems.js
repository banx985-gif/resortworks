// The systems from Milestone 18 on, made and wired in one place for the screen (src/main.js openRun) and the headless
// tests (tests/resortworks/harness.mjs), so both run them exactly the same way.
//   attachLate(run, data, { bus, now }) — run has the M3–M17 systems (bookings, team, finance, complaints, maintenance,
//     reviews, site, progress, research, items, staffing, layout, calendar); data = the campaign save (or {} in tests).
//     Adds run.packages (M18) …
//   saveLate(run, data) — writes each one's serialize() into the save
import { createPackages } from './packages.js';
import { createDemand } from './guests.js';
import { createEvents } from './events.js';
import { createGuestbook } from './guestbook.js';
import { createThemes } from './themes.js';
import { createSupplies } from './supplies.js';
import { createPartners } from './partners.js';
import { createAwards } from './awards.js';

export function attachLate(run, data = {}, { bus = null } = {}) {
  // (Milestone 18) this resort's demand book (every source adds to it, held within ±20%)
  run.demand = createDemand();
  run.bookings.attachDemand(run.demand);
  // (Milestone 18) packages: offers pick them, accepting reserves their places, each day gives the inclusions
  run.packages = createPackages({ demand: run.demand, saved: data.packages ?? null, bus, team: run.team, maintenance: run.maintenance, complaints: run.complaints });
  run.bookings.attachPackages(run.packages);
  run.bookings.attachProgress(run.progress); // who can book follows this resort's stage
  run.finance.attachPackages(run.packages);
  // (Milestone 19) events: enquiries, bookings with their venue places and room blocks, the live choice, the results
  run.events = createEvents({ saved: data.events ?? null, bus, seed: data.seed ?? run.seed ?? 'resortworks', team: run.team, finance: run.finance, reviews: run.reviews, maintenance: run.maintenance, packages: run.packages, bookings: run.bookings, items: run.items });
  run.bookings.attachLate((day, band) => {
    run.packages.onEdge(day, band, run.bookings);
    run.events.onEdge(day, band);
    run.themes?.onEdge(day, band, run.bookings); // (Milestone 21)
    run.partners?.onEdge(day, band); // (Milestone 22)
    run.awards?.onEdge(day, band); // (Milestone 23)
  });
  run.staffing.setExtraLoad((day) => run.events.loadOn(day));
  // (Milestone 20) the Guestbook: every notable stay, memories, returning guests and Regulars
  run.guestbook = createGuestbook({ saved: data.guestbook ?? null, bus, seed: data.seed ?? run.seed ?? 'resortworks', items: run.items, team: run.team });
  run.bookings.attachRepeat((day, pricing) => run.guestbook.dueOffers(day, pricing));
  // (Milestone 21) themes from the last 84 days, the Signature, facility combos
  run.themes = createThemes({ demand: run.demand, saved: data.themes ?? null, bus, layout: run.layout, finance: run.finance, progress: run.progress });
  run.themes.setPrestige(() => run.reviews.headline?.(run.bookings.at.day)?.prestige ?? 0);
  run.reviews.attachExtraSat((b, raw) => run.guestbook.extraSat(b) + run.themes.extraSat(b, raw));
  run.events.setScoreMult((evt) => run.themes.eventMult(evt));
  run.finance.attachSpendMult((line) => run.themes.spendMult(line));
  bus?.on('review:new', ({ review }) => run.themes.onReview(review));
  // (Milestone 22) suppliers (Basic / Quality / Luxury) and the Partner Board (core/SponsorSystem per slot)
  run.supplies = createSupplies({ saved: data.supplies ?? null, bus });
  run.partners = createPartners({ demand: run.demand, saved: data.partners ?? null, bus, finance: run.finance, items: run.items, reviews: run.reviews, bookings: run.bookings, seed: data.seed ?? run.seed ?? 'resortworks' });
  run.supplies.setFoodCut(() => run.partners.total('foodCost'));
  run.events.setDemand(() => run.partners.total('enquiries'));
  bus?.on('review:new', ({ review }) => run.partners.signal('stay', { type: review.type, sat: review.sat, pkg: review.pkg }));
  bus?.on('events:result', ({ event }) => run.partners.signal('event', { score: event.score }));
  // (Milestone 23) rivals, the award calendar, Prestige and the Expo
  run.awards = createAwards({ saved: data.awards ?? null, bus, seed: data.seed ?? run.seed ?? 'resortworks', reviews: run.reviews, finance: run.finance, layout: run.layout, staffing: run.staffing, maintenance: run.maintenance, events: run.events, guestbook: run.guestbook, themes: run.themes, items: run.items, partners: run.partners, progress: run.progress, bookings: run.bookings, demand: run.demand });
  run.progress.attachAwards(run.awards);
  run.reviews.attachPrestige(() => run.awards.prestige);
  run.themes.setPrestige(() => run.awards.prestige);
  bus?.on('review:new', ({ review }) => run.awards.onReview(review));
  bus?.on('guestbook:memory', ({ guest, memory }) => run.awards.onMemory(guest, memory));
  bus?.on('events:result', ({ event }) => run.themes.onEvent(event));
  bus?.on('review:new', ({ review }) => run.guestbook.onReview(review));
  bus?.on('events:result', ({ event }) => run.guestbook.onEvent(event));
  bus?.on('booking:checkin', ({ bookings }) => bookings.forEach((b) => b.repeat && run.guestbook.onReturnStay()));
  return run;
}

export function saveLate(run, data) {
  data.packages = run.packages?.serialize() ?? data.packages; // (Milestone 18)
  data.events = run.events?.serialize() ?? data.events; // (Milestone 19)
  data.guestbook = run.guestbook?.serialize() ?? data.guestbook; // (Milestone 20)
  data.themes = run.themes?.serialize() ?? data.themes; // (Milestone 21)
  data.supplies = run.supplies?.serialize() ?? data.supplies; // (Milestone 22)
  data.partners = run.partners?.serialize() ?? data.partners;
  data.awards = run.awards?.serialize() ?? data.awards; // (Milestone 23)
  return data;
}
