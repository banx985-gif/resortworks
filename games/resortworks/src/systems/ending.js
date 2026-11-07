// The Year-20 ending and New Game+ (Milestone 28, bible §30 / §31). The ending comes once, on the first day after Year
// 20: the run is graded C / B / A / S / S+ (core/GradeEngine over data/ngplus.js), the account remembers it (the highest
// NG+, the ending, the Guestbook's summary) and play simply goes on (postgame). From the Ending sheet the player can
// start New Game+ (one level up, at most 3) into ANOTHER slot — the parent slot is never written by it: the new run is
// made from a copy of the parent's save (core/NgPlusSystem's transition: only the declared carry fields go on).
//   createEnding({ saved, bus, run, account, ngPlus }) → en
//     en.onEdge(day, band) · en.reached · en.result ({ day, grade, total, categories, trueEnding }) · en.finish(day)
//     (tests / ?debug=1) · en.facts() · en.setup (the NG+ choices being made: legacy, theme, slot) · serialize()
//   gradeFacts(run) · gradeOf(facts, bonus) — the grade from the nine categories
//   newGamePlus(parent, { legacy, theme }, now) → the new run's save (module level; the slot writing is the app's)
//   On the bus: 'ending:reached' { result } · 'ending:change'
import { gradeRun } from '../../../../core/GradeEngine.js';
import { NgPlusSystem } from '../../../../core/NgPlusSystem.js';
import { END, GRADE_CATEGORIES, GRADE_BANDS, ENDING_BONUS, NG_RULES } from '../../data/ngplus.js';
import { BANDS } from '../../data/calendar.js';
import { VISIBLE_AWARDS } from '../../data/awards.js';
import { newCampaign } from './resort.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
const NIGHT = BANDS.findIndex((b) => b.id === 'night');
export const NG = new NgPlusSystem({ rules: NG_RULES });
export const freshEnding = () => null;

// The finished run's facts for the grade (plain numbers).
export function gradeFacts(run) {
  const day = run.bookings?.at?.day ?? 0;
  const h = run.reviews?.headline?.(day) ?? {};
  const team = run.team ?? [];
  const years = run.finance?.years ?? [];
  const wins = run.awards?.wins ?? [];
  return {
    satisfaction: h.satisfaction ?? 0,
    service: h.service ?? 0,
    appeal: h.appeal ?? 0,
    wellbeing: h.wellbeing ?? 0,
    avgLevel: team.length ? team.reduce((t, m) => t + (m.level ?? 1), 0) / team.length : 1,
    profitYears: years.length ? years.filter((y) => (y.profit ?? 0) > 0).length / years.length : 0,
    cash: Math.max(0, (run.finance?.cash ?? 0) - (run.finance?.debt ?? 0)),
    visibleAwards: new Set(wins.map((w) => w.id).filter((id) => VISIBLE_AWARDS.some((a) => a.id === id))).size,
    awardWins: wins.length,
    prestige: run.awards?.prestige ?? 0,
    guests: run.guestbook?.guests?.length ?? 0,
    regulars: run.guestbook?.regulars?.length ?? 0,
    secrets: run.secrets ? run.secrets.archive().filter((r) => r.foundNow && !r.extra).length : 0,
    achievements: run.achievements?.count ?? 0,
  };
}
export function gradeOf(facts, bonus = 0) {
  const g = gradeRun({ categories: GRADE_CATEGORIES, bands: GRADE_BANDS, facts });
  const total = Math.min(g.max, g.total + bonus);
  const band = [...GRADE_BANDS].reverse().find((b) => total >= b.min)?.id ?? 'C';
  return { total, max: g.max, grade: band, bonus, categories: g.categories.map((c) => ({ id: c.id, name: c.name, score: c.score, max: c.max })) };
}

