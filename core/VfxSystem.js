// Pooled visual effects (bible §36, caps in §40).
//   - sprite effects: art from the game (bursts, pops, flashes), scaled/faded in code
//   - procedural: sparks, dust puff, selection pulse ring, confetti, floating numbers/text
//   - a full-screen flash for the biggest moments
// Two layers: 'world' (a screen draws it under its camera) and 'screen' (drawn on top of everything).
// Every effect comes from a fixed pool made up front, so nothing is created while the game runs
// and the caps can never be passed: particles 140 (70 on Low), floating texts 18, effects 64.
// Reduced Flashes: no bright full-screen flash (a soft fade instead), gentle pops, half the particles.
// Milestone 25 (Robot Workshop): the rest of the §36 procedural set — button ripple, progress sparkle, electric arc,
// path / target line, screen-edge warning pulse, soft vignette on a major reveal — and screen shake, scaled by
// shakeLevel (0 = Off, 0.5 = Low, 1 = Normal). With shakeLevel 0 nothing ever moves; no effect needs shake or a flash to
// be understood (each big moment also has its card, sound and haptic).
const LAYERS = { world: 0, screen: 1 };
const SPARK_COLORS = ['#FFF6C2', '#FFD166', '#FFB74D', '#FFFFFF'];
const CONFETTI_COLORS = ['#FF8A3D', '#4FC3F7', '#7CFFB2', '#FFD166', '#F06292', '#FFFFFF'];

import { THEME } from './Theme.js';

export class VfxSystem {
  constructor({
    assets,
    width = 1080,
    height = 1920,
    maxParticles = 140,
    lowMaxParticles = 70,
    maxTexts = 18,
    maxEffects = 64,
    quality = 'high',
    reducedFlashes = false,
    random = Math.random,
    font = 'system-ui, sans-serif',
  }) {
    this.assets = assets;
    this.width = width;
    this.height = height;
    this.maxParticlesHigh = maxParticles;
    this.maxParticlesLow = lowMaxParticles;
    this.quality = quality;
    this.reducedFlashes = reducedFlashes;
    this.random = random;
    this.font = font;
    this.particles = Array.from({ length: maxParticles }, () => ({ alive: false }));
    this.texts = Array.from({ length: maxTexts }, () => ({ alive: false }));
    this.effects = Array.from({ length: maxEffects }, () => ({ alive: false }));
    this.flashState = { alive: false, age: 0, life: 0, peak: 0, color: '#FFFFFF' };
    this.peak = { particles: 0, texts: 0, effects: 0 }; // highest counts seen (for checks)
    this.dropped = 0; // particles refused because the cap was full
    this.shakeLevel = 1;
    this.shakeState = { age: 0, life: 0, power: 0 };
    this.shakes = 0; // shakes asked for (checks)
    this.edgeState = { alive: false, age: 0, life: 0, color: '#C8402F' };
    this.vignetteState = { alive: false, age: 0, life: 0, strength: 0.45 };
    this.time = 0;
    this._measure = document.createElement('canvas').getContext('2d');
  }

  get particleCap() {
    return this.quality === 'low' ? this.maxParticlesLow : this.maxParticlesHigh;
  }

  counts() {
    let p = 0;
    let t = 0;
    let e = 0;
    for (const o of this.particles) if (o.alive) p++;
    for (const o of this.texts) if (o.alive) t++;
    for (const o of this.effects) if (o.alive) e++;
    return { particles: p, texts: t, effects: e };
  }

  clear() {
    for (const o of this.particles) o.alive = false;
    for (const o of this.texts) o.alive = false;
    for (const o of this.effects) o.alive = false;
    this.flashState.alive = false;
  }

  // Floating texts only (a full screen opened: numbers still rising must not sit over it — Milestone 21).
  clearTexts(layer = null) {
    for (const o of this.texts) if (!layer || o.layer === layer) o.alive = false;
  }

