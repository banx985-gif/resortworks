// Rival companies as data (bible §22): who they are, what they are good at, and how strong they are at any point
// of the campaign. Rivals are not simulated businesses — they are opponents with a fixed strength curve:
//
//   rival base score = event target × (1 + fieldOffset% + specialty% + growth% + ngPlus%)
//     fieldOffset  where this rival sits in this event's field (event data)
//     specialty    (event weight on the rival's strengths − specialtyBase) × specialtyPctPerPoint
//     growth       growthPctPerYear × (campaign year − the event's beat year), clamped to ±growthClampPct
//     ngPlus       ngPlusPct per New Game+ run, plus the rival's own ngPlusBonus.pct from ngPlusBonus.fromLevel on
//   The event run then adds seeded variance per entry and seeded form per segment (core/CompetitionSystem.js).
//
// Nothing here reads the player's robot, pilot or results: no rubber-banding (§22.1).
//
// rivals: [{ id, name, strengths: [stat], growthPctPerYear, hidden?: true, ngPlusBonus?: { fromLevel, pct } }]
// rules:  { specialtyBase, specialtyPctPerPoint, ngPlusPct, growthClampPct }
export class RivalSystem {
  constructor({ rivals, rules }) {
    this.rivals = rivals;
    this.rules = rules;
    this.byId = Object.fromEntries(rivals.map((r) => [r.id, r]));
  }

  get(id) {
    return this.byId[id] ?? null;
  }

  // Rivals that show in rankings and lists (a hidden one stays out until the game reveals it).
  visible(isRevealed = () => false) {
    return this.rivals.filter((r) => !r.hidden || isRevealed(r.id));
  }

  specialtyPct(rival, weights) {
    if (!rival?.strengths?.length) return 0;
    const overlap = rival.strengths.reduce((t, k) => t + (weights[k] ?? 0), 0);
    return (overlap - this.rules.specialtyBase) * this.rules.specialtyPctPerPoint;
  }

  // The fixed strength curve: % above/below the event level in a given campaign year.
  growthPct(rival, year, beatYear = 1) {
    const g = (rival?.growthPctPerYear ?? 0) * (year - beatYear);
    const c = this.rules.growthClampPct;
    return Math.max(-c, Math.min(c, g));
  }

  // One rival's base score for an event, with the parts that make it up.
  baseFor(id, ev, { weights = ev.weights, year = 1, ngPlusRuns = 0, offset = 0 } = {}) {
    const r = this.get(id) ?? { id, name: id, strengths: [] };
    const parts = {
      offset,
      specialty: this.specialtyPct(r, weights),
      growth: this.growthPct(r, year, ev.beatYear ?? 1),
      ngPlus: ngPlusRuns * this.rules.ngPlusPct + (r.ngPlusBonus && ngPlusRuns >= r.ngPlusBonus.fromLevel ? r.ngPlusBonus.pct : 0),
    };
    const pct = parts.offset + parts.specialty + parts.growth + parts.ngPlus;
    return { id, name: r.name, base: ev.target * (1 + pct / 100), parts };
  }

  // The whole field for an event: [{ id, name, base, parts }], in the event's field order.
  fieldFor(ev, ctx = {}) {
    return ev.field.map(([id, offset]) => this.baseFor(id, ev, { ...ctx, offset }));
  }
}
