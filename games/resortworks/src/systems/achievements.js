// Visible achievements (Milestone 26, bible §28) on core/AchievementSystem: 40 goals as data (data/achievements.js),
// checked on 'tick' — each Night and Midday band edge and the moments that matter (a check-in, a review, an event's
// result, an award, a new stage, a hire, research done, a Signature, a package sold, a partner's goal met). Unlocks are
// account-wide (the account store: they survive a slot being replaced); each pays REP +20 in the run that unlocks it
// (the big ten a Staff Item too) exactly once. The facts are read from the resort's systems; the counters some need
// (full nights in a row, clean months, weddings held …) are kept per run in the campaign save.
//   createAchievements({ account, saved, bus, run }) → ach
//     ach.tick() · ach.onEdge(day, band) · ach.list (each with unlocked / progress) · ach.count · ach.fact(name) ·
//     ach.unlock(id) (tests / ?debug=1) · ach.counters · serialize() (the run's counters) · account (the unlocks)
//   On the bus: core 'achievement:unlocked' { def, when, paidNow } · 'achievements:change'
import { AchievementSystem } from '../../../../core/AchievementSystem.js';
import { FactRegistry } from '../../../../core/SecretEngine.js';
import { ACHIEVEMENTS } from '../../data/achievements.js';
import { GUEST_TYPES } from '../../data/bookings.js';
import { ROOMS, FACILITIES } from '../../data/lot.js';
import { BANDS } from '../../data/calendar.js';
import { stageIndex } from '../../data/build.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
const BAND = Object.fromEntries(BANDS.map((b, i) => [b.id, i]));
const tagged = (typeId, tag) => !!GUEST_TYPES[typeId]?.tags?.includes(tag);
export const freshAchvRun = () => ({ fullNights: 0, fullStreak: 0, fullStreakBest: 0, cleanMonths: 0, month: { stays: 0, cleanOk: true }, perfectRecoveries: 0, weddings: 0, conferences: 0, spaStays: 0, vipStays: 0, celebrity90: 0, quietLuxury: 0, budgetHero: 0, bestStars: 0, bestMonthService: 0, lastBreakdown: 0, partnersMet: [] });