  // --- pools -----------------------------------------------------------------
  _particle() {
    let alive = 0;
    let free = null;
    for (const o of this.particles) {
      if (o.alive) alive++;
      else if (!free) free = o;
    }
    if (!free || alive >= this.particleCap) {
      this.dropped++;
      return null;
    }
    free.alive = true;
    free.age = 0;
    if (alive + 1 > this.peak.particles) this.peak.particles = alive + 1;
    return free;
  }

  // Texts and effects: if the pool is full, the oldest one makes way (new news matters more).
  _recycle(pool, peakKey) {
    let free = null;
    let oldest = null;
    let alive = 0;
    for (const o of pool) {
      if (!o.alive) {
        if (!free) free = o;
      } else {
        alive++;
        if (!oldest || o.born < oldest.born) oldest = o;
      }
    }
    const o = free || oldest;
    if (free) alive++;
    if (alive > this.peak[peakKey]) this.peak[peakKey] = alive;
    o.alive = true;
    o.age = 0;
    o.born = this.time;
    return o;
  }

  _count(n) {
    return Math.max(1, Math.round(this.reducedFlashes ? n / 2 : n));
  }

  // --- procedural effects ---------------------------------------------------------
  // Welding sparks shooting up and falling.
  sparks(layer, x, y, { count = 6, speedMin = 160, speedMax = 380, dir = -Math.PI / 2, spread = 1.6 } = {}) {
    const r = this.random;
    for (let i = 0, n = this._count(count); i < n; i++) {
      const p = this._particle();
      if (!p) return;
      const a = dir + (r() - 0.5) * spread;
      const sp = speedMin + r() * (speedMax - speedMin);
      p.layer = LAYERS[layer];
      p.kind = 'spark';
      p.x = x;
      p.y = y;
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp;
      p.gravity = 900;
      p.drag = 0.5;
      p.life = 0.25 + r() * 0.3;
      p.size = 4 + r() * 3;
      p.color = SPARK_COLORS[(r() * SPARK_COLORS.length) | 0];
    }
  }

  // Little dust puff at someone's feet.
  dust(layer, x, y, { count = 5, spreadX = 26 } = {}) {
    const r = this.random;
    for (let i = 0, n = this._count(count); i < n; i++) {
      const p = this._particle();
      if (!p) return;
      p.layer = LAYERS[layer];
      p.kind = 'dust';
      p.x = x + (r() - 0.5) * spreadX;
      p.y = y - r() * 4;
      p.vx = (r() - 0.5) * 60;
      p.vy = -10 - r() * 22;
      p.gravity = 0;
      p.drag = 2.5;
      p.life = 0.45 + r() * 0.25;
      p.size = 5 + r() * 4;
      p.color = '#D9CFBF';
    }
  }

  // Party paper for big moments.
  confetti(layer, x, y, { count = 36, speed = 520, spreadX = 40 } = {}) {
    const r = this.random;
    for (let i = 0, n = this._count(count); i < n; i++) {
      const p = this._particle();
      if (!p) return;
      const a = -Math.PI / 2 + (r() - 0.5) * 1.9;
      const sp = speed * (0.45 + r() * 0.65);
      p.layer = LAYERS[layer];
      p.kind = 'confetti';
      p.x = x + (r() - 0.5) * spreadX;
      p.y = y;
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp;
      p.gravity = 620;
      p.drag = 1.6;
      p.life = 1.4 + r() * 0.9;
      p.size = 7 + r() * 5;
      p.rot = r() * Math.PI * 2;
      p.vr = (r() - 0.5) * 14;
      p.color = CONFETTI_COLORS[(r() * CONFETTI_COLORS.length) | 0];
    }
  }

