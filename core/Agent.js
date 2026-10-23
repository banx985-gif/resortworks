// Base walker for anything that moves around a Grid (staff, customers, crew…).
// Position (x, y) is the agent's feet in world units. States: 'idle' | 'walking' | 'working'.
// Walking follows an A* path tile by tile. If there is no path, or the walk takes far too long,
// the agent is placed at the goal instead of getting stuck (pathing is flavour, never a blocker).
import { findPath } from './Pathing.js';

export class Agent {
  constructor({ id, name = '', x = 0, y = 0, speed = 240, width = 100, height = 200, noPathTeleportSec = 1 } = {}) {
    this.id = id;
    this.name = name;
    this.x = x;
    this.y = y;
    this.speed = speed; // world units per second
    this.width = width; // hit/draw box, anchored bottom-centre at the feet
    this.height = height;
    this.noPathTeleportSec = noPathTeleportSec;

    this.state = 'idle';
    this.stateTime = 0; // seconds in the current state
    this.path = []; // remaining world points to walk through
    this.goal = null; // { col, row }
    this.facing = 1; // 1 = right, -1 = left (for renderers that want it)
    this.teleports = 0; // how often the stuck fallback fired
    this._walkLimit = 0;
    this._onArrive = null;
  }

  setState(state) {
    if (this.state === state) return;
    this.state = state;
    this.stateTime = 0;
  }

  placeAtTile(grid, col, row) {
    const c = grid.tileCenter(col, row);
    this.x = c.x;
    this.y = c.y;
    this.path = [];
  }

  tile(grid) {
    return grid.worldToTile(this.x, this.y);
  }

  // Start walking to a tile. onArrive(agent) is called once on arrival.
  walkTo(grid, col, row, onArrive = null) {
    this.goal = { col, row };
    this._onArrive = onArrive;
    const start = this.tile(grid);
    const tiles = start ? findPath(grid, start, this.goal) : null;
    this.setState('walking');
    this.stateTime = 0; // a new walk gets its own time limit, even if it replaces one still under way (CAREWORKS M2)

    if (!tiles) {
      this.path = [];
      this._walkLimit = this.noPathTeleportSec;
      return false;
    }
    this.path = tiles.map((t) => grid.tileCenter(t.col, t.row));
    // Also walk the last little bit to the goal tile centre if we are mid-tile.
    if (!this.path.length) this.path.push(grid.tileCenter(col, row));
    const dist = this.path.length * grid.tileSize + grid.tileSize;
    this._walkLimit = (dist / this.speed) * 2 + 2;
    return true;
  }

  update(dt, grid) {
    this.stateTime += dt;
    if (this.state !== 'walking') return;

    let budget = this.speed * dt;
    while (budget > 0 && this.path.length) {
      const p = this.path[0];
      const dx = p.x - this.x;
      const dy = p.y - this.y;
      const d = Math.hypot(dx, dy);
      if (Math.abs(dx) > 0.01) this.facing = dx > 0 ? 1 : -1;
      if (d <= budget) {
        this.x = p.x;
        this.y = p.y;
        this.path.shift();
        budget -= d;
      } else {
        this.x += (dx / d) * budget;
        this.y += (dy / d) * budget;
        budget = 0;
      }
    }

    if (!this.path.length && this._atGoal(grid)) {
      this._arrive();
    } else if (this.stateTime > this._walkLimit) {
      // Stuck or no path: put the agent where it needs to be.
      this.teleports++;
      this.placeAtTile(grid, this.goal.col, this.goal.row);
      this._arrive();
    }
  }

  _atGoal(grid) {
    const c = grid.tileCenter(this.goal.col, this.goal.row);
    return Math.abs(c.x - this.x) < 0.5 && Math.abs(c.y - this.y) < 0.5;
  }

  _arrive() {
    this.path = [];
    this.setState('idle');
    const cb = this._onArrive;
    this._onArrive = null;
    cb?.(this);
  }

  // World rect used for drawing and tapping.
  getBounds() {
    return { x: this.x - this.width / 2, y: this.y - this.height, w: this.width, h: this.height };
  }

  // Draw order: things lower on screen are in front.
  get sortY() {
    return this.y;
  }
}
