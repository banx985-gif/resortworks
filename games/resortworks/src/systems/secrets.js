// The Secret Engine's 50 (Milestone 27, bible §29) on core/SecretEngine (rules as data, trigger-event indexing, clue
// stages, repeat-run easing) and core/UnlockRunner (each reward exactly once a run). Nothing here changes how the resort
// runs until a secret is found: the rules only read facts (FACTS below, from the resort's systems and this run's counters)
// and a found secret's reward goes through a system that already exists — a Legendary / Secret applicant (staffing's
// invites), a secret guest type that can now book (guests.js), F34 / F35 that can be built (site), AWR11 / AWR12 judged
// (awards), P09 / P10 offering (partners), the Prestige Grounds gate (progress), Prestige, a small boost, an account
// keepsake or Prestige Tokens.
//   • found secrets and their clue stages: core's run half in the campaign save, its account half (history: found in any
//     run, the account facts) in the account store — a repeat run checks the eased version (§30.4a)
//   • clue stages: 1 a rumour · 2 "almost there: still missing {categories}" · 3 found (exact conditions from then on)
//   • the rival poach (SEC42's "lose an Elite staff to a rival event"): a lost award may cost an Elite to the winner
//     (8%, from Year 2, at most once a year); beat that rival in a later award and they ask to come back for 28 days
//   • the four Secret staff specialisations (prestigeFood, eventMemory, hkGuard, mgGuard) work through hooks here
//   • Kairosoft "fixing faults gives a little research": a finished breakdown repair takes an hour off the running project
//   createSecrets({ account, saved, bus, run, ngPlus }) → sec
//     sec.tick() · onEdge(day, band) · archive() (the Secret Archive rows) · stage(id) · found(id) · whyFalse(id) ·
//     invites (ids that can be hired now) · invited(id) · guestOpen(id) · buildOpen(id) · awardOpen(id) · partnerOpen(id) ·
//     stageOpen(secretId) · boosts · extraSat(b) · eventBonus(evt) · prestigeTokens · cosmetics · count ·
//     debugForce(id) (tests / ?debug=1) · facts · counters · engine · serialize() (the run half)
//   On the bus: core 'secret:unlocked' / 'secret:clue' · 'secrets:found' { id, name, words } · 'secrets:arrival'
//     { id, name, until } · 'secrets:poached' { id, name, rival } · 'secrets:change'
import { SecretEngine, FactRegistry } from '../../../../core/SecretEngine.js';
import { UnlockRunner } from '../../../../core/UnlockActions.js';
import { Rng } from '../../../../core/Rng.js';
import { SECRETS, LEGEND_SECRETS, secretById, RARE_FOUR, ARRIVAL, EASING, BOOSTS, REWARD_WORDS, REPAIR_RESEARCH } from '../../data/secrets.js';
const LEGENDARY_FIVE = ['S09', 'S19', 'S29', 'S39', 'S49'];
import { GUEST_TYPES } from '../../data/bookings.js';
import { ROOMS, FACILITIES } from '../../data/lot.js';
import { BANDS } from '../../data/calendar.js';
import { stageIndex, FACILITY_BUILD } from '../../data/build.js';
import { VISIBLE_AWARDS } from '../../data/awards.js';
import { MEMORIES } from '../../data/guestbook.js';
import { THEMES } from '../../data/themes.js';
import { staffDef } from '../../data/roster.js';
import { fireStaff } from './staffing.js';
import { setSecretGuests } from './guests.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
const BAND = Object.fromEntries(BANDS.map((b, i) => [b.id, i]));
const YEAR = 336;
const ROLES = ['FO', 'HK', 'HS', 'AE', 'MG'];
const LUX_ROOMS = ['RM09', 'RM10', 'RM11', 'RM12'];
const LUX_FAC = Object.entries(FACILITY_BUILD).filter(([, b]) => b.luxury).map(([id]) => id);
const OPS = ['R25', 'R26', 'R27', 'R28', 'R29', 'R30'];
const MKT = ['R31', 'R32', 'R33', 'R34', 'R35', 'R36'];
const WEDDINGS = ['EV03', 'EV11'];
const POSITIVE = new Set(MEMORIES.filter((m) => m.kind === 'positive').map((m) => m.name));
const EVENT_MEMORY = MEMORIES.find((m) => m.id === 'event')?.name;
const TIER_RANK = { standard: 0, rare: 1, elite: 2, legendary: 3, secret: 4, divine: 5 };
const tagged = (typeId, tag) => !!GUEST_TYPES[typeId]?.tags?.includes(tag);
// The rival poach (Claude Code's pick, DECISIONS M27): rare and gentle.
export const POACH = { chance: 0.08, fromYear: 2, backDays: 28 };
const SECRET_GUEST = { GT20: 'SEC11', GT21: 'SEC12', GT22: 'SEC13', GT23: 'SEC14', GT24: 'SEC15' };

