// Secret condition engine (bible §28, §30.4a, §42.4) — any series game can have secrets.
//
// A rule (plain data, no code):
//   { id, name, category, ngPlusMin,
//     triggerEvents: ['projectFinished', …],     the only moments the rule is checked (trigger-event indexing)
//     requiresAll: [cond], requiresAny: [cond], forbids: [cond],
//     oncePerRun | oncePerAccount,               once per run (repeats in later runs, eased) or once ever
//     clueStages: [{ text, minMet }, { text, minMet: 'allButOne' }],
//     rewardActions: [action] }
// A condition:
//   { fact, op, value, kind: 'count' | 'threshold' | 'fixed', category, label }
//     ops: eq, neq, gt, gte, lt, lte, in (fact is one of value), has (fact list contains value)
//   { fact, op: 'countOf', where: [{ field, op, value }], value, kind }   how many items of a list fact match
//     every `where` test (field = a path inside each item) — needs at least `value` (or cmp: 'eq' / 'lte' …).
//     A `where` test can carry its own kind (e.g. "250 units" inside "a robot that sold 250 units") and is eased
//     the same way; by: 'field' counts distinct values of that field instead (e.g. "across 2 purposes").
//   { all: [cond] }  "all of these happened"      { any: [cond] }  "any of these"
// Added for DEVWORKS (Milestone 28), all optional:
//   op 'between', value [lo, hi]                     a number inside a range, both ends included (a year range)
//   { fact, op: 'consecutive', where, value }        the longest unbroken run of items in a list fact that pass every
//     `where` test must reach `value` (e.g. 3 games in a row reviewed 80+; 6 months in a row in profit)
//   { fact, op: 'sequence', value: [a, b, …] }       a list fact holds these values in this order (others may come
//     between): an ordered history
//   clue stage minMet: { share: 0.9 }                 reached when that share of the rule's conditions is done
// Added for RACEWORKS (Milestone 24), all optional:
//   { fact, op: 'sameAcross', field, where, value }  staff continuity: of the items in a list fact (that pass every
//     `where` test), the most that share one member of their list `field` (e.g. one person in 3 race crews)
//   new SecretEngine({ discoveredStage: 4 })        the clue stage a found rule reports (default 3: clues 1–2, found 3)
// Facts are read by name only, from a registry the game fills (FactRegistry below): run facts, account facts,
// and the trigger event's own payload. An unknown fact is simply not met.
//
// Repeat easing (§30.4a): once a rule is in the account history (earned in any earlier run), later runs check an
// eased version — count conditions halved (rounded up), threshold conditions 15% in the player's favour (≥ / >
// lowered, rounded down to the value's precision; ≤ / < raised, rounded up), fixed ones unchanged. On a repeat,
// currency rewards (the `currencyTypes`) are not paid again, and an action's `repeat: { … }` fields replace its own
// (e.g. a longer arrival window).
// Clue stages (§28.1): 0 nothing · 1 a rumour · 2 names the category of the missing condition · 3 unlocked (exact
// conditions from then on, forever, from the account history).
// Rewards run once: a rule unlocks at most once per run (once ever for oncePerAccount), and its actions go through
// the game's unlock-action runner, which never fires the same (type, id) twice.
// Emits 'secret:unlocked' ({ rule, eased, actions }), 'secret:clue' ({ rule, stage }).
export class FactRegistry {
  constructor() {
    this.exact = new Map(); // name → (ctx) => value
    this.groups = []; // [prefix, (rest, ctx) => value], longest prefix first
  }

  define(name, fn) {
    this.exact.set(name, fn);
    return this;
  }

  // Every fact named "prefix.something" is answered by fn('something', ctx).
  defineGroup(prefix, fn) {
    this.groups.push([`${prefix}.`, fn]);
    this.groups.sort((a, b) => b[0].length - a[0].length);
    return this;
  }

  has(name) {
    return this.exact.has(name) || this.groups.some(([p]) => name.startsWith(p));
  }

  get(name, ctx = {}) {
    try {
      const fn = this.exact.get(name);
      if (fn) return fn(ctx);
      for (const [p, g] of this.groups) if (name.startsWith(p)) return g(name.slice(p.length), ctx);
    } catch {
      return undefined;
    }
    return undefined;
  }

