// Company reputation: one number that good work raises, with named ranks from game data.
// Reputation never drops below the floor of the highest rank already reached (see CompanyRank.js).
//   ranks: [{ id: 'E', min: 0 }, { id: 'D', min: 250 }, ...] (ascending)
//   canReach(index): optional — returning false keeps a rank shut whatever the reputation (e.g. a rank that also
//   needs a title). A rank already reached stays reached. Call recheck() when that condition may have changed.
// Emits 'reputation:change' ({ amount, reason, value, quiet }) and 'reputation:rankUp' ({ rank, index }).
import { rankIndexFor, rankFloor } from './CompanyRank.js';

export class ReputationSystem {
  constructor({ bus = null, ranks, canReach = null }) {
    this.bus = bus;
    this.ranks = ranks;
    this.canReach = canReach;
    this.value = 0;
    this.highestRankIndex = 0;
  }

  // The rank this value earns: it stops below the first rank not yet reached whose extra condition is unmet.
  rankIndexFor(value) {
    const top = rankIndexFor(this.ranks, value);
    if (!this.canReach) return top;
    for (let i = this.highestRankIndex + 1; i <= top; i++) if (!this.canReach(i)) return i - 1;
    return top;
  }

  get rank() {
    return this.ranks[this.rankIndexFor(this.value)];
  }

  get nextRank() {
    return this.ranks[this.rankIndexFor(this.value) + 1] || null;
  }

  // The next rank whose reputation is already met but whose extra condition is not (null if none).
  get heldRank() {
    const next = this.nextRank;
    return next && this.value >= next.min ? next : null;
  }

  // quiet: a small steady trickle (e.g. +1 a day) that screens should not announce each time.
  add(amount, reason = '', { quiet = false } = {}) {
    const delta = Math.round(amount);
    if (!delta) return;
    const floor = rankFloor(this.ranks, this.highestRankIndex);
    this.value = Math.max(floor, this.value + delta);
    this.bus?.emit('reputation:change', { amount: delta, reason, value: this.value, quiet });
    this.recheck();
  }

  // Rank up if the reputation (and any rank's extra condition) now allows it.
  recheck() {
    const idx = this.rankIndexFor(this.value);
    if (idx > this.highestRankIndex) {
      this.highestRankIndex = idx;
      this.bus?.emit('reputation:rankUp', { rank: this.ranks[idx], index: idx });
    }
  }

  serialize() {
    return { value: this.value, highestRankIndex: this.highestRankIndex };
  }

  load(s) {
    this.value = s?.value ?? 0;
    this.highestRankIndex = s?.highestRankIndex ?? 0;
  }
}
