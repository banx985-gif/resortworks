// One worker. Generic: the work-stat names, roles, tiers and traits all come from the game's data.
// Plain fields only, so it saves and loads as JSON without losing anything.
export class StaffModel {
  constructor(fields = {}) {
    this.id = fields.id;
    this.name = fields.name ?? fields.id;
    this.role = fields.role;
    this.tier = fields.tier;
    this.level = fields.level ?? 1;
    this.xp = fields.xp ?? 0; // XP towards the next level
    this.stats = { ...(fields.stats || {}) }; // e.g. { eng: 58, des: 28, ... } — keys from game data
    this.energy = fields.energy ?? 100; // 0–100
    this.morale = fields.morale ?? 70; // 0–100
    this.traits = [...(fields.traits || [])];
    this.salary = fields.salary ?? 0;
    this.art = fields.art ?? null;
    this.status = { tired: false, stressed: false, inspired: false, ...(fields.status || {}) };
    this.activity = fields.activity ?? 'idle'; // what the daily plan says: e.g. 'working' | 'resting'
    this.assigned = fields.assigned ?? false; // on a real job (projects arrive later)
    this.monthsUnassigned = fields.monthsUnassigned ?? 0;
    this.counters = { ...(fields.counters || {}) }; // game-specific day/streak counters
  }

  // Build a fresh worker from a content definition (bible §42.1 shape).
  static fromDefinition(def, { startEnergy = 100, startMorale = 70 } = {}) {
    return new StaffModel({
      id: def.id,
      name: def.name,
      role: def.role,
      tier: def.tier,
      level: def.startLevel ?? 1,
      xp: 0,
      stats: def.stats,
      traits: def.traits,
      salary: def.salary,
      art: def.art,
      energy: startEnergy,
      morale: startMorale,
    });
  }

  static fromJSON(o) {
    return new StaffModel(o);
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      role: this.role,
      tier: this.tier,
      level: this.level,
      xp: this.xp,
      stats: { ...this.stats },
      energy: this.energy,
      morale: this.morale,
      traits: [...this.traits],
      salary: this.salary,
      art: this.art,
      status: { ...this.status },
      activity: this.activity,
      assigned: this.assigned,
      monthsUnassigned: this.monthsUnassigned,
      counters: { ...this.counters },
    };
  }

  hasTrait(id) {
    return this.traits.includes(id);
  }

  // Their signature trait (legendary/secret staff carry one), from the game's trait data; null if none.
  signatureTrait(traitDefs) {
    return this.traits.find((t) => traitDefs[t]?.signature) ?? null;
  }

  // Normal traits only (the ones that fill trait slots).
  normalTraits(traitDefs) {
    return this.traits.filter((t) => !traitDefs[t]?.signature);
  }

  // How well they work today. Bible §9.2:
  //   0.70 + Energy/250 + Morale/500, clamped to 0.65 .. 1.30
  workMultiplier({ base = 0.7, energyDiv = 250, moraleDiv = 500, min = 0.65, max = 1.3 } = {}) {
    const m = base + this.energy / energyDiv + this.morale / moraleDiv;
    return Math.min(max, Math.max(min, m));
  }
}
