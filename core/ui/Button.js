import { THEME, shade as darken, font, textScale } from '../Theme.js';
// Canvas buttons (logical units) with the six states from bible §33.3:
//   normal · pressed (finger down on it) · selected · disabled · locked · attention badge.
// Pressed needs no per-button code: the game calls setPressPoint() on pointer down and clearPress()
// on pointer up / drag start, and any button drawn under that point shows pressed — also inside
// scrolled panels, because the point is mapped through the current canvas transform.
let press = null; // { dx, dy } in real canvas pixels, or null

export function hitRect(p, r) {
  return !!r && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

// p: logical point; pixelScale: real canvas pixels per logical unit.
export function setPressPoint(p, pixelScale = 1) {
  press = { dx: p.x * pixelScale, dy: p.y * pixelScale };
}

export function clearPress() {
  press = null;
}

// Is the finger currently down on rect r (in the ctx's current drawing space)?
export function isPressed(ctx, r) {
  if (!press) return false;
  const m = ctx.getTransform(); // buttons are only ever moved/scaled, never rotated
  const x = (press.dx - m.e) / m.a;
  const y = (press.dy - m.f) / m.d;
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

const LIP = THEME.button.lip; // chunky bottom edge; a pressed button sinks onto it

// A button label font: the theme family, never below the button minimum (bible §33.2), after the text-size setting.
// A font given by a screen already went through font() (so it carries the setting); the minimum is scaled here.
function labelFont(f) {
  const m = /(\d+(?:\.\d+)?)px/.exec(f ?? '');
  const min = Math.round(THEME.size.button * textScale());
  const size = Math.max(min, m ? Number(m[1]) : min);
  return `${/bold/.test(f ?? 'bold') ? 'bold ' : ''}${size}px ${THEME.family}`;
}

// Milestone 17b look (bible §33): plain buttons are orange (or the accent given), selected ones graphite with a
// cream label (the chosen tab / option), disabled and locked ones a dim cream. Graphite outline, darker lip.
// opts: { active|selected, disabled, locked, badge (number or text), pressed (force), font, accent }
export function drawButton(ctx, r, label, opts = {}) {
  const C = THEME.color;
  // Layout audit (tests only): every button drawn, in screen units.
  if (globalThis.__uiAudit) {
    const m = ctx.getTransform();
    globalThis.__uiAudit.buttons.push({ label, h: r.h * (m.d / (globalThis.__uiAudit.ps || 1)), w: r.w * (m.a / (globalThis.__uiAudit.ps || 1)), x: (r.x * m.a + m.e) / (globalThis.__uiAudit.ps || 1), y: (r.y * m.d + m.f) / (globalThis.__uiAudit.ps || 1), clipped: !!ctx.__clipDepth }); // clipped: drawn inside a clip (a scroll panel)
  }
  const { disabled = false, locked = false, badge = null } = opts;
  const accent = opts.accent && opts.accent.startsWith('#') ? opts.accent : C.action;
  const selected = !!(opts.selected ?? opts.active);
  const inert = disabled || locked;
  const pressed = !inert && (opts.pressed ?? isPressed(ctx, r));
  const radius = Math.min(THEME.button.radius, r.h / 3);
  const sink = pressed ? LIP - 2 : 0;
  const face = { x: r.x, y: r.y + sink, w: r.w, h: r.h - LIP };
  const base = selected ? C.outline : accent;

  ctx.save();
  // Lip (the button's "side"), hidden when pressed down onto it.
  if (!pressed) {
    ctx.fillStyle = inert ? C.line : shade(base);
    roundRect(ctx, r.x, r.y + LIP, r.w, r.h - LIP, radius);
    ctx.fill();
  }
  // Face
  ctx.fillStyle = inert ? C.panelDim : pressed ? shade(base) : base;
  roundRect(ctx, face.x, face.y, face.w, face.h, radius);
  ctx.fill();
  ctx.strokeStyle = inert ? C.line : C.outline;
  ctx.lineWidth = 4;
  ctx.stroke();
  if (selected && !inert) {
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3;
    roundRect(ctx, face.x + 5, face.y + 5, face.w - 10, face.h - 10, Math.max(4, radius - 5));
    ctx.stroke();
  }

  // Label (+ padlock when locked)
  ctx.font = labelFont(opts.font);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = inert ? C.textFaint : selected ? C.textOnDark : C.textOnAction;
  const cy = face.y + face.h / 2 + 1;
  if (locked) {
    const lockW = 28;
    const tw = Math.min(ctx.measureText(label).width, face.w - 24 - lockW - 10);
    const lx = face.x + face.w / 2 - (lockW + 8 + tw) / 2;
    drawPadlock(ctx, lx, cy, lockW, C.textFaint);
    ctx.textAlign = 'left';
    ctx.fillText(label, lx + lockW + 8, cy, face.w - 24 - lockW - 10);
  } else {
    ctx.fillText(label, face.x + face.w / 2, cy, face.w - 16);
  }

  if (badge !== null && badge !== undefined && badge !== false && badge !== 0) drawBadge(ctx, r.x + r.w - 8, r.y + 6, String(badge));
  ctx.restore();
}

// Orange attention dot with a number or "!" (orange = interaction accent, bible §33.1).
export function drawBadge(ctx, cx, cy, text) {
  ctx.save();
  ctx.font = font(THEME.size.small, true);
  const w = Math.max(46, ctx.measureText(text).width + 24);
  roundRect(ctx, cx - w / 2, cy - 23, w, 46, 23);
  ctx.fillStyle = THEME.color.bad;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = THEME.color.textOnDark;
  ctx.stroke();
  ctx.fillStyle = THEME.color.textOnDark;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy + 1);
  ctx.restore();
}

// Simple padlock glyph, s px wide, centred vertically on cy.
export function drawPadlock(ctx, x, cy, s, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(2, s * 0.14);
  const bodyH = s * 0.72;
  const top = cy - bodyH / 2 + s * 0.18;
  ctx.beginPath();
  ctx.arc(x + s / 2, top, s * 0.3, Math.PI, 0);
  ctx.stroke();
  roundRect(ctx, x, top, s, bodyH, s * 0.14);
  ctx.fill();
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

// A darker version of a colour (pressed / lip), worked out once per colour.
const shades = new Map();
function shade(hex) {
  let out = shades.get(hex);
  if (!out) shades.set(hex, (out = hex.startsWith('#') ? darken(hex, 0.28) : hex));
  return out;
}
