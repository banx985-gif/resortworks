// Holds the roster and runs the staff rules: daily Energy/Morale, monthly idle check, XP and level-ups.
// All numbers come from the game's rules/data; all randomness comes from the seeded Rng passed in,
// in a fixed order, so the same seed always gives the same results.
//
// config:
//   rng, bus
//   statKeys:  ['eng', 'des', ...]                      work stat keys
//   roles:     { engineer: { primaryStat: 'eng' }, ... }
//   tiers:     { standard: { statCap: 220, traitSlots: 1 }, ... }
//   traits:    { quickLearner: { effects: { xpGainPct: 20 } }, ... }
//   rules:     see DEFAULT_RULES
//   planActivity(staff) → 'working' | 'resting' | other   optional: decides each worker's day (other: no Energy change)
//   energyLossMultiplier(staff) → number                   optional: extra multiplier on working Energy loss
//   restModifier(staff) → { energyMult, morale }           optional: resting bonuses (e.g. a break room)
//   moraleFloorBonus(staff) → number                       optional: raises everyone's Morale floor (e.g. a staff lounge)
//   signatureHooks: { hookName: { point, apply(ctx, params, staff) } }   optional: what each signature trait does
//
// Signature traits (the one-of-a-kind rule a legendary/secret worker brings, e.g. "software faults can't
// exceed 1 per project") are plain data on the trait: signature: { hook: 'phaseFaultCap', params: { … } }.
// The game writes each named hook once, at a named moment (point). runSignatures(team, point, ctx) runs the
// ones on a team at that moment. A hook whose system isn't built yet simply has no caller.
import { StaffModel } from './StaffModel.js';

export const DEFAULT_RULES = {
  startEnergy: 100,
  startMorale: 70,
  workEnergyLoss: { min: 0.7, max: 1.5 }, // per working day
  restEnergyGain: 4, // per resting day
  tiredBelow: 25,
  stressedBelow: 25,
  inspired: { moraleAbove: 85, energyAbove: 65, dailyChance: 0.05 },
  unassignedMorale: { afterMonths: 2, perMonth: -5 },
  levelCap: 30,
  xpCurve: { base: 80, perLevel: 25, perLevelSq: 5 },
  levelUp: { primaryMin: 4, primaryMax: 8, otherCount: 2, otherMin: 1, otherMax: 4 },
  workMultiplier: { base: 0.7, energyDiv: 250, moraleDiv: 500, min: 0.65, max: 1.3 },
};

// Trait effect keys this system understands (values are percentages or points):
//   xpGainPct      +% XP gained
//   energyLossPct  +/-% Energy lost while working
//   moraleFloor    Morale can't drop below this
// Any other key is the game's own: it reads it with traitEffect / groupEffect (numbers) or the *Map versions
// (sets of numbers such as { REL: 10 }).

export class StaffSystem {
  constructor({ rng, bus = null, statKeys, roles = {}, tiers = {}, traits = {}, rules = {}, planActivity = null, energyLossMultiplier = null, restModifier = null, moraleFloorBonus = null, signatureHooks = {} }) {
    this.rng = rng;
    this.bus = bus;
    this.statKeys = statKeys;
    this.roles = roles;
    this.tiers = tiers;
    this.traits = traits;
    this.rules = { ...DEFAULT_RULES, ...rules };
    this.planActivity = planActivity;
    this.energyLossMultiplier = energyLossMultiplier;
    this.restModifier = restModifier;
    this.moraleFloorBonus = moraleFloorBonus;
    this.signatureHooks = signatureHooks;
    this.staff = [];
  }

  // --- roster --------------------------------------------------------------
  add(model) {
    this.staff.push(model);
    return model;
  }

  addFromDefinition(def) {
    return this.add(StaffModel.fromDefinition(def, this.rules));
  }

  get(id) {
    return this.staff.find((s) => s.id === id) || null;
  }

  // Take a worker off the roster (they left). Returns the removed model or null.
  remove(id) {
    const s = this.get(id);
    if (!s) return null;
    this.staff = this.staff.filter((x) => x !== s);
    this.bus?.emit('staff:removed', { staff: s });
    return s;
  }

