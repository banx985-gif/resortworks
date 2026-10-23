// Google AdMob behind core/AdService (bible §32.1), for any series game shipped as an app. It is only a provider:
// every cap, limit and reward rule stays in AdService, exactly as with the pretend provider (core/FakeStoreProvider).
// Uses the @capacitor-community/admob plugin through core/NativeBridge.
//
// Milestone 29a (Robot Workshop): TEST MODE ONLY — Google's official test ad units (below), which never pay and are
// safe to tap. The real ids and the real account come in 29b; the app's AdMob app id lives in its AndroidManifest.
//
//   const ads = new AdMobProvider({ bridge, consent: () => ({ given, personalised }), ids = ADMOB_TEST_IDS })
//   await ads.init()        once, after the player has answered the consent message
//   AdService provider: available(kind), show(kind, placementId) → { status }
//     'completed' — watched to the end (rewarded: the reward was earned) / the interstitial was shown and closed
//     'cancelled' — a rewarded ad closed before the reward · 'failed' · 'offline' (no ad could be loaded)
export const ADMOB_TEST_IDS = Object.freeze({
  appId: 'ca-app-pub-3940256099942544~3347511713', // Google's sample AdMob app id (goes in the AndroidManifest)
  interstitial: 'ca-app-pub-3940256099942544/1033173712',
  rewarded: 'ca-app-pub-3940256099942544/5224354917',
});

const LOAD_TIMEOUT_MS = 20000;
const SHOW_TIMEOUT_MS = 180000; // a stuck ad never holds the game for ever

const EV = {
  rewarded: { loaded: 'onRewardedVideoAdLoaded', failedLoad: 'onRewardedVideoAdFailedToLoad', failedShow: 'onRewardedVideoAdFailedToShow', dismissed: 'onRewardedVideoAdDismissed', reward: 'onRewardedVideoAdReward' },
  interstitial: { loaded: 'interstitialAdLoaded', failedLoad: 'interstitialAdFailedToLoad', failedShow: 'interstitialAdFailedToShow', dismissed: 'interstitialAdDismissed' },
};
const METHOD = {
  rewarded: { prepare: 'prepareRewardVideoAd', show: 'showRewardVideoAd' },
  interstitial: { prepare: 'prepareInterstitial', show: 'showInterstitial' },
};

const withTimeout = (p, ms, value) => Promise.race([p, new Promise((r) => setTimeout(() => r(value), ms))]);

export class AdMobProvider {
  constructor({ bridge, consent = () => ({ given: false, personalised: false }), ids = ADMOB_TEST_IDS, testing = true } = {}) {
    this.id = testing ? 'admob-test' : 'admob';
    this.bridge = bridge;
    this.consent = consent;
    this.ids = ids;
    this.testing = testing;
    this.ready = false;
    this.loaded = { rewarded: false, interstitial: false };
    this.loading = { rewarded: null, interstitial: null };
    this.log = []; // what happened, newest last (debug overlay / checks)
    this._waiters = [];
  }

  get plugin() {
    return this.bridge?.plugin('AdMob') ?? null;
  }

  _note(text) {
    this.log.push({ at: Date.now(), text });
    if (this.log.length > 40) this.log.shift();
  }

  async init() {
    if (this.ready || !this.plugin || !this.consent().given) return this.ready;
    const ok = await this.bridge.call('AdMob', 'initialize', { initializeForTesting: this.testing, testingDevices: [] });
    if (ok === null) {
      this._note('initialize failed');
      return false;
    }
    for (const kind of Object.keys(EV)) {
      for (const [what, name] of Object.entries(EV[kind])) {
        this.bridge.listen('AdMob', name, (data) => this._event(kind, what, data));
      }
    }
    this.ready = true;
    this._note(`initialised (${this.id})`);
    this.preload('rewarded');
    this.preload('interstitial');
    return true;
  }

  _event(kind, what, data) {
    if (what === 'loaded') this.loaded[kind] = true;
    if (what === 'failedLoad') this.loaded[kind] = false;
    this._note(`${kind}: ${what}${data?.message ? ` (${data.message})` : ''}`);
    for (const w of [...this._waiters]) w(kind, what);
  }

  _wait(kind, whats, ms) {
    return withTimeout(
      new Promise((resolve) => {
        const w = (k, what) => {
          if (k !== kind || !whats.includes(what)) return;
          this._waiters = this._waiters.filter((x) => x !== w);
          resolve(what);
        };
        this._waiters.push(w);
      }),
      ms,
      'timeout',
    );
  }

  _options(kind) {
    return { adId: this.ids[kind], isTesting: this.testing, npa: !this.consent().personalised, immersiveMode: true };
  }

  // Load the next ad of this kind in the background (one at a time).
  preload(kind) {
    if (!this.ready || this.loaded[kind] || this.loading[kind]) return this.loading[kind];
    this.loading[kind] = (async () => {
      const r = await withTimeout(this.bridge.call('AdMob', METHOD[kind].prepare, this._options(kind)), LOAD_TIMEOUT_MS, null);
      this.loaded[kind] = r !== null;
      this.loading[kind] = null;
      return this.loaded[kind];
    })();
    return this.loading[kind];
  }

  // AdService asks this before an ad: the player said yes to ads and the ad service started. (A not-yet-loaded ad is
  // loaded at show time; if that fails the ad reports 'offline' and AdService gives nothing and counts nothing.)
  available() {
    return this.ready && !!this.consent().given;
  }

  async show(kind, placementId) {
    if (!this.available()) return { status: 'offline' };
    if (!this.loaded[kind]) await this.preload(kind);
    if (!this.loaded[kind]) {
      this._note(`${kind} (${placementId}): no ad loaded`);
      return { status: 'offline' };
    }
    this.loaded[kind] = false;
    let earned = false;
    const onReward = (k, what) => k === kind && what === 'reward' && (earned = true);
    this._waiters.push(onReward);
    const end = this._wait(kind, ['dismissed', 'failedShow'], SHOW_TIMEOUT_MS);
    // Not awaited: the rewarded call only answers once the reward is earned (never, if the ad is closed early). The end
    // of the ad is its Dismissed (or FailedToShow) event.
    this.bridge.call('AdMob', METHOD[kind].show).then((r) => {
      if (r === null) this._event(kind, 'failedShow', null);
      else if (kind === 'rewarded' && typeof r.amount === 'number') earned = true;
    });
    const outcome = await end;
    await new Promise((r) => setTimeout(r, 50)); // a reward that lands with the close still counts
    this._waiters = this._waiters.filter((x) => x !== onReward);
    const status = outcome === 'failedShow' ? 'failed' : kind === 'rewarded' ? (earned ? 'completed' : 'cancelled') : outcome === 'dismissed' ? 'completed' : 'failed';
    this._note(`${kind} (${placementId}): ${status}`);
    setTimeout(() => this.preload(kind), 1000); // the next one, ready for later
    return { status };
  }
}
