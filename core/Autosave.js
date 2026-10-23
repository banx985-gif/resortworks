// Autosave (bible §37.3, Milestone 22), for any series game.
//   new Autosave({ bus, triggers, save, stamp, running, intervalMs = 30000 })
//     triggers  bus event names that each ask for a save (the game's §37.3 list, as data)
//     save(reason) → Promise   the game's save
//     stamp() → string         what changes when anything worth saving changes (the rolling save skips if it hasn't)
//     running() → bool         is the simulation running? (the rolling timer only counts then)
//   request(reason)   ask for a save; several asks in the same moment become one write
//   tick(dt)          the rolling save: every intervalMs of running time, if the stamp moved
//   background()      the app is going to the background (visibilitychange / pagehide): save straight away
//   installBackground(win, doc)   listens for those
//   stats: { saves, skipped, lastMs, maxMs, totalMs, byReason }
export class Autosave {
  constructor({ bus = null, triggers = [], save, stamp = () => null, running = () => false, intervalMs = 30000, enabled = () => true }) {
    this.bus = bus;
    this.saveFn = save;
    this.stamp = stamp;
    this.running = running;
    this.intervalMs = intervalMs;
    this.enabled = enabled;
    this.elapsed = 0; // running milliseconds since the last save
    this.lastStamp = null;
    this.pending = null;
    this.saving = null;
    this.again = false;
    this.stats = { saves: 0, skipped: 0, failed: 0, lastMs: 0, maxMs: 0, totalMs: 0, byReason: {} };
    for (const ev of triggers) bus?.on(ev, () => this.request(ev));
  }

  request(reason = 'request') {
    if (!this.enabled()) return;
    if (this.pending) return; // already asked for in this moment
    this.pending = reason;
    setTimeout(() => this.flush(), 0);
  }

  async flush() {
    const reason = this.pending ?? 'flush';
    this.pending = null;
    if (this.saving) {
      this.again = true; // one more after the write in progress
      return this.saving;
    }
    const t0 = globalThis.performance?.now() ?? Date.now();
    this.saving = Promise.resolve()
      .then(() => this.saveFn(reason))
      .then(() => {
        const ms = (globalThis.performance?.now() ?? Date.now()) - t0;
        const s = this.stats;
        s.saves++;
        s.lastMs = ms;
        s.maxMs = Math.max(s.maxMs, ms);
        s.totalMs += ms;
        s.byReason[reason] = (s.byReason[reason] ?? 0) + 1;
        this.elapsed = 0;
        this.lastStamp = this.stamp();
        this.bus?.emit('autosave:done', { reason, ms });
      })
      .catch((err) => {
        this.stats.failed++;
        this.bus?.emit('autosave:failed', { reason, error: err });
      })
      .finally(() => {
        this.saving = null;
        if (this.again) {
          this.again = false;
          this.pending = this.pending ?? 'again';
          this.flush();
        }
      });
    return this.saving;
  }

  // Called every frame with real seconds.
  tick(dt) {
    if (!this.enabled() || !this.running()) return;
    this.elapsed += dt * 1000;
    if (this.elapsed < this.intervalMs) return;
    this.elapsed = 0;
    if (this.stamp() === this.lastStamp) {
      this.stats.skipped++; // nothing changed since the last save
      return;
    }
    this.request('interval');
  }

  background() {
    if (!this.enabled()) return null;
    this.pending = this.pending ?? 'background';
    return this.flush();
  }

  installBackground(win = globalThis.window, doc = globalThis.document) {
    doc?.addEventListener('visibilitychange', () => doc.visibilityState === 'hidden' && this.background());
    win?.addEventListener('pagehide', () => this.background());
  }
}
