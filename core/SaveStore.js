// Hardened saves (bible §37, Milestone 22), for any series game. A player must never lose progress.
//
//   checksum(text)                      FNV-1a 32-bit, as 8 hex digits
//   migrateSave(raw, { version, migrations })
//                                       §37.6: every load goes through here, one step per version (15→16, 16→17 …).
//                                       Old records are never changed in place (each step returns a new object);
//                                       fields a step does not know are carried along untouched (ignored).
//   new SaveSlot({ adapter, key, version, migrations, rolling = 3, bus })
//     A slot keeps its last `rolling` saves under key#0, key#1, key#2… Each save goes to the next one with a higher
//     sequence number, a checksum and its size, and is read back and checked; the newest copy that checks out is
//     "current". So a write cut off half way (the phone killed the app) is simply never used.
//     save(data) → record                 load() → data (migrated) or null; slot.lastLoad tells what happened:
//       { record, fallback: true when a newer copy was damaged and an older one was used, damaged: [..], error }
//     The old single-key layout (key, before Milestone 22) is read too, as the oldest copy.
//     list() → every copy with its version, size, time and checksum status (the save inspector)
//     damage() (debug) · clear() · importRecord(record) (debug: a save pasted from a bug report)
//   moveLegacySaves({ adapter, keys, localPrefix, marker })
//     One time only: saves kept before Milestone 22 (the old single key in this database, or in localStorage on a
//     phone that fell back to it) are copied into the new layout, read back and compared, and only then is the move
//     marked done. The old copies are left where they were.
// RACEWORKS Milestone 30 (all optional — a game that passes none of these works exactly as before):
//   new SaveSlot({ …, validate, refuseNewer })
//     validate(data, record) → [] / null when fine, else the problems (an array or a string; throwing counts too). A
//       copy whose checksum is fine but whose data fails the game's schema check is skipped like a damaged one, so the
//       load falls back to the copy before it. importRecord() checks it too.
//     refuseNewer: a copy saved by a newer version of the game is never passed over for an older one and never written
//       over: load() throws a NewerSaveError (err.newer, err.saveVersion, err.gameVersion) and save() refuses.
//   save(data, { trigger }) — the record remembers what asked for it (list() shows it: the save inspector).
//   quarantine() → key   every copy, kept aside under `${key}:quarantine:<time>` (before a damaged slot is reused)
//   current() → the newest stored copy that checks out (raw record) or null (export)
//   dryRun(raw = current) → { ok, trace: [{ from, to }], problems, error } — the migrations and the check, nothing written
//   migrateSave(raw, { version, migrations, trace }) — trace (an array) gets one { from, to } per step
export class NewerSaveError extends Error {
  constructor(saveVersion, gameVersion) {
    super(`Save version ${saveVersion} is newer than this game (${gameVersion})`);
    this.newer = true;
    this.saveVersion = saveVersion;
    this.gameVersion = gameVersion;
  }
}

