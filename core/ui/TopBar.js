// The slim top bar every series game shows over its home place (style guide §2):
//   row 1: "‹ Back" (every screen but home), the date, Inbox (unread badge) and Help
//   row 2: the stats chip (money, premium currency, rank… — the game says which) and big Pause / 1× / 2× / 4×
//          (a speed the game has not unlocked yet shows a padlock)
// Everything game-specific arrives as options, so each game only supplies its content:
//   clock        core/Clock (or anything with paused, speed, speeds, canUseSpeed(s), togglePause(), setSpeed(s),
//                dateOf(days), totalDays) — the date shown and what Pause / the speeds change
//   stats()      → [{ icon?, iconSize? (52), text, color?, gap? (12) }] the chip, left to right (the last one squeezes)
//   statsBad()   → true draws the chip in the failure colours (e.g. in debt)
//   onStats()    tap on the chip (e.g. open Finance)
//   onInbox(), onHelp(), inboxCount() → unread number for the Inbox badge; helpCount() → a badge on Help (optional)
//   home         true on the home screen (no back button, the long date)
//   back         { label, onTap } replaces the default back button; onHome() + homeLabel are the default
//   accent()     → a colour for a thin stripe along the top (looks only), or null
//   dateTag()    → a short tag drawn before the date (e.g. "Postgame"), or null
//   note()       → a short note under the date's right end (e.g. "Saved ✓"), or null
//   canControl() → false ignores Pause / speed taps (e.g. the company has closed)
//   onLockedSpeed(speed, rect) — a padlocked speed was tapped (show why)
import { THEME, font } from '../Theme.js';
import { drawButton, hitRect } from './Button.js';
import { text } from './Kit.js';
const COL = THEME.color;
const S = THEME.size;

export const TOP_BAR_HEIGHT = 250;
const ROW1 = { y: 10, h: 110 };
const ROW2 = { y: 130, h: 110 };
const SPEED_W = { pause: 150, speed: 108, locked: 124 };

// Where the bar sits (same on every screen), for effects that land on it.
export function topBarRect(layout) {
  const sr = layout.safeRect;
  return layout.anchor('top', sr.w - 32, TOP_BAR_HEIGHT, 16);
}

// The stats chip: row 2, left of Pause and the speed buttons.
export function statsRect(layout, speeds = [1, 2, 4], locked = () => false) {
  const r = topBarRect(layout);
  const sw = SPEED_W.pause + speeds.reduce((t, s) => t + (locked(s) ? SPEED_W.locked : SPEED_W.speed) + 10, 0) + 10;
  return { x: r.x + 16, y: r.y + ROW2.y, w: r.w - 32 - sw, h: ROW2.h };
}

