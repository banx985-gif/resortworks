// In-game store stand-in (bible §20.8 Tech Chip sinks; the real store/IAP layer comes later).
// Items are plain data: { itemId: { currency, cost, name } }. purchase() spends through the EconomySystem
// and never lets a balance go below zero. Real-money purchases are not part of this stub.
export class StoreStub {
  constructor({ economy, items = {}, bus = null }) {
    this.economy = economy;
    this.items = items;
    this.bus = bus;
  }

  // Why it can't be bought now, or null.
  block(itemId) {
    const it = this.items[itemId];
    if (!it) return 'Not in the store';
    if (this.economy.balance(it.currency) < it.cost) return `Needs ${it.cost} ${this.economy.currencies?.[it.currency]?.name ?? it.currency}`;
    return null;
  }

  // Returns { ok, reason }.
  purchase(itemId, reason = null) {
    const b = this.block(itemId);
    if (b) return { ok: false, reason: b };
    const it = this.items[itemId];
    this.economy.add(it.currency, -it.cost, reason ?? `Store: ${it.name ?? itemId}`, 'store');
    this.bus?.emit('store:purchase', { itemId, item: it });
    return { ok: true, reason: null };
  }
}
