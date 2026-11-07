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
import { createWeather } from './weather.js';
import { createAchievements } from './achievements.js';
import { createSecrets } from './secrets.js';
import { createEnding } from './ending.js';
import { createGuide } from './guide.js';
import { teamBonus } from './staff.js';
import { SIGNATURE_LEGACY } from '../../data/ngplus.js';
import { themeById } from '../../data/themes.js';
import { GUEST_TYPES } from '../../data/bookings.js';

// account: the account store (achievements live there, across every slot); {} in tests.
export function attachLate(run, data = {}, { bus = null, account = {} } = {}) {
  // (Milestone 18) this resort's demand book (every source adds to it, held within ±20%)
  run.demand = createDemand();
  run.bookings.attachDemand(run.demand);
  // (Milestone 24) the month's weather (rolled at each month change; its demand goes through the same ±20% book)
  run.weather = createWeather({ saved: data.weather ?? null, bus, seed: data.seed ?? run.seed ?? 'resortworks', demand: run.demand });
  // (Milestone 18) packages: offers pick them, accepting reserves their places, each day gives the inclusions
  run.packages = createPackages({ demand: run.demand, saved: data.packages ?? null, bus, team: run.team, maintenance: run.maintenance, complaints: run.complaints });
  run.bookings.attachPackages(run.packages);
  run.bookings.attachProgress(run.progress); // who can book follows this resort's stage
  run.finance.attachPackages(run.packages);
  // (Milestone 19) events: enquiries, bookings with their venue places and room blocks, the live choice, the results
  run.events = createEvents({ saved: data.events ?? null, bus, seed: data.seed ?? run.seed ?? 'resortworks', team: run.team, finance: run.finance, reviews: run.reviews, maintenance: run.maintenance, packages: run.packages, bookings: run.bookings, items: run.items });
  run.events.attachWeather(run.weather);
  run.bookings.attachLate((day, band) => {
    run.weather.onEdge(day, band); // (Milestone 24) first: the month's weather
    run.packages.onEdge(day, band, run.bookings);
    run.events.onEdge(day, band);
    run.themes?.onEdge(day, band, run.bookings); // (Milestone 21)
    run.partners?.onEdge(day, band); // (Milestone 22)
    run.awards?.onEdge(day, band); // (Milestone 23)
    run.secrets?.onEdge(day, band); // (Milestone 27)
    run.ending?.onEdge(day, band); // (Milestone 28) the Year-20 ending, once
    run.guide?.update(); // (Milestone 33)
    run.achievements?.onEdge(day, band); // (Milestone 26) last: everything else has moved
  });
  run.staffing.setExtraLoad((day) => run.events.loadOn(day));
  // (Milestone 20) the Guestbook: every notable stay, memories, returning guests and Regulars
  run.guestbook = createGuestbook({ saved: data.guestbook ?? null, bus, seed: data.seed ?? run.seed ?? 'resortworks', items: run.items, team: run.team });
  run.bookings.attachRepeat((day, pricing) => run.guestbook.dueOffers(day, pricing));
  // (Milestone 21) themes from the last 84 days, the Signature, facility combos
  run.themes = createThemes({ demand: run.demand, saved: data.themes ?? null, bus, layout: run.layout, finance: run.finance, progress: run.progress });
  run.themes.setPrestige(() => run.reviews.headline?.(run.bookings.at.day)?.prestige ?? 0);
  run.reviews.attachExtraSat((b, raw) => run.guestbook.extraSat(b) + run.themes.extraSat(b, raw) + (run.secrets?.extraSat(b) ?? 0) + (run.legacySat?.(b) ?? 0)); // (M27: secrets; M28: the Signature legacy)
  run.events.setScoreMult((evt) => run.themes.eventMult(evt));
  run.finance.attachSpendMult((line) => run.themes.spendMult(line) * (['dining', 'cafe', 'packages', 'evening', 'retail'].includes(line) ? 1 + teamBonus(run.team, 'fortune') : 1)); // (M28b: Kaching)
  bus?.on('review:new', ({ review }) => run.themes.onReview(review));
  // (Milestone 22) suppliers (Basic / Quality / Luxury) and the Partner Board (core/SponsorSystem per slot)
  run.supplies = createSupplies({ saved: data.supplies ?? null, bus });
  run.partners = createPartners({ demand: run.demand, saved: data.partners ?? null, bus, finance: run.finance, items: run.items, reviews: run.reviews, bookings: run.bookings, seed: data.seed ?? run.seed ?? 'resortworks' });
  run.supplies.setFoodCut(() => run.partners.total('foodCost'));
  run.events.setDemand(() => run.partners.total('enquiries') + teamBonus(run.team, 'enquiries')); // (M28b: Jinx +25%)
  run.partners.setRewardMult(() => 1 + teamBonus(run.team, 'partnerMoney')); // (M28b: Kaching +20%)
  bus?.on('review:new', ({ review }) => run.partners.signal('stay', { type: review.type, sat: review.sat, pkg: review.pkg }));
  bus?.on('events:result', ({ event }) => run.partners.signal('event', { score: event.score }));
  // (Milestone 23) rivals, the award calendar, Prestige and the Expo
  run.awards = createAwards({ saved: data.awards ?? null, bus, seed: data.seed ?? run.seed ?? 'resortworks', reviews: run.reviews, finance: run.finance, layout: run.layout, staffing: run.staffing, maintenance: run.maintenance, events: run.events, guestbook: run.guestbook, themes: run.themes, items: run.items, partners: run.partners, progress: run.progress, bookings: run.bookings, demand: run.demand });
  run.progress.attachAwards(run.awards);
  // (Milestone 25) wages and upkeep scale with the stage; the Rescue Investor costs Prestige 5
  run.finance.attachStage(() => run.progress.stage);
  run.finance.onRescue(() => run.awards.addPrestige?.(-5, 'Rescue Investor'));
  // (Milestone 26) the 40 visible achievements (account-wide unlocks; this run's counters in the save)
  run.achievements = createAchievements({ account, saved: data.achv ?? null, bus, run: { ...run, get seed() { return data.seed ?? run.seed; } } });
  // (Milestone 27) the 50 secrets: found ones open staff, guests, F34 / F35, AWR11 / AWR12, P09 / P10, the Prestige Grounds
  run.secrets = createSecrets({ account, saved: data.secrets ?? null, bus, run: { ...run, get seed() { return data.seed ?? run.seed; } }, ngPlus: () => data.ngPlus ?? 0 });
  run.achievements.attach('secrets', run.secrets); // (M28b: Pantheon reads the gods hired)
  run.staffing.setInvites(() => run.secrets.invites, (id) => run.secrets.barred(id));
  run.site?.setSecretOpen?.((def) => run.secrets.buildOpen(def));
  run.progress.setSecretOpen((id) => run.secrets.stageOpen(id));
  run.awards.setSecretOpen((id) => run.secrets.awardOpen(id));
  run.partners.setSecretOpen((id) => run.secrets.partnerOpen(id));
  run.maintenance.setGuard?.((id, minute, why) => run.secrets.breakdownGuard(id, minute, why));
  run.complaints.setGuard?.((b, kind, minute) => run.secrets.complaintGuard(b, kind, minute)); // (M28b: Jinx)
  run.demand.set('Luck', (typeId) => (typeId ? run.secrets.luckDemand(typeId) : null)); // (M28b: Jinx's lucky arrivals)
  run.events.setScoreAdd((evt) => run.secrets.eventBonus(evt));
  run.demand.set('Secrets', (typeId) => (typeId ? null : run.secrets.demand()));
  // (Milestone 28) the Year-20 ending (graded once, then postgame), the NG+ level (stronger rivals) and the Signature legacy
  run.ngPlus = data.ngPlus ?? 0;
  run.awards.setNgPlus(() => data.ngPlus ?? 0);
  run.ending = createEnding({ saved: data.ending ?? null, bus, run: { ...run, get resortName() { return data.resort?.name ?? null; } }, account, ngPlus: () => data.ngPlus ?? 0 });
  const legacyTheme = data.legacy?.theme ? themeById(data.legacy.theme) : null;
  const legacyFor = (typeId) => !!legacyTheme && legacyTheme.tags.some((t) => GUEST_TYPES[typeId]?.tags?.includes(t));
  if (legacyTheme) run.demand.set('Legacy', (typeId) => (typeId && legacyFor(typeId) ? { type: SIGNATURE_LEGACY.demand, words: `Legacy: ${legacyTheme.name}` } : null));
  run.legacySat = (b) => (legacyFor(b.type) ? SIGNATURE_LEGACY.sat : 0);
  // (Milestone 33) the first-time guide (Dame Opal): on for a new resort, off for NG+ or a player who has done it
  run.guide = createGuide({ saved: data.guide ?? null, bus, founder: data.resort?.founder?.id ?? 'S01', account, ngPlus: data.ngPlus ?? 0 });
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
  data.weather = run.weather?.serialize() ?? data.weather; // (Milestone 24)
  data.achv = run.achievements?.serialize() ?? data.achv; // (Milestone 26) this run's achievement counters
  data.secrets = run.secrets?.serialize() ?? data.secrets; // (Milestone 27) the secrets' run half
  data.guide = run.guide?.serialize() ?? data.guide ?? null; // (Milestone 33)
  data.ending = run.ending?.serialize() ?? data.ending ?? null; // (Milestone 28) the Year-20 ending, once reached
  if (data.ending) data.grade = data.ending.grade; // (the slot card's grade)
  return data;
}
