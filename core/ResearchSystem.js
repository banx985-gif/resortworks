// Research tree (robot parts, café recipes, ship hulls…): nodes from data, a research currency, queues with
// one worker each, daily progress, and each node's unlock actions fired exactly once when it completes.
//
// node (plain data): { id, name, cost, requires: ['nodeId', …], condition: <game rule> | null, actions: [{ type, id }, …] }
//   cost      research currency paid when the node is started; the same number is the work needed to finish it
//             (unless the game's workOf hook says otherwise, e.g. a work time in days — GOALWORKS Milestone 13)
//   requires  nodes that must be done first (the tree must have no loops — DataValidator.noCycles checks it)
//   condition anything else the game wants first (a rank, a facility…), checked by conditionMet(rule)
//   hidden    a secret topic: never counted in doneCount or the milestones (the visible tree stays the tree)
// milestones: [{ count, actions }]   fired once when that many nodes are done in total
// queues:     [{ id, name, rule }]   queue n is open while the rules of queues 1…n are all met (conditionMet)
//
// Daily progress for a queue with a node and a worker:
//   perDay = (basePerDay + workerStat / statDivisor + bonusPerDay()) × (1 + speedPct() / 100)
// Game hooks (all optional except workerStat):
//   conditionMet(rule) → bool,  workerStat(staff, node) → number,  bonusPerDay(node) → number,  speedPct(node) → number
//   (bonusPerDay / speedPct get the node being researched, e.g. a lab that speeds up one branch; they may ignore it)
//   costPct() → % change on node costs (e.g. New Game+),  busyElsewhere(staffId) → reason | null (e.g. on a project)
//   workOf(node) → the work needed to finish it, in the same units as perDay (default: its cost)
//   onComplete(node, { staffId }) after the actions have fired
//   extraCostBlock(node) → reason | null, payExtraCost(node): a second price paid on the first start (e.g. prestige)
// A worker can be on one queue only, and never while busyElsewhere says they are busy.
// Emits 'research:rp', 'research:start', 'research:assign', 'research:stop', 'research:complete', 'research:milestone'.
export class ResearchSystem {
  constructor({ bus = null, nodes, milestones = [], queues = [], runner, staff, rules = {}, hooks = {} }) {
    this.bus = bus;
    this.nodes = nodes; // [node]
    this.byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
    this.milestones = milestones;
    this.queueDefs = queues;
    this.runner = runner; // UnlockRunner
    this.staff = staff; // StaffSystem (get by id)
    this.rules = { basePerDay: 5, statDivisor: 35, ...rules };
    this.hooks = hooks;
    this.reset();
  }

  reset() {
    this.rp = 0;
    this.rpEarned = 0;
    this.done = []; // node ids in the order they finished
    this.paid = {}; // nodeId → cost paid (a stopped node can be restarted without paying again)
    this.progress = {}; // nodeId → work done so far
    this.queues = this.queueDefs.map(() => ({ nodeId: null, staffId: null }));
    this.firsts = {}; // kind → [ids]: "first time" rewards already given
    this.milestonesHit = []; // counts reached
    this.recent = []; // last few RP gains, newest first: { amount, reason, day }
  }

  // --- currency ------------------------------------------------------------------------
  addRp(amount, reason = '', day = null) {
    amount = Math.round(amount);
    if (!amount) return 0;
    const first = this.rpEarned === 0 && amount > 0;
    this.rp += amount;
    if (amount > 0) this.rpEarned += amount;
    this.recent.unshift({ amount, reason, day });
    if (this.recent.length > 12) this.recent.pop();
    this.bus?.emit('research:rp', { amount, reason, total: this.rp, first });
    return amount;
  }

  // True the first time it is asked for (kind, id), false after — for "first time you…" rewards.
  firstTime(kind, id) {
    const list = (this.firsts[kind] ||= []);
    if (list.includes(id)) return false;
    list.push(id);
    return true;
  }

  // --- tree ----------------------------------------------------------------------------
  node(id) {
    return this.byId[id] ?? null;
  }

  isDone(id) {
    return this.done.includes(id);
  }

  // Visible topics done (secret ones don't count).
  get doneCount() {
    return this.done.filter((id) => !this.byId[id]?.hidden).length;
  }

  costOf(nodeOrId) {
    const n = typeof nodeOrId === 'string' ? this.byId[nodeOrId] : nodeOrId;
    return Math.max(1, Math.round(n.cost * (1 + (this.hooks.costPct?.() ?? 0) / 100)));
  }

