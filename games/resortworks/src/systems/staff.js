// The opening team (Milestone 4, bible §5 / §8 / §27C / §27D): the Founder + the four other Start staff, so every run has
// all five roles. Each is a core/StaffModel: Standard tier, a seeded level 1–3, the five stats from their role template +
// level, and their role's most common work pattern (Day / Late / Night). No wages, hiring, training or fatigue yet.
//   makeTeam(seed, founderId) → saved team (plain JSON, in the campaign save)
//   loadTeam(saved, seed, founderId) → team: [{ id, name, role, tier, level, stats, pattern, founder, art, sprite, model }]
//   statsFor(role, tierId, level) → { service, speed, skill, stamina, charm }
//   onShiftAt(pattern, bandId) → do they work this band?
// Milestone 13: anyone of the 50 (data/roster.js) can be on the team. Each member carries their trait (its bible effect)
// and their Lv8 / Lv16 specialisations (kept in the model's traits as "spec:<id>"). gainXp(m, n) moves XP and levels
// (the stats follow the level: statsFor + any permanent bonus); teamBonus(team, key) adds up a trait key over the people
// at work today (absent ones don't count); specChoice(m) → the two options when one is due.
import { Rng } from '../../../../core/Rng.js';
import { StaffModel } from '../../../../core/StaffModel.js';
import { STAT_KEYS, ROLE_TEMPLATES, TIERS, LEVEL_ADD, PATTERNS, rolePattern, START_STAFF, EARLY_STAFF } from '../../data/staff.js';
import { founderById } from '../../data/setup.js';
import { STAFF_ROLES } from '../../data/lot.js';
import { staffDef, XP, xpToNext, SPECIALISATIONS, SPEC_LEVELS, specById } from '../../data/roster.js';

const r2 = (x) => Math.round(x * 100) / 100;

// Bible §27D: role template + tier adder; each level above 1 adds 0.7 to the role's two highest stats, 0.35 to the rest.
export function statsFor(role, tierId = 'standard', level = 1) {
  const t = ROLE_TEMPLATES[role];
  const tier = TIERS[tierId] ?? TIERS.standard;
  const top = STAT_KEYS.map((k, i) => [i, t[i]])
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, 2)
    .map(([i]) => i);
  return Object.fromEntries(STAT_KEYS.map((k, i) => [k, r2(Math.min(LEVEL_ADD.cap, t[i] + tier.add + (level - 1) * (top.includes(i) ? LEVEL_ADD.top : LEVEL_ADD.other)))]));
}

// The Founder first, then the other Start staff in role order.
export function makeTeam(seed, founderId) {
  const ids = [founderId, ...START_STAFF.filter((id) => id !== founderId)];
  return ids.map((id) => {
    const f = founderById(id);
    const tier = TIERS.standard;
    const level = new Rng(`${seed}:staff:${id}`).int(tier.levels[0], tier.levels[1]);
    const model = new StaffModel({ id, name: f.name, role: f.role, tier: tier.id, level, stats: statsFor(f.role, tier.id, level), art: f.art, activity: 'resting' });
    return { ...model.toJSON(), pattern: rolePattern(f.role), founder: id === founderId };
  });
}

// Anyone the team may hold: a Founder (the Start staff) or (Milestone 10) one of the Early staff.
export const staffById = (id) => founderById(id) ?? staffDef(id) ?? EARLY_STAFF.find((m) => m.id === id) ?? null;
// One Early staff member as a new hire: Standard tier, a seeded level 1–3, their role's stats and most common pattern.
export function makeHire(seed, id) {
  const f = staffDef(id); // (Milestone 13: any of the 50, at their own tier)
  if (!f) return null;
  const tier = TIERS[f.tier] ?? TIERS.standard;
  const level = f.level ?? new Rng(`${seed}:staff:${id}`).int(tier.levels[0], tier.levels[1]); // (M27b: Aaron starts at 16)
  const model = new StaffModel({ id, name: f.name, role: f.role, tier: tier.id, level, stats: statsFor(f.role, tier.id, level), art: f.art, activity: 'resting' });
  // (Milestone 27b) a def's statAdd: a permanent bonus on every stat (kept like an item's, so levels keep it)
  if (f.statAdd) {
    model.counters ??= {};
    for (const k of STAT_KEYS) model.counters[`bonus_${k}`] = (model.counters[`bonus_${k}`] ?? 0) + f.statAdd;
    model.stats = Object.fromEntries(STAT_KEYS.map((k) => [k, r2(Math.min(LEVEL_ADD.cap, model.stats[k] + f.statAdd))]));
  }
  return { ...model.toJSON(), pattern: rolePattern(f.role), founder: false };
}

