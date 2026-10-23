// Resort Setup (Milestone 0, bible §5) for one campaign slot. Top to bottom, in the M0 card's order: Resort Name (type
// it or Random), General Manager Name (type it or Random; shown as "General Manager <name>"), Accent Colour (six
// palettes or Random, with the sign preview — cosmetic only), Founder (five cards with their real portrait, role and
// perk), RANDOMISE ALL (every field stays editable after), then the START RESORT button fixed at the bottom. Starting
// into an occupied slot is confirmed by main.js (naming the resort it replaces). Drag scrolls.
// Layout and tapping share one pass, so they can never disagree.
import { THEME, font } from '../../../../core/Theme.js';
import { ScrollPanel } from '../../../../core/ui/ScrollPanel.js';
import { drawButton, hitRect } from '../../../../core/ui/Button.js';
import { card, text, para } from '../../../../core/ui/Kit.js';
import { pickName, pickIndex } from '../../../../core/NamePicker.js';
import { FOUNDERS, PALETTES, RESORT_NAMES, MANAGER_FIRST, MANAGER_LAST, NAME_MAX, ROLES, paletteById } from '../../data/setup.js';
import { drawPortrait, drawSign, diceButton } from '../ui/resortArt.js';
import { managerLine } from '../systems/resort.js';

const C = THEME.color;
const S = THEME.size;
const PAD = 32;

