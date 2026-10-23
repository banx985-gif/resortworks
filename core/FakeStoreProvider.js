// The pretend ad network and store for debug builds (?debug=1) and tests: it acts like the real services but takes
// no money and shows no real ads. One object is both an AdService provider and a CommerceService provider.
// The debug panel decides what the NEXT ad or purchase does — succeed, cancel, fail or go offline — and can keep the
// whole "store" offline, replay the last purchase (to prove it is never granted twice), end the subscription, and
// wipe the pretend store's records.
//
//   new FakeStoreProvider({ products: { key: { price, title, kind } }, persist: { load(), save(state) } | null,
//                           now = Date.now, present = null, subscriptionDays = 30 })
//   present(kind, placementId, outcome) → Promise<outcome?>   optional: shows a stand-in "ad" (the game's own dialog)
//                                        while it "plays"; it may answer 'cancel' if the player closed it early
//   setNext('ad' | 'purchase', 'succeed' | 'cancel' | 'fail' | 'offline')   the next one only, then back to succeed
//   offline = true / false                   everything offline until switched back
//   replayLast()      the last purchase is delivered again (pending) — it must grant nothing the second time
//   endSubscription() the store now says the subscription has ended
//   resetPurchases()  the pretend store forgets every purchase
const DAY = 24 * 3600 * 1000;
const OUTCOMES = ['succeed', 'cancel', 'fail', 'offline'];

export class FakeStoreProvider {
  constructor({ products = {}, persist = null, now = () => Date.now(), present = null, subscriptionDays = 30 } = {}) {
    this.id = 'debug';
    this.products = products;
    this.persist = persist;
    this.now = now;
    this.present = present;
    this.subscriptionDays = subscriptionDays;
    this.next = { ad: 'succeed', purchase: 'succeed' };
    this.offline = false;
    this.log = []; // what happened, newest last (the debug panel shows it)
    this.state = { owned: {}, subscription: null, unfinished: [], counter: 0, last: null };
    try {
      const s = persist?.load?.();
      if (s) this.state = { ...this.state, ...s, owned: { ...(s.owned ?? {}) }, unfinished: [...(s.unfinished ?? [])] };
    } catch {
      /* a fresh pretend store */
    }
  }

  setNext(kind, outcome) {
    if (!OUTCOMES.includes(outcome) || !['ad', 'purchase'].includes(kind)) return false;
    this.next[kind] = outcome;
    return true;
  }

  _take(kind) {
    const o = this.offline ? 'offline' : this.next[kind];
    this.next[kind] = 'succeed';
    return o;
  }

  _save() {
    try {
      this.persist?.save?.(JSON.parse(JSON.stringify(this.state)));
    } catch {
      /* debug only */
    }
  }

  _note(text) {
    this.log.push({ at: this.now(), text });
    if (this.log.length > 30) this.log.shift();
  }

  // --- ads ----------------------------------------------------------------------------------------------------------
  available() {
    return !this.offline;
  }

  async show(kind, placementId) {
    const o = this._take('ad');
    if (o === 'offline') {
      this._note(`${kind} ad: offline`);
      return { status: 'offline' };
    }
    let out = o;
    if (this.present) {
      const r = await this.present(kind, placementId, o); // the stand-in "ad"; closing it early = cancelled
      if (OUTCOMES.includes(r)) out = r;
    }
    const status = { succeed: 'completed', cancel: 'cancelled', fail: 'failed', offline: 'offline' }[out];
    this._note(`${kind} ad (${placementId}): ${status}`);
    return { status };
  }

  // --- store --------------------------------------------------------------------------------------------------------
  async getProducts(keys) {
    if (this.offline) return { status: 'offline' };
    return { status: 'ok', products: keys.filter((k) => this.products[k]).map((k) => ({ key: k, price: this.products[k].price, title: this.products[k].title ?? k })) };
  }

  async purchase(key) {
    const p = this.products[key];
    if (!p) return { status: 'failed' };
    const o = this._take('purchase');
    if (o !== 'succeed') {
      const status = { cancel: 'cancelled', fail: 'failed', offline: 'offline' }[o];
      this._note(`buy ${key}: ${status}`);
      return { status };
    }
    const t = this.now();
    const tx = { id: `debug-${t.toString(36)}-${++this.state.counter}`, productKey: key, time: t };
    if (p.kind === 'subscription') {
      tx.expiresAt = t + this.subscriptionDays * DAY;
      this.state.subscription = { active: true, expiresAt: tx.expiresAt };
    } else if (p.kind === 'nonConsumable') this.state.owned[key] = true;
    this.state.unfinished.push(tx);
    this.state.last = tx;
    this._save();
    this._note(`buy ${key}: purchased (${tx.id})`);
    return { status: 'purchased', transaction: tx };
  }

  async finish(txId) {
    this.state.unfinished = this.state.unfinished.filter((t) => t.id !== txId);
    this._save();
  }

  async pending() {
    if (this.offline) return [];
    return [...this.state.unfinished];
  }

  _status() {
    const sub = this.state.subscription;
    const active = !!sub?.active && (sub.expiresAt == null || this.now() <= sub.expiresAt);
    const removeKey = Object.keys(this.products).find((k) => this.products[k].entitlement === 'removeAds');
    return { status: 'ok', removeAds: !!this.state.owned[removeKey], vip: { active, expiresAt: active ? sub.expiresAt : null } };
  }

  async restore() {
    if (this.offline) return { status: 'offline' };
    this._note('restore purchases');
    return this._status();
  }

  async status() {
    if (this.offline) return { status: 'offline' };
    return this._status();
  }

  // --- debug switches -----------------------------------------------------------------------------------------------
  replayLast() {
    const tx = this.state.last;
    if (!tx) return null;
    if (!this.state.unfinished.some((t) => t.id === tx.id)) this.state.unfinished.push({ ...tx });
    this._save();
    this._note(`replay ${tx.id}`);
    return tx;
  }

  endSubscription() {
    if (this.state.subscription) this.state.subscription.active = false;
    this._save();
    this._note('subscription ended');
  }

  resetPurchases() {
    this.state = { owned: {}, subscription: null, unfinished: [], counter: this.state.counter, last: null };
    this._save();
    this._note('purchases reset');
  }
}