export const freshSecretsRun = () => ({
  c: {
    recovered90: 0, recDays: [], recoveries7Best: 0, best: {}, luxPrestigeStays: 0, luxury90: 0, familyStays: 0, wellnessStays: 0,
    cleanStreak: 0, cleanStreakBest: 0, hk: { since: 0, turns: 0, lates: 0 }, today: { turns: 0, lates: 0, complaints: 0, noise: 0 }, eventsFood90: 0,
    events95: {}, weddings: 0, weddingSum: 0, eventMemories: 0, positiveMemories: 0, downSince: {}, noLongBreakdown: 0,
    noLongBreakdownBest: 0, appeal95: 0, appeal95Best: 0, celebBudget95: 0, critic: { first: null, redeemed: false },
    viewRoomsBest: 0, silentWing: 0, silentWingBest: 0, packed: 0, packedBest: 0, quietWeek: 0, quietWeekBest: 0, headline90: 0,
    headline90Best: 0, perfectDay: 0, occM: [0, 0], occY: [0, 0], monthProfitBest: null, monthsSeen: 0, halfFullRecord: false, mktYears: [],
    noAdsYear: false, luxBuilt: false, fiveNoLuxury: false, backToBasics: false, wetFixes: 0, wetSat: [0, 0], stormRecoveries: 0,
    beatCrownBay: [], poached: null, poachYears: [], rivalRehires: 0, joined: {}, start: null, hired: [], repairMonth: -1,
    repairMinutes: 0, mgGuardMonth: -1, hkGuardWeek: -1,
  },
  engine: null,
  runner: null,
  invites: {},
});

