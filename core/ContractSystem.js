// Customer contracts (any game: a robot order, a catering job, a ship refit).
//   - offers are made at each month start (offersPerMonth), unaccepted random offers vanish next month
//   - the player accepts up to maxActive at once; each has a deadline in days from acceptance
//   - delivering something checks the requirements; success pays out, a miss leaves it open
//   - an open contract past its deadline fails (the game applies the penalty)
//   - "story" contracts are fixed ones that appear once, when their condition is met, and stay on
//     the board until taken
// Everything specific comes through hooks:
//   generate(ctx, rng)            → terms for a random offer, or null if nothing sensible can be offered
//   story()                       → list of story definitions ({ id, ... })
//   storyReady(def, ctx)          → true when a story contract should appear
//   makeStory(def, ctx, rng)      → terms for that story contract (or null to try again next month)
//   check(contract, deliverable)  → { ok, failures: [text] }
//   onSuccess(contract, deliverable), onFail(contract, reason)
// terms must include deadlineDays. Everything else in terms is the game's own.
// Uses its own seeded Rng. Emits 'contract:offered', 'contract:accepted', 'contract:success', 'contract:failed'.
export class ContractSystem {
  constructor({ rng, bus = null, maxActive = 2, offersPerMonth = 3, keepDone = 80, hooks = {} }) {
    this.rng = rng;
    this.bus = bus;
    this.maxActive = maxActive;
    this.offersPerMonth = offersPerMonth;
    this.keepDone = keepDone;
    this.hooks = hooks;
    this.reset();
  }

  reset() {
    this.offers = [];
    this.active = [];
    this.done = []; // newest last: success / failed
    this.storySeen = []; // story ids that have appeared (each appears once)
    this.nextId = 1;
    this.stats = { offered: 0, accepted: 0, succeeded: 0, failed: 0, expired: 0 };
  }

  get canAccept() {
    return this.active.length < this.maxActive;
  }

  get(id) {
    return this.offers.find((c) => c.id === id) || this.active.find((c) => c.id === id) || this.done.find((c) => c.id === id) || null;
  }

  _make(terms, storyId, day) {
    const c = { id: `C${this.nextId++}`, story: storyId, status: 'offered', offeredDay: day, acceptedDay: null, dueDay: null, resolvedDay: null, result: null, ...terms };
    this.stats.offered++;
    this.bus?.emit('contract:offered', { contract: c });
    return c;
  }

  // Month start. ctx is whatever the game's hooks need (date, open content, team strength…).
  monthStart(ctx, day) {
    // Random offers from last month go; story offers stay until taken.
    const kept = [];
    for (const c of this.offers) {
      if (c.story) kept.push(c);
      else {
        c.status = 'expired';
        this.stats.expired++;
      }
    }
    this.offers = kept;
    for (const def of this.hooks.story?.() ?? []) {
      if (this.offers.length >= this.offersPerMonth) break;
      if (this.storySeen.includes(def.id) || !this.hooks.storyReady?.(def, ctx)) continue;
      const terms = this.hooks.makeStory(def, ctx, this.rng);
      if (!terms) continue;
      this.storySeen.push(def.id);
      this.offers.push(this._make(terms, def.id, day));
    }
    let tries = 0;
    while (this.offers.length < this.offersPerMonth && tries++ < this.offersPerMonth * 4) {
      const terms = this.hooks.generate?.(ctx, this.rng);
      if (terms) this.offers.push(this._make(terms, null, day));
    }
  }

  accept(id, day) {
    const i = this.offers.findIndex((c) => c.id === id);
    if (i < 0) return { ok: false, reason: 'not on offer' };
    if (!this.canAccept) return { ok: false, reason: `only ${this.maxActive} contracts at once` };
    const [c] = this.offers.splice(i, 1);
    c.status = 'active';
    c.acceptedDay = day;
    c.dueDay = day + c.deadlineDays;
    this.active.push(c);
    this.stats.accepted++;
    this.bus?.emit('contract:accepted', { contract: c });
    return { ok: true, contract: c };
  }

  daysLeft(c, day) {
    return c.dueDay === null ? null : c.dueDay - day;
  }

  // Try to complete an active contract. A miss leaves it open (the deadline still runs).
  deliver(id, deliverable, day) {
    const c = this.active.find((x) => x.id === id);
    if (!c) return { ok: false, failures: ['not an active contract'] };
    const res = this.hooks.check(c, deliverable);
    if (!res.ok) return res;
    this._close(c, 'success', day, { deliverable: deliverable?.ref ?? null });
    this.stats.succeeded++;
    this.hooks.onSuccess?.(c, deliverable);
    this.bus?.emit('contract:success', { contract: c });
    return res;
  }

  // Give up on an active contract: it fails now.
  cancel(id, day) {
    const c = this.active.find((x) => x.id === id);
    if (c) this._fail(c, 'cancelled', day);
    return !!c;
  }

  // Each day: open contracts past their deadline fail.
  dailyTick(day) {
    for (const c of [...this.active]) if (day > c.dueDay) this._fail(c, 'deadline', day);
  }

  _fail(c, reason, day) {
    this._close(c, 'failed', day, { reason });
    this.stats.failed++;
    this.hooks.onFail?.(c, reason);
    this.bus?.emit('contract:failed', { contract: c, reason });
  }

  _close(c, status, day, result) {
    this.active = this.active.filter((x) => x !== c);
    c.status = status;
    c.resolvedDay = day;
    c.result = result;
    this.done.push(c);
    if (this.done.length > this.keepDone) this.done.shift();
  }

  serialize() {
    return JSON.parse(
      JSON.stringify({
        rngState: this.rng.getState(),
        offers: this.offers,
        active: this.active,
        done: this.done,
        storySeen: this.storySeen,
        nextId: this.nextId,
        stats: this.stats,
      }),
    );
  }

  load(s) {
    this.reset();
    if (!s) return false;
    const d = JSON.parse(JSON.stringify(s));
    if (d.rngState !== undefined) this.rng.setState(d.rngState);
    this.offers = d.offers ?? [];
    this.active = d.active ?? [];
    this.done = d.done ?? [];
    this.storySeen = d.storySeen ?? [];
    this.nextId = d.nextId ?? 1;
    this.stats = { ...this.stats, ...(d.stats ?? {}) };
    return true;
  }
}