export function checksum(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export function migrateSave(raw, { version, migrations = {}, trace = null }) {
  if (!raw || typeof raw !== 'object' || typeof raw.data !== 'object' || raw.data === null) throw new Error('Not a save record');
  let record = raw;
  let v = record.saveVersion ?? 0;
  if (v > version) throw new NewerSaveError(v, version);
  while (v < version) {
    const step = migrations[v];
    if (!step) throw new Error(`No save migration from version ${v}`);
    record = { ...step(record), saveVersion: v + 1 };
    trace?.push({ from: v, to: v + 1 });
    v++;
  }
  return record;
}

// The game's check (validate option) as a list of problems: [] when fine.
function problemsOf(validate, data, record) {
  if (!validate) return [];
  try {
    const p = validate(data, record);
    return p == null || p === true ? [] : Array.isArray(p) ? p : [String(p)];
  } catch (err) {
    return [`check failed: ${err?.message ?? err}`];
  }
}

// What a stored copy looks like to the loader: 'ok' (checksum matches), 'legacy' (from before checksums — trusted if
// it has data), 'damaged', or 'empty'.
export function recordStatus(raw) {
  if (raw == null) return 'empty';
  if (typeof raw !== 'object' || typeof raw.data !== 'object' || raw.data === null) return 'damaged';
  if (raw.checksum == null) return 'legacy';
  try {
    return checksum(JSON.stringify(raw.data)) === raw.checksum ? 'ok' : 'damaged';
  } catch {
    return 'damaged';
  }
}

export class SaveSlot {
  constructor({ adapter, key, version = 1, migrations = {}, rolling = 3, bus = null, validate = null, refuseNewer = false }) {
    this.adapter = adapter;
    this.key = key;
    this.version = version;
    this.migrations = migrations;
    this.rolling = rolling;
    this.bus = bus;
    this.validate = validate;
    this.refuseNewer = refuseNewer;
    this.seq = null; // highest sequence number written or seen
    this.lastSavedAt = null;
    this.lastLoad = null;
    this.lastWrite = null; // { ms, bytes, seq }
    this._chain = Promise.resolve(); // saves never overlap
  }

  slotKey(i) {
    return `${this.key}#${i}`;
  }

  async _read(k) {
    try {
      return await this.adapter.get(k);
    } catch (err) {
      return { __unreadable: String(err?.message ?? err) };
    }
  }

  // Every stored copy, newest first (the old single key last).
  async _copies() {
    const out = [];
    for (let i = 0; i < this.rolling; i++) {
      const raw = await this._read(this.slotKey(i));
      if (raw != null) out.push({ k: this.slotKey(i), slot: i, raw, seq: typeof raw.seq === 'number' ? raw.seq : -1 });
    }
    out.sort((a, b) => b.seq - a.seq);
    const legacy = await this._read(this.key);
    if (legacy != null) out.push({ k: this.key, slot: 'legacy', raw: legacy, seq: -2 });
    return out;
  }

  save(data, meta = {}) {
    const run = this._chain.then(() => this._save(data, meta));
    this._chain = run.catch(() => {});
    return run;
  }

  // (refuseNewer) a copy written by a newer game version, if there is one
  _newerIn(copies) {
    return copies.find((c) => ['ok', 'legacy'].includes(recordStatus(c.raw)) && (c.raw.saveVersion ?? 0) > this.version) ?? null;
  }

  async _save(data, meta = {}) {
    const t0 = globalThis.performance?.now() ?? Date.now();
    const json = JSON.stringify(data); // plain data only: never class instances or functions
    const sum = checksum(json);
    // Nothing changed since the last write: skip it (the account and the archived endings rarely change).
    if (this.lastRecord && this.lastRecord.checksum === sum && this.lastRecord.saveVersion === this.version) {
      this.lastWrite = { ms: 0, bytes: json.length, seq: this.lastRecord.seq, skipped: true };
      return this.lastRecord;
    }
    if (this.seq == null) {
      const copies = await this._copies();
      const newer = this.refuseNewer ? this._newerIn(copies) : null;
      if (newer) throw new NewerSaveError(newer.raw.saveVersion, this.version); // never write over a newer game's save
      this.seq = Math.max(-1, ...copies.map((c) => c.seq));
    }
    const seq = this.seq + 1;
    const record = { saveVersion: this.version, savedAt: Date.now(), seq, checksum: sum, bytes: json.length, ...(meta?.trigger != null ? { trigger: meta.trigger } : {}), data: JSON.parse(json) };
    const k = this.slotKey(seq % this.rolling);
    await this.adapter.set(k, record);
    // Read it back: only a copy that checks out may become current (a bad one is never picked by load anyway).
    const back = await this._read(k);
    if (recordStatus(back) !== 'ok' || back.seq !== seq) {
      this.bus?.emit('save:failed', { key: this.key, seq });
      throw new Error(`Save ${this.key} did not read back correctly`);
    }
    this.seq = seq;
    this.lastSavedAt = record.savedAt;
    this.lastRecord = { saveVersion: record.saveVersion, seq, checksum: sum };
    const ms = (globalThis.performance?.now() ?? Date.now()) - t0;
    this.lastWrite = { ms, bytes: json.length, seq };
    this.bus?.emit('save:written', { key: this.key, savedAt: record.savedAt, seq, ms, bytes: json.length });
    return record;
  }

  // The newest copy that checks out and migrates. Damaged copies are skipped, never deleted or written over first.
  async load() {
    await this._chain;
    const copies = await this._copies();
    const damaged = [];
    const newer = this.refuseNewer ? this._newerIn(copies) : null;
    if (newer) {
      const err = new NewerSaveError(newer.raw.saveVersion, this.version);
      this.lastLoad = { record: null, from: null, fallback: false, damaged, error: err, newer: true };
      throw err;
    }
    for (const c of copies) {
      const st = recordStatus(c.raw);
      if (st === 'damaged') {
        damaged.push({ key: c.k, seq: c.seq, why: c.raw?.__unreadable ?? 'checksum' });
        continue;
      }
      try {
        const record = migrateSave(c.raw, { version: this.version, migrations: this.migrations });
        const problems = problemsOf(this.validate, record.data, record);
        if (problems.length) {
          damaged.push({ key: c.k, seq: c.seq, why: `failed the check: ${problems.slice(0, 3).join('; ')}`, problems });
          continue;
        }
        this.seq = Math.max(this.seq ?? -1, ...copies.map((x) => x.seq)); // new saves go above every copy, damaged ones too
        this.lastSavedAt = record.savedAt ?? null;
        // A copy too broken to read has no sequence number (it sorts last): it was the newer save when it sits where the
        // next save after this one would have gone (a write cut off half way). Any newer copy lost = a fallback.
        const lostNewer = copies.filter((x) => x !== c && recordStatus(x.raw) === 'damaged' && (x.seq > c.seq || (x.seq < 0 && x.slot === (c.seq + 1) % this.rolling)));
        for (const x of copies) if (x !== c && recordStatus(x.raw) === 'damaged' && !damaged.some((d) => d.key === x.k)) damaged.push({ key: x.k, seq: x.seq, why: x.raw?.__unreadable ?? 'checksum' });
        const fallback = lostNewer.length > 0 || damaged.some((d) => d.seq > c.seq);
        this.lastLoad = { record, from: c.k, fallback, damaged, error: null, trigger: c.raw.trigger ?? null };
        this.bus?.emit('save:loaded', { key: this.key, saveVersion: c.raw.saveVersion, from: c.k, fallback });
        return record.data;
      } catch (err) {
        damaged.push({ key: c.k, seq: c.seq, why: err.message });
      }
    }
    this.lastLoad = { record: null, from: null, fallback: false, damaged, error: damaged.length ? new Error(`Every copy of ${this.key} failed: ${damaged.map((d) => d.why).join('; ')}`) : null };
    if (this.lastLoad.error) throw this.lastLoad.error;
    return null;
  }

  async has() {
    return (await this._copies()).length > 0;
  }

  // The save inspector: every copy, newest first.
  async list() {
    const copies = await this._copies();
    const firstGood = copies.find((c) => ['ok', 'legacy'].includes(recordStatus(c.raw)));
    return copies.map((c) => ({
      key: c.k,
      slot: c.slot,
      seq: c.seq,
      version: c.raw?.saveVersion ?? null,
      savedAt: c.raw?.savedAt ?? null,
      bytes: c.raw?.bytes ?? (c.raw?.data ? JSON.stringify(c.raw.data).length : 0),
      status: recordStatus(c.raw),
      current: c === firstGood,
      trigger: c.raw?.trigger ?? null,
      newer: (c.raw?.saveVersion ?? 0) > this.version,
    }));
  }

  // The newest stored copy that checks out (the raw record, as stored), or null.
  async current() {
    await this._chain;
    return (await this._copies()).find((c) => ['ok', 'legacy'].includes(recordStatus(c.raw)))?.raw ?? null;
  }

  // Run a record (default: the current copy) through the migrations and the game's check without writing anything.
  async dryRun(raw = undefined) {
    const rec = raw === undefined ? await this.current() : raw;
    const trace = [];
    if (!rec) return { ok: false, trace, problems: [], error: 'No save to check', from: null, to: this.version };
    try {
      const out = migrateSave(rec, { version: this.version, migrations: this.migrations, trace });
      const problems = problemsOf(this.validate, out.data, out);
      return { ok: problems.length === 0, trace, problems, error: null, from: rec.saveVersion ?? 0, to: this.version };
    } catch (err) {
      return { ok: false, trace, problems: [], error: err.message, newer: !!err.newer, from: rec.saveVersion ?? 0, to: this.version };
    }
  }

  // Every stored copy, kept aside under one new key (the slot itself is left as it was). → that key, or null if empty
  async quarantine(now = Date.now()) {
    await this._chain;
    const copies = {};
    for (const k of [this.key, ...Array.from({ length: this.rolling }, (_, i) => this.slotKey(i))]) {
      const raw = await this._read(k);
      if (raw != null) copies[k] = raw;
    }
    if (!Object.keys(copies).length) return null;
    const qk = `${this.key}:quarantine:${now}`;
    await this.adapter.set(qk, { key: this.key, at: now, copies });
    return qk;
  }

  // Debug: spoil the current copy (its data changes, its checksum does not) — the next load must fall back.
  async damage() {
    await this._chain;
    const c = (await this._copies()).find((x) => recordStatus(x.raw) === 'ok');
    if (!c) return false;
    const bad = { ...c.raw, data: { ...c.raw.data, __damaged: Date.now() } };
    this.lastRecord = null;
    await this.adapter.set(c.k, bad);
    return c.k;
  }

  // Debug: a whole save record from a bug report (any older version) becomes the newest copy.
  async importRecord(raw) {
    const migrated = migrateSave(raw, { version: this.version, migrations: this.migrations }); // must migrate cleanly first
    const problems = problemsOf(this.validate, migrated.data, migrated); // … and pass the game's check (Milestone 30)
    if (problems.length) throw new Error(`That save failed the check: ${problems.slice(0, 3).join('; ')}`);
    await this._chain;
    if (this.seq == null) this.seq = Math.max(-1, ...(await this._copies()).map((c) => c.seq));
    const json = JSON.stringify(raw.data);
    const seq = this.seq + 1;
    const record = { ...raw, seq, checksum: checksum(json), bytes: json.length, data: JSON.parse(json) };
    await this.adapter.set(this.slotKey(seq % this.rolling), record);
    this.seq = seq;
    this.lastRecord = null;
    return record;
  }

  async clear() {
    await this._chain;
    for (let i = 0; i < this.rolling; i++) await this.adapter.remove(this.slotKey(i));
    await this.adapter.remove(this.key);
    this.seq = null;
    this.lastRecord = null;
    this.lastSavedAt = null;
  }
}

// The one-time move into the Milestone 22 layout. keys: ['campaign', 'account', …]; localPrefix: the old localStorage
// prefix ('robot-workshop:'); settingsKey: a localStorage settings item to copy too. Returns what was moved.
export async function moveLegacySaves({ adapter, keys, localPrefix, settingsKey = null, marker = 'meta:layout', layout = 2, storage = globalThis.localStorage ?? null }) {
  const done = await adapter.get(marker);
  if (done?.layout >= layout) return { already: true, moved: [] };
  const moved = [];
  const readLocal = (k) => {
    try {
      const raw = storage?.getItem(localPrefix + k);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };
  for (const key of keys) {
    const slot0 = await adapter.get(`${key}#0`);
    if (slot0) continue; // already in the new layout
    // The newest of: the old key in this database, the old key in localStorage.
    const candidates = [
      { from: 'indexeddb', raw: adapter.kind === 'localstorage' ? null : await adapter.get(key) },
      { from: 'localstorage', raw: adapter.kind === 'localstorage' ? await adapter.get(key) : readLocal(key) },
    ].filter((c) => c.raw && typeof c.raw.data === 'object');
    if (!candidates.length) continue;
    candidates.sort((a, b) => (b.raw.savedAt ?? 0) - (a.raw.savedAt ?? 0));
    const src = candidates[0];
    const json = JSON.stringify(src.raw.data);
    const record = { ...src.raw, seq: 0, checksum: checksum(json), bytes: json.length, movedFrom: src.from };
    await adapter.set(`${key}#0`, record);
    const back = await adapter.get(`${key}#0`);
    if (recordStatus(back) !== 'ok' || JSON.stringify(back.data) !== json) throw new Error(`Moving ${key} did not read back — nothing marked, will try again next time`);
    moved.push({ key, from: src.from, bytes: json.length, saveVersion: src.raw.saveVersion });
  }
  if (settingsKey) {
    try {
      const raw = storage?.getItem(settingsKey);
      if (raw && !(await adapter.get('settings'))) {
        await adapter.set('settings', { savedAt: Date.now(), values: JSON.parse(raw) });
        moved.push({ key: 'settings', from: 'localstorage' });
      }
    } catch {
      /* settings are small and also stay in localStorage */
    }
  }
  await adapter.set(marker, { layout, movedAt: Date.now(), moved });
  return { already: false, moved };
}
