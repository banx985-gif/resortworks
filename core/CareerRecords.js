// A career record for every person who has ever worked here (staff, cooks, crew…): who they were, when
// they were with the company and what they did. Kept after they leave, so later systems (secrets, legacy
// staff, records screens) can still read it. Plain data only; saves and loads as JSON.
//
// counters: the names the game counts, e.g. ['projects', 'robots', 'zeroFault', 'training'].
//   join(person, day)       starts a stint (a new record, or a returning person's next stint)
//   leave(id, day)          ends the current stint; the record stays
//   bump(id, key, n)        adds to a counter (only while they work here)
//   daysEmployed(id, today) all stints added up
export class CareerRecords {
  constructor({ bus = null, counters = [] } = {}) {
    this.bus = bus;
    this.counters = counters;
    this.reset();
  }

  reset() {
    this.records = {}; // id → record
  }

  get(id) {
    return this.records[id] ?? null;
  }

  // person: { id, name, role, tier, art }. Returns the record.
  join(person, day) {
    let r = this.records[person.id];
    if (!r) {
      r = this.records[person.id] = {
        id: person.id,
        name: person.name,
        role: person.role,
        tier: person.tier,
        art: person.art ?? null,
        stints: [],
        counters: Object.fromEntries(this.counters.map((k) => [k, 0])),
      };
    }
    if (this.isCurrent(person.id)) return r;
    r.name = person.name;
    r.stints.push({ from: day, to: null });
    this.bus?.emit('career:join', { record: r });
    return r;
  }

  leave(id, day) {
    const r = this.records[id];
    const stint = r?.stints.at(-1);
    if (!stint || stint.to !== null) return null;
    stint.to = day;
    this.bus?.emit('career:leave', { record: r });
    return r;
  }

  isCurrent(id) {
    const stint = this.records[id]?.stints.at(-1);
    return !!stint && stint.to === null;
  }

  bump(id, key, n = 1) {
    const r = this.records[id];
    if (!r || !this.isCurrent(id)) return 0;
    r.counters[key] = (r.counters[key] ?? 0) + n;
    return r.counters[key];
  }

  count(id, key) {
    return this.records[id]?.counters[key] ?? 0;
  }

  daysEmployed(id, today) {
    const r = this.records[id];
    if (!r) return 0;
    return r.stints.reduce((t, s) => t + Math.max(0, (s.to ?? today) - s.from), 0);
  }

  // People who have left and not come back.
  former() {
    return Object.values(this.records).filter((r) => !this.isCurrent(r.id));
  }

  serialize() {
    return JSON.parse(JSON.stringify({ records: this.records }));
  }

  // Returns false if there was nothing to load (e.g. a save from before career records).
  load(s) {
    this.reset();
    if (!s?.records) return false;
    this.records = JSON.parse(JSON.stringify(s.records));
    for (const r of Object.values(this.records)) for (const k of this.counters) r.counters[k] ??= 0;
    return true;
  }
}
