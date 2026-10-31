// The review card and the monthly "Roadside Guide" moment (Milestone 5, Kairosoft rule 2: shown as parts, not one
// number). Both are core MajorFeedback moments (dim layer + banner + "Tap to continue"); this file draws their panel:
//   reviewMoment(review, { assets, layout }) — the guest, then the seven categories as small bars one at a time, then the
//     stars and the comment (core ReviewText: their best and worst category).
//   guideMoment(month, { layout, earlier }) — four inspectors' marks out of 10 one at a time, then the stars (the §27A
//     table) and the QualityIndex.
// A tap (or the Skip button) while the parts are still coming shows them all at once; the next tap closes it. The
// screen's input layer does that (skipMoment / the moment's skipRect()). Pure drawing: nothing here changes a number.
import { THEME, font } from '../../../../core/Theme.js';
import { topBarRect } from '../../../../core/ui/TopBar.js';
import { CATEGORIES, GUIDE, REVEAL } from '../../data/reviews.js';
import { GUEST_TYPES, ROOM_TYPES } from '../../data/bookings.js';
import { roomById } from '../../data/lot.js';

const C = THEME.color;
const START = 0.3; // the first part shows once the dim layer is in

export const starWords = (n) => (n ? `${'★'.repeat(n)}${'☆'.repeat(5 - n)}` : 'New');

// The panel between the top bar and MajorFeedback's banner (which sits at the bottom of the safe area).
const BANNER_SPACE = 420;
function panelRect(layout, h) {
  const sr = layout.safeRect;
  const w = Math.min(sr.w - 64, 960);
  const bar = layout.anchor ? topBarRect(layout) : { y: sr.y, h: 0 };
  const top = bar.y + bar.h + 24;
  const room = sr.y + sr.h - BANNER_SPACE - top;
  return { x: sr.x + (sr.w - w) / 2, y: top + Math.max(0, (room - h) / 2), w, h };
}
const skipRectOf = (p) => ({ x: p.x + p.w - 220, y: p.y + 24, w: 196, h: 96 });

