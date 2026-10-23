// Rectangular placement grid in world space. Tiles are addressed by { col, row }.
// Tracks which tiles are blocked (walls, furniture) for placement and pathing.
export class Grid {
  constructor({ cols, rows, tileSize, x = 0, y = 0 }) {
    this.cols = cols;
    this.rows = rows;
    this.tileSize = tileSize;
    this.x = x; // world position of the grid's top-left corner
    this.y = y;
    this.blocked = new Uint8Array(cols * rows);
    this.version = 0; // bumped whenever a tile changes (core/Pathing's optional path cache reads it)
    this.pathCache = null; // optional: a Map — set it to let core/Pathing reuse paths on an unchanged grid
  }

  get width() {
    return this.cols * this.tileSize;
  }

  get height() {
    return this.rows * this.tileSize;
  }

  inBounds(col, row) {
    return col >= 0 && row >= 0 && col < this.cols && row < this.rows;
  }

  isBlocked(col, row) {
    return !this.inBounds(col, row) || this.blocked[row * this.cols + col] === 1;
  }

  isWalkable(col, row) {
    return !this.isBlocked(col, row);
  }

  setBlocked(col, row, value = true) {
    if (!this.inBounds(col, row)) return;
    const i = row * this.cols + col;
    const v = value ? 1 : 0;
    if (this.blocked[i] !== v) {
      this.blocked[i] = v;
      this.version++;
    }
  }

  blockRect(col, row, w, h, value = true) {
    for (let r = row; r < row + h; r++) for (let c = col; c < col + w; c++) this.setBlocked(c, r, value);
  }

  // True if every tile in the area is inside the grid and free.
  isAreaFree(col, row, w, h) {
    for (let r = row; r < row + h; r++) for (let c = col; c < col + w; c++) if (this.isBlocked(c, r)) return false;
    return true;
  }

  // World position of a tile's top-left corner.
  tileToWorld(col, row) {
    return { x: this.x + col * this.tileSize, y: this.y + row * this.tileSize };
  }

  tileCenter(col, row) {
    return { x: this.x + (col + 0.5) * this.tileSize, y: this.y + (row + 0.5) * this.tileSize };
  }

  // World rect covering a w×h block of tiles.
  tileRect(col, row, w = 1, h = 1) {
    const p = this.tileToWorld(col, row);
    return { x: p.x, y: p.y, w: w * this.tileSize, h: h * this.tileSize };
  }

  // Which tile holds this world point? null if outside the grid.
  worldToTile(wx, wy) {
    const col = Math.floor((wx - this.x) / this.tileSize);
    const row = Math.floor((wy - this.y) / this.tileSize);
    return this.inBounds(col, row) ? { col, row } : null;
  }

  // Which tile is under this screen point, given a Camera?
  screenToTile(camera, sx, sy) {
    const w = camera.screenToWorld(sx, sy);
    return this.worldToTile(w.x, w.y);
  }

  tileToScreen(camera, col, row) {
    const p = this.tileToWorld(col, row);
    return camera.worldToScreen(p.x, p.y);
  }

  forEachTile(fn) {
    for (let row = 0; row < this.rows; row++) for (let col = 0; col < this.cols; col++) fn(col, row);
  }
}
