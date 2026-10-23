// Game events as data (any game): a supplier discount, a rush order, a big milestone moment.
//
// A definition (plain data, no code):
//   { id, kind: 'milestone' | 'choice' | 'flavour',
//     trigger: rule | null,         the game says when it holds (hooks.conditionMet); milestones are fired by the game
//     weight, cooldownDays, once,    how often it is picked (repeatable kinds only)
//     effects: [effect],             applied the moment it happens (flavour, milestone, and "auto" parts of a choice)
//     choices: [{ id, label, effects, default }],   choice events: the player picks one (default = picked if it folds)
//     ...anything else the game shows (title, text, art, icon) }
//
// Cadence (bible §24.3): classes and their gaps, e.g. { choice: 14, flavour: 5 } = at most one choice event per 14
// days and one flavour note per 5 days. Milestone events ignore the caps.
// Seeded (bible §24.2): each game day, for each class whose gap has passed, ONE roll of the event stream decides
// whether an event happens today, then a seeded weighted pick among the definitions whose trigger holds. At that
// moment every random number the event will ever need is rolled and stored on it: its setup (hooks.setup — e.g.
// which worker), each effect's numbers (hooks.resolve) and the outcome of every choice ('chance' effects are decided
// here). The stream's state is saved, so a reload replays the same days the same way, and a stored event keeps its
// numbers and outcomes — reloading can never reroll a committed result.
//
// Effects are data. Two kinds are handled here:
//   { type: 'modifier', key, value, days }   a timed bonus/penalty: total(key) sums the ones still running (the game
//                                            adds it to its shared effect query)
//   { type: 'chance', p, then: [..], else: [..] }   decided when the event is created
// Every other effect goes to hooks.apply(effect, instance).
//
// hooks: conditionMet(rule, def) → bool;  setup(instance, def, rng) → params;  resolve(effect, instance, rng) → effect
//        apply(effect, instance)
// Emits 'event:fired' ({ instance, def }) and 'event:resolved' ({ instance, def, choice, auto }).
export class EventSystem {
  constructor({ bus = null, rng, defs = [], caps = { choice: 14, flavour: 5 }, rules = {}, hooks = {}, keepLog = 60 }) {
    this.bus = bus;
    this.rng = rng;
    this.defs = defs;
    this.byId = Object.fromEntries(defs.map((d) => [d.id, d]));
    this.caps = caps; // class → minimum days between two events of that class
    this.rules = { startDay: 0, dailyChance: {}, maxOpen: 3, ...rules }; // dailyChance: class → chance on an allowed day
    this.hooks = hooks;
    this.keepLog = keepLog;
    this.reset();
  }

  reset(day = 0) {
    this.state = {
      last: Object.fromEntries(Object.keys(this.caps).map((c) => [c, null])), // day of the last event of each class
      lastOf: {}, // def id → day it last happened
      count: {}, // def id → times it has happened
      open: [], // choice events waiting for the player
      log: [], // resolved events, newest last (capped)
      modifiers: [], // { key, value, untilDay, source }
      nextUid: 1,
      startDay: day,
    };
  }

  get open() {
    return this.state.open;
  }

  get log() {
    return this.state.log;
  }

  instance(uid) {
    return this.state.open.find((e) => e.uid === uid) ?? this.state.log.find((e) => e.uid === uid) ?? null;
  }

  seen(id) {
    return (this.state.count[id] ?? 0) > 0;
  }

  // Sum of the timed modifiers still running for this key.
  total(key) {
    let t = 0;
    for (const m of this.state.modifiers) if (m.key === key) t += m.value;
    return t;
  }

  // Can this definition be picked today? (repeatable kinds)
  eligible(def, day) {
    if (def.kind === 'milestone') return false;
    if (def.once && this.seen(def.id)) return false;
    const last = this.state.lastOf[def.id];
    if (last != null && def.cooldownDays && day - last < def.cooldownDays) return false;
    if (def.kind === 'choice' && this.state.open.some((e) => e.id === def.id)) return false; // same question not twice at once
    return !def.trigger || !!this.hooks.conditionMet?.(def.trigger, def);
  }

  // Once per game day.
  dailyTick(day) {
    const st = this.state;
    st.modifiers = st.modifiers.filter((m) => m.untilDay >= day);
    const fired = [];
    if (day < st.startDay + this.rules.startDay) return fired;
    for (const cls of Object.keys(this.caps)) {
      const last = st.last[cls];
      if (last != null && day - last < this.caps[cls]) continue;
      if (cls === 'choice' && st.open.length >= this.rules.maxOpen) continue;
      // The day's roll is made whether or not anything can happen, so the stream moves the same way every run.
      const hit = this.rng.next() < (this.rules.dailyChance[cls] ?? 0.2);
      if (!hit) continue;
      const pool = this.defs.filter((d) => d.kind === cls && this.eligible(d, day));
      const def = this._weighted(pool);
      if (def) fired.push(this.fire(def.id, day));
    }
    return fired.filter(Boolean);
  }

