// Visible achievements (any series game): goals as data, checked on trigger events, rewards paid once per account.
//
// An achievement (plain data, no code):
//   { id, name, text,                       what the player sees
//     triggerEvents: ['projectFinished', …], the only moments it is checked (like the secret engine's index)
//     requires: cond,                        one condition, or { all: [cond] } / { any: [cond] }
//     progress: { fact, target },            optional: a count-style bar ("7 / 10")
//     reward: [{ currency, amount }] }       paid through the game's pay() hook
// A condition: { fact, op, value }  ops: eq, neq, gt, gte, lt, lte, has (the fact's list contains value),
//   hasAll (the list contains every one of value). Facts are read by name from a FactRegistry (core/SecretEngine.js).
//
// Everything here is account-wide (its own save record, kept across new runs):
//   unlocked  id → { day, year, runId }      once unlocked, stays unlocked in every later run
//   paid      id → true                      set BEFORE paying, so a reward can never be paid twice
//   seen      id → true                      the player has looked at it on the Records screen
// Emits 'achievement:unlocked' ({ def, when, paidNow }).
const OPS = {
  eq: (a, b) => a === b,
  neq: (a, b) => a !== b,
  gt: (a, b) => typeof a === 'number' && a > b,
  gte: (a, b) => typeof a === 'number' && a >= b,
  lt: (a, b) => typeof a === 'number' && a < b,
  lte: (a, b) => typeof a === 'number' && a <= b,
  has: (a, b) => (Array.isArray(a) || a instanceof Set ? [...a].includes(b) : false),
  hasAll: (a, b) => (Array.isArray(a) || a instanceof Set ? b.every((x) => [...a].includes(x)) : false),
};
export const ACHIEVEMENT_OPS = Object.keys(OPS);

export class AchievementSystem {
  constructor({ bus = null, defs = [], facts, pay = () => {}, now = () => ({}) }) {
    this.bus = bus;
    this.defs = defs;
    this.byId = Object.fromEntries(defs.map((d) => [d.id, d]));
    this.facts = facts;
    this.pay = pay; // (reward line, def) → pays one reward line into the current run
    this.now = now; // () → { day, year, runId }
    this.index = new Map();
    for (const d of defs) for (const ev of d.triggerEvents ?? []) (this.index.get(ev) ?? this.index.set(ev, []).get(ev)).push(d);
    this.stats = { checks: 0, payouts: 0 };
    this.load(null);
  }

  get count() {
    return Object.keys(this.account.unlocked).length;
  }

  isUnlocked(id) {
    return !!this.account.unlocked[id];
  }

  get unseen() {
    return this.defs.filter((d) => this.account.unlocked[d.id] && !this.account.seen[d.id]).length;
  }

  markAllSeen() {
    for (const id of Object.keys(this.account.unlocked)) this.account.seen[id] = true;
  }

  // One condition (or an all / any group) → true / false.
  met(cond) {
    if (!cond) return false;
    if (cond.all) return cond.all.every((c) => this.met(c));
    if (cond.any) return cond.any.some((c) => this.met(c));
    const v = this.facts.get(cond.fact);
    return v !== undefined && (OPS[cond.op]?.(v, cond.value) ?? false);
  }

  // A count-style achievement's bar: { value, target, frac } (value capped at target), or null.
  progress(def) {
    if (!def?.progress) return null;
    const target = def.progress.target;
    if (this.isUnlocked(def.id)) return { value: target, target, frac: 1 };
    const raw = this.facts.get(def.progress.fact);
    const n = Array.isArray(raw) ? raw.length : Number(raw) || 0;
    const value = Math.min(target, Math.max(0, Math.floor(n)));
    return { value, target, frac: target ? value / target : 0 };
  }

  // A trigger event happened: only the achievements indexed under it are checked. Returns the ones unlocked now.
  notify(event) {
    return this._check(this.index.get(event) ?? []);
  }

  // Everything at once (after a load, so a run from before achievements catches up).
  checkAll() {
    return this._check(this.defs);
  }

  _check(list) {
    const out = [];
    for (const d of list) {
      if (this.isUnlocked(d.id)) continue;
      this.stats.checks++;
      if (this.met(d.requires)) out.push(this.unlock(d.id));
    }
    return out.filter(Boolean);
  }

  // Unlock (also used by tests / debug). Idempotent: a second call does nothing and pays nothing.
  unlock(id) {
    const def = this.byId[id];
    if (!def || this.isUnlocked(id)) return null;
    const when = this.now();
    this.account.unlocked[id] = { ...when };
    let paidNow = false;
    if (!this.account.paid[id]) {
      this.account.paid[id] = true; // first: even if pay() throws or re-enters, it can't pay twice
      for (const r of def.reward ?? []) this.pay(r, def);
      this.stats.payouts++;
      paidNow = true;
    }
    const res = { def, when, paidNow };
    this.bus?.emit('achievement:unlocked', res);
    return res;
  }

  serialize() {
    return JSON.parse(JSON.stringify(this.account));
  }

  // Merges with what is already held, so an older copy can never take an achievement or a payment back.
  load(data) {
    const cur = this.account ?? { unlocked: {}, paid: {}, seen: {} };
    const d = data ? JSON.parse(JSON.stringify(data)) : {};
    this.account = {
      unlocked: { ...(d.unlocked ?? {}), ...cur.unlocked },
      paid: { ...(d.paid ?? {}), ...cur.paid },
      seen: { ...(d.seen ?? {}), ...cur.seen },
    };
  }

  // A fresh account (tests only).
  resetAccount() {
    this.account = { unlocked: {}, paid: {}, seen: {} };
  }
}
