// Small info card pinned to the bottom of the safe area, showing the selected thing.
// The game supplies describe(item) → { title, subtitle?, lines?: string[], accent?, buttons?: [{ id, label }] }
// so no content lives here. Drawn in screen (logical) units, on top of the world.
import { THEME, font } from '../Theme.js';
import { drawButton, hitRect } from './Button.js';
const COL = THEME.color;

export class ContextCard {
  constructor(layout, { describe, height = 280, margin = 24 } = {}) {
    this.layout = layout;
    this.describe = describe;
    this.height = height;
    this.margin = margin;
    this.item = null;
  }

  get isOpen() {
    return this.item !== null;
  }

  open(item) {
    this.item = item;
  }

  close() {
    this.item = null;
  }

  rect() {
    const sr = this.layout.safeRect;
    return this.layout.anchor('bottom', sr.w - this.margin * 2, this.height, this.margin);
  }

  // Is this screen point on the card? (Taps there must not reach the world.)
  contains(p) {
    if (!this.isOpen) return false;
    return hitRect(p, this.rect());
  }

  buttonRect(i) {
    const r = this.rect();
    return { x: r.x + r.w - 36 - 300, y: r.y + r.h - 36 - 96 - i * 112, w: 300, h: 96 };
  }

  // id of the card button under p, or null.
  buttonAt(p) {
    if (!this.isOpen) return null;
    const info = this.describe(this.item) || {};
    for (const [i, b] of (info.buttons || []).entries()) if (hitRect(p, this.buttonRect(i))) return b.id;
    return null;
  }

  render(ctx) {
    if (!this.item) return;
    const info = this.describe(this.item) || { title: '?' };
    const r = this.rect();
    const accent = info.accent || COL.progress;
    const pad = 36;
    const buttons = info.buttons || [];

    ctx.save();
    ctx.shadowColor = COL.overlay;
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 8;
    ctx.fillStyle = COL.panel;
    roundRect(ctx, r.x, r.y, r.w, r.h, 28);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = accent;
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.fillStyle = accent;
    roundRect(ctx, r.x + pad, r.y + 28, 10, r.h - 56, 5);
    ctx.fill();

    const tx = r.x + pad + 34;
    const maxW = r.w - pad * 2 - 34 - (buttons.length ? 320 : 0);
    let ty = r.y + 36;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = COL.text;
    ctx.font = font(52, true);
    ctx.fillText(info.title, tx, ty, maxW);
    ty += 66;
    if (info.subtitle) {
      ctx.fillStyle = COL.textMuted;
      ctx.font = font(32);
      ctx.fillText(info.subtitle, tx, ty, maxW);
      ty += 50;
    }
    ctx.fillStyle = COL.text;
    ctx.font = font(34);
    for (const line of info.lines || []) {
      ctx.fillText(line, tx, ty, maxW);
      ty += 46;
    }
    buttons.forEach((b, i) => drawButton(ctx, this.buttonRect(i), b.label, { accent }));
    ctx.restore();
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.rect(x, y, w, h);
  }
}
