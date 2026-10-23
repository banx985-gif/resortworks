// The phone's / browser's back button and the Escape key (bible §6.2, Milestone 21), for any series game.
// The page keeps one extra history entry; pressing back pops it, we call onBack(), and if the game used the press
// (returns true) the entry is put back so the next back press comes to us again. If the game did not use it (the main
// menu with nothing open) the entry stays gone, so one more back press leaves the page / closes the installed app.
//   const sb = new SystemBack({ onBack: () => router.back() });   sb.press() — the same as a back press (tests)
export class SystemBack {
  constructor({ onBack, win = globalThis.window, key = 'Escape' } = {}) {
    this.onBack = onBack;
    this.win = win;
    this.armed = false;
    if (!win?.history) return;
    this._arm();
    win.addEventListener('popstate', () => {
      this.armed = false;
      if (this.press()) this._arm();
    });
    win.addEventListener('keydown', (e) => {
      if (e.key !== key || e.repeat) return;
      e.preventDefault();
      this.press();
    });
  }

  // After a back press was let through (at the root) and the player carries on in the game: catch the next one again.
  rearm() {
    this._arm();
  }

  _arm() {
    if (this.armed) return;
    try {
      this.win.history.pushState({ canvasBack: true }, '');
      this.armed = true;
    } catch {
      /* a sandboxed frame can refuse; Escape still works */
    }
  }

  press() {
    try {
      return this.onBack?.() === true;
    } catch (err) {
      console.error('[SystemBack]', err);
      return true;
    }
  }
}
