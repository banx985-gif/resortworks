// Items (series common feature §4, first built for DEVWORKS Milestone 40e; any series game): things given to a person
// that permanently raise one of the stats training raises, then are used up. Content-free: the types, groups, rarities,
// caps and sources are game data; the game says how to read and raise a person's stat.
//
//   const items = new ItemSystem({ types, rarities, rules, rng, bus, person, statOf, statCap, raise, morale })
//     types: [{ id, name, group, stat, gainMult? }] · rarities: { id: { name, gain, sell, weight } } (gain = stat points)
//     gainMult (optional, BOTWORKS Milestone 26c): this type's share of the rarity's points, at least 1 (e.g. 0.34 for an
//       item that raises every stat a little — the game's statOf / raise decide what its stat means); none = ×1
//     rules: { inventoryMax, periodCap (item points per person per period), loveMult 1.5, dislikeMult 0.5,
//              loveMorale (morale for a loved item), likes: { loves: [min, max], dislikeChance },
//              periodWord ('this year' — the period's name in the no-points-left reason; GOALWORKS M12c: 'this season') }
//     person(id) → the person or null · statOf(p, stat) · statCap(p, stat) · raise(p, stat, n) · morale(p, n)
//   Inventory: add(typeId, rarity, source) → the item or null (full: 'item:full') · remove / sell(uid) → money
//   Likes: likesOf(id) → { loves: [group], dislike: group | null } · setLikes(id, likes) · rollLikes(id, groups)
//   preview(uid, personId) → { ok, why, stat, base, mult, like, gain, capped } — the exact gain before giving
//   give(uid, personId) → the preview, applied (the item is used up; 'item:given')
//   newPeriod(key) — a new season / year: every person's period points start again
//   serialize() / load(data)
export class ItemSystem {
  constructor({ types, rarities, rules = {}, rng = null, bus = null, person, statOf, statCap, raise, morale = () => {} }) {
    this.types = types;
    this.byType = Object.fromEntries(types.map((t) => [t.id, t]));
    this.rarities = rarities;
    this.rules = { inventoryMax: 20, periodCap: 40, loveMult: 1.5, dislikeMult: 0.5, loveMorale: 3, likes: { loves: [1, 2], dislikeChance: 0.5 }, ...rules };
    this.rng = rng;
    this.bus = bus;
    this.person = person;
    this.statOf = statOf;
    this.statCap = statCap;
    this.raiseStat = raise;
    this.morale = morale;
    this.reset();
  }

  reset() {
    this.inventory = []; // [{ uid, type, rarity, source, day }]
    this.likes = {}; // personId → { loves, dislike }
    this.points = {}; // personId → points used this period
    this.received = {}; // personId → [{ type, rarity, stat, gain }]
    this.period = null;
    this.nextUid = 1;
  }

  get full() {
    return this.inventory.length >= this.rules.inventoryMax;
  }

  typeOf(item) {
    return this.byType[item?.type] ?? null;
  }

  // A rarity by the data's weights (sources may pass their own weights).
  rollRarity(weights = null) {
    const w = weights ?? Object.fromEntries(Object.entries(this.rarities).map(([k, r]) => [k, r.weight ?? 1]));
    const total = Object.values(w).reduce((a, b) => a + b, 0);
    let x = (this.rng ? this.rng.next() : Math.random()) * total;
    for (const [k, v] of Object.entries(w)) if ((x -= v) < 0) return k;
    return Object.keys(w)[0];
  }

  rollType(filter = null) {
    const list = filter ? this.types.filter(filter) : this.types;
    return list[Math.floor((this.rng ? this.rng.next() : Math.random()) * list.length)]?.id ?? null;
  }

  add(typeId, rarity, source = null, day = 0) {
    if (!this.byType[typeId] || !this.rarities[rarity]) return null;
    if (this.full) {
      this.bus?.emit('item:full', { type: typeId, rarity, source });
      return null;
    }
    const item = { uid: `I${this.nextUid++}`, type: typeId, rarity, source, day };
    this.inventory.push(item);
    this.bus?.emit('item:gained', { item, source });
    return item;
  }

  get(uid) {
    return this.inventory.find((x) => x.uid === uid) ?? null;
  }

