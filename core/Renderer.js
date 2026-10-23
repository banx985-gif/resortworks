// Owns the canvas. Everything draws in logical units: 1080 wide, 1920 tall at the base shape.
// The canvas is scaled uniformly to fit the window (letterboxed, never stretched)
// and its backing store uses devicePixelRatio, capped to keep phones fast.
// Tall phones (taller than 9:16): the width stays 1080 and the logical height grows (up to maxHeight),
// so the game fills the whole screen edge to edge instead of shrinking into a narrow middle strip.
// Screens must read renderer.height live (it can change on every resize).
export class Renderer {
  constructor(canvas, { width = 1080, height = 1920, maxHeight = height, maxDpr = 2, bus = null } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.width = width;
    this.height = height;
    this.baseHeight = height;
    this.maxHeight = Math.max(height, maxHeight);
    this.maxDpr = maxDpr;
    this.bus = bus;

    this.scale = 1; // CSS pixels per logical unit
    this.dpr = 1; // capped device pixel ratio in use
    this.viewport = { w: 0, h: 0 }; // CSS pixels
    this.cssBox = { x: 0, y: 0, w: 0, h: 0 }; // canvas position in CSS pixels

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

    const style = this.canvas.style;
    style.position = 'absolute';
    style.left = `${x}px`;
    style.top = `${y}px`;
    style.width = `${cssW}px`;
    style.height = `${cssH}px`;

    const bw = Math.max(1, Math.round(cssW * dpr));
    const bh = Math.max(1, Math.round(cssH * dpr));
    if (this.canvas.width !== bw || this.canvas.height !== bh) {
      this.canvas.width = bw;
      this.canvas.height = bh;
    }
    this.bus?.emit('renderer:resize', this);
  }

  // Real screen (backing-store) pixels per logical unit. Sprite caches size their copies with this.
  get pixelScale() {
    return this.canvas.width / this.width;
  }

  // Call at the start of each frame: clears, then sets the transform so drawing uses logical units.
  begin(clearColor = '#000') {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = clearColor;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.canvas.width / this.width, 0, 0, this.canvas.height / this.height, 0, 0);
    return ctx;
  }

  // Page (client) coordinates → logical coordinates. Uses the live bounding box so it stays exact.
  toLogical(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * this.width,
      y: ((clientY - rect.top) / rect.height) * this.height,
    };
  }

  // Logical → page (client) coordinates. Handy for tests and DOM overlays.
  toClient(x, y) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: rect.left + (x / this.width) * rect.width,
      y: rect.top + (y / this.height) * rect.height,
    };
  }
}
