// Ads behind one interface (bible §32.1): rewarded ads (the player chooses to watch one for a small reward) and
// interstitials (full-screen ads between screens). The real ad network comes later as another provider; until then
// there is no provider (nothing shows, the game carries on) or, in debug builds, the pretend one.
//
// A provider: { id, available(kind) → bool, show(kind, placementId) → Promise<{ status }> }
//   kind: 'rewarded' | 'interstitial'
//   status: 'completed' (watched to the end) · 'cancelled' (closed early) · 'failed' · 'offline' (no ad to show)
//
// Interstitial caps — every one of them lives in interstitialBlock(), the only door to an interstitial:
//   caps: { firstInstallQuietMin, minGapMin, maxPerHour, afterResumeQuietSec, afterPurchaseQuietMin, breakPoints: [] }
//   context from the game: { tutorial, decisionPending }
//   plus: adFree() (Remove Ads / an active subscription), no provider, an ad already showing.
// Rewarded placements (game data): { id, limit: { per, count = 1, hours } }
//   per 'realHours' → counted against real time (kept with the account); anything else → counted per scope key the
//   game passes (a stage, a topic, a game month…; kept with the run). The reward is given only when the provider says
//   the ad was watched to the end; a cancelled, failed or offline ad gives nothing and changes nothing.
//
//   new AdService({ provider, caps, placements, now = Date.now, adFree = () => false, bus })
//   interstitialBlock(breakPoint, context) → reason | null
//   await interstitial(breakPoint, context) → { shown, status, reason }
//   rewardBlock(placementId, scope) → reason | null
//   await rewarded(placementId, scope, grant) → { ok, status, reason, reward }
//   noteResume() / notePurchase()      the app came back from the background / a purchase just finished
//   serializeAccount() / loadAccount(s), serializeRun() / loadRun(s)
// Emits 'ads:interstitial' ({ breakPoint, status }) and 'ads:rewarded' ({ placementId, scope, status, granted }).
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const KEEP_SCOPES = 300; // scope keys remembered per placement (old stages / topics drop off)

export const NO_AD_PROVIDER = Object.freeze({
  id: 'none',
  available: () => false,
  show: async () => ({ status: 'offline' }),
});

export class AdService {
  constructor({ provider = NO_AD_PROVIDER, caps = {}, placements = [], now = () => Date.now(), adFree = () => false, bus = null } = {}) {
    this.provider = provider ?? NO_AD_PROVIDER;
    this.caps = { firstInstallQuietMin: 10, minGapMin: 12, maxPerHour: 3, afterResumeQuietSec: 60, afterPurchaseQuietMin: 10, breakPoints: [], ...caps };
    this.placements = Object.fromEntries(placements.map((p) => [p.id, p]));
    this.now = now;
    this.adFree = adFree;
    this.bus = bus;
    this.showing = false;
    this.loadAccount(null);
    this.loadRun(null);
  }

  setProvider(p) {
    this.provider = p ?? NO_AD_PROVIDER;
  }

  get available() {
    return !!this.provider.available?.('rewarded');
  }

  // --- interstitials --------------------------------------------------------------------------------------------------
  interstitialBlock(breakPoint, { tutorial = false, decisionPending = false } = {}) {
    const t = this.now();
    const c = this.caps;
    const a = this.account;
    if (this.adFree()) return 'ad-free (Remove Ads or VIP)';
    if (!c.breakPoints.includes(breakPoint)) return 'not a natural break point';
    if (this.showing) return 'an ad is already showing';
    if (t - a.firstSeenAt < c.firstInstallQuietMin * MIN) return 'first minutes of a new install';
    if (tutorial) return 'tutorial';
    if (decisionPending) return 'a decision is waiting';
    if (a.lastResumeAt != null && t - a.lastResumeAt < c.afterResumeQuietSec * 1000) return 'just resumed';
    if (a.lastPurchaseAt != null && t - a.lastPurchaseAt < c.afterPurchaseQuietMin * MIN) return 'just after a purchase';
    const last = a.shown.at(-1);
    if (last != null && t - last < c.minGapMin * MIN) return 'too soon after the last one';
    if (a.shown.filter((x) => t - x < HOUR).length >= c.maxPerHour) return 'hourly limit';
    if (!this.provider.available?.('interstitial')) return 'no ad provider';
    return null;
  }

  async interstitial(breakPoint, context = {}) {
    const reason = this.interstitialBlock(breakPoint, context);
    if (reason) return { shown: false, status: null, reason };
    this.showing = true;
    let status = 'failed';
    try {
      status = (await this.provider.show('interstitial', breakPoint))?.status ?? 'failed';
    } catch {
      status = 'failed';
    } finally {
      this.showing = false;
    }
    const shown = status === 'completed' || status === 'cancelled'; // closed early still counts against the caps
    if (shown) {
      const t = this.now();
      this.account.shown = [...this.account.shown.filter((x) => t - x < HOUR), t];
    }
    this.bus?.emit('ads:interstitial', { breakPoint, status });
    return { shown, status, reason: null };
  }