  // Work needed to finish a node (its cost, unless the game's workOf hook gives a separate work amount).
  workOf(nodeOrId) {
    const n = typeof nodeOrId === 'string' ? this.byId[nodeOrId] : nodeOrId;
    return this.hooks.workOf?.(n) ?? this.costOf(n);
  }

  queueOf(nodeId) {
    return this.queues.findIndex((q) => q.nodeId === nodeId);
  }

  // What still stands in the way: { nodes: [ids not done], condition: rule | null }.
  missing(id) {
    const n = this.byId[id];
    const nodes = (n.requires ?? []).filter((r) => !this.isDone(r));
    const condition = n.condition && !(this.hooks.conditionMet?.(n.condition) ?? true) ? n.condition : null;
    return { nodes, condition };
  }

  // 'done' | 'active' (in a queue) | 'available' | 'locked'
  status(id) {
    if (this.isDone(id)) return 'done';
    if (this.queueOf(id) >= 0) return 'active';
    const m = this.missing(id);
    return m.nodes.length || m.condition ? 'locked' : 'available';
  }

  // --- queues --------------------------------------------------------------------------
  get openQueues() {
    let n = 0;
    for (const q of this.queueDefs) {
      if (q.rule && !(this.hooks.conditionMet?.(q.rule) ?? true)) break;
      n++;
    }
    return n;
  }

  queueOpen(i) {
    return i >= 0 && i < this.openQueues;
  }

  // Queue index the worker is on, or -1.
  queueOfWorker(staffId) {
    return this.queues.findIndex((q) => q.staffId === staffId);
  }

  // Worker ids on research right now (open queues only).
  get busyIds() {
    return this.queues.filter((q, i) => q.staffId && this.queueOpen(i)).map((q) => q.staffId);
  }

  // Can this worker go on queue i? { ok, reason }
  canAssign(i, staffId) {
    if (!this.queueOpen(i)) return { ok: false, reason: 'This queue is locked' };
    if (!this.staff.get(staffId)) return { ok: false, reason: 'Unknown worker' };
    const other = this.queueOfWorker(staffId);
    if (other >= 0 && other !== i) return { ok: false, reason: 'Already researching in another queue' };
    const busy = this.hooks.busyElsewhere?.(staffId);
    if (busy) return { ok: false, reason: busy };
    return { ok: true, reason: null };
  }

  // Can node id start on queue i? { ok, reason }
  canStart(i, id) {
    const n = this.byId[id];
    if (!n) return { ok: false, reason: 'Unknown research' };
    if (!this.queueOpen(i)) return { ok: false, reason: 'This queue is locked' };
    if (this.queues[i].nodeId) return { ok: false, reason: 'This queue is busy' };
    const st = this.status(id);
    if (st === 'done') return { ok: false, reason: 'Already done' };
    if (st === 'active') return { ok: false, reason: 'Already being researched' };
    if (st === 'locked') return { ok: false, reason: 'Locked' };
    if (!this.paid[id] && this.rp < this.costOf(n)) return { ok: false, reason: 'Not enough RP' };
    const extra = !this.paid[id] ? this.hooks.extraCostBlock?.(n) : null;
    if (extra) return { ok: false, reason: extra };
    return { ok: true, reason: null };
  }

  // Start node id on queue i with a worker (or none yet). Pays the cost the first time. Returns { ok, reason }.
  start(i, id, staffId = null) {
    const can = this.canStart(i, id);
    if (!can.ok) return can;
    if (staffId) {
      const a = this.canAssign(i, staffId);
      if (!a.ok) return a;
    }
    if (!this.paid[id]) {
      const cost = this.costOf(id);
      this.rp -= cost;
      this.paid[id] = cost;
      this.hooks.payExtraCost?.(this.byId[id]);
      this.progress[id] = 0;
    }
    this.queues[i] = { nodeId: id, staffId };
    this.bus?.emit('research:start', { node: this.byId[id], queue: i, staffId });
    return { ok: true, reason: null };
  }

  // Put a worker on queue i (null = take them off). Returns { ok, reason }.
  assign(i, staffId) {
    if (staffId) {
      const a = this.canAssign(i, staffId);
      if (!a.ok) return a;
    }
    this.queues[i].staffId = staffId;
    this.bus?.emit('research:assign', { queue: i, staffId });
    return { ok: true, reason: null };
  }

