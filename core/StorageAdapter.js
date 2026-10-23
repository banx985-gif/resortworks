// Key → value storage. All adapters share: async get(key), set(key, value), remove(key).
// createStorageAdapter() picks IndexedDB, falls back to localStorage, then to memory (nothing persists).
// Milestone 35: FallbackAdapter (IndexedDB with localStorage behind it, per write) when asked for.
export class IndexedDbAdapter {
  constructor(dbName = 'canvas-series', storeName = 'saves') {
    this.kind = 'indexeddb';
    this.dbName = dbName;
    this.storeName = storeName;
    this.db = null;
  }

  open() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return reject(new Error('IndexedDB not available'));
      const req = indexedDB.open(this.dbName, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(this.storeName);
      req.onsuccess = () => {
        this.db = req.result;
        resolve(this);
      };
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('IndexedDB blocked'));
    });
  }

  _run(mode, fn) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(this.storeName, mode);
      const req = fn(tx.objectStore(this.storeName));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  async get(key) {
    const v = await this._run('readonly', (s) => s.get(key));
    return v ?? null;
  }

  set(key, value) {
    return this._run('readwrite', (s) => s.put(value, key));
  }

  remove(key) {
    return this._run('readwrite', (s) => s.delete(key));
  }
}

export class LocalStorageAdapter {
  constructor(prefix = 'canvas-series:') {
    this.kind = 'localstorage';
    this.prefix = prefix;
  }

  async get(key) {
    const raw = localStorage.getItem(this.prefix + key);
    return raw == null ? null : JSON.parse(raw);
  }

  async set(key, value) {
    localStorage.setItem(this.prefix + key, JSON.stringify(value));
  }

  async remove(key) {
    localStorage.removeItem(this.prefix + key);
  }
}

export class MemoryAdapter {
  constructor() {
    this.kind = 'memory';
    this.map = new Map();
  }

  async get(key) {
    return this.map.has(key) ? structuredClone(this.map.get(key)) : null;
  }

  async set(key, value) {
    this.map.set(key, structuredClone(value));
  }

  async remove(key) {
    this.map.delete(key);
  }
}

// Milestone 35 (DEVWORKS; any game can opt in): IndexedDB first, localStorage as the fallback when a write to IndexedDB
// throws (quota full, the database closed, a private window). Every value written to the fallback is marked as the
// newer copy of that key, so a read after a failed write still finds it — also after a reload with IndexedDB working
// again (a save record's seq / savedAt decides which copy is newer). Switching between the two never loses a save.
//   kind 'indexeddb+local' · degraded: a write has gone to localStorage · lastError
export class FallbackAdapter {
  constructor(primary, secondary) {
    this.primary = primary;
    this.secondary = secondary;
    this.kind = `${primary.kind}+${secondary.kind === 'localstorage' ? 'local' : secondary.kind}`;
    this.degraded = false;
    this.lastError = null;
  }

  static newer(a, b) {
    if (a == null) return b;
    if (b == null) return a;
    const rank = (v) => (typeof v === 'object' ? [v.seq ?? -Infinity, v.savedAt ?? -Infinity] : [-Infinity, -Infinity]);
    const [ra, rb] = [rank(a), rank(b)];
    return rb[0] > ra[0] || (rb[0] === ra[0] && rb[1] > ra[1]) ? b : a;
  }

  async get(key) {
    let p = null;
    let failed = false;
    try {
      p = await this.primary.get(key);
    } catch (err) {
      failed = true;
      this.lastError = err;
    }
    let s = null;
    try {
      s = await this.secondary.get(key);
    } catch {
      s = null;
    }
    return failed ? s : FallbackAdapter.newer(p, s);
  }

  async set(key, value) {
    try {
      await this.primary.set(key, value);
    } catch (err) {
      this.degraded = true;
      this.lastError = err;
      console.warn('[Storage] IndexedDB write failed, saved to localStorage instead', key, err);
      await this.secondary.set(key, value);
      return;
    }
    // A written primary copy is the newest now: an older fallback copy of this key is dropped.
    try {
      if ((await this.secondary.get(key)) != null) await this.secondary.remove(key);
    } catch {
      /* nothing there */
    }
  }

  async remove(key) {
    let err = null;
    try {
      await this.primary.remove(key);
    } catch (e) {
      err = e;
    }
    try {
      await this.secondary.remove(key);
    } catch {
      /* nothing there */
    }
    if (err && !this.degraded) throw err;
  }
}

// RACEWORKS Milestone 30: ask the browser to keep this site's storage (no eviction when the phone runs low on space).
// → true when it is (or now will be) kept; false when refused or not supported. Never throws.
export async function askPersistentStorage(nav = globalThis.navigator) {
  try {
    if (await nav?.storage?.persisted?.()) return true;
    return !!(await nav?.storage?.persist?.());
  } catch {
    return false;
  }
}

// fallback: true → IndexedDB wrapped in a FallbackAdapter (localStorage behind it). preferLocal: true → skip IndexedDB
// (a test switch: "IndexedDB off").
export async function createStorageAdapter({ dbName = 'canvas-series', prefix = 'canvas-series:', fallback = false, preferLocal = false } = {}) {
  try {
    if (preferLocal) throw new Error('IndexedDB switched off');
    const idb = await new IndexedDbAdapter(dbName).open();
    if (!fallback) return idb;
    try {
      const probe = `${prefix}__probe`;
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      return new FallbackAdapter(idb, new LocalStorageAdapter(prefix));
    } catch {
      return idb;
    }
  } catch (err) {
    console.warn('[Storage] IndexedDB unavailable, using localStorage', err);
  }
  try {
    const probe = `${prefix}__probe`;
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return new LocalStorageAdapter(prefix);
  } catch (err) {
    console.warn('[Storage] localStorage unavailable, saves will not persist', err);
  }
  return new MemoryAdapter();
}
