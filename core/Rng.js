// Seeded random numbers (mulberry32). Same seed → same sequence, so runs and saves are repeatable.
export class Rng {
  constructor(seed = 1) {
    this.setSeed(seed);
  }

  setSeed(seed) {
    this.seed = Rng.hashSeed(seed);
    this.state = this.seed;
  }

  // Accepts numbers or strings ("robot-workshop-run-1").
  static hashSeed(seed) {
    if (typeof seed === 'number' && Number.isFinite(seed)) return seed >>> 0;
    const str = String(seed);
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  // Float in [0, 1).
  next() {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Float in [min, max).
  range(min, max) {
    return min + this.next() * (max - min);
  }

  // Integer in [min, max] inclusive.
  int(min, max) {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(p) {
    return this.next() < p;
  }

  pick(list) {
    return list.length ? list[Math.floor(this.next() * list.length)] : undefined;
  }

  shuffle(list) {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  // For saving/restoring mid-sequence.
  getState() {
    return this.state;
  }

  setState(state) {
    this.state = state >>> 0;
  }
}
