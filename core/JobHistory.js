// List of finished jobs with their final numbers and the team who made them.
// Records are plain data, so the list saves and loads as JSON.
export class JobHistory {
  constructor({ bus = null } = {}) {
    this.bus = bus;
    this.records = [];
    this.count = 0; // total ever added (numbers the records)
  }

  add(record) {
    const rec = { number: ++this.count, ...JSON.parse(JSON.stringify(record)) };
    this.records.push(rec);
    this.bus?.emit('history:add', { record: rec });
    return rec;
  }

  list() {
    return this.records;
  }

  latest() {
    return this.records[this.records.length - 1] || null;
  }

  get(number) {
    return this.records.find((r) => r.number === number) || null;
  }

  filter(fn) {
    return this.records.filter(fn);
  }

  serialize() {
    return { count: this.count, records: JSON.parse(JSON.stringify(this.records)) };
  }

  load(s) {
    this.count = s?.count ?? 0;
    this.records = JSON.parse(JSON.stringify(s?.records ?? []));
  }
}
