// "Things on sale" (robots, dishes, ships…): limited active slots, a fixed sales cycle,
// and a monthly sales tick. How many sell each month comes from the game via hooks.
//
// Slots: a number or a function (e.g. slotsFromRank below, so the count grows with company rank).
// Novelty: if hooks.isCopy(newData, earlierProduct) says a launch is an exact copy of anything launched
// before, the product gets novelty = noveltyPenalty (e.g. 0.85), otherwise 1. The game's sales use it.
// hooks:
//   monthlySales(product, monthIndex) → { units, revenue, ...extra }   monthIndex 0 = first month on sale
//   onSale(product, sale)                                              after each month's sale is recorded
//   onEnd(product)                                                     cycle finished or retired
//   isCopy(data, earlierProduct) → bool                                 optional: the "exact copy" rule
// Emits: 'product:launch', 'product:sales', 'product:end'.
export class ProductSystem {
  constructor({ bus = null, slots = 2, cycleMonths = 6, noveltyPenalty = 1, hooks = {} }) {
    this.bus = bus;
    this.noveltyPenalty = noveltyPenalty;
    this.slots = slots; // number, or () => number
    this.cycleMonths = cycleMonths;
    this.hooks = hooks;
    this.products = []; // every product ever launched (active, ended and retired)
    this.nextId = 1;
  }

  get slotCount() {
    return typeof this.slots === 'function' ? this.slots() : this.slots;
  }

  get active() {
    return this.products.filter((p) => p.status === 'active');
  }

  get freeSlots() {
    return Math.max(0, this.slotCount - this.active.length);
  }

  get(id) {
    return this.products.find((p) => p.id === id) || null;
  }

  // fields: { name, launchedAt, data } — data is the game's own info (price position, quality…).
  launch({ name, launchedAt = null, data = {} }) {
    if (!this.freeSlots) return null;
    const copy = this.copyOf(data);
    const p = {
      id: `P${this.nextId++}`,
      name,
      launchedAt,
      status: 'active',
      monthsOnSale: 0,
      sales: [], // { month, units, revenue, ... }
      totalUnits: 0,
      totalRevenue: 0,
      novelty: copy ? this.noveltyPenalty : 1,
      copyOf: copy ? copy.id : null,
      data,
    };
    this.products.push(p);
    this.bus?.emit('product:launch', { product: p });
    return p;
  }

  // Would launching this data be an exact copy of an earlier product? Returns that product or null.
  copyOf(data) {
    if (!this.hooks.isCopy) return null;
    return this.products.find((p) => this.hooks.isCopy(data, p)) || null;
  }

  noveltyFor(data) {
    return this.copyOf(data) ? this.noveltyPenalty : 1;
  }

  monthsLeft(p) {
    return p.status === 'active' ? this.cycleMonths - p.monthsOnSale : 0;
  }

  retire(id) {
    const p = this.get(id);
    if (!p || p.status !== 'active') return false;
    p.status = 'retired';
    this.hooks.onEnd?.(p);
    this.bus?.emit('product:end', { product: p, reason: 'retired' });
    return true;
  }

  // Call once per month end: every active product sells for its current month.
  monthlyTick() {
    for (const p of this.active) {
      const sale = { month: p.monthsOnSale + 1, ...this.hooks.monthlySales(p, p.monthsOnSale) };
      p.sales.push(sale);
      p.totalUnits += sale.units;
      p.totalRevenue += sale.revenue;
      p.monthsOnSale++;
      this.hooks.onSale?.(p, sale);
      this.bus?.emit('product:sales', { product: p, sale });
      if (p.monthsOnSale >= this.cycleMonths) {
        p.status = 'ended';
        this.hooks.onEnd?.(p);
        this.bus?.emit('product:end', { product: p, reason: 'cycle' });
      }
    }
  }

  serialize() {
    return { nextId: this.nextId, products: JSON.parse(JSON.stringify(this.products)) };
  }

  load(s) {
    this.nextId = s?.nextId ?? 1;
    this.products = JSON.parse(JSON.stringify(s?.products ?? []));
  }
}

// Slot count from a rank ladder: steps = [{ minRankIndex, slots }, …]. rankIndex comes from the game.
export function slotsFromRank(steps, rankIndex) {
  let n = 0;
  for (const st of steps) if (rankIndex >= st.minRankIndex && st.slots > n) n = st.slots;
  return n;
}
