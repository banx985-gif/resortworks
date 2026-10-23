// Station → menu framework (any game, Milestone 17b): tap something in the world and a big, bright sheet slides up
// over the lower part of the screen, the world still visible above it.
//
// A menu is plain data the game builds when it opens (and again every frame while open, so numbers stay live):
//   { title, subtitle, art (image key), accent,
//     sections: [ { title?, lines?: [text], buttons?: [{ id, label, sub?, icon?, iconCrop?, disabled?, locked?, badge?, accent?, onTap }],
//                   columns? (buttons per row, default 2) } ],
//     tabs?: [{ id, label, badge?, sections }] }   locked (Milestone DEVWORKS-3): greyed like disabled, faded icon and a
//                                                  padlock on the right; not tappable   tabs inside the sheet (Milestone 21): a row of tabs under the header,
//                                                  each with its own sections (then menu.sections is not used)
//   A section may also hold bars (CAREWORKS Milestone 2; optional, drawn after its lines):
//     bars: [{ label, value, max = 100, color?, text? }]   one row each: label · a filled bar · text (default the value)
//       tick? (CAREWORKS Milestone 16, optional): a target mark across the bar at that value; bars without one draw as before
//   Header extras (CAREWORKS Milestone 3; optional): badge (image key) — a small round badge on the picture's corner
//   (e.g. a role badge); tag: { text, color? } — a chip beside the title (e.g. FOUNDER)
//   Button extra (CAREWORKS Milestone 5; optional): iconBadge (image key) — a small round badge on the button's icon
//   corner (e.g. a role badge on a roster portrait)
//   A section may also hold lanes (CAREWORKS Milestone 7; optional, drawn after its bars, before its buttons): columns side
//   by side, each a header button and a stack of small portrait cards (e.g. a roster's shifts):
//     lanes: [{ id, title, sub?, accent?, selected?, onTap?, empty? (a faint line when it has no cards),
//               items: [{ id, label, sub?, icon?, iconCrop?, iconBadge?, tag? (a small chip, e.g. AGENCY), accent?,
//                         selected?, disabled?, onTap }] }]
//     Every header and card is a button (buttonRect(id) finds it; a tap calls its onTap).
//   Section title extra (CAREWORKS Milestone 8; optional): titleDot (a colour) — a round dot after the title (e.g. amber
//   for a care plan due for review)
//   Button extra (DEVWORKS Milestone 40b; optional): cost (text, e.g. '12,000 Cr' or 'Free') — a chip on the button's right
//   so every option shows what it costs; buttons without one draw as before
//   Line extra (CAREWORKS Milestone 13; optional): a line may be { text, color?, glyph } where glyph(ctx, x, y, size) draws
//   a small code-drawn mark before its first row (e.g. a heart); the text moves over to make room
//   Line extra (RACEWORKS Milestone 29; optional): { text, right } — right (a number, e.g. '+1,200') is drawn right-aligned
//   on the line's first row, so the numbers in a list line up; the text wraps short of it
//   Header extra (RACEWORKS Milestone 29; optional): help — a function; a "?" Help button sits left of the ✕ and calls it
//   (sheet.helpRect() finds it)
// A MenuRegistry maps what was tapped (a station type, 'worker', 'floor'…) to the function that builds its menu.
//   sheet.open(builder) — builder() → menu        sheet.close()        sheet.active
//   sheet.handleInput(hook, p) → true when the sheet used it (tap a button, tap above it to close, drag to scroll)
//   sheet.update(dt)  sheet.render(ctx)           sheet.buttonRect(id) → screen rect (tests, the guide)
//   sheet.onBack() → closes it (the back button, Milestone 21)   sheet.setTab(id), sheet.tab, sheet.tabRect(id)
import { THEME, font, lineH } from '../Theme.js';
import { drawButton, drawPadlock, hitRect } from './Button.js';

export class MenuRegistry {
  constructor() {
    this.builders = new Map();
  }

  register(kind, build) {
    this.builders.set(kind, build);
    return this;
  }

  has(kind) {
    return this.builders.has(kind);
  }

