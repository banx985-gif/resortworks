// Picks the top selectable thing under a world point, and remembers what is selected.
// An item needs either hitTest(wx, wy) or getBounds() → {x, y, w, h}, and optionally sortY
// (higher sortY = drawn later = on top). Emits 'selection:change' { selected, previous } on the bus.
// Taps only: callers feed this from 'input:tap', which the Input module never fires after a drag.
// For a projected view (e.g. IsoProjection) pass boundsOf(item) and depthOf(item) to use drawn
// positions instead of the items' own getBounds()/sortY.
export class Selection {
  constructor(bus = null, { minHitSize = 72, boundsOf = null, depthOf = null } = {}) {
    this.bus = bus;
    this.boundsOf = boundsOf;
    this.depthOf = depthOf;
    this.minHitSize = minHitSize; // small things get a bigger invisible hit box (touch friendly)
    this.items = [];
    this.selected = null;
  }

  add(item) {
    if (!this.items.includes(item)) this.items.push(item);
    return item;
  }

  remove(item) {
    this.items = this.items.filter((i) => i !== item);
    if (this.selected === item) this.select(null);
  }

  hits(item, wx, wy) {
    if (item.selectable === false) return false;
    if (item.hitTest) return item.hitTest(wx, wy);
    const b = this.boundsOf ? this.boundsOf(item) : item.getBounds();
    const padX = Math.max(0, (this.minHitSize - b.w) / 2);
    const padY = Math.max(0, (this.minHitSize - b.h) / 2);
    return wx >= b.x - padX && wx <= b.x + b.w + padX && wy >= b.y - padY && wy <= b.y + b.h + padY;
  }

  // Top-most item under the point, or null.
  pick(wx, wy) {
    let best = null;
    let bestY = -Infinity;
    for (const item of this.items) {
      if (!this.hits(item, wx, wy)) continue;
      const y = this.depthOf ? this.depthOf(item) : (item.sortY ?? 0);
      if (y >= bestY) {
        best = item;
        bestY = y;
      }
    }
    return best;
  }

  // Select whatever is under the point; empty space clears the selection.
  handleTap(wx, wy) {
    const item = this.pick(wx, wy);
    this.select(item);
    return item;
  }

  select(item) {
    if (item === this.selected) return;
    const previous = this.selected;
    this.selected = item;
    this.bus?.emit('selection:change', { selected: item, previous });
  }

  clear() {
    this.select(null);
  }
}
