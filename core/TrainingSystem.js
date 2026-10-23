// Training courses (a robot workshop's Code Camp, a café's barista course…): a worker is away for some days,
// then gains stats. Gains are always clamped to the worker's tier cap (the game's statCap hook).
//
// course (plain data): { id, name, cost, currency, days, requires: rule | null,
//   effect: { kind, min, max, stat?, count?, morale? }, limit: { perWorkerPerYear?, perWorkerPerRun? } }
//   kind 'stat'    one named stat +min..max
//        'primary' the worker's main stat (hook primaryStat) +min..max
//        'lowest'  the `count` lowest stats +min..max each
//        'all'     every stat +min..max
//        'none'    no stat gain (the game's onComplete hook does the rest, e.g. an Energy / recovery course)
//        'stats'   several named stats, each its own range: stats: { key: [min, max] } (CAREWORKS M11; min / max
//                  unused)
//   morale: extra Morale on completion (on top of rules.successMorale)
//   slot: optional — the one slot id this course must use (e.g. a single simulator seat)
// slots (plain data): [{ id, name, roles: null | ['pilot'], courseOnly? }] — how many of each is open comes from
//   slotCount(slot). A worker takes the first free slot made for their role, else a general one (roles: null).
//   courseOnly: true = only courses that name it (course.slot) use it; a course with a slot uses only that one.
// Game hooks:
//   statCap(staff, statKey), primaryStat(staff), slotCount(slot), conditionMet(rule) → bool
//   busyElsewhere(staffId) → reason | null    (on a project, researching…)
//   canPay(course) → reason | null, pay(course, staff)   money is the game's business
//   durationPct(course, staff, slot) → % change on days (facilities; never below 1 day)
//   now() → { day, year }, onComplete(staff, course, gains)
// Uses its own seeded Rng. Emits 'training:start', 'training:complete', 'training:cancel'.
export class TrainingSystem {
  constructor({ rng, bus = null, staff, statKeys, courses, slots, rules = {}, hooks = {} }) {
    this.rng = rng;
    this.bus = bus;
    this.staff = staff; // StaffSystem
    this.statKeys = statKeys;
    this.courses = courses;
    this.byId = Object.fromEntries(courses.map((c) => [c.id, c]));
    this.slots = slots;
    this.rules = { successMorale: 2, ...rules };
    this.hooks = hooks;
    this.reset();
  }

  reset() {
    this.active = []; // { staffId, courseId, slotId, daysDone, days, startedDay }
    this.log = []; // { staffId, courseId, year, day, gains }
  }

  course(id) {
    return this.byId[id] ?? null;
  }

  slotCount(slot) {
    return Math.max(0, this.hooks.slotCount?.(slot) ?? 1);
  }

  used(slotId) {
    return this.active.filter((a) => a.slotId === slotId).length;
  }

  // Slot a worker would take right now for this course (optional), or null.
  slotFor(s, course = null) {
    const fits = (slot) => this.used(slot.id) < this.slotCount(slot) && (course?.slot ? slot.id === course.slot : !slot.courseOnly);
    return this.slots.find((sl) => sl.roles?.includes(s.role) && fits(sl)) ?? this.slots.find((sl) => !sl.roles && fits(sl)) ?? null;
  }

  trainingOf(staffId) {
    return this.active.find((a) => a.staffId === staffId) ?? null;
  }

  get busyIds() {
    return this.active.map((a) => a.staffId);
  }

  // Why the course can't be taken at all right now (not about a worker), or null.
  courseBlock(courseId) {
    const c = this.byId[courseId];
    if (!c) return 'Unknown course';
    if (c.requires && !(this.hooks.conditionMet?.(c.requires) ?? true)) return 'Locked';
    return this.hooks.canPay?.(c) ?? null;
  }

  // Why this worker can't take this course now, or null.
  workerBlock(courseId, staffId) {
    const c = this.byId[courseId];
    const s = this.staff.get(staffId);
    if (!c || !s) return 'Unknown';
    if (this.trainingOf(staffId)) return 'Already training';
    const busy = this.hooks.busyElsewhere?.(staffId);
    if (busy) return busy;
    const lim = c.limit ?? {};
    const now = this.hooks.now?.() ?? { year: 0 };
    const past = this.log.filter((l) => l.staffId === staffId && l.courseId === courseId);
    const running = this.active.some((a) => a.staffId === staffId && a.courseId === courseId) ? 1 : 0;
    if (lim.perWorkerPerYear && past.filter((l) => l.year === now.year).length + running >= lim.perWorkerPerYear) return 'Already done this year';
    if (lim.perWorkerPerRun && past.length + running >= lim.perWorkerPerRun) return 'Already done';
    if (!this.slotFor(s, c)) return 'No free training slot';
    if (c.effect.kind !== 'none' && this.gainRoom(courseId, s) <= 0) return 'Already at the tier cap';
    return null;
  }

