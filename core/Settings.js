// Player settings on this device (Milestone 21, bible §6.3 Settings), for any series game. The game gives the list
// of settings and their defaults as data; values live in browser storage under one key and survive new runs and
// Reset Save of the campaign (they are the device's, not the run's).
//   const s = new Settings({ key: 'robot-workshop:settings', defaults: { textSize: 'normal', … } })
//   s.get(id) · s.set(id, value) · s.all · s.onChange((id, value) => …) · s.reset()
//   s.attachStore(adapter, key) (Milestone 22): the settings save slot (§37.2) in the main database. localStorage stays
//     the quick copy read before the first frame; if it was wiped, the values come back from the slot.
export class Settings {
  constructor({ key, defaults = {}, storage = globalThis.localStorage ?? null }) {
    this.key = key;
    this.defaults = { ...defaults };
    this.storage = storage;
    this.listeners = [];
    this.values = { ...this.defaults };
    this.fromLocal = false;
    this.store = null;
    try {
      const raw = storage?.getItem(key);
      if (raw) this.fromLocal = true;
      if (raw) for (const [k, v] of Object.entries(JSON.parse(raw))) if (k in this.defaults) this.values[k] = v;
    } catch {
      /* private mode or a broken value: defaults */
    }
  }

  get all() {
    return { ...this.values };
  }

  get(id) {
    return this.values[id];
  }

  set(id, value) {
    if (!(id in this.defaults) || this.values[id] === value) return;
    this.values[id] = value;
    this._save();
    for (const fn of this.listeners) fn(id, value);
  }

  onChange(fn) {
    this.listeners.push(fn);
    return this;
  }

  reset() {
    for (const [k, v] of Object.entries(this.defaults)) this.set(k, v);
  }

  async attachStore(adapter, key = 'settings') {
    this.store = { adapter, key };
    try {
      const saved = await adapter.get(key);
      if (!this.fromLocal && saved?.values) {
        for (const [k, v] of Object.entries(saved.values)) if (k in this.defaults) this.set(k, v);
      } else await this._saveStore();
    } catch {
      /* the quick copy still works */
    }
  }

  async _saveStore() {
    await this.store?.adapter.set(this.store.key, { savedAt: Date.now(), values: { ...this.values } });
  }

  _save() {
    this._saveStore()?.catch?.(() => {});
    try {
      this.storage?.setItem(this.key, JSON.stringify(this.values));
    } catch {
      /* storage full or blocked: the setting still works until the page closes */
    }
  }
}
