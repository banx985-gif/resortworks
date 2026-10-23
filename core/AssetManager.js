// Loads images by key. A missing or broken file never crashes the game:
// it is logged once and drawn as a clearly visible placeholder box instead.
// Drawing goes through a SpriteCache: each image is shrunk once to the size it is shown at,
// then that small copy is drawn every frame (bible §40.1).
//
// Milestone 24 (Robot Workshop "art complete"), all optional — a game that passes none of it works as before:
//   resolve(src) → [url, …]   where to fetch a manifest path from, best first (e.g. a web-sized WebP copy, then a PNG
//                             copy, then the original). The next url is tried when one fails.
//   register(manifest)        remember every key → path the game knows, without loading it yet
//   ensure(keys)              load these (if not already), resolves when they are in — a screen's pictures
//   loadInBackground(keys, { concurrency })   load the rest a few at a time, behind the game
//   A registered picture that is still on its way draws nothing (not the placeholder box): it pops in a moment later.
//   startTracking() / tracking  every key drawn (how often, biggest logical size, on which screens) and every
//                             placeholder / stand-in drawn — what the asset validator reads for "used" and "0 fallbacks".
//   screenTag                 the screen name the game is on (for the tracking record)
//   loadOptional(key, src)    a picture that may not exist yet (Milestone 25b: art still to be painted): loaded quietly
//                             if it is there (has(key) turns true) — never a warning, a placeholder or a "missing" entry
// GOALWORKS Milestone 12b — canvas loss (core/CanvasLoss): the size copies are made again (SpriteCache), and every picture
// a game made in code and put in images (a kit-tinted body, a livery copy — any canvas, not a loaded file) is dropped, so
// has(key) turns false and the game's own "make it if missing" code makes it again. bus: 'assets:canvasLost' { reason }.
import { SpriteCache } from './SpriteCache.js';
import { onCanvasLoss } from './CanvasLoss.js';

export class AssetManager {
  constructor({ basePath = '', bus = null, resolve = null } = {}) {
    this.basePath = basePath;
    this.bus = bus;
    this.resolve = resolve; // src → [candidate urls], best first (null: the src as given)
    this.images = new Map(); // key → HTMLImageElement (loaded OK)
    this.missing = new Map(); // key → src that failed
    this.sources = new Map(); // key → the url it was actually loaded from
    this.manifest = {}; // every key → src the game has registered
    this.loading = new Map(); // key → promise while it loads
    this.sprites = new SpriteCache();
    this.detail = 1; // extra resolution for world drawing under a zoomed camera (see sprite())
    this.fallbacks = new Map(); // key → { draw, aspect }: a stand-in drawn while the file is missing
    this.tracking = null; // { drawn: Map, fallbacks: Map } while tracking
    this.screenTag = '';
    onCanvasLoss(this, (a, reason) => a.dropMadeImages(reason));
  }

  // Every image that is a canvas made in code (not a loaded file) goes; its maker makes it again on its next call.
  dropMadeImages(reason = 'lost') {
    const isCanvas = (img) => typeof HTMLCanvasElement !== 'undefined' && img instanceof HTMLCanvasElement;
    let n = 0;
    for (const [k, img] of [...this.images]) {
      if (!isCanvas(img)) continue;
      this.images.delete(k);
      n++;
    }
    this.bus?.emit('assets:canvasLost', { reason, dropped: n });
    return n;
  }

  // A readable stand-in for art that is not drawn yet (a labelled block, a simple figure…). While the file is
  // missing, draw(ctx, x, y, w, h) is called wherever the image would go, and aspect() reports its shape; once
  // the real file loads, the image wins, with no code change. Keys without one get the pink placeholder box.
  setFallback(key, draw, { aspect = 1 } = {}) {
    this.fallbacks.set(key, { draw, aspect });
    return this;
  }

  register(manifest) {
    Object.assign(this.manifest, manifest);
    return this;
  }

  // manifest: { key: 'path/to/file.png', ... }. Always resolves, even if files fail.
  async loadImages(manifest, onProgress, { concurrency = Infinity } = {}) {
    this.register(manifest);
    const entries = Object.entries(manifest);
    let done = 0;
    await runLimited(entries, concurrency, ([key, src]) =>
      this.loadImage(key, src).then(() => {
        done++;
        onProgress?.(done, entries.length);
      }),
    );
    return { loaded: this.images.size, missing: [...this.missing.keys()] };
  }

