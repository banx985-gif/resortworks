// Short phone vibrations (bible §7: light on purchase / build / phase finish, medium on unlock / win), for any series
// game. Off in Settings = nothing. Phones without vibration (and desktops) just ignore it.
//   const h = new Haptics({ enabled: () => settings.get('haptics') });   h.tick()  h.light()   h.medium()   h.strong()
// Milestone 25 (Robot Workshop): three levels — a light tick on taps, a medium buzz on confirm / stage complete, a
// strong pattern on big moments. 'counts' records each level (checks).
// vibrate(msOrPattern): optional — the phone app's own vibration (core/NativeBridge.vibrate; Android's web view ignores
// navigator.vibrate). Without it the browser's navigator.vibrate is used, as before.
export class Haptics {
  constructor({ enabled = () => true, nav = globalThis.navigator, vibrate = null } = {}) {
    this.enabled = enabled;
    this.nav = nav;
    this.vibrateFn = vibrate;
    this.count = 0; // for checks
    this.counts = { tick: 0, light: 0, medium: 0, strong: 0 };
  }

  _buzz(ms, level = null) {
    if (!this.enabled()) return false;
    this.count++;
    if (level) this.counts[level]++;
    try {
      if (this.vibrateFn) this.vibrateFn(ms);
      else this.nav?.vibrate?.(ms);
    } catch {
      /* not allowed here */
    }
    return true;
  }

  tick() {
    return this._buzz(8, 'tick');
  }

  light() {
    return this._buzz(12, 'light');
  }

  medium() {
    return this._buzz(28, 'medium');
  }

  // A short pattern: buzz, pause, a longer buzz.
  strong() {
    return this._buzz([40, 50, 90], 'strong');
  }
}
