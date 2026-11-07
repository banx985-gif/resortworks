// Where and how RESORTWORKS saves (Milestone 0, bible §5 / §33). Its own database, so it never meets another series
// game's saves. Four campaign slots on core/CampaignSlots (keys campaign_1 … campaign_4, each its own rolling
// SaveSlot, plus a small summary record per slot that the slot screen reads without loading the campaign). The
// account store (achievements, Resort Tokens, NG+ meta … later) is its own key, never touched by a slot overwrite/delete.
export const SAVE = {
  dbName: 'resortworks',
  localPrefix: 'resortworks:',
  count: 4,
  prefix: 'campaign_',
  accountKey: 'resortworks:account',
  version: 27, // 2 = Milestone 2 (the calendar: day, progress in the day, band, speed); 3 = Milestone 3 (bookings, stays, room states);
  // 4 = Milestone 4 (the opening team; housekeeping: cleaning jobs, queue, linen, late rooms); 5 = Milestone 5 (reviews,
  // the rolling scores, REP / Rank and the star rating); 6 = Milestone 6 (Credits, the ledger, Emergency Credit, pricing bands); 7 = Milestone 7 (complaints, recovery actions and results);
  // 8 = Milestone 8 (Condition of every facility and room, maintenance jobs, offline state); 9 = Milestone 9 (each stay's
  // noise: bands heard, the loudest, the Comfort lost); 10 = Milestone 10 (staffing: priorities, pinned
  // patterns, fatigue, absences, the Wellbeing window; Auto Accept settings in the bookings); 11 = Milestone 12 (the site: what
  // stands where, construction, land; the campaign stage); 12 = Milestone 13 (the applicant pool, training weeks; XP and
  // specialisations ride on each saved staff member); 13 = Milestone 15 (each room's Loved points on the site); 14 =
  // Milestone 17 (research: done, the project running, the queue); 15 = Milestone 14 (Staff Items: the store, likes, the
  // year's item points, the Inbox; item stat bonuses ride on each staff member); 16 = Milestone 18 (packages: which are on
  // sale, the places reserved by day, their counts; a package booking keeps its package, base rate and places); 17 =
  // Milestone 19 (events: enquiries, booked and running events with their choice, results; room blocks ride on bookings);
  // 18 = Milestone 20 (the Guestbook: notable guests, their stays and memories, who comes back when); 19 = Milestone 21
  // (themes: the last 84 days' stays, days and events, each theme's progress, the Signature); 20 = Milestone 22 (the
  // supply tiers; the Partner Board: each slot's contract, offers, cooldowns, history); 21 = Milestone 23 (awards: the
  // year's rival variance, results, wins, Prestige and its sources, the Expo, the last 84 days' stays); 22 = Milestone 24
  // (the month's weather and its history); 23 = Milestone 25 (finance: the years' profit history, the last 28 nights by
  // room type, the Rescue Investor's strikes and year); 24 = Milestone 26 (this run's achievement counters; the unlocks
  // themselves are in the account store); 25 = Milestone 27 (the secrets' run half: found this run, clue stages, rewards
  // fired, the applicants' windows, this run's counters; what was found in any run is in the account store); 26 =
  // Milestone 28 (the Year-20 ending and its grade; an NG+ run's Legacy Staff / Signature legacy and its parent's name);
  // 27 = Milestone 28b (the Works Gods' secrets' run half and their counters, inside the secrets' save)
};

// (Milestone 32, bible §33) Autosave: every 7 game days (each 7th day's Morning) and at the critical boundaries —
// construction, a staff change, a major event, an award, NG+ (the parent is saved before the new run is made) and a
// purchase — plus the moments the earlier milestones added. Several in the same moment become one write (core Autosave);
// the rolling 30-second save still runs while the clock does. Each slot keeps its last ROLLING copies (checksummed): a
// write cut off half way is never used, and "go back" makes the copy before current again.
export const AUTOSAVE = {
  everyDays: 7,
  rolling: 3,
  triggers: [
    'clock:month', 'booking:action', 'review:month', 'finance:band', 'complaint:result', 'mt:breakdown', 'mt:service', 'staff:priority',
    'site:change', 'site:built', 'site:upgraded', // construction
    'staff:hired', 'staff:fired', // a staff change
    'events:result', 'events:booked', // a major event
    'awards:change', 'awards:result', // an award
    'ending:change', // the ending (NG+ saves the parent itself, first)
    'money:change', // a purchase or a token spend
    'progress:stage', 'research:change', 'items:change', 'packages:change', 'packages:sold', 'events:change', 'guestbook:change', 'themes:change', 'supplies:change', 'partners:change', 'weather:change', 'achievements:change', 'secrets:change', 'secrets:arrival', 'secrets:poached',
  ],
};
