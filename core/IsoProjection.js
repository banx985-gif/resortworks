// 3/4 ("dollhouse", pseudo-isometric) view over a plain rectangular grid.
// Game logic, pathing and placement stay on the flat grid ("plan" space: x runs along columns,
// y along rows, in the Grid's world units). Only drawing and tapping go through this projection.
//   halfW / halfH: half the drawn width / height of one cell's diamond, in logical px.
//   origin: where the grid's (0, 0) corner lands in the projected world.
// Projected-world y grows with plan x + y, so it doubles as the draw order (further back = smaller).
export class IsoProjection {
  constructor({ tileSize, halfW, halfH, originX = 0, originY = 0 }) {
    this.tileSize = tileSize;
    this.halfW = halfW;
    this.halfH = halfH;
    this.originX = originX;
    this.originY = originY;
  }

  // Plan point → projected world point. Pass `out` to avoid making a new object.
  toWorld(px, py, out = { x: 0, y: 0 }) {
    const u = px / this.tileSize;
    const v = py / this.tileSize;
    out.x = this.originX + (u - v) * this.halfW;
    out.y = this.originY + (u + v) * this.halfH;
    return out;
  }

  // Projected world point → plan point (the floor spot under a tap).
  toPlan(wx, wy, out = { x: 0, y: 0 }) {
    const a = (wx - this.originX) / this.halfW;
    const b = (wy - this.originY) / this.halfH;
    out.x = ((a + b) / 2) * this.tileSize;
    out.y = ((b - a) / 2) * this.tileSize;
    return out;
  }

  // Projected position of a cell corner (col, row may be fractional).
  corner(col, row, out) {
    return this.toWorld(col * this.tileSize, row * this.tileSize, out);
  }

  cellCenter(col, row, out) {
    return this.corner(col + 0.5, row + 0.5, out);
  }

  // The four projected corners (top, right, bottom, left) of a w×h block of cells.
  outline(col, row, w = 1, h = 1) {
    return [this.corner(col, row), this.corner(col + w, row), this.corner(col + w, row + h), this.corner(col, row + h)];
  }

  // Draw order key for a plan point (bigger = nearer the viewer = drawn later).
  depth(px, py) {
    return px + py;
  }

  // Projected box around a cols×rows grid (without any art overhang).
  gridBounds(cols, rows) {
    const left = this.corner(0, rows).x;
    const right = this.corner(cols, 0).x;
    const top = this.corner(0, 0).y;
    const bottom = this.corner(cols, rows).y;
    return { x: left, y: top, w: right - left, h: bottom - top };
  }
}
