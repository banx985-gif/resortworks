// Tapping a picture on its painted pixels (RESORTWORKS Milestone 1; any game). Art in the dollhouse view is a square-ish
// picture with empty corners: a building's empty sky must not steal a tap meant for the one behind it. Each picture gets a
// small alpha mask, made once from the loaded image (in a little offscreen canvas) and kept by key.
//   const hit = new AlphaHit(assets, { size = 128, threshold = 40 })
//   hit.painted(key, r, x, y) → true / false: is (x, y) inside rect r (where the picture is drawn, any units) and on a
//                               painted pixel of it? null when there is no mask (not loaded yet, or the browser refused
//                               to read the pixels) — the caller then falls back to its own shape.
//   hit.forget(key)            drop a mask (the picture changed)
export class AlphaHit {
  constructor(assets, { size = 128, threshold = 40 } = {}) {
    this.assets = assets;
    this.size = size;
    this.threshold = threshold;
    this.masks = new Map(); // key → { w, h, a: Uint8Array } | null (could not be read)
  }

  forget(key) {
    this.masks.delete(key);
  }

  mask(key) {
    if (this.masks.has(key)) return this.masks.get(key);
    const img = this.assets.get(key);
    if (!img?.naturalWidth || typeof document === 'undefined') return null; // not in yet: try again next time
    let m = null;
    try {
      const k = this.size / Math.max(img.naturalWidth, img.naturalHeight);
      const w = Math.max(1, Math.round(img.naturalWidth * k));
      const h = Math.max(1, Math.round(img.naturalHeight * k));
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0, w, h);
      const px = g.getImageData(0, 0, w, h).data;
      const a = new Uint8Array(w * h);
      for (let i = 0; i < a.length; i++) a[i] = px[i * 4 + 3];
      m = { w, h, a };
      c.width = 0; // give the canvas back
    } catch {
      m = null; // a picture from another origin cannot be read
    }
    this.masks.set(key, m);
    return m;
  }

  painted(key, r, x, y) {
    if (x < r.x || y < r.y || x > r.x + r.w || y > r.y + r.h) return false;
    const m = this.mask(key);
    if (!m) return null;
    const mx = Math.min(m.w - 1, Math.floor(((x - r.x) / r.w) * m.w));
    const my = Math.min(m.h - 1, Math.floor(((y - r.y) / r.h) * m.h));
    return m.a[my * m.w + mx] > this.threshold;
  }
}
