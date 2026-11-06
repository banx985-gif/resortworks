// Staff Items (Milestone 14, bible §27D2) on the shared core/ItemSystem (inventory, likes, selling back, the save), with
// RESORTWORKS's own rules in a small extension (game folder, not core): each type has its own rarity and gain; Role
// Mastery items raise the role's primary stat or both of its stats (data/items.js MASTERY); loved ×1.5 rounded up (+3
// Morale), disliked ×0.5 rounded down (at least 1); 12 item points a person each campaign year counted by rarity (Common 1
// … Legendary 4); stats never past 100 (the overflow is lost; the preview warns first). A full inventory sends rewards to
// the Inbox for 28 days. Items come only from the live sources in data/items.js ITEM_SOURCES — nothing is ever bought.
// Rolls use one seeded random whose state is saved (a reload never re-rolls).
//   freshItems() → the save's `items`
//   createItems({ saved, bus, team, seed, now, progress, finance }) → items
//     items.inventory · max · inbox · grant(source, { type?, rarity? }) · preview(uid, staffId) · give(uid, staffId)
//     sell(uid) · claim(inboxId) · likesOf(id) · pointsLeft(id) · received(id) · onEdge(day, band) · serialize()
import { ItemSystem } from '../../../../core/ItemSystem.js';
import { Rng } from '../../../../core/Rng.js';
import { ITEM_TYPES, ITEM_RARITIES, ITEM_GROUPS, ITEM_RULES, ITEM_SOURCES, INVENTORY, MASTERY, itemType } from '../../data/items.js';
import { STAT_KEYS } from '../../data/staff.js';
import { restat } from './staff.js';
import { MINUTES_PER_DAY } from './calendar.js';
import { CALENDAR } from '../../data/calendar.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
const DAYS_PER_YEAR = CALENDAR.daysPerMonth * CALENDAR.monthsPerYear;
export const freshItems = () => ({ sys: null, rng: null, inbox: [], nextInbox: 1, log: [], stats: { gained: 0, given: 0, sold: 0, expired: 0, toInbox: 0 } });

// The stats an item raises for this person.
export function itemStats(t, role) {
  if (t.stat === 'primary') return [MASTERY[role][0]];
  if (t.stat === 'both') return [...MASTERY[role]];
  return [t.stat];
}

class ResortItemSystem extends ItemSystem {
  // The exact gain before giving (bible §27D2): its gain × like (loved ×1.5 up, disliked ×0.5 down, at least 1), never past
  // 100 on any stat, never past the year's item points (counted by rarity).
  preview(uid, personId) {
    const it = this.get(uid);
    const t = itemType(it?.type);
    const p = this.person(personId);
    if (!it || !t) return { ok: false, why: 'No such item.' };
    if (!p) return { ok: false, why: 'Nobody to give it to.' };
    const lk = this.likesOf(personId);
    const like = lk.loves.includes(t.group) ? 'love' : lk.dislike === t.group ? 'dislike' : null;
    const want = like === 'love' ? Math.ceil(t.gain * this.rules.loveMult) : like === 'dislike' ? Math.max(1, Math.floor(t.gain * this.rules.dislikeMult)) : t.gain;
    const stats = itemStats(t, p.role);
    const gains = Object.fromEntries(stats.map((k) => [k, Math.max(0, Math.min(want, ITEM_RULES.statCap - Math.floor(p.stats[k] ?? 0)))]));
    const lost = stats.reduce((n, k) => n + (want - gains[k]), 0);
    const points = ITEM_RARITIES[it.rarity].points;
    if (this.pointsLeft(personId) < points) return { ok: false, why: `No item points left this year (${this.pointsLeft(personId)} of ${this.rules.periodCap}).`, like, want, gains, stats, points };
    if (stats.every((k) => gains[k] <= 0)) return { ok: false, why: 'Already at the top for that stat.', like, want, gains, stats, points };
    return { ok: true, why: null, like, want, gains, stats, points, lost, gain: Math.max(...Object.values(gains)), stat: stats[0] };
  }
  give(uid, personId) {
    const pv = this.preview(uid, personId);
    if (!pv.ok) return pv;
    const it = this.remove(uid);
    const p = this.person(personId);
    for (const k of pv.stats) if (pv.gains[k] > 0) this.raiseStat(p, k, pv.gains[k]);
    this.points[personId] = (this.points[personId] ?? 0) + pv.points;
    if (pv.like === 'love') this.morale(p, this.rules.loveMorale);
    (this.received[personId] ??= []).push({ type: it.type, rarity: it.rarity, gains: pv.gains });
    this.bus?.emit('item:given', { item: it, personId, ...pv });
    return { ...pv, item: it };
  }
}