  // The stats this course would raise for this worker.
  targets(course, s) {
    const e = course.effect;
    const cap = this.hooks.statCap?.(s) ?? Infinity;
    if (e.kind === 'stat') return [e.stat];
    if (e.kind === 'stats') return Object.keys(e.stats ?? {});
    if (e.kind === 'primary') return [this.hooks.primaryStat?.(s)].filter(Boolean);
    if (e.kind === 'all') return [...this.statKeys];
    if (e.kind === 'lowest') {
      // lowest stats that can still grow
      return [...this.statKeys].filter((k) => (s.stats[k] ?? 0) < (this.hooks.statCap?.(s, k) ?? cap)).sort((a, b) => (s.stats[a] ?? 0) - (s.stats[b] ?? 0) || this.statKeys.indexOf(a) - this.statKeys.indexOf(b)).slice(0, e.count ?? 3);
    }
    return [];
  }

  // How many points the course could still add in total before the cap (0 = pointless).
  gainRoom(courseId, s) {
    const c = this.byId[courseId];
    const cap = this.hooks.statCap?.(s) ?? Infinity;
    return this.targets(c, s).reduce((t, k) => t + Math.max(0, (this.hooks.statCap?.(s, k) ?? cap) - (s.stats[k] ?? 0)), 0);
  }

  // For the screen: [{ key, from, min, max }] with min/max already clamped to the cap.
  preview(courseId, staffId) {
    const c = this.byId[courseId];
    const s = this.staff.get(staffId);
    if (!c || !s) return [];
    const cap = this.hooks.statCap?.(s) ?? Infinity;
    return this.targets(c, s).map((k) => {
      const from = s.stats[k] ?? 0;
      const kc = this.hooks.statCap?.(s, k) ?? cap;
      const [mn, mx] = this._range(c, k);
      return { key: k, from, min: Math.min(kc, from + mn) - from, max: Math.min(kc, from + mx) - from, cap: kc, want: mx };
    });
  }

  daysFor(course, s, slot) {
    const pct = this.hooks.durationPct?.(course, s, slot) ?? 0;
    return Math.max(1, Math.round(course.days * (1 + pct / 100)));
  }

  // Start a course. Pays through the game's pay hook. Returns { ok, reason }.
  start(courseId, staffId) {
    const block = this.courseBlock(courseId) ?? this.workerBlock(courseId, staffId);
    if (block) return { ok: false, reason: block };
    const c = this.byId[courseId];
    const s = this.staff.get(staffId);
    const slot = this.slotFor(s, c);
    this.hooks.pay?.(c, s);
    const now = this.hooks.now?.() ?? { day: 0 };
    const t = { staffId, courseId, slotId: slot.id, daysDone: 0, days: this.daysFor(c, s, slot), startedDay: now.day };
    this.active.push(t);
    this.bus?.emit('training:start', { training: t, course: c, staff: s });
    return { ok: true, reason: null, training: t };
  }

  // Stop without gains or refund (e.g. the worker left).
  cancel(staffId) {
    const t = this.trainingOf(staffId);
    if (!t) return false;
    this.active = this.active.filter((a) => a !== t);
    this.bus?.emit('training:cancel', { training: t });
    return true;
  }

  dailyTick() {
    for (const t of [...this.active]) {
      t.daysDone++;
      if (t.daysDone >= t.days) this._finish(t);
    }
  }

  _finish(t) {
    this.active = this.active.filter((a) => a !== t);
    const c = this.byId[t.courseId];
    const s = this.staff.get(t.staffId);
    if (!c || !s) return;
    const cap = this.hooks.statCap?.(s) ?? Infinity;
    const gains = {};
    for (const k of this.targets(c, s)) {
      const from = s.stats[k] ?? 0;
      const [mn, mx] = this._range(c, k);
      const to = Math.min(this.hooks.statCap?.(s, k) ?? cap, from + this.rng.int(mn, mx));
      if (to > from) gains[k] = to - from;
      s.stats[k] = Math.max(from, to);
    }
    s.morale = Math.min(100, Math.max(0, Math.round((s.morale + this.rules.successMorale + (c.effect.morale ?? 0)) * 10) / 10));
    const now = this.hooks.now?.() ?? { day: 0, year: 0 };
    this.log.push({ staffId: s.id, courseId: c.id, year: now.year, day: now.day, gains });
    this.hooks.onComplete?.(s, c, gains);
    this.bus?.emit('training:complete', { staff: s, course: c, gains });
  }

  // A course's gain range for one stat: its own for 'stats', else the course's min / max.
  _range(c, k) {
    return c.effect.kind === 'stats' ? c.effect.stats[k] : [c.effect.min, c.effect.max];
  }

  serialize() {
    return JSON.parse(JSON.stringify({ rngState: this.rng.getState(), active: this.active, log: this.log }));
  }

  load(s) {
    this.reset();
    if (!s) return false;
    const c = JSON.parse(JSON.stringify(s));
    if (c.rngState !== undefined) this.rng.setState(c.rngState);
    this.active = c.active ?? [];
    this.log = c.log ?? [];
    return true;
  }
}