  // --- rewarded ads -------------------------------------------------------------------------------------------------
  used(placementId, scope) {
    const p = this.placements[placementId];
    if (!p) return 0;
    if (p.limit?.per === 'realHours') {
      const t = this.now();
      return (this.account.rewardTimes[placementId] ?? []).filter((x) => t - x < (p.limit.hours ?? 24) * HOUR).length;
    }
    return this.run.used[placementId]?.[String(scope)] ?? 0;
  }

  // When a real-time limit frees up again (ms timestamp), or null.
  nextFreeAt(placementId) {
    const p = this.placements[placementId];
    if (p?.limit?.per !== 'realHours') return null;
    const times = this.account.rewardTimes[placementId] ?? [];
    if (!times.length) return null;
    return Math.min(...times) + (p.limit.hours ?? 24) * HOUR;
  }

  limitBlock(placementId, scope) {
    const p = this.placements[placementId];
    if (!p) return 'unknown placement';
    if (p.limit?.per !== 'realHours' && (scope === null || scope === undefined)) return 'nothing to use it on';
    return this.used(placementId, scope) >= (p.limit?.count ?? 1) ? 'limit reached' : null;
  }

  rewardBlock(placementId, scope) {
    const lim = this.limitBlock(placementId, scope);
    if (lim) return lim;
    if (this.showing) return 'an ad is already showing';
    if (!this.provider.available?.('rewarded')) return 'no ad available';
    return null;
  }

  // grant(): the game's reward; called only after a finished ad, and only if the limit still allows it.
  async rewarded(placementId, scope, grant) {
    const reason = this.rewardBlock(placementId, scope);
    if (reason) return { ok: false, status: null, reason };
    this.showing = true;
    let status = 'failed';
    try {
      status = (await this.provider.show('rewarded', placementId))?.status ?? 'failed';
    } catch {
      status = 'failed';
    } finally {
      this.showing = false;
    }
    if (status !== 'completed') {
      this.bus?.emit('ads:rewarded', { placementId, scope, status, granted: false });
      return { ok: false, status, reason: status };
    }
    if (this.limitBlock(placementId, scope)) return { ok: false, status, reason: 'limit reached' }; // used meanwhile
    const reward = grant ? grant() : null;
    if (reward === false) return { ok: false, status, reason: 'nothing to reward now' };
    this._count(placementId, scope);
    this.bus?.emit('ads:rewarded', { placementId, scope, status, granted: true, reward });
    return { ok: true, status, reason: null, reward };
  }

  _count(placementId, scope) {
    const p = this.placements[placementId];
    if (p.limit?.per === 'realHours') {
      const t = this.now();
      const keep = (p.limit.hours ?? 24) * HOUR;
      this.account.rewardTimes[placementId] = [...(this.account.rewardTimes[placementId] ?? []).filter((x) => t - x < keep), t];
      return;
    }
    const m = (this.run.used[placementId] ||= {});
    const k = String(scope);
    m[k] = (m[k] ?? 0) + 1;
    const keys = Object.keys(m);
    if (keys.length > KEEP_SCOPES) for (const old of keys.slice(0, keys.length - KEEP_SCOPES)) delete m[old];
  }

  // --- moments the caps listen to -----------------------------------------------------------------------------------
  noteResume() {
    this.account.lastResumeAt = this.now();
  }

  notePurchase() {
    this.account.lastPurchaseAt = this.now();
  }

  // --- save ---------------------------------------------------------------------------------------------------------
  // The account half: when this install was first seen, when interstitials last showed, real-time reward limits.
  serializeAccount() {
    return JSON.parse(JSON.stringify(this.account));
  }

  loadAccount(s) {
    this.account = {
      firstSeenAt: s?.firstSeenAt ?? this.now(),
      shown: Array.isArray(s?.shown) ? [...s.shown] : [],
      lastResumeAt: s?.lastResumeAt ?? null,
      lastPurchaseAt: s?.lastPurchaseAt ?? null,
      rewardTimes: { ...(s?.rewardTimes ?? {}) },
    };
  }

  // The run half: rewarded uses counted per stage / topic / game month (a new run starts clean).
  serializeRun() {
    return { used: JSON.parse(JSON.stringify(this.run.used)) };
  }

  loadRun(s) {
    this.run = { used: JSON.parse(JSON.stringify(s?.used ?? {})) };
  }
}
