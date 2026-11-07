// Walking sprite sheets (Milestone 27b; the series standard, SERIES_CHIBI_SPRITES.md): a person with a filed sheet walks
// with it; everyone else keeps their role's walking picture. Sheets load the first time someone is drawn (so the first
// screen never waits for them); until then — or if one fails — the caller draws the old walker.
//   drawWalker(ctx, assets, name, { x, y, h, anim, back, mirror, t }) → true when a sheet frame was drawn
//     name: the sheet's file name without "_sheet.png" (in assets/images/cast/) · x, y: the feet · h: the figure's height ·
//     anim: 'idle' | 'walk' | 'work' | 'cheer' · back: seen from behind · mirror: facing the other way · t: seconds
// The layout: 8 columns; rows front idle (4) / walk (8) / work (6) / cheer (6), then the same four from the back. The feet
// sit at about (138, 240) in a 256 px frame; the frame size is read from the image, so smaller web copies work the same.
const COLUMNS = 8;
const ROWS = { idle: [0, 4, 4], walk: [1, 8, 10], work: [2, 6, 8], cheer: [3, 6, 8] }; // anim → [front row, frames, fps]
const BACK = 4;
const FEET = { x: 138 / 256, y: 240 / 256 };
const BODY = 220 / 256; // the figure's height in a frame (head to feet)
const state = new Map(); // key → 'loading' | 'ready' | 'failed'

export const sheetKey = (name) => `walk_${name}`;
export const sheetPath = (name, folder = 'cast') => `assets/images/${folder}/${name}_sheet.png`;
function ready(assets, name) {
  const key = sheetKey(name);
  const s = state.get(key);
  if (s === 'ready') return assets.get(key);
  if (!s && assets.loadImage) {
    state.set(key, 'loading');
    Promise.resolve(assets.loadImage(key, sheetPath(name)))
      .then((img) => state.set(key, img ? 'ready' : 'failed'))
      .catch(() => state.set(key, 'failed'));
  }
  return null;
}
export const walkerStats = () => ({ ready: [...state.values()].filter((s) => s === 'ready').length, loading: [...state.values()].filter((s) => s === 'loading').length, failed: [...state.values()].filter((s) => s === 'failed').length });

export function drawWalker(ctx, assets, name, { x, y, h, anim = 'idle', back = false, mirror = false, t = 0 }) {
  if (!name) return false;
  const img = ready(assets, name);
  const iw = img?.naturalWidth || img?.width;
  if (!iw) return false;
  const fs = iw / COLUMNS;
  const [row0, frames, fps] = ROWS[anim] ?? ROWS.idle;
  const row = row0 + (back ? BACK : 0);
  const f = Math.floor(Math.max(0, t) * fps) % frames;
  const k = h / (BODY * fs);
  ctx.save();
  ctx.translate(x, y);
  if (mirror) ctx.scale(-1, 1);
  ctx.drawImage(img, f * fs, row * fs, fs, fs, -FEET.x * fs * k, -FEET.y * fs * k, fs * k, fs * k);
  ctx.restore();
  return true;
}
