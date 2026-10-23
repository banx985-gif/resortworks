// Archived run summaries (any series game): what each finished campaign achieved, kept in the account save so a
// new run never touches them. Newest first; only `max` are kept (the oldest is dropped).
//   add(summary) → the stored copy (a summary with the same runId replaces the old one)
//   list → newest first        latest → the newest or null        best(score) → the one with the highest score(s)
export class RunArchive {
  constructor({ max = 3 } = {}) {
    this.max = max;
    this.entries = [];
  }

  add(summary) {
    const copy = JSON.parse(JSON.stringify(summary));
    this.entries = [copy, ...this.entries.filter((e) => !copy.runId || e.runId !== copy.runId)].slice(0, this.max);
    return copy;
  }

  get list() {
    return this.entries;
  }

  get latest() {
    return this.entries[0] ?? null;
  }

  best(score) {
    return this.entries.reduce((b, e) => (!b || score(e) > score(b) ? e : b), null);
  }

  serialize() {
    return JSON.parse(JSON.stringify(this.entries));
  }

  load(data) {
    this.entries = Array.isArray(data) ? JSON.parse(JSON.stringify(data)).slice(0, this.max) : [];
  }
}
