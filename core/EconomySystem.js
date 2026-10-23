// Money. Every change to any currency is one ledger line: { n, day, currency, amount, reason, category, balance }.
// A currency's balance always equals the sum of its ledger lines (see reconcile()).
// Also handles debt (Emergency Credit): warning below warnBelow, monthly interest on a negative balance,
// spending kinds that are blocked while negative, and closure after N month-ends below the limit.
//
// Emits: 'economy:change' (every line), 'economy:debt' ({ inDebt }), 'economy:closure'.
// maxLines (optional, Milestone 28 of Robot Workshop): once the ledger passes it, the oldest lines are folded into one
// "earlier lines" line per currency (same total, same running balance), so a 16-year save never grows without limit.
// Balances, reconcile() and totals() over the kept period stay exact.
export class EconomySystem {
  constructor({ bus = null, currencies, debt = {}, now = () => 0, maxLines = Infinity, foldReason = 'Earlier lines (combined)' }) {
    this.maxLines = maxLines;
    this.foldReason = foldReason;
    this.bus = bus;
    this.currencies = currencies; // { credits: { name, ... }, ... } — names from game data
    this.debt = { warnBelow: 0, limit: -25000, monthlyInterestPct: 5, closureMonths: 3, blockedWhileNegative: [], ...debt };
    this.now = now; // () => day number for ledger lines
    this.mainCurrency = Object.keys(currencies)[0];
    this.reset();
  }

  reset() {
    this.balances = Object.fromEntries(Object.keys(this.currencies).map((c) => [c, 0]));
    this.ledger = [];
    this.nextLine = 1;
    this.badMonths = 0; // month-ends in a row below the limit
    this.closed = false;
  }

  balance(currency = this.mainCurrency) {
    return this.balances[currency];
  }

  // The one way money changes. amount may be positive or negative; whole numbers only.
  add(currency, amount, reason, category = 'other') {
    if (!(currency in this.balances)) throw new Error(`unknown currency ${currency}`);
    const value = Math.round(amount);
    if (!value) return null;
    const wasInDebt = this.inDebt;
    this.balances[currency] += value;
    const line = {
      n: this.nextLine++,
      day: this.now(),
      currency,
      amount: value,
      reason,
      category,
      balance: this.balances[currency],
    };
    this.ledger.push(line);
    if (this.ledger.length > this.maxLines * 1.25) this._fold();
    this.bus?.emit('economy:change', line);
    if (this.inDebt !== wasInDebt) this.bus?.emit('economy:debt', { inDebt: this.inDebt });
    return line;
  }

  spend(currency, amount, reason, category) {
    return this.add(currency, -Math.abs(amount), reason, category);
  }

  canAfford(currency, amount) {
    return this.balances[currency] >= amount;
  }

  // --- debt ---------------------------------------------------------------
  get inDebt() {
    return this.balances[this.mainCurrency] < this.debt.warnBelow;
  }

  get belowLimit() {
    return this.balances[this.mainCurrency] < this.debt.limit;
  }

  // Is this kind of spending blocked right now? (e.g. 'facility' while in debt)
  isBlocked(kind) {
    return this.inDebt && this.debt.blockedWhileNegative.includes(kind);
  }

  // Call once at each month end: interest on a negative balance, then the closure check.
  monthEnd() {
    const c = this.mainCurrency;
    if (this.balances[c] < 0) {
      const interest = Math.round((-this.balances[c] * this.debt.monthlyInterestPct) / 100);
      this.add(c, -interest, 'Debt interest', 'interest');
    }
    this.badMonths = this.belowLimit ? this.badMonths + 1 : 0;
    if (this.badMonths >= this.debt.closureMonths && !this.closed) {
      this.closed = true;
      this.bus?.emit('economy:closure', { badMonths: this.badMonths, balance: this.balances[c] });
    }
  }

  // Keep the newest maxLines lines; everything older becomes one line per currency.
  _fold() {
    const cut = this.ledger.length - this.maxLines;
    if (cut <= 0) return;
    const old = this.ledger.slice(0, cut);
    const folded = [];
    for (const cur of Object.keys(this.balances)) {
      const lines = old.filter((l) => l.currency === cur);
      if (!lines.length) continue;
      const last = lines[lines.length - 1];
      folded.push({ n: last.n, day: last.day, currency: cur, amount: lines.reduce((t, l) => t + l.amount, 0), reason: this.foldReason, category: 'carried', balance: last.balance, folded: lines.length + lines.reduce((t, l) => t + ((l.folded ?? 1) - 1), 0) });
    }
    folded.sort((a, b) => a.n - b.n);
    this.ledger = [...folded, ...this.ledger.slice(cut)];
  }

  // --- checks ---------------------------------------------------------------
  // Sum of ledger lines per currency and whether it matches every balance.
  reconcile() {
    const sums = Object.fromEntries(Object.keys(this.balances).map((c) => [c, 0]));
    let runningOk = true;
    const running = { ...sums };
    for (const l of this.ledger) {
      sums[l.currency] += l.amount;
      running[l.currency] += l.amount;
      if (running[l.currency] !== l.balance) runningOk = false;
    }
    const ok = runningOk && Object.keys(sums).every((c) => sums[c] === this.balances[c]);
    return { ok, sums, balances: { ...this.balances } };
  }

  // Totals by category between two days (inclusive), for the finance view.
  totals(currency, fromDay, toDay) {
    const out = {};
    for (const l of this.ledger) {
      if (l.currency !== currency || l.day < fromDay || l.day > toDay) continue;
      out[l.category] = (out[l.category] ?? 0) + l.amount;
    }
    return out;
  }

  serialize() {
    return {
      balances: { ...this.balances },
      ledger: this.ledger.map((l) => ({ ...l })),
      nextLine: this.nextLine,
      badMonths: this.badMonths,
      closed: this.closed,
    };
  }

  load(s) {
    this.reset();
    Object.assign(this.balances, s.balances);
    this.ledger = s.ledger.map((l) => ({ ...l }));
    this.nextLine = s.nextLine;
    this.badMonths = s.badMonths ?? 0;
    this.closed = s.closed ?? false;
  }
}
