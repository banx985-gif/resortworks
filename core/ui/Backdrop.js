// A full-bleed backdrop picture (SERIES_SCREEN_FILL_AND_BACKDROPS, RACEWORKS Milestone 32): drawn behind everything,
// scaled to COVER its box — it fills it, crops the edges, never stretches and never shows bars. Used behind the splash /
// main menu (the title picture) and behind the in-game world (the scenery picture). Opt-in: a game that never makes one
// is unchanged.
//
// The picture is optional art: until the file exists, has() is false and draw() returns false — the game draws exactly
// what it drew before. The moment the file is there it is used, with no code change (loaded quietly: no warning, no
// placeholder box). Pictures only — never draw scenery in code.
//
//   const bd = createBackdrop({ assets, key, src, reducedMotion: () => bool, drift = { px: 18, secs: 40 } })
//   bd.load()                 → Promise (core/AssetManager.loadOptional): asks for the file once
//   bd.has()                  the picture is in
//   bd.update(dt)             the slow drift's clock (it only moves when Reduced motion is off)
//   bd.draw(ctx, rect, { shiftX, shiftY, focusX, focusY, zoom })  → true if drawn
//       rect      the box to cover (e.g. renderer.full: the whole screen to the real edges)
//       shiftX/Y  a parallax offset in logical units (e.g. a world camera's pan × 0.15); it is kept inside the
//                 picture's spare margin, so an edge never shows
//       focusX/Y  which part of the picture stays in view when it is cropped (0–1, 0.5 = the middle)
//       zoom      ≥ 1, extra scale for margin (drift and parallax need some room)
//   coverRect(imgW, imgH, rect, opts) → { x, y, w, h } where the picture goes (pure, for tests)

export function coverRect(imgW, imgH, rect, { shiftX = 0, shiftY = 0, focusX = 0.5, focusY = 0.5, zoom = 1 } = {}) {
  const s = Math.max(rect.w / imgW, rect.h / imgH) * Math.max(1, zoom);
  const w = imgW * s;
  const h = imgH * s;
  const spareX = w - rect.w; // ≥ 0: how much of the picture is cropped away
  const spareY = h - rect.h;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const x = rect.x - clamp(spareX * focusX - shiftX, 0, spareX);
  const y = rect.y - clamp(spareY * focusY - shiftY, 0, spareY);
  return { x, y, w, h };
}

export function createBackdrop({ assets, key, src, reducedMotion = () => false, drift = { px: 18, secs: 40 } }) {
  let t = 0;
  let asked = null;
  return {
    key,
    src,
    load() {
      asked ??= assets.loadOptional(key, src);
      return asked;
    },
    has: () => assets.has(key),
    update(dt) {
      t += dt;
    },
    draw(ctx, rect, { shiftX = 0, shiftY = 0, focusX = 0.5, focusY = 0.5, zoom = 1.04 } = {}) {
      const img = assets.get(key);
      if (!img) return false;
      const moving = drift && !reducedMotion();
      const dx = moving ? Math.sin((t / drift.secs) * Math.PI * 2) * drift.px : 0;
      const dy = moving ? Math.cos((t / drift.secs) * Math.PI * 2) * drift.px * 0.4 : 0;
      const r = coverRect(img.naturalWidth, img.naturalHeight, rect, { shiftX: shiftX + dx, shiftY: shiftY + dy, focusX, focusY, zoom: moving ? Math.max(zoom, 1.04) : zoom });
      ctx.save();
      ctx.beginPath();
      ctx.rect(rect.x, rect.y, rect.w, rect.h);
      ctx.clip();
      // (drawn through the asset manager: one screen-sized copy, cached; it stays the same size while it drifts)
      assets.draw(ctx, key, r.x, r.y, r.w, r.h);
      ctx.restore();
      return true;
    },
  };
}
