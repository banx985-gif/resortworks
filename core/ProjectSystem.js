// Generic "job with phases" (a robot project, a café menu launch, a ship refit…).
// Each day, the job's assigned workers add progress to the current phase:
//   teamScore = Σ over workers of (Σ stat × phase weight) × workMultiplier × workerModifier
//   progress  = (progressBase + teamScore / progressDivisor) × progressScale
// When the phase target is reached the next phase starts; after the last one the job is finished
// and stored in the history. Phase names, weights and targets all come from game data.
// Game rules plug in through hooks (all optional):
//   workerModifier(job, phase, staff) → number        extra multiplier on one worker's score
//   statModifier(job, phase, staff, statKey) → number  extra multiplier on one stat's share of that score
//   progressModifier(job, phase) → number              extra multiplier on the day's progress (e.g. a station bonus)
//   onDay(job, phase, { score })                      after each worked day (e.g. roll faults)
//   onCheckpoint(job, phase, fraction)                once when a phase passes a checkpoint (e.g. 0.6)
//   onPhaseComplete(job, phase, summary)              phase finished (summary has avgScore, days, per-worker)
//   onPhaseStart(job, phase)                          next phase begins
//   onComplete(job) → result                          job finished; result goes into the history record
//   now() → any                                       timestamp stored on history records
// Emits: 'project:start', 'project:phase', 'project:complete'.
export class ProjectSystem {
  constructor({ bus = null, staff, assignments = null, history = null, phases, rules = {}, hooks = {} }) {
    this.bus = bus;
    this.staff = staff; // StaffSystem
    this.assignments = assignments; // AssignmentSystem (optional; used to free the team at the end)
    this.history = history; // JobHistory (optional)
    this.phases = phases; // [{ id, name, weights: { statKey: fraction } }, ...]
    this.rules = { progressBase: 8, progressDivisor: 75, progressScale: 1, checkpoints: [0.6], ...rules };
    this.hooks = hooks;
    this.jobs = []; // active jobs
    this.nextId = 1;
  }

  // --- lifecycle -----------------------------------------------------------
  // phaseTarget: work needed per phase. slots: how many team slots the job has.
  createJob({ type, name, phaseTarget, slots = 5, data = {} }) {
    return {
      id: `J${this.nextId++}`,
      type,
      name,
      status: 'active',
      phaseIndex: 0,
      phaseProgress: 0,
      phaseTarget,
      slots: new Array(slots).fill(null), // staff ids, filled by AssignmentSystem
      day: 0, // worked days in total
      phaseDay: 0, // worked days in this phase
      phaseScoreSum: 0,
      workerScore: {}, // staffId → { sum, days } for this phase
      checkpointsHit: [],
      phaseSummaries: [],
      data, // game-specific state (parts, faults, stats…)
    };
  }

  start(job) {
    this.jobs.push(job);
    this.hooks.onPhaseStart?.(job, this.phases[0]);
    this.bus?.emit('project:start', { job });
    return job;
  }

  get(id) {
    return this.jobs.find((j) => j.id === id) || null;
  }

  phaseOf(job) {
    return this.phases[job.phaseIndex];
  }

  teamOf(job) {
    return job.slots.filter(Boolean).map((id) => this.staff.get(id)).filter(Boolean);
  }

  // --- work ---------------------------------------------------------------
  workerScore(job, phase, s) {
    let base = 0;
    const sm = this.hooks.statModifier;
    for (const [k, w] of Object.entries(phase.weights)) base += (s.stats[k] ?? 0) * w * (sm ? sm(job, phase, s, k) : 1);
    const mod = this.hooks.workerModifier?.(job, phase, s) ?? 1;
    return base * this.staff.workMultiplier(s) * mod;
  }

  teamScore(job, phase = this.phaseOf(job)) {
    let total = 0;
    for (const s of this.teamOf(job)) total += this.workerScore(job, phase, s);
    return total;
  }

  progressPerDay(job) {
    const team = this.teamOf(job);
    if (!team.length) return 0;
    return this._progress(this.teamScore(job), job);
  }

  _progress(score, job = null) {
    const r = this.rules;
    const mod = job ? (this.hooks.progressModifier?.(job, this.phaseOf(job)) ?? 1) : 1;
    return (r.progressBase + score / r.progressDivisor) * r.progressScale * mod;
  }

  // One game day for every active job.
  dailyTick() {
    for (const job of [...this.jobs]) this._workDay(job);
  }

  _workDay(job) {
    const phase = this.phaseOf(job);
    const team = this.teamOf(job);
    if (!team.length) return; // nobody assigned: work stops, nothing else happens

    let score = 0;
    for (const s of team) {
      const ws = this.workerScore(job, phase, s);
      score += ws;
      const rec = (job.workerScore[s.id] ||= { sum: 0, days: 0 });
      rec.sum += ws;
      rec.days++;
    }
    job.phaseProgress += this._progress(score, job);
    job.day++;
    job.phaseDay++;
    job.phaseScoreSum += score;
    this.hooks.onDay?.(job, phase, { score });

    const frac = job.phaseProgress / job.phaseTarget;
    for (const c of this.rules.checkpoints) {
      if (frac >= c && !job.checkpointsHit.includes(c)) {
        job.checkpointsHit.push(c);
        this.hooks.onCheckpoint?.(job, phase, c);
      }
    }
    if (job.phaseProgress >= job.phaseTarget) this._completePhase(job);
  }

  // Finish the current phase now (e.g. a game waiting at a decision point that the player ships).
  completePhase(job) {
    if (this.jobs.includes(job)) this._completePhase(job);
  }

  _completePhase(job) {
    const phase = this.phaseOf(job);
    const workers = {};
    for (const [id, r] of Object.entries(job.workerScore)) workers[id] = { avgScore: r.sum / r.days, days: r.days };
    const summary = {
      phaseId: phase.id,
      days: job.phaseDay,
      avgScore: job.phaseDay ? job.phaseScoreSum / job.phaseDay : 0,
      workers,
    };
    job.phaseSummaries.push(summary);
    this.hooks.onPhaseComplete?.(job, phase, summary);
    this.bus?.emit('project:phase', { job, phase, summary });

    if (job.phaseIndex >= this.phases.length - 1) {
      this._finish(job);
      return;
    }
    job.phaseIndex++;
    job.phaseProgress = 0;
    job.phaseDay = 0;
    job.phaseScoreSum = 0;
    job.workerScore = {};
    job.checkpointsHit = [];
    this.hooks.onPhaseStart?.(job, this.phaseOf(job));
  }

  _finish(job) {
    job.status = 'complete';
    job.phaseProgress = job.phaseTarget;
    const team = this.teamOf(job).map((s) => ({ id: s.id, name: s.name, role: s.role, level: s.level }));
    const result = this.hooks.onComplete?.(job) ?? {};
    this.jobs = this.jobs.filter((j) => j !== job);
    this.assignments?.clearJob(job);
    const record = this.history?.add({
      jobId: job.id,
      type: job.type,
      name: job.name,
      finishedAt: this.hooks.now?.() ?? null,
      days: job.day,
      team,
      phases: job.phaseSummaries.map((p) => ({ phaseId: p.phaseId, days: p.days, avgScore: p.avgScore })),
      result,
    });
    this.bus?.emit('project:complete', { job, record });
  }

  // --- save ---------------------------------------------------------------
  serialize() {
    return { nextId: this.nextId, jobs: JSON.parse(JSON.stringify(this.jobs)) };
  }

  load(s) {
    this.nextId = s?.nextId ?? 1;
    this.jobs = JSON.parse(JSON.stringify(s?.jobs ?? []));
  }
}