  get names() {
    return [...this.exact.keys(), ...this.groups.map(([p]) => `${p}*`)];
  }
}

// A path inside an object: "result.stats.INT".
export function readPath(obj, path) {
  if (!path) return obj;
  let v = obj;
  for (const k of String(path).split('.')) {
    if (v == null) return undefined;
    v = v[k];
  }
  return v;
}

const OPS = {
  eq: (a, b) => a === b,
  neq: (a, b) => a !== b,
  gt: (a, b) => typeof a === 'number' && a > b,
  gte: (a, b) => typeof a === 'number' && a >= b,
  lt: (a, b) => typeof a === 'number' && a < b,
  lte: (a, b) => typeof a === 'number' && a <= b,
  in: (a, b) => Array.isArray(b) && b.includes(a),
  has: (a, b) => (Array.isArray(a) || a instanceof Set ? [...a].includes(b) : !!a && typeof a === 'object' && b in a),
  between: (a, b) => typeof a === 'number' && Array.isArray(b) && a >= b[0] && a <= b[1],
};
// Longest unbroken run of items passing every test.
function longestRun(list, test) {
  let best = 0;
  let cur = 0;
  for (const item of list) {
    cur = test(item) ? cur + 1 : 0;
    best = Math.max(best, cur);
  }
  return best;
}
// How many of `want` appear in `list` in order (the first k of them).
function inOrder(list, want) {
  let k = 0;
  for (const item of list) if (k < want.length && item === want[k]) k++;
  return k;
}
export const SECRET_OPS = [...Object.keys(OPS), 'countOf', 'consecutive', 'sequence', 'sameAcross'];

// Rounding precision for an eased threshold: the condition's own `precision`, else the value's decimals — with at
// least one decimal for small "at least" scales (a 9.0 review → 7.6, not 7; Quality 85 → 72).
const decimals = (v) => Math.max(Math.abs(v) < 10 ? 1 : 0, Number.isInteger(v) ? 0 : String(v).split('.')[1]?.length ?? 0);
const ownDecimals = (v) => (Number.isInteger(v) ? 0 : String(v).split('.')[1]?.length ?? 0);
const floorTo = (v, d) => Math.floor(v * 10 ** d + 1e-9) / 10 ** d;
const ceilTo = (v, d) => Math.ceil(v * 10 ** d - 1e-9) / 10 ** d;

// The eased needed value for one condition (§30.4a). kind defaults to 'fixed'.
export function easeValue(cond, rules = { countFactor: 0.5, thresholdPct: 15 }) {
  const v = cond.value;
  if (typeof v !== 'number') return v;
  const op = cond.op === 'countOf' || cond.op === 'consecutive' ? cond.cmp ?? 'gte' : cond.op;
  if (cond.kind === 'count') return op === 'lt' || op === 'lte' ? v : Math.ceil(v * rules.countFactor);
  if (cond.kind === 'threshold') {
    const d = cond.precision ?? decimals(v);
    if (op === 'gte' || op === 'gt') return floorTo(v * (1 - rules.thresholdPct / 100), d);
    if (op === 'lte' || op === 'lt') return ceilTo(v * (1 + rules.thresholdPct / 100), cond.precision ?? ownDecimals(v)); // an "at most" loosens upwards
  }
  return v;
}

export class SecretEngine {
  constructor({ bus = null, rules = [], facts = new FactRegistry(), runner = null, ngPlus = () => 0, currencyTypes = ['currency'], easing = { countFactor: 0.5, thresholdPct: 15 }, now = () => ({}), discoveredStage = 3 }) {
    this.discoveredStage = discoveredStage;
    this.bus = bus;
    this.rules = rules;
    this.byId = Object.fromEntries(rules.map((r) => [r.id, r]));
    this.facts = facts;
    this.runner = runner; // the game's unlock-action runner (core/UnlockActions.js)
    this.ngPlus = ngPlus;
    this.currencyTypes = new Set(currencyTypes);
    this.easing = easing;
    this.now = now; // () → { day, year, runId } for the records
    // Trigger-event index: event → rules that care about it. Nothing else ever checks a rule.
    this.index = new Map();
    for (const r of rules) for (const ev of r.triggerEvents ?? []) (this.index.get(ev) ?? this.index.set(ev, []).get(ev)).push(r);
    this.account = { history: {}, facts: {}, flags: {} }; // flags: account-wide switches a reward can set
    this.resetRun();
  }

