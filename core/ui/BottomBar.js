// The home screen's bottom bar (any series game, style guide §2): five big icon buttons, the same shortcuts in every
// game — make the product · people · research · compete · money. The game gives the slots as data:
//   items: [{ id, label, icon (image key), badge? }]   badge: text / number, or a function returning one
//                                                        (null / 0 / '' = no badge; any value = red attention dot)
//   open(id) — what a slot does (usually: open its bottom sheet)
// createBottomBar({ layout, assets, items, open, fitLabels }) → { rect(), buttonRect(id), handleTap(p), contains(p), render(ctx) }
//   fitLabels (optional, BOTWORKS Milestone 26c): a label too wide for its button is drawn in a smaller font (down to
//   70%) instead of squashed — six buttons on a phone keep their size and readable words. Off: drawn as before.
// Pressed looks come from Button.js (setPressPoint / clearPress in the game's input wiring).
import { THEME, font } from '../Theme.js';
import { drawButton, hitRect } from './Button.js';

const C = THEME.color;
export const BOTTOM_BAR_H = 190;

export function createBottomBar({ layout, assets, items, open, fitLabels = false }) {
  const badgeOf = (b) => (typeof b.badge === 'function' ? b.badge() : b.badge) || null;

  function rect() {
    const sr = layout.safeRect;
    return { x: sr.x + 12, y: sr.y + sr.h - BOTTOM_BAR_H - 12, w: sr.w - 24, h: BOTTOM_BAR_H };
  }

  function buttonRect(id) {
    const r = rect();
    const i = items.findIndex((b) => b.id === id);
    if (i < 0) return null;
    const gap = 12;
    const w = (r.w - 24 - gap * (items.length - 1)) / items.length;
    return { x: r.x + 12 + i * (w + gap), y: r.y + 14, w, h: r.h - 28 };
  }

  return {
    rect,
    buttonRect,
    badge: (id) => {
      const b = items.find((x) => x.id === id);
      return b ? badgeOf(b) : null;
    },
    contains: (p) => hitRect(p, rect()),
    // Returns true if the tap was on the bar (used, even between buttons).
    handleTap(p) {
      if (!hitRect(p, rect())) return false;
      const b = items.find((x) => hitRect(p, buttonRect(x.id)));
      if (b) open(b.id);
      return true;
    },
    render(ctx) {
      const r = rect();
      ctx.save();
      ctx.fillStyle = C.sheet;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(r.x, r.y, r.w, r.h, 36);
      else ctx.rect(r.x, r.y, r.w, r.h);
      ctx.fill();
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = 4;
      ctx.stroke();
      for (const b of items) {
        const br = buttonRect(b.id);
        drawButton(ctx, br, '', { badge: badgeOf(b) });
        assets.drawContained(ctx, b.icon, { x: br.x + (br.w - 84) / 2, y: br.y + 6, w: 84, h: 84 });
        ctx.font = font(THEME.size.button, true);
        if (fitLabels) {
          const room = br.w - 12;
          const wide = ctx.measureText(b.label).width;
          if (wide > room) ctx.font = font(Math.max(THEME.size.button * 0.7, Math.floor((THEME.size.button * room) / wide)), true);
        }
        ctx.fillStyle = C.textOnAction;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(b.label, br.x + br.w / 2, br.y + br.h - 36, br.w - 12);
      }
      ctx.restore();
    },
  };
}
