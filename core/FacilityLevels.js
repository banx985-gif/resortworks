// Facility levels (series common feature §3, first built for DEVWORKS Milestone 40e; any series game): levels 1–3 on
// top of a game's facilities. Content-free: prices, days, rank gates and multipliers are game data; the game asks
// mult(id) inside its own effect query, so a level strengthens the facility's existing effects.
//
//   const lv = new FacilityLevels({ maxLevel: 3, mult: [1, 1.5, 2], bus })
//   lv.level(id) → 1..max (1 for anything never upgraded: older saves start at level 1)
//   lv.mult(id, perFacility = null) → the effect multiplier now (perFacility: [×L1, ×L2, ×L3] overrides the default)
//   lv.pending(id) → { to, doneDay, cost } while an upgrade is under way (the facility works at the old level)
//   lv.start(id, { cost, today, days }) → begins an upgrade to the next level (the game checks money, rank, etc.)
//   lv.tick(today) → [{ id, level }] upgrades finished by today (emits 'facility:levelUp')
//   lv.invested(id) → what was paid in upgrades (a sell refund can include it) · lv.remove(id) when sold
//   lv.serialize() / lv.load(data)
export class FacilityLevels {
  constructor({ maxLevel = 3, mult = [1, 1.5, 2], bus = null } = {}) {
    this.maxLevel = maxLevel;
    this.defaultMult = mult;
    this.bus = bus;
    this.state = {}; // id → { level, paid, pending: { to, doneDay, cost } | null }
  }

  level(id) {
    return this.state[id]?.level ?? 1;
  }

  mult(id, perFacility = null) {
    const m = perFacility ?? this.defaultMult;
    return m[this.level(id) - 1] ?? 1;
  }

  pending(id) {
    return this.state[id]?.pending ?? null;
  }

  invested(id) {
    return this.state[id]?.paid ?? 0;
  }

  canStart(id) {
    if (this.pending(id)) return 'Upgrade under way';
    if (this.level(id) >= this.maxLevel) return 'Top level';
    return null;
  }

  start(id, { cost = 0, today = 0, days = 0 } = {}) {
    const why = this.canStart(id);
    if (why) return { ok: false, why };
    const s = (this.state[id] ??= { level: 1, paid: 0, pending: null });
    s.pending = { to: s.level + 1, doneDay: today + days, cost };
    s.paid += cost;
    this.bus?.emit('facility:upgradeStart', { id, to: s.pending.to, doneDay: s.pending.doneDay, cost });
    if (days <= 0) this.tick(today);
    return { ok: true, to: s.pending?.to ?? s.level, doneDay: today + days };
  }

  tick(today) {
    const done = [];
    for (const [id, s] of Object.entries(this.state)) {
      if (s.pending && today >= s.pending.doneDay) {
        s.level = s.pending.to;
        s.pending = null;
        done.push({ id, level: s.level });
        this.bus?.emit('facility:levelUp', { id, level: s.level });
      }
    }
    return done;
  }

  // Sold: its levels go with it (a new one of the same facility starts at level 1).
  remove(id) {
    delete this.state[id];
  }

  serialize() {
    return JSON.parse(JSON.stringify(this.state));
  }

  load(data) {
    this.state = data && typeof data === 'object' ? JSON.parse(JSON.stringify(data)) : {};
  }
}