  resetRun() {
    this.run = { unlocked: {}, clues: {} };
    this.stats = { notifications: 0, checks: 0, byEvent: {}, byRule: {} }; // how often rules were looked at (tests)
  }

  get triggerEvents() {
    return [...this.index.keys()];
  }

  // --- status ---
  unlockedInRun(id) {
    return !!this.run.unlocked[id];
  }

  // Earned in any run (this one included).
  everUnlocked(id) {
    return !!this.account.history[id] || this.unlockedInRun(id);
  }

  // Earned in an EARLIER run: this run checks the eased version (§30.4a).
  isRepeat(id) {
    const h = this.account.history[id];
    return !!h && h.runs.some((r) => r !== this.now().runId);
  }

  clueStage(id) {
    return this.unlockedInRun(id) || this.account.history[id] ? this.discoveredStage : this.run.clues[id] ?? 0;
  }

  // Would the rule still be looked at on its events?
  open(rule) {
    if (this.unlockedInRun(rule.id)) return false;
    if (rule.oncePerAccount && this.account.history[rule.id]) return false;
    return (this.ngPlus() ?? 0) >= (rule.ngPlusMin ?? 0);
  }

  // --- account facts (§30.4a history + "across all runs" facts) ---
  // Each run reports its own value (set, never added), so reloading an older run save can't count anything twice.
  // A number fact sums over runs; a list fact is the union.
  setRunFact(name, value, runId = this.now().runId) {
    (this.account.facts[name] ||= {})[runId] = Array.isArray(value) ? [...new Set(value)] : value;
  }

  accountFact(name) {
    const per = this.account.facts[name];
    if (!per) return undefined;
    const vals = Object.values(per);
    if (vals.some(Array.isArray)) return [...new Set(vals.flatMap((v) => (Array.isArray(v) ? v : [])))];
    return vals.reduce((t, v) => t + (Number(v) || 0), 0);
  }

