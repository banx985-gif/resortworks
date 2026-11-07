// Rivals, the award calendar, Prestige and the Roadside Travel Expo (Milestone 23, bible §24 / §25 / §27A / §27L;
// Kairosoft rule 1). Every visible award is judged once a game year on its month (the month change into it): the resort
// must meet its eligibility before then; its category score is the §27L formula over the last 84 days' stays and the
// resort's state; each rival in its field scores base + growth × (year − 1) + its specialty (+ Mirage One's adaptive +8
// on the resort's strongest category) + a ±4 variance rolled from the run's seed and saved at the start of the year — so
// every ceremony runs the same way after a reload. A win: REP +150, Prestige +3 on its first win, a Staff Item, the
// partners hear it (P08). Prestige is live (0–100: awards, prestige guests, VIP memories, World-Class, the Signature,
// beating Mirage One; −5 for a year ending under 3★). AWR11 / AWR12 are secret (never judged here). Every Month 9 the
// Roadside Travel Expo invites the resort: Enter for a ranked result against all eight rivals and a small REP / demand
// reward, or Skip. Victor Crane (Crown Bay) has a line on award nights and at the Expo.
//   createAwards({ saved, bus, seed, reviews, finance, layout, staffing, maintenance, events, guestbook, themes, items,
//     partners, progress, bookings, demand }) → aw
//     aw.onEdge(day, band) · judge(id, day) (tests) · scoreOf(id) (the inputs and score now) · rivalScore(rid, id, year)
//     aw.enterExpo() · skipExpo() · whyNotEligible(id) · won(id) · wins · results · prestige · expo · live · serialize()
//   On the bus: 'awards:result' { result, line } · 'awards:expo' { invite | result } · 'awards:prestige' · 'awards:change'
import { Rng } from '../../../../core/Rng.js';
import { RIVALS, rivalById, AWARDS, awardById, VISIBLE_AWARDS, VARIANCE, WIN, PRESTIGE, REP_EXTRA, EXPO, VICTOR_LINES } from '../../data/awards.js';
import { GUEST_TYPES, ROOM_TYPES } from '../../data/bookings.js';
import { ROOMS } from '../../data/lot.js';
import { BANDS } from '../../data/calendar.js';
import { rankAtLeast } from '../../data/build.js';
import { memoryById } from '../../data/guestbook.js';
import { has } from './facilities.js';
import { rx } from './research.js';
import { activeCombos } from './themes.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
const r2 = (x) => Math.round(x * 100) / 100;
const BAND = Object.fromEntries(BANDS.map((b, i) => [b.id, i]));
const TYPE_IDS = Object.keys(GUEST_TYPES).sort();
const CATS = ['room', 'clean', 'service', 'food', 'activities', 'comfort', 'value'];
const DINING = ['F06', 'F09', 'F22', 'F25'];
const VENUES = ['F19', 'F20', 'F32'];
const WELL = ['F16', 'F17', 'F18', 'F30'];
export const freshAwards = () => ({ year: 0, variance: {}, results: [], wins: [], stays: [], prestige: { value: 0, firstWins: {}, firstTypes: [], vipMemory: 0, rivalVictories: 0, worldClass: false, signature: false, log: [] }, rep: { types: [], combos: [] }, expo: null, expoHistory: [], expoDemand: null, stats: { ceremonies: 0, entered: 0, wins: 0 } });
const hasTag = (typeId, tags) => tags.some((t) => GUEST_TYPES[typeId]?.tags?.includes(t));
const monthOf = (day) => (Math.floor(day / 28) % 12) + 1;
const yearOf = (day) => Math.floor(day / 336) + 1;

