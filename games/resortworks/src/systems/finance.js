// Early finance / pricing (Milestone 6, bible §26 / §27D / §27E / §27G / §27M / §27N). Cash is a core EconomySystem
// ledger (one line for every change of Credits); this file adds what a resort earns and pays and when:
//   income  room revenue (the booking's nightly rate × its nights, booked at check-out) · the Snack Café (12 Credits a
//           guest each staying day, at Evening)
//   costs   wages (per 28-day month by tier, at the month end) · facility and room upkeep (each day change, for the day
//           just ended) · supplies (per occupied room-night at Basic: food, linen, amenities, utilities) · credit interest
//   Emergency Credit (bible §27M): the moment cash would go below 0 it is lent up to the ceiling (max(20,000, 25% of
//           lifetime revenue), at most 250,000), charged 1.5% a month at the month end, and paid back by itself at each
//           day change from cash above a small working balance. Over 80% of the ceiling a test warning is logged (the
//           Rescue Investor is M25).
//   pricing bands (bible §27E) per room type: Value 0.85× / Standard 1.00× / Premium 1.20× of the base rate. The booking
//           system asks rateOf(roomType) for each new offer and offerChance(offer, service) for how likely it is to come
//           in (data/finance.js DEMAND).
// Plain, saved state moved on by the booking system's band edges (bookings.attachFinance(fin)), so the same seed gives
// the same money at every speed and through a debug skip. Each day's and month's money is also kept by line (the Finance
// sheet), and the closed months (profit chart).
//   createFinance({ saved, bus, team, day }) → fin
//     fin.checkout(booking, day) · fin.onEdge(day, band, bookings) · fin.cash · fin.debt · fin.ceiling · fin.lifetimeRevenue
//     fin.bandOf(rt) · fin.setBand(rt, id) · fin.rateOf(rt) · fin.offerChance(offer, service) · fin.dayLines(day) ·
//     fin.month · fin.months · fin.econ (core EconomySystem) · fin.credit · serialize()
//     (Milestone 7) fin.spend(line, amount, day, source) — a complaint's comped meal or partial refund (a cost line)
//   On the bus: core 'economy:change' (each ledger line) · 'finance:income' { line, amount, source } (a room id or 'F06':
//   the screen's small "+N") · 'finance:month' { month } · 'finance:credit' { taken | repaid, debt } · 'finance:warning'
import { EconomySystem } from '../../../../core/EconomySystem.js';
import { ROOMS, FACILITIES } from '../../data/lot.js';
import { ROOM_TYPES, GUEST_TYPES } from '../../data/bookings.js';
import { BANDS } from '../../data/calendar.js';
import { WINDOW_DAYS } from '../../data/reviews.js';
import { START_CASH, PRICE_BANDS, DEFAULT_BAND, bandById, DEMAND, CAFE, WAGES, FACILITY_UPKEEP, ROOM_UPKEEP, SUPPLIES, CREDIT, LINES, INCOME_LINES, COST_LINES, HISTORY } from '../../data/finance.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
const BAND = Object.fromEntries(BANDS.map((b, i) => [b.id, i]));
const CURRENCIES = { credits: { name: 'Credits' } };
const r4 = (x) => Math.round(x * 1e4) / 1e4;

// "12,400 Cr" / "−800 Cr" (Credits in the sheets and the top bar).
export const credits = (n) => `${n < 0 ? '−' : ''}${Math.abs(Math.round(n)).toLocaleString('en-GB')} Cr`;
export const signed = (n) => `${n < 0 ? '−' : '+'}${Math.abs(Math.round(n)).toLocaleString('en-GB')}`;

// A room type's nightly rate in a pricing band (whole Credits).
export const bandRate = (roomType, bandId) => Math.round(ROOM_TYPES[roomType].rate * (bandById(bandId) ?? bandById(DEFAULT_BAND)).mult);

// The chance an offer comes in at this rate (bible §27E, M6 card): over the guest type's budget, max(0.4, 1 − 1.5 ×
// (rate / budget − 1)); Premium with Service under 70 loses a further (70 − Service) / 70 × 30%. 1 = always.
export function offerChance({ type, rate }, { band = DEFAULT_BAND, service = null } = {}) {
  const budget = GUEST_TYPES[type]?.budget ?? rate;
  let k = rate > budget ? Math.max(DEMAND.floor, 1 - DEMAND.slope * (rate / budget - 1)) : 1;
  if (band === 'premium' && service != null && service < DEMAND.serviceMin) k *= 1 - ((DEMAND.serviceMin - service) / DEMAND.serviceMin) * DEMAND.premiumCut;
  return r4(Math.min(1, k));
}

// The Emergency Credit ceiling (bible §27M) for this much lifetime revenue.
export const creditCeiling = (lifetime) => Math.min(CREDIT.cap, Math.max(CREDIT.floor, Math.round(CREDIT.share * lifetime)));

