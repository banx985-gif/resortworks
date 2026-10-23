// Competitions: an entrant (a robot, a boat, a cake…) plus a pilot/handler, a tuning package and a strategy,
// scored over a few segments against a seeded rival field. Everything is decided up front by the seed + the setup:
// run() is a pure function, so watching the event play out and skipping straight to the result are the same thing.
//
// Content is plain data from the game:
//   events:     [{ id, name, weights: { stat: % }, target, beatYear, entry, rewards: { credits, rep }, field: [[rivalId, offsetPct]], segments: [names],
//                  rotate?: { pool, base, boosts: [%…] } }]   rotate: the weights change every running (rotatingWeights below)
//   tunings:    [{ id, name, cost, stats: { stat: +n }, scorePct, breakdownPct }]
//   strategies: [{ id, name, scorePct, relBonus, breakdownMult, aggressive?, moralePenalty? }]
//   rivalSystem: a core/RivalSystem (rival identities and their fixed strength curves)
//   rules:      entrantScale, entrantOffset, pilotWeights, reliabilityStat, statCap, form, stressPct[], stressedPilotPct, breakdown {…},
//               rivals {…}, prizeShares, entryRep, xp, winMorale, resultsKept   (see the game's data file for meanings)
//
// Segment score (per segment i):
//   weighted = max(0, Σ effectiveStat × weight% − entrantOffset) × entrantScale × (1 + tuning score%)
//   pilot    = Σ pilot stat × pilotWeights
//   base     = (weighted + pilot + prepBonus) × (1 + mods.basePct%)
//   score    = base × (1 + strategy%) × form(seeded) × (1 − stress%)  − breakdown losses
// Breakdown chance per segment:
//   max(minPct, basePct − effectiveREL / relDivisor) + faults × perFaultPct + entrant.extraBreakdownPct,
//   then × strategy × tuning × mods, capped at maxPct. Severity: minor / major (and −% next segment) /
//   catastrophic (DNF) — catastrophic only when effective REL < catastrophicRelBelow or faults ≥ catastrophicFaults.
//
// setup (built by the game):
//   { eventId, tuningId, strategyId, prepBonus, weights? (this running's weights, when they rotate),
//     entrant: { id, name, stats, faults, extraBreakdownPct },
//     pilot:   { id, name, stats, stressed },
//     mods:    { tuningPct, stressPct, aggressiveCeilingPct, breakdownRiskPct, basePct, aggressiveScorePct, noMoralePenalty } }
//   mods are the game's trait effects (e.g. Tuner, Calm Under Pressure, Risk Taker, signature traits).
import { Rng } from './Rng.js';

