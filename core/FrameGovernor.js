// Frame-rate governor (BOTWORKS Milestone 27, bible §40; any series game): keeps a slow phone steady instead of stuttering.
// The simulation always runs on real time (core/FixedStepLoop's fixed steps), so the game never slows down or skips
// ahead — only how often the picture is drawn changes.
//   mode 'high'  draw every frame (60 FPS)
//   mode 'low'   draw every 2nd frame (a steady 30 FPS, less battery)
//   mode 'auto'  60, falling back to 30 when the phone can't hold 60 for `downAfterSec`, and back to 60 once the work
//                per drawn frame has fitted comfortably inside a 60 FPS frame for `upAfterSec`
//   const gov = new FrameGovernor({ mode }); loop.governor = gov
//   capFps: true (DEVWORKS Milestone 39) — the loop draws by time at gov.targetFps (60 / 30) on any refresh rate
//   gov.frame(frameMs, workMs) — the loop reports every animation frame: time since the last one, and the time the
//   last drawn frame took to update + draw; gov.renderEvery → 1 or 2; gov.state → 'full' | 'half'; gov.switches
export class FrameGovernor {
  constructor({ mode = 'auto', slowFrameMs = 20, downAfterSec = 3, upAfterSec = 5, upWorkMs = 7.5, bus = null, capFps = false } = {}) {
    this.capFps = capFps; // DEVWORKS Milestone 39: the loop draws by time at targetFps (a high-refresh screen gets 60 / 30 too)
    this.slowFrameMs = slowFrameMs; // an average frame slower than this (under ~50 FPS) is "not holding 60"
    this.downAfterSec = downAfterSec;
    this.upAfterSec = upAfterSec;
    this.upWorkMs = upWorkMs; // work per drawn frame this small leaves room for 60 again
    this.bus = bus;
    this.switches = 0;
    this.setMode(mode);
  }

  setMode(mode) {
    this.mode = ['auto', 'high', 'low'].includes(mode) ? mode : 'auto';
    this.state = this.mode === 'low' ? 'half' : 'full';
    this._slowFor = 0;
    this._fastFor = 0;
    this._avg = 0;
  }

  get targetFps() {
    return this.state === 'half' ? 30 : 60;
  }

  get renderEvery() {
    return this.state === 'half' ? 2 : 1;
  }

  frame(frameMs, workMs) {
    if (this.mode !== 'auto' || !(frameMs > 0)) return;
    const sec = Math.min(frameMs, 250) / 1000; // a long gap (tab hidden, a breakpoint) counts as a quarter second at most
    if (this.state === 'full') {
      this._avg = this._avg ? this._avg + (frameMs - this._avg) * 0.1 : frameMs;
      this._slowFor = this._avg > this.slowFrameMs ? this._slowFor + sec : 0;
      if (this._slowFor >= this.downAfterSec) this._set('half');
    } else {
      this._fastFor = workMs <= this.upWorkMs ? this._fastFor + sec : 0;
      if (this._fastFor >= this.upAfterSec) this._set('full');
    }
  }

  _set(state) {
    this.state = state;
    this._slowFor = 0;
    this._fastFor = 0;
    this._avg = 0;
    this.switches++;
    this.bus?.emit('perf:fps', { state, fps: state === 'half' ? 30 : 60 });
  }
}