function roundRect(ctx, r, rad, fill, stroke = null, lw = 4) {
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, rad);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}
export function drawStars(ctx, n, cx, cy, size, { fill = '#F2B705', empty = C.track, outline = C.outline } = {}) {
  const gap = size * 1.12;
  for (let i = 0; i < 5; i++) {
    const x = cx + (i - 2) * gap;
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 5;
      const r = k % 2 ? size * 0.22 : size * 0.5;
      ctx.lineTo(x + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fillStyle = i < n ? fill : empty;
    ctx.fill();
    ctx.strokeStyle = outline;
    ctx.lineWidth = 3;
    ctx.stroke();
  }
}
function wrap(ctx, str, w, max = 4) {
  const out = [];
  let line = '';
  for (const word of String(str).split(' ')) {
    const t = line ? `${line} ${word}` : word;
    if (ctx.measureText(t).width > w && line && out.length < max - 1) {
      out.push(line);
      line = word;
    } else line = t;
  }
  if (line) out.push(line);
  return out;
}
function drawSkip(ctx, p, t, until) {
  if (t >= until) return;
  const r = skipRectOf(p);
  roundRect(ctx, r, 24, C.progress);
  ctx.fillStyle = C.textOnAction;
  ctx.font = font(THEME.size.button, true);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Skip ›', r.x + r.w / 2, r.y + r.h / 2);
}
const ease = (x) => 1 - (1 - Math.max(0, Math.min(1, x))) ** 3;
const barColor = (v) => (v >= 78 ? C.good : v >= 64 ? C.progress : v >= 50 ? C.warn : C.bad);

// --- a review -------------------------------------------------------------------------------------------------------
export function reviewMoment(review, { assets = null, layout }) {
  const R = REVEAL.review;
  const t = GUEST_TYPES[review.type];
  const barsAt = (i) => START + i * R.step;
  const starsAt = barsAt(CATEGORIES.length) + 0.1;
  const textAt = starsAt + R.stars;
  const done = textAt + R.text;
  const H = 1080;
  const m = {
    kind: 'review',
    id: review.id,
    title: `${t.name}`,
    subtitle: `${roomById(review.room)?.name ?? 'Room'} (${ROOM_TYPES[review.got]?.name ?? ''}) · ${review.nights} ${review.nights === 1 ? 'night' : 'nights'}`,
    accent: C.progress,
    minShowSec: done,
    revealSec: done,
    skipRect: () => skipRectOf(panelRect(layout, H)),
    drawFn(ctx, time) {
      const p = panelRect(layout, H);
      ctx.save();
      roundRect(ctx, p, 32, C.panel, C.progress, 6);
      // header: their picture and the words "Guest review"
      const art = { x: p.x + 32, y: p.y + 28, w: 120, h: 120 };
      roundRect(ctx, art, 20, C.panelInfo);
      if (assets && t.art) assets.drawContained(ctx, t.art, art);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = C.text;
      ctx.font = font(THEME.size.heading, true);
      ctx.fillText('Guest review', art.x + art.w + 28, art.y + 38, p.w - 460);
      ctx.fillStyle = C.textMuted;
      ctx.font = font(THEME.size.small);
      ctx.fillText(t.name, art.x + art.w + 28, art.y + 92, p.w - 460);
      // the seven parts, one at a time
      const rowY = p.y + 190;
      const rowH = 84;
      CATEGORIES.forEach((c, i) => {
        const k = (time - barsAt(i)) / 0.25;
        if (k <= 0) return;
        const v = review.cats[c.id];
        const y = rowY + i * rowH;
        ctx.globalAlpha = Math.min(1, k);
        ctx.fillStyle = C.text;
        ctx.font = font(THEME.size.body, true);
        ctx.textAlign = 'left';
        ctx.fillText(c.name, p.x + 40, y + 30);
        const bar = { x: p.x + 280, y: y + 10, w: p.w - 280 - 150, h: 40 };
        roundRect(ctx, bar, 20, C.track);
        roundRect(ctx, { ...bar, w: Math.max(40, (bar.w * v * ease(k)) / 100) }, 20, barColor(v));
        ctx.fillStyle = C.text;
        ctx.textAlign = 'right';
        ctx.fillText(String(Math.round(v * ease(k))), p.x + p.w - 40, y + 30);
        ctx.globalAlpha = 1;
      });
      // the stars and their words
      const sy = rowY + CATEGORIES.length * rowH + 50;
      if (time >= starsAt) {
        ctx.globalAlpha = Math.min(1, (time - starsAt) / 0.25);
        drawStars(ctx, review.stars, p.x + p.w / 2, sy, 92);
        ctx.globalAlpha = 1;
      }
      if (time >= textAt) {
        ctx.globalAlpha = Math.min(1, (time - textAt) / 0.25);
        ctx.fillStyle = C.text;
        ctx.font = font(THEME.size.body);
        ctx.textAlign = 'center';
        wrap(ctx, `“${review.text}”`, p.w - 80, 3).forEach((l, i) => ctx.fillText(l, p.x + p.w / 2, sy + 100 + i * 46, p.w - 60));
        ctx.globalAlpha = 1;
      }
      drawSkip(ctx, p, time, done);
      ctx.restore();
    },
  };
  return m;
}

// --- the monthly Roadside Guide -------------------------------------------------------------------------------------
export function guideMoment(month, { layout, earlier = 0 }) {
  const R = REVEAL.guide;
  const n = GUIDE.judges.length;
  const judgeAt = (i) => START + i * R.step;
  const starsAt = judgeAt(n) + 0.2;
  const done = starsAt + R.stars;
  const H = 980;
  const changed = month.was == null ? 'Your first star rating.' : month.stars > month.was ? `Up from ${month.was} ${month.was === 1 ? 'star' : 'stars'}.` : month.stars < month.was ? `Down from ${month.was} ${month.was === 1 ? 'star' : 'stars'}.` : 'Same as last month.';
  const m = {
    kind: 'guide',
    id: `month${month.n}`,
    title: `Month ${month.n} rating`, // (the stars themselves come last, in the panel)
    subtitle: `${changed}${earlier ? ` (${earlier} earlier ${earlier === 1 ? 'month' : 'months'} rated too.)` : ''}`,
    accent: C.gold,
    minShowSec: done,
    revealSec: done,
    skipRect: () => skipRectOf(panelRect(layout, H)),
    drawFn(ctx, time) {
      const p = panelRect(layout, H);
      ctx.save();
      roundRect(ctx, p, 32, C.panel, C.gold, 6);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = C.text;
      ctx.font = font(THEME.size.title, true);
      ctx.fillText(GUIDE.name, p.x + 40, p.y + 66, p.w - 300);
      ctx.fillStyle = C.textMuted;
      ctx.font = font(THEME.size.small);
      ctx.fillText(`Month ${month.n} rating · four inspectors`, p.x + 40, p.y + 124, p.w - 300);
      const rowY = p.y + 180;
      const rowH = 150;
      GUIDE.judges.forEach((j, i) => {
        const k = (time - judgeAt(i)) / 0.3;
        if (k <= 0) return;
        const mk = month.marks.find((x) => x.id === j.id)?.mark ?? 0;
        const y = rowY + i * rowH;
        ctx.globalAlpha = Math.min(1, k);
        roundRect(ctx, { x: p.x + 24, y, w: p.w - 48, h: rowH - 20 }, 24, C.panelAlt);
        // their badge: initials in their colour
        ctx.beginPath();
        ctx.arc(p.x + 100, y + (rowH - 20) / 2, 48, 0, Math.PI * 2);
        ctx.fillStyle = j.color;
        ctx.fill();
        ctx.fillStyle = C.textOnAction;
        ctx.font = font(THEME.size.heading, true);
        ctx.textAlign = 'center';
        ctx.fillText(j.name.split(' ').map((w) => w[0]).join(''), p.x + 100, y + (rowH - 20) / 2 + 2);
        ctx.textAlign = 'left';
        ctx.fillStyle = C.text;
        ctx.font = font(THEME.size.body, true);
        ctx.fillText(j.name, p.x + 176, y + 44, p.w - 460);
        ctx.fillStyle = C.textMuted;
        ctx.font = font(THEME.size.small);
        ctx.fillText(j.area, p.x + 176, y + 92, p.w - 460);
        ctx.textAlign = 'right';
        ctx.fillStyle = barColor(mk * 10);
        ctx.font = font(THEME.size.major, true);
        ctx.fillText(mk.toFixed(1), p.x + p.w - 150, y + (rowH - 20) / 2 + 4);
        ctx.fillStyle = C.textMuted;
        ctx.font = font(THEME.size.body);
        ctx.fillText('/10', p.x + p.w - 56, y + (rowH - 20) / 2 + 8);
        ctx.globalAlpha = 1;
      });
      const sy = rowY + n * rowH + 60;
      if (time >= starsAt) {
        ctx.globalAlpha = Math.min(1, (time - starsAt) / 0.3);
        drawStars(ctx, month.stars, p.x + p.w / 2, sy, 100);
        ctx.fillStyle = C.textMuted;
        ctx.font = font(THEME.size.small);
        ctx.textAlign = 'center';
        ctx.fillText(`Quality ${month.qi.toFixed(1)} · Staff Wellbeing ${month.scores.wellbeing}`, p.x + p.w / 2, sy + 90, p.w - 60);
        ctx.globalAlpha = 1;
      }
      drawSkip(ctx, p, time, done);
      ctx.restore();
    },
  };
  return m;
}

// Skip: every part at once (the moment can then be closed with one tap).
export function skipMoment(feedback) {
  const m = feedback.current;
  if (!m) return false;
  if (feedback.time < (m.revealSec ?? 0)) {
    feedback.time = m.revealSec ?? feedback.time;
    return true;
  }
  return false;
}
