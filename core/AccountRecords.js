// Account records (any series game): bests that survive every new campaign ("highest cash", "fastest project"…).
// Kept in the account save, never in a run save, so starting a new run can't touch them.
//
// defs: [{ id, better: 'max' | 'min' }]   (the game adds its own labels and formatting)
//   submit(id, value, info, key) → true when it is a new best. key: a record kept per thing (per purpose, per event…)
//   get(id, key) → { value, info, runId, day } | null        all(id) → { key: entry } for a keyed record
// Emits 'record:new' ({ id, key, entry, previous }).
export class AccountRecords {
  constructor({ bus = null, defs = [], now = () => ({}) } = {}) {
    this.bus = bus;
    this.defs = Object.fromEntries(defs.map((d) => [d.id, d]));
    this.now = now; // () → { day, runId }
    this.records = {}; // id → entry, or id → { key: entry }
  }

  _better(id, a, b) {
    return this.defs[id]?.better === 'min' ? a < b : a > b;
  }

  submit(id, value, info = {}, key = null) {
    if (!this.defs[id] || typeof value !== 'number' || !Number.isFinite(value)) return false;
    const holder = key == null ? this.records : (this.records[id] ||= {});
    const slot = key == null ? id : key;
    const previous = holder[slot] ?? null;
    if (previous && !this._better(id, value, previous.value)) return false;
    const { day, runId } = this.now();
    const entry = { value, info: { ...info }, runId: runId ?? null, day: day ?? null };
    holder[slot] = entry;
    this.bus?.emit('record:new', { id, key, entry, previous });
    return true;
  }

  get(id, key = null) {
    return (key == null ? this.records[id] : this.records[id]?.[key]) ?? null;
  }

  all(id) {
    return { ...(this.records[id] ?? {}) };
  }

  serialize() {
    return JSON.parse(JSON.stringify(this.records));
  }

  // Keeps the better of what is held and what is loaded, so an older copy can never lower a record.
  load(data) {
    if (!data) return false;
    const src = JSON.parse(JSON.stringify(data));
    for (const [id, v] of Object.entries(src)) {
      if (!this.defs[id]) {
        this.records[id] = v; // a record this build doesn't know: kept as it is
        continue;
      }
      const keyed = v && typeof v === 'object' && !('value' in v);
      if (!keyed) {
        const cur = this.records[id];
        if (!cur || this._better(id, v.value, cur.value)) this.records[id] = v;
        continue;
      }
      const into = (this.records[id] ||= {});
      for (const [k, e] of Object.entries(v)) if (!into[k] || this._better(id, e.value, into[k].value)) into[k] = e;
    }
    return true;
  }
}
