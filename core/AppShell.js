// The phone app's life around the game (bible §41, Robot Workshop M29a), for any series game shipped as an app.
// In a web browser it does nothing (core/NativeBridge.isNative is false) — the web build keeps core/SystemBack and
// the page's own visibility events.
//
//   new AppShell({ bridge, onBack, confirmQuit, onBackground, onResume, isRunning })
//     onBack()            → true if the game used the Back press (closed something / went back a screen)
//     confirmQuit(quit)   the game asks "Quit <game>?" at its root screen; calling quit() closes the app
//     onBackground()      the app is going to the background or the phone locked: pause the clock and save
//     onResume()          the app is back in front
//     isRunning()         → true while the game clock runs (the screen then stays awake)
export class AppShell {
  constructor({ bridge, onBack, confirmQuit, onBackground = () => {}, onResume = () => {}, isRunning = () => false, awakeCheckMs = 1000 } = {}) {
    this.bridge = bridge;
    this.active = true;
    this.quitAsked = false;
    this.counts = { back: 0, background: 0, resume: 0 }; // for checks
    if (!bridge?.isNative) return;
    bridge.onBack(() => {
      this.counts.back++;
      if (onBack?.() === true) return;
      if (this.quitAsked) return;
      this.quitAsked = true;
      confirmQuit?.(() => bridge.exitApp());
      setTimeout(() => (this.quitAsked = false), 400); // one question per press
    });
    bridge.onAppState((active) => {
      if (active === this.active) return;
      this.active = active;
      if (!active) {
        this.counts.background++;
        bridge.keepAwake(false);
        onBackground();
      } else {
        this.counts.resume++;
        onResume();
      }
    });
    // Keep the screen on while the clock runs; let it sleep when paused, on a menu, or in the background.
    this.timer = setInterval(() => bridge.keepAwake(this.active && !!isRunning()), awakeCheckMs);
  }
}
