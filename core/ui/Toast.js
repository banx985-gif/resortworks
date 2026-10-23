// Small toasts (any game): short messages that slide in, sit for a moment and fade on their own.
// They never take a tap. toasts: NotificationSystem.toasts ([{ entry, age }]); life: seconds each one lasts.
//   drawToasts(ctx, toasts, { x, y, w, life, drawIcon(ctx, entry, rect), accent(entry) → colour })
// Stacks downwards from (x, y) (anchor: 'bottom' stacks upwards from y instead). A toast whose t.more > 0 adds a line
// "+N more in the Inbox" (moreText(n) changes the words). Returns the height used.
import { THEME, font as themeFont } from '../Theme.js';
const COL = THEME.color;
const H = 104;
const GAP = 14;
const MORE_H = 40;

export function toastHeight(t) {
  return H + (t.more > 0 ? MORE_H : 0);
}

export function drawToasts(ctx, toasts, { x, y, w, life = 3.6, drawIcon = null, accent = () => COL.progress, font = THEME.family, anchor = 'top', moreText = (n) => `+${n} more in the Inbox` }) {
  let cy = anchor === 'bottom' ? y - toasts.reduce((s, q) => s + toastHeight(q) + GAP, 0) + GAP : y;
  const top = cy;
  for (const t of toasts) {
    const th = toastHeight(t);
    const inK = Math.min(1, t.age / 0.25);
    const outK = Math.min(1, Math.max(0, (life - t.age) / 0.5));
    const a = Math.min(inK, outK);
    if (a <= 0) continue;
    const slide = (1 - inK) * -30;
    const r = { x, y: cy + slide, w, h: th };
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = COL.panel;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(r.x, r.y, r.w, r.h, 22);
    else ctx.rect(r.x, r.y, r.w, r.h);
    ctx.fill();
    ctx.strokeStyle = accent(t.entry);
    ctx.lineWidth = 4;
    ctx.stroke();
    let tx = r.x + 24;
    if (drawIcon) {
      drawIcon(ctx, t.entry, { x: r.x + 14, y: r.y + 12, w: 80, h: 80 });
      tx = r.x + 108;
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = accent(t.entry);
    ctx.font = themeFont(THEME.size.body, true);
    ctx.fillText(t.entry.title, tx, r.y + 34, r.x + r.w - 20 - tx);
    if (t.entry.body) {
      ctx.fillStyle = COL.text;
      ctx.font = themeFont(THEME.size.small);
      ctx.fillText(t.entry.body, tx, r.y + 74, r.x + r.w - 20 - tx);
    }
    if (t.more > 0) {
      ctx.fillStyle = COL.textMuted;
      ctx.font = themeFont(THEME.size.small, true);
      ctx.fillText(moreText(t.more), tx, r.y + H + 12, r.x + r.w - 20 - tx);
    }
    ctx.restore();
    cy += th + GAP;
  }
  return cy - top;
}
