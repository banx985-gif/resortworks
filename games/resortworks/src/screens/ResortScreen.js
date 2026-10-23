// The placeholder resort screen (Milestone 0): what START RESORT (or Play / Continue) opens until the real resort map
// arrives in Milestone 1 — the resort's sign, "General Manager <name>" and the Founder (their full portrait, name and
// role), all in the chosen palette, with the date and "‹ Menu" back to the Main Menu.
import { THEME } from '../../../../core/Theme.js';
import { drawButton, hitRect } from '../../../../core/ui/Button.js';
import { card, text, para } from '../../../../core/ui/Kit.js';
import { founderById, paletteById, ROLES } from '../../data/setup.js';
import { drawSign } from '../ui/resortArt.js';
import { managerLine } from '../systems/resort.js';

const C = THEME.color;
const S = THEME.size;

// run(): the open campaign { n, data } or null.
export function createResortScreen({ renderer, layout, assets, run, onMenu }) {
  const menuRect = () => {
    const sr = layout.safeRect;
    return { x: sr.x + 24, y: sr.y + 24, w: 240, h: 110 };
  };

  return {
    onTap(p) {
      if (hitRect(p, menuRect())) onMenu();
    },
    onBack() {
      onMenu();
      return true;
    },
    render(ctx) {
      const open = run();
      if (!open) return;
      const r = open.data.resort;
      const palette = paletteById(r.palette);
      const founder = founderById(r.founder.id);
      const sr = layout.safeRect;
      const cx = sr.x + sr.w / 2;
      ctx.fillStyle = palette.light;
      ctx.fillRect(0, 0, renderer.width, renderer.height);
      const mr = menuRect();
      drawButton(ctx, mr, '‹ Menu', { accent: C.progress });
      const d = open.data.date;
      text(ctx, `Slot ${open.n} · Year ${d.year} · Month ${d.month} · Day ${d.day}`, sr.x + sr.w - 24, mr.y + mr.h / 2, { size: S.small, bold: true, color: palette.dark, align: 'right', baseline: 'middle', maxWidth: sr.w - mr.w - 80 });

      let y = mr.y + mr.h + 40;
      drawSign(ctx, assets, { x: sr.x + sr.w * 0.1, y, w: sr.w * 0.8, h: 300 }, r.name, palette, managerLine(r.manager));
      y += 300 + 30;
      text(ctx, managerLine(r.manager), cx, y, { size: S.title, bold: true, color: palette.dark, align: 'center', maxWidth: sr.w - 80 });
      y += 90;

      // The Founder: full portrait on a card in the palette colour.
      const bottomNote = 210;
      const ch = Math.max(420, sr.y + sr.h - bottomNote - y);
      const cr = { x: sr.x + 60, y, w: sr.w - 120, h: ch };
      card(ctx, cr, 'normal');
      ctx.fillStyle = palette.hex;
      ctx.beginPath();
      ctx.roundRect(cr.x + 10, cr.y + 10, cr.w - 20, 18, 9);
      ctx.fill();
      const fig = { x: cr.x + 40, y: cr.y + 50, w: cr.w * 0.42, h: ch - 90 };
      if (founder && assets.has(founder.art)) assets.drawContained(ctx, founder.art, fig, 'bottom');
      const tx = fig.x + fig.w + 40;
      const tw = cr.x + cr.w - 40 - tx;
      let ty = cr.y + 70;
      text(ctx, 'FOUNDER', tx, ty, { size: S.small, bold: true, color: C.textMuted, maxWidth: tw });
      ty += 46;
      text(ctx, founder?.name ?? r.founder.id, tx, ty, { size: S.title, bold: true, color: palette.dark, maxWidth: tw });
      ty += 80;
      if (founder) {
        ty += para(ctx, ROLES[founder.role].name, tx, ty, tw, { size: S.heading, bold: true, color: C.actionDark }) + 30;
        para(ctx, founder.perk.text, tx, ty, tw, { size: S.small, color: C.textMuted });
      }

      para(ctx, 'Your resort opens here in the next update: the motel, the first rooms and the team.', sr.x + 60, sr.y + sr.h - bottomNote + 40, sr.w - 120, { size: S.body, color: C.textMuted, align: 'center' });
    },
    // Screen rect of a tappable thing (tests): 'menu'.
    rectOf(id) {
      return id === 'menu' ? menuRect() : null;
    },
  };
}
