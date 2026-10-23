// Cheap life for full-body character art (bible §34.2): no animation frames, just
//   - a 2–4 px bob while walking (plus an optional small sway: walkTiltRad in the game's motion numbers),
//   - a small tilt while working,
//   - a left/right flip for the way they face.
// Optional waddle (BOTWORKS fixes queue, 30 Sept) — every field below is off unless a game's motion sets it:
//   walkSquash  a tiny squash on each footfall (0.035 = 3.5% shorter and wider), springing back between steps;
//   settleSec   after a walk the sway eases back to upright over this long instead of snapping (needs agent.stateTime).
// characterPose() works out the numbers; drawCharacter() draws a cached sprite with them.
export const MOTION = {
  walkBobPx: 3, // height of each step hop (logical px)
  walkStepsPerSec: 3.2,
  workTiltRad: 0.07, // ~4°
  workTiltPerSec: 1.4,
  workBobPx: 1.5,
  idleBreathPx: 0.8,
  idleBreathPerSec: 0.45,
};

// agent: { state: 'walking' | 'working' | 'idle', facing: 1 | -1, stateTime }
// seed: any number that differs per character so they don't move in step.
export function characterPose(agent, time, seed = 0, out = { bob: 0, tilt: 0, flip: 1 }, m = MOTION) {
  const t = time + seed * 0.37;
  out.flip = agent.facing < 0 ? -1 : 1;
  out.tilt = 0;
  out.sx = 1;
  out.sy = 1;
  if (agent.state === 'walking') {
    const s = Math.sin(t * Math.PI * m.walkStepsPerSec);
    out.bob = -Math.abs(s) * m.walkBobPx;
    // Optional sway from foot to foot, one side per hop (DEVWORKS Milestone 5); off unless the game's motion sets it.
    out.tilt = s * (m.walkTiltRad ?? 0);
    if (m.walkSquash) {
      const k = Math.pow(1 - Math.abs(s), 4); // 1 as the foot lands, gone by mid-step
      out.sy = 1 - m.walkSquash * k;
      out.sx = 1 + m.walkSquash * k;
    }
    out.walkTilt = out.tilt; // where the sway was, for settling when they stop
  } else {
    if (agent.state === 'working') {
      out.tilt = Math.sin(t * Math.PI * 2 * m.workTiltPerSec) * m.workTiltRad;
      out.bob = -Math.abs(Math.sin(t * Math.PI * 2 * m.workTiltPerSec)) * m.workBobPx;
    } else {
      out.bob = -(Math.sin(t * Math.PI * 2 * m.idleBreathPerSec) * 0.5 + 0.5) * m.idleBreathPx;
    }
    if (m.settleSec && out.walkTilt) {
      const left = 1 - (agent.stateTime ?? Infinity) / m.settleSec;
      if (left > 0) out.tilt += out.walkTilt * left * left;
      else out.walkTilt = 0;
    }
  }
  return out;
}

// Draw a character standing with their feet at (x, y), w×h logical px, using a pose.
export function drawCharacter(ctx, assets, key, x, y, w, h, pose) {
  const sprite = assets.sprite(key, w, h);
  if (!sprite) {
    assets.drawPlaceholder(ctx, key, x - w / 2, y - h, w, h);
    return;
  }
  const ps = assets.sprites.pixelScale;
  ctx.save();
  ctx.translate(Math.round(x * ps) / ps, Math.round((y + pose.bob) * ps) / ps);
  if (pose.tilt) ctx.rotate(pose.tilt);
  const sx = (pose.sx ?? 1) * (pose.flip < 0 ? -1 : 1);
  const sy = pose.sy ?? 1;
  if (sx !== 1 || sy !== 1) ctx.scale(sx, sy); // flip and footfall squash, about the feet
  ctx.drawImage(sprite, -w / 2, -h, w, h);
  ctx.restore();
}