export function createAwards({ saved = null, bus = null, seed = 'resortworks', reviews = null, finance = null, layout = null, staffing = null, maintenance = null, events = null, guestbook = null, themes = null, items = null, partners = null, progress = null, bookings = null, demand = null } = {}) {
  const s = load(saved);
  let today = 0;
  const changed = () => bus?.emit('awards:change', {});

  // --- Prestige ---------------------------------------------------------------------------------------------------
  const first = (n) => n * (1 + rx('prestigeFirst')); // R36: first-time sources +20%
  function addPrestige(n, why) {
    const v = Math.max(0, Math.min(100, r2(s.prestige.value + n)));
    if (v === s.prestige.value) return;
    s.prestige.value = v;
    s.prestige.log.unshift({ day: today, n: r2(n), why });
    if (s.prestige.log.length > 20) s.prestige.log.pop();
    bus?.emit('awards:prestige', { value: v, n, why });
  }

  // --- what the resort did (84 days of stays) ----------------------------------------------------------------------
  function onReview(v) {
    s.stays.push([v.day, TYPE_IDS.indexOf(v.type), Math.round(v.sat), v.stars, ...CATS.map((k) => v.cats?.[k] ?? 0)]);
    // §27A: a guest type's first stay +15 REP; a Prestige guest type's first stay at 78+ Prestige +3
    if (!s.rep.types.includes(v.type)) {
      s.rep.types.push(v.type);
      reviews?.addRepFor?.(REP_EXTRA.firstType, `First ${GUEST_TYPES[v.type]?.name}`);
    }
    if (hasTag(v.type, ['prestige']) && v.sat >= PRESTIGE.firstSat && !s.prestige.firstTypes.includes(v.type)) {
      s.prestige.firstTypes.push(v.type);
      addPrestige(first(PRESTIGE.firstPrestigeGuest), `First ${GUEST_TYPES[v.type].name}`);
    }
  }
  function onMemory(g, name) {
    const mem = memoryOf(name);
    if (mem?.kind !== 'positive' && mem?.kind !== 'redemption') return;
    reviews?.addRepFor?.(REP_EXTRA.memory, `Memory: ${name}`);
    if (hasTag(g.type, ['vip', 'prestige']) && mem.kind === 'positive' && s.prestige.vipMemory < PRESTIGE.vipMemoryCap) {
      s.prestige.vipMemory += PRESTIGE.vipMemory;
      addPrestige(PRESTIGE.vipMemory, `Memory: ${name}`);
    }
  }
  const window84 = () => s.stays.filter((x) => x[0] > today - 84);
  const avg = (l, f) => (l.length ? l.reduce((t, x) => t + f(x), 0) / l.length : 0);
  const cat = (x, k) => x[4 + CATS.indexOf(k)];
  // The formula inputs now (0–100 each).
  function inputs() {
    const st = window84();
    const of = (tags) => st.filter((x) => hasTag(TYPE_IDS[x[1]], tags));
    const fam = of(['family']);
    const h = reviews?.headline?.(today) ?? {};
    const evs = (events?.history ?? []).filter((e) => (e.ended ?? 0) > today - 336);
    const venues = VENUES.filter(has);
    const lastMonth = finance?.months?.at?.(-1) ?? null;
    const ap = layout?.appeal?.() ?? h.appeal ?? 60;
    const wellCap = themes?.inputs ? themes.inputs(today).util(WELL) : 0;
    const gb = guestbook;
    const res9 = s.results.find((r) => r.id === 'AWR09' && r.year === yearOf(today) && r.eligible);
    return {
      sat: avg(st, (x) => x[2]),
      value: avg(st, (x) => cat(x, 'value')),
      service: avg(st, (x) => cat(x, 'service')),
      reviews: avg(st, (x) => x[3] * 20),
      clean: avg(st, (x) => cat(x, 'clean')),
      comfort: avg(st, (x) => cat(x, 'comfort')),
      food: avg(st, (x) => cat(x, 'food')),
      famSat: avg(fam, (x) => x[2]),
      famAct: avg(fam, (x) => cat(x, 'activities')),
      luxSat: avg(of(['luxury']), (x) => x[2]),
      wellSat: avg(of(['wellness']), (x) => x[2]),
      vip: avg(of(['vip', 'prestige']), (x) => x[2]),
      wellbeing: staffing?.wellbeing?.() ?? h.wellbeing ?? 75,
      diningAppeal: Math.min(100, ap + 5 * DINING.filter(has).length),
      eventAvg: avg(evs, (e) => e.score ?? 0),
      venue: venues.length ? avg(venues, (id) => maintenance?.condition?.(id) ?? 90) : 0,
      appeal: ap,
      finance: Math.max(0, Math.min(100, 50 + (lastMonth && lastMonth.profit > 0 ? 30 : 0) + ((finance?.debt ?? 0) === 0 ? 20 : -20))),
      wellUtil: wellCap,
      prestige: s.prestige.value,
      guestbook: Math.min(100, (gb?.guests?.length ?? 0) / 2 + (gb?.regulars?.length ?? 0) * 3),
      awardHistory: Math.min(100, s.wins.length * 10),
      awr09: res9?.score ?? 0,
    };
  }
  function scoreOf(id, inp = inputs()) {
    const a = awardById(id);
    return r2(Object.entries(a.w).reduce((t, [k, w]) => t + (w * (inp[k] ?? 0)) / 100, 0));
  }
  // The resort's strongest award category now (Mirage One's adaptive +8 goes there).
  function strongest(inp = inputs()) {
    let best = null;
    for (const a of VISIBLE_AWARDS) {
      const v = scoreOf(a.id, inp);
      if (!best || v > best.v) best = { id: a.id, v };
    }
    return best?.id ?? null;
  }
  // ±4 a rival a visible award, rolled from the run's seed at the start of each year and saved.
  function rollYear(year) {
    if (s.year === year) return;
    const rng = new Rng(`${seed}:awards:${year}`);
    s.variance = {};
    for (const a of VISIBLE_AWARDS) s.variance[a.id] = Object.fromEntries(RIVALS.map((r) => [r.id, r2(rng.next() * 2 * VARIANCE - VARIANCE)]));
    s.variance.EXPO = Object.fromEntries(RIVALS.map((r) => [r.id, r2(rng.next() * 2 * VARIANCE - VARIANCE)]));
    s.year = year;
  }
  function rivalScore(rid, id, year = yearOf(today), strong = null) {
    const r = rivalById(rid);
    let v = r.base + r.growth * (year - 1) + (s.variance[id]?.[rid] ?? 0);
    if (r.spec.includes(id)) v += r.bonus;
    if (r.adaptive && strong === id) v += r.bonus;
    return r2(v);
  }
  // Eligible for this award now? (one plain line why not, or null)
  function whyNotEligible(id) {
    const a = awardById(id);
    if (!a || a.secret) return 'Secret.';
    const e = a.elig ?? {};
    if (e.stays && (bookings?.stats?.checkOuts ?? 0) < e.stays) return `Needs ${e.stays} completed stays.`;
    if (e.rank && !rankAtLeast(reviews?.rank?.id ?? 'E', e.rank)) return `Needs Rank ${e.rank}.`;
    if (e.familyStays && s.stays.filter((x) => GUEST_TYPES[TYPE_IDS[x[1]]]?.family).length < e.familyStays) return `Needs ${e.familyStays} family stays (in 84 days).`;
    if (e.built && !e.built.some(has)) return `Needs ${a.eligWords}.`;
    if (e.events && (events?.stats?.held ?? 0) < e.events) return 'Needs an event held.';
    if (e.roomRank && !ROOMS.some((r) => ROOM_TYPES[r.typeId].rank >= e.roomRank)) return `Needs ${a.eligWords}.`;
    if (e.won && !s.wins.some((w) => w.id === e.won)) return `Needs ${a.eligWords}.`;
    return null;
  }
  const won = (id) => s.wins.some((w) => w.id === id);
  // The ceremony.
  function judge(id, day = today) {
    const a = awardById(id);
    const year = yearOf(day);
    rollYear(year);
    const why = whyNotEligible(id);
    const res = { id, year, month: a.month, day, eligible: !why, why: why ?? null, score: null, field: [], rank: null, won: false };
    s.stats.ceremonies++;
    const inp = inputs();
    const strong = strongest(inp);
    res.field = a.field.map((rid) => ({ id: rid, score: rivalScore(rid, id, year, strong) })).sort((x, y) => y.score - x.score);
    if (!why) {
      res.score = scoreOf(id, inp);
      res.rank = 1 + res.field.filter((r) => r.score >= res.score).length;
      res.won = res.rank === 1;
    }
    let line = null;
    if (res.won) {
      const firstWin = !won(id);
      s.wins.push({ id, year, day });
      s.stats.wins++;
      reviews?.addRepFor?.(WIN.rep, a.name);
      if (firstWin) {
        s.prestige.firstWins[id] = year;
        addPrestige(first(WIN.prestigeFirst), `${a.name} (first win)`);
      }
      if (a.field.includes('RV08') && s.prestige.rivalVictories < WIN.rivalVictoryCap) {
        s.prestige.rivalVictories += WIN.rivalVictory;
        addPrestige(WIN.rivalVictory, 'Beat Mirage One');
      }
      items?.grant?.('award');
      partners?.signal?.('award', { id });
      line = victor('win', `${id}:${year}`);
    } else if (a.field.includes('RV07')) line = victor(why ? 'absent' : 'lose', `${id}:${year}`);
    s.results.unshift(res);
    if (s.results.length > 40) s.results.pop();
    bus?.emit('awards:result', { result: clone(res), name: a.name, line });
    changed();
    return res;
  }
  const victor = (kind, key) => new Rng(`${seed}:victor:${key}`).pick(VICTOR_LINES[kind]);

  // --- the Expo (Kairosoft rule 1) ----------------------------------------------------------------------------------
  function enterExpo() {
    const x = s.expo;
    if (!x || x.done) return { ok: false, why: 'The Expo isn’t on.' };
    const inp = inputs();
    const mine = r2(EXPO.categories.reduce((t, id) => t + scoreOf(id, inp), 0) / EXPO.categories.length); // the general categories
    const field = RIVALS.map((r) => ({ id: r.id, score: r2(r.base + r.growth * (x.year - 1) + (s.variance.EXPO?.[r.id] ?? 0)) }));
    const all = [...field, { id: 'you', score: mine }].sort((a, b) => b.score - a.score || (a.id === 'you' ? 1 : -1));
    const place = all.findIndex((r) => r.id === 'you') + 1;
    const rw = EXPO.rewards.find((r) => place <= r.upTo);
    reviews?.addRepFor?.(rw.rep, `${EXPO.name}: #${place}`);
    if (rw.demand) s.expoDemand = { until: today + EXPO.demandDays, v: rw.demand };
    Object.assign(x, { done: true, entered: true, score: mine, place, table: all, rep: rw.rep, demand: rw.demand, line: victor('expo', `expo:${x.year}`) });
    s.expoHistory.unshift({ year: x.year, place, score: mine });
    s.stats.entered++;
    bus?.emit('awards:expo', { result: clone(x) });
    changed();
    return { ok: true, result: x };
  }
  function skipExpo() {
    const x = s.expo;
    if (!x || x.done) return false;
    Object.assign(x, { done: true, entered: false });
    s.expoHistory.unshift({ year: x.year, place: null, score: null });
    changed();
    return true;
  }
  demand?.set('Expo', (typeId) => (typeId || !s.expoDemand || s.expoDemand.until < today ? null : { base: s.expoDemand.v, words: EXPO.name }));

  function onEdge(day, band) {
    today = day;
    if (band !== BAND.night) return;
    // a facility combo's first time: REP +40 (§27A)
    for (const c of activeCombos()) if (!s.rep.combos.includes(c)) {
      s.rep.combos.push(c);
      reviews?.addRepFor?.(REP_EXTRA.firstCombo, `First combo ${c}`);
    }
    s.stays = s.stays.filter((x) => x[0] > day - 85);
    if (!(day > 0 && day % 28 === 0)) return;
    const m = monthOf(day);
    const year = yearOf(day);
    // a new year: the variance is rolled; a year that ended under 3★ costs Prestige 5
    if (m === 1) {
      if (s.year && (reviews?.stars ?? 0) < PRESTIGE.decayBelowStars && s.prestige.value > 0) addPrestige(-PRESTIGE.yearDecay, 'A year under 3★');
      rollYear(year);
    }
    rollYear(year);
    for (const a of VISIBLE_AWARDS) if (a.month === m) judge(a.id, day);
    if (m === EXPO.month) {
      s.expo = { year, day, done: false };
      bus?.emit('awards:expo', { invite: true, year });
    } else if (s.expo && !s.expo.done) skipExpo();
    // Prestige from the stage and the Signature (once each)
    if (progress?.stage === 'worldclass' && !s.prestige.worldClass) {
      s.prestige.worldClass = true;
      addPrestige(first(PRESTIGE.worldClass), 'World-Class Resort');
    }
    if (themes?.signature && !s.prestige.signature) {
      s.prestige.signature = true;
      addPrestige(first(PRESTIGE.signature), 'A Signature');
    }
    changed();
  }

  return {
    onEdge,
    onReview,
    onMemory,
    judge,
    addPrestige,
    inputs,
    scoreOf: (id) => scoreOf(id),
    rivalScore,
    whyNotEligible,
    won,
    enterExpo,
    skipExpo,
    strongest: () => strongest(),
    get wins() {
      return s.wins;
    },
    get results() {
      return s.results;
    },
    get prestige() {
      return s.prestige.value;
    },
    get prestigeLog() {
      return s.prestige.log;
    },
    get expo() {
      return s.expo;
    },
    get expoHistory() {
      return s.expoHistory;
    },
    get variance() {
      return s.variance;
    },
    get stats() {
      return clone(s.stats);
    },
    // the live state the speed-unlock hook reads (no copy)
    get live() {
      return s;
    },
    serialize: () => clone(s),
  };
}
const memoryOf = (name) => {
  for (const id of ['honeymoon', 'pool', 'meal', 'saved', 'disaster', 'celebrity', 'event']) if (memoryById(id)?.name === name) return memoryById(id);
  return null;
};
function load(saved) {
  const f = freshAwards();
  if (!saved || typeof saved !== 'object') return f;
  const s = clone(saved);
  return { ...f, ...s, prestige: { ...f.prestige, ...(s.prestige ?? {}) }, rep: { ...f.rep, ...(s.rep ?? {}) }, stats: { ...f.stats, ...(s.stats ?? {}) } };
}