export function createSecrets({ account = {}, saved = null, bus = null, run = {}, ngPlus = () => 0 } = {}) {
  const f = freshSecretsRun();
  const st = { ...f, ...(saved ? clone(saved) : {}), c: { ...f.c, ...(saved?.c ? clone(saved.c) : {}) } };
  st.c.today = { ...f.c.today, ...(st.c.today ?? {}) };
  const c = st.c;
  const R = run;
  let today = R.bookings?.at?.day ?? 0;
  const runId = () => R.seed ?? 'run';
  const team = () => R.team ?? [];
  const hl = () => R.reviews?.headline?.(today) ?? {};
  const level = (id) => FACILITIES.find((x) => x.id === id)?.level ?? 0;
  const builtNow = (id) => FACILITIES.some((x) => x.id === id);
  // who was here at the start (or when this save first met secrets): the run's first staff (not the Founder: SEC31)
  if (!c.start) {
    c.start = today < 1 ? team().filter((m) => !m.founder).map((m) => m.id) : [];
    for (const m of team()) c.joined[m.id] ??= today;
  }
  for (const m of team()) if (!c.hired.includes(m.id)) c.hired.push(m.id);
  if (ROOMS.some((r) => LUX_ROOMS.includes(r.typeId)) || LUX_FAC.some(builtNow)) c.luxBuilt = true;

  // --- the facts the rules read ----------------------------------------------------------------------------------------
  const facts = new FactRegistry();
  const occNow = () => {
    const open = ROOMS.filter((r) => !R.site?.isClosed?.(r.id)).length;
    return open ? (R.bookings?.staying?.length ?? 0) / open : 0;
  };
  const food28 = () => {
    const list = (R.reviews?.list ?? []).filter((v) => v.day > today - 28 && v.day <= today);
    return list.length ? list.reduce((t, v) => t + (v.cats?.food ?? 0), 0) / list.length : 0;
  };
  const guests = () => R.guestbook?.guests ?? [];
  const everFound = () => SECRETS.filter((r) => engine.everUnlocked(r.id)).map((r) => r.id);
  facts
    .define('recovered90', () => c.recovered90)
    .define('foLevelAvg', () => {
      const fo = team().filter((m) => m.role === 'FO');
      return fo.length ? fo.reduce((t, m) => t + (m.level ?? 1), 0) / fo.length : 0;
    })
    .define('rareTypesHosted', () => RARE_FOUR.filter((id) => c.best[id] != null).length)
    .define('hiredEver', () => engine.accountFact('hiredEver') ?? [])
    .define('hiredRun', () => c.hired)
    .define('cleanStreakBest', () => c.cleanStreakBest)
    .define('hkYearOk', () => today - c.hk.since >= 365 && c.hk.turns > 0 && c.hk.lates / c.hk.turns < 0.01)
    .define('food28', food28)
    .define('eventsFood90', () => c.eventsFood90)
    .define('awardsWon', () => (R.awards?.wins ?? []).map((w) => w.id))
    .define('luxPrestigeStays', () => c.luxPrestigeStays)
    .define('events95', () => Object.values(c.events95).reduce((t, x) => t + x, 0))
    .define('event95Kinds', () => Object.keys(c.events95).length)
    .define('eventMemories', () => c.eventMemories)
    .define('noLongBreakdownBest', () => c.noLongBreakdownBest)
    .define('opsResearchDone', () => OPS.every((id) => R.research?.done?.(id)))
    .define('appeal95Best', () => c.appeal95Best)
    .define('stays', () => R.bookings?.stats?.checkOuts ?? 0)
    .define('openComplaints', () => (R.complaints?.open ?? []).length)
    .define('stars', () => R.reviews?.stars ?? 0)
    .defineGroup('built', (id) => builtNow(id))
    .defineGroup('level', (id) => level(id))
    .define('luxury90', () => c.luxury90)
    .define('roomKinds', () => new Set(ROOMS.map((r) => r.typeId)).size)
    .define('facilityKinds', () => new Set(FACILITIES.map((x) => x.id)).size)
    .define('prestige', () => R.awards?.prestige ?? 0)
    .define('visibleAwards', () => new Set((R.awards?.wins ?? []).map((w) => w.id).filter((id) => VISIBLE_AWARDS.some((a) => a.id === id))).size)
    .define('positiveMemories', () => c.positiveMemories)
    .define('celebBudget95', () => c.celebBudget95)
    .define('criticRedeemed', () => !!c.critic.redeemed)
    .define('familyYears', () => Math.max(0, ...guests().filter((g) => GUEST_TYPES[g.type]?.family).map((g) => new Set(g.stays.map((x) => Math.floor(x.day / YEAR))).size)))
    .define('allVisibleBuilt', () => Array.from({ length: 33 }, (_, i) => `F${String(i + 1).padStart(2, '0')}`).every(builtNow))
    .define('royalTrio90', () => ['GT21', 'GT22', 'GT23'].filter((id) => (c.best[id] ?? 0) >= 90).length)
    .define('viewRoomsBest', () => c.viewRoomsBest)
    .define('silentWingBest', () => c.silentWingBest)
    .define('familyStays', () => c.familyStays)
    .define('wellnessStays', () => c.wellnessStays)
    .define('weddings', () => c.weddings)
    .define('weddingAvg', () => (c.weddings ? c.weddingSum / c.weddings : 0))
    .define('oneToFive', () => guests().some((g) => {
      const i = g.stays.findIndex((x) => x.stars === 1);
      return i >= 0 && g.stays.slice(i + 1).some((x) => x.stars === 5);
    }))
    .define('packedBest', () => c.packedBest)
    .define('halfFullRecord', () => c.halfFullRecord)
    .define('noAdsYear', () => c.noAdsYear)
    .define('starterLoyal', () => today >= 20 * YEAR - 1 && c.start.some((id) => team().some((m) => m.id === id) && (c.joined[id] ?? 0) === 0))
    .define('fiveNoLuxury', () => c.fiveNoLuxury)
    .define('stormRecoveries', () => c.stormRecoveries)
    .define('quietWeekBest', () => c.quietWeekBest)
    .define('themesMin', () => Math.min(...THEMES.map((t) => R.themes?.progress?.[t.id] ?? 0)))
    .define('recoveries7Best', () => c.recoveries7Best)
    .define('paradise95', () => ((c.best.GT24 ?? 0) >= 95 ? 1 : 0))
    .define('secretsFound', () => everFound().length)
    .define('otherSecrets', () => everFound().filter((id) => id !== 'SEC50').length)
    .define('headline90Best', () => c.headline90Best)
    .define('eliteEveryRole', () => ROLES.every((r) => team().some((m) => m.role === r && (TIER_RANK[m.tier] ?? 0) >= TIER_RANK.elite)))
    .define('p09Active', () => (R.partners?.active ?? []).some((x) => (x?.id ?? x) === 'P09'))
    .define('prestigeTypesHosted', () => Object.keys(c.best).filter((id) => tagged(id, 'prestige')).length)
    .define('beatCrownBay', () => c.beatCrownBay.length)
    .define('rivalRehires', () => c.rivalRehires)
    .define('twentyYears', () => today >= 19 * YEAR && (R.finance?.cash ?? 0) >= 0 && (R.finance?.debt ?? 0) <= 0 && (R.reviews?.stars ?? 0) >= 4)
    .define('stageIndex', () => stageIndex(R.progress?.stage ?? 'roadside'))
    .define('tenYearsEveryRole', () => ROLES.every((r) => team().some((m) => m.role === r && today - (c.joined[m.id] ?? today) >= 10 * YEAR)))
    .define('mostReturns', () => Math.max(0, ...guests().map((g) => g.stays.length - 1)))
    .define('backToBasics', () => c.backToBasics)
    .define('perfectDay', () => c.perfectDay)
    .define('paradiseHosted', () => (c.best.GT24 != null ? 1 : 0))
    // (Milestone 27b) Aaron's secret
    .define('legendsHiredEver', () => LEGENDARY_FIVE.filter((id) => (engine.accountFact('hiredEver') ?? []).includes(id) || c.hired.includes(id)).length)
    .define('hallOfFame', () => guests().filter((g) => g.stays.some((x) => x.stars >= 5)).length)
    .define('rankS', () => R.reviews?.rank?.id === 'S');
  // Tests: a fact can be held at a value (debugFacts[name] = value) to check a rule's trigger and its negative.
  const debugFacts = {};
  const read = (name, ctx) => (name in debugFacts ? debugFacts[name] : facts.get(name, ctx));
  const factView = { get: read, has: (name) => facts.has(name) || name in debugFacts, names: facts.names };

  // --- rewards (each exactly once a run) -------------------------------------------------------------------------------
  const nameOf = (id) => staffDef(id)?.name ?? GUEST_TYPES[id]?.name ?? id;
  const handlers = {
    staff: (a, src) => {
      const days = Math.round((engine.isRepeat(String(src).replace('secret:', '')) ? ARRIVAL.repeatDays : ARRIVAL.days) * (1 + (R.partners?.total?.('legendary') ?? 0))); // (P09: +10%)
      st.invites[a.id] = today + days;
      bus?.emit('secrets:arrival', { id: a.id, name: nameOf(a.id), until: today + days, line: secretById(String(src).replace('secret:', ''))?.arrival ?? null });
    },
    guest: () => syncGuests(),
    prestige: (a, src) => R.awards?.addPrestige?.(a.amount, secretById(String(src).replace('secret:', ''))?.name ?? 'A secret'),
    prestigeTokens: (a) => {
      if (account) account.prestigeTokens = (account.prestigeTokens ?? 0) + a.amount;
    },
    cosmetic: (a) => {
      if (!account) return;
      account.cosmetics ??= [];
      if (!account.cosmetics.includes(a.id)) account.cosmetics.push(a.id);
    },
    clue: (a) => {
      const r = secretById(a.id);
      if (r && engine.clueStage(a.id) < 2) {
        engine.run.clues[a.id] = 2;
        bus?.emit('secret:clue', { rule: r, stage: 2, missing: [] });
      }
    },
    ending: () => {
      if (account) account.trueEnding ??= { day: today, runId: runId() };
    },
  };
  const runner = new UnlockRunner({ bus, handlers });
  if (st.runner) runner.load(st.runner);
  const engine = new SecretEngine({ bus, rules: [...SECRETS, ...LEGEND_SECRETS], facts: factView, runner, ngPlus, currencyTypes: ['prestigeTokens'], easing: EASING, now: () => ({ day: today, year: Math.floor(today / YEAR) + 1, runId: runId() }) });
  engine.loadAccount(account?.secrets ?? null);
  if (st.engine) engine.loadRun(st.engine);
  const opened = (type, id) => runner.has(type, id);
  function syncGuests() {
    const ids = Object.keys(SECRET_GUEST).filter((id) => opened('guest', id));
    if (R.demand) R.demand.secretGuests = new Set(ids); // this resort's (two resorts in one test never share it)
    setSecretGuests(ids);
  }
  syncGuests();
  const saveAccount = () => {
    if (account) account.secrets = engine.serializeAccount();
  };

  function tick() {
    engine.setRunFact('hiredEver', c.hired);
    const got = engine.notify('tick');
    if (got.length) {
      saveAccount();
      for (const g of got) bus?.emit('secrets:found', { id: g.rule.id, name: g.rule.name, words: rewardWords(g.rule), eased: g.eased });
      bus?.emit('secrets:change', { got: got.map((g) => g.rule.id) });
    } else saveAccount();
    return got;
  }
  function rewardWords(rule) {
    return rule.rewardWords ?? rule.rewardActions.map((a) => REWARD_WORDS[a.type]?.(a, nameOf) ?? a.type).join('; ');
  }

  // --- what the counters hear ------------------------------------------------------------------------------------------
  const keepBest = (k, kb) => (c[kb] = Math.max(c[kb], c[k]));
  function onReview(v) {
    c.today.turns++;
    if (v.late) c.today.lates++;
    if (v.recovered && v.sat >= 90) {
      c.recovered90++;
      c.recDays.push(v.day);
      c.recDays = c.recDays.filter((d) => d > v.day - 7);
      c.recoveries7Best = Math.max(c.recoveries7Best, c.recDays.length);
    }
    if (GUEST_TYPES[v.type]) c.best[v.type] = Math.max(c.best[v.type] ?? 0, Math.round(v.sat * 10) / 10);
    if (tagged(v.type, 'luxury') || tagged(v.type, 'prestige')) c.luxPrestigeStays++;
    if (tagged(v.type, 'luxury') && v.sat >= 90) c.luxury90++;
    if (GUEST_TYPES[v.type]?.family) c.familyStays++;
    if (tagged(v.type, 'wellness')) c.wellnessStays++;
    if ((v.cats?.clean ?? 0) >= 95 && !v.late) c.cleanStreak++;
    else if (v.late) c.cleanStreak = 0;
    keepBest('cleanStreak', 'cleanStreakBest');
    if (v.type === 'GT18' && v.got === 'RM01' && v.sat >= 95) c.celebBudget95++;
    if (v.type === 'GT20') {
      if (c.critic.first == null) c.critic.first = v.sat;
      else if (c.critic.first < 70 && v.sat >= 95) c.critic.redeemed = true;
    }
    if ((R.weather?.now ?? null) === 'wet') {
      c.wetSat[0] += v.sat;
      c.wetSat[1]++;
    }
  }
  function onEvent(evt) {
    if ((evt.parts?.food ?? 0) >= 90) c.eventsFood90++;
    if ((evt.score ?? 0) >= 95) c.events95[evt.ev] = (c.events95[evt.ev] ?? 0) + 1;
    if (WEDDINGS.includes(evt.ev)) {
      c.weddings++;
      c.weddingSum += evt.score ?? 0;
    }
  }
  function onMemory(name) {
    if (POSITIVE.has(name)) c.positiveMemories++;
    if (name === EVENT_MEMORY) c.eventMemories++;
  }
  function onAward(res) {
    if (!res?.eligible) return;
    const cb = res.field.find((x) => x.id === 'RV07');
    if (cb && res.score > cb.score && !c.beatCrownBay.includes(res.id)) c.beatCrownBay.push(res.id);
    if (res.id === 'AWR06' && res.won && !c.luxBuilt) c.backToBasics = true;
    // the rival poach: beat the rival who took them and they ask to come back
    const p = c.poached;
    if (p && !p.beat && res.field.some((x) => x.id === p.rival && res.score > x.score)) {
      p.beat = true;
      st.invites[p.id] = today + POACH.backDays;
      bus?.emit('secrets:arrival', { id: p.id, name: nameOf(p.id), until: today + POACH.backDays, back: true });
    }
    if (!res.won && !p) poachRoll(res);
  }
  function poachRoll(res) {
    const year = Math.floor(today / YEAR) + 1;
    if (year < POACH.fromYear || c.poachYears.includes(year)) return;
    const winner = res.field[0]?.id;
    if (!winner || new Rng(`${runId()}:poach:${res.id}:${year}`).next() >= POACH.chance) return;
    const who = team().filter((m) => !m.founder && m.tier === 'elite' && team().filter((x) => x.role === m.role).length > 1).sort((a, b) => a.id.localeCompare(b.id))[0];
    if (!who) return;
    const r = fireStaff({ ...R, bus }, who.id);
    if (!r.ok) return;
    c.poachYears.push(year);
    c.poached = { id: who.id, rival: winner, day: today, beat: false };
    bus?.emit('secrets:poached', { id: who.id, name: who.name, rival: winner });
  }
  function onHired(id) {
    if (!c.hired.includes(id)) c.hired.push(id);
    c.joined[id] = today;
    if (st.invites[id] != null) delete st.invites[id];
    if (c.poached?.id === id && c.poached.beat) {
      c.rivalRehires++;
      c.poached = null;
    }
  }
  function onBuilt({ kind, def }) {
    if ((kind === 'room' && LUX_ROOMS.includes(def)) || (kind === 'facility' && LUX_FAC.includes(def))) c.luxBuilt = true;
  }
  function onRepair(job) {
    if (job?.kind !== 'repair') return;
    const mi = Math.floor(today / 28);
    if (c.repairMonth !== mi) {
      c.repairMonth = mi;
      c.repairMinutes = 0;
    }
    const left = REPAIR_RESEARCH.capPerMonth - c.repairMinutes;
    if (left <= 0) return;
    const got = R.research?.hurry?.(Math.min(left, REPAIR_RESEARCH.minutes)) ?? 0;
    c.repairMinutes += got;
    if (job.target && c.downSince[job.target] != null && (R.weather?.now ?? null) === 'wet' && today - c.downSince[job.target] <= 2) c.wetFixes++;
  }
  // Each night (the day's end) and each month's end.
  function onNight(day) {
    const occ = occNow();
    c.occM = [c.occM[0] + Math.round(occ * 100), c.occM[1] + 1];
    c.occY = [c.occY[0] + Math.round(occ * 100), c.occY[1] + 1];
    // the housekeeping streak: under 1% late rooms since it began (a slip over 1%, after 50 turns, starts it again)
    c.hk.turns += c.today.turns;
    c.hk.lates += c.today.lates;
    if (c.hk.turns >= 50 && c.hk.lates / c.hk.turns >= 0.01) c.hk = { since: day, turns: 0, lates: 0 };
    const h = hl();
    // breakdowns left over a day
    const off = [...(R.maintenance?.offline ?? [])];
    for (const id of off) c.downSince[id] ??= day;
    for (const id of Object.keys(c.downSince)) if (!off.includes(id)) delete c.downSince[id];
    c.noLongBreakdown = Object.values(c.downSince).some((d) => day - d > 1) ? 0 : c.noLongBreakdown + 1;
    keepBest('noLongBreakdown', 'noLongBreakdownBest');
    c.appeal95 = (h.appeal ?? 0) >= 95 ? c.appeal95 + 1 : 0;
    keepBest('appeal95', 'appeal95Best');
    const five = ['satisfaction', 'service', 'appeal', 'wellbeing', 'prestige'].map((k) => h[k] ?? 0);
    c.headline90 = five.every((x) => x >= 90) ? c.headline90 + 1 : 0;
    keepBest('headline90', 'headline90Best');
    if (five.every((x) => x >= 100) && occ >= 0.8) c.perfectDay++;
    c.packed = occ >= 0.95 && c.today.complaints === 0 ? c.packed + 1 : 0;
    keepBest('packed', 'packedBest');
    c.quietWeek = occ >= 0.9 && c.today.noise === 0 ? c.quietWeek + 1 : 0;
    keepBest('quietWeek', 'quietWeekBest');
    // rooms with a guest and a positive view; the luxury wing's quiet, well-kept rooms
    const rooms = R.layout?.facts?.rooms ?? {};
    const viewOf = (id) => (rooms[id]?.views ?? []).reduce((t, x) => t + (x.value ?? 0), 0);
    c.viewRoomsBest = Math.max(c.viewRoomsBest, (R.bookings?.staying ?? []).filter((b) => viewOf(b.room) > 0).length);
    const quiet = ROOMS.filter((r) => LUX_ROOMS.includes(r.typeId) && (R.maintenance?.condition?.(r.id) ?? 0) >= 95 && (rooms[r.id]?.avgNoise ?? 99) < 10).length;
    c.silentWing = quiet >= 10 ? c.silentWing + 1 : 0;
    keepBest('silentWing', 'silentWingBest');
    c.today = { turns: 0, lates: 0, complaints: 0, noise: 0 };
    for (const [id, until] of Object.entries(st.invites)) if (until < day) delete st.invites[id];
    if (day > 0 && day % 28 === 0) monthEnd(day);
  }
  function monthEnd(day) {
    if (c.wetFixes >= 3 && c.wetSat[1] && c.wetSat[0] / c.wetSat[1] >= 85) c.stormRecoveries++;
    c.wetFixes = 0;
    c.wetSat = [0, 0];
    if (day % YEAR === 0) {
      const year = day / YEAR; // the year just ended (1, 2 …)
      const yr = c.occY[1] >= YEAR - 1 ? c.occY[0] / c.occY[1] : 0;
      if (yr >= 75 && !c.mktYears.includes(year)) c.noAdsYear = true;
      c.occY = [0, 0];
    }
  }
  // A month's books closed (finance:month): a new profit record in a month under 55% full (after the first two months)
  function onMonthBooks(m) {
    if (!Number.isFinite(m?.profit)) return;
    const occ = c.occM[1] ? c.occM[0] / c.occM[1] : 100;
    c.monthsSeen++;
    if (c.monthProfitBest != null && m.profit > c.monthProfitBest && occ < 55 && c.monthsSeen >= 3) c.halfFullRecord = true;
    c.monthProfitBest = Math.max(c.monthProfitBest ?? -Infinity, m.profit);
    c.occM = [0, 0];
  }
  function onEdge(day, band) {
    today = day;
    if (band === BAND.night) onNight(day);
    if (band === BAND.night || band === BAND.midday) tick();
  }
  for (const [ev, fn] of [
    ['review:new', ({ review }) => onReview(review)],
    ['events:result', ({ event }) => onEvent(event)],
    ['guestbook:memory', ({ memory }) => onMemory(memory)],
    ['awards:result', ({ result }) => onAward(result)],
    ['staff:hired', ({ id }) => onHired(id)],
    ['site:built', (x) => onBuilt(x)],
    ['mt:done', ({ job }) => onRepair(job)],
    ['finance:month', ({ month }) => onMonthBooks(month)],
    ['complaint:new', ({ complaint }) => {
      c.today.complaints++;
      if (complaint?.kind === 'noise') c.today.noise++;
    }],
    ['research:start', ({ id }) => MKT.includes(id) && !c.mktYears.includes(Math.floor(today / YEAR) + 1) && c.mktYears.push(Math.floor(today / YEAR) + 1)],
    ['review:month', ({ month }) => {
      if (month?.stars === 5 && !c.luxBuilt) c.fiveNoLuxury = true;
    }],
  ])
    bus?.on(ev, fn);
  for (const ev of ['review:new', 'events:result', 'awards:result', 'progress:stage', 'staff:hired', 'research:done', 'site:built', 'site:upgraded', 'partners:signed', 'guestbook:return']) bus?.on(ev, () => tick());

  // --- the Secret Archive ----------------------------------------------------------------------------------------------
  const condWords = (p) => {
    const cond = p.cond;
    const need = typeof p.need === 'number' ? Math.round(p.need * 10) / 10 : p.need;
    const val = typeof p.value === 'number' ? Math.round(p.value * 10) / 10 : Array.isArray(p.value) ? (p.ok ? 'yes' : 'not yet') : p.value === true ? 'yes' : p.value === false ? 'not yet' : p.value;
    return { fact: cond.fact, ok: p.ok, need, value: val, category: cond.category };
  };
  function whyFalse(id) {
    const r = secretById(id);
    if (!r) return null;
    const res = engine.evaluate(r, {});
    return { id, ok: res.ok, eased: res.eased, ng: res.ng, parts: res.all.map(condWords), missing: engine.missingCategories(res) };
  }
  function archive() {
    return [...SECRETS, ...LEGEND_SECRETS].map((r) => {
      const stage = engine.clueStage(r.id);
      const row = { id: r.id, name: r.name, category: r.category, stage, found: stage >= 3, foundNow: engine.unlockedInRun(r.id), ng: r.ngPlusMin, extra: !SECRETS.includes(r) };
      if (stage >= 3) Object.assign(row, { exact: r.exact ?? null, reward: rewardWords(r), check: whyFalse(r.id) });
      else if (stage >= 1) Object.assign(row, { rumour: r.clueStages[Math.min(stage, r.clueStages.length) - 1].text.includes('{missing}') ? r.clueStages[0].text : r.clueStages[Math.min(stage, r.clueStages.length) - 1].text, missing: stage >= 2 ? engine.missingCategories(engine.evaluate(r, {})) : [] });
      return row;
    });
  }

  // --- the Secret staff hooks (their specialisations, live from M27) ----------------------------------------------------
  const spec = (key) => team().filter((m) => !m.absent && staffDef(m.id)?.effect?.key === key).reduce((t, m) => t + (staffDef(m.id)?.effect?.pct ?? 0), 0);
  function extraSat(b) {
    let add = 0;
    for (const id of runner.list('boost')) {
      const x = BOOSTS[id];
      if (!x?.sat) continue;
      if (x.tags && !x.tags.some((t) => tagged(b.type, t))) continue;
      if (x.recovered && !b.recovered) continue;
      if (x.wet && (R.weather?.now ?? null) !== 'wet') continue;
      add += x.sat;
    }
    if (tagged(b.type, 'prestige') || tagged(b.type, 'vip')) add += spec('prestigeFood') / 10; // Chef Zero: +2
    // Halo Snow: the first late room each week costs nothing (its Service loss given back)
    if (b.late && spec('hkGuard') > 0) {
      const w = Math.floor(today / 7);
      if (c.hkGuardWeek !== w) {
        c.hkGuardWeek = w;
        add += 5;
      }
    }
    return add;
  }
  // Events: the wedding garden, Nova Joy (+2 score)
  const eventBonus = (evt) => (runner.has('boost', 'weddingGarden') && WEDDINGS.includes(evt?.ev) ? BOOSTS.weddingGarden.eventScore : 0) + spec('eventMemory') / 10;
  // Sage Evergreen: the first breakdown roll each month doesn't happen
  function breakdownGuard(id, minute, why) {
    if (why === 'test' || spec('mgGuard') <= 0) return false;
    const mi = Math.floor(minute / 1440 / 28);
    if (c.mgGuardMonth === mi) return false;
    c.mgGuardMonth = mi;
    return true;
  }

  const sec = {
    tick,
    onEdge,
    archive,
    whyFalse,
    stage: (id) => engine.clueStage(id),
    found: (id) => engine.everUnlocked(id),
    foundNow: (id) => engine.unlockedInRun(id),
    get count() {
      return SECRETS.filter((r) => engine.everUnlocked(r.id)).length;
    },
    get invites() {
      return Object.entries(st.invites).filter(([, until]) => until >= today).map(([id]) => id);
    },
    invited: (id) => (st.invites[id] ?? -1) >= today,
    // a Legendary / Secret person whose secret was found (any run)
    staffKnown: (id) => [...SECRETS, ...LEGEND_SECRETS].some((r) => r.rewardActions.some((a) => a.type === 'staff' && a.id === id) && engine.everUnlocked(r.id)),
    barred: (id) => c.poached?.id === id && !c.poached.beat,
    inviteUntil: (id) => st.invites[id] ?? null,
    guestOpen: (id) => opened('guest', id),
    buildOpen: (id) => opened('facility', id),
    awardOpen: (id) => opened('award', id),
    partnerOpen: (id) => opened('partner', id),
    stageOpen: (secretId) => engine.unlockedInRun(secretId),
    get boosts() {
      return runner.list('boost');
    },
    demand: () => (runner.has('boost', 'organic') ? { base: BOOSTS.organic.demand, words: 'Secret: No Ads Needed' } : null),
    extraSat,
    eventBonus,
    breakdownGuard,
    get prestigeTokens() {
      return account?.prestigeTokens ?? 0;
    },
    get cosmetics() {
      return [...(account?.cosmetics ?? [])];
    },
    get trueEnding() {
      return account?.trueEnding ?? null;
    },
    // Tests / ?debug=1: find one now (its rewards too), whatever its conditions.
    debugForce(id) {
      const r = secretById(id);
      if (!r) return null;
      const got = engine.unlock(r);
      saveAccount();
      if (got) bus?.emit('secrets:found', { id, name: r.name, words: rewardWords(r), eased: got.eased });
      return got;
    },
    debugFacts,
    facts: factView,
    get counters() {
      return clone(c);
    },
    engine,
    runner,
    rewardWords: (id) => rewardWords(secretById(id)),
    serialize: () => ({ c: clone(c), engine: engine.serializeRun(), runner: runner.serialize(), invites: { ...st.invites } }),
  };
  return sec;
}