  serialize() {
    return this.staff.map((s) => s.toJSON());
  }

  load(list) {
    this.staff = list.map((o) => StaffModel.fromJSON(o));
  }

  // --- derived values ------------------------------------------------------
  traitEffect(staff, key) {
    let total = 0;
    for (const t of staff.traits) {
      const v = this.traits[t]?.effects?.[key];
      if (typeof v === 'number') total += v;
      else if (v === true) total = total || 1;
    }
    return total;
  }

  // A trait effect that is a set of numbers (e.g. gainPct: { REL: 10 }) for one worker.
  traitEffectMap(staff, key) {
    return sumMaps(staff.traits.map((t) => this.traits[t]?.effects?.[key]));
  }

  // --- traits on a group (a project team, a shift…): each trait counts once, however many have it ---
  groupTraits(list) {
    const out = new Map(); // traitId → first worker who has it
    for (const s of list) for (const t of s?.traits ?? []) if (!out.has(t)) out.set(t, s);
    return out;
  }

  groupEffect(list, key) {
    let total = 0;
    for (const t of this.groupTraits(list).keys()) {
      const v = this.traits[t]?.effects?.[key];
      if (typeof v === 'number') total += v;
      else if (v === true) total = total || 1;
    }
    return total;
  }

  groupEffectMap(list, key) {
    return sumMaps([...this.groupTraits(list).keys()].map((t) => this.traits[t]?.effects?.[key]));
  }

  // --- signature traits ---------------------------------------------------------
  isSignature(traitId) {
    return !!this.traits[traitId]?.signature;
  }

  signatureOf(staff) {
    return staff.traits.find((t) => this.isSignature(t)) ?? null;
  }

  // Signatures on a group whose hook runs at this point: [{ staff, traitId, hook, params }].
  signaturesAt(list, point) {
    const out = [];
    for (const [t, s] of this.groupTraits(list)) {
      const sig = this.traits[t]?.signature;
      if (sig && this.signatureHooks[sig.hook]?.point === point) out.push({ staff: s, traitId: t, hook: sig.hook, params: sig.params ?? {} });
    }
    return out;
  }

  // Run every signature on the group at this point. ctx is the game's own object the hooks read and change.
  // Returns the trait ids that ran.
  runSignatures(list, point, ctx) {
    const ran = [];
    for (const x of this.signaturesAt(list, point)) {
      if (this.signatureHooks[x.hook].apply(ctx, x.params, x.staff) !== false) ran.push(x.traitId);
    }
    return ran;
  }

  // Tier cap; a trait can raise one stat's cap (effects: { capPct_tst: 12 } — e.g. Homegrown Ace).
  statCap(staff, statKey = null) {
    const base = this.tiers[staff.tier]?.statCap ?? Infinity;
    const pct = statKey ? this.traitEffect(staff, `capPct_${statKey}`) : 0;
    return pct ? Math.round(base * (1 + pct / 100)) : base;
  }

  traitSlots(staff) {
    return this.tiers[staff.tier]?.traitSlots ?? 1;
  }

  xpNeeded(level) {
    const c = this.rules.xpCurve;
    return c.base + c.perLevel * level + c.perLevelSq * level * level;
  }

  workMultiplier(staff) {
    return staff.workMultiplier(this.rules.workMultiplier);
  }

  // --- XP / levels ---------------------------------------------------------
  // Returns { gained, levelsGained }.
  addXp(staffOrId, amount) {
    const s = typeof staffOrId === 'string' ? this.get(staffOrId) : staffOrId;
    if (!s || amount <= 0) return { gained: 0, levelsGained: 0 };
    const gained = Math.round(amount * (1 + this.traitEffect(s, 'xpGainPct') / 100));
    s.xp += gained;
    let levelsGained = 0;
    while (s.level < this.rules.levelCap && s.xp >= this.xpNeeded(s.level)) {
      s.xp -= this.xpNeeded(s.level);
      this._levelUp(s);
      levelsGained++;
    }
    if (s.level >= this.rules.levelCap) s.xp = 0;
    this.bus?.emit('staff:xp', { staff: s, gained, levelsGained });
    return { gained, levelsGained };
  }

