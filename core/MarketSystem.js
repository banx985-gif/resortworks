// Customer market: any number of segments, each with a monthly demand, plus trend events.
// Game data supplies everything:
//   segments: [{ id, name, min, max }]            demand range for the segment (e.g. 60–140)
//   rules: {
//     drift: 25,                                   how far a segment's base demand can move in one month
//     trendChance: 0.3,                            chance a new trend starts at a month start
//     trendSegments: [1, 2],                       a trend moves this many segments
//     trendShift: 20,                              ± amount a trend adds to demand
//     trendMonths: [1, 3],                         how long a trend lasts
//     floor: 20, ceiling: 200,                     hard limits after trends are added
//   }
// Demand this month = base (random walk inside min–max) + active trend shifts.
// Uses its own seeded Rng so market rolls never change other random results.
// Forecast: setLookahead(true) decides each trend one month early, so nextTrend can be shown in advance
// (with it off, trends are decided on the month they start, as before).
// Emits 'market:month' ({ demand, trends, started }) after each roll.
export class MarketSystem {
  constructor({ rng, segments, rules = {}, bus = null, historyMonths = 24 }) {
    this.rng = rng;
    this.segments = segments;
    this.rules = { drift: 25, trendChance: 0.3, trendSegments: [1, 2], trendShift: 20, trendMonths: [1, 3], floor: 20, ceiling: 200, ...rules };
    this.bus = bus;
    this.historyMonths = historyMonths;
    this.reset();
  }

  reset() {
    this.base = {}; // segmentId → base demand
    this.demandNow = {}; // segmentId → demand this month (base + trends)
    this.trends = []; // { id, shifts: { segmentId: ±n }, monthsLeft, months, startedMonth }
    this.history = []; // last N months: { month, demand: {...} }
    this.nextTrendId = 1;
    this.month = 0; // how many rolls so far
    this.lookahead = false;
    this.nextTrend = undefined; // lookahead: next month's trend (null = none coming; undefined = not decided yet)
  }

  setLookahead(on) {
    this.lookahead = !!on;
    if (this.lookahead && this.nextTrend === undefined && Object.keys(this.base).length) this.nextTrend = this._rollTrend();
    if (!this.lookahead) this.nextTrend = undefined;
  }

  demand(segmentId) {
    return this.demandNow[segmentId] ?? 100;
  }

  segment(id) {
    return this.segments.find((s) => s.id === id) || null;
  }

  // First roll of a run: every segment anywhere in its range.
  start() {
    this.reset();
    for (const s of this.segments) this.base[s.id] = this.rng.int(s.min, s.max);
    this._settle(null);
  }

  // Month start: bases drift, trends age (and end), maybe a new trend begins.
  rollMonth() {
    if (!Object.keys(this.base).length) {
      this.start();
      return;
    }
    const r = this.rules;
    for (const s of this.segments) {
      const next = this.base[s.id] + this.rng.int(-r.drift, r.drift);
      this.base[s.id] = Math.min(s.max, Math.max(s.min, next));
    }
    for (const t of this.trends) t.monthsLeft--;
    this.trends = this.trends.filter((t) => t.monthsLeft > 0);
    let started = null;
    if (this.lookahead) {
      if (this.nextTrend) {
        started = { ...this.nextTrend, startedMonth: this.month + 1 };
        this.trends.push(started);
      }
      this.nextTrend = this._rollTrend();
    } else if (this.rng.chance(r.trendChance)) started = this._startTrend();
    this._settle(started);
  }

  _startTrend() {
    const t = this._makeTrend(new Set(this.trends.flatMap((t) => Object.keys(t.shifts))));
    if (t) this.trends.push(t);
    return t;
  }

  // Lookahead: roll next month's trend now, avoiding segments whose trend will still be running then.
  _rollTrend() {
    if (!this.rng.chance(this.rules.trendChance)) return null;
    const t = this._makeTrend(new Set(this.trends.filter((t) => t.monthsLeft > 1).flatMap((t) => Object.keys(t.shifts))));
    return t;
  }

  _makeTrend(busy) {
    const r = this.rules;
    const free = this.segments.filter((s) => !busy.has(s.id));
    const count = Math.min(free.length, this.rng.int(r.trendSegments[0], r.trendSegments[1]));
    if (!count) return null;
    const shifts = {};
    for (const s of this.rng.shuffle(free).slice(0, count)) shifts[s.id] = this.rng.chance(0.5) ? r.trendShift : -r.trendShift;
    const months = this.rng.int(r.trendMonths[0], r.trendMonths[1]);
    return { id: this.nextTrendId++, shifts, months, monthsLeft: months, startedMonth: this.month + 1 };
  }

  _settle(started) {
    const r = this.rules;
    this.month++;
    for (const s of this.segments) {
      let d = this.base[s.id];
      for (const t of this.trends) d += t.shifts[s.id] ?? 0;
      this.demandNow[s.id] = Math.min(r.ceiling, Math.max(r.floor, d));
    }
    this.history.push({ month: this.month, demand: { ...this.demandNow } });
    if (this.history.length > this.historyMonths) this.history.shift();
    this.bus?.emit('market:month', { demand: { ...this.demandNow }, trends: this.trends, started });
  }

  // Demand last month (for up/down arrows), or null.
  previous(segmentId) {
    const h = this.history[this.history.length - 2];
    return h ? h.demand[segmentId] : null;
  }

  // The trend touching a segment right now (or null).
  trendFor(segmentId) {
    return this.trends.find((t) => segmentId in t.shifts) || null;
  }

  serialize() {
    return {
      rngState: this.rng.getState(),
      base: { ...this.base },
      demandNow: { ...this.demandNow },
      trends: JSON.parse(JSON.stringify(this.trends)),
      history: JSON.parse(JSON.stringify(this.history)),
      nextTrendId: this.nextTrendId,
      month: this.month,
      lookahead: this.lookahead,
      nextTrend: this.nextTrend === undefined ? undefined : JSON.parse(JSON.stringify(this.nextTrend)),
    };
  }

  // Returns false if there was nothing to load (the caller should start()).
  load(s) {
    this.reset();
    if (!s?.base) return false;
    if (s.rngState !== undefined) this.rng.setState(s.rngState);
    this.base = { ...s.base };
    this.demandNow = { ...s.demandNow };
    this.trends = JSON.parse(JSON.stringify(s.trends ?? []));
    this.history = JSON.parse(JSON.stringify(s.history ?? []));
    this.nextTrendId = s.nextTrendId ?? 1;
    this.month = s.month ?? 0;
    this.lookahead = !!s.lookahead;
    this.nextTrend = s.nextTrend === undefined ? undefined : JSON.parse(JSON.stringify(s.nextTrend));
    return true;
  }
}