export function createItems({ saved = null, bus = null, team = [], seed = 'resortworks', now = () => 0, progress = null, finance = null } = {}) {
  const s = load(saved);
  const rng = new Rng(`${seed}:items`);
  if (s.rng != null) rng.setState(s.rng);
  const day = () => Math.floor(now() / MINUTES_PER_DAY);
  const yearOf = (d) => Math.floor(d / DAYS_PER_YEAR);
  const sys = new ResortItemSystem({
    types: ITEM_TYPES.map((t) => ({ id: t.id, name: t.name, group: t.group, stat: t.stat })),
    rarities: Object.fromEntries(Object.entries(ITEM_RARITIES).map(([k, r]) => [k, { name: r.name, gain: 1, sell: r.sell, weight: r.weight }])),
    rules: { inventoryMax: INVENTORY[progress?.stage ?? 'roadside'] ?? 40, periodCap: ITEM_RULES.yearPoints, loveMult: ITEM_RULES.loveMult, dislikeMult: ITEM_RULES.dislikeMult, loveMorale: ITEM_RULES.loveMorale, periodWord: 'this year' },
    rng,
    bus,
    person: (id) => team.find((m) => m.id === id) ?? null,
    statOf: (p, k) => p.stats[k] ?? 0,
    statCap: () => ITEM_RULES.statCap,
    raise: (p, k, n) => {
      p.model.counters[`bonus_${k}`] = (p.model.counters[`bonus_${k}`] ?? 0) + n; // (kept through level-ups: staff.js restat)
      restat(p);
    },
    morale: (p, n) => {
      p.model.morale = Math.min(100, (p.model.morale ?? 70) + n);
    },
  });
  sys.load(s.sys);
  sys.newPeriod(`Y${yearOf(day())}`);
  const capNow = () => INVENTORY[progress?.stage ?? 'roadside'] ?? 40;
  // Each person loves 2 groups and dislikes 0–1, fixed from who they are (their id alone).
  function ensureLikes(m) {
    if (sys.likes[m.id]) return;
    const r = new Rng(`likes:${m.id}`);
    const pool = ITEM_GROUPS.map((g) => g.id);
    const loves = [];
    for (let i = 0; i < ITEM_RULES.loves; i++) loves.push(pool.splice(r.int(0, pool.length - 1), 1)[0]);
    const dislike = r.next() < ITEM_RULES.dislikeChance ? pool[r.int(0, pool.length - 1)] : null;
    sys.setLikes(m.id, { loves, dislike });
  }
  for (const m of team) ensureLikes(m);
  const changed = (what) => bus?.emit('items:change', { what });
  const log = (line) => {
    s.log.unshift({ day: day(), line });
    if (s.log.length > 30) s.log.length = 30;
  };
  // A reward: from a live source only (nothing bought); random type and rarity unless given; full → the Inbox.
  function grant(source, { type = null, rarity = null } = {}) {
    const src = ITEM_SOURCES[source];
    if (!src || !src.live) return null;
    const rar = rarity ?? sys.rollRarity(Object.fromEntries(Object.entries(ITEM_RARITIES).map(([k, r]) => [k, r.weight])));
    const pool = ITEM_TYPES.filter((t) => t.rarity === rar);
    const t = type ? itemType(type) : pool[Math.floor(rng.next() * pool.length)];
    if (!t || (rarity && t.rarity !== rarity)) return null;
    sys.rules.inventoryMax = capNow();
    s.stats.gained++;
    if (sys.full) {
      const e = { id: `X${s.nextInbox++}`, type: t.id, rarity: t.rarity, source, day: day(), expires: day() + ITEM_RULES.inboxDays };
      s.inbox.push(e);
      s.stats.toInbox++;
      log(`${t.name} waits in the Inbox (the store is full).`);
      bus?.emit('items:inbox', { entry: { ...e } });
      changed('inbox');
      return { inbox: e };
    }
    const item = sys.add(t.id, t.rarity, source, day());
    log(`${src.name}: ${t.name}.`);
    bus?.emit('items:new', { item: { ...item }, name: t.name, source: src.name });
    changed('add');
    return item;
  }
  // Rewards from what happens: a 4★+ review, a training session, each month end (a well-wisher).
  bus?.on('review:new', ({ review } = {}) => {
    if (review?.stars >= 4 && new Rng(`${seed}:item:stay:${review.id}`).next() < ITEM_SOURCES.stay.chance) grant('stay');
  });
  bus?.on('staff:trained', ({ id, day: d } = {}) => {
    if (new Rng(`${seed}:item:train:${id}:${d}`).next() < ITEM_SOURCES.training.chance) grant('training');
  });
  const items = {
    get inventory() {
      return sys.inventory.map((x) => ({ ...x }));
    },
    get max() {
      return capNow();
    },
    get inbox() {
      return s.inbox.map((x) => ({ ...x }));
    },
    get log() {
      return s.log;
    },
    get stats() {
      return { ...s.stats };
    },
    grant,
    preview(uid, id) {
      items.likesOf(id);
      return sys.preview(uid, id);
    },
    give(uid, id) {
      items.likesOf(id);
      const r = sys.give(uid, id);
      if (r.ok) {
        s.stats.given++;
        log(`${itemType(r.item.type).name} → ${team.find((m) => m.id === id)?.name ?? id}.`);
        changed('give');
      }
      return r;
    },
    sellValue: (uid) => sys.sellValue(uid),
    sell(uid) {
      const it = sys.get(uid);
      const v = sys.sell(uid);
      if (v == null) return null;
      finance?.earn('itemSales', v, day(), it.type);
      s.stats.sold++;
      changed('sell');
      return v;
    },
    claim(inboxId) {
      const e = s.inbox.find((x) => x.id === inboxId);
      if (!e) return { ok: false, why: 'Gone.' };
      sys.rules.inventoryMax = capNow();
      if (sys.full) return { ok: false, why: `The store is full (${capNow()}): give or sell something first.` };
      s.inbox = s.inbox.filter((x) => x !== e);
      sys.add(e.type, e.rarity, e.source, e.day);
      changed('claim');
      return { ok: true };
    },
    likesOf: (id) => {
      const m = team.find((x) => x.id === id);
      if (m) ensureLikes(m);
      return sys.likesOf(id);
    },
    pointsLeft: (id) => sys.pointsLeft(id),
    received: (id) => sys.received[id] ?? [],
    // Every band edge: a new year resets the item points; the Inbox drops what is 28 days old; a month end may bring a
    // well-wisher's gift; new people get their likes.
    onEdge(d, band) {
      if (band !== 0) return;
      sys.newPeriod(`Y${yearOf(d)}`);
      const old = s.inbox.length;
      s.inbox = s.inbox.filter((e) => e.expires > d);
      s.stats.expired += old - s.inbox.length;
      if (d > 0 && d % CALENDAR.daysPerMonth === 0 && new Rng(`${seed}:item:wish:${d}`).next() < ITEM_SOURCES.wellwisher.chance) grant('wellwisher');
      for (const m of team) ensureLikes(m);
      s.rng = rng.state;
    },
    serialize() {
      s.sys = sys.serialize();
      s.rng = rng.state;
      return clone(s);
    },
  };
  return items;
}

function load(saved) {
  const f = freshItems();
  if (!saved || typeof saved !== 'object') return f;
  const s = clone(saved);
  return {
    sys: s.sys && Array.isArray(s.sys.inventory) ? { ...s.sys, inventory: s.sys.inventory.filter((x) => itemType(x.type) && ITEM_RARITIES[x.rarity]) } : null,
    rng: Number.isFinite(s.rng) ? s.rng : null,
    inbox: Array.isArray(s.inbox) ? s.inbox.filter((e) => itemType(e.type)) : [],
    nextInbox: Number.isFinite(s.nextInbox) ? s.nextInbox : 1,
    log: Array.isArray(s.log) ? s.log.slice(0, 30) : [],
    stats: { ...f.stats, ...(s.stats ?? {}) },
  };
}
export { STAT_KEYS };
