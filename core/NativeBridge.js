// The phone app's features (Capacitor, bible §41), for any series game shipped as an app (Robot Workshop M29a).
// In a web browser there is no Capacitor: isNative is false and every call does nothing, so the web build is unchanged.
// Inside the app, tools/build-android.ps1 adds Capacitor's small core script (capacitor.js) to the page, which gives
// window.Capacitor.registerPlugin; the plugins themselves are the native ones the app project installs.
//
//   const nb = new NativeBridge();            nb.isNative, nb.platform ('android' | 'ios' | 'web')
//   nb.plugin('App')                          a plugin proxy (null on the web or if the app lacks it)
//   nb.onBack(fn)                             the phone's Back button (Capacitor then stops its own default)
//   nb.onAppState(fn(active))                 the app went to the background (false) / came back (true)
//   nb.exitApp()                              close the app (Android)
//   nb.keepAwake(on)                          keep the screen on (only calls the phone when it changes)
//   nb.vibrate(msOrPattern)                   the phone's own vibration (a pattern plays its buzz parts)
//   nb.hideSplash()                           hide the native splash once the game has drawn
//   nb.openUrl(url)                           a web page outside the game: the phone's browser in the app, a new tab on the web
export class NativeBridge {
  constructor({ win = globalThis.window } = {}) {
    this.win = win;
    const cap = win?.Capacitor;
    this.cap = cap ?? null;
    this.isNative = !!cap?.isNativePlatform?.();
    this.platform = this.isNative ? cap.getPlatform?.() ?? 'android' : 'web';
    this._plugins = new Map();
    this._awake = null;
  }

  plugin(name) {
    if (!this.isNative) return null;
    if (this._plugins.has(name)) return this._plugins.get(name);
    let p = null;
    try {
      if (this.cap.isPluginAvailable?.(name) !== false) p = this.cap.registerPlugin?.(name) ?? this.cap.Plugins?.[name] ?? null;
    } catch {
      p = null;
    }
    this._plugins.set(name, p);
    return p;
  }

  // Call a plugin method; any failure (no plugin, not implemented, the phone said no) returns null.
  async call(name, method, options) {
    const p = this.plugin(name);
    if (!p?.[method]) return null;
    try {
      return (await p[method](options)) ?? {};
    } catch (err) {
      console.warn(`[NativeBridge] ${name}.${method}`, err?.message ?? err);
      return null;
    }
  }

  async listen(name, event, fn) {
    const p = this.plugin(name);
    if (!p?.addListener) return null;
    try {
      return await p.addListener(event, fn);
    } catch {
      return null;
    }
  }

  onBack(fn) {
    return this.listen('App', 'backButton', () => fn());
  }

  onAppState(fn) {
    return this.listen('App', 'appStateChange', (s) => fn(!!s?.isActive));
  }

  exitApp() {
    return this.call('App', 'exitApp');
  }

  keepAwake(on) {
    if (!this.isNative || this._awake === !!on) return;
    this._awake = !!on;
    this.call('KeepAwake', on ? 'keepAwake' : 'allowSleep');
  }

  vibrate(ms) {
    if (!this.isNative) return false;
    // A pattern [buzz, pause, buzz, …]: the phone plays each buzz part in turn.
    if (Array.isArray(ms)) {
      let t = 0;
      ms.forEach((d, i) => {
        if (i % 2 === 0) setTimeout(() => this.call('Haptics', 'vibrate', { duration: d }), t);
        t += d;
      });
      return true;
    }
    this.call('Haptics', 'vibrate', { duration: ms });
    return true;
  }

  hideSplash() {
    return this.call('SplashScreen', 'hide');
  }

  openUrl(url) {
    // In the app, Capacitor hands any address outside the app to the phone's browser (the game stays where it was).
    if (this.isNative) this.win.location.href = url;
    else this.win?.open?.(url, '_blank', 'noopener');
  }
}
