import { migrateSave } from './SaveStore.js';
// One save slot with a version number (the pre-Milestone 22 single-key slot; the game now uses core/SaveStore.js
// SaveSlot, which reads this layout too). Every load goes through migrate() so old saves
// are upgraded step by step (bible §37.6). The game decides what goes inside `data`.
//
//   migrations: { 1: (record) => record at version 2, 2: (record) => version 3, ... }
export class SaveManager {
  constructor({ adapter, key = 'campaign', version = 1, migrations = {}, bus = null }) {
    this.adapter = adapter;
    this.key = key;
    this.version = version;
    this.migrations = migrations;
    this.bus = bus;
    this.lastSavedAt = null;
  }

  async save(data) {
    // JSON round-trip: stores plain data only, never class instances or functions.
    const record = { saveVersion: this.version, savedAt: Date.now(), data: JSON.parse(JSON.stringify(data)) };
    await this.adapter.set(this.key, record);
    this.lastSavedAt = record.savedAt;
    this.bus?.emit('save:written', { key: this.key, savedAt: record.savedAt });
    return record;
  }

  // Returns the (migrated) data, or null if there is no save.
  async load() {
    const raw = await this.adapter.get(this.key);
    if (!raw) return null;
    const record = this.migrate(raw);
    this.lastSavedAt = record.savedAt ?? null;
    this.bus?.emit('save:loaded', { key: this.key, saveVersion: record.saveVersion });
    return record.data;
  }

  migrate(raw) {
    return migrateSave(raw, { version: this.version, migrations: this.migrations });
  }

  async has() {
    return (await this.adapter.get(this.key)) != null;
  }

  async clear() {
    await this.adapter.remove(this.key);
    this.lastSavedAt = null;
  }
}