  // A function that builds the menu for this target (for sheet.open), or null.
  for(kind, target) {
    const b = this.builders.get(kind);
    return b ? () => b(target) : null;
  }
}

const PAD = 36;
const HEAD_H = 230;
const BTN_H = 124;
const BTN_SUB_H = 150;
const GAP = 18;
const TAB_H = 110;
const TAB_GAP = 20; // under the tab row
const BAR_ROW = 58; // one bar row in a section's bars
const LANE_HEAD_H = 124; // a lane's header button
const LANE_CARD_H = 214; // one portrait card in a lane

export class BottomSheet {
  constructor({ layout, assets, maxFrac = 0.66, onClose = null }) {
    this.layout = layout;
    this.assets = assets;
    this.maxFrac = maxFrac; // at most this share of the screen height
    this.onClose = onClose;
    this.builder = null;
    this.menu = null;
    this.t = 0;
    this.scrollY = 0;
    this.drag = null;
    this.rects = []; // { id, rect (content coordinates), button }
    this.contentH = 0;
  }

  get active() {
    return !!this.builder;
  }

  open(builder, { tab = null } = {}) {
    this.builder = builder;
    this.tab = tab;
    this.menu = builder();
    this.t = 0;
    this.scrollY = 0;
  }

  onBack() {
    if (!this.builder) return false;
    this.close();
    return true;
  }

  // Tabs inside the sheet.
  get tabs() {
    return this.menu?.tabs ?? null;
  }

  get currentTab() {
    const t = this.tabs;
    return t ? t.find((x) => x.id === this.tab) ?? t[0] : null;
  }

  setTab(id) {
    this.tab = id;
    this.scrollY = 0;
  }

  get sections() {
    return this.currentTab?.sections ?? this.menu?.sections ?? [];
  }

  tabRect(id) {
    const t = this.tabs;
    if (!t) return null;
    const i = t.findIndex((x) => x.id === id);
    const r = this.rect();
    const w = (r.w - PAD * 2 - GAP * (t.length - 1)) / t.length;
    return i < 0 ? null : { x: r.x + PAD + i * (w + GAP), y: r.y + HEAD_H, w, h: TAB_H };
  }

  close() {
    if (!this.builder) return;
    this.builder = null;
    this.menu = null;
    this.onClose?.();
  }

  // Refresh the menu's words (called each frame while open).
  refresh() {
    if (this.builder) this.menu = this.builder() ?? this.menu;
  }

  // The sheet's rect on screen.
  rect() {
    const sr = this.layout.safeRect;
    const h = Math.min(sr.h * this.maxFrac, HEAD_H + this._tabsH() + this.contentH + PAD * 2);
    const slide = this.instant ? 0 : 1 - Math.min(1, this.t / 0.22); // instant: Reduced Motion (DEVWORKS M38) — the sheet snaps
    return { x: sr.x, y: sr.y + sr.h - h + slide * slide * h * 0.6, w: sr.w, h: h + 40 };
  }

  _tabsH() {
    return this.tabs ? TAB_H + TAB_GAP : 0;
  }

  bodyRect() {
    const r = this.rect();
    const top = HEAD_H + this._tabsH();
    return { x: r.x + PAD, y: r.y + top, w: r.w - PAD * 2, h: r.h - top - 40 - PAD };
  }

  get maxScroll() {
    return Math.max(0, this.contentH - this.bodyRect().h);
  }

  // Scroll so a button is fully in view (the guide points at it).
  scrollTo(id) {
    const hit = this.rects.find((x) => x.id === id);
    if (!hit) return false;
    const b = this.bodyRect();
    if (hit.rect.y < this.scrollY) this.scrollY = hit.rect.y;
    else if (hit.rect.y + hit.rect.h > this.scrollY + b.h) this.scrollY = Math.min(this.maxScroll, hit.rect.y + hit.rect.h - b.h);
    return true;
  }

  // Where a button is on screen right now (null if not showing or scrolled away).
  buttonRect(id) {
    const hit = this.rects.find((x) => x.id === id);
    if (!hit) return null;
    const b = this.bodyRect();
    const y = b.y + hit.rect.y - this.scrollY;
    if (y < b.y - 1 || y + hit.rect.h > b.y + b.h + 1) return null;
    return { x: b.x + hit.rect.x, y, w: hit.rect.w, h: hit.rect.h };
  }

