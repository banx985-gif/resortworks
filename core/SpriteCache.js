// Display-size copies of source images (bible §40.1: never resize big images every frame).
// The first time an image is asked for at a size, a copy is made at exactly the screen's real
// pixel size, shrinking in halves for a clean result (one big jump looks jagged or muddy).
// After that the copy is drawn 1:1, which is fast and sharp. When the screen's pixel scale
// changes (window resize, rotate) every copy is thrown away and remade on demand.
// Milestone 27 (memory): prune(ageSec) drops the copies of any image not drawn for ageSec seconds (a screen you have
// left), so memory stays flat over a long session; the next draw simply makes them again. stats.pruned counts them.
// DEVWORKS Milestone 39 (optional): maxPixels caps the whole cache — past it, the images drawn longest ago lose their
// copies first (stats.evicted); totalPixels is what it holds now. Default: no cap (as before).
// frameBudgetMs (optional, same milestone): once the copies made since beginFrame() took that long, a new size is not
// made this frame — the source image is returned (drawn scaled, once) and the copy comes on a later frame, so many new
// pictures at once never make one long frame (stats.deferred). Default: no budget.
// GOALWORKS Milestone 12b: a canvas loss (core/CanvasLoss — the phone's GPU wiped every canvas made in code) clears the
// cache, so each copy is made again on its next draw instead of staying blank. maxUpscale (optional): a copy is never
// made bigger than the source × this (1 = the source's own size; drawImage stretches it the rest of the way, which looks
// the same) — a 512-px picture drawn 1,400 px wide under a zoomed camera no longer holds a 1,400-px copy per zoom step.
// Default: no limit (as before).
import { onCanvasLoss, watchCanvas } from './CanvasLoss.js';

export class SpriteCache {
  constructor({ maxSizesPerImage = 16, maxPixels = Infinity, frameBudgetMs = Infinity, maxUpscale = Infinity } = {}) {
    this.frameBudgetMs = frameBudgetMs;
    this.maxUpscale = maxUpscale;
    this.spentMs = 0;
    this.pixelScale = 1; // real screen pixels per logical unit
    this.maxSizesPerImage = maxSizesPerImage;
    this.maxPixels = maxPixels;
    this.totalPixels = 0;
    this.peakPixels = 0;
    this.byKey = new Map(); // key → Map(sizeCode → canvas)
    this.stats = { made: 0, hits: 0, cleared: 0, pruned: 0, evicted: 0, deferred: 0 };
    this.used = new Map(); // key → the prune clock when it was last drawn
    this.clock = 0;
    onCanvasLoss(this, (sc) => {
      sc.clear();
      sc.stats.lost = (sc.stats.lost ?? 0) + 1;
    });
  }

  // Call at the start of every drawn frame when frameBudgetMs is set.
  beginFrame() {
    this.spentMs = 0;
  }

  setPixelScale(scale) {
    if (!(scale > 0) || Math.abs(scale - this.pixelScale) < 1e-4) return false;
    this.pixelScale = scale;
    this.clear();
    return true;
  }

  clear() {
    this.byKey.clear();
    this.used.clear();
    this.totalPixels = 0;
    this.stats.cleared++;
  }

  // Size in real pixels for a logical size.
  pixels(w, h) {
    return { pw: Math.max(1, Math.round(w * this.pixelScale)), ph: Math.max(1, Math.round(h * this.pixelScale)) };
  }

  // The copy of `img` for a logical w×h, made once and reused. key names the image.
  get(key, img, w, h) {
    let pw = Math.max(1, Math.round(w * this.pixelScale));
    let ph = Math.max(1, Math.round(h * this.pixelScale));
    if (this.maxUpscale < Infinity) {
      const sw = (img.naturalWidth || img.width) * this.maxUpscale;
      if (sw > 0 && pw > sw) {
        ph = Math.max(1, Math.round((ph * sw) / pw));
        pw = Math.max(1, Math.round(sw));
      }
    }
    const code = pw * 65536 + ph; // number key: no string built per frame
    this.used.delete(key); // re-inserted last: the map's order is least- to most-recently drawn
    this.used.set(key, this.clock);
    let sizes = this.byKey.get(key);
    if (!sizes) {
      sizes = new Map();
      this.byKey.set(key, sizes);
    }
    const hit = sizes.get(code);
    if (hit) {
      this.stats.hits++;
      return hit;
    }
    if (this.spentMs >= this.frameBudgetMs) {
      this.stats.deferred++;
      return img; // this frame: the source, scaled by drawImage; the copy is made on a later frame
    }
    const t0 = this.frameBudgetMs < Infinity ? globalThis.performance?.now() ?? 0 : 0;
    const copy = SpriteCache.resample(img, pw, ph);
    if (this.frameBudgetMs < Infinity) this.spentMs += (globalThis.performance?.now() ?? 0) - t0;
    if (sizes.size >= this.maxSizesPerImage) {
      const old = sizes.keys().next().value; // oldest size goes
      this.totalPixels -= SpriteCache.area(sizes.get(old));
      sizes.delete(old);
    }
    sizes.set(code, copy);
    this.totalPixels += pw * ph;
    this.stats.made++;
    if (this.totalPixels > this.maxPixels) this._evict(key);
    this.peakPixels = Math.max(this.peakPixels, this.totalPixels);
    return copy;
  }

  // A new cap applies at once (the images drawn longest ago go first).
  setMaxPixels(px) {
    this.maxPixels = px > 0 ? px : Infinity;
    if (this.totalPixels > this.maxPixels) this._evict(null);
  }

  static area(c) {
    return c ? c.width * c.height : 0;
  }

  // Over the cap: drop whole images, least recently drawn first (never the one just drawn).
  _evict(keep) {
    for (const key of this.used.keys()) {
      if (this.totalPixels <= this.maxPixels) break;
      if (key === keep) continue;
      const sizes = this.byKey.get(key);
      for (const c of sizes?.values() ?? []) this.totalPixels -= SpriteCache.area(c);
      this.stats.evicted += sizes?.size ?? 0;
      this.byKey.delete(key);
      this.used.delete(key);
    }
  }

  // Call now and then (e.g. every few seconds) with the seconds since the last call.
  prune(dtSec, ageSec = 45) {
    this.clock += dtSec;
    let n = 0;
    for (const [key, t] of this.used) {
      if (this.clock - t < ageSec) continue;
      const sizes = this.byKey.get(key);
      n += sizes?.size ?? 0;
      for (const c of sizes?.values() ?? []) this.totalPixels -= SpriteCache.area(c);
      this.byKey.delete(key);
      this.used.delete(key);
    }
    this.stats.pruned += n;
    return n;
  }

  get count() {
    let n = 0;
    for (const s of this.byKey.values()) n += s.size;
    return n;
  }

  // Shrink an image to pw×ph real pixels, halving step by step until the last step is under 2×.
  static resample(img, pw, ph) {
    let src = img;
    let sw = img.naturalWidth || img.width;
    let sh = img.naturalHeight || img.height;
    while (sw >= pw * 2 && sh >= ph * 2) {
      const nw = Math.max(pw, Math.floor(sw / 2));
      const nh = Math.max(ph, Math.floor(sh / 2));
      src = SpriteCache.draw(src, nw, nh);
      sw = nw;
      sh = nh;
    }
    return SpriteCache.draw(src, pw, ph);
  }

  static draw(src, w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(src, 0, 0, w, h);
    return watchCanvas(c);
  }
}