const zeroLines = () => Object.fromEntries(Object.keys(LINES).map((k) => [k, 0]));
const monthOf = (day) => Math.floor(day / WINDOW_DAYS) + 1; // Month 1 = days 0–27
export const bucketTotals = (lines) => {
  const income = INCOME_LINES.reduce((t, k) => t + (lines[k] ?? 0), 0);
  const costs = COST_LINES.reduce((t, k) => t + (lines[k] ?? 0), 0);
  return { income, costs, profit: income - costs };
};

// A new resort's money (or an older save's, from the day it is loaded): 32,000 Credits, no debt, Standard pricing.
export function freshFinance({ day = 0 } = {}) {
  const econ = new EconomySystem({ currencies: CURRENCIES, now: () => day, maxLines: HISTORY.ledgerLines });
  econ.add('credits', START_CASH, 'Opening cash', 'start');
  return {
    econ: econ.serialize(),
    debt: 0,
    lifetimeRevenue: 0,
    bands: Object.fromEntries(Object.keys(ROOM_TYPES).map((rt) => [rt, DEFAULT_BAND])),
    days: {}, // { [day]: lines } — today and yesterday
    month: { n: monthOf(day), lines: zeroLines() },
    months: [], // closed months, oldest first: { n, lines, income, costs, profit, cash, debt }
    credit: { taken: 0, repaid: 0, interest: 0, peak: 0, warnings: 0, warnedMonth: 0 },
  };
}

