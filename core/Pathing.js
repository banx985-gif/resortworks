// A* path finding on a Grid. 4-way moves by default; diagonals optional (never cut blocked corners).
// Returns the tiles to walk through, NOT including the start tile, ending on the goal.
// Returns [] if already there, or null if there is no way to reach the goal.
// Optional cache (CAREWORKS M28): when grid.pathCache is a Map, a path already found on the same grid version is handed
// back as a fresh copy (A* is deterministic, so the result is exactly what a new search would find). Grids without one
// behave as before. grid.pathCacheMax (default 4000) entries at most; the cache empties when full.
export function findPath(grid, start, goal, opts = {}) {
  const cache = grid.pathCache;
  if (!cache) return search(grid, start, goal, opts);
  const key = `${grid.version ?? 0}|${start.col},${start.row}|${goal.col},${goal.row}|${opts.allowDiagonal ? 1 : 0}|${opts.maxIterations ?? 10000}`;
  let hit = cache.get(key);
  if (hit === undefined) {
    if (cache.size >= (grid.pathCacheMax ?? 4000)) cache.clear();
    hit = search(grid, start, goal, opts);
    cache.set(key, hit && hit.map((t) => ({ ...t })));
  }
  return hit && hit.map((t) => ({ ...t }));
}
function search(grid, start, goal, { allowDiagonal = false, maxIterations = 10000 } = {}) {
  if (!grid.inBounds(start.col, start.row) || grid.isBlocked(goal.col, goal.row)) return null;
  if (start.col === goal.col && start.row === goal.row) return [];

  const cols = grid.cols;
  const size = cols * grid.rows;
  const startIdx = start.row * cols + start.col;
  const goalIdx = goal.row * cols + goal.col;

  const g = new Float64Array(size).fill(Infinity);
  const cameFrom = new Int32Array(size).fill(-1);
  const closed = new Uint8Array(size);
  const open = new MinHeap();

  const h = (col, row) => {
    const dx = Math.abs(col - goal.col);
    const dy = Math.abs(row - goal.row);
    return allowDiagonal ? Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy) : dx + dy;
  };

  const dirs = allowDiagonal ? DIRS_8 : DIRS_4;
  g[startIdx] = 0;
  open.push(startIdx, h(start.col, start.row));

  let iterations = 0;
  while (open.size && iterations++ < maxIterations) {
    const cur = open.pop();
    if (cur === goalIdx) return rebuild(cameFrom, goalIdx, startIdx, cols);
    if (closed[cur]) continue;
    closed[cur] = 1;

    const cc = cur % cols;
    const cr = (cur - cc) / cols;
    for (const [dx, dy, cost] of dirs) {
      const nc = cc + dx;
      const nr = cr + dy;
      if (grid.isBlocked(nc, nr)) continue;
      if (dx && dy && (grid.isBlocked(cc + dx, cr) || grid.isBlocked(cc, cr + dy))) continue;
      const ni = nr * cols + nc;
      if (closed[ni]) continue;
      const ng = g[cur] + cost;
      if (ng < g[ni]) {
        g[ni] = ng;
        cameFrom[ni] = cur;
        open.push(ni, ng + h(nc, nr));
      }
    }
  }
  return null;
}

const DIRS_4 = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
];
const DIRS_8 = [...DIRS_4, [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];

function rebuild(cameFrom, goalIdx, startIdx, cols) {
  const out = [];
  for (let i = goalIdx; i !== startIdx; i = cameFrom[i]) {
    const col = i % cols;
    out.push({ col, row: (i - col) / cols });
  }
  return out.reverse();
}

// Small binary heap keyed by priority.
class MinHeap {
  constructor() {
    this.items = [];
    this.prio = [];
  }

  get size() {
    return this.items.length;
  }

  push(item, p) {
    const a = this.items;
    const pr = this.prio;
    let i = a.length;
    a.push(item);
    pr.push(p);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (pr[parent] <= pr[i]) break;
      [a[i], a[parent]] = [a[parent], a[i]];
      [pr[i], pr[parent]] = [pr[parent], pr[i]];
      i = parent;
    }
  }

  pop() {
    const a = this.items;
    const pr = this.prio;
    const top = a[0];
    const lastItem = a.pop();
    const lastPrio = pr.pop();
    if (a.length) {
      a[0] = lastItem;
      pr[0] = lastPrio;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && pr[l] < pr[m]) m = l;
        if (r < a.length && pr[r] < pr[m]) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        [pr[i], pr[m]] = [pr[m], pr[i]];
        i = m;
      }
    }
    return top;
  }
}
