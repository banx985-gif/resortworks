// Satisfaction / reviews (Milestone 5, bible §7 / §9 / §27A / §27F / §27N). At check-out every stay is scored on the seven
// categories (Room, Clean, Service, Food, Activities, Comfort, Value, 0–100 each, from data/reviews.js STAY_INPUTS), the
// guest type's §27F weights turn them into one final satisfaction, and the stay leaves a review: 1–5 stars, the seven
// parts and a short comment (core ReviewText: their best and worst category). Each review moves the Reputation Points
// (core ReputationSystem: +1 a stay, 4★ +3, 5★ +7, 1★ −12; never below a reached Rank's floor) and so the Resort Rank.
// The headline scores (Satisfaction, Service, Appeal, Staff Wellbeing, Prestige) and the ValueIndex are rolling 28-day
// values; at the end of each 28-day month they make the QualityIndex and the public star rating (the §27A table; 5 stars
// also needs no headline below 72), announced as the "Roadside Guide" moment (four inspectors' marks out of 10).
// Plain, saved state, moved on by the booking system's band edges (bookings.attachReviews(rv)), so the same seed gives
// the same reviews and stars at every speed and through a debug skip.
//   createReviews({ saved, bus, team, seed }) → rv
//     rv.checkout(booking, day) — a stay ends (the booking system calls it at each check-out) → the review
//     rv.onEdge(day, band) — a band begins (the day change into a new month rates the month just ended)
//     rv.list (newest first) · byId(id) · stars (null = "New") · lastMonth · months · rank · nextRank · repValue ·
//     headline(today) (live, the last 28 days) · addRep(n) (debug) · rankAtLeast(id) · serialize()
//   On the bus: 'review:new' { review } · 'review:month' { month } · core 'reputation:change' / 'reputation:rankUp'
// Milestone 7: with complaints attached (attachComplaints(cp), src/systems/complaints.js) each check-out first settles the
// stay's complaints: a recovered one cancels its category's loss (late room → Service, short linen → Clean, over budget →
// Value) and gives the Recovery Bonus to the final satisfaction (the review keeps a "Recovered" tag and "Saved by great
// service"); each failed try costs 5; one still unresolved costs REP 5 (bible §27A) and the comment says so.
// Milestone 8: the stay's Condition inputs (bible §12) — the worst working share the party saw (src/systems/maintenance.js
// keeps it on the booking: b.cond) scales the Café's +6 Food, the Pool's +8 Activity and the room's Comfort; the Garden's
// +6 Appeal follows its working share (attachMaintenance(mt)). A recovered breakdown complaint cancels its loss.
import { ReputationSystem } from '../../../../core/ReputationSystem.js';
import { rankAtLeast as reached } from '../../../../core/CompanyRank.js';
import { writeReview } from '../../../../core/ReviewText.js';
import { FACILITIES, roomById } from '../../data/lot.js';
import { ROOM_TYPES, GUEST_TYPES } from '../../data/bookings.js';
import { CATEGORY_IDS, STAY_INPUTS, GUEST_WEIGHTS, REVIEW_STARS, REP, RANKS, WINDOW_DAYS, HEADLINE_FIXED, QUALITY, STAR_TABLE, FIVE_STAR_HEADLINES, FIVE_STAR_MIN, GUIDE, REVIEW_TEXT } from '../../data/reviews.js';
import { BANDS } from '../../data/calendar.js';
import { REP_UNRESOLVED, COMPLAINT_TEXT, SAVED_MEMORY } from '../../data/complaints.js';
import { Rng } from '../../../../core/Rng.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
const r2 = (x) => Math.round(x * 100) / 100;
const clamp = (x) => Math.max(0, Math.min(100, x));
const NIGHT = BANDS.findIndex((b) => b.id === 'night');
const LIST_MAX = 40; // reviews kept for the Reviews list (the 28-day window is always kept too)
const MONTHS_MAX = 24;