  _weighted(pool) {
    const total = pool.reduce((t, d) => t + (d.weight ?? 1), 0);
    if (!pool.length || total <= 0) return null;
    let r = this.rng.next() * total;
    for (const d of pool) {
      r -= d.weight ?? 1;
      if (r < 0) return d;
    }
    return pool[pool.length - 1];
  }

  // A milestone moment (ignores the caps; each happens once). params: extra words for the game to show.
  milestone(id, day, params = {}) {
    const def = this.byId[id];
    if (!def || def.kind !== 'milestone' || this.seen(id)) return null;
    return this.fire(id, day, params);
  }

  // Make an event happen now: roll everything it needs, apply its immediate effects, store it.
  fire(id, day, params = {}) {
    const def = this.byId[id];
    if (!def) return null;
    const st = this.state;
    const inst = { uid: st.nextUid++, id, kind: def.kind, day, params: { ...params }, effects: [], choices: null, status: 'resolved', choice: null };
    Object.assign(inst.params, this.hooks.setup?.(inst, def, this.rng) ?? {});
    inst.effects = this._resolveList(def.effects ?? [], inst);
    if (def.kind === 'choice') {
      inst.choices = (def.choices ?? []).map((c) => this._resolveList(c.effects ?? [], inst));
      inst.status = 'open';
    }
    const cls = def.kind === 'milestone' ? null : def.kind;
    if (cls && cls in st.last) st.last[cls] = day;
    st.lastOf[id] = day;
    st.count[id] = (st.count[id] ?? 0) + 1;
    this._applyList(inst.effects, inst, day);
    if (inst.status === 'open') st.open.push(inst);
    else this._log(inst);
    this.bus?.emit('event:fired', { instance: inst, def });
    return inst;
  }

  // The player's answer to a choice event (or the default, when it folds away unanswered).
  choose(uid, choiceIndex = null, { day = 0, auto = false } = {}) {
    const st = this.state;
    const inst = st.open.find((e) => e.uid === uid);
    if (!inst) return null;
    const def = this.byId[inst.id];
    let i = choiceIndex;
    if (i == null || !inst.choices[i]) i = Math.max(0, (def.choices ?? []).findIndex((c) => c.default));
    inst.choice = i;
    inst.auto = auto;
    inst.status = 'resolved';
    inst.resolvedDay = day;
    st.open = st.open.filter((e) => e !== inst);
    this._applyList(inst.choices[i] ?? [], inst, day);
    this._log(inst);
    this.bus?.emit('event:resolved', { instance: inst, def, choice: i, auto });
    return inst;
  }

  _resolveList(list, inst) {
    const out = [];
    for (const e of list) {
      if (e.type === 'chance') {
        const hit = this.rng.next() < e.p;
        out.push({ type: 'chance', p: e.p, hit, then: hit ? this._resolveList(e.then ?? [], inst) : this._resolveList(e.else ?? [], inst) });
      } else out.push(this.hooks.resolve ? this.hooks.resolve(e, inst, this.rng) : { ...e });
    }
    return out;
  }

  _applyList(list, inst, day) {
    for (const e of list) {
      if (e.type === 'chance') this._applyList(e.then, inst, day);
      else if (e.type === 'modifier') this.state.modifiers.push({ key: e.key, value: e.value, untilDay: day + (e.days ?? 1) - 1, source: inst.id });
      else this.hooks.apply?.(e, inst);
    }
  }

  _log(inst) {
    this.state.log.push(inst);
    if (this.state.log.length > this.keepLog) this.state.log.shift();
  }

  serialize() {
    return JSON.parse(JSON.stringify({ rngState: this.rng.getState(), ...this.state }));
  }

  // Returns false when there was nothing saved (the game then starts fresh from today).
  load(data, day = 0) {
    if (!data) {
      this.reset(day);
      return false;
    }
    this.reset(day);
    const { rngState, ...rest } = data;
    this.state = { ...this.state, ...JSON.parse(JSON.stringify(rest)) };
    for (const c of Object.keys(this.caps)) if (!(c in this.state.last)) this.state.last[c] = null;
    if (rngState != null) this.rng.setState(rngState);
    return true;
  }
}
