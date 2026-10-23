// Purchases behind one interface (bible §32.2–32.6): buy, restore, the product list with the store's own prices, and
// plain messages when the store can't be reached or the player backs out. The real Google Play / App Store hook-up
// comes later as another provider; until then there is no provider (the store says it's unavailable) or, in debug
// builds, the pretend one. No money moves here: the game's grant() decides what a finished purchase gives.
//
// A provider (all async):
//   getProducts(keys)  → { status: 'ok', products: [{ key, price, title }] } | { status: 'offline' | 'unavailable' }
//   purchase(key)      → { status: 'purchased', transaction: { id, productKey, time, expiresAt? } }
//                        | { status: 'cancelled' | 'failed' | 'offline' | 'unavailable' }
//   finish(txId)       the purchase has been granted and saved; the store may stop re-delivering it
//   pending()          → [transaction] bought but never finished (the app closed in between): delivered again
//   restore()          → { status: 'ok', removeAds, vip: { active, expiresAt } } | { status: 'offline' | 'unavailable' }
//   status()           the same as restore(), used for the quiet "recheck when online"
//
// Products (game data): { [key]: { kind: 'consumable' | 'nonConsumable' | 'subscription', entitlement?: 'removeAds' | 'vip' } }
// Every purchase is idempotent (§32.6): its transaction id is recorded (EntitlementService.markProcessed) and a
// transaction seen before grants nothing — also after a save and reload, and when the store delivers it again.
// A cancelled, failed or offline purchase changes nothing at all.
//
//   new CommerceService({ provider, products, entitlements, grant(product, tx), commit(), messages, now, bus })
//   await loadProducts() → { ok, products, message }
//   await buy(key)       → { ok, status, message, granted, duplicate }
//   await restore()      → { ok, status, message, removeAds, vip }
//   await recheck()      → a quiet store check (online only)
//   await processPending() → re-delivered purchases, each granted at most once
// Emits 'commerce:purchased' ({ key, tx, granted }) and 'commerce:restored'.
export const NO_STORE_PROVIDER = Object.freeze({
  id: 'none',
  getProducts: async () => ({ status: 'unavailable' }),
  purchase: async () => ({ status: 'unavailable' }),
  finish: async () => {},
  pending: async () => [],
  restore: async () => ({ status: 'unavailable' }),
  status: async () => ({ status: 'unavailable' }),
});

const DEFAULT_MESSAGES = {
  unavailable: 'The store is not available right now. Nothing was charged.',
  offline: 'Could not reach the store. Check your connection and try again. Nothing was charged.',
  cancelled: 'Purchase cancelled. Nothing was charged.',
  failed: 'The purchase did not go through. Nothing was charged.',
  busy: 'Please wait — the last purchase is still finishing.',
  unknown: 'That item is not in the store.',
  purchased: 'Thank you! Your purchase is ready.',
  duplicate: 'That purchase was already added.',
  restored: 'Purchases restored.',
  nothingToRestore: 'No purchases to restore on this account.',
};

export class CommerceService {
  constructor({ provider = NO_STORE_PROVIDER, products = {}, entitlements, grant = () => {}, commit = async () => {}, messages = {}, now = () => Date.now(), bus = null } = {}) {
    this.provider = provider ?? NO_STORE_PROVIDER;
    this.products = products;
    this.entitlements = entitlements;
    this.grant = grant;
    this.commit = commit;
    this.messages = { ...DEFAULT_MESSAGES, ...messages };
    this.now = now;
    this.bus = bus;
    this.busy = false;
    this.catalogue = null; // the last product list from the store: { key: { price, title } }
    this.lastStatus = null; // 'ok' | 'offline' | 'unavailable' from the last store call
  }

  setProvider(p) {
    this.provider = p ?? NO_STORE_PROVIDER;
    this.catalogue = null;
  }

  msg(status) {
    return this.messages[status] ?? this.messages.failed;
  }

  // Prices always come from the store (never written into the game).
  async loadProducts() {
    let res;
    try {
      res = await this.provider.getProducts(Object.keys(this.products));
    } catch {
      res = { status: 'failed' };
    }
    this.lastStatus = res?.status ?? 'failed';
    if (res?.status !== 'ok') {
      this.catalogue = null;
      return { ok: false, products: [], message: this.msg(res?.status ?? 'failed') };
    }
    this.catalogue = Object.fromEntries((res.products ?? []).filter((p) => this.products[p.key]).map((p) => [p.key, { price: p.price, title: p.title }]));
    return { ok: true, products: res.products, message: null };
  }