  remove(uid) {
    const i = this.inventory.findIndex((x) => x.uid === uid);
    if (i < 0) return null;
    return this.inventory.splice(i, 1)[0];
  }

  sellValue(uid) {
    const it = this.get(uid);
    return it ? (this.rarities[it.rarity]?.sell ?? 0) : 0;
  }

  // Sold back: the money is the game's to pay (returned here).
  sell(uid) {
    const value = this.sellValue(uid);
    const it = this.remove(uid);
    if (!it) return null;
    this.bus?.emit('item:sold', { item: it, value });
    return value;
  }

  likesOf(id) {
    return this.likes[id] ?? { loves: [], dislike: null };
  }

  setLikes(id, likes) {
    this.likes[id] = { loves: [...(likes.loves ?? [])], dislike: likes.dislike ?? null };
  }

  // A person with no fixed likes: 1–2 loved groups and maybe one disliked (kept in the save).
  rollLikes(id, groups) {
    const r = () => (this.rng ? this.rng.next() : Math.random());
    const pool = [...groups];
    const [lo, hi] = this.rules.likes.loves;
    const n = lo + Math.floor(r() * (hi - lo + 1));
    const loves = [];
    for (let i = 0; i < n && pool.length; i++) loves.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
    const dislike = pool.length && r() < this.rules.likes.dislikeChance ? pool[Math.floor(r() * pool.length)] : null;
    this.setLikes(id, { loves, dislike });
    return this.likes[id];
  }

  pointsLeft(id) {
    return Math.max(0, this.rules.periodCap - (this.points[id] ?? 0));
  }

  preview(uid, personId) {
    const it = this.get(uid);
    const t = this.typeOf(it);
    const p = this.person(personId);
    if (!it || !t) return { ok: false, why: 'No such item' };
    if (!p) return { ok: false, why: 'Nobody to give it to' };
    const lk = this.likesOf(personId);
    const like = lk.loves.includes(t.group) ? 'love' : lk.dislike === t.group ? 'dislike' : null;
    const mult = like === 'love' ? this.rules.loveMult : like === 'dislike' ? this.rules.dislikeMult : 1;
    const base = t.gainMult == null ? this.rarities[it.rarity].gain : Math.max(1, Math.round(this.rarities[it.rarity].gain * t.gainMult));
    const want = Math.max(1, Math.round(base * mult));
    const now = this.statOf(p, t.stat);
    const room = Math.max(0, this.statCap(p, t.stat) - now);
    const left = this.pointsLeft(personId);
    const gain = Math.min(want, room, left);
    const capped = gain < want ? (room <= left ? 'tier' : 'period') : null;
    const why = gain <= 0 ? (capped === 'tier' ? 'Already at their tier cap' : `No item points left ${this.rules.periodWord ?? 'this year'}`) : null;
    return { ok: !why, why, stat: t.stat, base, mult, like, want, gain, capped, now };
  }

  give(uid, personId) {
    const pv = this.preview(uid, personId);
    if (!pv.ok) return pv;
    const it = this.remove(uid);
    const p = this.person(personId);
    this.raiseStat(p, pv.stat, pv.gain);
    this.points[personId] = (this.points[personId] ?? 0) + pv.gain;
    if (pv.like === 'love') this.morale(p, this.rules.loveMorale);
    (this.received[personId] ??= []).push({ type: it.type, rarity: it.rarity, stat: pv.stat, gain: pv.gain });
    this.bus?.emit('item:given', { item: it, personId, ...pv });
    return { ...pv, item: it };
  }

  newPeriod(key) {
    if (this.period === key) return;
    this.period = key;
    this.points = {};
  }

  serialize() {
    return JSON.parse(JSON.stringify({ inventory: this.inventory, likes: this.likes, points: this.points, received: this.received, period: this.period, nextUid: this.nextUid }));
  }

  load(data) {
    this.reset();
    if (!data) return;
    this.inventory = [...(data.inventory ?? [])];
    this.likes = { ...(data.likes ?? {}) };
    this.points = { ...(data.points ?? {}) };
    this.received = { ...(data.received ?? {}) };
    this.period = data.period ?? null;
    this.nextUid = data.nextUid ?? this.inventory.length + 1;
  }
}
