// A picture of something that rarely changes (e.g. the floor and walls), drawn once into an
// offscreen canvas and copied to the screen each frame (bible §40.1). Call invalidate() when the
// layout changes; a pixel-scale change (resize) also triggers a redraw.
//   draw(g) paints in logical units inside a width×height box.
// GOALWORKS Milestone 12b: a canvas loss (core/CanvasLoss) marks it dirty, so it is drawn again instead of staying blank.
import { onCanvasLoss, watchCanvas } from './CanvasLoss.js';

export class CachedLayer {
  constructor({ width, height, draw }) {
    this.width = width;
    this.height = height;
    this.drawFn = draw;
    this.pixelScale = 1;
    this.canvas = null;
    this.dirty = true;
    this.rebuilds = 0; // how many times it has been redrawn (for checks)
    onCanvasLoss(this, (l) => (l.dirty = true));
  }

  invalidate() {
    this.dirty = true;
  }

  // DEVWORKS Milestone 39: give the offscreen canvas back (leaving the screen); the next render draws it again.
  release() {
    if (this.canvas) {
      this.canvas.width = 0;
      this.canvas.height = 0;
    }
    this.canvas = null;
    this.dirty = true;
  }

  resize(width, height) {
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.dirty = true;
  }

  setPixelScale(scale) {
    if (!(scale > 0) || Math.abs(scale - this.pixelScale) < 1e-4) return;
    this.pixelScale = scale;
    this.dirty = true;
  }

  rebuild() {
    const ps = this.pixelScale;
    const c = this.canvas || watchCanvas(document.createElement('canvas'));
    c.width = Math.max(1, Math.round(this.width * ps));
    c.height = Math.max(1, Math.round(this.height * ps));
    const g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, c.width, c.height);
    g.setTransform(c.width / this.width, 0, 0, c.height / this.height, 0, 0);
    this.drawFn(g);
    this.canvas = c;
    this.dirty = false;
    this.rebuilds++;
  }

  render(ctx, x = 0, y = 0) {
    if (this.dirty || !this.canvas) this.rebuild();
    ctx.drawImage(this.canvas, x, y, this.width, this.height);
  }

  // Only the part of the layer inside view ({ x, y, w, h } in the layer's own units, e.g. a camera's visible world
  // rect), drawn where it belongs — the layer sits at (0, 0). A big layer seen through a zoomed-in camera then costs
  // only what is on screen (CAREWORKS Milestone 3: a whole 2400 px floor drawn every frame held a tablet to ~33 fps).
  renderView(ctx, view) {
    if (this.dirty || !this.canvas) this.rebuild();
    const x0 = Math.max(0, Math.floor(view.x));
    const y0 = Math.max(0, Math.floor(view.y));
    const x1 = Math.min(this.width, Math.ceil(view.x + view.w));
    const y1 = Math.min(this.height, Math.ceil(view.y + view.h));
    if (x1 <= x0 || y1 <= y0) return;
    const kx = this.canvas.width / this.width;
    const ky = this.canvas.height / this.height;
    ctx.drawImage(this.canvas, x0 * kx, y0 * ky, (x1 - x0) * kx, (y1 - y0) * ky, x0, y0, x1 - x0, y1 - y0);
  }
}