  _levelUp(s) {
    const lu = this.rules.levelUp;
    const cap = this.statCap(s);
    const primary = this.roles[s.role]?.primaryStat;
    const gains = {};
    if (primary) gains[primary] = this.rng.int(lu.primaryMin, lu.primaryMax);
    const others = this.rng.shuffle(this.statKeys.filter((k) => k !== primary)).slice(0, lu.otherCount);
    for (const k of others) gains[k] = this.rng.int(lu.otherMin, lu.otherMax);
    for (const [k, v] of Object.entries(gains)) s.stats[k] = Math.min(this.statCap(s, k) ?? cap, (s.stats[k] ?? 0) + v);
    s.level++;
    s.energy = 100;
    this._updateStatus(s, false);
    this.bus?.emit('staff:levelup', { staff: s, level: s.level, gains });
  }

  // --- daily / monthly -----------------------------------------------------
  dailyTick() {
    const r = this.rules;
    for (const s of this.staff) {
      if (this.planActivity) s.activity = this.planActivity(s);
      if (s.activity === 'working') {
        const loss = this.rng.range(r.workEnergyLoss.min, r.workEnergyLoss.max);
        const extra = this.energyLossMultiplier ? this.energyLossMultiplier(s) : 1;
        s.energy -= loss * (1 + this.traitEffect(s, 'energyLossPct') / 100) * extra;
      } else if (s.activity === 'resting') {
        const mod = this.restModifier?.(s);
        s.energy += r.restEnergyGain * (mod?.energyMult ?? 1);
        if (mod?.morale) s.morale = round1(clamp(s.morale + mod.morale, 0, 100));
      }
      s.energy = round1(clamp(s.energy, 0, 100));
      this._applyMoraleFloor(s);
      this._updateStatus(s, true);
    }
    this.bus?.emit('staff:day', { staff: this.staff });
  }

  monthlyTick() {
    const u = this.rules.unassignedMorale;
    for (const s of this.staff) {
      if (s.assigned) {
        s.monthsUnassigned = 0;
      } else {
        s.monthsUnassigned++;
        if (s.monthsUnassigned >= u.afterMonths) this.changeMorale(s, u.perMonth);
      }
      this._updateStatus(s, false);
    }
    this.bus?.emit('staff:month', { staff: this.staff });
  }

  changeMorale(s, delta) {
    s.morale = round1(clamp(s.morale + delta, 0, 100));
    this._applyMoraleFloor(s);
  }

  changeEnergy(s, delta) {
    s.energy = round1(clamp(s.energy + delta, 0, 100));
  }

  // Re-check Tired / Stressed straight away (after Energy or Morale changed outside the daily tick).
  // Inspired can only be lost here; it is only ever gained by the daily roll.
  refreshStatus(s) {
    this._updateStatus(s, false);
  }

  _applyMoraleFloor(s) {
    const floor = this.traitEffect(s, 'moraleFloor') + (this.moraleFloorBonus?.(s) ?? 0);
    if (s.morale < floor) s.morale = floor;
  }

  // Tired / Stressed follow the numbers; Inspired is a small daily roll while conditions hold.
  _updateStatus(s, rollInspired) {
    const r = this.rules;
    s.status.tired = s.energy < r.tiredBelow;
    s.status.stressed = s.morale < r.stressedBelow;
    const canInspire = s.morale > r.inspired.moraleAbove && s.energy > r.inspired.energyAbove;
    if (!canInspire) s.status.inspired = false;
    else if (rollInspired && !s.status.inspired) s.status.inspired = this.rng.chance(r.inspired.dailyChance);
  }
}

// { a: 1 } + { a: 2, b: 3 } → { a: 3, b: 3 }. Skips anything that isn't an object.
function sumMaps(list) {
  const out = {};
  for (const m of list) {
    if (!m || typeof m !== 'object') continue;
    for (const [k, v] of Object.entries(m)) out[k] = (out[k] ?? 0) + v;
  }
  return out;
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function round1(v) {
  return Math.round(v * 10) / 10;
}
