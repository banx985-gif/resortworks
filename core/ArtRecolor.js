// Recolouring painted art in code (any game): a copy of a picture where chosen areas take new colours and keep their
// light and shade, so outlines, skin, hair and everything else stay exactly as painted. Made for kits (GOALWORKS kit
// tinting) — the same idea as RACEWORKS' livery patches, as a general tool.
//
// The areas are found by colour, not drawn by hand: each rule picks the pixels of one painted colour —
//   { hue: 220, full: 10, none: 20, minSat: 0.3 }   a coloured paint: within `full` degrees of the hue it is taken
//                                                   fully, fading out by `none` (so the next hue along — skin next to a
//                                                   red shirt — is never touched); greys under minSat never match
//   { neutral: true, maxChroma: 0.12 }              a white / grey / black paint (no hue): the gap between its
//                                                   brightest and darkest channel under maxChroma (0–1)
//   light: [lo, hi]                                 only pixels this light (0 black … 1 white), e.g. [0.72, 1] = white
//   open: n                                         drop thin lines and specks under ~2n+1 px (in a 512-px picture):
//                                                   outlines' soft edges, boot stripes, studs — a shape must be a real
//                                                   area (a shirt, shorts, a sleeve band) to be recoloured
//   keep: [{ x, y, rx, ry }]                        ellipses (fractions of the picture) never touched
// A pixel matched by two rules belongs to the first.
//
//   const r = createRecolor(img, rules, { maxSize })   measures the picture once (maxSize: work on a copy no bigger than
//                                         this many px across — plenty for a sprite drawn small, and 4× quicker at half size)
//                                         (null when it can't be read, e.g. another site's
//                                         image, or outside a browser)
//   r.paint(['#D0322B', '#FFFFFF'])       → a canvas copy, one colour per rule (null = leave that area as painted);
//                                         it carries naturalWidth / naturalHeight so AssetManager can draw it like an image
//   r.cover                               → share of the picture's opaque pixels each rule took (checks)
// Lightness: an area's middle tone lands on the new colour; lighter and darker paint stay lighter and darker (less so
// for a very light or very dark colour, so a white kit still shows its folds and a black kit its highlights).

export function createRecolor(img, rules, { maxSize = 0 } = {}) {
  if (typeof document === 'undefined' || !img) return null;
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const k = maxSize && Math.max(iw, ih) > maxSize ? maxSize / Math.max(iw, ih) : 1;
  const w = Math.round(iw * k);
  const h = Math.round(ih * k);
  const base = document.createElement('canvas');
  base.width = w;
  base.height = h;
  const g = base.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, w, h);
  let src;
  try {
    src = g.getImageData(0, 0, w, h);
  } catch {
    return null;
  }
  const m = measure(src.data, w, h, rules);
  return {
    cover: m.cover,
    paint(colours) {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const cg = c.getContext('2d');
      const out = new ImageData(new Uint8ClampedArray(src.data), w, h);
      applyColours(out.data, m, colours);
      cg.putImageData(out, 0, 0);
      c.naturalWidth = w;
      c.naturalHeight = h;
      return c;
    },
  };
}

// The per-rule weights (0–1 per pixel) and each area's middle lightness. Plain arrays: Node tests can call it on
// decoded pixels too.
export function measure(px, w, h, rules) {
  const n = w * h;
  const owner = new Int8Array(n).fill(-1);
  const weight = new Float32Array(n);
  const lights = rules.map(() => []);
  const scale = w / 512;
  const taken = new Uint8Array(n);
  rules.forEach((rule, ri) => {
    const wt = new Float32Array(n);
    const bin = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      if (taken[i] || px[i * 4 + 3] < 8) continue;
      const r = px[i * 4], gg = px[i * 4 + 1], b = px[i * 4 + 2];
      const [ph, ps, pl] = hsl(r, gg, b);
      const pc = (Math.max(r, gg, b) - Math.min(r, gg, b)) / 255;
      const v = match(rule, ph, ps, pl, pc, (i % w) / w, Math.floor(i / w) / h);
      if (v > 0) {
        wt[i] = v;
        if (v >= 0.5) bin[i] = 1;
      }
    }
    if (rule.open) {
      // close the painted texture's speckles first (so an area isn't broken up), then drop what is thinner than 2r+1
      const r = Math.max(1, Math.round(rule.open * scale));
      const c = Math.max(1, Math.round(2 * scale));
      const inner = dilate(erode(erode(dilate(bin, w, h, c), w, h, c), w, h, r), w, h, r);
      const opened = dilate(inner, w, h, 1); // +1: keep the soft edge round a real area
      const [lo, hi] = rule.light ?? [0.1, 0.97];
      for (let i = 0; i < n; i++) {
        if (!opened[i]) wt[i] = 0;
        else if (inner[i] && wt[i] < 1 && !taken[i]) {
          // a speckle inside the area (a tinted fleck of the same paint): part of it
          const l = hsl(px[i * 4], px[i * 4 + 1], px[i * 4 + 2])[2];
          if (l >= lo && l <= hi) wt[i] = 1;
        }
      }
    }
    for (let i = 0; i < n; i++) {
      if (wt[i] <= 0) continue;
      owner[i] = ri;
      weight[i] = wt[i];
      taken[i] = 1;
      if (wt[i] >= 0.5) lights[ri].push(hsl(px[i * 4], px[i * 4 + 1], px[i * 4 + 2])[2]);
    }
  });
  let opaque = 0;
  for (let i = 0; i < n; i++) if (px[i * 4 + 3] >= 8) opaque++;
  const ref = lights.map((ls, ri) => rules[ri].ref ?? median(ls) ?? 0.5);
  const cover = lights.map((ls) => (opaque ? ls.length / opaque : 0));
  return { owner, weight, ref, cover };
}

