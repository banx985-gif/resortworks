// Scrolling credits (any series game). The names and pictures come from the game's data; this lays them out,
// scrolls them upwards at a steady speed and says when the last line has gone. Holding a finger down speeds it up;
// the game adds its own Skip button.
//
//   new CreditsRoll({ blocks, speed = 90, fast = 4 })
//     blocks: [{ image, h }] a picture (asset key, drawn contained in h px of height)
//           | { heading } a section title   | { line } a name or a line of words   | { gap } empty space in px
//   update(dt, { fast }) · render(ctx, assets, rect, theme) · done · progress (0–1) · restart()
import { THEME, font } from '../Theme.js';

const SIZES = { heading: 44, line: 38, lineGap: 16, headingGap: 70 };

export class CreditsRoll {
  constructor({ blocks = [], speed = 90, fast = 4 } = {}) {
    this.blocks = blocks;
    this.speed = speed; // logical px a second
    this.fast = fast;
    this.restart();
  }

  restart() {
    this.offset = 0;
    this.done = false;
  }

  // Height of everything, top to bottom.
  get contentHeight() {
    let h = 0;
    for (const b of this.blocks) h += this._height(b);
    return h;
  }

  _height(b) {
    if (b.image) return (b.h ?? 300) + 40;
    if (b.heading) return SIZES.heading + SIZES.headingGap - 20;
    if (b.line) return SIZES.line + SIZES.lineGap;
    return b.gap ?? 40;
  }

  update(dt, { fast = false, viewHeight = 1920 } = {}) {
    if (this.done) return;
    this.offset += dt * this.speed * (fast ? this.fast : 1);
    if (this.offset > this.contentHeight + viewHeight) this.done = true;
  }

  get progress() {
    return Math.min(1, this.offset / Math.max(1, this.contentHeight));
  }

  // The roll starts just below the rect and moves up through it.
  render(ctx, assets, rect, { color = THEME.color.text, headingColor = THEME.color.actionDark } = {}) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.w, rect.h);
    ctx.clip();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const cx = rect.x + rect.w / 2;
    let y = rect.y + rect.h - this.offset;
    for (const b of this.blocks) {
      const h = this._height(b);
      if (y + h > rect.y && y < rect.y + rect.h) {
        if (b.image) {
          const ih = b.h ?? 300;
          assets.drawContained(ctx, b.image, { x: rect.x + 40, y: y + 20, w: rect.w - 80, h: ih });
        } else if (b.heading) {
          ctx.font = font(SIZES.heading, true);
          ctx.fillStyle = headingColor;
          ctx.fillText(b.heading, cx, y + 30, rect.w - 60);
        } else if (b.line) {
          ctx.font = font(SIZES.line, !!b.bold);
          ctx.fillStyle = b.color ?? color;
          ctx.fillText(b.line, cx, y, rect.w - 60);
        }
      }
      y += h;
    }
    ctx.restore();
  }
}