  update(dt) {
    if (!this.builder) return;
    this.t += dt;
    this.refresh();
  }

  handleInput(hook, p) {
    if (!this.builder) return false;
    const r = this.rect();
    if (hook === 'onTap') {
      if (p.y < r.y) {
        this.close(); // tap the world above: close
        return true;
      }
      for (const t of this.tabs ?? []) {
        if (hitRect(p, this.tabRect(t.id))) {
          this.setTab(t.id);
          return true;
        }
      }
      const b = this.bodyRect();
      for (const x of this.rects) {
        const sr = { x: b.x + x.rect.x, y: b.y + x.rect.y - this.scrollY, w: x.rect.w, h: x.rect.h };
        if (sr.y < b.y - 1 || sr.y > b.y + b.h) continue;
        if (hitRect(p, sr)) {
          if (!x.button.disabled && !x.button.locked) x.button.onTap?.();
          else this.onLocked?.(x.button); // optional: a game can answer a tap on a greyed button (a sound)
          return true;
        }
      }
      if (hitRect(p, this.closeRect())) this.close();
      else if (this.menu?.help && hitRect(p, this.helpRect())) this.menu.help();
      return true;
    }
    if (hook === 'onDragStart') {
      if (p.startY < r.y) return false; // a drag on the world above still pans it
      this.drag = { id: p.id, y: p.y, start: this.scrollY };
      return true;
    }
    if (hook === 'onDrag') {
      if (!this.drag || p.id !== this.drag.id) return false;
      this.scrollY = Math.min(this.maxScroll, Math.max(0, this.drag.start - (p.y - this.drag.y)));
      return true;
    }
    if (hook === 'onDragEnd') {
      if (!this.drag || p.id !== this.drag.id) return false;
      this.drag = null;
      return true;
    }
    if (hook === 'onHold' || hook === 'onWheel') return p.y >= r.y;
    return false;
  }

  closeRect() {
    const r = this.rect();
    return { x: r.x + r.w - PAD - 130, y: r.y + 30, w: 130, h: 110 };
  }

  // The Help button (only when the menu has help): left of the ✕.
  helpRect() {
    if (!this.menu?.help) return null;
    const c = this.closeRect();
    return { x: c.x - 16 - 120, y: c.y, w: 120, h: c.h };
  }

  // Lay the sections out (content coordinates). Also measures the text for wrapping.
  _layout(ctx, w) {
    const C = THEME.color;
    const S = THEME.size;
    const items = [];
    this.rects = [];
    let y = 0;
    for (const sec of this.sections) {
      if (sec.title) {
        items.push({ kind: 'title', text: sec.title, y, dot: sec.titleDot ?? null });
        y += lineH(S.heading, 1.3);
      }
      for (const line of sec.lines ?? []) {
        const glyph = typeof line === 'object' && typeof line.glyph === 'function' ? line.glyph : null;
        const indent = glyph ? S.body + 10 : 0;
        const right = typeof line === 'object' && line.right != null && line.right !== '' ? String(line.right) : null;
        let rightW = 0;
        if (right) {
          ctx.font = font(S.body, true);
          rightW = Math.min(w * 0.45, ctx.measureText(right).width) + 24;
        }
        const lines = wrap(ctx, typeof line === 'string' ? line : line.text, w - indent - rightW, font(S.body));
        lines.forEach((l, i) => {
          items.push({ kind: 'line', text: l, y, color: line.color ?? C.text, glyph: i === 0 ? glyph : null, indent, right: i === 0 ? right : null, rightW, rightColor: line.rightColor ?? line.color ?? C.text });
          y += lineH(S.body, 1.35);
        });
      }
      if (sec.lines?.length) y += 10;
      for (const bar of sec.bars ?? []) {
        items.push({ kind: 'bar', bar, y });
        y += BAR_ROW;
      }
      if (sec.bars?.length) y += 8;
      if (sec.lanes?.length) y = this._layoutLanes(sec.lanes, items, y, w);
      const cols = sec.columns ?? 2;
      const btns = sec.buttons ?? [];
      const bw = (w - GAP * (cols - 1)) / cols;
      for (let i = 0; i < btns.length; i += cols) {
        const row = btns.slice(i, i + cols);
        const h = row.some((b) => b.sub) ? BTN_SUB_H : BTN_H;
        row.forEach((b, j) => {
          const rect = { x: j * (bw + GAP), y, w: bw, h };
          this.rects.push({ id: b.id, rect, button: b });
          items.push({ kind: 'button', button: b, rect });
        });
        y += h + GAP;
      }
      y += 16;
    }
    this.contentH = y;
    return items;
  }