  price(key) {
    return this.catalogue?.[key]?.price ?? null;
  }

  async buy(key) {
    const product = this.products[key];
    if (!product) return { ok: false, status: 'unknown', message: this.msg('unknown') };
    if (this.busy) return { ok: false, status: 'busy', message: this.msg('busy') };
    this.busy = true;
    try {
      let res;
      try {
        res = await this.provider.purchase(key);
      } catch {
        res = { status: 'failed' };
      }
      const status = res?.status ?? 'failed';
      if (status !== 'purchased') return { ok: false, status, message: this.msg(status) };
      const tx = res.transaction;
      if (!tx?.id || tx.productKey !== key) return { ok: false, status: 'failed', message: this.msg('failed') };
      const out = await this._deliver(tx);
      return { ok: true, status: out.duplicate ? 'duplicate' : 'purchased', message: this.msg(out.duplicate ? 'duplicate' : 'purchased'), ...out };
    } finally {
      this.busy = false;
    }
  }

  // One store transaction: granted once, saved, then finished with the store. Safe to call again with the same one.
  async _deliver(tx) {
    const res = this.processTransaction(tx);
    if (res.granted) await this.commit();
    try {
      await this.provider.finish(tx.id);
    } catch {
      /* it is delivered again next time and skipped then */
    }
    this.bus?.emit('commerce:purchased', { key: tx.productKey, tx, granted: res.granted });
    return res;
  }

  // The grant itself (synchronous, so nothing can slip in between the check and the mark).
  processTransaction(tx) {
    const product = this.products[tx?.productKey];
    if (!product || !tx?.id) return { granted: false, duplicate: false, invalid: true };
    const E = this.entitlements;
    if (E.hasProcessed(tx.id)) return { granted: false, duplicate: true };
    E.markProcessed(tx.id);
    if (product.kind === 'consumable') this.grant(product, tx);
    else if (product.entitlement === 'removeAds') E.setRemoveAds(true);
    else if (product.entitlement === 'vip') E.validateVip({ active: true, expiresAt: tx.expiresAt ?? null }, this.now());
    else this.grant(product, tx);
    return { granted: true, duplicate: false };
  }

  // Purchases the store says were never finished (e.g. the app closed straight after paying).
  async processPending() {
    let list = [];
    try {
      list = (await this.provider.pending()) ?? [];
    } catch {
      return { delivered: 0, duplicates: 0 };
    }
    let delivered = 0;
    let duplicates = 0;
    for (const tx of list) {
      const r = await this._deliver(tx);
      if (r.granted) delivered++;
      if (r.duplicate) duplicates++;
    }
    return { delivered, duplicates };
  }

  // Restore Purchases: permanent purchases and the subscription come back; Tech Chip style packs never do.
  async restore() {
    let res;
    try {
      res = await this.provider.restore();
    } catch {
      res = { status: 'failed' };
    }
    const status = res?.status ?? 'failed';
    this.lastStatus = status;
    if (status !== 'ok') return { ok: false, status, message: this.msg(status) };
    this.entitlements.applyStatus({ removeAds: !!res.removeAds, vip: res.vip ?? { active: false } }, this.now());
    await this.commit();
    this.bus?.emit('commerce:restored', { removeAds: !!res.removeAds, vip: !!res.vip?.active });
    const any = !!res.removeAds || !!res.vip?.active;
    return { ok: true, status, message: this.msg(any ? 'restored' : 'nothingToRestore'), removeAds: !!res.removeAds, vip: !!res.vip?.active };
  }

  // "Rechecked when online": a quiet check that changes nothing while the store can't be reached (the cached state
  // and the subscription's offline grace carry on).
  async recheck() {
    let res;
    try {
      res = await this.provider.status();
    } catch {
      res = { status: 'failed' };
    }
    this.lastStatus = res?.status ?? 'failed';
    if (res?.status !== 'ok') return { ok: false, status: this.lastStatus };
    this.entitlements.applyStatus({ removeAds: !!res.removeAds, vip: res.vip ?? { active: false } }, this.now());
    return { ok: true, status: 'ok' };
  }
}
