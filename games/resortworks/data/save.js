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
  version: 20, // 2 = Milestone 2 (the calendar: day, progress in the day, band, speed); 3 = Milestone 3 (bookings, stays, room states);
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
  // supply tiers; the Partner Board: each slot's contract, offers, cooldowns, history)
};