export function createSetupScreen({ layout, assets, textPrompt, onBack, onStart, random: rnd = Math.random }) {
  let slot = 1;
  let replacing = null; // the summary of the resort this slot holds now (shown in the header)
  let setup = null; // { resort, manager, palette, founder }

  const headerRect = () => {
    const sr = layout.safeRect;
    return { x: sr.x + 24, y: sr.y + 24, w: 220, h: 110 };
  };
  const bottomRect = () => layout.anchor('bottom', layout.safeRect.w - 64, THEME.button.minH + 20, 24);
  const panelRect = () => {
    const h = headerRect();
    const sr = layout.safeRect;
    const y = h.y + h.h + 20;
    return { x: sr.x + 16, y, w: sr.w - 32, h: bottomRect().y - 16 - y };
  };
  const scroll = new ScrollPanel({ getRect: panelRect });
  const missing = () => [!setup.resort.trim() && 'a resort name', !setup.manager.trim() && "the manager's name"].filter(Boolean);

  const indexOf = (list, id) => list.findIndex((x) => x.id === id);
  const randomManager = () => {
    for (let i = 0; i < 8; i++) {
      const n = `${pickName(MANAGER_FIRST, { random: rnd })} ${pickName(MANAGER_LAST, { random: rnd })}`;
      if (n !== setup.manager) return n;
    }
    return `${MANAGER_FIRST[0]} ${MANAGER_LAST[0]}`;
  };
  const random = {
    resort: () => (setup.resort = pickName(RESORT_NAMES, { not: setup.resort, random: rnd })),
    manager: () => (setup.manager = randomManager()),
    palette: () => (setup.palette = PALETTES[pickIndex(PALETTES.length, { not: indexOf(PALETTES, setup.palette), random: rnd })].id),
    founder: () => (setup.founder = FOUNDERS[pickIndex(FOUNDERS.length, { not: indexOf(FOUNDERS, setup.founder), random: rnd })].id),
  };
  const randomiseAll = () => Object.values(random).forEach((fn) => fn());

  // One pass over the scrolling content (content coordinates). Draws when ctx is given, returns the action under
  // `tap`, and records every tappable rect by id in `rects`.
  function pass(ctx, tap, rects = null) {
    const w = panelRect().w;
    const cw = w - PAD * 2;
    const palette = paletteById(setup.palette);
    let y = PAD;
    let hit = null;
    const box = (r, fn, id) => {
      if (rects && id) rects[id] = r;
      if (tap && !hit && hitRect(tap, r)) hit = fn;
    };
    const heading = (n, label, sub = null) => {
      if (ctx) {
        text(ctx, `${n}. ${label}`, PAD, y, { size: S.heading, bold: true, maxWidth: sub ? cw * 0.55 : cw });
        if (sub) text(ctx, sub, PAD + cw, y + 10, { size: S.small, color: C.textMuted, align: 'right', maxWidth: cw * 0.43 });
      }
      y += 66;
    };

    // A typed field with a Random button beside it.
    const field = (id, n, label, value, placeholder, max) => {
      heading(n, label);
      const f = { x: PAD, y, w: cw - 270, h: 110 };
      const rr = { x: PAD + cw - 250, y, w: 250, h: 110 };
      if (ctx) {
        ctx.fillStyle = C.sheet;
        ctx.strokeStyle = value.trim() ? C.outline : C.action;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.roundRect(f.x, f.y, f.w, f.h, 22);
        ctx.fill();
        ctx.stroke();
        text(ctx, value || placeholder, f.x + 28, f.y + f.h / 2, { size: S.heading, bold: !!value, color: value ? C.text : C.textFaint, baseline: 'middle', maxWidth: f.w - 56 });
        diceButton(ctx, assets, rr, 'Random', { accent: C.progress });
      }
      box(f, () => edit(id, f, max, placeholder), id);
      box(rr, random[id], `${id}Random`);
      y += 110 + 20;
    };
    field('resort', 1, 'Resort Name', setup.resort, 'Tap to name your resort', NAME_MAX.resort);
    y += 16;
    field('manager', 2, 'General Manager Name', setup.manager, 'Tap to type your name', NAME_MAX.manager);
    if (ctx) text(ctx, managerLine(setup.manager.trim()), PAD, y, { size: S.body, color: palette.dark, bold: true, maxWidth: cw });
    y += 50 + 30;

    // 3. Accent colour: six palettes + Random, then the sign preview.
    heading(3, 'Accent Colour', 'cosmetic only');
    const n = PALETTES.length + 1;
    const sw = Math.min(120, (cw - (n - 1) * 16) / n);
    PALETTES.forEach((p, i) => {
      const r = { x: PAD + i * (sw + 16), y, w: sw, h: sw };
      const on = setup.palette === p.id;
      if (ctx) {
        ctx.fillStyle = p.hex;
        ctx.strokeStyle = C.outline;
        ctx.lineWidth = on ? 8 : 4;
        ctx.beginPath();
        ctx.roundRect(r.x + 6, r.y + 6, r.w - 12, r.h - 12, 22);
        ctx.fill();
        ctx.stroke();
        if (on) text(ctx, '✓', r.x + r.w / 2, r.y + r.h / 2 + 2, { size: 56, bold: true, color: '#FFFFFF', align: 'center', baseline: 'middle' });
      }
      box(r, () => (setup.palette = p.id), `palette:${p.id}`);
    });
    const pr = { x: PAD + (n - 1) * (sw + 16), y, w: sw, h: sw };
    if (ctx) diceButton(ctx, assets, pr, '', { accent: C.progress });
    box(pr, random.palette, 'paletteRandom');
    y += sw + 12;
    if (ctx) text(ctx, palette.name, PAD, y, { size: S.small, bold: true, color: palette.dark });
    y += 48;
    if (ctx) drawSign(ctx, assets, { x: PAD + cw * 0.1, y, w: cw * 0.8, h: 240 }, setup.resort.trim(), palette, setup.manager.trim() ? managerLine(setup.manager.trim()) : '');
    y += 240 + 40;

    // 4. Founder: five cards, each with their real portrait.
    heading(4, 'Founder', 'perk lasts the whole run');
    for (const f of FOUNDERS) {
      const on = setup.founder === f.id;
      const tw = cw - 230 - 40;
      const perkH = para(null, f.perk.text, 0, 0, tw, { size: S.small });
      const h = Math.max(240, 150 + perkH);
      const r = { x: PAD, y, w: cw, h };
      if (ctx) {
        card(ctx, r, on ? 'selected' : 'normal');
        drawPortrait(ctx, { x: r.x + 20, y: r.y + 20, w: 200, h: 200 }, f, on ? palette.hex : null, assets);
        const tx = r.x + 250;
        let ty = r.y + 24;
        text(ctx, f.name, tx, ty, { size: S.heading, bold: true, maxWidth: tw - 160 });
        if (on) text(ctx, '✓ Founder', r.x + r.w - 24, ty + 6, { size: S.small, bold: true, color: C.good, align: 'right' });
        ty += 56;
        text(ctx, ROLES[f.role].name, tx, ty, { size: S.body, bold: true, color: C.actionDark, maxWidth: tw });
        ty += 52;
        para(ctx, f.perk.text, tx, ty, tw, { size: S.small });
      }
      box(r, () => (setup.founder = f.id), `founder:${f.id}`);
      y += h + 20;
    }
    y += 20;

    // 5. RANDOMISE ALL.
    const all = { x: PAD, y, w: cw, h: 130 };
    if (ctx) diceButton(ctx, assets, all, 'RANDOMISE ALL', { accent: C.purple, font: font(S.button, true) });
    box(all, randomiseAll, 'randomAll');
    y += 130 + 16;
    if (ctx) text(ctx, 'Fills every field. You can still change any of them.', PAD + cw / 2, y, { size: S.small, color: C.textMuted, align: 'center', maxWidth: cw });
    y += 50;
    return { height: y + PAD, hit };
  }

  function edit(id, fieldContent, max, placeholder) {
    const pr = panelRect();
    const rect = { x: pr.x + fieldContent.x, y: pr.y + fieldContent.y - scroll.scrollY, w: fieldContent.w, h: fieldContent.h };
    textPrompt.open({ rect, value: setup[id], maxLength: max, placeholder, onDone: (v) => (setup[id] = v.trim().slice(0, max)) });
  }

  function start() {
    if (missing().length) return;
    textPrompt.close();
    onStart(slot, { ...setup, resort: setup.resort.trim(), manager: setup.manager.trim() });
  }

  const screen = {
    get setup() {
      return setup;
    },
    get slot() {
      return slot;
    },
    get ready() {
      return missing().length === 0;
    },
    randomiseAll,
    start,
    enter(params = {}) {
      slot = params.slot ?? 1;
      replacing = params.replacing ?? null;
      setup = { resort: '', manager: '', palette: PALETTES[0].id, founder: FOUNDERS[0].id };
      scroll.scrollY = 0;
    },
    exit() {
      textPrompt.close();
    },
    onBack() {
      onBack();
      return true;
    },
    onDragStart(p) {
      scroll.beginDrag(p);
    },
    onDrag(p) {
      scroll.drag(p);
    },
    onDragEnd(p) {
      scroll.endDrag(p);
    },
    onUp(p) {
      scroll.endDrag(p);
    },
    onWheel(p) {
      scroll.scrollY += p.deltaY ?? p.dy ?? 0;
      scroll.clamp();
    },
    onTap(p) {
      if (hitRect(p, headerRect())) return void onBack();
      if (hitRect(p, bottomRect())) return void start();
      if (!scroll.contains(p)) return;
      pass(null, scroll.toContent(p)).hit?.();
    },
    render(ctx) {
      const hr = headerRect();
      const sr = layout.safeRect;
      drawButton(ctx, hr, '‹ Back', { accent: C.progress });
      text(ctx, 'Resort Setup', sr.x + sr.w / 2 + 60, hr.y + hr.h / 2 - 20, { size: S.title, bold: true, align: 'center', baseline: 'middle' });
      const sub = replacing ? `Campaign slot ${slot} · replaces ${replacing.resort}` : `Campaign slot ${slot}`;
      text(ctx, sub, sr.x + sr.w / 2 + 60, hr.y + hr.h / 2 + 34, { size: S.small, bold: !!replacing, color: replacing ? C.bad : C.textMuted, align: 'center', baseline: 'middle', maxWidth: sr.w - 320 });
      const r = panelRect();
      ctx.fillStyle = C.panel;
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = THEME.panel.line;
      ctx.beginPath();
      ctx.roundRect(r.x, r.y, r.w, r.h, THEME.panel.radius);
      ctx.fill();
      ctx.stroke();
      scroll.begin(ctx);
      scroll.contentHeight = pass(ctx, null).height;
      scroll.end(ctx);
      const miss = missing();
      const palette = paletteById(setup.palette);
      drawButton(ctx, bottomRect(), miss.length ? `Needs ${miss.join(' and ')}` : 'START RESORT', { disabled: miss.length > 0, accent: palette.hex, font: font(miss.length ? S.body : 48, true) });
    },
  };
  // Screen rect of a tappable thing (tests): 'start', 'randomAll', 'resort', 'resortRandom', 'manager', 'palette:coral',
  // 'paletteRandom', 'founder:S21'…
  screen.rectOf = (what) => {
    if (what === 'start') return bottomRect();
    const rects = {};
    scroll.contentHeight = pass(null, null, rects).height;
    const r = rects[what];
    const pr = panelRect();
    return r ? { x: pr.x + r.x, y: pr.y + r.y - scroll.scrollY, w: r.w, h: r.h } : null;
  };
  screen.scrollTo = (what) => {
    const rects = {};
    scroll.contentHeight = pass(null, null, rects).height;
    const r = rects[what];
    if (r) {
      scroll.scrollY = r.y - 40;
      scroll.clamp();
    }
  };
  return screen;
}
