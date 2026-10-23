// What the player owns or is subscribed to (bible §32.2, §32.4–32.6, §37.5): a permanent "no automatic ads" purchase
// and a subscription with convenience extras. Cached in the account save, rechecked with the store when it can be
// reached. Game-neutral: the game names its own entitlements' products; this only keeps the state and the rules.
//   new EntitlementService({ graceHours = 72, maxProcessed = 500, now = Date.now, bus })
//   removeAds                     owned (permanent; cached until the store says otherwise)
//   vipActive(t)                  the subscription's extras are on: validated active, and within the offline grace
//   adFree(t)                     no automatic (interstitial) ads: Remove Ads, or the subscription while active
//   graceLeftMs(t)                how much of the offline grace is left (0 = the extras are off until the next check)
//   validateVip({ active, expiresAt }, t)   the store just confirmed the subscription (or that it has ended)
//   applyStatus(status, t)        a store check: { removeAds, vip: { active, expiresAt } }
//   hasProcessed(id) / markProcessed(id)    purchase transaction ids already granted (a bounded history, §32.6)
//   claimDayBlock(dayKey, t) / claimDay(dayKey)  a once-a-day claim while the subscription is active
//   serialize() / load(s)         { removeAds, vipActive, vipExpiresAt, vipLastValidatedAt, vipGraceUntil, lastClaimDay }
//   serializeProcessed() / loadProcessed(list)
// Emits 'entitlements:change' ({ removeAds, vip }) whenever something changes.
const HOUR = 3600 * 1000;

export class EntitlementService {
  constructor({ graceHours = 72, maxProcessed = 500, now = () => Date.now(), bus = null } = {}) {
    this.graceMs = graceHours * HOUR;
    this.maxProcessed = maxProcessed;
    this.now = now;
    this.bus = bus;
    this.reset();
  }

  reset() {
    this.removeAds = false;
    this.vip = { active: false, expiresAt: null, lastValidatedAt: null, graceUntil: null };
    this.lastClaimDay = null;
    this.processed = [];
    this._processedSet = new Set();
  }

  // --- the rules ---------------------------------------------------------------------------------------------------
  vipActive(t = this.now()) {
    return !!this.vip.active && this.vip.graceUntil != null && t <= this.vip.graceUntil;
  }

  adFree(t = this.now()) {
    return this.removeAds || this.vipActive(t);
  }

  graceLeftMs(t = this.now()) {
    if (!this.vip.active || this.vip.graceUntil == null) return 0;
    return Math.max(0, this.vip.graceUntil - t);
  }

  // Was the subscription ever validated as active (so a "grace ran out" message makes sense)?
  get vipKnown() {
    return !!this.vip.active;
  }

  // --- changes ------------------------------------------------------------------------------------------------------
  setRemoveAds(on) {
    if (this.removeAds === !!on) return false;
    this.removeAds = !!on;
    this._changed();
    return true;
  }

  // The store confirmed the subscription's state just now. Active: the extras run for the grace time from now
  // (renewed on every later check). Ended: the extras stop.
  validateVip({ active, expiresAt = null } = {}, t = this.now()) {
    const was = this.vipActive(t);
    this.vip.active = !!active;
    this.vip.expiresAt = expiresAt ?? null;
    this.vip.lastValidatedAt = t;
    this.vip.graceUntil = active ? t + this.graceMs : null;
    if (was !== this.vipActive(t) || active) this._changed();
  }

  // A full store check (online): permanent purchases as the store has them, the subscription as it is now.
  applyStatus(status, t = this.now()) {
    if (!status) return;
    if (typeof status.removeAds === 'boolean') this.setRemoveAds(status.removeAds);
    if (status.vip) this.validateVip(status.vip, t);
  }

  // Debug only: pretend the last check was long ago, so the offline grace has run out.
  expireGrace(t = this.now()) {
    if (!this.vip.active) return false;
    this.vip.lastValidatedAt = t - this.graceMs - HOUR;
    this.vip.graceUntil = t - HOUR;
    this._changed();
    return true;
  }

  // --- purchase idempotency (§32.6) -------------------------------------------------------------------------------
  hasProcessed(id) {
    return this._processedSet.has(String(id));
  }

  markProcessed(id) {
    const k = String(id);
    if (this._processedSet.has(k)) return false;
    this.processed.push(k);
    this._processedSet.add(k);
    while (this.processed.length > this.maxProcessed) this._processedSet.delete(this.processed.shift());
    return true;
  }

  // --- the once-a-day claim ---------------------------------------------------------------------------------------
  claimDayBlock(dayKey, t = this.now()) {
    if (!this.vipActive(t)) return 'not active';
    if (this.lastClaimDay === dayKey) return 'already claimed today';
    return null;
  }

  claimDay(dayKey, t = this.now()) {
    if (this.claimDayBlock(dayKey, t)) return false;
    this.lastClaimDay = dayKey;
    return true;
  }

  // --- save -----------------------------------------------------------------------------------------------------------
  serialize() {
    return {
      removeAds: this.removeAds,
      vipActive: this.vip.active,
      vipExpiresAt: this.vip.expiresAt,
      vipLastValidatedAt: this.vip.lastValidatedAt,
      vipGraceUntil: this.vip.graceUntil,
      lastClaimDay: this.lastClaimDay,
    };
  }

  load(s) {
    this.removeAds = !!s?.removeAds;
    this.vip = {
      active: !!s?.vipActive,
      expiresAt: s?.vipExpiresAt ?? null,
      lastValidatedAt: s?.vipLastValidatedAt ?? null,
      graceUntil: s?.vipGraceUntil ?? null,
    };
    this.lastClaimDay = s?.lastClaimDay ?? null;
  }

  serializeProcessed() {
    return [...this.processed];
  }

  loadProcessed(list) {
    this.processed = [];
    this._processedSet = new Set();
    for (const id of Array.isArray(list) ? list : []) this.markProcessed(id);
  }

  _changed() {
    this.bus?.emit('entitlements:change', { removeAds: this.removeAds, vip: this.vipActive() });
  }
}
