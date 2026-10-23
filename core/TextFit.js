// Long words never overflow (any series game; RACEWORKS Milestone 29). A canvas fillText / strokeText given a maxWidth
// normally squashes the letters to fit, however long the text — a long team or staff name becomes unreadable. After
// installTextFit(ctx) a text a little too wide is still squashed (up to `squash`, e.g. 0.88 = at most 12 % narrower), and
// a text wider than that is cut with an ellipsis "…" so what is left reads at (nearly) its real width.
//   installTextFit(ctx, { squash = 0.88 })   once, on the game's main canvas context (offscreen caches are untouched)
//   fitText(ctx, str, maxWidth, squash)      the text as it would be drawn (tests, or a screen that wants to know)
// Texts with no maxWidth are drawn as they are.
const ELL = '…';

export function fitText(ctx, str, maxWidth, squash = 0.88, measure = null) {
  const s = String(str ?? '');
  if (!(maxWidth > 0) || !s) return s;
  const m = measure ?? ((t) => ctx.measureText(t).width);
  const limit = maxWidth / squash; // the widest a text may be before it is cut
  if (m(s) <= limit) return s;
  // Binary search for the longest start that fits with the ellipsis (cut at a character, trim a trailing space / dot).
  const chars = [...s];
  let lo = 0;
  let hi = chars.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (m(chars.slice(0, mid).join('').trimEnd() + ELL) <= limit) lo = mid;
    else hi = mid - 1;
  }
  return lo ? chars.slice(0, lo).join('').replace(/[\s·,.:;–—-]+$/u, '') + ELL : ELL;
}

export function installTextFit(ctx, { squash = 0.88 } = {}) {
  if (!ctx || ctx.__textFit) return ctx;
  const fill = ctx.fillText.bind(ctx);
  const stroke = ctx.strokeText.bind(ctx);
  const measure = (t) => ctx.measureText(t).width;
  ctx.fillText = (s, x, y, maxWidth) => (maxWidth == null ? fill(s, x, y) : fill(fitText(ctx, s, maxWidth, squash, measure), x, y, maxWidth));
  ctx.strokeText = (s, x, y, maxWidth) => (maxWidth == null ? stroke(s, x, y) : stroke(fitText(ctx, s, maxWidth, squash, measure), x, y, maxWidth));
  ctx.__textFit = { squash };
  return ctx;
}
