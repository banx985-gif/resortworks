// Trophies / cups as data: each has a rule; the first time the rule holds it is awarded — once — and kept.
//
// trophies: [{ id, name, art, rule, note }]   rule: any rule the game's ruleMet(rule) understands
// check(ruleMet, extra) awards every trophy whose rule now holds; returns the newly awarded ones.
export class TrophyCase {
  constructor({ bus = null, trophies }) {
    this.bus = bus;
    this.trophies = trophies;
    this.reset();
  }

  reset() {
    this.awarded = {}; // id → { day, resultId, eventId }
  }

  has(id) {
    return !!this.awarded[id];
  }

  get count() {
    return Object.keys(this.awarded).length;
  }

  check(ruleMet, extra = {}) {
    const fresh = [];
    for (const t of this.trophies) {
      if (this.awarded[t.id] || !ruleMet(t.rule)) continue;
      this.awarded[t.id] = { ...extra };
      fresh.push(t);
      this.bus?.emit('trophy:awarded', { trophy: t, ...extra });
    }
    return fresh;
  }

  serialize() {
    return JSON.parse(JSON.stringify(this.awarded));
  }

  load(data) {
    this.reset();
    if (!data) return false;
    this.awarded = JSON.parse(JSON.stringify(data));
    return true;
  }
}