  // Expanding ring under something just selected. ry/rx < 1 makes it a floor ellipse.
  pulse(layer, x, y, { rx = 60, ry = 26, color = '#FFB74D', life = 0.55, grow = 1.7, width = 6 } = {}) {
    const e = this._recycle(this.effects, 'effects');
    e.layer = LAYERS[layer];
    e.kind = 'ring';
    e.x = x;
    e.y = y;
    e.rx = rx;
    e.ry = ry;
    e.grow = grow;
    e.color = color;
    e.life = life;
    e.lineWidth = width;
    return e;
  }

  // A picture effect from the art (burst, pop, flash). size = drawn width at full scale (logical px).
  // from/to: scale at start/end of the pop; rise: px it floats up over its life.
  sprite(layer, key, x, y, { size = 140, life = 0.8, from = 0.35, to = 1, rise = 0, alpha = 1, spin = 0, hold = 0.35 } = {}) {
    const e = this._recycle(this.effects, 'effects');
    const soft = this.reducedFlashes;
    e.layer = LAYERS[layer];
    e.kind = 'sprite';
    e.key = key;
    e.x = x;
    e.y = y;
    e.size = Math.round(size);
    e.life = life;
    e.from = soft ? Math.max(from, 0.85) : from;
    e.to = to;
    e.rise = rise;
    e.alpha = soft ? alpha * 0.75 : alpha;
    e.spin = soft ? 0 : spin;
    e.hold = hold;
    e.back = !soft; // overshoot "pop"
    return e;
  }

  // Floating number/text, e.g. "+9,720". icon: optional art key drawn in front of the text.
  text(layer, str, x, y, { color = '#FFFFFF', size = 42, life = 1.6, rise = 80, icon = null, delay = 0 } = {}) {
    const t = this._recycle(this.texts, 'texts');
    t.layer = LAYERS[layer];
    t.text = str;
    t.x = x;
    t.y = y;
    t.color = color;
    t.size = size;
    t.life = life;
    t.rise = rise;
    t.icon = icon;
    t.age = -delay;
    this._measure.font = `bold ${size}px ${this.font}`;
    t.textW = this._measure.measureText(str).width;
    return t;
  }

  // Whole-screen flash (screen layer). With Reduced Flashes it becomes a faint, slower glow.
  flash({ color = '#FFFFFF', peak = 0.75, life = 0.45 } = {}) {
    const f = this.flashState;
    f.alive = true;
    f.age = 0;
    f.color = color;
    f.peak = this.reducedFlashes ? Math.min(peak, 0.16) : peak;
    f.life = this.reducedFlashes ? life * 1.6 : life;
  }

  // --- Milestone 25 procedural effects ---------------------------------------------------------
  // A ring spreading from a tapped button.
  ripple(layer, x, y, { radius = 70, color = '#FFFFFF', life = 0.35 } = {}) {
    return this.pulse(layer, x, y, { rx: radius * 0.5, ry: radius * 0.5, color, life, grow: 2, width: 5 });
  }

  // Little twinkles along a progress bar.
  sparkle(layer, x, y, { count = 5, spreadX = 30, color = '#FFF6C2' } = {}) {
    const r = this.random;
    for (let i = 0, n = this._count(count); i < n; i++) {
      const p = this._particle();
      if (!p) return;
      p.layer = LAYERS[layer];
      p.kind = 'twinkle';
      p.x = x + (r() - 0.5) * spreadX;
      p.y = y + (r() - 0.5) * 10;
      p.vx = (r() - 0.5) * 30;
      p.vy = -20 - r() * 30;
      p.gravity = 0;
      p.drag = 1.5;
      p.life = 0.5 + r() * 0.4;
      p.size = 5 + r() * 4;
      p.color = color;
    }
  }

  // A crackling electric arc between two points (a fresh zig-zag every frame).
  arc(layer, x1, y1, x2, y2, { color = '#7FE7FF', life = 0.5, width = 4 } = {}) {
    const e = this._recycle(this.effects, 'effects');
    Object.assign(e, { layer: LAYERS[layer], kind: 'arc', x: x1, y: y1, x2, y2, color, life, lineWidth: width });
    return e;
  }

