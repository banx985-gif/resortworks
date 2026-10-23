// A centred dialog over everything (Milestone 21 UI kit): confirm boxes ("Discard your choices?"), the pause menu,
// "Coming soon", a double confirm. One at a time; it takes every tap while open (the game puts it in the router's
// modal) and the back button closes it when it may be dismissed.
//   dialog.show({ title, body, art, buttons: [{ id, label, sub?, accent, onTap }], dismissible = true, onCancel })
//     a button's onTap runs after the dialog closes (so it can open another one)
//   dialog.confirm({ title, body, yes, no = 'Cancel', danger, onYes, onNo })
//   dialog.active · close() · onTap(p) · onBack() · render(ctx) · buttonRect(id)
//   A button with hold: seconds must be pressed and held that long (it fills as it is held) — for things that
//   cannot be undone (Milestone 22 "Reset everything"). onDown / onUp / update drive it.
import { THEME, font, lineH } from '../Theme.js';
import { drawButton, hitRect } from './Button.js';
import { card, text, wrapLines } from './Kit.js';

const C = THEME.color;
const S = THEME.size;
const BTN_H = 120;
const BTN_SUB_H = 150;
const GAP = 20;
const PAD = 40;

export class Dialog {
  constructor({ layout, assets }) {
    this.layout = layout;
    this.assets = assets;
    this.spec = null;
    this.t = 0;
    this.holding = null; // { id, t }
  }

  get active() {
    return !!this.spec;
  }

  show(spec) {
    this.spec = { dismissible: true, buttons: [], ...spec };
    this.t = 0;
    this.holding = null;
    return this;
  }

  confirm({ title, body, art = null, yes = 'Yes', no = 'Cancel', danger = false, onYes = null, onNo = null }) {
    return this.show({
      title,
      body,
      art,
      onCancel: onNo,
      buttons: [
        { id: 'yes', label: yes, accent: danger ? C.bad : C.action, onTap: onYes },
        { id: 'no', label: no, accent: C.progress, onTap: onNo },
      ],
    });
  }

  close() {
    this.spec = null;
  }

  update(dt) {
    if (!this.spec) return;
    this.t += dt;
    if (this.holding) {
      this.holding.t += dt;
      const b = this.spec.buttons.find((x) => x.id === this.holding.id);
      if (b && this.holding.t >= b.hold) {
        this.holding = null;
        this.close();
        b.onTap?.();
      }
    }
  }

  _buttonAt(p) {
    const L = this._layout();
    return L.buttons.find(({ r }) => hitRect(p, { x: L.box.x + r.x, y: L.box.y + r.y, w: r.w, h: r.h }))?.b ?? null;
  }

  onDown(p) {
    if (!this.spec) return;
    const b = this._buttonAt(p);
    if (b?.hold && !b.disabled) this.holding = { id: b.id, t: 0 };
  }

  onUp() {
    this.holding = null; // let go too soon: nothing happens
  }

  _layout() {
    const s = this.spec;
    const sr = this.layout.safeRect;
    const w = Math.min(sr.w - 60, 960);
    const inner = w - 2 * PAD;
    let h = PAD;
    const art = s.art ? 150 : 0;
    if (art) h += art + 16;
    const titleLines = wrapLines(s.title ?? '', inner, S.heading, true);
    const titleY = h;
    h += titleLines.length * lineH(S.heading, 1.2) + 12;
    const bodyLines = s.body ? wrapLines(s.body, inner, S.body) : [];
    const bodyY = h;
    h += bodyLines.length * lineH(S.body) + (bodyLines.length ? 24 : 0);
    const buttons = s.buttons.map((b) => {
      const bh = b.sub ? BTN_SUB_H : BTN_H;
      const r = { x: PAD, y: h, w: inner, h: bh };
      h += bh + GAP;
      return { b, r };
    });
    h += PAD - GAP;
    const box = { x: sr.x + (sr.w - w) / 2, y: sr.y + Math.max(20, (sr.h - h) / 2), w, h };
    return { box, art, titleLines, titleY, bodyLines, bodyY, buttons };
  }

  buttonRect(id) {
    if (!this.spec) return null;
    const L = this._layout();
    const hit = L.buttons.find((x) => x.b.id === id);
    return hit ? { x: L.box.x + hit.r.x, y: L.box.y + hit.r.y, w: hit.r.w, h: hit.r.h } : null;
  }

  onTap(p) {
    if (!this.spec || this.t < 0.15) return; // ignore the tap that opened it
    const L = this._layout();
    for (const { b, r } of L.buttons) {
      if (hitRect(p, { x: L.box.x + r.x, y: L.box.y + r.y, w: r.w, h: r.h })) {
        if (b.disabled || b.hold) return; // a hold button only works by holding it
        this.close();
        b.onTap?.();
        return;
      }
    }
    if (!hitRect(p, L.box) && this.spec.dismissible) this.onBack();
  }

  onBack() {
    if (!this.spec?.dismissible) return;
    const cancel = this.spec.onCancel;
    this.close();
    cancel?.();
  }

  render(ctx) {
    if (!this.spec) return;
    const L = this._layout();
    const s = this.spec;
    ctx.save();
    ctx.fillStyle = C.overlay;
    ctx.globalAlpha = Math.min(1, this.t / 0.15);
    ctx.fillRect(0, 0, this.layout.renderer.width, this.layout.renderer.height);
    ctx.globalAlpha = 1;
    const b = L.box;
    card(ctx, b, 'normal', { radius: 36 });
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 5;
    ctx.stroke();
    if (L.art) this.assets.drawContained(ctx, s.art, { x: b.x + b.w / 2 - 75, y: b.y + PAD, w: 150, h: 150 });
    L.titleLines.forEach((l, i) => text(ctx, l, b.x + b.w / 2, b.y + L.titleY + i * lineH(S.heading, 1.2), { size: S.heading, bold: true, align: 'center', maxWidth: b.w - 2 * PAD }));
    L.bodyLines.forEach((l, i) => text(ctx, l, b.x + b.w / 2, b.y + L.bodyY + i * lineH(S.body), { size: S.body, align: 'center', color: C.textMuted, maxWidth: b.w - 2 * PAD }));
    for (const { b: bt, r } of L.buttons) {
      const rr = { x: b.x + r.x, y: b.y + r.y, w: r.w, h: r.h };
      drawButton(ctx, rr, bt.sub ? '' : bt.label, { accent: bt.accent, disabled: bt.disabled, font: font(S.button, true) });
      if (bt.hold && this.holding?.id === bt.id) {
        ctx.save();
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = C.outline;
        ctx.fillRect(rr.x + 6, rr.y + 6, (rr.w - 12) * Math.min(1, this.holding.t / bt.hold), rr.h - 20);
        ctx.restore();
      }
      if (bt.sub) {
        text(ctx, bt.label, rr.x + rr.w / 2, rr.y + 26, { size: S.button, bold: true, align: 'center', color: bt.disabled ? C.textFaint : C.textOnAction, maxWidth: rr.w - 30 });
        text(ctx, bt.sub, rr.x + rr.w / 2, rr.y + 26 + lineH(S.button, 1.2), { size: S.small, bold: true, align: 'center', color: bt.disabled ? C.textFaint : C.textOnAction, maxWidth: rr.w - 30 });
      }
    }
    ctx.restore();
  }
}
