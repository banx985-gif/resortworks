// The opening team (Milestone 4, bible §5 / §8 / §27C / §27D): the Founder + the four other Start staff, so every run has
// all five roles. Each is a core/StaffModel: Standard tier, a seeded level 1–3, the five stats from their role template +
// level, and their role's most common work pattern (Day / Late / Night). No wages, hiring, training or fatigue yet.
//   makeTeam(seed, founderId) → saved team (plain JSON, in the campaign save)
//   loadTeam(saved, seed, founderId) → team: [{ id, name, role, tier, level, stats, pattern, founder, art, sprite, model }]
//   statsFor(role, tierId, level) → { service, speed, skill, stamina, charm }
//   onShiftAt(pattern, bandId) → do they work this band?
import { Rng } from '../../../../core/Rng.js';
import { StaffModel } from '../../../../core/StaffModel.js';
import { STAT_KEYS, ROLE_TEMPLATES, TIERS, LEVEL_ADD, PATTERNS, rolePattern, START_STAFF } from '../../data/staff.js';
import { founderById } from '../../data/setup.js';
import { STAFF_ROLES } from '../../data/lot.js';

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

// A saved team, checked (a missing or damaged one is made again from the seed — same people, same levels).
export function loadTeam(saved, seed, founderId) {
  let list = Array.isArray(saved) && saved.length ? saved : makeTeam(seed, founderId);
  if (!list.some((m) => m.id === founderId) || list.some((m) => !founderById(m.id))) list = makeTeam(seed, founderId);
  return list.map((m) => {
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
    };
  });
}
export const saveTeam = (team) => team.map((m) => ({ ...m.model.toJSON(), pattern: m.pattern, founder: m.founder }));

export const onShiftAt = (pattern, bandId) => (PATTERNS[pattern] ?? PATTERNS.day).bands.includes(bandId);
export const patternWords = (pattern) => {
  const p = PATTERNS[pattern] ?? PATTERNS.day;
  const names = p.bands.map((b) => b[0].toUpperCase() + b.slice(1));
  return `${p.name} (${names.slice(0, -1).join(', ')} and ${names[names.length - 1]})`;
};
