// Code-drawn pieces for the menus, the slot cards and Resort Setup (Milestone 0). The Founder portraits are the
// Founder's own staff art (a head-and-shoulders crop; a code-drawn head only while it loads); the dice and the sign
// come from the shared core/ui/SetupArt.
//   faceCrop(assets, founder)                    the crop (fractions of the picture) round the Founder's face, or null
//   drawPortrait(ctx, r, founder, ring, assets)  the Founder's face in a framed square
//   drawSign(ctx, assets, r, name, palette, sub) the resort sign in the palette colour (words drawn by code)
//   diceButton(ctx, assets, r, label, opts)      a button with the Random die beside its label
//   accentStrip(ctx, r, palette)                 the palette strip down a slot card's left edge
import { THEME, font } from '../../../../core/Theme.js';
import { drawButton } from '../../../../core/ui/Button.js';
import { drawDice, drawBadge } from '../../../../core/ui/SetupArt.js';
import { ROLES } from '../../data/setup.js';

const C = THEME.color;

export function faceCrop(assets, founder) {
  const img = founder && assets?.get(founder.art);
  if (!img?.naturalWidth) return null;
  const side = founder.face.size * img.naturalHeight; // a square, in picture pixels
  const w = Math.min(1, side / img.naturalWidth);
  const h = (w * img.naturalWidth) / img.naturalHeight;
  const x = Math.max(0, Math.min(1 - w, founder.face.cx - w / 2));
  return { x, y: 0, w, h };
}

export function drawPortrait(ctx, r, founder, ring = null, assets = null) {
  ctx.save();
  ctx.fillStyle = C.panelAlt;
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, 22);
  ctx.fill();
  if (ring) {
    ctx.strokeStyle = ring;
    ctx.lineWidth = 6;
    ctx.stroke();
  }
  ctx.clip();
  const crop = faceCrop(assets, founder);
  if (crop) assets.drawCrop(ctx, founder.art, crop, r);
  else if (founder) drawStandIn(ctx, r, founder);
  ctx.restore();
}

// While the portrait loads: skin, hair, a tunic in the role colour.
function drawStandIn(ctx, r, founder) {
  const s = r.w;
  const cx = r.x + s / 2;
  ctx.fillStyle = ROLES[founder.role].colour;
  ctx.strokeStyle = C.outline;
  ctx.lineWidth = Math.max(3, s * 0.025);
  ctx.beginPath();
  ctx.ellipse(cx, r.y + r.h * 1.02, s * 0.42, r.h * 0.34, 0, Math.PI, 0);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = founder.skin;
  ctx.beginPath();
  ctx.arc(cx, r.y + r.h * 0.42, s * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = founder.hair;
  ctx.beginPath();
  ctx.arc(cx, r.y + r.h * 0.39, s * 0.21, Math.PI * 1.05, Math.PI * 1.95);
  ctx.closePath();
  ctx.fill();
}

export function drawSign(ctx, assets, r, name, palette, sub = '') {
  drawBadge(ctx, assets, r, { color: palette.hex, title: name || 'Your Resort', sub });
}

export function diceButton(ctx, assets, r, label, opts = {}) {
  drawButton(ctx, r, '', opts);
  ctx.save();
  ctx.font = opts.font ?? font(THEME.size.button, true);
  const tw = label ? Math.min(ctx.measureText(label).width, r.w - 110) : 0;
  const dice = Math.min(64, r.h * 0.55);
  const x0 = r.x + r.w / 2 - (dice + (label ? 16 + tw : 0)) / 2;
  const cy = r.y + (r.h - THEME.button.lip) / 2;
  drawDice(ctx, assets, { x: x0, y: cy - dice / 2, w: dice, h: dice }, { color: C.outline });
  if (label) {
    ctx.fillStyle = opts.disabled ? C.textFaint : C.textOnAction;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = opts.font ?? font(THEME.size.button, true);
    ctx.fillText(label, x0 + dice + 16, cy + 1, r.w - 110);
  }
  ctx.restore();
}

export function accentStrip(ctx, r, palette) {
  ctx.fillStyle = palette.hex;
  ctx.beginPath();
  ctx.roundRect(r.x + 10, r.y + 18, 18, r.h - 36, 9);
  ctx.fill();
}