export function createAchievements({ account = {}, saved = null, bus = null, run = {} } = {}) {
  const c = { ...freshAchvRun(), ...(saved ?? {}), month: { ...freshAchvRun().month, ...(saved?.month ?? {}) } };
  let today = 0;
  const facts = new FactRegistry();
  const R = run;
  facts
    .define('checkIns', () => R.bookings?.stats?.checkIns ?? 0)
    .define('fullNights', () => c.fullNights)
    .define('fullStreakBest', () => c.fullStreakBest)
    .define('bestStars', () => Math.max(c.bestStars, R.reviews?.stars ?? 0))
    .define('cleanMonths', () => c.cleanMonths)
    .define('perfectRecoveries', () => c.perfectRecoveries)
    .define('returns', () => R.guestbook?.stats?.returns ?? 0)
    .define('awardsWon', () => (R.awards?.wins ?? []).map((w) => w.id))
    .define('awardCount', () => R.awards?.wins?.length ?? 0)
    .define('weddings', () => c.weddings)
    .define('conferences', () => c.conferences)
    .defineGroup('theme', (id) => R.themes?.progress?.[id] ?? 0)
    .define('spaStays', () => c.spaStays)
    .define('stageIndex', () => stageIndex(R.progress?.stage ?? 'roadside'))
    .define('vipStays', () => c.vipStays)
    .define('celebrity90', () => c.celebrity90)
    .define('legendaryHired', () => (R.team ?? []).filter((m) => m.tier === 'legendary').length)
    .define('secretHired', () => (R.team ?? []).filter((m) => m.tier === 'secret').length)
    .define('signature', () => !!R.themes?.signature)
    .define('packageKinds', () => Object.values(R.packages?.stats?.sold ?? {}).filter((n) => n > 0).length)
    .define('roomKinds', () => new Set(ROOMS.map((r) => r.typeId)).size)
    .define('facilityKinds', () => FACILITIES.filter((f) => Number(f.id.slice(1)) <= 33).length)
    .define('researchDone', () => R.research?.doneList?.length ?? 0)
    .define('research', () => R.research?.doneList ?? [])
    .define('bestEvent', () => R.events?.stats?.best ?? 0)
    .define('daysNoBreakdown', () => Math.max(0, today - c.lastBreakdown))
    .define('quietLuxury', () => c.quietLuxury)
    .define('budgetHero', () => c.budgetHero)
    .define('guestbook', () => R.guestbook?.guests?.length ?? 0)
    .define('bestLevel', () => Math.max(0, ...(R.team ?? []).map((m) => m.level ?? 1)))
    .define('prestige', () => R.awards?.prestige ?? 0)
    .define('cash', () => R.finance?.cash ?? 0)
    .define('bestMonthService', () => c.bestMonthService)
    .define('partnersMet', () => c.partnersMet)
    .define('godsHired', () => R.secrets?.godsHired?.() ?? 0) // (Milestone 28b)
    .define('aaronHired', () => ((R.team ?? []).some((m) => m.id === 'S51') ? 1 : 0)); // (Milestone 27b)
  // Rewards: REP +20 in this run (and a Staff Item for the big ten), paid once ever (core marks it paid first).
  const pay = (r, def) => {
    if (r.currency === 'rep') R.reviews?.addRepFor?.(r.amount, `Achievement: ${def.name}`);
    if (r.currency === 'item') R.items?.grant?.('achievement');
  };
  const sys = new AchievementSystem({ bus, defs: ACHIEVEMENTS, facts, pay, now: () => ({ day: today, year: Math.floor(today / 336) + 1, runId: R.seed ?? null }) });
  sys.load(account?.achievements ?? null);
  const save = () => {
    if (account) account.achievements = sys.serialize();
  };
  const tick = () => {
    const got = sys.notify('tick');
    if (got.length) {
      save();
      bus?.emit('achievements:change', { got: got.map((x) => x.def.id) });
    }
    return got;
  };

  // --- what the counters hear ----------------------------------------------------------------------------------------
  function onReview(v) {
    c.month.stays++;
    if ((v.cats?.clean ?? 0) < 80) c.month.cleanOk = false;
    if (v.recovered && v.stars >= 5) c.perfectRecoveries++;
    if (tagged(v.type, 'wellness') && v.sat >= 85) c.spaStays++;
    if (tagged(v.type, 'vip')) c.vipStays++;
    if (v.type === 'GT18' && v.sat >= 90) c.celebrity90++;
    if (tagged(v.type, 'luxury') && v.sat >= 90 && !(v.noise > 0)) c.quietLuxury++;
  }
  function onEvent(evt) {
    if (!['success', 'great'].includes(evt.result)) return;
    if (['EV03', 'EV11'].includes(evt.ev)) c.weddings++;
    if (['EV04', 'EV09', 'EV12'].includes(evt.ev)) c.conferences++;
  }
  function onEdge(day, band) {
    today = day;
    if (band === BAND.night) {
      const staying = R.bookings?.staying?.length ?? 0;
      const open = ROOMS.filter((r) => !R.site?.isClosed?.(r.id)).length;
      if (open && staying >= open) {
        c.fullNights++;
        c.fullStreak++;
        c.fullStreakBest = Math.max(c.fullStreakBest, c.fullStreak);
      } else c.fullStreak = 0;
      if (day > 0 && day % 28 === 0) {
        if (c.month.stays >= 20 && c.month.cleanOk) c.cleanMonths++;
        c.month = { stays: 0, cleanOk: true };
        const stars = R.reviews?.stars ?? 0;
        c.bestStars = Math.max(c.bestStars, stars);
        c.bestMonthService = Math.max(c.bestMonthService, R.reviews?.lastMonth?.scores?.service ?? 0);
        if (stars >= 4 && R.finance && [...new Set(ROOMS.map((r) => r.typeId))].every((rt) => R.finance.bandOf(rt) === 'value')) c.budgetHero++;
      }
    }
    if (band === BAND.night || band === BAND.midday) tick();
  }
  for (const [ev, fn] of [
    ['review:new', ({ review }) => onReview(review)],
    ['events:result', ({ event }) => onEvent(event)],
    ['mt:breakdown', () => (c.lastBreakdown = today)],
    ['partners:met', ({ id }) => !c.partnersMet.includes(id) && c.partnersMet.push(id)],
  ])
    bus?.on(ev, fn);
  for (const ev of ['booking:checkin', 'review:new', 'events:result', 'awards:result', 'progress:stage', 'staff:hired', 'research:done', 'themes:signature', 'packages:sold', 'partners:met']) bus?.on(ev, () => tick());

  return {
    tick,
    onEdge,
    fact: (name) => facts.get(name),
    unlock(id) {
      const r = sys.unlock(id);
      if (r) save();
      return r;
    },
    isUnlocked: (id) => sys.isUnlocked(id),
    get list() {
      return ACHIEVEMENTS.map((d) => ({ def: d, unlocked: sys.account.unlocked[d.id] ?? null, progress: sys.progress(d) }));
    },
    get count() {
      return sys.count;
    },
    get counters() {
      return clone(c);
    },
    markSeen() {
      sys.markAllSeen();
      save();
    },
    get unseen() {
      return sys.unseen;
    },
    system: sys,
    serialize: () => clone(c),
    // (Milestone 28b) a system made after this one (the secrets: the gods hired)
    attach(name, x) {
      R[name] = x;
    },
  };
}
