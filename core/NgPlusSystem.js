// New Game+ (any series game, bible §30 pattern): after a finished campaign the player starts a fresh one and keeps
// some progress. This file owns the rules of that hand-over; the game owns what its fields mean.
//
//   new NgPlusSystem({ rules })
//   rules (plain data from the game):
//     maxLevel                   the last content level (Robot Workshop: 3). Later runs stay on maxLevel rules.
//     fields: { always: [{ id, label }], chosen: [{ id, label }], reset: [{ id, label }] }
//       always   copied into the new run every time (account-level things)
//       chosen   copied only as the player picks them (Legacy Staff, blueprints, a challenge…)
//       reset    named on purpose so nothing is forgotten, and never copied
//       A field that is in none of the lists can't survive: transition() refuses a snapshot that has one.
//     legacy: { picksByLevel: [n at level 0, 1, 2, 3…], startLevel, statPct, historyTiers: [tier] }
//       historyTiers: tiers that may only be picked if the account has hired that person before
//     blueprints: { perLevel, max } or { byLevel: [n at level 0, 1, 2, 3…] }
//     advantages: { perRun: { key: amount }, maxRuns }     automatic, stacked per completed run up to maxRuns
//     modifiers: [{ id, name, … }]                          optional challenges; at most one per run
//
//   levelAfter(level)        the level of the next run (capped)
//   picks('legacy' | 'blueprints', level)
//   advantages(level)        { key: amount × min(level, maxRuns) }
//   legacyStats(stats, floor, caps)   statPct of the old stats, never below floor, never above the cap
//   checkChoices(choices, options, level) → [problem text]   (empty = fine)
//   transition({ snapshot, choices, level }) → the carry package the game builds its new run from:
//     { level, always: { id: value }, chosen: { id: value }, reset: [id], advantages, modifier }
export class NgPlusSystem {
  constructor({ rules }) {
    this.rules = rules;
    const f = rules.fields ?? {};
    this.always = (f.always ?? []).map((x) => x.id);
    this.chosen = (f.chosen ?? []).map((x) => x.id);
    this.reset = (f.reset ?? []).map((x) => x.id);
    const all = [...this.always, ...this.chosen, ...this.reset];
    const twice = all.filter((id, i) => all.indexOf(id) !== i);
    if (twice.length) throw new Error(`NgPlusSystem: field listed twice: ${[...new Set(twice)].join(', ')}`);
    this.declared = new Set(all);
  }

  get maxLevel() {
    return this.rules.maxLevel ?? 3;
  }

  levelAfter(level = 0) {
    return Math.min(this.maxLevel, Math.max(0, level) + 1);
  }

  picks(kind, level) {
    if (kind === 'legacy') {
      const list = this.rules.legacy?.picksByLevel ?? [];
      return list[Math.min(level, list.length - 1)] ?? 0;
    }
    if (kind === 'blueprints') {
      const b = this.rules.blueprints ?? { perLevel: 0, max: 0 };
      if (b.byLevel) return b.byLevel[Math.min(level, b.byLevel.length - 1)] ?? 0; // DEVWORKS: an exact count per level
      return Math.min(b.max, b.perLevel * level);
    }
    return 0;
  }

  advantages(level) {
    const a = this.rules.advantages ?? { perRun: {}, maxRuns: 0 };
    const runs = Math.min(Math.max(0, level), a.maxRuns);
    return Object.fromEntries(Object.entries(a.perRun).map(([k, v]) => [k, v * runs]));
  }

  modifier(id) {
    return (this.rules.modifiers ?? []).find((m) => m.id === id) ?? null;
  }

  // A Legacy worker's stats: statPct of what they had, clamped to at least `floor` (their normal starting stats) and
  // at most their cap (caps: { key: n } or one number).
  legacyStats(stats, floor = {}, caps = Infinity) {
    const pct = (this.rules.legacy?.statPct ?? 100) / 100;
    const out = {};
    for (const [k, v] of Object.entries(stats)) {
      const cap = typeof caps === 'object' ? caps[k] ?? Infinity : caps;
      out[k] = Math.min(cap, Math.max(floor[k] ?? 0, Math.round(v * pct)));
    }
    return out;
  }

  // options: { legacy: [{ id, tier, everHired }], blueprints: [{ id }] } — what the player could pick from.
  checkChoices(choices = {}, options = {}, level = 1) {
    const out = [];
    const legacy = choices.legacyStaff ?? [];
    const blue = choices.blueprints ?? [];
    if (new Set(legacy).size !== legacy.length) out.push('A Legacy worker is picked twice');
    if (legacy.length > this.picks('legacy', level)) out.push(`Only ${this.picks('legacy', level)} Legacy Staff at NG+${level}`);
    const byId = Object.fromEntries((options.legacy ?? []).map((o) => [o.id, o]));
    const needHistory = new Set(this.rules.legacy?.historyTiers ?? []);
    for (const id of legacy) {
      const o = byId[id];
      if (!o) out.push(`${id} can't be a Legacy worker`);
      else if (needHistory.has(o.tier) && !o.everHired) out.push(`${id} was never hired`);
    }
    if (new Set(blue).size !== blue.length) out.push('A blueprint is picked twice');
    if (blue.length > this.picks('blueprints', level)) out.push(`Only ${this.picks('blueprints', level)} blueprints at NG+${level}`);
    const blueIds = new Set((options.blueprints ?? []).map((o) => o.id));
    for (const id of blue) if (!blueIds.has(id)) out.push(`Unknown blueprint ${id}`);
    if (choices.modifier && !this.modifier(choices.modifier)) out.push(`Unknown challenge ${choices.modifier}`);
    return out;
  }

  // snapshot: { fieldId: value } for EVERY declared field (always, chosen sources and reset ones), taken from the
  // finished run and the account. Only always + chosen values are handed on; reset ones are listed, not copied.
  transition({ snapshot, choices = {}, level }) {
    const keys = Object.keys(snapshot);
    const extra = keys.filter((k) => !this.declared.has(k));
    if (extra.length) throw new Error(`NgPlusSystem: not declared as carried or reset: ${extra.join(', ')}`);
    const missing = [...this.declared].filter((k) => !(k in snapshot));
    if (missing.length) throw new Error(`NgPlusSystem: snapshot is missing: ${missing.join(', ')}`);
    const copy = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
    const always = Object.fromEntries(this.always.map((k) => [k, copy(snapshot[k])]));
    // Chosen fields: the snapshot holds everything the player could pick; only the picks go on.
    const chosen = {};
    for (const k of this.chosen) {
      const pool = snapshot[k];
      const pick = choices[k];
      if (Array.isArray(pool)) {
        const want = new Set(pick ?? []);
        chosen[k] = copy(pool.filter((x) => want.has(x.id)));
      } else chosen[k] = pick != null && pool && typeof pool === 'object' && pick in pool ? copy(pool[pick]) : pick ?? null;
    }
    return { level, always, chosen, reset: [...this.reset], advantages: this.advantages(level), modifier: choices.modifier ?? null };
  }
}