// Paint the measured areas (in place on RGBA pixels). colours[i]: a hex for rule i, or null to leave it.
export function applyColours(px, m, colours) {
  const targets = colours.map((hex) => (hex ? hsl(...hexRgb(hex)) : null));
  const n = m.owner.length;
  for (let i = 0; i < n; i++) {
    const ri = m.owner[i];
    if (ri < 0) continue;
    const t = targets[ri];
    if (!t) continue;
    const k = m.weight[i];
    const [, , pl] = hsl(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]);
    const [th, ts, tl] = t;
    const gain = 0.35 + 0.65 * (1 - Math.abs(2 * tl - 1));
    const nl = Math.max(0.06, Math.min(0.97, tl + (pl - m.ref[ri]) * gain));
    const [r, g, b] = rgb(th, ts, nl);
    px[i * 4] += (r - px[i * 4]) * k;
    px[i * 4 + 1] += (g - px[i * 4 + 1]) * k;
    px[i * 4 + 2] += (b - px[i * 4 + 2]) * k;
  }
}

function match(rule, ph, ps, pl, pc, fx, fy) {
  if (rule.keep?.some((e) => ((fx - e.x) / e.rx) ** 2 + ((fy - e.y) / e.ry) ** 2 < 1)) return 0;
  const [lo, hi] = rule.light ?? [0.1, 0.97];
  const fl = 0.03;
  if (pl < lo - fl || pl > hi + fl) return 0;
  const lw = pl < lo ? (pl - (lo - fl)) / fl : pl > hi ? (hi + fl - pl) / fl : 1;
  if (rule.neutral) {
    const mc = rule.maxChroma ?? 0.12;
    if (pc > mc + 0.05) return 0;
    return lw * (pc <= mc ? 1 : 1 - (pc - mc) / 0.05);
  }
  const minSat = rule.minSat ?? 0.3;
  if (ps < minSat - 0.08) return 0;
  const sw = ps >= minSat ? 1 : 1 - (minSat - ps) / 0.08;
  let d = Math.abs(ph - rule.hue);
  if (d > 180) d = 360 - d;
  const full = rule.full ?? 12;
  const none = rule.none ?? 22;
  if (d >= none) return 0;
  const hw = d <= full ? 1 : 1 - (d - full) / (none - full);
  return hw * sw * lw;
}

// Square min / max filters (separable), radius r, on a 0/1 mask.
function erode(a, w, h, r) {
  return filter(filter(a, w, h, r, 1, 0, Math.min), w, h, r, 0, 1, Math.min);
}
function dilate(a, w, h, r) {
  return filter(filter(a, w, h, r, 1, 0, Math.max), w, h, r, 0, 1, Math.max);
}
function filter(a, w, h, r, dx, dy, pick) {
  const out = new Uint8Array(a.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let v = pick === Math.min ? 1 : 0;
      for (let k = -r; k <= r; k++) {
        const xx = x + k * dx;
        const yy = y + k * dy;
        const s = xx < 0 || yy < 0 || xx >= w || yy >= h ? 0 : a[yy * w + xx];
        v = pick(v, s);
        if (pick === Math.min ? v === 0 : v === 1) break;
      }
      out[y * w + x] = v;
    }
  return out;
}

function median(list) {
  if (!list.length) return null;
  const s = Float32Array.from(list).sort();
  return s[s.length >> 1];
}

export function hexRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function hsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

export function rgb(h, s, l) {
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    t = ((t % 1) + 1) % 1;
    const v = t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
    return v * 255;
  };
  return [f(h / 360 + 1 / 3), f(h / 360), f(h / 360 - 1 / 3)];
}