const round1 = (v) => Math.round(v * 10) / 10;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export class CompetitionSystem {
  constructor({ bus = null, events, tunings, strategies, rivalSystem, rules }) {
    this.bus = bus;
    this.events = events;
    this.tunings = tunings;
    this.strategies = strategies;
    this.rivalSystem = rivalSystem;
    this.rules = rules;
    this.reset();
  }

  reset() {
    this.records = {}; // eventId → per-event record (§21.7)
    this.results = []; // latest results, newest last
    this.nextId = 1;
  }

  event(id) {
    return this.events.find((e) => e.id === id) ?? null;
  }
  tuning(id) {
    return this.tunings.find((t) => t.id === id) ?? null;
  }
  strategy(id) {
    return this.strategies.find((s) => s.id === id) ?? null;
  }
  rival(id) {
    return this.rivalSystem.get(id);
  }

  record(eventId) {
    return (this.records[eventId] ||= { entries: 0, wins: 0, podiums: 0, best: null, bestSegment: null, watched: false, lastPeriod: null });
  }

  get totalEntries() {
    return Object.values(this.records).reduce((t, r) => t + r.entries, 0);
  }
  get totalWins() {
    return Object.values(this.records).reduce((t, r) => t + r.wins, 0);
  }

  result(id) {
    return this.results.find((r) => r.id === id) ?? null;
  }
  get latest() {
    return this.results.at(-1) ?? null;
  }

  // --- the model ---------------------------------------------------------------------
  _mods(setup) {
    return { tuningPct: 0, stressPct: 0, aggressiveCeilingPct: 0, breakdownRiskPct: 0, basePct: 0, aggressiveScorePct: null, noMoralePenalty: false, ...(setup.mods ?? {}) };
  }

  // The fixed numbers of a setup (no dice): effective stats, the segment base score, breakdown chance, stress.
  analyse(setup) {
    const R = this.rules;
    const ev = this.event(setup.eventId);
    const tuning = this.tuning(setup.tuningId) ?? { stats: {}, scorePct: 0, breakdownPct: 0 };
    const strat = this.strategy(setup.strategyId) ?? { scorePct: 0, relBonus: 0, breakdownMult: 1 };
    const mods = this._mods(setup);
    const tuneMult = 1 + mods.tuningPct / 100; // Tuner: more out of every tuning bonus (not its downsides)

    const stats = { ...setup.entrant.stats };
    for (const [k, v] of Object.entries(tuning.stats ?? {})) stats[k] = clamp((stats[k] ?? 0) + v * tuneMult, 0, R.statCap);
    const weights = setup.weights ?? ev.weights;
    let rawWeighted = 0;
    for (const [k, w] of Object.entries(weights)) rawWeighted += ((stats[k] ?? 0) * w) / 100;
    const weighted = Math.max(0, rawWeighted - (R.entrantOffset ?? 0)) * R.entrantScale * (1 + ((tuning.scorePct ?? 0) * tuneMult) / 100);
    let pilot = 0;
    for (const [k, w] of Object.entries(R.pilotWeights)) pilot += (setup.pilot.stats[k] ?? 0) * w;
    const prep = setup.prepBonus ?? 0;
    const base = (weighted + pilot + prep) * (1 + mods.basePct / 100);
    const scorePct = strat.aggressive && mods.aggressiveScorePct != null ? mods.aggressiveScorePct : strat.scorePct;
    const formMax = R.form.max + (strat.aggressive ? mods.aggressiveCeilingPct / 100 : 0);

    // Breakdowns.
    const B = R.breakdown;
    const faults = setup.entrant.faults ?? 0;
    const rel = (stats[R.reliabilityStat] ?? 0) + (strat.relBonus ?? 0);
    let pct = Math.max(B.minPct, B.basePct - rel / B.relDivisor) + faults * B.perFaultPct + (setup.entrant.extraBreakdownPct ?? 0);
    pct *= strat.breakdownMult ?? 1;
    const tb = tuning.breakdownPct ?? 0;
    pct *= 1 + (tb < 0 ? tb * tuneMult : tb) / 100;
    pct *= 1 + mods.breakdownRiskPct / 100;
    pct = Math.min(B.maxPct, pct);
    const catastrophicAllowed = rel < B.catastrophicRelBelow || faults >= B.catastrophicFaults;

    const stress = R.stressPct.map((s) => (s + (setup.pilot.stressed ? R.stressedPilotPct : 0)) * Math.max(0, 1 + mods.stressPct / 100));
    return { ev, weights, tuning, strat, mods, stats, rawWeighted, weighted, pilot, prep, base, scorePct, formMax, breakdownPct: pct, effectiveRel: rel, catastrophicAllowed, stress };
  }

  // Rival base scores for an event (no dice), from their fixed curves — never from the player's setup.
  // ctx: { weights, year, ngPlusRuns }
  rivalBases(ev, ctx = {}) {
    return this.rivalSystem.fieldFor(ev, { weights: ctx.weights ?? ev.weights, year: ctx.year ?? 1, ngPlusRuns: ctx.ngPlusRuns ?? 0 });
  }

  // The "your chances" numbers: expected score with average dice, the rivals' expected scores, the likely place.
  preview(setup, ctx = {}) {
    const a = this.analyse(setup);
    const B = this.rules.breakdown;
    const p = a.breakdownPct / 100;
    const cat = a.catastrophicAllowed ? B.shares.catastrophic : 0;
    const maj = B.shares.major + (a.catastrophicAllowed ? 0 : B.shares.catastrophic);
    const avgLoss = (1 - cat - maj) * B.minorPct + maj * (B.majorPct + B.majorNextPct) + cat * 70;
    const formAvg = (this.rules.form.min + a.formMax) / 2;
    const per = a.stress.map((s) => a.base * (1 + a.scorePct / 100) * formAvg * (1 - s / 100) * (1 - (p * avgLoss) / 100));
    const expected = round1(per.reduce((t, v) => t + v, 0) / per.length);
    const rivals = this.rivalBases(a.ev, { ...ctx, weights: a.weights }).map((r) => ({ ...r, expected: round1(r.base) }));
    const place = 1 + rivals.filter((r) => r.expected > expected).length;
    const anyBreakdownPct = round1((1 - Math.pow(1 - p, per.length)) * 100);
    return { expected, rivals, place, breakdownPct: round1(a.breakdownPct), anyBreakdownPct, catastrophicPossible: a.catastrophicAllowed, analysis: a };
  }

  // Run the event. Pure: same seed + same setup → the same result, every time.
  // ctx: { year, ngPlusRuns } — where the campaign is (the rivals' curves read it).
  run(setup, seed, ctx = {}) {
    const R = this.rules;
    const B = R.breakdown;
    const a = this.analyse(setup);
    const ev = a.ev;
    const rng = new Rng(`${seed}|entrant`);
    const rivalRng = new Rng(`${seed}|rivals`);
    const afterRng = new Rng(`${seed}|after`);
    const n = R.stressPct.length;

    // Player segments. Four draws per segment, always, in the same order (form, breakdown, severity, where).
    const segs = [];
    let carry = 0; // major breakdown: −% on the next segment
    let dnf = false;
    for (let i = 0; i < n; i++) {
      const form = rng.range(R.form.min, a.formMax);
      const roll = rng.next();
      const sev = rng.next();
      const at = rng.range(B.at[0], B.at[1]);
      const name = ev.segments?.[i] ?? `Segment ${i + 1}`;
      if (dnf) {
        segs.push({ index: i, name, form: 1, score: 0, clean: 0, stressPct: 0, carryPct: 0, breakdown: null, dnf: true });
        continue;
      }
      const clean = a.base * (1 + a.scorePct / 100) * form * (1 - a.stress[i] / 100);
      let score = clean * (1 - carry / 100);
      const carryPct = carry;
      carry = 0;
      let breakdown = null;
      if (roll < a.breakdownPct / 100) {
        let severity = 'minor';
        if (sev < B.shares.catastrophic) severity = a.catastrophicAllowed ? 'catastrophic' : 'major';
        else if (sev < B.shares.catastrophic + B.shares.major) severity = 'major';
        if (severity === 'minor') score *= 1 - B.minorPct / 100;
        if (severity === 'major') {
          score *= 1 - B.majorPct / 100;
          carry = B.majorNextPct;
        }
        if (severity === 'catastrophic') {
          score *= at; // it got this far before stopping
          dnf = true;
        }
        breakdown = { severity, at: round1(at * 100) / 100, lossPct: severity === 'minor' ? B.minorPct : severity === 'major' ? B.majorPct : Math.round((1 - at) * 100) };
      }
      segs.push({ index: i, name, form: Math.round(form * 1000) / 1000, clean: round1(clean), score: round1(score), stressPct: round1(a.stress[i]), carryPct, breakdown, boost: form >= R.form.max - 0.006, dnf: false });
    }
    const total = round1(segs.reduce((t, s) => t + s.score, 0));
    const player = { total, final: round1(total / n), dnf, breakdowns: segs.filter((s) => s.breakdown).length };

    // Rivals: seeded variance per entry, then a form roll per segment.
    const rivals = this.rivalBases(ev, { ...ctx, weights: a.weights }).map((r) => {
      const v = rivalRng.range(-R.rivals.variancePct, R.rivals.variancePct);
      const base = r.base * (1 + v / 100);
      const scores = Array.from({ length: n }, () => round1(base * rivalRng.range(R.form.min, R.form.max)));
      const t = round1(scores.reduce((x, y) => x + y, 0));
      return { id: r.id, name: r.name, segments: scores, total: t, final: round1(t / n) };
    });

    // Standings: highest total first; a DNF is last; exact ties go to the rival.
    const rows = [{ id: 'player', total, dnf }, ...rivals.map((r) => ({ id: r.id, total: r.total, dnf: false }))];
    rows.sort((x, y) => (x.dnf !== y.dnf ? (x.dnf ? 1 : -1) : y.total - x.total || (x.id === 'player' ? 1 : y.id === 'player' ? -1 : 0)));
    const place = rows.findIndex((r) => r.id === 'player') + 1;
    const won = place === 1 && !dnf;

    // Prizes, XP, Morale.
    const share = !dnf ? R.prizeShares[place - 1] : null;
    const rewards = {
      credits: share ? Math.round(ev.rewards.credits * share.credits) : 0,
      rep: share ? Math.round(ev.rewards.rep * share.rep) : R.entryRep,
      rp: ev.rp ?? 0,
      xp: Math.round(ev.target * R.xp.perTarget + (R.xp.place[place - 1] ?? R.xp.other)),
      morale: 0,
    };
    const winMorale = afterRng.int(R.winMorale.min, R.winMorale.max);
    if (won) rewards.morale += winMorale;
    if (a.strat.moralePenalty && !a.mods.noMoralePenalty) rewards.morale += a.strat.moralePenalty;

    const best = segs.reduce((b, s) => (!b || s.score > b.score ? s : b), null);
    return {
      eventId: ev.id,
      eventName: ev.name,
      weights: { ...a.weights },
      year: ctx.year ?? 1,
      seed,
      setup: {
        entrantId: setup.entrant.id,
        entrantName: setup.entrant.name,
        pilotId: setup.pilot.id,
        pilotName: setup.pilot.name,
        tuningId: setup.tuningId,
        strategyId: setup.strategyId,
      },
      numbers: { rawWeighted: round1(a.rawWeighted), weighted: round1(a.weighted), pilot: round1(a.pilot), prep: round1(a.prep), base: round1(a.base), breakdownPct: round1(a.breakdownPct), effectiveRel: Math.round(a.effectiveRel) },
      segments: segs,
      player,
      rivals,
      standings: rows.map((r, i) => ({ id: r.id, place: i + 1, total: r.total, final: round1(r.total / n), dnf: r.dnf })),
      place,
      won,
      rewards,
      bestSegment: best ? { index: best.index, name: best.name, score: best.score } : null,
    };
  }

  // Keep a finished result: records (§21.7) and the results list. extra: { day, period, costs } from the game.
  commit(result, extra = {}) {
    const r = { id: this.nextId++, ...result, ...extra };
    const rec = this.record(r.eventId);
    rec.entries++;
    if (r.won) rec.wins++;
    if (r.place <= 3 && !r.player.dnf) rec.podiums++;
    rec.lastPeriod = extra.period ?? rec.lastPeriod;
    if (!r.player.dnf && (!rec.best || r.player.final > rec.best.score)) {
      rec.best = { score: r.player.final, entrant: r.setup.entrantName, entrantId: r.setup.entrantId, pilot: r.setup.pilotName, pilotId: r.setup.pilotId, strategy: r.setup.strategyId, tuning: r.setup.tuningId, breakdowns: r.player.breakdowns, place: r.place, resultId: r.id, day: extra.day ?? null };
    }
    if (r.bestSegment && (!rec.bestSegment || r.bestSegment.score > rec.bestSegment.score)) rec.bestSegment = { ...r.bestSegment, resultId: r.id };
    this.results.push(r);
    const keep = this.rules.resultsKept ?? 30;
    if (this.results.length > keep) this.results.splice(0, this.results.length - keep);
    this.bus?.emit('competition:result', { result: r, record: rec });
    return r;
  }

  // The player has watched this event all the way through once: Skip is offered from now on.
  markWatched(eventId) {
    const rec = this.record(eventId);
    if (rec.watched) return;
    rec.watched = true;
    this.bus?.emit('competition:watched', { eventId });
  }

  serialize() {
    return JSON.parse(JSON.stringify({ records: this.records, results: this.results, nextId: this.nextId }));
  }

  // Returns false when there is nothing to load (a save from before competitions).
  load(data) {
    this.reset();
    if (!data) return false;
    this.records = JSON.parse(JSON.stringify(data.records ?? {}));
    this.results = JSON.parse(JSON.stringify(data.results ?? []));
    this.nextId = data.nextId ?? this.results.length + 1;
    return true;
  }
}

