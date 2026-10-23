// Google's consent form (the User Messaging Platform, "UMP") for any series game with real ads (Robot Workshop M29b).
// Players in the EU, the UK and the other places Google's rules cover (GDPR) must answer Google's own form before
// any ad is asked for; everywhere else Google says it is not needed and the game's own question (core/AdConsent)
// stays. Uses the consent calls of the @capacitor-community/admob plugin through core/NativeBridge.
//
//   const g = new GoogleConsent({ bridge, test: { geography: 'EEA', devices: [] } })
//   await g.check()          → { status, canRequestAds, formAvailable, privacyOptions } or null (no answer: offline…)
//                              status: 'REQUIRED' | 'OBTAINED' | 'NOT_REQUIRED' | 'UNKNOWN'
//   await g.showForm()       Google's form, only if still needed → the same answer shape, or null
//   await g.showPrivacyOptions()   the "change my ad choices" form (Settings) → the fresh answer, or null
//   g.applies(info)          true when Google's form is the one to use here (the player is where the rules apply)
//
// test (TEST builds only): geography 'EEA' pretends the phone is in Europe so the form shows; it only works on an
// emulator or on the phones listed in devices (the hashed id Google writes to the phone's log). Never in a release.
const GEOGRAPHY = { DISABLED: 0, EEA: 1, NOT_EEA: 2, US: 3, OTHER: 4 };

export class GoogleConsent {
  constructor({ bridge, test = null, underAge = false } = {}) {
    this.bridge = bridge;
    this.test = test;
    this.underAge = underAge;
    this.last = null; // the newest answer
    this.log = [];
  }

  get supported() {
    return !!this.bridge?.plugin('AdMob')?.requestConsentInfo;
  }

  _note(text) {
    this.log.push({ at: Date.now(), text });
    if (this.log.length > 40) this.log.shift();
  }

  _info(r) {
    if (!r) return null;
    this.last = {
      status: r.status ?? 'UNKNOWN',
      canRequestAds: !!r.canRequestAds,
      formAvailable: r.isConsentFormAvailable ?? this.last?.formAvailable ?? false,
      privacyOptions: r.privacyOptionsRequirementStatus === 'REQUIRED',
    };
    this._note(`${this.last.status} canRequestAds=${this.last.canRequestAds} privacyOptions=${this.last.privacyOptions}`);
    return this.last;
  }

  // Google asks for this on every launch (the rules or the player's region may have changed).
  async check() {
    if (!this.supported) return null;
    const options = { tagForUnderAgeOfConsent: this.underAge };
    if (this.test) {
      options.debugGeography = GEOGRAPHY[this.test.geography] ?? GEOGRAPHY.DISABLED;
      options.testDeviceIdentifiers = this.test.devices ?? [];
    }
    const r = this._info(await this.bridge.call('AdMob', 'requestConsentInfo', options));
    if (!r) this._note('check failed (offline or not set up)');
    return r;
  }

  applies(info = this.last) {
    return !!info && (info.status === 'REQUIRED' || info.status === 'OBTAINED' || info.privacyOptions);
  }

  async showForm() {
    if (!this.supported) return null;
    const r = await this.bridge.call('AdMob', 'showConsentForm');
    if (!r) this._note('form failed');
    return this._info(r);
  }

  async showPrivacyOptions() {
    if (!this.supported) return null;
    const shown = await this.bridge.call('AdMob', 'showPrivacyOptionsForm');
    if (shown === null) this._note('privacy options form failed');
    return this.check();
  }
}
