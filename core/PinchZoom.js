// Two-finger pinch on a Camera (any game): feed it the pointer drags the screen receives; while two fingers are
// down it zooms around their midpoint and pans with it, and says so (the screen then skips its own one-finger pan).
//   pinch.down(id, x, y) · pinch.move(id, x, y) → true while pinching · pinch.up(id)
export class PinchZoom {
  constructor(camera) {
    this.camera = camera;
    this.points = new Map(); // id → { x, y }
    this.last = null; // { dist, mx, my }
  }

  get active() {
    return this.points.size >= 2;
  }

  down(id, x, y) {
    this.points.set(id, { x, y });
    this.last = this.active ? this._measure() : null;
  }

  move(id, x, y) {
    const p = this.points.get(id);
    if (!p) return this.active;
    p.x = x;
    p.y = y;
    if (!this.active) return false;
    const m = this._measure();
    if (this.last && this.last.dist > 1) {
      this.camera.zoomBy(m.dist / this.last.dist, m.mx, m.my);
      this.camera.panBy(this.last.mx - m.mx, this.last.my - m.my);
    }
    this.last = m;
    return true;
  }

  up(id) {
    this.points.delete(id);
    this.last = this.active ? this._measure() : null;
  }

  _measure() {
    const [a, b] = [...this.points.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  }
}
