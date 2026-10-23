// Item pictures (series common feature §4; RACEWORKS Milestone 25b, from DEVWORKS Milestone 40e's item art; any series
// game). Content-free: the game passes its item types, groups and rarities as data. Until an item's picture file exists
// the game draws a placeholder — the group's colour, the group's simple shape, the item's initials; once the file has
// loaded (AssetManager) it is drawn instead, with no code change. The rarity frame is always drawn by code:
// itemIcon(type, rarity) is an image key (type@rarity) whose drawing is the picture (or its placeholder) in that frame.
//
//   registerItemArt(assets, { types, groups, rarities, storeIcon })
//     types: [{ id, name, group, art? }] (art: the picture's image key; default the type id)
//     groups: [{ id, color, shape: 'slab' | 'book' | 'cup' | 'blob' | 'disc' | 'trophy' | 'helmet' | 'wing' }]
//     rarities: { id: { color, frame?: 'thin' | 'thick', gem?: bool } } · storeIcon: the store picture's key (a crate)
//   itemIcon(typeId, rarityId) → the framed icon's image key
import { THEME } from '../Theme.js';

const C = THEME.color;
export const itemIcon = (type, rarity) => `${type}@${rarity}`;

function rr(ctx, x, y, w, h, r, fill, stroke = C.outline, lw = 4) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.lineWidth = lw;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

function shapePath(ctx, shape, cx, cy, s) {
  ctx.beginPath();
  if (shape === 'slab') ctx.roundRect(cx - s * 0.38, cy - s * 0.22, s * 0.76, s * 0.44, s * 0.08);
  else if (shape === 'book') ctx.roundRect(cx - s * 0.28, cy - s * 0.36, s * 0.56, s * 0.72, s * 0.05);
  else if (shape === 'cup') ctx.roundRect(cx - s * 0.26, cy - s * 0.3, s * 0.52, s * 0.6, [s * 0.04, s * 0.04, s * 0.2, s * 0.2]);
  else if (shape === 'blob') ctx.ellipse(cx, cy, s * 0.34, s * 0.3, 0, 0, Math.PI * 2);
  else if (shape === 'helmet') {
    ctx.arc(cx, cy + s * 0.06, s * 0.34, Math.PI, 0);
    ctx.lineTo(cx + s * 0.34, cy + s * 0.26);
    ctx.lineTo(cx - s * 0.34, cy + s * 0.26);
    ctx.closePath();
  } else if (shape === 'wing') {
    ctx.moveTo(cx - s * 0.4, cy + s * 0.05);
    ctx.quadraticCurveTo(cx, cy - s * 0.36, cx + s * 0.4, cy - s * 0.08);
    ctx.lineTo(cx + s * 0.4, cy + s * 0.12);
    ctx.quadraticCurveTo(cx, cy - s * 0.1, cx - s * 0.4, cy + s * 0.25);
    ctx.closePath();
  } else if (shape === 'trophy') {
    ctx.moveTo(cx - s * 0.3, cy - s * 0.32);
    ctx.lineTo(cx + s * 0.3, cy - s * 0.32);
    ctx.lineTo(cx + s * 0.18, cy + s * 0.08);
    ctx.lineTo(cx + s * 0.08, cy + s * 0.08);
    ctx.lineTo(cx + s * 0.08, cy + s * 0.26);
    ctx.lineTo(cx + s * 0.22, cy + s * 0.34);
    ctx.lineTo(cx - s * 0.22, cy + s * 0.34);
    ctx.lineTo(cx - s * 0.08, cy + s * 0.26);
    ctx.lineTo(cx - s * 0.08, cy + s * 0.08);
    ctx.lineTo(cx - s * 0.18, cy + s * 0.08);
    ctx.closePath();
  } else ctx.arc(cx, cy, s * 0.34, 0, Math.PI * 2); // disc
}

// The placeholder picture of one item type in box (x, y, w, h).
export function drawItemPlaceholder(ctx, t, g, x, y, w, h) {
  const s = Math.min(w, h);
  const cx = x + w / 2;
  const cy = y + h / 2;
  ctx.save();
  ctx.fillStyle = g?.color ?? C.progress;
  ctx.strokeStyle = C.outline;
  ctx.lineWidth = Math.max(2, s * 0.04);
  shapePath(ctx, g?.shape ?? 'disc', cx, cy, s);
  ctx.fill();
  ctx.stroke();
  const initials = t.name.split(/[\s+-]+/).filter((wd) => /^[A-Z]/.test(wd)).slice(0, 2).map((wd) => wd[0]).join('');
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `bold ${Math.round(s * 0.22)}px ${THEME.family}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(initials, cx, cy + s * 0.04);
  ctx.restore();
}

// The store icon placeholder: a supply crate.
export function drawStorePlaceholder(ctx, x, y, w, h) {
  const s = Math.min(w, h);
  const bx = x + (w - s * 0.8) / 2;
  const by = y + (h - s * 0.62) / 2;
  rr(ctx, bx, by, s * 0.8, s * 0.62, s * 0.06, '#C8902F', C.outline, Math.max(2, s * 0.04));
  ctx.strokeStyle = C.outline;
  ctx.lineWidth = Math.max(2, s * 0.03);
  ctx.beginPath();
  ctx.moveTo(bx, by + s * 0.2);
  ctx.lineTo(bx + s * 0.8, by + s * 0.2);
  ctx.moveTo(bx + s * 0.4, by + s * 0.2);
  ctx.lineTo(bx + s * 0.4, by + s * 0.62);
  ctx.stroke();
}

// Registers every placeholder and framed icon (core AssetManager.setFallback): a placeholder is drawn only while its file
// is missing; the framed icons are always this drawing (with the picture inside once it exists).
export function registerItemArt(assets, { types, groups, rarities, storeIcon = null }) {
  const groupOf = (id) => groups.find((g) => g.id === id) ?? null;
  for (const t of types) {
    const art = t.art ?? t.id;
    const g = groupOf(t.group);
    assets.setFallback(art, (ctx, x, y, w, h) => drawItemPlaceholder(ctx, t, g, x, y, w, h));
    for (const [rid, rar] of Object.entries(rarities)) {
      assets.setFallback(itemIcon(t.id, rid), (ctx, x, y, w, h) => {
        const s = Math.min(w, h);
        const fx = x + (w - s) / 2;
        const fy = y + (h - s) / 2;
        rr(ctx, fx + s * 0.03, fy + s * 0.03, s * 0.94, s * 0.94, s * 0.16, C.sheet ?? '#FFF6E5', rar.color, Math.max(3, s * (rar.frame === 'thin' ? 0.04 : 0.07)));
        const pad = s * 0.14;
        if (assets.has(art)) assets.drawContained(ctx, art, { x: fx + pad, y: fy + pad, w: s - pad * 2, h: s - pad * 2 });
        else drawItemPlaceholder(ctx, t, g, fx + pad, fy + pad, s - pad * 2, s - pad * 2);
        if (rar.gem) {
          ctx.fillStyle = rar.color;
          ctx.beginPath();
          ctx.arc(fx + s * 0.84, fy + s * 0.16, s * 0.08, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    }
  }
  if (storeIcon) assets.setFallback(storeIcon, drawStorePlaceholder);
}
