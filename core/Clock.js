// Game calendar: days → months → years, with pause and speed steps.
// Real time is turned into game days: at 1× one day takes secondsPerDay real seconds.
// Fires on the bus: 'clock:day', then 'clock:month' / 'clock:year' when those roll over,
// and 'clock:speed' when the speed changes. Days are whole steps, so anything hooked to
// them happens the same way no matter how fast or slow the frames are.
// speedAllowed(speed) → bool is an optional game rule for speeds that unlock later (locked speeds are refused).
export class Clock {
  constructor({ bus = null, daysPerMonth = 28, monthsPerYear = 12, secondsPerDay = 2.5, speeds = [1, 2, 3] } = {}) {
    this.bus = bus;
    this.daysPerMonth = daysPerMonth;
    this.monthsPerYear = monthsPerYear;
    this.secondsPerDay = secondsPerDay;
    this.speeds = speeds; // allowed non-zero speeds
    this.year = 1;
    this.month = 1;
    this.day = 1;
    this.totalDays = 0; // days passed since the start
    this.dayProgress = 0; // 0..1 through the current day
    this.speed = speeds[0]; // 0 = paused
    this.lastSpeed = speeds[0];
    this.speedAllowed = null;
  }

  canUseSpeed(speed) {
    return speed === 0 || (this.speeds.includes(speed) && (!this.speedAllowed || this.speedAllowed(speed)));
  }

  // Fastest usable speed at or below the one asked for (used after loading or when a rule changes).
  usableSpeed(speed) {
    if (speed === 0) return 0;
    const ok = this.speeds.filter((s) => s <= speed && this.canUseSpeed(s));
    return ok.length ? ok[ok.length - 1] : this.speeds[0];
  }

  get paused() {
    return this.speed === 0;
  }

  setSpeed(speed) {
    if (!this.canUseSpeed(speed)) return;
    if (speed === this.speed) return;
    this.speed = speed;
    if (speed !== 0) this.lastSpeed = speed;
    this.bus?.emit('clock:speed', { speed });
  }

  pause() {
    this.setSpeed(0);
  }

  resume() {
    this.setSpeed(this.lastSpeed || this.speeds[0]);
  }

  togglePause() {
    this.paused ? this.resume() : this.pause();
  }

  // Call every simulation step with real seconds.
  update(dt) {
    if (this.paused) return;
    this.dayProgress += (dt * this.speed) / this.secondsPerDay;
    while (this.dayProgress >= 1) {
      this.dayProgress -= 1;
      this.advanceDay();
    }
  }

  // Move exactly one day forward (also used by tests and fast-forward).
  advanceDay() {
    this.day++;
    this.totalDays++;
    let newMonth = false;
    let newYear = false;
    if (this.day > this.daysPerMonth) {
      this.day = 1;
      this.month++;
      newMonth = true;
      if (this.month > this.monthsPerYear) {
        this.month = 1;
        this.year++;
        newYear = true;
      }
    }
    const when = this.now();
    this.bus?.emit('clock:day', when);
    if (newMonth) this.bus?.emit('clock:month', when);
    if (newYear) this.bus?.emit('clock:year', when);
  }

  now() {
    return { year: this.year, month: this.month, day: this.day, totalDays: this.totalDays };
  }

  // Calendar date for a day number (0 = Year 1, Month 1, Day 1).
  dateOf(totalDays) {
    const perYear = this.daysPerMonth * this.monthsPerYear;
    return {
      year: Math.floor(totalDays / perYear) + 1,
      month: Math.floor((totalDays % perYear) / this.daysPerMonth) + 1,
      day: (totalDays % this.daysPerMonth) + 1,
    };
  }

  shortLabel(totalDays = this.totalDays) {
    const d = this.dateOf(totalDays);
    return `Y${d.year} M${d.month} D${d.day}`;
  }

  label() {
    return `Year ${this.year} · Month ${this.month} · Day ${this.day}`;
  }

  serialize() {
    return {
      year: this.year,
      month: this.month,
      day: this.day,
      totalDays: this.totalDays,
      dayProgress: this.dayProgress,
      speed: this.speed,
      lastSpeed: this.lastSpeed,
    };
  }

  load(s) {
    this.year = s.year;
    this.month = s.month;
    this.day = s.day;
    this.totalDays = s.totalDays ?? 0;
    this.dayProgress = s.dayProgress ?? 0;
    // Old saves may hold a speed that no longer exists or is locked: drop to the nearest usable one.
    this.speed = this.usableSpeed(s.speed ?? this.speeds[0]);
    this.lastSpeed = this.usableSpeed(s.lastSpeed ?? this.speeds[0]) || this.speeds[0];
  }
}
