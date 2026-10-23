// Milestone 0 test screen (?screen=test, or Settings → Display test): the RESORTWORKS title, a tap marker where you touch, a circle that must stay round,
// a spinner that stops while paused, the asset-loader pair (real image + missing file) and the button that
// opens the placeholder bottom sheet. The red frame and corner labels show clipping; the green dashed box is the safe area.
import { THEME, font } from '../../../../core/Theme.js';
import { drawButton, hitRect } from '../../../../core/ui/Button.js';

const C = THEME.color;
const S = THEME.size;

export function createTestScreen({ renderer, layout, assets, openSheet, onTapLogged }) {
  const W = renderer.width;
  return {
    enter() {
      this.time = 0;
      this.angle = 0;
      this.tap = null; // last tap { x, y, age }
    },

    sheetButton() {
      return layout.anchor('bottom', 640, THEME.button.minH + 20, 60);
    },

    // Circle centre and radius, from the live safe area.
    dial() {
      const sr = layout.safeRect;
      return { x: W / 2, y: sr.y + sr.h * 0.38, r: 200 };
    },

    update(dt) {
      this.time += dt;
      this.angle += dt * Math.PI; // half a turn per second
      if (this.tap) this.tap.age += dt;
    },

    onTap(p) {
      if (hitRect(p, this.sheetButton())) {
        openSheet();
        return;
      }
      this.tap = { x: p.x, y: p.y, age: 0 };
      onTapLogged?.(p);
    },

    render(ctx) {
      const H = renderer.height;
      const sr = layout.safeRect;
      drawFrame(ctx, W, H, sr);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = C.text;
      ctx.font = font(120, true);
      ctx.fillText('RESORTWORKS', W / 2, sr.y + 280, W - 80);
      ctx.fillStyle = C.actionDark;
      ctx.font = font(S.heading, true);
      ctx.fillText('Milestone 0 — project shell', W / 2, sr.y + 370);
      ctx.fillStyle = C.textMuted;
      ctx.font = font(S.small);
      ctx.fillText('Tap anywhere: the cross should sit exactly under your finger.', W / 2, sr.y + 430, W - 80);

      // Round-ness check + a spinner driven by the fixed-step update (freezes while paused).
      const d = this.dial();
      ctx.strokeStyle = C.progress;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeRect(d.x - d.r, d.y - d.r, d.r * 2, d.r * 2);
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(this.angle);
      ctx.fillStyle = C.action;
      ctx.fillRect(-10, -d.r + 30, 20, d.r - 50);
      ctx.restore();
      ctx.fillStyle = C.textMuted;
      ctx.font = font(S.small);
      ctx.fillText(`must be round · sim time ${this.time.toFixed(1)}s`, W / 2, d.y + d.r + 40);

      // Asset loader: one real image, one missing path (must show the placeholder box).
      const box = 240;
      const top = d.y + d.r + 90;
      [
        ['m0Real', 'real image', W / 2 - box - 40],
        ['m0Missing', 'missing file', W / 2 + 40],
      ].forEach(([key, label, x]) => {
        assets.draw(ctx, key, x, top, box, box);
        ctx.fillStyle = C.textMuted;
        ctx.font = font(S.small);
        ctx.textBaseline = 'top';
        ctx.fillText(label, x + box / 2, top + box + 12);
        ctx.textBaseline = 'middle';
      });

      drawButton(ctx, this.sheetButton(), 'Open test sheet');
      if (this.tap) drawTapMarker(ctx, this.tap, W);
    },
  };
}

// Red border on the logical edge + corner labels (any cut off = clipping). Green dashed box = safe area.
function drawFrame(ctx, W, H, sr) {
  ctx.strokeStyle = C.bad;
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, W - 8, H - 8);
  ctx.fillStyle = C.bad;
  ctx.font = 'bold 26px ui-monospace, Consolas, monospace';
  const m = 16;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText('0,0', m, m + 24);
  ctx.textAlign = 'right';
  ctx.fillText(`${W},0`, W - m, m + 24);
  ctx.textBaseline = 'bottom';
  ctx.fillText(`${W},${H}`, W - m, H - m);
  ctx.textAlign = 'left';
  ctx.fillText(`0,${H}`, m, H - m);
  if (sr.x > 0 || sr.y > 0 || sr.w < W || sr.h < H) {
    ctx.strokeStyle = C.good;
    ctx.lineWidth = 4;
    ctx.setLineDash([16, 12]);
    ctx.strokeRect(sr.x + 2, sr.y + 2, sr.w - 4, sr.h - 4);
    ctx.setLineDash([]);
  }
}

function drawTapMarker(ctx, tap, W) {
  const { x, y } = tap;
  ctx.strokeStyle = C.outline;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x - 50, y);
  ctx.lineTo(x + 50, y);
  ctx.moveTo(x, y - 50);
  ctx.lineTo(x, y + 50);
  ctx.stroke();
  ctx.strokeStyle = C.action;
  ctx.beginPath();
  ctx.arc(x, y, 28, 0, Math.PI * 2);
  ctx.stroke();
  const pulse = Math.max(0, 1 - tap.age * 2);
  if (pulse > 0) {
    ctx.globalAlpha = pulse;
    ctx.beginPath();
    ctx.arc(x, y, 28 + (1 - pulse) * 60, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  const label = `${x.toFixed(1)}, ${y.toFixed(1)}`;
  ctx.font = 'bold 30px ui-monospace, Consolas, monospace';
  ctx.textBaseline = 'middle';
  const right = x < W - 320;
  ctx.textAlign = right ? 'left' : 'right';
  const tx = right ? x + 60 : x - 60;
  const ty = y < 80 ? y + 60 : y - 60;
  const tw = ctx.measureText(label).width;
  ctx.fillStyle = C.chip;
  ctx.fillRect(right ? tx - 8 : tx - tw - 8, ty - 22, tw + 16, 44);
  ctx.fillStyle = C.textOnDark;
  ctx.fillText(label, tx, ty);
}
