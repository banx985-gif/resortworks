// Canvas loss (GOALWORKS Milestone 12b; any series game). A phone's browser keeps canvases in GPU memory; when the GPU
// process runs short of memory (or restarts) every canvas made in code is wiped — the screen's own canvas is simply drawn
// again next frame, but a cached copy (a sprite cache size, a cached floor, a kit-tinted body) stays blank for good
// unless someone makes it again. That is how whole facilities, bodies and the ball "vanished" on Aaron's phone.
// This module notices the loss and tells every cache to start again; the caches remake their copies on the next draw.
//
//   watchCanvasLoss(canvas, { pollSec = 1 })   once at boot with the game's screen canvas: listens for the browser's
//                                              contextlost / contextrestored events on it and on a small canary canvas,
//                                              and checks isContextLost() now and then (browsers that miss an event)
//   onCanvasLoss(owner, fn)                    fn(owner, reason) on every loss; owner is held weakly (a cache that is
//                                              thrown away stops being told) — returns an unsubscribe function
//   watchCanvas(canvas)                        any canvas made in code: its own contextlost counts as a loss too
//   canvasLost(reason)                         tells everyone now (tests: wipe some copies, then call this)
//   canvasLossCount()                          how many losses so far (debug / tests)
const subs = new Set(); // { ref: WeakRef | { deref }, fn }
let count = 0;
let lastAt = -1e9;
const now = () => globalThis.performance?.now?.() ?? Date.now();

export function onCanvasLoss(owner, fn) {
  const ref = typeof WeakRef === 'function' && owner && typeof owner === 'object' ? new WeakRef(owner) : { deref: () => owner };
  const sub = { ref, fn };
  subs.add(sub);
  return () => subs.delete(sub);
}

export function canvasLost(reason = 'lost') {
  count++;
  lastAt = now();
  for (const s of [...subs]) {
    const o = s.ref.deref();
    if (o === undefined) {
      subs.delete(s);
      continue;
    }
    try {
      s.fn(o, reason);
    } catch (err) {
      console.error('[CanvasLoss] a cache failed to reset', err);
    }
  }
}

export const canvasLossCount = () => count;

// Several canvases report the same loss within a moment: one reset each for 'lost' and for 'restored' is enough.
function report(reason) {
  if (reason === 'canvas' && now() - lastAt < 250) return;
  canvasLost(reason);
}

export function watchCanvas(c) {
  if (!c?.addEventListener || c.__lossWatched) return c;
  c.__lossWatched = true;
  c.addEventListener('contextlost', () => report('canvas'));
  return c;
}

export function watchCanvasLoss(canvas, { pollSec = 1 } = {}) {
  if (typeof document === 'undefined') return null;
  const canary = document.createElement('canvas');
  canary.width = canary.height = 4;
  const watched = [canvas, canary].filter(Boolean).map((c) => ({ c, g: c.getContext?.('2d') ?? null, lost: false }));
  for (const w of watched) {
    w.c.addEventListener?.('contextlost', () => {
      w.lost = true;
      report('lost');
    });
    w.c.addEventListener?.('contextrestored', () => {
      w.lost = false;
      report('restored');
    });
  }
  const timer = setInterval(() => {
    for (const w of watched) {
      const lost = !!w.g?.isContextLost?.();
      if (lost === w.lost) continue;
      w.lost = lost;
      report(lost ? 'lost' : 'restored');
    }
  }, pollSec * 1000);
  return { stop: () => clearInterval(timer) };
}