  // Stop queue i: the node keeps its progress and can be started again without paying.
  stop(i) {
    const q = this.queues[i];
    if (!q?.nodeId && !q?.staffId) return false;
    const nodeId = q.nodeId;
    this.queues[i] = { nodeId: null, staffId: null };
    this.bus?.emit('research:stop', { queue: i, nodeId });
    return true;
  }

  // A queue whose rule stops holding (e.g. its facility was sold) stops, keeping progress.
  closeLockedQueues() {
    this.queues.forEach((q, i) => {
      if ((q.nodeId || q.staffId) && !this.queueOpen(i)) this.stop(i);
    });
  }

  perDay(i) {
    const q = this.queues[i];
    const s = q?.staffId ? this.staff.get(q.staffId) : null;
    const n = q?.nodeId ? this.byId[q.nodeId] : null;
    if (!s || !n || !this.queueOpen(i)) return 0;
    const r = this.rules;
    const base = r.basePerDay + (this.hooks.workerStat?.(s, n) ?? 0) / r.statDivisor + (this.hooks.bonusPerDay?.(n) ?? 0);
    return base * (1 + (this.hooks.speedPct?.(n) ?? 0) / 100);
  }

  // Days left on queue i at today's rate (Infinity if nobody is working).
  daysLeft(i) {
    const q = this.queues[i];
    const rate = this.perDay(i);
    if (!q?.nodeId || rate <= 0) return Infinity;
    return Math.ceil((this.workOf(q.nodeId) - (this.progress[q.nodeId] ?? 0)) / rate);
  }

  fraction(id) {
    if (this.isDone(id)) return 1;
    return Math.min(1, (this.progress[id] ?? 0) / this.workOf(id));
  }

  // One day of research on every open queue.
  dailyTick() {
    this.closeLockedQueues();
    this.queues.forEach((q, i) => {
      const rate = this.perDay(i);
      if (rate <= 0) return;
      this.progress[q.nodeId] = (this.progress[q.nodeId] ?? 0) + rate;
      if (this.progress[q.nodeId] >= this.workOf(q.nodeId)) this.complete(q.nodeId);
    });
  }

  // Finish a node: record it, free its queue, fire its unlock actions, then any milestone reached.
  // Normal play reaches this through dailyTick; debug tools may call it directly. Never fires twice.
  complete(id) {
    const n = this.byId[id];
    if (!n || this.isDone(id)) return false;
    const i = this.queueOf(id);
    const staffId = i >= 0 ? this.queues[i].staffId : null;
    if (i >= 0) this.queues[i] = { nodeId: null, staffId: null };
    this.done.push(id);
    this.paid[id] ??= 0;
    delete this.progress[id];
    const fired = this.runner.run(n.actions ?? [], id);
    this.hooks.onComplete?.(n, { staffId });
    this.bus?.emit('research:complete', { node: n, queue: i, staffId, fired });
    for (const m of this.milestones) {
      if (this.doneCount >= m.count && !this.milestonesHit.includes(m.count)) {
        this.milestonesHit.push(m.count);
        const mf = this.runner.run(m.actions ?? [], `milestone:${m.count}`);
        this.bus?.emit('research:milestone', { milestone: m, fired: mf });
      }
    }
    return true;
  }

  // --- save ----------------------------------------------------------------------------
  serialize() {
    return JSON.parse(
      JSON.stringify({
        rp: this.rp,
        rpEarned: this.rpEarned,
        done: this.done,
        paid: this.paid,
        progress: this.progress,
        queues: this.queues,
        firsts: this.firsts,
        milestonesHit: this.milestonesHit,
        recent: this.recent,
      }),
    );
  }

  load(s) {
    this.reset();
    if (!s) return;
    const c = JSON.parse(JSON.stringify(s));
    this.rp = c.rp ?? 0;
    this.rpEarned = c.rpEarned ?? 0;
    this.done = (c.done ?? []).filter((id) => this.byId[id]);
    this.paid = c.paid ?? {};
    this.progress = c.progress ?? {};
    this.queueDefs.forEach((_, i) => (this.queues[i] = c.queues?.[i] ?? { nodeId: null, staffId: null }));
    this.firsts = c.firsts ?? {};
    this.milestonesHit = c.milestonesHit ?? [];
    this.recent = c.recent ?? [];
  }
}