export function createEnding({ saved = null, bus = null, run = {}, account = {}, ngPlus = () => 0 } = {}) {
  let s = saved ? clone(saved) : null;
  const setup = { legacy: [], theme: null, slot: null, confirm: null };
  function finish(day) {
    if (s) return s;
    const bonus = account?.cosmetics?.includes('endingBonus') ? ENDING_BONUS : 0; // SEC44
    const g = gradeOf(gradeFacts(run), bonus);
    const ng = ngPlus() ?? 0;
    s = { day, year: END.year, ...g, ng, trueEnding: ng >= 3 && !!account?.trueEnding };
    if (account) {
      account.highestNg = Math.max(account.highestNg ?? 0, ng);
      (account.endings ??= []).push({ resort: run.resortName ?? null, grade: s.grade, total: s.total, ng, at: Date.now() });
      if (account.endings.length > 20) account.endings.shift();
      (account.guestbookSummaries ??= []).push({ resort: run.resortName ?? null, ng, guests: run.guestbook?.guests?.length ?? 0, regulars: run.guestbook?.regulars?.length ?? 0, returns: run.guestbook?.stats?.returns ?? 0 });
      if (account.guestbookSummaries.length > 20) account.guestbookSummaries.shift();
    }
    bus?.emit('ending:reached', { result: clone(s) });
    bus?.emit('ending:change', {});
    return s;
  }
  return {
    onEdge(day, band) {
      if (!s && band === NIGHT && day >= END.day) finish(day);
    },
    finish,
    get reached() {
      return !!s;
    },
    get result() {
      return s ? clone(s) : null;
    },
    facts: () => gradeFacts(run),
    setup,
    serialize: () => (s ? clone(s) : null),
  };
}

// --- New Game+ -------------------------------------------------------------------------------------------------------
// The parent's save → the new run's save (a fresh resort with the parent's identity, NG+ one level up, the Legacy Staff
// member and — from NG+2 — the Signature legacy perk). The parent's save is only read, never changed.
//   choices: { legacy: [memberId] (at most NG.picks('legacy', level)), theme: themeId | null }
export function ngOptions(parent) {
  const level = NG.levelAfter(parent.ngPlus ?? 0);
  const staff = (parent.staff ?? []).filter((m) => !m.founder);
  const sig = parent.themes?.signature?.id ?? null;
  return { level, legacy: staff.map((m) => ({ id: m.id, name: m.name, tier: m.tier, level: m.level })), picks: NG.picks('legacy', level), theme: level >= 2 && sig ? sig : null };
}
export function ngWhy(parent, choices = {}) {
  if (!parent?.ending) return 'Reach the Year-20 ending first.';
  const o = ngOptions(parent);
  const probs = NG.checkChoices({ legacyStaff: choices.legacy ?? [] }, { legacy: o.legacy }, o.level);
  if (probs.length) return probs[0];
  if (choices.theme && choices.theme !== o.theme) return 'That Signature can’t be carried.';
  return null;
}
export function newGamePlus(parent, choices = {}, now = Date.now()) {
  const why = ngWhy(parent, choices);
  if (why) throw new Error(why);
  const p = clone(parent); // (a copy: the parent's save is never changed)
  const o = ngOptions(p);
  const snapshot = {
    identity: { resort: p.resort.name, manager: p.resort.manager, palette: p.resort.palette, founder: p.resort.founder.id },
    legacyStaff: (p.staff ?? []).filter((m) => !m.founder),
    signatureLegacy: o.theme ? { [o.theme]: { id: o.theme } } : {},
    layout: null, bookings: null, team: null, research: null, finance: null, partners: null, rivals: null, events: null, weather: null, memories: null, runSecrets: null, items: null,
  };
  const carry = NG.transition({ snapshot, choices: { legacyStaff: choices.legacy ?? [], signatureLegacy: choices.theme ?? null }, level: o.level });
  const id = carry.always.identity;
  const child = newCampaign({ resort: id.resort, manager: id.manager, palette: id.palette, founder: id.founder }, now);
  child.ngPlus = carry.level;
  for (const m of carry.chosen.legacyStaff ?? []) {
    const { pattern, ...rest } = m;
    const at = child.staff.findIndex((x) => x.id === m.id); // (one of the Start staff: the Legacy one takes their place)
    if (at >= 0) child.staff[at] = { ...rest, legacy: true, founder: false, pattern };
    else child.staff.push({ ...rest, legacy: true, founder: false, pattern });
  }
  child.legacy = { staff: (carry.chosen.legacyStaff ?? []).map((m) => m.id), theme: carry.chosen.signatureLegacy?.id ?? null };
  child.parent = { resort: p.resort.name, ngPlus: p.ngPlus ?? 0, grade: p.ending?.grade ?? null, seed: p.seed };
  return child;
}
