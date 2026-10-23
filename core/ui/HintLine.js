// The next-step hint line (series common feature §1, first built for DEVWORKS Milestone 40e; any series game): one
// plain line under the date telling a new player what to do next ("Start your first game: tap Create"); tapping it
// opens the right sheet. Content-free: the game's rules (data) say which hint applies now.
//
//   const hint = new HintLine({ rect, rules, quiet })
//     rect() → { x, y, w, h } where the line goes (screen units)
//     rules: [{ id, text, when: () => bool, open: () => {} }] — the first whose when() holds is shown (game data + code)
//     quiet() → true while it must say nothing (the first-time guide is showing a step, a sheet is open, Settings off…)
//   hint.current → the rule shown now (or null) · hint.contains(p) · hint.handleTap(p) → true if it took the tap
//   hint.update(dt) · hint.render(ctx)
import { THEME, font } from '../Theme.js';

const C = THEME.color;
const S = THEME.size;

export class HintLine {
  constructor({ rect, rules = [], quiet = () => false, checkEvery = 0.5 }) {
    this.rect = rect;
    this.rules = rules;
    this.quiet = quiet;
    this.checkEvery = checkEvery;
    this.current = null;
    this._t = checkEvery;
    this.fade = 0;
  }

  // Which rule applies (checked twice a second: the rules may look at a lot of game state).
  update(dt) {
    this._t += dt;
    if (this._t >= this.checkEvery) {
      this._t = 0;
      let next = null;
      if (!this.quiet()) {
        for (const r of this.rules) {
          let ok = false;
          try {
            ok = !!r.when();
          } catch {
            ok = false;
          }
          if (ok) {
            next = r;
            break;
          }
        }
      }
      if (next?.id !== this.current?.id) this.fade = 0;
      this.current = next;
    }
    if (this.quiet()) this.current = null;
    this.fade = Math.min(1, this.fade + dt * 4);
  }

  contains(p) {
    if (!this.current) return false;
    const r = this.rect();
    return !!r && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  }

  handleTap(p) {
    if (!this.contains(p)) return false;
    this.current.open?.();
    return true;
  }

  render(ctx) {
    const h = this.current;
    const r = this.rect();
    if (!h || !r) return;
    const text = typeof h.text === 'function' ? h.text() : h.text;
    ctx.save();
    ctx.globalAlpha = this.fade;
    ctx.fillStyle = C.panelGold ?? C.panel;
    ctx.strokeStyle = C.action;
    ctx.lineWidth = 4;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(r.x, r.y, r.w, r.h, r.h / 2);
    else ctx.rect(r.x, r.y, r.w, r.h);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = C.text;
    ctx.font = font(S.small, true);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`→ ${text}`, r.x + 24, r.y + r.h / 2, r.w - 48);
    ctx.restore();
  }
}