  // Registered keys, loaded now (the ones already in or on their way are not fetched again).
  ensure(keys, onProgress) {
    const list = [...new Set(keys)].filter((k) => this.manifest[k]);
    let done = 0;
    return Promise.all(
      list.map((k) =>
        this.loadImage(k, this.manifest[k]).then(() => {
          done++;
          onProgress?.(done, list.length);
        }),
      ),
    );
  }

  // The rest, a few at a time, so the first screen's pictures are never queued behind them.
  loadInBackground(keys = Object.keys(this.manifest), { concurrency = 4 } = {}) {
    const list = [...new Set(keys)].filter((k) => this.manifest[k] && !this.images.has(k) && !this.missing.has(k));
    return runLimited(list, concurrency, (k) => this.loadImage(k, this.manifest[k]));
  }

  // Registered, not loaded and not failed: still on its way.
  isPending(key) {
    return !!this.manifest[key] && !this.images.has(key) && !this.missing.has(key);
  }

  loadImage(key, src) {
    if (this.images.has(key)) return Promise.resolve(this.images.get(key));
    if (this.loading.has(key)) return this.loading.get(key);
    const urls = (this.resolve?.(src) ?? [src]).map((u) => this.basePath + u);
    const p = new Promise((resolve) => {
      const tryAt = (i) => {
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => {
          this.images.set(key, img);
          this.sources.set(key, urls[i]);
          this.missing.delete(key);
          this.loading.delete(key);
          this.bus?.emit('asset:loaded', { key });
          resolve(img);
        };
        img.onerror = () => {
          if (i + 1 < urls.length) return tryAt(i + 1);
          this.missing.set(key, urls[0]);
          this.loading.delete(key);
          console.warn(`[AssetManager] missing image "${key}" (${urls.join(' | ')}) — using placeholder`);
          this.bus?.emit('asset:missing', { key, url: urls[0] });
          resolve(null);
        };
        img.src = urls[i];
      };
      tryAt(0);
    });
    this.loading.set(key, p);
    return p;
  }

  loadOptional(key, src) {
    if (this.images.has(key)) return Promise.resolve(this.images.get(key));
    const urls = (this.resolve?.(src) ?? [src]).map((u) => this.basePath + u);
    return new Promise((resolve) => {
      const tryAt = (i) => {
        if (i >= urls.length || typeof Image === 'undefined') return resolve(null);
        const img = new Image();
        img.onload = () => {
          this.images.set(key, img);
          this.sources.set(key, urls[i]);
          this.bus?.emit('asset:loaded', { key });
          resolve(img);
        };
        img.onerror = () => tryAt(i + 1);
        img.src = urls[i];
      };
      tryAt(0);
    });
  }

  has(key) {
    return this.images.has(key);
  }

  get(key) {
    return this.images.get(key) || null;
  }

  // Width ÷ height of an image (its fallback's shape, or 1, if it is missing).
  aspect(key) {
    const img = this.images.get(key);
    return img ? img.naturalWidth / img.naturalHeight : (this.fallbacks.get(key)?.aspect ?? 1);
  }

  // Real screen pixels per logical unit; call after every resize (clears the size cache).
  setPixelScale(scale) {
    return this.sprites.setPixelScale(scale);
  }

  // The display-size copy of an image for a logical w×h (null if the image is missing). While `detail` is above 1
  // (a zoomed-in camera draws everything bigger on screen) the copy is made that much larger, so it stays sharp.
  sprite(key, w, h) {
    const img = this.images.get(key);
    if (this.tracking && img) this._note(key, w * this.detail, h * this.detail);
    return img ? this.sprites.get(key, img, w * this.detail, h * this.detail) : null;
  }

  // Draws the image at x, y, w×h (logical units), or a placeholder of the same size if it is not available.
  // Positions are snapped to whole screen pixels so the cached copy lands 1:1 and stays sharp.
  draw(ctx, key, x, y, w, h) {
    const img = this.images.get(key);
    if (img) {
      const dw = w ?? img.naturalWidth;
      const dh = h ?? img.naturalHeight;
      const ps = this.sprites.pixelScale * this.detail;
      if (this.tracking) this._note(key, dw * this.detail, dh * this.detail);
      ctx.drawImage(this.sprites.get(key, img, dw * this.detail, dh * this.detail), Math.round(x * ps) / ps, Math.round(y * ps) / ps, dw, dh);
      return true;
    }
    this.drawPlaceholder(ctx, key, x, y, w ?? 128, h ?? 128);
    return false;
  }