export function createFinance({ saved = null, bus = null, team = [], day = 0 } = {}) {
  const s = load(saved, day);
  let bookDay = day; // the day new ledger lines belong to
  const econ = new EconomySystem({ bus, currencies: CURRENCIES, now: () => bookDay, maxLines: HISTORY.ledgerLines });
  econ.load(s.econ);
  let version = 0;

  const cash = () => econ.balance('credits');
  const ceiling = () => creditCeiling(s.lifetimeRevenue);
  function record(line, amount, d) {
    const bucket = (s.days[d] ??= zeroLines());
    bucket[line] = (bucket[line] ?? 0) + amount;
    if (monthOf(d) === s.month.n) s.month.lines[line] += amount;
  }
  // The one way money moves: a ledger line, the day and month by line, then the Emergency Credit if cash went below 0.
  function move(line, amount, d, source = null) {
    const value = Math.round(amount);
    if (!value) return 0;
    bookDay = d;
    const kind = LINES[line].kind;
    econ.add('credits', kind === 'cost' ? -value : value, LINES[line].name, line);
    record(line, Math.abs(value), d);
    if (kind === 'income') {
      s.lifetimeRevenue += value;
      bus?.emit('finance:income', { line, amount: value, source });
    }
    if (kind === 'cost') cover(d);
    version++;
    return value;
  }
  // Cash below 0: the Emergency Credit lends what is needed, up to its ceiling.
  function cover(d) {
    if (cash() >= 0) return;
    const room = Math.max(0, ceiling() - s.debt);
    const take = Math.min(-cash(), room);
    if (take > 0) {
      bookDay = d;
      econ.add('credits', take, LINES.creditDraw.name, 'creditDraw');
      record('creditDraw', take, d);
      s.debt += take;
      s.credit.taken += take;
      s.credit.peak = Math.max(s.credit.peak, s.debt);
      bus?.emit('finance:credit', { taken: take, debt: s.debt });
    }
    warn(d);
  }
  // A test warning over 80% of the ceiling (once a month; the Rescue Investor is M25).
  function warn(d) {
    if (s.debt <= CREDIT.warnShare * ceiling() || s.credit.warnedMonth === monthOf(d)) return;
    s.credit.warnings++;
    s.credit.warnedMonth = monthOf(d);
    const words = `[RESORTWORKS] Emergency Credit over ${CREDIT.warnShare * 100}% of its ceiling: ${s.debt} of ${ceiling()} (Rescue Investor is M25)`;
    if (typeof console !== 'undefined') console.warn(words);
    bus?.emit('finance:warning', { debt: s.debt, ceiling: ceiling() });
  }
  function repay(d) {
    if (s.debt <= 0) return;
    const pay = Math.min(s.debt, cash() - CREDIT.keep);
    if (pay <= 0) return;
    bookDay = d;
    econ.add('credits', -pay, LINES.creditRepay.name, 'creditRepay');
    record('creditRepay', pay, d);
    s.debt -= pay;
    s.credit.repaid += pay;
    bus?.emit('finance:credit', { repaid: pay, debt: s.debt });
  }

  // The day change into `day`: the bills for the day just ended (upkeep, the supplies of every occupied room-night), then
  // at a month end the wages and the credit interest and the month closes; then the credit is paid back if cash allows.
  function dayChange(day, bk) {
    const d = day - 1;
    const occupied = (bk?.staying ?? []).length; // they slept here last night (check-out is at Morning)
    move('facilityUpkeep', FACILITIES.reduce((t, f) => t + (FACILITY_UPKEEP[f.id] ?? 0), 0), d);
    move('roomUpkeep', ROOMS.reduce((t, r) => t + (ROOM_UPKEEP[r.typeId] ?? 0), 0), d);
    for (const k of Object.keys(SUPPLIES)) move(k, SUPPLIES[k] * occupied, d);
    if (day > 0 && day % WINDOW_DAYS === 0) {
      move('wages', team.reduce((t, m) => t + (WAGES[m.tier] ?? WAGES.standard), 0), d);
      if (s.debt > 0) move('interest', Math.round((s.debt * CREDIT.interestPct) / 100), d);
      closeMonth(d);
    }
    repay(d);
    for (const k of Object.keys(s.days)) if (Number(k) < day - 1) delete s.days[k];
    bookDay = day;
  }
  function closeMonth(d) {
    const lines = { ...s.month.lines };
    const m = { n: s.month.n, lines, ...bucketTotals(lines), cash: cash(), debt: s.debt };
    s.months.push(m);
    if (s.months.length > HISTORY.months) s.months.shift();
    s.month = { n: monthOf(d + 1), lines: zeroLines() };
    bus?.emit('finance:month', { month: clone(m) });
  }

  const fin = {
    // A stay ends (the booking system calls it at each check-out): the room's revenue, rate × nights.
    checkout(b, day) {
      return move('rooms', (b.rate ?? 0) * (b.nights ?? 0), day, b.room);
    },
    // A band begins (after the booking system's own edge): the Snack Café at Evening, the bills at the day change.
    onEdge(day, band, bk) {
      if (band === BAND.evening) {
        const guests = (bk?.staying ?? []).reduce((t, b) => t + (b.party ?? 1), 0);
        if (guests && FACILITIES.some((f) => f.id === CAFE.facility)) move('cafe', guests * CAFE.perGuestDay, day, CAFE.facility);
      }
      if (band === BAND.night) dayChange(day, bk);
      bookDay = day;
    },
    // (Milestone 7) a one-off cost on its own ledger line (comped meals, refunds).
    spend(line, amount, day, source = null) {
      if (LINES[line]?.kind !== 'cost') return 0;
      const v = move(line, amount, day, source);
      bookDay = day;
      return v;
    },
    bandOf: (rt) => s.bands[rt] ?? DEFAULT_BAND,
    setBand(rt, id) {
      if (!ROOM_TYPES[rt] || !bandById(id) || s.bands[rt] === id) return false;
      s.bands[rt] = id;
      version++;
      bus?.emit('finance:band', { roomType: rt, band: id });
      return true;
    },
    rateOf: (rt) => bandRate(rt, s.bands[rt]),
    // How likely this offer is to come in at its rate and the room type's band (Service: the rolling 28-day score).
    offerChance: (o, service = null) => offerChance(o, { band: s.bands[o.roomType], service }),
    dayLines: (d) => ({ ...zeroLines(), ...(s.days[d] ?? {}) }),
    get cash() {
      return cash();
    },
    get debt() {
      return s.debt;
    },
    get ceiling() {
      return ceiling();
    },
    get lifetimeRevenue() {
      return s.lifetimeRevenue;
    },
    get month() {
      return { n: s.month.n, lines: { ...s.month.lines }, ...bucketTotals(s.month.lines) };
    },
    get months() {
      return s.months;
    },
    get credit() {
      return { ...s.credit, debt: s.debt, ceiling: ceiling() };
    },
    get bands() {
      return { ...s.bands };
    },
    get version() {
      return version;
    },
    econ,
    serialize() {
      s.econ = econ.serialize();
      return clone(s);
    },
  };
  return fin;
}

// A saved state, checked and filled in (none — a save from before Milestone 6 — gets a fresh 32,000 from that day).
function load(saved, day) {
  const f = freshFinance({ day });
  if (!saved || typeof saved !== 'object' || !saved.econ?.balances) return f;
  const s = clone(saved);
  return {
    econ: s.econ,
    debt: Number.isFinite(s.debt) ? s.debt : 0,
    lifetimeRevenue: Number.isFinite(s.lifetimeRevenue) ? s.lifetimeRevenue : 0,
    bands: Object.fromEntries(Object.keys(ROOM_TYPES).map((rt) => [rt, bandById(s.bands?.[rt]) ? s.bands[rt] : DEFAULT_BAND])),
    days: s.days && typeof s.days === 'object' ? s.days : {},
    month: s.month?.lines ? { n: s.month.n, lines: { ...zeroLines(), ...s.month.lines } } : f.month,
    months: Array.isArray(s.months) ? s.months : [],
    credit: { ...f.credit, ...(s.credit ?? {}) },
  };
}
export { PRICE_BANDS };
