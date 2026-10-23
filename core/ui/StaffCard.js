// A roster card for one worker. Content-free: the game passes a view object.
//
// view = {
//   title, subtitle,                         name, "Engineer · Lv 3 · Standard"
//   portraitKey, badgeKey,                   AssetManager keys (missing → placeholder)
//   badge2Key,                               optional second badge, bottom-left of the portrait (e.g. rarity)
//   xp: { value, max },                      optional XP bar
//   stats: [{ label, value }],               e.g. ENG 58
//   bars:  [{ label, value, max, color }],   e.g. Energy / Morale
//   chips: [{ label, detail }],              e.g. traits
//   icons: [assetKey],                       status icons
//   footer,                                  "Now: working at the workbench"
//   buttons: [{ id, label }],                optional small buttons (top-right)
// }
import { THEME, font, textScale } from '../Theme.js';
import { drawButton } from './Button.js';
const COL = THEME.color;
// Milestone 18: body text at the §33.2 body size (34), secondary labels 28 — the card grew to fit.
export const STAFF_CARD_HEIGHT = 540;
// RACEWORKS Milestone 29: the rows step down with the Text size setting (core/Theme textScale), so the label and the number
// under it never overlap at Large / Larger; staffCardHeight() is the card's height at the current setting (540 at Normal).
export const staffCardHeight = () => Math.round(STAFF_CARD_HEIGHT * Math.max(1, 0.25 + 0.75 * textScale()));

export function drawStaffCard(ctx, r, view, assets, { highlight = false, accent = COL.progress } = {}) {
  ctx.save();
  ctx.fillStyle = highlight ? COL.panelInfo : COL.panel;
  roundRect(ctx, r.x, r.y, r.w, r.h, 26);
  ctx.fill();
  ctx.strokeStyle = highlight ? accent : COL.line;
  ctx.lineWidth = highlight ? 6 : 3;
  ctx.stroke();

  // Portrait with role badge.
  const pad = 24;
  const pw = 210;
  const ph = r.h - pad * 2;
  const pr = { x: r.x + pad, y: r.y + pad, w: pw, h: ph };
  ctx.fillStyle = COL.panelAlt;
  roundRect(ctx, pr.x, pr.y, pr.w, pr.h, 18);
  ctx.fill();
  assets.drawContained(ctx, view.portraitKey, { x: pr.x + 8, y: pr.y + 8, w: pr.w - 16, h: pr.h - 16 }, 'bottom');
  if (view.badgeKey) drawContained(ctx, assets, view.badgeKey, pr.x - 6, pr.y - 6, 84, 84);
  if (view.badge2Key) drawContained(ctx, assets, view.badge2Key, pr.x - 6, pr.y + pr.h - 78, 84, 84);

  // Text column.
  const k = textScale(); // (M29: 1 at Normal — exactly the old spacing)
  const tx = pr.x + pr.w + 28;
  const tw = r.x + r.w - pad - tx;
  let y = r.y + pad;
  // The XP bar and stats row stay clear of the buttons column (top-right).
  const sw = (view.buttons || []).length ? tw - 230 : tw;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = COL.text;
  ctx.font = font(46, true);
  ctx.fillText(view.title, tx, y, tw - 230);
  y += 56 * k;
  ctx.fillStyle = COL.textMuted;
  ctx.font = font(THEME.size.body);
  ctx.fillText(view.subtitle || '', tx, y, tw - 230);
  y += 50 * k;

  if (view.xp) {
    drawBar(ctx, tx, y, sw, 14, view.xp.value / view.xp.max, COL.purple);
    ctx.fillStyle = COL.textMuted;
    ctx.font = font(THEME.size.small);
    ctx.fillText(`XP ${view.xp.value} / ${view.xp.max}`, tx, y + 20);
    y += 20 + 40 * k;
  }

  // Stats row.
  const stats = view.stats || [];
  const colW = sw / Math.max(1, stats.length);
  stats.forEach((s, i) => {
    const cx = tx + i * colW;
    ctx.fillStyle = COL.textMuted;
    ctx.font = font(28, true);
    ctx.fillText(s.label, cx, y, colW - 8);
    ctx.fillStyle = COL.text;
    ctx.font = font(40, true);
    ctx.fillText(String(s.value), cx, y + Math.max(26, 30 * k - 4), colW - 8);
  });
  y += 84 * k;

  // Bars.
  for (const b of view.bars || []) {
    ctx.fillStyle = COL.textMuted;
    ctx.font = font(THEME.size.body);
    ctx.fillText(b.label, tx, y - 2);
    const bx = tx + 160;
    const bw = sw - 160 - 80;
    drawBar(ctx, bx, y + 6, bw, 24, b.value / b.max, b.color);
    ctx.textAlign = 'right';
    ctx.fillStyle = COL.text;
    ctx.fillText(String(Math.round(b.value)), tx + sw, y - 2);
    ctx.textAlign = 'left';
    y += 48 * k;
  }
  y += 6;

  // Trait chips, then status icons.
  let cx = tx;
  ctx.font = font(THEME.size.body, true);
  const chips = view.chips || [];
  for (const [i, c] of chips.entries()) {
    const w = ctx.measureText(c.label).width + 32;
    // No room for this one: a "+N" chip says how many more (the detail screen lists them all).
    if (cx + w > tx + tw - (i < chips.length - 1 ? 90 : 0)) {
      ctx.fillStyle = COL.purple;
      ctx.fillText(`+${chips.length - i}`, cx + 4, y + 6);
      cx += 90;
      break;
    }
    ctx.fillStyle = COL.panelInfo;
    roundRect(ctx, cx, y, w, 50 * k, 25 * k);
    ctx.fill();
    ctx.fillStyle = COL.purple;
    ctx.fillText(c.label, cx + 16, y + 6);
    cx += w + 12;
  }
  for (const key of view.icons || []) {
    drawContained(ctx, assets, key, cx, y - 6, 54, 54);
    cx += 60;
  }
  y += 62 * k;

  if (view.footer) {
    ctx.fillStyle = COL.gold;
    ctx.font = font(THEME.size.body);
    ctx.fillText(view.footer, tx, y, sw);
  }

  // Buttons (top-right): the shared themed button (Milestone 17b: 110 tall).
  for (const [i, b] of (view.buttons || []).entries()) drawButton(ctx, staffCardButtonRect(r, i), b.label, { accent: b.accent ?? COL.action, disabled: !!b.disabled });
  ctx.restore();
}

export function staffCardButtonRect(r, i) {
  return { x: r.x + r.w - 24 - 210, y: r.y + 24 + i * 124, w: 210, h: 110 };
}

// Which button (id) of the view is under p, or null.
export function staffCardButtonAt(r, view, p) {
  for (const [i, b] of (view.buttons || []).entries()) {
    const br = staffCardButtonRect(r, i);
    if (p.x >= br.x && p.x <= br.x + br.w && p.y >= br.y && p.y <= br.y + br.h) return b.id;
  }
  return null;
}

function drawBar(ctx, x, y, w, h, frac, color) {
  ctx.fillStyle = COL.track;
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fill();
  const f = Math.min(1, Math.max(0, frac));
  if (f > 0) {
    ctx.fillStyle = color;
    roundRect(ctx, x, y, Math.max(h, w * f), h, h / 2);
    ctx.fill();
  }
}

// Cached, display-size copy (AssetManager/SpriteCache), never the big source image.
function drawContained(ctx, assets, key, x, y, w, h) {
  assets.drawContained(ctx, key, { x, y, w, h });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}
