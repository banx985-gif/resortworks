// Owns the canvas. Everything draws in logical units: 1080 wide, 1920 tall at the base shape.
// The canvas is scaled uniformly to fit the window (letterboxed, never stretched)
// and its backing store uses devicePixelRatio, capped to keep phones fast.
// Tall phones (taller than 9:16): the width stays 1080 and the logical height grows (up to maxHeight),
// so the game fills the whole screen edge to edge instead of shrinking into a narrow middle strip.
// Screens must read renderer.height live (it can change on every resize).
//
// Fill the screen (SERIES_SCREEN_FILL_AND_BACKDROPS, RACEWORKS Milestone 32) — opt-in, `fill: true`: the canvas covers
// the whole window whatever its shape (a Fold open, a tablet, a desktop) instead of leaving bars. The 1080-wide design
// column stays exactly where it was (centred, same scale), so every screen's layout is unchanged; the extra space round
// it is logical space too, at negative x / y and past width / height:
//   full    { x, y, w, h }                 the whole canvas in logical units (x, y ≤ 0) — backgrounds, backdrops and
//                                          world views draw over this to reach the real edges
//   bleed   { left, right, top, bottom }   how far the canvas reaches past the column on each side (logical units)
//   cssBox                                 still the design column's box in CSS pixels (safe areas, text boxes, tests)
//   canvasBox                              the canvas element's own box in CSS pixels
// Without `fill` (every other game) full = { 0, 0, width, height }, bleed is all 0 and nothing changes.
export class Renderer {
  constructor(canvas, { width = 1080, height = 1920, maxHeight = height, maxDpr = 2, bus = null, fill = false } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.width = width;
    this.height = height;
    this.baseHeight = height;
    this.maxHeight = Math.max(height, maxHeight);
    this.maxDpr = maxDpr;
    this.bus = bus;
    this.fill = !!fill;

    this.scale = 1; // CSS pixels per logical unit
    this.dpr = 1; // capped device pixel ratio in use
    this.viewport = { w: 0, h: 0 }; // CSS pixels
    this.cssBox = { x: 0, y: 0, w: 0, h: 0 }; // the design column's position in CSS pixels
    this.canvasBox = { x: 0, y: 0, w: 0, h: 0 }; // the canvas element's position in CSS pixels
    this.full = { x: 0, y: 0, w: width, h: height };
    this.bleed = { left: 0, right: 0, top: 0, bottom: 0 };
    this._px = { kx: 1, ky: 1, tx: 0, ty: 0 }; // backing pixels per logical unit, and the column's offset (fill mode)

    this.resize = this.resize.bind(this);
    window.addEventListener('resize', this.resize);
    window.addEventListener('orientationchange', this.resize);
    window.visualViewport?.addEventListener('resize', this.resize);
    this.resize();
  }

  resize() {
    const vw = document.documentElement.clientWidth || window.innerWidth;
    const vh = document.documentElement.clientHeight || window.innerHeight;
    // Taller than the base shape → grow the logical height to match the screen (within maxHeight).
    this.height = Math.min(this.maxHeight, Math.max(this.baseHeight, Math.round((this.width * vh) / vw)));
    const scale = Math.min(vw / this.width, vh / this.height);
    const cssW = this.width * scale;
    const cssH = this.height * scale;
    const x = (vw - cssW) / 2;
    const y = (vh - cssH) / 2;
    const dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);

    this.viewport = { w: vw, h: vh };
    this.scale = scale;
    this.dpr = dpr;
    this.cssBox = { x, y, w: cssW, h: cssH };
    const box = this.fill ? { x: 0, y: 0, w: vw, h: vh } : this.cssBox;
    this.canvasBox = box;

    const style = this.canvas.style;
    style.position = 'absolute';
    style.left = `${box.x}px`;
    style.top = `${box.y}px`;
    style.width = `${box.w}px`;
    style.height = `${box.h}px`;

    const bw = Math.max(1, Math.round(box.w * dpr));
    const bh = Math.max(1, Math.round(box.h * dpr));
    if (this.canvas.width !== bw || this.canvas.height !== bh) {
      this.canvas.width = bw;
      this.canvas.height = bh;
    }
    if (this.fill) {
      // The column starts on a whole backing pixel, so sprites drawn on whole pixels stay sharp.
      const kx = (bw * scale) / box.w;
      const ky = (bh * scale) / box.h;
      const tx = Math.round(((x - box.x) * bw) / box.w);
      const ty = Math.round(((y - box.y) * bh) / box.h);
      this._px = { kx, ky, tx, ty };
      this.full = { x: -tx / kx, y: -ty / ky, w: bw / kx, h: bh / ky };
      this.bleed = { left: tx / kx, top: ty / ky, right: bw / kx - tx / kx - this.width, bottom: bh / ky - ty / ky - this.height };
    } else {
      this._px = { kx: bw / this.width, ky: bh / this.height, tx: 0, ty: 0 };
      this.full = { x: 0, y: 0, w: this.width, h: this.height };
      this.bleed = { left: 0, right: 0, top: 0, bottom: 0 };
    }
    this.bus?.emit('renderer:resize', this);
  }

  // Real screen (backing-store) pixels per logical unit. Sprite caches size their copies with this.
  get pixelScale() {
    return this.fill ? this._px.kx : this.canvas.width / this.width;
  }

  // Call at the start of each frame: clears, then sets the transform so drawing uses logical units.
  begin(clearColor = '#000') {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = clearColor;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    if (this.fill) ctx.setTransform(this._px.kx, 0, 0, this._px.ky, this._px.tx, this._px.ty);
    else ctx.setTransform(this.canvas.width / this.width, 0, 0, this.canvas.height / this.height, 0, 0);
    return ctx;
  }

  // Page (client) coordinates → logical coordinates. Uses the live bounding box so it stays exact.
  toLogical(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const f = this.full;
    return {
      x: f.x + ((clientX - rect.left) / rect.width) * f.w,
      y: f.y + ((clientY - rect.top) / rect.height) * f.h,
    };
  }

  // Logical → page (client) coordinates. Handy for tests and DOM overlays.
  toClient(x, y) {
    const rect = this.canvas.getBoundingClientRect();
    const f = this.full;
    return {
      x: rect.left + ((x - f.x) / f.w) * rect.width,
      y: rect.top + ((y - f.y) / f.h) * rect.height,
    };
  }
}