  // A dashed line along points (where someone is walking, what a target is): fades out.
  pathLine(layer, points, { color = '#FFB74D', life = 0.9, width = 5 } = {}) {
    const e = this._recycle(this.effects, 'effects');
    Object.assign(e, { layer: LAYERS[layer], kind: 'path', points: points.map((q) => ({ x: q.x, y: q.y })), color, life, lineWidth: width });
    return e;
  }

  // A soft coloured glow round the screen edge (a warning: debt, a fault).
  edgePulse({ color = '#C8402F', life = 1.2 } = {}) {
    Object.assign(this.edgeState, { alive: true, age: 0, life, color });
  }

  // Darkened corners for a big reveal (never a flash).
  vignette({ life = 1.6, strength = 0.45 } = {}) {
    Object.assign(this.vignetteState, { alive: true, age: 0, life, strength });
  }

  // Screen shake: power in logical px at Normal. Off → nothing at all.
  shake(power = 12, life = 0.35) {
    this.shakes++;
    if (!(this.shakeLevel > 0)) return;
    const st = this.shakeState;
    const left = st.age < st.life ? st.power : 0;
    st.power = Math.max(left, power * this.shakeLevel);
    st.life = life;
    st.age = 0;
  }

  // The offset to draw the whole screen at this frame ({ x: 0, y: 0 } when still).
  shakeOffset() {
    const st = this.shakeState;
    if (!(this.shakeLevel > 0) || !st.life || st.age >= st.life) return ZERO;
    const k = 1 - st.age / st.life;
    const p = st.power * k * k;
    SHAKE.x = Math.sin(st.age * 71) * p;
    SHAKE.y = Math.cos(st.age * 53) * p * 0.7;
    return SHAKE;
  }

