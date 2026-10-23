// The new-game setup and save-slot pictures (BOTWORKS Milestone 25b; every series game). Until the painted art exists
// each one is drawn in code in the cream/orange style; pass the art key and, once that picture has loaded
// (assets.loadOptional), the painted version is drawn instead — no code change.
//   drawDice(ctx, assets, r, { art, color })                     the shared "Random" die
//   drawBadge(ctx, assets, r, { art, color, title, sub })        a blank company badge / workshop sign, words in code
//   drawSelectFrame(ctx, assets, r, { art, on, color })          the highlight frame round a picked portrait
//   drawSlotFrame(ctx, assets, r, { art, state, color })         a save-slot card: 'filled', 'empty', 'bad', 'locked'
import { THEME, font, tint, shade } from '../Theme.js';

const C = THEME.color;
const ready = (assets, key) => !!key && assets?.has?.(key);

function round(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

export function drawDice(ctx, assets, r, { art = null, color = C.progress } = {}) {
  if (ready(assets, art)) return assets.drawContained(ctx, art, r);
  const s = Math.min(r.w, r.h) * 0.86;
  const x = r.x + (r.w - s) / 2;
  const y = r.y + (r.h - s) / 2;
  ctx.save();
  // a soft shadow, the die, then its pips (a five)
  ctx.fillStyle = C.shade;
  round(ctx, x + s * 0.06, y + s * 0.08, s, s, s * 0.22);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = C.outline;
  ctx.lineWidth = Math.max(3, s * 0.07);
  round(ctx, x, y, s, s, s * 0.22);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color;
  const pip = s * 0.1;
  for (const [px, py] of [[0.28, 0.28], [0.72, 0.28], [0.5, 0.5], [0.28, 0.72], [0.72, 0.72]]) {
    ctx.beginPath();
    ctx.arc(x + s * px, y + s * py, pip, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function drawBadge(ctx, assets, r, { art = null, color = C.action, title = '', sub = '' } = {}) {
  ctx.save();
  if (ready(assets, art)) assets.drawContained(ctx, art, r);
  else {
    // a hanging workshop sign: two chains, a plank in the company colour with a cream face
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 6;
    for (const fx of [0.2, 0.8]) {
      ctx.beginPath();
      ctx.moveTo(r.x + r.w * fx, r.y);
      ctx.lineTo(r.x + r.w * fx, r.y + r.h * 0.16);
      ctx.stroke();
    }
    const b = { x: r.x, y: r.y + r.h * 0.14, w: r.w, h: r.h * 0.86 };
    ctx.fillStyle = C.shade;
    round(ctx, b.x + 8, b.y + 12, b.w, b.h, 30);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 6;
    round(ctx, b.x, b.y, b.w, b.h, 30);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = tint(color, 0.82);
    round(ctx, b.x + 22, b.y + 22, b.w - 44, b.h - 44, 20);
    ctx.fill();
    ctx.strokeStyle = shade(color, 0.25);
    ctx.lineWidth = 4;
    ctx.stroke();
    // bolts in the corners
    ctx.fillStyle = shade(color, 0.3);
    for (const [bx, by] of [[b.x + 11, b.y + 11], [b.x + b.w - 11, b.y + 11], [b.x + 11, b.y + b.h - 11], [b.x + b.w - 11, b.y + b.h - 11]]) {
      ctx.beginPath();
      ctx.arc(bx, by, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // the words are always drawn by the game (no text in art)
  const face = { x: r.x + 40, y: r.y + r.h * 0.14 + 30, w: r.w - 80, h: r.h * 0.86 - 60 };
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = C.text;
  const big = Math.min(THEME.size.title, Math.max(THEME.size.body, face.h * 0.34));
  ctx.font = font(big, true);
  ctx.fillText(String(title), face.x + face.w / 2, face.y + face.h * (sub ? 0.4 : 0.5), face.w);
  if (sub) {
    ctx.font = font(THEME.size.small);
    ctx.fillStyle = C.textMuted;
    ctx.fillText(String(sub), face.x + face.w / 2, face.y + face.h * 0.78, face.w);
  }
  ctx.restore();
}

export function drawSelectFrame(ctx, assets, r, { art = null, on = false, color = C.action } = {}) {
  if (!on) return;
  if (ready(assets, art)) return assets.drawContained(ctx, art, { x: r.x - 12, y: r.y - 12, w: r.w + 24, h: r.h + 24 });
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 10;
  round(ctx, r.x - 6, r.y - 6, r.w + 12, r.h + 12, 30);
  ctx.stroke();
  ctx.strokeStyle = C.outline;
  ctx.lineWidth = 3;
  round(ctx, r.x - 12, r.y - 12, r.w + 24, r.h + 24, 34);
  ctx.stroke();
  // a check tab on the top-right corner
  const cx = r.x + r.w - 6;
  const cy = r.y + 6;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = C.outline;
  ctx.stroke();
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - 13, cy + 1);
  ctx.lineTo(cx - 3, cy + 11);
  ctx.lineTo(cx + 14, cy - 10);
  ctx.stroke();
  ctx.restore();
}

export function drawSlotFrame(ctx, assets, r, { art = null, state = 'filled', color = C.action } = {}) {
  if (ready(assets, art) && state !== 'locked') {
    ctx.save();
    if (state === 'empty') ctx.globalAlpha = 0.8;
    assets.drawContained(ctx, art, r);
    ctx.restore();
  } else {
    ctx.save();
    ctx.fillStyle = C.shade;
    round(ctx, r.x + 6, r.y + 10, r.w, r.h, 28);
    ctx.fill();
    ctx.fillStyle = state === 'bad' ? C.panelBad : state === 'empty' ? C.panelAlt : state === 'locked' ? C.panelDim : C.panel;
    ctx.strokeStyle = state === 'bad' ? C.bad : C.line;
    ctx.lineWidth = 4;
    round(ctx, r.x, r.y, r.w, r.h, 28);
    ctx.fill();
    if (state === 'empty') ctx.setLineDash([22, 14]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
  if (state === 'filled') {
    // the company colour down the left edge
    ctx.save();
    ctx.fillStyle = color;
    round(ctx, r.x + 12, r.y + 18, 16, r.h - 36, 8);
    ctx.fill();
    ctx.restore();
  }
}