  render(ctx) {
    if (!this.builder || !this.menu) return;
    const C = THEME.color;
    const S = THEME.size;
    const m = this.menu;
    const sr = this.layout.safeRect;
    ctx.save();
    // Soft veil over the world (it stays visible).
    ctx.fillStyle = C.overlay;
    ctx.globalAlpha = Math.min(1, this.t / 0.2) * 0.6;
    ctx.fillRect(0, 0, sr.x * 2 + sr.w, this.rect().y + 40);
    ctx.globalAlpha = 1;
    const items = this._layout(ctx, this.bodyRect().w);
    const r = this.rect();
    // Sheet
    ctx.fillStyle = C.sheet;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(r.x, r.y, r.w, r.h, [44, 44, 0, 0]);
    else ctx.rect(r.x, r.y, r.w, r.h);
    ctx.fill();
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.fillStyle = m.accent ?? C.action;
    ctx.fillRect(r.x + r.w / 2 - 70, r.y + 14, 140, 10); // grab handle
    // Header: picture, title, subtitle, close
    const art = { x: r.x + PAD, y: r.y + 36, w: 180, h: 180 };
    if (m.art) {
      ctx.fillStyle = C.panelAlt;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(art.x, art.y, art.w, art.h, 28);
      else ctx.rect(art.x, art.y, art.w, art.h);
      ctx.fill();
      this.assets.drawContained(ctx, m.art, { x: art.x + 8, y: art.y + 8, w: art.w - 16, h: art.h - 16 });
      if (m.badge) {
        const bs = 78;
        const bx = art.x + art.w - bs + 14;
        const by = art.y + art.h - bs + 14;
        ctx.fillStyle = '#FFFFFF';
        ctx.strokeStyle = C.outline;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(bx + bs / 2, by + bs / 2, bs / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        this.assets.drawContained(ctx, m.badge, { x: bx + 6, y: by + 6, w: bs - 12, h: bs - 12 });
      }
    }
    const tx = m.art ? art.x + art.w + 28 : r.x + PAD;
    const tw = (this.helpRect() ?? this.closeRect()).x - 20 - tx;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    let tagW = 0;
    if (m.tag?.text) {
      ctx.font = font(S.small, true);
      tagW = Math.min(tw * 0.45, ctx.measureText(m.tag.text).width + 32);
    }
    ctx.fillStyle = C.text;
    ctx.font = font(S.title, true);
    const titleMax = tagW ? tw - tagW - 16 : tw;
    ctx.fillText(m.title ?? '', tx, r.y + 48, titleMax);
    if (tagW) {
      const titleW = Math.min(titleMax, ctx.measureText(m.title ?? '').width);
      const cx = tx + titleW + 16;
      ctx.fillStyle = m.tag.color ?? C.gold;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(cx, r.y + 54, tagW, 48, 24);
      else ctx.rect(cx, r.y + 54, tagW, 48);
      ctx.fill();
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = C.outline;
      ctx.font = font(S.small, true);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(m.tag.text, cx + tagW / 2, r.y + 79, tagW - 16);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
    }
    if (m.subtitle) {
      ctx.fillStyle = C.textMuted;
      ctx.font = font(S.body);
      wrap(ctx, m.subtitle, tw, font(S.body))
        .slice(0, 2)
        .forEach((l, i) => ctx.fillText(l, tx, r.y + 124 + i * 44, tw));
    }
    drawButton(ctx, this.closeRect(), '✕', { accent: C.outline });
    if (m.help) drawButton(ctx, this.helpRect(), '?', { accent: C.progress });
    for (const t of this.tabs ?? []) drawButton(ctx, this.tabRect(t.id), t.label, { active: t.id === this.currentTab.id, accent: C.progress, badge: t.badge ?? null, font: font(S.button, true) });
    // Body (scrolls)
    const b = this.bodyRect();
    ctx.save();
    ctx.beginPath();
    ctx.rect(b.x - 12, b.y, b.w + 24, b.h + 20);
    ctx.clip();
    ctx.translate(b.x, b.y - this.scrollY);
    for (const it of items) {
      if (it.kind === 'title') {
        ctx.fillStyle = C.actionDark;
        ctx.font = font(S.heading, true);
        ctx.textBaseline = 'top';
        ctx.fillText(it.text, 0, it.y + 4, b.w);
        if (it.dot) {
          const dx = Math.min(b.w - 20, ctx.measureText(it.text).width + 30);
          ctx.fillStyle = it.dot;
          ctx.strokeStyle = C.outline;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(dx, it.y + 4 + S.heading * 0.55, 13, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      } else if (it.kind === 'line') {
        ctx.fillStyle = it.color;
        ctx.font = font(S.body);
        ctx.textBaseline = 'top';
        if (it.glyph) {
          ctx.save();
          it.glyph(ctx, 0, it.y, S.body);
          ctx.restore();
          ctx.fillStyle = it.color;
        }
        ctx.fillText(it.text, it.indent ?? 0, it.y, b.w - (it.indent ?? 0) - (it.rightW ?? 0));
        if (it.right) {
          ctx.font = font(S.body, true);
          ctx.fillStyle = it.rightColor;
          ctx.textAlign = 'right';
          ctx.fillText(it.right, b.w, it.y, it.rightW - 24);
          ctx.textAlign = 'left';
        }
      } else if (it.kind === 'bar') this._bar(ctx, it.bar, it.y, b.w);
      else if (it.kind === 'laneHead') this._laneHead(ctx, it.button, it.rect);
      else if (it.kind === 'laneCard') this._laneCard(ctx, it.button, it.rect);
      else if (it.kind === 'laneEmpty') {
        ctx.fillStyle = C.textFaint;
        ctx.font = font(S.small);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(it.text, it.x, it.y, it.w);
        ctx.textAlign = 'left';
      } else this._button(ctx, it.button, it.rect);
    }
    ctx.restore();
    if (this.maxScroll > 0) {
      const barH = Math.max(80, (b.h * b.h) / this.contentH);
      const barY = b.y + (this.scrollY / this.maxScroll) * (b.h - barH);
      ctx.fillStyle = C.line;
      ctx.fillRect(r.x + r.w - 16, barY, 8, barH);
    }
    ctx.restore();
  }

  // Lanes side by side: a header button each, then their cards stacked. Returns the y under the tallest lane.
  _layoutLanes(lanes, items, y, w) {
    const n = lanes.length;
    const lw = (w - GAP * (n - 1)) / n;
    let bottom = y;
    lanes.forEach((lane, i) => {
      const x = i * (lw + GAP);
      const head = { x, y, w: lw, h: LANE_HEAD_H };
      this.rects.push({ id: lane.id, rect: head, button: lane });
      items.push({ kind: 'laneHead', button: lane, rect: head });
      let ly = y + LANE_HEAD_H + GAP;
      if (!lane.items?.length && lane.empty) {
        items.push({ kind: 'laneEmpty', text: lane.empty, x: x + lw / 2, y: ly + 10, w: lw - 12 });
        ly += 60;
      }
      for (const it of lane.items ?? []) {
        const rect = { x, y: ly, w: lw, h: LANE_CARD_H };
        this.rects.push({ id: it.id, rect, button: it });
        items.push({ kind: 'laneCard', button: it, rect });
        ly += LANE_CARD_H + GAP;
      }
      bottom = Math.max(bottom, ly);
    });
    return bottom + 8;
  }

  _laneHead(ctx, lane, rect) {
    const C = THEME.color;
    const S = THEME.size;
    drawButton(ctx, rect, '', { accent: lane.accent ?? C.progress, selected: !!lane.selected, disabled: !!lane.disabled });
    const cy = rect.y + (rect.h - 8) / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = lane.selected ? C.textOnDark : C.textOnAction;
    ctx.font = font(S.small + 4, true);
    ctx.fillText(lane.title, rect.x + rect.w / 2, lane.sub ? cy - 18 : cy, rect.w - 16);
    if (lane.sub) {
      ctx.font = font(S.small);
      ctx.fillText(lane.sub, rect.x + rect.w / 2, cy + 20, rect.w - 16);
    }
    ctx.textAlign = 'left';
  }

  _laneCard(ctx, it, rect) {
    const C = THEME.color;
    const S = THEME.size;
    const off = !!it.disabled;
    drawButton(ctx, rect, '', { accent: it.accent, selected: !!it.selected, disabled: off });
    const iconS = Math.min(rect.w - 40, 110);
    const ir = { x: rect.x + (rect.w - iconS) / 2, y: rect.y + 12, w: iconS, h: iconS };
    if (it.icon) {
      if (it.iconCrop && this.assets.drawCrop) this.assets.drawCrop(ctx, it.icon, it.iconCrop, ir);
      else this.assets.drawContained(ctx, it.icon, ir);
      if (it.iconBadge) {
        const bs = Math.round(iconS * 0.46);
        const bx = ir.x + ir.w - bs + 14;
        const by = ir.y + ir.h - bs + 4;
        ctx.fillStyle = '#FFFFFF';
        ctx.strokeStyle = C.outline;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(bx + bs / 2, by + bs / 2, bs / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        this.assets.drawContained(ctx, it.iconBadge, { x: bx + 4, y: by + 4, w: bs - 8, h: bs - 8 });
      }
    }
    if (it.tag) {
      ctx.font = font(S.small, true);
      const tw = Math.min(rect.w - 16, ctx.measureText(it.tag).width + 20);
      ctx.fillStyle = C.gold;
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = 3;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(rect.x + 8, rect.y + 8, tw, 38, 19);
      else ctx.rect(rect.x + 8, rect.y + 8, tw, 38);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = C.outline;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(it.tag, rect.x + 8 + tw / 2, rect.y + 28, tw - 8);
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = off ? C.textFaint : it.selected ? C.textOnDark : C.textOnAction;
    ctx.font = font(S.small, true);
    const ty = ir.y + iconS + 26;
    ctx.fillText(it.label, rect.x + rect.w / 2, ty, rect.w - 16);
    if (it.sub) {
      ctx.font = font(S.small);
      ctx.fillText(it.sub, rect.x + rect.w / 2, ty + 34, rect.w - 16);
    }
    ctx.textAlign = 'left';
  }

  // One bar row: the label on the left, the bar in the middle, its value on the right.
  _bar(ctx, bar, y, w) {
    const C = THEME.color;
    const S = THEME.size;
    const labelW = Math.min(340, w * 0.38);
    const textW = 96;
    const x = labelW + 16;
    const bw = Math.max(40, w - x - textW - 16);
    const bh = 30;
    const by = y + (BAR_ROW - 10 - bh) / 2;
    const frac = Math.max(0, Math.min(1, (bar.value ?? 0) / (bar.max ?? 100)));
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = C.text;
    ctx.font = font(S.small, true);
    ctx.fillText(bar.label, 0, by + bh / 2, labelW);
    ctx.fillStyle = C.track;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, by, bw, bh, bh / 2);
    else ctx.rect(x, by, bw, bh);
    ctx.fill();
    if (frac > 0) {
      ctx.fillStyle = bar.color ?? C.progress;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, by, Math.max(bh, bw * frac), bh, bh / 2);
      else ctx.rect(x, by, bw * frac, bh);
      ctx.fill();
    }
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, by, bw, bh, bh / 2);
    else ctx.rect(x, by, bw, bh);
    ctx.stroke();
    if (bar.tick != null) {
      // (CAREWORKS Milestone 16: an optional target tick — a short upright mark across the bar at tick / max)
      const tx = x + bw * Math.max(0, Math.min(1, bar.tick / (bar.max ?? 100)));
      ctx.strokeStyle = C.text;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(tx, by - 6);
      ctx.lineTo(tx, by + bh + 6);
      ctx.stroke();
    }
    ctx.textAlign = 'right';
    ctx.fillStyle = C.text;
    ctx.font = font(S.small, true);
    ctx.fillText(bar.text ?? String(Math.round(bar.value ?? 0)), w, by + bh / 2, textW);
    ctx.textAlign = 'left';
  }

  _button(ctx, bt, rect) {
    const C = THEME.color;
    const S = THEME.size;
    const off = bt.disabled || bt.locked;
    drawButton(ctx, rect, '', { accent: bt.accent, disabled: off, badge: bt.badge ?? null });
    const iconS = Math.min(rect.h - 36, 96);
    let x = rect.x + 20;
    if (bt.icon) {
      if (bt.locked) ctx.globalAlpha = 0.4;
      const ir = { x, y: rect.y + (rect.h - 8 - iconS) / 2, w: iconS, h: iconS };
      // iconCrop (DEVWORKS Milestone 14, optional): { x, y, w, h } fractions of the picture, e.g. a portrait's head.
      if (bt.iconCrop && this.assets.drawCrop) this.assets.drawCrop(ctx, bt.icon, bt.iconCrop, ir);
      else this.assets.drawContained(ctx, bt.icon, ir);
      if (bt.iconBadge) {
        const bs = Math.round(iconS * 0.5);
        const bx = ir.x + ir.w - bs + 8;
        const by = ir.y + ir.h - bs + 6;
        ctx.fillStyle = '#FFFFFF';
        ctx.strokeStyle = C.outline;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(bx + bs / 2, by + bs / 2, bs / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        this.assets.drawContained(ctx, bt.iconBadge, { x: bx + 4, y: by + 4, w: bs - 8, h: bs - 8 });
      }
      ctx.globalAlpha = 1;
      x += iconS + 16;
    }
    let w = rect.x + rect.w - 16 - x;
    if (bt.cost != null && bt.cost !== '') {
      // DEVWORKS Milestone 40b: the cost on the right.
      ctx.font = font(S.small, true);
      const tw = Math.min(ctx.measureText(String(bt.cost)).width, rect.w * 0.34);
      const cw = tw + 28;
      const ch = Math.min(56, rect.h - 36);
      const cx = rect.x + rect.w - (bt.locked ? 76 : 16) - cw;
      const cy0 = rect.y + (rect.h - 8 - ch) / 2;
      ctx.fillStyle = off ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.88)';
      ctx.beginPath();
      ctx.roundRect(cx, cy0, cw, ch, ch / 2);
      ctx.fill();
      ctx.fillStyle = off ? C.textFaint : C.text;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(bt.cost), cx + cw / 2, cy0 + ch / 2, tw);
      w -= cw + 12;
    }
    if (bt.locked) {
      drawPadlock(ctx, rect.x + rect.w - 56, rect.y + (rect.h - 8) / 2, 32, C.textFaint);
      w -= 60;
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = off ? C.textFaint : C.textOnAction;
    ctx.font = font(S.button, true);
    const cy = rect.y + (rect.h - 8) / 2;
    ctx.fillText(bt.label, x, bt.sub ? cy - 22 : cy, w);
    if (bt.sub) {
      ctx.font = font(S.small, true);
      ctx.fillStyle = off ? C.textFaint : C.textOnAction;
      ctx.fillText(bt.sub, x, cy + 24, w);
    }
  }
}

function wrap(ctx, str, w, f) {
  ctx.font = f;
  const out = [];
  let line = '';
  for (const word of String(str ?? '').split(' ')) {
    const t = line ? `${line} ${word}` : word;
    if (ctx.measureText(t).width > w && line) {
      out.push(line);
      line = word;
    } else line = t;
  }
  if (line) out.push(line);
  return out;
}