  // --- update / draw -------------------------------------------------------------
  update(dt) {
    this.time += dt;
    for (const p of this.particles) {
      if (!p.alive) continue;
      p.age += dt;
      if (p.age >= p.life) {
        p.alive = false;
        continue;
      }
      const k = Math.max(0, 1 - p.drag * dt);
      p.vx *= k;
      p.vy = p.vy * k + p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'confetti') {
        p.rot += p.vr * dt;
        p.x += Math.sin(p.age * 7 + p.rot) * 30 * dt; // flutter
      }
    }
    for (const t of this.texts) {
      if (!t.alive) continue;
      t.age += dt;
      if (t.age >= t.life) t.alive = false;
    }
    for (const e of this.effects) {
      if (!e.alive) continue;
      e.age += dt;
      if (e.age >= e.life) e.alive = false;
    }
    const f = this.flashState;
    if (f.alive) {
      f.age += dt;
      if (f.age >= f.life) f.alive = false;
    }
    for (const st of [this.edgeState, this.vignetteState]) {
      if (!st.alive) continue;
      st.age += dt;
      if (st.age >= st.life) st.alive = false;
    }
    if (this.shakeState.life) this.shakeState.age += dt;
  }

  render(ctx, layer) {
    const L = LAYERS[layer];
    ctx.save();
    for (const e of this.effects) if (e.alive && e.layer === L) this._drawEffect(ctx, e);
    this._drawParticles(ctx, L);
    for (const t of this.texts) if (t.alive && t.layer === L && t.age >= 0) this._drawText(ctx, t);
    if (L === LAYERS.screen && this.flashState.alive) {
      const f = this.flashState;
      const k = f.age / f.life;
      ctx.globalAlpha = f.peak * (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85);
      ctx.fillStyle = f.color;
      ctx.fillRect(0, 0, this.width, this.height);
    }
    if (L === LAYERS.screen) this._drawOverlays(ctx);
    ctx.restore();
  }

  _drawOverlays(ctx) {
    const W = this.width;
    const H = this.height;
    const v = this.vignetteState;
    if (v.alive) {
      const k = v.age / v.life;
      ctx.globalAlpha = v.strength * (k < 0.2 ? k / 0.2 : 1 - (k - 0.2) / 0.8);
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
      g.addColorStop(0, 'rgba(40,24,10,0)');
      g.addColorStop(1, 'rgba(40,24,10,1)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    const e = this.edgeState;
    if (e.alive) {
      const k = e.age / e.life;
      ctx.globalAlpha = 0.55 * Math.sin(Math.PI * k) * (this.reducedFlashes ? 0.6 : 1);
      const band = 90;
      const sides = [
        [0, 0, W, band, 0, 0, 0, band],
        [0, H - band, W, band, 0, H, 0, H - band],
        [0, 0, band, H, 0, 0, band, 0],
        [W - band, 0, band, H, W, 0, W - band, 0],
      ];
      for (const [x, y, w, h, x0, y0, x1, y1] of sides) {
        const g = ctx.createLinearGradient(x0, y0, x1, y1);
        g.addColorStop(0, e.color);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x, y, w, h);
      }
    }
  }

  _drawEffect(ctx, e) {
    const k = e.age / e.life;
    if (e.kind === 'arc') {
      ctx.globalAlpha = (1 - k) * (0.6 + 0.4 * this.random());
      ctx.strokeStyle = e.color;
      ctx.lineWidth = e.lineWidth;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      const segs = 7;
      const dx = e.x2 - e.x;
      const dy = e.y2 - e.y;
      const len = Math.hypot(dx, dy) || 1;
      ctx.moveTo(e.x, e.y);
      for (let i = 1; i < segs; i++) {
        const j = (this.random() - 0.5) * len * 0.18;
        ctx.lineTo(e.x + (dx * i) / segs - (dy / len) * j, e.y + (dy * i) / segs + (dx / len) * j);
      }
      ctx.lineTo(e.x2, e.y2);
      ctx.stroke();
      return;
    }
    if (e.kind === 'path') {
      ctx.globalAlpha = k < 0.7 ? 0.9 : 0.9 * (1 - (k - 0.7) / 0.3);
      ctx.strokeStyle = e.color;
      ctx.lineWidth = e.lineWidth;
      ctx.setLineDash([14, 12]);
      ctx.lineDashOffset = -e.age * 60;
      ctx.beginPath();
      e.points.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
      ctx.stroke();
      ctx.setLineDash([]);
      return;
    }
    if (e.kind === 'ring') {
      const s = 1 + (e.grow - 1) * easeOut(k);
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = e.color;
      ctx.lineWidth = Math.max(1, e.lineWidth * (1 - k));
      ctx.beginPath();
      ctx.ellipse(e.x, e.y, e.rx * s, e.ry * s, 0, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }
    // sprite: pop in (0 → 25% of life), hold, fade out at the end
    const popK = Math.min(1, k / 0.25);
    const scale = e.from + (e.to - e.from) * (e.back ? easeOutBack(popK) : easeOut(popK));
    const fadeFrom = e.hold + 0.25;
    const a = k < fadeFrom ? 1 : 1 - (k - fadeFrom) / (1 - fadeFrom);
    const maxScale = Math.max(e.from, e.to, e.back ? e.to * 1.1 : e.to);
    const w = e.size * maxScale;
    const h = w / this.assets.aspect(e.key);
    const sprite = this.assets.sprite(e.key, Math.round(w), Math.round(h));
    if (!sprite) return;
    ctx.save();
    ctx.globalAlpha = Math.max(0, a) * e.alpha;
    ctx.translate(e.x, e.y - e.rise * easeOut(k));
    if (e.spin) ctx.rotate(e.spin * e.age);
    const s = scale / maxScale;
    ctx.scale(s, s);
    ctx.drawImage(sprite, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  _drawParticles(ctx, L) {
    let sparkMode = false;
    for (const p of this.particles) {
      if (!p.alive || p.layer !== L) continue;
      const k = p.age / p.life;
      if (p.kind === 'spark') {
        if (!sparkMode) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.lineCap = 'round';
          sparkMode = true;
        }
        ctx.globalAlpha = 1 - k * k;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size * (1 - k * 0.6);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.05, p.y - p.vy * 0.05);
        ctx.stroke();
        continue;
      }
      if (sparkMode) {
        ctx.globalCompositeOperation = 'source-over';
        sparkMode = false;
      }
      if (p.kind === 'twinkle') {
        ctx.globalAlpha = Math.sin(Math.PI * k);
        ctx.fillStyle = p.color;
        const r = p.size * (1 - k * 0.5);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - r);
        ctx.lineTo(p.x + r * 0.3, p.y - r * 0.3);
        ctx.lineTo(p.x + r, p.y);
        ctx.lineTo(p.x + r * 0.3, p.y + r * 0.3);
        ctx.lineTo(p.x, p.y + r);
        ctx.lineTo(p.x - r * 0.3, p.y + r * 0.3);
        ctx.lineTo(p.x - r, p.y);
        ctx.lineTo(p.x - r * 0.3, p.y - r * 0.3);
        ctx.closePath();
        ctx.fill();
      } else if (p.kind === 'dust') {
        ctx.globalAlpha = 0.55 * (1 - k);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 + k * 1.4), 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.globalAlpha = k > 0.75 ? (1 - k) / 0.25 : 1;
        ctx.fillStyle = p.color;
        const c = Math.cos(p.rot);
        const s = Math.sin(p.rot);
        const w = p.size;
        const h = p.size * 0.55 * Math.abs(Math.cos(p.age * 9 + p.rot)); // flips as it tumbles
        this._rotRect(ctx, p.x, p.y, w, h + 1, c, s);
      }
    }
    if (sparkMode) ctx.globalCompositeOperation = 'source-over';
  }

  // Filled rectangle centred on (x, y), rotated by (c = cos, s = sin), drawn as a path (no transform change).
  _rotRect(ctx, x, y, w, h, c, s) {
    const hw = w / 2;
    const hh = h / 2;
    ctx.beginPath();
    ctx.moveTo(x - hw * c + hh * s, y - hw * s - hh * c);
    ctx.lineTo(x + hw * c + hh * s, y + hw * s - hh * c);
    ctx.lineTo(x + hw * c - hh * s, y + hw * s + hh * c);
    ctx.lineTo(x - hw * c - hh * s, y - hw * s + hh * c);
    ctx.closePath();
    ctx.fill();
  }

  _drawText(ctx, t) {
    const k = t.age / t.life;
    const y = t.y - t.rise * easeOut(k);
    const pop = t.age < 0.16 ? 1.25 - (t.age / 0.16) * 0.25 : 1;
    ctx.globalAlpha = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
    const iconW = t.icon ? t.size * 1.15 : 0;
    const gap = t.icon ? 8 : 0;
    const total = iconW + gap + t.textW;
    ctx.save();
    ctx.translate(t.x, y);
    if (pop !== 1) ctx.scale(pop, pop);
    let x = -total / 2;
    if (t.icon) {
      this.assets.drawContained(ctx, t.icon, { x, y: -iconW / 2, w: iconW, h: iconW });
      x += iconW + gap;
    }
    ctx.font = `bold ${t.size}px ${this.font}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(4, t.size * 0.18);
    ctx.strokeStyle = THEME.color.sheet; // a cream halo: theme-coloured numbers read on bright floors and cream bars (M17b)
    ctx.strokeText(t.text, x, 0);
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, x, 0);
    ctx.restore();
  }
}

const ZERO = Object.freeze({ x: 0, y: 0 });
const SHAKE = { x: 0, y: 0 };

function easeOut(k) {
  return 1 - (1 - k) * (1 - k);
}

function easeOutBack(k) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
}
