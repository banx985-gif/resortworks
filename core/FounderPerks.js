// The founding worker of a run (BOTWORKS Milestone 25b; any series game with a founder). The founders, their perks and
// their starting teams are the game's data:
//   founders: [{ id, perkName, perkText, effects: [{ key, value }], team: [ids] }]
//
//   const f = new FounderPerks({ founders })
//   f.set(id)              choose the founder of this run (null = none: an older run from before founders)
//   f.def                  the founder's data, or null
//   f.total(key)           the perk's effect for key — add it to the game's effect sum (facilities, sponsors…), so a
//                          perk is never hard-coded anywhere
//   f.team(fallback)       the starting team ids (the fallback when there is no founder)
//   f.history(read)        the Founding Staff record (spec §4). read: the game's numbers for this run —
//                          { careers (core/CareerRecords), today, daysPerYear, projects, competitions, ending }
//                          → { id, employed, continuous, days, years, projects, competitions, ending, legacy, pastRuns }
//   f.carry(snapshot, legacyPicked)
//                          what New Game+ passes on: the same founder, this run added to pastRuns, and whether they
//                          were picked as Legacy Staff
//   f.serialize() / f.load(data)
export class FounderPerks {
  constructor({ founders = [] } = {}) {
    this.founders = founders;
    this.byId = Object.fromEntries(founders.map((d) => [d.id, d]));
    this.reset();
  }

  reset() {
    this.id = null;
    this.pastRuns = []; // this founder in earlier runs of the same company (New Game+)
    this.legacy = false; // this run's founder was carried in as Legacy Staff
  }

  set(id, { pastRuns = [], legacy = false } = {}) {
    this.id = this.byId[id] ? id : null;
    this.pastRuns = this.id ? pastRuns.map((r) => ({ ...r })) : [];
    this.legacy = !!(this.id && legacy);
    return this.def;
  }

  get def() {
    return this.id ? this.byId[this.id] : null;
  }

  total(key) {
    let t = 0;
    for (const e of this.def?.effects ?? []) if (e.key === key) t += e.value;
    return t;
  }

  team(fallback = []) {
    return this.def?.team ? [...this.def.team] : [...fallback];
  }

  history({ careers, today = 0, daysPerYear = 1, projects = 0, competitions = 0, ending = false } = {}) {
    if (!this.id) return null;
    const rec = careers?.get(this.id) ?? null;
    const days = careers ? careers.daysEmployed(this.id, today) : 0;
    const employed = !!careers?.isCurrent(this.id);
    return {
      id: this.id,
      employed,
      continuous: employed && (rec?.stints.length ?? 0) === 1 && rec.stints[0].from === 0, // never left since day 1
      days,
      years: Math.floor(days / daysPerYear),
      projects,
      competitions,
      ending: !!ending,
      legacy: this.legacy,
      pastRuns: this.pastRuns.map((r) => ({ ...r })),
    };
  }

  carry(snapshot, legacyPicked = false) {
    if (!this.id) return null;
    return { id: this.id, legacy: !!legacyPicked, pastRuns: [...this.pastRuns, { ...snapshot }] };
  }

  serialize() {
    return this.id ? { id: this.id, legacy: this.legacy, pastRuns: this.pastRuns.map((r) => ({ ...r })) } : null;
  }

  load(data) {
    this.reset();
    if (data?.id) this.set(data.id, { pastRuns: data.pastRuns ?? [], legacy: data.legacy });
  }
}