  // --- evaluation ---
  // One condition → { ok, value, need, base, eased, missingCategory }
  evalCond(cond, ctx, eased) {
    if (cond.all || cond.any) {
      const list = cond.all ?? cond.any;
      const parts = list.map((c) => this.evalCond(c, ctx, eased));
      const ok = cond.all ? parts.every((p) => p.ok) : parts.some((p) => p.ok);
      const partial = cond.all ? parts.reduce((t, p) => t + p.partial, 0) / (parts.length || 1) : Math.max(0, ...parts.map((p) => p.partial));
      return { cond, ok, parts, group: cond.all ? 'all' : 'any', partial };
    }
    const need = eased ? easeValue(cond, this.easing) : cond.value;
    let value = this.facts.get(cond.fact, ctx);
    let ok;
    let whereNeeds = [];
    let bestNear = 0;
    if (cond.op === 'countOf') {
      const list = value == null ? [] : Array.isArray(value) ? value : Object.values(value);
      const where = (cond.where ?? []).map((w) => ({ ...w, need: eased ? easeValue(w, this.easing) : w.value }));
      const hits = list.filter((item) => where.every((w) => OPS[w.op]?.(readPath(item, w.field), w.need) ?? false));
      // Clue progress: how close the nearest item that doesn't count yet is (its share of the tests it passes).
      const near = list.filter((item) => !hits.includes(item));
      bestNear = where.length ? Math.max(0, ...near.map((item) => where.filter((w) => OPS[w.op]?.(readPath(item, w.field), w.need)).length / where.length)) : 0;
      value = cond.by ? new Set(hits.map((item) => readPath(item, cond.by))).size : hits.length;
      if (eased) whereNeeds = where.filter((w) => w.need !== w.value).map((w) => ({ field: w.field, need: w.need, base: w.value }));
      ok = OPS[cond.cmp ?? 'gte'](value, need);
    } else if (cond.op === 'consecutive') {
      const list = value == null ? [] : Array.isArray(value) ? value : Object.values(value);
      const where = (cond.where ?? []).map((w) => ({ ...w, need: eased ? easeValue(w, this.easing) : w.value }));
      value = longestRun(list, (item) => where.every((w) => OPS[w.op]?.(readPath(item, w.field), w.need) ?? false));
      ok = OPS[cond.cmp ?? 'gte'](value, need);
    } else if (cond.op === 'sameAcross') {
      const list = value == null ? [] : Array.isArray(value) ? value : Object.values(value);
      const where = (cond.where ?? []).map((w) => ({ ...w, need: eased ? easeValue(w, this.easing) : w.value }));
      const counts = new Map();
      for (const item of list) {
        if (!where.every((w) => OPS[w.op]?.(readPath(item, w.field), w.need) ?? false)) continue;
        for (const m of new Set([].concat(readPath(item, cond.field) ?? []))) counts.set(m, (counts.get(m) ?? 0) + 1);
      }
      value = Math.max(0, ...counts.values());
      ok = OPS[cond.cmp ?? 'gte'](value, need);
    } else if (cond.op === 'sequence') {
      const list = value == null ? [] : Array.isArray(value) ? value : [];
      const want = Array.isArray(need) ? need : [];
      value = inOrder(list, want);
      ok = want.length > 0 && value === want.length;
      if (!ok) bestNear = 0;
      return { cond, ok, value, need: want.length, base: want.length, eased: false, whereNeeds, known: this.facts.has(cond.fact), partial: ok ? 1 : want.length ? Math.min(0.99, value / want.length) : 0 };
    } else ok = value !== undefined && (OPS[cond.op]?.(value, need) ?? false);
    // How far along it is (0–1), for clue stages only: done = 1; a number on its way = its share of the need.
    let partial = ok ? 1 : 0;
    if (!ok && typeof value === 'number' && typeof need === 'number' && need > 0 && ['gte', 'gt', 'countOf', 'consecutive', 'sameAcross'].includes(cond.op)) partial = Math.min(0.99, (value + bestNear) / need);
    return { cond, ok, value, need, base: cond.value, eased: eased && (need !== cond.value || whereNeeds.length > 0), whereNeeds, known: this.facts.has(cond.fact), partial };
  }

  // The whole rule, every condition with its live value (also what the "why not?" inspector shows).
  evaluate(rule, ctx = {}, { eased = this.isRepeat(rule.id) } = {}) {
    const all = (rule.requiresAll ?? []).map((c) => this.evalCond(c, ctx, eased));
    const any = (rule.requiresAny ?? []).map((c) => this.evalCond(c, ctx, eased));
    const forbids = (rule.forbids ?? []).map((c) => this.evalCond(c, ctx, eased));
    const ngNeed = rule.ngPlusMin ?? 0;
    const ng = { value: this.ngPlus() ?? 0, need: ngNeed, ok: (this.ngPlus() ?? 0) >= ngNeed };
    const allOk = all.every((p) => p.ok);
    const anyOk = !any.length || any.some((p) => p.ok);
    const forbidOk = forbids.every((p) => !p.ok);
    const progress = all.reduce((t, p) => t + p.partial, 0) + (any.length ? Math.max(0, ...any.map((p) => p.partial)) : 0);
    return { rule, eased, ng, all, any, forbids, allOk, anyOk, forbidOk, ok: ng.ok && allOk && anyOk && forbidOk, met: all.filter((p) => p.ok).length + (any.length && anyOk ? 1 : 0), total: all.length + (any.length ? 1 : 0), progress };
  }