const hasFacility = (id, facilities) => facilities.some((f) => f.id === id);
// The best stat on the team in that role (50 = neutral when nobody holds it).
function roleStat(team, role, stat) {
  const v = (team ?? []).filter((m) => m.role === role).map((m) => m.stats?.[stat] ?? 50);
  return v.length ? Math.max(...v) : 50;
}

// The seven categories for one stay (whole numbers 0–100). b: the booking (type, roomType = the type they wanted, room,
// rate, shortLinen, late), roomType: the room type they got. (Milestone 7) cancel: { service, clean, value } — a recovered
// complaint's category: its loss doesn't count (the late Service loss, the short-linen Clean loss, Value under its base).
// (Milestone 8) b.cond: { room, F03, F06 } — the worst working share of their room, the Pool and the Café during the stay
// (1 when missing); a recovered breakdown cancels comfort / activities / food's share.
export function stayCategories(b, { team = [], facilities = FACILITIES, roomType = null, cancel = {} } = {}) {
  const I = STAY_INPUTS;
  const got = roomType ?? b.roomType;
  const want = ROOM_TYPES[b.roomType];
  const have = ROOM_TYPES[got];
  const budget = GUEST_TYPES[b.type]?.budget ?? b.rate;
  const room = I.room.base[got] + (have.id === want.id ? I.room.wanted : have.rank < want.rank ? I.room.worse : 0);
  const clean = Math.min(I.clean.cap, I.clean.base + (b.shortLinen && !cancel.clean ? I.clean.short : 0));
  const service = I.service.base - (cancel.service ? 0 : b.late?.serviceLoss ?? 0) + (roleStat(team, I.service.role, I.service.stat) - 50) / I.service.div;
  const share = (id, key) => (cancel[key] ? 1 : b.cond?.[id] ?? 1);
  const fac = (x, key) => (hasFacility(x.facility.id, facilities) ? x.facility.add * share(x.facility.id, key) : 0);
  const food = Math.min(I.food.cap, I.food.base + fac(I.food, 'food') + (roleStat(team, I.food.role, I.food.stat) - 50) / I.food.div);
  const activities = I.activities.base + fac(I.activities, 'activities') + (roleStat(team, I.activities.role, I.activities.stat) - 50) / I.activities.div;
  const comfort = I.comfort.base[got] * share('room', 'comfort');
  const value = cancel.value ? Math.max(I.value.base, I.value.base + (I.value.span * (budget - b.rate)) / budget) : I.value.base + (I.value.span * (budget - b.rate)) / budget;
  const raw = { room, clean, service, food, activities, comfort, value };
  return Object.fromEntries(CATEGORY_IDS.map((k) => [k, Math.round(clamp(raw[k]))]));
}

// Final satisfaction = the categories × the guest type's §27F weights (0–100, two decimals).
export function finalSatisfaction(cats, typeId) {
  const w = GUEST_WEIGHTS[typeId];
  if (!w) throw new Error(`No review weights for ${typeId}`);
  return r2(CATEGORY_IDS.reduce((t, k, i) => t + cats[k] * w[i], 0) / 100);
}
export const reviewStars = (sat) => REVIEW_STARS.find((s) => sat >= s.min)?.stars ?? 1;
export const repFor = (stars) => REP.stay + (REP.stars[stars] ?? 0);

// The headline scores over the reviews of days [from, to] (inclusive). Satisfaction / Service / ValueIndex are the
// averages (null with no reviews); Appeal, Staff Wellbeing and Prestige are fixed for now. (Milestone 8) effOf(id): a
// facility's working share (the Garden's +6 Appeal follows it).
export function headlineFrom(reviews, from, to, facilities = FACILITIES, effOf = () => 1) {
  const inside = reviews.filter((v) => v.day >= from && v.day <= to);
  const avg = (f) => (inside.length ? r2(inside.reduce((t, v) => t + f(v), 0) / inside.length) : null);
  const ap = HEADLINE_FIXED.appeal;
  return {
    satisfaction: avg((v) => v.sat),
    service: avg((v) => v.cats.service),
    value: avg((v) => v.cats.value),
    appeal: r2(ap.base + (hasFacility(ap.facility.id, facilities) ? ap.facility.add * effOf(ap.facility.id) : 0)),
    wellbeing: HEADLINE_FIXED.wellbeing,
    prestige: HEADLINE_FIXED.prestige,
    count: inside.length,
  };
}

