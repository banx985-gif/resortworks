// Google Play Billing behind core/CommerceService (bible §32.2–32.6), for any series game shipped as an Android app.
// Only a provider: prices come from the store, and every "grant once" rule stays in CommerceService /
// EntitlementService. Uses the @capgo/native-purchases plugin through core/NativeBridge.
//
// Milestone 29a (Robot Workshop): the app is not on Google Play yet (no developer account), so Play answers "billing
// unavailable" or returns no products. Then every call reports 'unavailable' and the game shows its plain "store
// unavailable" message and plays on. Nothing here can charge money until 29b puts the products on Play.
//
//   new PlayBillingProvider({ bridge, products: { key: { kind, entitlement?, basePlan? } } })   product keys = Play product ids
//
// Subscriptions (M29b): Play sells a subscription through one of its base plans, so each subscription product names
// its basePlan (the id made in Play Console). The plugin lists a subscription by its base plan id (identifier) with
// the product id in planIdentifier, and buying one needs the base plan id — both handled here. A subscription
// without a basePlan is reported 'unavailable' rather than sent to Play (Play would refuse it).
const TYPE = { consumable: 'inapp', nonConsumable: 'inapp', subscription: 'subs' };

export class PlayBillingProvider {
  constructor({ bridge, products = {} } = {}) {
    this.id = 'play';
    this.bridge = bridge;
    this.products = products;
    this.supported = null; // null = not asked yet
    this.tokens = new Map(); // transaction id → Play purchase token (needed to acknowledge it)
    this.offers = new Map(); // subscription key → the offer token of its base plan (from getProducts)
    this.log = [];
  }

  _note(text) {
    this.log.push({ at: Date.now(), text });
    if (this.log.length > 40) this.log.shift();
  }

  async _ok() {
    if (!this.bridge?.plugin('NativePurchases')) return false;
    if (this.supported === null) {
      const r = await this.bridge.call('NativePurchases', 'isBillingSupported');
      this.supported = !!r?.isBillingSupported;
      this._note(`billing supported: ${this.supported}`);
    }
    return this.supported;
  }

  async getProducts(keys) {
    if (!(await this._ok())) return { status: 'unavailable' };
    const out = [];
    for (const type of ['inapp', 'subs']) {
      const ids = keys.filter((k) => (TYPE[this.products[k]?.kind] ?? 'inapp') === type);
      if (!ids.length) continue;
      const r = await this.bridge.call('NativePurchases', 'getProducts', { productIdentifiers: ids, productType: type });
      for (const p of r?.products ?? []) {
        if (type === 'subs') {
          // identifier = the base plan, planIdentifier = the product. Only the product's own base plan counts, and
          // only its plain offer (a trial or intro offer under the same plan would list a different price).
          const key = p.planIdentifier ?? p.identifier;
          const plan = this.products[key]?.basePlan;
          if (!plan || p.identifier !== plan || p.offerId) continue;
          if (p.offerToken) this.offers.set(key, p.offerToken);
          out.push({ key, price: p.priceString, title: p.title });
        } else out.push({ key: p.identifier, price: p.priceString, title: p.title });
      }
    }
    this._note(`products: ${out.length}`);
    // No products at all = the store is not set up for this app yet (29a): the same as unavailable.
    return out.length ? { status: 'ok', products: out } : { status: 'unavailable' };
  }

  async purchase(key) {
    if (!(await this._ok())) return { status: 'unavailable' };
    const p = this.products[key];
    const plugin = this.bridge.plugin('NativePurchases');
    const type = TYPE[p?.kind] ?? 'inapp';
    const options = { productIdentifier: key, productType: type, quantity: 1, isConsumable: p?.kind === 'consumable', autoAcknowledgePurchases: false };
    if (type === 'subs') {
      if (!p.basePlan) {
        this._note(`buy ${key}: no base plan named`);
        return { status: 'unavailable' };
      }
      options.planIdentifier = p.basePlan;
      if (this.offers.has(key)) options.offerToken = this.offers.get(key);
    }
    let tx;
    try {
      tx = await plugin.purchaseProduct(options);
    } catch (err) {
      const msg = String(err?.message ?? err).toLowerCase();
      this._note(`buy ${key}: ${msg}`);
      if (msg.includes('cancel')) return { status: 'cancelled' };
      if (msg.includes('network') || msg.includes('offline') || msg.includes('service')) return { status: 'offline' };
      if (msg.includes('unavailable') || msg.includes('not found') || msg.includes('item')) return { status: 'unavailable' };
      return { status: 'failed' };
    }
    if (!tx?.transactionId) return { status: 'failed' };
    const time = Date.parse(tx.purchaseDate) || Date.now();
    const expiresAt = tx.expirationDate ? Date.parse(tx.expirationDate) || null : null;
    if (tx.purchaseToken) this.tokens.set(tx.transactionId, tx.purchaseToken);
    return { status: 'purchased', transaction: { id: tx.transactionId, productKey: key, time, expiresAt } };
  }

  // Play needs a purchase acknowledged (and a consumable consumed) once it is granted and saved.
  async finish(txId) {
    const token = this.tokens.get(txId);
    if (!token) return;
    await this.bridge.call('NativePurchases', 'acknowledgePurchase', { purchaseToken: token });
    this.tokens.delete(txId);
  }

  // Re-delivery of unfinished purchases arrives with the real store (29b); nothing to deliver in test mode.
  async pending() {
    return [];
  }

  async _owned() {
    if (!(await this._ok())) return { status: 'unavailable' };
    const r = await this.bridge.call('NativePurchases', 'getPurchases', {});
    if (r === null) return { status: 'offline' };
    const list = r.purchases ?? [];
    const removeKey = Object.keys(this.products).find((k) => this.products[k].entitlement === 'removeAds');
    const vipKey = Object.keys(this.products).find((k) => this.products[k].entitlement === 'vip');
    const vip = list.find((t) => t.productIdentifier === vipKey && t.isActive !== false);
    return { status: 'ok', removeAds: list.some((t) => t.productIdentifier === removeKey), vip: { active: !!vip, expiresAt: vip?.expirationDate ? Date.parse(vip.expirationDate) || null : null } };
  }

  restore() {
    return this._owned();
  }

  status() {
    return this._owned();
  }

  // Ads are not this provider's job (the game pairs it with an ad provider).
  available() {
    return false;
  }

  async show() {
    return { status: 'offline' };
  }
}
