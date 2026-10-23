// FPS / loop timing / log overlay. Only active when the page URL has ?debug=1 (never in a store release build).
// Drawn in logical units on top of everything, inside the safe area.
import { RELEASE } from './BuildFlags.js';

export class DebugOverlay {
  constructor({ loop, renderer, layout = null, input = null, bus = null, maxLines = 8, top = 16 } = {}) {
    this.enabled = DebugOverlay.isRequested();
    this.loop = loop;
    this.renderer = renderer;
    this.layout = layout;
    this.input = input;
    this.maxLines = maxLines;
    this.top = top; // gap from the safe-area top, logical units
    this.lines = [];
    this.compact = false; // one FPS line at the very top of the safe area (for busy screens)

    if (!this.enabled) return;
    bus?.on('loop:pause', ({ reason }) => this.log(`paused (${reason})`));
    bus?.on('loop:resume', ({ reason }) => this.log(`resumed (${reason})`));
    bus?.on('screen:change', ({ from, to }) => this.log(`screen ${from ?? '-'} → ${to}`));
    bus?.on('asset:missing', ({ key }) => this.log(`missing asset: ${key}`));
    bus?.on('renderer:resize', (r) =>
      this.log(`resize ${r.viewport.w}×${r.viewport.h} scale ${r.scale.toFixed(3)} dpr ${r.dpr}`),
    );
    window.addEventListener('error', (e) => this.log(`ERROR ${e.message}`));
    window.addEventListener('unhandledrejection', (e) => this.log(`REJECT ${e.reason}`));
  }

  static isRequested() {
    if (RELEASE) return false;
    return new URLSearchParams(window.location.search).get('debug') === '1';
  }

  log(msg) {
    if (!this.enabled) return;
    const t = (performance.now() / 1000).toFixed(1);
    this.lines.push(`${t}s ${msg}`);
    if (this.lines.length > this.maxLines) this.lines.shift();
  }

  render(ctx) {
    if (!this.enabled || this.hidden) return; // hidden: tests taking clean screenshots
    const s = this.loop.stats;
    const r = this.renderer;
    const sr = this.layout?.safeRect ?? { x: 0, y: 0, w: r.width, h: r.height };
    if (this.compact) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.72)';
      ctx.fillRect(sr.x + 16, sr.y, 520, 24);
      ctx.font = "20px ui-monospace, Consolas, monospace";
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#7CFFB2';
      ctx.fillText(`FPS ${s.fps.toFixed(1)}  frame ${s.frameMs.toFixed(1)}ms (max ${s.frameMsMax.toFixed(1)})  render ${s.renderMs.toFixed(2)}ms`, sr.x + 24, sr.y + 2, 504);
      ctx.restore();
      return;
    }
    const x = sr.x + 16;
    const y = sr.y + this.top;
    const w = 520;
    const lineH = 30;

    const info = [
      `FPS ${s.fps.toFixed(1)}   frame ${s.frameMs.toFixed(2)}ms (max ${s.frameMsMax.toFixed(1)})`,
      `step ${this.loop.stepMs.toFixed(2)}ms  steps/frame ${s.stepsLastFrame}  dropped ${s.droppedSteps}`,
      `update ${s.updateMs.toFixed(2)}ms  render ${s.renderMs.toFixed(2)}ms  ticks ${this.loop.stepCount}`,
      `${this.loop.paused ? 'PAUSED' : 'running'}  view ${r.viewport.w}×${r.viewport.h}  scale ${r.scale.toFixed(3)}  dpr ${r.dpr}`,
    ];
    if (this.layout) {
      const i = this.layout.insets;
      info.push(`safe T${i.top.toFixed(0)} R${i.right.toFixed(0)} B${i.bottom.toFixed(0)} L${i.left.toFixed(0)} (logical)`);
    }
    if (this.input?.last) {
      info.push(`pointer ${this.input.last.x.toFixed(1)}, ${this.input.last.y.toFixed(1)}`);
    }

    const graphH = 60;
    const h = 16 + (info.length + this.lines.length) * lineH + graphH + 24;

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(x, y, w, h);
    ctx.font = '22px ui-monospace, Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    let ty = y + 10;
    ctx.fillStyle = '#7CFFB2';
    for (const line of info) {
      ctx.fillText(line, x + 10, ty, w - 20);
      ty += lineH;
    }

    // Frame-time graph: flat line = steady timing. Dashed line marks one step (60 Hz = 16.7ms).
    const gx = x + 10;
    const gy = ty + 4;
    const gw = w - 20;
    const maxMs = 50;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(gx, gy, gw, graphH);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.setLineDash([6, 6]);
    const stepY = gy + graphH - (this.loop.stepMs / maxMs) * graphH;
    ctx.beginPath();
    ctx.moveTo(gx, stepY);
    ctx.lineTo(gx + gw, stepY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = '#FFD166';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const hist = s.history;
    const n = hist.length;
    for (let i = 0; i < n; i++) {
      const v = Math.min(hist[(s.historyIndex + i) % n], maxMs);
      const px = gx + (i / (n - 1)) * gw;
      const py = gy + graphH - (v / maxMs) * graphH;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.stroke();
    ty = gy + graphH + 10;

    ctx.fillStyle = '#E0E0E0';
    for (const line of this.lines) {
      ctx.fillText(line, x + 10, ty, w - 20);
      ty += lineH;
    }
    ctx.restore();
  }
}
