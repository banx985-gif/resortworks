// Floating numbers without the pile-up (any game): "+14 Rep", "+60 RP", "Level 3!".
// Numbers wait in a short line and float up one after another (stagger), never more than maxLive at once (cap),
// each from the thing that earned it (source): the game turns a source into a screen point when it floats.
// Numbers of the same kind from the same source that are still waiting are added together ("+14 Rep" and "+20 Rep"
// → "+34 Rep"); past maxWaiting the oldest waiting number is dropped (the money is in the ledger anyway).
//
//   push({ key, amount, label(amount) → text, source, color, icon, size, life, rise })   key: 'rep', 'rp'…
//   update(dt, { hold })   hold: nothing new floats (another screen or a pop-up is up); waiting ones keep a moment
//   where(source, lane) → { x, y } | null     the game's hook: a screen point for this source, lane 0, 1, 2… upwards
//                                             (null = that source can't be shown now: the fallback point is used)
// Draws through core/VfxSystem texts on the 'screen' layer.
export class FloatFeed {
  constructor({ vfx, where = () => null, fallback = () => ({ x: 540, y: 300 }), maxLive = 3, gap = 0.3, maxWaiting = 6, maxWaitSec = 4 }) {
    this.vfx = vfx;
    this.where = where;
    this.fallback = fallback;
    this.maxLive = maxLive;
    this.gap = gap;
    this.maxWaiting = maxWaiting;
    this.maxWaitSec = maxWaitSec;
    this.waiting = [];
    this.lanes = Array.from({ length: maxLive }, () => 0); // seconds left on each lane
    this.timer = 0;
    this.stats = { pushed: 0, shown: 0, merged: 0, dropped: 0, peakLive: 0 };
  }

  get live() {
    return this.lanes.filter((t) => t > 0).length;
  }

  push(item) {
    this.stats.pushed++;
    const srcKey = JSON.stringify(item.source ?? null);
    const same = this.waiting.find((w) => w.key === item.key && w.srcKey === srcKey && typeof w.amount === 'number' && typeof item.amount === 'number');
    if (same && item.key) {
      same.amount += item.amount;
      this.stats.merged++;
      return same;
    }
    const w = { life: 1.9, rise: 60, size: 42, ...item, srcKey, age: 0 };
    this.waiting.push(w);
    while (this.waiting.length > this.maxWaiting) {
      this.waiting.shift();
      this.stats.dropped++;
    }
    return w;
  }

  update(dt, { hold = false } = {}) {
    for (let i = 0; i < this.lanes.length; i++) this.lanes[i] = Math.max(0, this.lanes[i] - dt);
    this.timer = Math.max(0, this.timer - dt);
    for (const w of this.waiting) w.age += dt;
    if (hold) {
      // Nothing can show: numbers that have waited too long are dropped rather than bursting out later.
      const before = this.waiting.length;
      this.waiting = this.waiting.filter((w) => w.age < this.maxWaitSec);
      this.stats.dropped += before - this.waiting.length;
      return;
    }
    while (this.waiting.length && this.timer <= 0) {
      const lane = this.lanes.findIndex((t) => t <= 0);
      if (lane < 0) return;
      const w = this.waiting.shift();
      const p = this.where(w.source, lane) ?? this.fallback(lane);
      const text = w.label ? w.label(w.amount) : String(w.amount);
      this.vfx.text('screen', text, p.x, p.y, { color: w.color, icon: w.icon, size: w.size, life: w.life, rise: w.rise });
      this.lanes[lane] = w.life; // the lane is free again once its text has gone
      this.timer = this.gap;
      this.stats.shown++;
      this.stats.peakLive = Math.max(this.stats.peakLive, this.live);
    }
  }

  // Everything waiting, and the numbers already floating (a full screen opened — Milestone 21 fix).
  clear() {
    this.waiting = [];
    this.lanes.fill(0);
    this.timer = 0;
    this.vfx.clearTexts?.('screen');
  }
}
