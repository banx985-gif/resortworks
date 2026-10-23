// 2D camera over a world that can be bigger than the screen.
// Screen = logical canvas units (e.g. 1080×1920). World = the game's own space (e.g. the workshop floor).
// Drag to pan with beginDrag/dragTo: the world point under the finger stays under the finger.
export class Camera {
  constructor({ viewW = 1080, viewH = 1920, worldW = 1080, worldH = 1920, x = 0, y = 0, zoom = 1 } = {}) {
    this.viewW = viewW;
    this.viewH = viewH;
    this.worldW = worldW;
    this.worldH = worldH;
    this.zoom = zoom;
    this.minZoom = 0.5;
    this.maxZoom = 4;
    this.x = x; // world coordinate shown at the screen's left edge
    this.y = y; // world coordinate shown at the screen's top edge
    this._drag = null;
    this.pixelScale = 0; // real pixels per logical unit; when set, the view snaps to whole pixels (sharper sprites)
    this.viewX = 0; // where the view's top-left sits on the screen (e.g. below a header); 0,0 = full screen
    this.viewY = 0;
    this.clamp();
  }

  get visibleW() {
    return this.viewW / this.zoom;
  }

  get visibleH() {
    return this.viewH / this.zoom;
  }

  setWorld(w, h) {
    this.worldW = w;
    this.worldH = h;
    this.clamp();
  }

  setView(w, h) {
    this.viewW = w;
    this.viewH = h;
    this.clamp();
  }

  // Keep the view inside the world. If the world is smaller than the view on an axis, centre it.
  clamp() {
    this.x = Camera._clampAxis(this.x, this.worldW, this.visibleW);
    this.y = Camera._clampAxis(this.y, this.worldH, this.visibleH);
  }

  static _clampAxis(v, world, visible) {
    if (world <= visible) return (world - visible) / 2;
    return Math.min(Math.max(v, 0), world - visible);
  }

  moveTo(x, y) {
    this.x = x;
    this.y = y;
    this.clamp();
  }

  centerOn(wx, wy) {
    this.moveTo(wx - this.visibleW / 2, wy - this.visibleH / 2);
  }

  // Zoom to z (clamped to minZoom–maxZoom), keeping the world point under screen point (sx, sy) where it is —
  // so a pinch or a wheel zooms towards the fingers / pointer.
  setZoom(z, sx = this.viewX + this.viewW / 2, sy = this.viewY + this.viewH / 2) {
    const nz = Math.min(this.maxZoom, Math.max(this.minZoom, z));
    const w = this.screenToWorld(sx, sy);
    this.zoom = nz;
    this.x = w.x - (sx - this.viewX) / nz;
    this.y = w.y - (sy - this.viewY) / nz;
    this.clamp();
  }

  zoomBy(f, sx, sy) {
    this.setZoom(this.zoom * f, sx, sy);
  }

  // Move the view by a screen-space amount.
  panBy(sdx, sdy) {
    this.moveTo(this.x + sdx / this.zoom, this.y + sdy / this.zoom);
  }

  beginDrag(sx, sy) {
    this._drag = { sx, sy, camX: this.x, camY: this.y };
  }

  dragTo(sx, sy) {
    const d = this._drag;
    if (!d) return;
    this.moveTo(d.camX - (sx - d.sx) / this.zoom, d.camY - (sy - d.sy) / this.zoom);
  }

  endDrag() {
    this._drag = null;
  }

  get dragging() {
    return this._drag !== null;
  }

  screenToWorld(sx, sy) {
    return { x: (sx - this.viewX) / this.zoom + this.x, y: (sy - this.viewY) / this.zoom + this.y };
  }

  worldToScreen(wx, wy) {
    return { x: (wx - this.x) * this.zoom + this.viewX, y: (wy - this.y) * this.zoom + this.viewY };
  }

  // Wrap world drawing: camera.apply(ctx); ...draw in world units...; camera.restore(ctx);
  apply(ctx) {
    ctx.save();
    if (this.viewX || this.viewY) ctx.translate(this.viewX, this.viewY);
    ctx.scale(this.zoom, this.zoom);
    const ps = this.pixelScale * this.zoom;
    if (ps > 0) ctx.translate(Math.round(-this.x * ps) / ps, Math.round(-this.y * ps) / ps);
    else ctx.translate(-this.x, -this.y);
  }

  restore(ctx) {
    ctx.restore();
  }

  // Is a world rect at least partly on screen?
  isVisible(r) {
    return r.x < this.x + this.visibleW && r.x + r.w > this.x && r.y < this.y + this.visibleH && r.y + r.h > this.y;
  }
}
