// Combos as data: a rule is a list of conditions; when every condition holds the rule is active.
// One loop checks every rule the same way — there is no code per combo. Also reports every rule that is
// exactly ONE condition short ("near"), so the game can show a hint.
//
// A rule (plain data):  { id, conditions: [cond, …], locked?: true }
//   locked: never checked at all (a secret combo whose conditions arrive later): never active, never near.
//
// Conditions (every kind a game may use):
//   { kind: 'purpose', any: ['a', 'b'] }               the build's type is one of these
//   { kind: 'part', any: ['P1', 'P2'] }                one of these exact parts is used
//   { kind: 'tag', tag: 't', min = 1 }                 at least min parts carry this tag
//   { kind: 'partCount', min, minCx, exceptSlots }     at least min parts (outside these slots) with complexity ≥ minCx
//   { kind: 'stat', stat: 'KEY', min }                 ctx.stats[KEY] ≥ min (a stat not known yet counts as not met)
//   { kind: 'staff', role?, trait? }                   someone on the team has this role / trait
//   { kind: 'discovered', key }                        hooks.discovered(key) — a prior discovery flag
//   { kind: 'ngPlus', min }                            ctx.ngPlus ≥ min
//   { kind: 'rule', rule }                             hooks.ruleMet(rule) — any rule the game understands (rank, flags…)
//
// ctx: { purpose, parts: [{ id, slot, cx, tags }], stats: { KEY: n }, team: [{ role, traits }], ngPlus }
// hooks: { discovered(key) → bool, ruleMet(rule) → bool }

export function conditionMet(cond, ctx, hooks = {}) {
  const parts = ctx.parts ?? [];
  switch (cond.kind) {
    case 'purpose':
      return cond.any.includes(ctx.purpose);
    case 'part':
      return parts.some((p) => cond.any.includes(p.id));
    case 'tag':
      return parts.filter((p) => p.tags?.includes(cond.tag)).length >= (cond.min ?? 1);
    case 'partCount': {
      const except = cond.exceptSlots ?? [];
      return parts.filter((p) => !except.includes(p.slot) && p.cx >= (cond.minCx ?? 0)).length >= cond.min;
    }
    case 'stat': {
      const v = ctx.stats?.[cond.stat];
      return typeof v === 'number' && v >= cond.min;
    }
    case 'staff':
      return (ctx.team ?? []).some((s) => (!cond.role || s.role === cond.role) && (!cond.trait || s.traits?.includes(cond.trait)));
    case 'discovered':
      return !!hooks.discovered?.(cond.key);
    case 'ngPlus':
      return (ctx.ngPlus ?? 0) >= cond.min;
    case 'rule':
      return !!hooks.ruleMet?.(cond.rule);
    default:
      return false;
  }
}

// Which conditions of one rule are missing (empty = the rule is active).
export function missingConditions(rule, ctx, hooks) {
  return rule.conditions.filter((c) => !conditionMet(c, ctx, hooks));
}

// Every rule checked once. Returns { active: [rule], near: [{ rule, missing: cond }] } in the rules' order.
export function evaluateRules(rules, ctx, hooks = {}) {
  const active = [];
  const near = [];
  for (const rule of rules) {
    if (rule.locked) continue;
    const missing = missingConditions(rule, ctx, hooks);
    if (!missing.length) active.push(rule);
    else if (missing.length === 1) near.push({ rule, missing: missing[0] });
  }
  return { active, near };
}
