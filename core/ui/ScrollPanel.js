// A scrollable area of free-form content inside a screen rect.
// Draw between begin(ctx) and end(ctx) in content coordinates (0 = top of the content);
// convert taps with toContent(p). Drag inside the rect to scroll.
export class ScrollPanel {
  constructor({ getRect, contentHeight = 0 }) {
    this.getRect = getRect; // () => { x, y, w, h } in screen units
    this.contentHeight = contentHeight;
    this.scrollY = 0;
    this._drag = null;
  }

  get maxScroll() {
    return Math.max(0, this.contentHeight - this.getRect().h);
  }

  clamp() {
    this.scrollY = Math.min(Math.max(this.scrollY, 0), this.maxScroll);
  }

  contains(p) {
    const r = this.getRect();
    return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  }

  // Screen point → content point (x unchanged apart from the rect's left edge).
  toContent(p) {
    const r = this.getRect();
    return { x: p.x - r.x, y: p.y - r.y + this.scrollY };
  }

  beginDrag(p) {
    if (!this.contains({ x: p.startX ?? p.x, y: p.startY ?? p.y })) return false;
    this._drag = { id: p.id, startY: p.startY ?? p.y, startScroll: this.scrollY };
    this.drag(p);
    return true;
  }

  drag(p) {
    if (!this._drag || p.id !== this._drag.id) return;
    this.scrollY = this._drag.startScroll - (p.y - this._drag.startY);
    this.clamp();
  }

  endDrag(p) {
    if (this._drag && (!p || p.id === this._drag.id)) this._drag = null;
  }

  begin(ctx) {
    const r = this.getRect();
    this.clamp();
    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.clip();
    ctx.translate(r.x, r.y - this.scrollY);
  }

  end(ctx) {
    ctx.restore();
    if (this.maxScroll > 0) {
      const r = this.getRect();
      const barH = Math.max(60, (r.h * r.h) / this.contentHeight);
      const barY = r.y + (this.scrollY / this.maxScroll) * (r.h - barH);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(r.x + r.w - 8, barY, 6, barH);
    }
  }
}
