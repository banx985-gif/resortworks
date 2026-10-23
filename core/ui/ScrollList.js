// Vertical list of same-height rows inside a screen rect. Drag to scroll; rows are clipped.
// The game draws each row with renderItem(ctx, item, rowRect, index).
export class ScrollList {
  constructor({ getRect, itemHeight, gap = 16, renderItem, items = [] }) {
    this.getRect = getRect; // () => { x, y, w, h } in screen units (so it follows the safe area)
    this.itemHeight = itemHeight;
    this.gap = gap;
    this.renderItem = renderItem;
    this.items = items;
    this.scrollY = 0;
    this._drag = null;
  }

  setItems(items) {
    this.items = items;
    this.clamp();
  }

  get contentHeight() {
    return Math.max(0, this.items.length * (this.itemHeight + this.gap) - this.gap);
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

  itemRect(i) {
    const r = this.getRect();
    return { x: r.x, y: r.y + i * (this.itemHeight + this.gap) - this.scrollY, w: r.w, h: this.itemHeight };
  }

  // Row under a screen point, or null (gaps and clipped parts don't count).
  itemAt(p) {
    if (!this.contains(p)) return null;
    for (let i = 0; i < this.items.length; i++) {
      const ir = this.itemRect(i);
      if (p.y >= ir.y && p.y <= ir.y + ir.h) return { item: this.items[i], index: i, rect: ir };
    }
    return null;
  }

  // Scroll so row i is fully visible.
  scrollToIndex(i) {
    const r = this.getRect();
    const top = i * (this.itemHeight + this.gap);
    if (top < this.scrollY) this.scrollY = top;
    else if (top + this.itemHeight > this.scrollY + r.h) this.scrollY = top + this.itemHeight - r.h;
    this.clamp();
  }

  // Drag handling: returns true if this list took the drag.
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

  render(ctx) {
    const r = this.getRect();
    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.clip();
    for (let i = 0; i < this.items.length; i++) {
      const ir = this.itemRect(i);
      if (ir.y + ir.h < r.y || ir.y > r.y + r.h) continue;
      this.renderItem(ctx, this.items[i], ir, i);
    }
    ctx.restore();

    if (this.maxScroll > 0) {
      const barH = Math.max(60, (r.h * r.h) / this.contentHeight);
      const barY = r.y + (this.scrollY / this.maxScroll) * (r.h - barH);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(r.x + r.w - 8, barY, 6, barH);
    }
  }
}
