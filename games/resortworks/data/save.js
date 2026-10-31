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
  version: 6, // 2 = Milestone 2 (the calendar: day, progress in the day, band, speed); 3 = Milestone 3 (bookings, stays, room states);
  // 4 = Milestone 4 (the opening team; housekeeping: cleaning jobs, queue, linen, late rooms); 5 = Milestone 5 (reviews,
  // the rolling scores, REP / Rank and the star rating); 6 = Milestone 6 (Credits, the ledger, Emergency Credit, pricing bands)
};