  // Fit the image inside box r keeping its shape. align: 'center' | 'bottom'. Returns the drawn size.
  drawContained(ctx, key, r, align = 'center') {
    const img = this.images.get(key);
    if (!img) {
      this.drawPlaceholder(ctx, key, r.x, r.y, r.w, r.h);
      return null;
    }
    const s = Math.min(r.w / img.naturalWidth, r.h / img.naturalHeight);
    const w = img.naturalWidth * s;
    const h = img.naturalHeight * s;
    const y = align === 'bottom' ? r.y + r.h - h : r.y + (r.h - h) / 2;
    this.draw(ctx, key, r.x + (r.w - w) / 2, y, w, h);
    return { w, h };
  }

  // Draw part of an image: crop = { x, y, w, h } as fractions of the image, into box r (e.g. a face from a full-body picture).
  drawCrop(ctx, key, crop, r) {
    const img = this.images.get(key);
    if (!img) {
      this.drawPlaceholder(ctx, key, r.x, r.y, r.w, r.h);
      return;
    }
    if (this.tracking) this._note(key, (r.w / crop.w) * this.detail, (r.h / crop.h) * this.detail);
    const sprite = this.sprites.get(key, img, (r.w / crop.w) * this.detail, (r.h / crop.h) * this.detail);
    ctx.drawImage(sprite, crop.x * sprite.width, crop.y * sprite.height, crop.w * sprite.width, crop.h * sprite.height, r.x, r.y, r.w, r.h);
  }

  drawPlaceholder(ctx, label, x, y, w, h) {
    if (this.isPending(label)) return; // still loading: nothing now, the picture pops in when it arrives
    if (this.tracking) {
      const f = this.tracking.fallbacks;
      const rec = f.get(label) ?? { count: 0, screens: new Set() };
      rec.count++;
      rec.screens.add(this.screenTag);
      f.set(label, rec);
    }
    const fb = this.fallbacks.get(label);
    if (fb) {
      ctx.save();
      fb.draw(ctx, x, y, w, h);
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.fillStyle = '#3a1d3f';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#ff4fd8';
    ctx.lineWidth = 4;
    ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y + h);
    ctx.moveTo(x + w, y);
    ctx.lineTo(x, y + h);
    ctx.stroke();
    const size = Math.max(12, Math.min(28, w / 8));
    ctx.font = `bold ${size}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`missing: ${label}`, x + w / 2, y + h / 2, w - 12);
    ctx.restore();
  }

  // --- tracking (debug builds and tests) -----------------------------------------------------------------------------
  startTracking() {
    this.tracking = { drawn: new Map(), fallbacks: new Map() };
    return this.tracking;
  }

  stopTracking() {
    const t = this.tracking;
    this.tracking = null;
    return t;
  }

  _note(key, w, h) {
    const d = this.tracking.drawn;
    let rec = d.get(key);
    if (!rec) d.set(key, (rec = { count: 0, maxW: 0, maxH: 0, screens: new Set() }));
    rec.count++;
    if (w > rec.maxW) rec.maxW = w;
    if (h > rec.maxH) rec.maxH = h;
    rec.screens.add(this.screenTag);
  }

  // Plain-data copy of the tracking record (for a report).
  trackingReport() {
    const t = this.tracking;
    if (!t) return null;
    const plain = (m) => Object.fromEntries([...m].map(([k, v]) => [k, { ...v, screens: [...v.screens] }]));
    return { drawn: plain(t.drawn), fallbacks: plain(t.fallbacks) };
  }

  // Can this browser show WebP? (A tiny WebP decoded once.)
  static webpSupported() {
    if (typeof Image === 'undefined') return Promise.resolve(false);
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img.width === 1);
      img.onerror = () => resolve(false);
      img.src = 'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA';
    });
  }
}

// Run fn over items with at most `limit` running at once.
async function runLimited(items, limit, fn) {
  if (!Number.isFinite(limit) || limit >= items.length) return Promise.all(items.map(fn));
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.max(1, limit) }, worker));
}