// Where each entrant is at time t of a played-back result (0 … segments count; segment i runs from i to i+1).
// Pure: the watch view only reads this, so it can never change the result. Returns
//   { segment, rows: [{ id, done (score so far), place, stopped, breakdown? }] }, rows sorted by place.
// Weights for one running of a rotating event: base weight on every stat in the pool, plus the boosts on stats picked
// by the running's seed (e.g. C08: two boosted stats a month). Pure: same event + seed → same weights.
export function rotatingWeights(ev, seed) {
  const r = ev.rotate;
  if (!r) return { ...ev.weights };
  const rng = new Rng(`${seed}|weights`);
  const picked = rng.shuffle(r.pool).slice(0, r.boosts.length);
  const out = Object.fromEntries(r.pool.map((k) => [k, r.base]));
  picked.forEach((k, i) => (out[k] += r.boosts[i]));
  return out;
}

const REPAIR = 0.12; // share of a segment the entrant stands still for a repair (watch view only)

export function playback(result, t) {
  const n = result.segments.length;
  const seg = clamp(Math.floor(t), 0, n - 1);
  const f = t >= n ? 1 : clamp(t - seg, 0, 1);
  const rows = [];
  // Player: piecewise, so a breakdown visibly stops it where it happens, and each segment ends exactly on its score.
  {
    let done = 0;
    for (let i = 0; i < seg; i++) done += result.segments[i].score;
    const s = result.segments[seg];
    const pace = s.clean * (1 - s.carryPct / 100); // what this segment would score with no breakdown
    let inSeg = 0;
    let breakdown = null;
    if (t >= n) inSeg = s.score;
    else if (s.dnf) inSeg = 0;
    else if (!s.breakdown) inSeg = s.score * f;
    else {
      const at = s.breakdown.at;
      const before = Math.min(s.score, pace * at); // full pace up to the fault
      if (f < at) inSeg = Math.min(before, pace * f);
      else if (s.breakdown.severity === 'catastrophic') inSeg = s.score; // stopped for good
      else if (f < at + REPAIR) inSeg = before; // a short stop for the repair
      else inSeg = before + ((s.score - before) * (f - at - REPAIR)) / (1 - at - REPAIR);
      if (f >= at && (f < at + REPAIR + 0.2 || s.breakdown.severity === 'catastrophic')) breakdown = s.breakdown;
    }
    const cat = result.segments.findIndex((x) => x.breakdown?.severity === 'catastrophic');
    const stopped = cat >= 0 && (t >= n || seg > cat || (seg === cat && f >= result.segments[cat].breakdown.at));
    rows.push({ id: 'player', done: done + inSeg, stopped, breakdown });
  }
  for (const r of result.rivals) {
    let done = 0;
    for (let i = 0; i < seg; i++) done += r.segments[i];
    done += t >= n ? r.segments[seg] : r.segments[seg] * f;
    rows.push({ id: r.id, done, stopped: false, breakdown: null });
  }
  // At the very end the order is exactly the result's standings.
  if (t >= n) {
    const order = Object.fromEntries(result.standings.map((s) => [s.id, s.place]));
    rows.sort((a, b) => order[a.id] - order[b.id]);
  } else rows.sort((a, b) => (a.stopped !== b.stopped ? (a.stopped ? 1 : -1) : b.done - a.done));
  rows.forEach((r, i) => (r.place = i + 1));
  return { segment: seg, fraction: f, rows };
}
