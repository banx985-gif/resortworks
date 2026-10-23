// Sponsors (any game): one active deal at a time, of a fixed length, with a benefit while it runs and an obligation.
//
// A definition (plain data):
//   { id, name, requirement: rule, benefits: [{ key, value }],
//     obligation: { type: 'count', signal, min, ... }   met once `min` matching signals arrive during the deal
//               | { type: 'avoid', signal, ... }        broken by the first matching signal during the deal
//     ...words and art the game shows }
// The game tells it:  hooks.eligible(def) → requirement met;  hooks.matches(obligation, payload) → does this signal
// count (e.g. "a launch using a PO04+ part")?  and passes what happens in play as signal(name, payload, day).
// Benefits reach the rest of the game only through total(key), which the game adds to its shared effect query.
// End of a deal: obligation met → the sponsor offers to renew on the same terms; not met → the benefit simply ends
// (no debt, no penalty) and that sponsor waits cooldownDays before offering again.
// Emits 'sponsor:offered', 'sponsor:signed', 'sponsor:progress', 'sponsor:met', 'sponsor:broken', 'sponsor:ended'.
export class SponsorSystem {
  constructor({ bus = null, defs = [], dealDays = 168, offerDays = 56, cooldownDays = 168, hooks = {} }) {
    this.bus = bus;
    this.defs = defs;
    this.byId = Object.fromEntries(defs.map((d) => [d.id, d]));
    this.dealDays = dealDays;
    this.offerDays = offerDays;
    this.cooldownDays = cooldownDays;
    this.hooks = hooks;
    this.reset();
  }

  reset() {
    this.active = null; // { id, startDay, endDay, count, met, broken, renewals }
    this.offers = []; // { id, day, untilDay, renewal }
    this.history = []; // { id, startDay, endDay, result: 'met' | 'notMet', renewals }
    this.cooldown = {}; // id → first day it may offer again
  }

  def(id) {
    return this.byId[id] ?? null;
  }

  get activeDef() {
    return this.active ? this.byId[this.active.id] : null;
  }

  // Sponsors whose requirement holds and who could make an offer today.
  offerable(day) {
    if (this.active) return [];
    return this.defs.filter((d) => !this.offers.some((o) => o.id === d.id) && !(this.cooldown[d.id] > day) && !!this.hooks.eligible?.(d));
  }

  offer(id, day, { renewal = false } = {}) {
    const d = this.byId[id];
    if (!d || this.active || this.offers.some((o) => o.id === id)) return null;
    if (!renewal && (this.cooldown[id] > day || !this.hooks.eligible?.(d))) return null;
    const o = { id, day, untilDay: day + this.offerDays, renewal };
    this.offers.push(o);
    this.bus?.emit('sponsor:offered', { offer: o, def: d });
    return o;
  }

  // Why this offer can't be signed now, or null.
  signBlock(id) {
    if (this.active) return `You already have a sponsor (${this.activeDef?.name ?? this.active.id})`;
    if (!this.offers.some((o) => o.id === id)) return 'No offer from this sponsor';
    return null;
  }

  sign(id, day) {
    const block = this.signBlock(id);
    if (block) return { ok: false, reason: block };
    const o = this.offers.find((x) => x.id === id);
    const last = this.history.findLast?.((h) => h.id === id);
    this.active = { id, startDay: day, endDay: day + this.dealDays, count: 0, met: false, broken: false, renewals: o.renewal ? (last?.renewals ?? 0) + 1 : 0 };
    this.offers = []; // one sponsor at a time: the other offers go
    const d = this.byId[id];
    if (d.obligation?.type === 'avoid') this.active.met = true; // met unless something breaks it
    this.bus?.emit('sponsor:signed', { deal: this.active, def: d });
    return { ok: true, deal: this.active };
  }

  // Something happened in play that an obligation might care about.
  signal(name, payload = {}, day = 0) {
    const a = this.active;
    if (!a) return;
    const d = this.byId[a.id];
    const ob = d.obligation;
    if (!ob || ob.signal !== name || !(this.hooks.matches?.(ob, payload) ?? true)) return;
    if (ob.type === 'count') {
      if (a.met) return;
      a.count++;
      this.bus?.emit('sponsor:progress', { deal: a, def: d });
      if (a.count >= (ob.min ?? 1)) {
        a.met = true;
        this.bus?.emit('sponsor:met', { deal: a, def: d, day });
      }
    } else if (ob.type === 'avoid' && !a.broken) {
      a.broken = true;
      a.met = false;
      this.bus?.emit('sponsor:broken', { deal: a, def: d, day });
    }
  }

  // Once per game day: offers run out; a deal that has run its length ends.
  dailyTick(day) {
    this.offers = this.offers.filter((o) => o.untilDay >= day);
    const a = this.active;
    if (!a || day < a.endDay) return null;
    const d = this.byId[a.id];
    const result = a.met ? 'met' : 'notMet';
    const rec = { id: a.id, startDay: a.startDay, endDay: day, result, renewals: a.renewals };
    this.history.push(rec);
    this.active = null;
    let renewal = null;
    if (result === 'met') renewal = this.offer(a.id, day, { renewal: true });
    else this.cooldown[a.id] = day + this.cooldownDays;
    this.bus?.emit('sponsor:ended', { record: rec, def: d, renewal });
    return rec;
  }

  // End the active deal early (the player cancels): the benefit stops now, it goes into the history as 'cancelled',
  // with no renewal offer and no cooldown. (Added for CAREWORKS M23; games that never call it are unaffected.)
  cancel(day) {
    const a = this.active;
    if (!a) return null;
    const rec = { id: a.id, startDay: a.startDay, endDay: day, result: 'cancelled', renewals: a.renewals };
    this.history.push(rec);
    this.active = null;
    this.bus?.emit('sponsor:ended', { record: rec, def: this.byId[a.id], renewal: null });
    return rec;
  }

  // Benefit total for an effect key (only while a deal runs).
  total(key) {
    const d = this.activeDef;
    if (!d) return 0;
    let t = 0;
    for (const b of d.benefits ?? []) if (b.key === key) t += b.value;
    return t;
  }

  daysLeft(day) {
    return this.active ? Math.max(0, this.active.endDay - day) : 0;
  }

  serialize() {
    return JSON.parse(JSON.stringify({ active: this.active, offers: this.offers, history: this.history, cooldown: this.cooldown }));
  }

  load(data) {
    this.reset();
    if (!data) return false;
    const s = JSON.parse(JSON.stringify(data));
    this.active = s.active && this.byId[s.active.id] ? s.active : null;
    this.offers = (s.offers ?? []).filter((o) => this.byId[o.id]);
    this.history = s.history ?? [];
    this.cooldown = s.cooldown ?? {};
    return true;
  }
}