  // A trigger event happened: check only the rules indexed under it. Returns the rules unlocked now.
  notify(event, payload = {}) {
    const list = this.index.get(event);
    this.stats.notifications++;
    if (!list) return [];
    const ctx = { event, payload };
    const unlocked = [];
    for (const rule of list) {
      if (!this.open(rule)) continue;
      this.stats.checks++;
      this.stats.byEvent[event] = (this.stats.byEvent[event] ?? 0) + 1;
      this.stats.byRule[rule.id] = (this.stats.byRule[rule.id] ?? 0) + 1;
      const res = this.evaluate(rule, ctx);
      if (res.ok) unlocked.push(this.unlock(rule, res));
      else this._clues(rule, res);
    }
    return unlocked.filter(Boolean);
  }

  // Clue stages only ever go up.
  // Progress counts part-way conditions (half the robots needed = 0.5). Stages go in order: stage 1 at minMet
  // (default 1; on a one-condition rule, half way), stage 2 ('allButOne') when all but one are done (a one-condition
  // rule: 80% there). A rule that is fully met unlocks instead.
  _clues(rule, res) {
    const stages = rule.clueStages ?? [];
    let stage = this.run.clues[rule.id] ?? 0;
    for (const [i, s] of stages.entries()) {
      const share = typeof s.minMet === 'object' && s.minMet ? s.minMet.share : null;
      let need = share != null ? res.total * share : s.minMet === 'allButOne' ? res.total - 1 : s.minMet ?? 1;
      if (res.total <= 1 && share == null) need = s.minMet === 'allButOne' ? 0.8 : Math.min(need, 0.5);
      need = Math.max(need, i ? 0.5 : 0);
      if (!(res.progress >= need && res.ng.ok)) break;
      stage = Math.max(stage, i + 1);
    }
    if (stage > (this.run.clues[rule.id] ?? 0)) {
      this.run.clues[rule.id] = stage;
      this.bus?.emit('secret:clue', { rule, stage, missing: this.missingCategories(res) });
    }
  }

  // The categories of the conditions still missing (clue stage 2).
  missingCategories(res) {
    const out = [];
    for (const p of res.all) if (!p.ok) out.push(p.cond.category ?? 'something');
    if (!res.anyOk) out.push(res.any[0]?.cond.category ?? 'something');
    for (const p of res.forbids) if (p.ok) out.push(p.cond.category ?? 'something');
    return [...new Set(out)];
  }

  unlock(rule, res = null) {
    if (this.unlockedInRun(rule.id) || (rule.oncePerAccount && this.account.history[rule.id])) return null;
    const repeat = this.isRepeat(rule.id);
    const when = this.now();
    this.run.unlocked[rule.id] = { ...when, eased: repeat };
    const h = (this.account.history[rule.id] ||= { runs: [], first: when });
    if (!h.runs.includes(when.runId)) h.runs.push(when.runId);
    // Rewards: currency only the first time per account; `repeat` fields apply on a repeat. Keyed per rule so
    // the runner can never fire them twice in a run.
    const actions = (rule.rewardActions ?? [])
      .filter((a) => !(repeat && this.currencyTypes.has(a.type)))
      .map((a) => {
        const { repeat: rep, ...rest } = a;
        return { ...rest, ...(repeat && rep ? rep : {}), id: a.id ?? `${rule.id}:${a.type}`, secret: rule.id };
      });
    const fired = this.runner ? this.runner.run(actions, `secret:${rule.id}`) : actions;
    this.bus?.emit('secret:unlocked', { rule, eased: repeat, actions: fired, result: res });
    return { rule, eased: repeat, actions: fired };
  }

  // --- saves: the run half goes in the campaign save, the account half in the account save ---
  serializeRun() {
    return JSON.parse(JSON.stringify({ ...this.run, stats: this.stats }));
  }

  loadRun(data) {
    this.resetRun();
    if (!data) return false;
    const d = JSON.parse(JSON.stringify(data));
    this.run = { unlocked: d.unlocked ?? {}, clues: d.clues ?? {} };
    if (d.stats) this.stats = { notifications: 0, checks: 0, byEvent: {}, byRule: {}, ...d.stats };
    return true;
  }

  serializeAccount() {
    return JSON.parse(JSON.stringify(this.account));
  }

  loadAccount(data) {
    this.account = { history: {}, facts: {}, flags: {}, ...(data ? JSON.parse(JSON.stringify(data)) : {}) };
    this.account.flags ||= {};
  }
}