// A saved team, checked (a missing or damaged one is made again from the seed — same people, same levels).
export function loadTeam(saved, seed, founderId) {
  let list = Array.isArray(saved) && saved.length ? saved : makeTeam(seed, founderId);
  if (!list.some((m) => m.id === founderId) || list.some((m) => !staffById(m.id)) || new Set(list.map((m) => m.id)).size !== list.length) list = makeTeam(seed, founderId);
  return list.map((m) => memberFrom(m, founderId));
}
// One saved person as a working team member (Milestone 11: a new hire joins the same way).
export function memberFrom(m, founderId) {
  const model = StaffModel.fromJSON(m);
  return {
    id: model.id,
    name: model.name,
    role: model.role,
    tier: model.tier,
    level: model.level,
    stats: model.stats,
    pattern: PATTERNS[m.pattern] ? m.pattern : rolePattern(model.role),
    founder: m.id === founderId,
    art: model.art,
    sprite: STAFF_ROLES[model.role].art,
    station: STAFF_ROLES[model.role].station,
    model,
    // (Milestone 13) the trait and specialisations as effects
    trait: staffDef(model.id)?.trait ?? null,
    get xp() {
      return model.xp;
    },
    get specs() {
      return model.traits.filter((t) => t.startsWith('spec:')).map((t) => specById(t.slice(5))).filter(Boolean);
    },
    get effects() {
      const d = staffDef(model.id);
      return [...(d ? d.effects ?? [d.effect] : []), ...this.specs.map((x) => x.effect)]; // (M27b: Aaron has several)
    },
  };
}
// (Milestone 13) permanent stat bonuses (items, M14) are kept in the model's counters as bonus_<stat>.
const bonusOf = (model, k) => model.counters?.[`bonus_${k}`] ?? 0;
export function restat(m) {
  const base = statsFor(m.role, m.tier, m.level);
  const stats = Object.fromEntries(STAT_KEYS.map((k) => [k, r2(Math.min(LEVEL_ADD.cap, base[k] + bonusOf(m.model, k)))]));
  m.model.stats = stats;
  m.stats = m.model.stats;
  return stats;
}
// XP for this member (bible §27D): levels while it is enough, up to the cap; the stats follow. → levels gained.
export function gainXp(m, n) {
  if (m.level >= XP.cap) return 0;
  m.model.xp = r2(m.model.xp + n);
  let up = 0;
  while (m.level < XP.cap && m.model.xp >= xpToNext(m.level)) {
    m.model.xp = r2(m.model.xp - xpToNext(m.level));
    m.level++;
    m.model.level = m.level;
    up++;
  }
  if (m.level >= XP.cap) m.model.xp = 0;
  if (up) restat(m);
  return up;
}
// The specialisation due now (Lv8 or Lv16 reached and not chosen): { level, options } or null.
export function specChoice(m) {
  for (const lv of SPEC_LEVELS) {
    if (m.level < lv) continue;
    const opts = SPECIALISATIONS[m.role]?.[lv] ?? [];
    if (!opts.some((o) => m.model.traits.includes(`spec:${o.id}`))) return { level: lv, options: opts };
  }
  return null;
}
export function chooseSpec(m, specId) {
  const due = specChoice(m);
  if (!due || !due.options.some((o) => o.id === specId)) return false;
  m.model.traits.push(`spec:${specId}`);
  return true;
}
// Tests of the older milestones switch Milestone 13's growth off (their formulas stay exactly as written then).
export const GROWTH = { traits: true, xp: true, facilities: true }; // (facilities: M16's new effects of the shipped eight)
// The team's total for a trait key, as a share (8% → 0.08): everyone at work today (not away).
export const teamBonus = (team, key) => (!GROWTH.traits ? 0 : (team ?? []).reduce((t, m) => t + (m.absent ? 0 : (m.effects ?? []).reduce((a, e) => a + (e.key === key ? e.pct : 0), 0)), 0) / 100);
export const saveTeam = (team) => team.map((m) => ({ ...m.model.toJSON(), pattern: m.pattern, founder: m.founder }));

export const onShiftAt = (pattern, bandId) => (PATTERNS[pattern] ?? PATTERNS.day).bands.includes(bandId);
export const patternWords = (pattern) => {
  const p = PATTERNS[pattern] ?? PATTERNS.day;
  const names = p.bands.map((b) => b[0].toUpperCase() + b.slice(1));
  return `${p.name} (${names.slice(0, -1).join(', ')} and ${names[names.length - 1]})`;
};