// QualityIndex (bible §27A), two decimals.
export const qualityIndex = (h) => r2(Object.entries(QUALITY).reduce((t, [k, w]) => t + w * h[k], 0));
// The §27A star table: 5 stars needs 88+ and no headline (Satisfaction, Service, Appeal, Wellbeing) below 72, else 4.
export function starRating(h, qi = qualityIndex(h)) {
  const row = STAR_TABLE.find((s) => qi >= s.min);
  if (row.stars === 5 && FIVE_STAR_HEADLINES.some((k) => h[k] < FIVE_STAR_MIN)) return 4;
  return row.stars;
}
// The four inspectors' marks out of 10 (that headline ÷ 10, one decimal).
export const judgeMarks = (h) => GUIDE.judges.map((j) => ({ id: j.id, name: j.name, area: j.area, mark: Math.round(h[j.from]) / 10 }));

export function freshReviews() {
  return { nextId: 1, list: [], rep: { value: 0, highestRankIndex: 0 }, stars: null, months: [], counts: { reviews: 0, byStars: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } } };
}

export function createReviews({ saved = null, bus = null, team = [], seed = 'resortworks', facilities = FACILITIES } = {}) {
  const s = load(saved);
  const rep = new ReputationSystem({ bus, ranks: RANKS });
  rep.load(s.rep);
  const syncRep = () => {
    s.rep = rep.serialize();
  };
  let lastDay = s.list.length ? s.list[0].day : 0;
  let cp = null; // (Milestone 7) the complaints system, once attached
  let mt = null; // (Milestone 8) the maintenance system, once attached
  const effOf = (id) => mt?.eff(id) ?? 1;

  function prune(today) {
    s.list = s.list.filter((v, i) => i < LIST_MAX || v.day > today - WINDOW_DAYS - 1);
  }

  function checkout(b, day) {
    const fx = cp?.closeStay(b, day) ?? null; // (Milestone 7) the stay's complaints, settled
    const cats = stayCategories(b, { team, facilities, roomType: roomTypeOf(b), cancel: fx?.cancel ?? {} });
    const base = finalSatisfaction(cats, b.type);
    const sat = fx ? r2(clamp(base + fx.bonus + fx.penalty)) : base;
    const stars = reviewStars(sat);
    const id = `V${s.nextId++}`;
    const fitBand = stars >= 4 ? 'high' : stars === 3 ? 'mid' : 'low';
    let text = writeReview(REVIEW_TEXT, { stats: cats, fitBand, seed: `${seed}:${id}` });
    const unresolved = fx?.unresolved ?? 0;
    if (fx?.complaints.length) text = `${text} ${new Rng(`${seed}:${id}:complaint`).pick(COMPLAINT_TEXT[unresolved ? 'unresolved' : 'recovered'])}`;
    const review = { id, booking: b.id, type: b.type, room: b.room, got: roomTypeOf(b), wanted: b.roomType, nights: b.nights, day, cats, sat, stars, rep: repFor(stars) + REP_UNRESOLVED * unresolved, text, late: !!b.late, short: !!b.shortLinen };
    if (fx?.complaints.length) Object.assign(review, { complaints: fx.complaints, recovered: fx.recovered, unresolved, bonus: fx.bonus, penalty: fx.penalty, base, memory: fx.saved ? SAVED_MEMORY : null });
    s.list.unshift(review);
    s.counts.reviews++;
    s.counts.byStars[stars]++;
    lastDay = day;
    rep.add(REP.stay, 'stay');
    if (REP.stars[stars]) rep.add(REP.stars[stars], `${stars}-star review`);
    if (unresolved) rep.add(REP_UNRESOLVED * unresolved, 'unresolved complaint'); // (Milestone 7, bible §27A)
    syncRep();
    prune(day);
    bus?.emit('review:new', { review: clone(review) });
    return review;
  }

  // The day change into a new month (day = the new day, a multiple of 28): rate the 28 days just ended.
  function monthEnd(day) {
    const h = headlineFrom(s.list, day - WINDOW_DAYS, day - 1, facilities, effOf);
    const prev = s.months[s.months.length - 1] ?? null;
    if (h.count === 0) {
      if (!prev) return null; // no stays at all yet: the rating stays "New"
      for (const k of ['satisfaction', 'service', 'value']) h[k] = prev.scores[k]; // a month with no stays keeps last month's
    }
    const qi = qualityIndex(h);
    const stars = starRating(h, qi);
    const month = { n: day / WINDOW_DAYS, day, scores: h, qi, stars, was: s.stars, marks: judgeMarks(h) };
    s.months.push(month);
    if (s.months.length > MONTHS_MAX) s.months.shift();
    s.stars = stars;
    bus?.emit('review:month', { month: clone(month) });
    return month;
  }

  const rv = {
    checkout,
    attachComplaints(c) {
      cp = c;
    },
    attachMaintenance(m) {
      mt = m;
    },
    onEdge(day, band) {
      if (band !== NIGHT) return;
      prune(day);
      if (day > 0 && day % WINDOW_DAYS === 0) monthEnd(day);
    },
    // Live headline scores (the last 28 days up to today).
    headline: (today) => headlineFrom(s.list, today - WINDOW_DAYS + 1, today, facilities, effOf),
    get list() {
      return s.list;
    },
    byId: (id) => s.list.find((v) => v.id === id) ?? null,
    get stars() {
      return s.stars;
    },
    get lastMonth() {
      return s.months[s.months.length - 1] ?? null;
    },
    get months() {
      return s.months;
    },
    get counts() {
      return clone(s.counts);
    },
    get rank() {
      return rep.rank;
    },
    get nextRank() {
      return rep.nextRank;
    },
    get repValue() {
      return rep.value;
    },
    get highestRankIndex() {
      return rep.highestRankIndex;
    },
    rankAtLeast: (id) => reached(RANKS, rep.highestRankIndex, id),
    // Debug: REP straight to the next Rank (or +n).
    addRep(n = null) {
      const next = rep.nextRank;
      const amt = n ?? (next ? next.min - rep.value : 0);
      if (amt) rep.add(amt, 'debug');
      syncRep();
      return rep.value;
    },
    // The live state the rank hook reads (no copy).
    get live() {
      return s;
    },
    get lastDay() {
      return lastDay;
    },
    serialize: () => clone(s),
  };
  return rv;
}
// The room type they got (the room's type — the booking keeps the type they wanted).
const roomTypeOf = (b) => roomById(b.room)?.typeId ?? b.roomType;

// The Resort Rank hook (src/systems/progressHooks.js): has a campaign save (or the live state) reached this rank?
export const rankReached = (reviewsState, id) => !!reviewsState && reached(RANKS, reviewsState.rep?.highestRankIndex ?? 0, id);

function load(saved) {
  const f = freshReviews();
  if (!saved || typeof saved !== 'object') return f;
  const s = clone(saved);
  return {
    nextId: Number.isFinite(s.nextId) ? s.nextId : 1,
    list: Array.isArray(s.list) ? s.list.filter((v) => v && GUEST_WEIGHTS[v.type] && v.cats) : [],
    rep: { value: Number.isFinite(s.rep?.value) ? s.rep.value : 0, highestRankIndex: Number.isFinite(s.rep?.highestRankIndex) ? s.rep.highestRankIndex : 0 },
    stars: [1, 2, 3, 4, 5].includes(s.stars) ? s.stars : null,
    months: Array.isArray(s.months) ? s.months : [],
    counts: { reviews: s.counts?.reviews ?? 0, byStars: { ...f.counts.byStars, ...(s.counts?.byStars ?? {}) } },
  };
}
