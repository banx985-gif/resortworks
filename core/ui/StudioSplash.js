// The studio splash (any series game): the Banx Gamex logo on its dark background for a moment on every launch, then
// it fades into the game's own splash. A tap skips it (the fade still plays, quicker). The game loads the logo itself
// (prepare) and draws the screen underneath the fade (drawNext), so the two splashes blend with no black gap.
//
//   createStudioSplash({ renderer, assets, key, prepare: () => Promise, drawNext: (ctx) => void, onDone,
//                        seconds = 1.5, fadeIn = 0.25, fadeOut = 0.4, waitForArt = 2.5, bg = '#000' })
//     key        the logo's asset key (drawn as large as fits the screen width, centred)
//     prepare    loads the logo; the timer starts once it is in. No logo after waitForArt s (or it failed): skipped.
//   The time counts update(dt) — frames actually drawn — so a launch stall (art decoding) never eats the logo unseen.
//   A router screen: enter · update · render · onTap · onBack. Read-only extras: shown (the logo is up), done.

export function createStudioSplash({ renderer, assets, key, prepare = async () => {}, drawNext = null, onDone, seconds = 1.5, fadeIn = 0.25, fadeOut = 0.4, waitForArt = 2.5, bg = '#000' }) {
  let t = 0;
  let shownAt = null; // when the logo was ready
  let outAt = null; // when the fade into the next screen began
  let outLength = fadeOut;
  let done = false;
  let started = false;

  function leave(quick = false) {
    if (outAt != null || done) return;
    outAt = t;
    outLength = quick ? Math.min(fadeOut, 0.25) : fadeOut;
    if (!assets.has(key)) outLength = 0; // nothing on screen to fade
  }

  return {
    get shown() {
      return shownAt != null;
    },
    get done() {
      return done;
    },
    enter() {
      if (started) return;
      started = true;
      t = 0;
      Promise.resolve()
        .then(prepare)
        .catch((err) => console.warn('[studio splash]', err))
        .then(() => {
          if (outAt != null) return;
          if (assets.has(key)) shownAt = t;
          else leave();
        });
    },
    update(dt) {
      t += dt; // the fixed-step loop's dt (it already caps a long frame)
      if (done) return;
      if (outAt == null && shownAt == null && t > waitForArt) leave(); // the logo is taking too long: straight on
      if (outAt == null && shownAt != null && t - shownAt >= fadeIn + seconds) leave();
      if (outAt != null && t - outAt >= outLength) {
        done = true;
        onDone();
      }
    },
    onTap() {
      leave(true);
      return true;
    },
    onBack: () => true, // nothing behind it
    render(ctx) {
      const W = renderer.width;
      const H = renderer.height;
      let alpha = 1;
      if (outAt != null) {
        drawNext?.(ctx);
        alpha = outLength > 0 ? Math.max(0, 1 - (t - outAt) / outLength) : 0;
        if (alpha <= 0) return;
      }
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
      if (shownAt != null && assets.has(key)) {
        ctx.globalAlpha = alpha * Math.min(1, fadeIn > 0 ? (t - shownAt) / fadeIn : 1);
        const aspect = assets.aspect(key) || 1.5; // width / height
        const w = Math.min(W, H * aspect);
        const h = w / aspect;
        assets.draw(ctx, key, (W - w) / 2, (H - h) / 2, w, h);
      }
      ctx.restore();
    },
  };
}
