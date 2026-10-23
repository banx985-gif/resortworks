// The first-launch ads & privacy answer (bible §32.1, Robot Workshop M29a), for any series game with real ads.
// No ad is ever requested before the player has answered; the answer is remembered on this device and can be changed
// from Settings → Privacy. The game draws the message itself (its own dialog); this only keeps the answer.
//
//   const consent = new AdConsent({ key: 'robot-workshop:adConsent' })
//   consent.answered          has the player answered yet?
//   consent.value             → { given, personalised, at, source } (given = ads allowed at all)
//   consent.set({ personalised })   the player chose (always "given": the game shows ads either way; personalised or not)
//   consent.set({ source: 'google', given })   the answer came from Google's own form (core/GoogleConsent, EU/UK):
//                             Google keeps the details, so ads are not forced non-personalised; given = Google says
//                             ads may be asked for. source is 'game' (the game's own question) otherwise.
export class AdConsent {
  constructor({ key, storage = globalThis.localStorage, now = () => Date.now() } = {}) {
    this.key = key;
    this.storage = storage;
    this.now = now;
    this._value = null;
    try {
      this._value = JSON.parse(storage?.getItem(key) ?? 'null');
    } catch {
      this._value = null;
    }
  }

  get answered() {
    return !!this._value?.at;
  }

  get value() {
    return { given: !!this._value?.given, personalised: !!this._value?.personalised, at: this._value?.at ?? null, source: this._value?.source ?? 'game' };
  }

  set({ personalised = false, given = true, source = 'game' } = {}) {
    this._value = { given: !!given, personalised: !!personalised, at: this.now(), source };
    try {
      this.storage?.setItem(this.key, JSON.stringify(this._value));
    } catch {
      /* asked again next launch */
    }
    return this.value;
  }
}
