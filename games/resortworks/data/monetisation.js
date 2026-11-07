// Monetisation (Milestone 29, bible §32; series rule 9 in SERIES_KAIROSOFT_LESSONS.md, Cowork's call in BIG_RUN_4):
// Resort Tokens (premium, never gems), Remove Ads (permanent), safe rewarded ads, every purchase counted once.
// Series rule 9 wins over the bible's "bounded construction / research acceleration": NO paid speed-ups and no paid
// timers. Tokens buy only ordinary refreshes and cosmetics. NO ads of any kind before the account's first award.
// Everything can be switched off (SERVICES.enabled = false, or ?services=0): the game is complete without it.
export const SERVICES = { enabled: true };

// Store products (prices come from the store; no real store is wired yet — the store says it's unavailable, and
// ?debug=1 uses core/FakeStoreProvider). kind: core CommerceService's.
export const PRODUCTS = {
  removeAds: { kind: 'nonConsumable', entitlement: 'removeAds', name: 'Remove Ads', line: 'No more break-time ads, for good. Rewarded ads stay optional.' },
  tokens50: { kind: 'consumable', tokens: 50, name: '50 Resort Tokens', line: 'For refreshes and cosmetics.' },
  tokens150: { kind: 'consumable', tokens: 150, name: '150 Resort Tokens', line: 'For refreshes and cosmetics.' },
};
export const FAKE_PRICES = { removeAds: '£2.99', tokens50: '£0.99', tokens150: '£2.49' };

// What Resort Tokens can buy — the only things (a whitelist). Each is an ordinary refresh or a cosmetic.
export const TOKEN_SINKS = {
  applicants: { cost: 10, name: 'New applicants', line: 'A fresh set of this week’s applicants (Standard, Rare or Elite only).' },
  offers: { cost: 5, name: 'More booking offers', line: 'A few more booking offers this morning.' },
  partner: { cost: 10, name: 'A Partner offer', line: 'Priya brings an offer now from a partner who could offer anyway.' },
  repaint: { cost: 20, name: 'Repaint the resort', line: 'A new colour scheme (cosmetic only).' },
};
// Things the bible says tokens can NEVER buy (§32 + the cards): each is refused by name (tests check every one).
export const NEVER_FOR_TOKENS = ['legendaryStaff', 'secretStaff', 'secretGuest', 'secretAward', 'prestigeTokens', 'reviewScore', 'secret', 'staffItem', 'god', 'aaron', 'speedUp', 'constructionTimer', 'researchTimer'];
export const NEVER_WORDS = 'Resort Tokens can’t buy that: it is earned in play.';

// Rewarded ads (safe: optional, small, capped; only after the first award): +5 Resort Tokens (3 a day), or one free
// applicant refresh a week.
export const REWARDED = [
  { id: 'tokenGift', label: 'Watch an ad: +5 Resort Tokens', reward: { tokens: 5 }, limit: { per: 'realHours', count: 3, hours: 24 } },
  { id: 'applicantAd', label: 'Watch an ad: new applicants', reward: { sink: 'applicants' }, limit: { per: 'week', count: 1 } },
];
// Break-time ads (interstitials): only at a month's close, never before the first award, never with a decision waiting,
// at most one every 30 real minutes and 2 an hour; Remove Ads stops them for good.
export const INTERSTITIAL_CAPS = { firstInstallQuietMin: 30, minGapMin: 30, maxPerHour: 2, afterResumeQuietSec: 120, afterPurchaseQuietMin: 30, breakPoints: ['monthClose'] };
export const STORE_MESSAGES = {
  unavailable: 'The store isn’t available right now.',
  offline: 'You’re offline. Nothing was charged.',
  cancelled: 'Cancelled. Nothing was charged.',
  failed: 'That didn’t go through. Nothing was charged.',
  purchased: 'Thank you!',
  duplicate: 'Already added.',
  busy: 'One moment…',
};
