// The series UI kit (Milestone 21, SERIES_STYLE_GUIDE §7, bible §33): the pieces every screen is built from, so they
// all look and behave the same. All sizes are logical units; every font goes through font() (text-size setting).
//   panel(ctx, r, opts)                     a rounded cream panel
//   card(ctx, r, state)                     a panel in one of the §33.3 states: normal, selected, good, gold, info,
//                                           locked (dim), secret (purple edge), bad
//   text(ctx, str, x, y, opts)              one line (never overflows: maxWidth squeezes)
//   wrapLines(str, w, size, bold)           the words broken to fit w
//   para(ctx, str, x, y, w, opts)           wrapped text; returns the height used (ctx null: only measures)
//   listRow(ctx, assets, r, row)            a picture on the left, a title, lines under it, an optional right-hand
//                                           tag — every list row has a picture (style guide §7)
//   listRowHeight(w, row)                   how tall that row needs to be (rows grow, never squeeze)
//   emptyState(ctx, assets, r, s)           a friendly picture + one-liner + a "go do it" button → the button rect
//   errorState(ctx, assets, r, s)           the same in the failure colours (a save that won't read…)
//   stateHeight(w, s)                       how tall an empty / error state is
//   tabRects(area, n, h), drawTabs(ctx, rects, tabs, activeId, opts), tabAt(p, rects)
//   Tabs inside a bottom sheet: core/ui/BottomSheet.js menu.tabs.
import { THEME, font, lineH } from '../Theme.js';
import { drawButton, drawPadlock, hitRect } from './Button.js';

const C = THEME.color;
const S = THEME.size;
let measureCtx = null;
const measure = () => (measureCtx ??= globalThis.document?.createElement('canvas').getContext('2d'));

export function panel(ctx, r, { fill = C.panel, stroke = C.line, lineWidth = 3, radius = 24 } = {}) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(r.x, r.y, r.w, r.h, radius);
  else ctx.rect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

const CARD = {
  normal: { fill: C.panel, stroke: C.line, lineWidth: 3 },
  selected: { fill: C.panelGood, stroke: C.good, lineWidth: 6 },
  good: { fill: C.panelGood, stroke: C.good, lineWidth: 4 },
  gold: { fill: C.panelGold, stroke: C.gold, lineWidth: 5 },
  info: { fill: C.panelInfo, stroke: C.progress, lineWidth: 4 },
  locked: { fill: C.panelDim, stroke: C.line, lineWidth: 3 },
  secret: { fill: C.panel, stroke: C.purple, lineWidth: 4 },
  bad: { fill: C.panelBad, stroke: C.bad, lineWidth: 4 },
};
export function card(ctx, r, state = 'normal', { radius = THEME.panel.radius } = {}) {
  panel(ctx, r, { ...(CARD[state] ?? CARD.normal), radius });
}

export function text(ctx, str, x, y, { size = S.body, bold = false, color = C.text, align = 'left', baseline = 'top', maxWidth } = {}) {
  ctx.font = font(size, !!bold);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  if (maxWidth) ctx.fillText(String(str), x, y, maxWidth);
  else ctx.fillText(String(str), x, y);
}

export function wrapLines(str, w, size = S.body, bold = false) {
  const m = measure();
  if (!m) return [String(str ?? '')];
  m.font = font(size, bold);
  const out = [];
  let line = '';
  for (const word of String(str ?? '').split(' ')) {
    const t = line ? `${line} ${word}` : word;
    if (m.measureText(t).width > w && line) {
      out.push(line);
      line = word;
    } else line = t;
  }
  if (line) out.push(line);
  return out;
}

export function para(ctx, str, x, y, w, { size = S.body, bold = false, color = C.text, align = 'left', maxLines = 99, lead = 1.3 } = {}) {
  const lines = wrapLines(str, w, size, bold).slice(0, maxLines);
  const lh = lineH(size, lead);
  const ax = align === 'center' ? x + w / 2 : align === 'right' ? x + w : x;
  if (ctx) lines.forEach((l, i) => text(ctx, l, ax, y + i * lh, { size, bold, color, align, maxWidth: w })); // ctx null: measure only
  return lines.length * lh;
}

// --- list rows -------------------------------------------------------------------------------------------------------
// row: { art, title, lines: [string | { text, color, bold, size }], right, rightColor, state, dimArt, locked, badge,
//        artSize (default 130), rightArt (a small picture in the top-right corner, e.g. a grade crate) }
const ROW_PAD = 20;
function rowParts(w, row) {
  const art = row.artSize ?? 130;
  const x = ROW_PAD + art + 24;
  const rightW = row.right || row.rightArt ? Math.min(260, w * 0.3) : 0;
  const tw = w - x - ROW_PAD - (rightW ? rightW + 16 : 0);
  const lineW = row.rightArt ? tw : w - x - ROW_PAD; // a picture in the corner keeps its column clear all the way down
  const lines = (row.lines ?? []).flatMap((l) => {
    const o = typeof l === 'string' ? { text: l } : l;
    const size = o.size ?? S.body;
    return wrapLines(o.text, lineW, size, !!o.bold).map((t) => ({ ...o, text: t, size }));
  });
  return { art, x, tw, rightW, lines, lineW };
}

export function listRowHeight(w, row) {
  const p = rowParts(w, row);
  const textH = lineH(S.button, 1.25) + p.lines.reduce((t, l) => t + lineH(l.size, 1.25), 0);
  return Math.max(p.art + 2 * ROW_PAD, textH + 2 * ROW_PAD);
}