export function createTopBar({
  layout,
  assets,
  clock,
  stats = () => [],
  statsBad = () => false,
  onStats = null,
  onInbox = null,
  onHelp = null,
  inboxCount = () => 0,
  helpCount = () => 0,
  home = false,
  back = null,
  onHome = null,
  homeLabel = '‹ Home',
  accent = () => null,
  dateTag = () => null,
  note = () => null,
  canControl = () => true,
  onLockedSpeed = null,
}) {
  const rect = () => topBarRect(layout);
  const chipRect = () => statsRect(layout, clock.speeds, (s) => !clock.canUseSpeed(s));

  const helpRect = () => {
    const r = rect();
    return { x: r.x + r.w - 16 - 150, y: r.y + ROW1.y, w: 150, h: ROW1.h };
  };
  const inboxRect = () => {
    const r = rect();
    return { x: r.x + r.w - 16 - 150 - 12 - 180, y: r.y + ROW1.y, w: 180, h: ROW1.h };
  };
  const backRect = () => {
    if (home) return null;
    const r = rect();
    return { x: r.x + 16, y: r.y + ROW1.y, w: 250, h: ROW1.h };
  };

  // Pause and the speeds, right of the chip; plus the back button (id 'home') so tests / a guide can find them.
  function buttons() {
    const r = rect();
    const m = chipRect();
    const y = r.y + ROW2.y;
    const list = [{ id: 'pause', label: clock.paused ? 'Paused' : 'Pause', x: m.x + m.w + 10, w: SPEED_W.pause, active: clock.paused }];
    let x = m.x + m.w + 10 + SPEED_W.pause + 10;
    for (const s of clock.speeds) {
      const locked = !clock.canUseSpeed(s);
      const w = locked ? SPEED_W.locked : SPEED_W.speed;
      list.push({ id: `speed${s}`, label: `${s}×`, x, w, active: !clock.paused && clock.speed === s, speed: s, locked });
      x += w + 10;
    }
    const out = list.map((b) => ({ ...b, rect: { x: b.x, y, w: b.w, h: ROW2.h } }));
    const br = backRect();
    if (br) out.push({ id: 'home', label: back?.label ?? homeLabel, rect: br, onTap: back?.onTap ?? (() => onHome?.()) });
    return out;
  }

  function drawStats(ctx) {
    const m = chipRect();
    const bad = statsBad();
    ctx.fillStyle = bad ? COL.panelBad : COL.panel;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(m.x, m.y + 4, m.w, m.h - 8, 26);
    else ctx.rect(m.x, m.y + 4, m.w, m.h - 8);
    ctx.fill();
    ctx.strokeStyle = bad ? COL.bad : COL.outline;
    ctx.lineWidth = 4;
    ctx.stroke();
    const cy = m.y + m.h / 2;
    let x = m.x + 12;
    const list = stats();
    list.forEach((st, i) => {
      if (st.icon) {
        const s = st.iconSize ?? 52;
        assets.drawContained(ctx, st.icon, { x, y: cy - s / 2, w: s, h: s });
        x += s + 4;
      }
      const last = i === list.length - 1;
      text(ctx, st.text, x, cy, { size: S.body, bold: true, baseline: 'middle', color: st.color ?? COL.text, maxWidth: last ? m.x + m.w - x - 10 : undefined });
      x += ctx.measureText(st.text).width + (st.gap ?? 12);
    });
  }

  const bar = {
    rect,
    buttons,
    statsRect: chipRect,
    helpRect,
    inboxRect,
    backRect,
    contains: (p) => hitRect(p, rect()),
    // Returns true if the tap was on the bar (used, even between buttons).
    handleTap(p) {
      if (!hitRect(p, rect())) return false;
      if (hitRect(p, chipRect())) {
        onStats?.();
        return true;
      }
      if (hitRect(p, inboxRect())) {
        onInbox?.();
        return true;
      }
      if (hitRect(p, helpRect())) {
        onHelp?.();
        return true;
      }
      const b = buttons().find((x) => hitRect(p, x.rect));
      if (!b) return true;
      if (b.id === 'home') {
        b.onTap();
        return true;
      }
      if (!canControl()) return true;
      if (b.id === 'pause') clock.togglePause();
      else if (b.speed && b.locked) onLockedSpeed?.(b.speed, b.rect);
      else if (b.speed) clock.setSpeed(b.speed);
      return true;
    },
    render(ctx) {
      const r = rect();
      ctx.save();
      ctx.fillStyle = COL.sheet;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(r.x, r.y, r.w, r.h, 30);
      else ctx.rect(r.x, r.y, r.w, r.h);
      ctx.fill();
      ctx.strokeStyle = COL.outline;
      ctx.lineWidth = 4;
      ctx.stroke();
      const stripe = accent();
      if (stripe) {
        ctx.fillStyle = stripe;
        ctx.fillRect(r.x + 44, r.y + 4, r.w - 88, 7);
      }
      const br = backRect();
      const dateX = br ? br.x + br.w + 20 : r.x + 28;
      const dateW = inboxRect().x - 16 - dateX;
      const d = clock.dateOf(clock.totalDays);
      const tag = dateTag();
      let tx = dateX;
      if (tag) {
        ctx.font = font(S.small, true);
        const tw = ctx.measureText(tag).width + 32;
        const cy = r.y + ROW1.y + ROW1.h / 2;
        ctx.fillStyle = COL.gold;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(tx, cy - 24, tw, 48, 24);
        else ctx.rect(tx, cy - 24, tw, 48);
        ctx.fill();
        text(ctx, tag, tx + tw / 2, cy, { size: S.small, bold: true, align: 'center', baseline: 'middle', color: COL.textOnDark });
        tx += tw + 14;
      }
      const long = home && !tag;
      const label = long ? `Year ${d.year} · Month ${d.month} · Day ${d.day}` : home ? `Year ${d.year} · M${d.month} · D${d.day}` : `Y${d.year} · M${d.month} · D${d.day}`;
      text(ctx, label, tx, r.y + ROW1.y + ROW1.h / 2, { size: home ? S.heading : S.body, bold: true, baseline: 'middle', maxWidth: dateX + dateW - tx });
      const n = note();
      if (n) text(ctx, n, dateX + dateW, r.y + ROW1.y + ROW1.h - 6, { size: S.small, bold: true, align: 'right', baseline: 'bottom', color: COL.good });
      const unread = inboxCount() ?? 0;
      drawButton(ctx, inboxRect(), 'Inbox', { accent: COL.progress, badge: unread ? (unread > 99 ? '99+' : unread) : null });
      const helpN = helpCount() ?? 0;
      drawButton(ctx, helpRect(), 'Help', { accent: COL.progress, badge: helpN ? (helpN > 99 ? '99+' : helpN) : null });
      drawStats(ctx);
      for (const b of buttons()) {
        drawButton(ctx, b.rect, b.label, { active: b.active, locked: b.locked, accent: b.id === 'pause' ? COL.warn : b.id === 'home' ? COL.progress : COL.action, font: font(S.button, true) });
      }
      ctx.restore();
    },
  };
  return bar;
}
