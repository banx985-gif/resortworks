// Checks game content at start-up in debug builds (bible §41.5) and gives a clear list of problems.
// It never throws: in normal builds a game can still run it and only log, or skip it.
// The game describes its own rules with these helpers; no content lives here.
//   const v = new DataValidator();
//   v.uniqueIds('components', list);                 every item has an id, none repeat
//   v.ref('component CH06', 'facility', 'F21', ids);  a referenced id exists in a known set
//   v.check(ok, 'message');                          any other rule
//   v.noCycles('research', nodes);                   prerequisites (x.requires) have no loops
//   v.art('component CH01', 'path/to.png');          queue an image path to check
//   await v.checkArt();                              fetches every queued path (missing → error)
//   v.report() → { ok, errors, warnings, counts }
export class DataValidator {
  constructor({ fetchFn = (url) => fetch(url, { method: 'HEAD', cache: 'no-store' }) } = {}) {
    this.fetchFn = fetchFn;
    this.errors = [];
    this.warnings = [];
    this.counts = { checks: 0, ids: 0, refs: 0, art: 0 };
    this._art = []; // { owner, path, placeholder }
  }

  error(msg) {
    this.errors.push(msg);
  }

  warn(msg) {
    this.warnings.push(msg);
  }

  check(ok, msg) {
    this.counts.checks++;
    if (!ok) this.errors.push(msg);
    return !!ok;
  }

  // Every item has a non-empty id and no id is used twice. Returns the Set of ids.
  uniqueIds(label, items, idOf = (x) => x.id) {
    const seen = new Set();
    for (const item of items) {
      const id = idOf(item);
      this.counts.ids++;
      if (id === undefined || id === null || id === '') this.error(`${label}: an item has no id`);
      else if (seen.has(id)) this.error(`${label}: id "${id}" is used more than once`);
      else seen.add(id);
    }
    return seen;
  }

  // Object keys must match each value's own id field (e.g. COMPONENTS.CH01.id === 'CH01').
  keysMatchIds(label, map, idField = 'id') {
    for (const [key, v] of Object.entries(map)) this.check(v?.[idField] === key, `${label}: key "${key}" holds id "${v?.[idField]}"`);
  }

  ref(owner, kind, id, known) {
    this.counts.refs++;
    return this.check(known.has(id), `${owner}: unknown ${kind} "${id}"`);
  }

  // A tree or graph of prerequisites must have no loops (A needs B needs … needs A) and no unknown ids.
  // depsOf(item) → ids it needs. Returns true when there are no loops.
  noCycles(label, items, idOf = (x) => x.id, depsOf = (x) => x.requires ?? []) {
    const byId = new Map(items.map((x) => [idOf(x), x]));
    const state = new Map(); // id → 1 visiting, 2 done
    let ok = true;
    const visit = (id, path) => {
      if (state.get(id) === 2) return;
      if (state.get(id) === 1) {
        ok = false;
        this.error(`${label}: loop ${[...path.slice(path.indexOf(id)), id].join(' → ')}`);
        return;
      }
      state.set(id, 1);
      for (const d of depsOf(byId.get(id))) {
        if (this.ref(`${label} ${id}`, 'prerequisite', d, byId)) visit(d, [...path, id]);
      }
      state.set(id, 2);
    };
    for (const id of byId.keys()) visit(id, []);
    this.counts.checks++;
    return ok;
  }

  // A staff roster (people with roles, tiers, stats and traits — any game's). Checks: every id unique, known
  // role and tier, every work stat present and within the tier's cap, traits exist, trait count fits the tier
  // (traitSlots normal traits, plus exactly one signature trait when the tier has `signature`), art exists.
  //   opts: { roles, tiers, traits, statKeys, artPath(person) → path }
  // Returns the Set of ids.
  staffRoster(label, list, { roles, tiers, traits, statKeys, artPath = null }) {
    const ids = this.uniqueIds(label, list);
    const roleSet = new Set(Object.keys(roles));
    const tierSet = new Set(Object.keys(tiers));
    const traitSet = new Set(Object.keys(traits));
    for (const p of list) {
      const o = `${label} ${p.id}`;
      this.ref(o, 'role', p.role, roleSet);
      const tier = this.ref(o, 'tier', p.tier, tierSet) ? tiers[p.tier] : null;
      for (const k of statKeys) {
        const v = p.stats?.[k];
        if (!this.check(Number.isInteger(v) && v >= 1, `${o}: starting ${k} "${v}" is not a whole number of 1 or more`)) continue;
        if (tier) this.check(v <= tier.statCap, `${o}: starting ${k} ${v} is over the ${p.tier} cap of ${tier.statCap}`);
      }
      for (const k of Object.keys(p.stats ?? {})) this.check(statKeys.includes(k), `${o}: unknown stat "${k}"`);
      const own = p.traits ?? [];
      for (const t of own) this.ref(o, 'trait', t, traitSet);
      this.check(new Set(own).size === own.length, `${o}: a trait is listed twice`);
      if (tier) {
        const sigs = own.filter((t) => traits[t]?.signature).length;
        this.check(sigs === (tier.signature ? 1 : 0), `${o}: ${tier.signature ? 'needs exactly one' : 'may not have a'} signature trait (has ${sigs})`);
        this.check(own.length - sigs >= 1 && own.length - sigs <= tier.traitSlots, `${o}: ${own.length - sigs} normal traits, the ${p.tier} tier allows 1–${tier.traitSlots}`);
      }
      if (artPath) this.art(o, artPath(p));
    }
    return ids;
  }

  // placeholder: true means "no art yet, drawn as a placeholder on purpose" — reported as a warning, not an error.
  art(owner, path, { placeholder = false } = {}) {
    this._art.push({ owner, path, placeholder });
  }

  async checkArt({ concurrency = 12 } = {}) {
    const queue = [...new Map(this._art.map((a) => [a.path, a])).values()];
    let i = 0;
    const worker = async () => {
      while (i < queue.length) {
        const a = queue[i++];
        this.counts.art++;
        let ok = false;
        try {
          const res = await this.fetchFn(a.path);
          ok = res.ok;
        } catch {
          ok = false;
        }
        if (!ok && a.placeholder) this.warn(`${a.owner}: art "${a.path}" missing (placeholder flagged)`);
        else if (!ok) this.error(`${a.owner}: art file not found "${a.path}"`);
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
  }

  report() {
    return { ok: this.errors.length === 0, errors: [...this.errors], warnings: [...this.warnings], counts: { ...this.counts } };
  }
}