export function listRow(ctx, assets, r, row) {
  const p = rowParts(r.w, row);
  card(ctx, r, row.state ?? (row.locked ? 'locked' : 'normal'));
  const pic = { x: r.x + ROW_PAD, y: r.y + (r.h - p.art) / 2, w: p.art, h: p.art };
  ctx.save();
  if (row.dimArt || row.locked) ctx.globalAlpha = 0.4;
  if (row.art) assets.drawContained(ctx, row.art, pic);
  ctx.restore();
  if (row.locked) drawPadlock(ctx, pic.x + pic.w - 38, pic.y + pic.h - 20, 34, C.gold);
  let y = r.y + ROW_PAD;
  text(ctx, row.title ?? '', r.x + p.x, y, { size: S.button, bold: true, color: row.locked ? C.textMuted : C.text, maxWidth: p.tw });
  y += lineH(S.button, 1.25);
  for (const l of p.lines) {
    text(ctx, l.text, r.x + p.x, y, { size: l.size, bold: !!l.bold, color: l.color ?? (row.locked ? C.textMuted : C.text), maxWidth: p.lineW });
    y += lineH(l.size, 1.25);
  }
  let ry = r.y + ROW_PAD;
  if (row.rightArt) {
    assets.drawContained(ctx, row.rightArt, { x: r.x + r.w - ROW_PAD - 84, y: ry, w: 84, h: 84 });
    ry += 90;
  }
  if (row.right) text(ctx, row.right, r.x + r.w - ROW_PAD, ry, { size: row.rightArt ? S.small : S.body, bold: true, align: 'right', color: row.rightColor ?? C.progress, maxWidth: p.rightW });
}

// --- empty and error states ----------------------------------------------------------------------------------------
// s: { art, title?, text, button?: { label, accent } }. Returns the button's rect (or null).
export function stateHeight(w, s) {
  const inner = w - 2 * 36 - 150;
  const t = (s.title ? lineH(S.button, 1.25) : 0) + wrapLines(s.text, inner, S.body).length * lineH(S.body);
  return Math.max(190, t + 60) + (s.button ? 140 : 0);
}

function stateBox(ctx, assets, r, s, look) {
  card(ctx, r, look);
  const art = { x: r.x + 30, y: r.y + 30, w: 130, h: 130 };
  if (s.art) assets.drawContained(ctx, s.art, art);
  const x = r.x + 190;
  const w = r.w - 190 - 36;
  let y = r.y + 34;
  if (s.title) {
    text(ctx, s.title, x, y, { size: S.button, bold: true, color: look === 'bad' ? C.bad : C.text, maxWidth: w });
    y += lineH(S.button, 1.25);
  }
  para(ctx, s.text, x, y, w, { size: S.body, color: look === 'bad' ? C.text : C.textMuted });
  if (!s.button) return null;
  const b = { x: r.x + 30, y: r.y + r.h - 140, w: r.w - 60, h: 116 };
  drawButton(ctx, b, s.button.label, { accent: s.button.accent, font: font(S.button, true) });
  return b;
}

export function emptyState(ctx, assets, r, s) {
  return stateBox(ctx, assets, r, s, 'normal');
}

export function errorState(ctx, assets, r, s) {
  return stateBox(ctx, assets, r, s, 'bad');
}

// --- a big button with a picture, a label and a line under it (menus, the same look as bottom-sheet buttons) --------
// b: { label, sub, icon, accent, disabled, locked, badge, stripe (a small colour mark on the left edge) }
export function iconButton(ctx, assets, r, b) {
  drawButton(ctx, r, '', { accent: b.accent, disabled: b.disabled || b.locked, badge: b.badge ?? null });
  const lip = THEME.button.lip;
  if (b.stripe) {
    ctx.fillStyle = b.stripe;
    ctx.fillRect(r.x + 6, r.y + 14, 14, r.h - lip - 28);
  }
  const iconS = Math.min(r.h - 36, 104);
  let x = r.x + (b.stripe ? 34 : 22);
  if (b.icon) {
    ctx.save();
    if (b.disabled || b.locked) ctx.globalAlpha = 0.5;
    assets.drawContained(ctx, b.icon, { x, y: r.y + (r.h - lip - iconS) / 2, w: iconS, h: iconS });
    ctx.restore();
    x += iconS + 18;
  }
  if (b.locked) drawPadlock(ctx, r.x + r.w - 58, r.y + (r.h - lip) / 2, 34, C.textFaint);
  const w = r.x + r.w - (b.locked ? 76 : 20) - x;
  const col = b.disabled || b.locked ? C.textFaint : C.textOnAction;
  const cy = r.y + (r.h - lip) / 2;
  const gap = b.sub ? lineH(S.button, 0.62) : 0;
  text(ctx, b.label, x, cy - gap, { size: S.button, bold: true, baseline: 'middle', color: col, maxWidth: w });
  if (b.sub) text(ctx, b.sub, x, cy + lineH(S.small, 0.72), { size: S.small, bold: true, baseline: 'middle', color: col, maxWidth: w });
}

// --- tabs --------------------------------------------------------------------------------------------------------------
export function tabRects(area, n, h = 110, gap = 12) {
  const w = (area.w - gap * (n - 1)) / n;
  return Array.from({ length: n }, (_, i) => ({ x: area.x + i * (w + gap), y: area.y, w, h }));
}

export function drawTabs(ctx, rects, tabs, activeId, { accent = C.progress } = {}) {
  tabs.forEach((t, i) => drawButton(ctx, rects[i], t.label, { active: t.id === activeId, accent, badge: t.badge ?? null, font: font(S.button, true) }));
}

export function tabAt(p, rects, tabs) {
  const i = rects.findIndex((r) => hitRect(p, r));
  return i >= 0 ? tabs[i] : null;
}
