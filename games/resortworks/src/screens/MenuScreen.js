// Main Menu (Milestone 0): the RESORTWORKS title (drawn in code until title art exists), then Continue (the last-used
// slot; hidden when there is no resort yet), Campaign Slots, New Game and Settings.
// Layout and tapping share one pass (lay out → draw and/or hit-test), so they can never disagree.
import { THEME, font } from '../../../../core/Theme.js';
import { drawButton, hitRect } from '../../../../core/ui/Button.js';
import { text } from '../../../../core/ui/Kit.js';
import { paletteById } from '../../data/setup.js';

const C = THEME.color;
const S = THEME.size;
const BTN_H = 130;
const GAP = 28;
const TITLE_H = 420; // the sun, the name and the line under it
const TEAL = '#1FA3A0';

// continueInfo(): { n, summary } of the last-used slot, or null.
export function createMenuScreen({ layout, continueInfo, onContinue, onSlots, onNewGame, onSettings }) {
  const rects = {};

  function pass(ctx, tap) {
    for (const k of Object.keys(rects)) delete rects[k];
    const sr = layout.safeRect;
    const cx = sr.x + sr.w / 2;
    const li = continueInfo();
    let hit = null;
    const rows = [
      li && ['continue', 'Continue', () => onContinue(li.n), C.action],
      ['slots', 'Campaign Slots', onSlots, C.progress],
      ['new', 'New Game', onNewGame, li ? C.progress : C.action],
      ['settings', 'Settings', onSettings, C.progress],
    ].filter(Boolean);
    const blockH = TITLE_H + 80 + rows.length * (BTN_H + GAP) + (li ? 60 : 0);
    let y = sr.y + Math.max(60, (sr.h - blockH) / 2 - 40);
    if (ctx) drawTitle(ctx, cx, y, sr.w);
    y += TITLE_H + 80;
    const bw = Math.min(sr.w - 120, 820);
    for (const [id, label, fn, accent] of rows) {
      const r = { x: cx - bw / 2, y, w: bw, h: BTN_H };
      rects[id] = r;
      if (ctx) drawButton(ctx, r, label, { accent, font: font(id === 'continue' ? 44 : S.button, true) });
      if (tap && !hit && hitRect(tap, r)) hit = fn;
      y += BTN_H;
      if (id === 'continue') {
        if (ctx) {
          const m = li.summary;
          text(ctx, `Slot ${li.n} · ${m.resort} · Year ${m.year}, Month ${m.month}`, cx, y + 10, { size: S.small, bold: true, color: paletteById(m.palette).dark, align: 'center', maxWidth: bw });
        }
        y += 60;
      }
      y += GAP;
    }
    return hit;
  }

  // A low sun over two waves, then the name: a resort by the sea, drawn in code.
  function drawTitle(ctx, cx, y, w) {
    ctx.save();
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 8;
    ctx.lineJoin = 'round';
    ctx.fillStyle = '#FFC94A';
    ctx.beginPath();
    ctx.arc(cx, y + 120, 90, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    for (const [dy, col] of [[0, TEAL], [36, '#7FD3CF']]) {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(cx - 220, y + 130 + dy);
      for (let i = 0; i < 4; i++) ctx.quadraticCurveTo(cx - 220 + i * 110 + 55, y + 100 + dy, cx - 220 + (i + 1) * 110, y + 130 + dy);
      ctx.lineTo(cx + 220, y + 160 + dy);
      ctx.lineTo(cx - 220, y + 160 + dy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.font = font(140, true);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.lineWidth = 18;
    ctx.strokeText('RESORTWORKS', cx, y + 220, w - 80);
    ctx.fillStyle = TEAL;
    ctx.fillText('RESORTWORKS', cx, y + 220, w - 80);
    ctx.restore();
    text(ctx, 'Grow a roadside motel into a world-class resort.', cx, y + 375, { size: S.body, bold: true, color: C.textMuted, align: 'center', maxWidth: w - 80 });
  }

  return {
    onTap(p) {
      pass(null, p)?.();
    },
    onBack() {
      return false; // the Main Menu is a root: the next Back leaves the app
    },
    render(ctx) {
      pass(ctx, null);
    },
    // Screen rect of a button (tests): 'continue', 'slots', 'new', 'settings'.
    rectOf(id) {
      pass(null, null);
      return rects[id] ?? null;
    },
  };
}
