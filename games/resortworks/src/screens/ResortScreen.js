// The Resort Hub (Milestone 1, bible §6, style guide §2–4): the Roadside Lot on a hidden grid in the 3/4 dollhouse view.
// Ground, road, kerb, lot edge and paths are drawn by code (the lot's kerb and path edging in the slot's accent colour);
// the eight starting facilities and the first two rooms are their art at one scale; the guest and the Founder walk their
// loops (src/systems/resortWorld.js). Drag pans, pinch / wheel zooms (clamped to the lot) on core/WorldGestures; a drag
// is never a tap. Tapping the guest, the Founder, a facility or a room opens its sheet (src/screens/resortSheets.js); the
// temporary bottom-row shortcut opens the Reception sheet through the same code. A long press on empty land enters the
// placeholder Build Mode (a banner with Done; Back leaves it too). ‹ Menu (or Back) returns to the Main Menu.
//   createResortScreen({ renderer, layout, assets, bus, sheet, run, onMenu, debug })
//     run() → the open campaign { n, data } or null
import { THEME, font } from '../../../../core/Theme.js';
import { IsoProjection } from '../../../../core/IsoProjection.js';
import { Camera } from '../../../../core/Camera.js';
import { WorldGestures } from '../../../../core/WorldGestures.js';
import { CachedLayer } from '../../../../core/CachedLayer.js';
import { Selection } from '../../../../core/Selection.js';
import { AlphaHit } from '../../../../core/AlphaHit.js';
import { isoPath } from '../../../../core/IsoRoom.js';
import { findPath } from '../../../../core/Pathing.js';
import { drawCharacter } from '../../../../core/CharacterMotion.js';
import { drawButton, hitRect } from '../../../../core/ui/Button.js';
import { card, text, para } from '../../../../core/ui/Kit.js';
import { founderById, paletteById } from '../../data/setup.js';
import { LOT, ART_LOOK, ART_TWEAK, PERSON, LOOK } from '../../data/lot.js';
import { createResortWorld } from '../systems/resortWorld.js';
import { resortSheet } from './resortSheets.js';
import { managerLine } from '../systems/resort.js';

const C = THEME.color;
const S = THEME.size;
const CELL = LOT.cell;
const HW = LOT.view.halfW;
const HH = LOT.view.halfH;
const ROWS_DRAWN = LOT.rows + LOT.road.to; // the lot plus the road in front of it
// Sprite detail steps: the smallest step at or above the camera zoom, so pictures are cached near the size they are drawn.
const DETAIL_STEPS = [0.35, 0.5, 0.7, 1.0, 1.4];
const detailFor = (zoom) => DETAIL_STEPS.find((d) => d >= zoom - 1e-3) ?? DETAIL_STEPS[DETAIL_STEPS.length - 1];
const PEOPLE_FIRST = 1e6; // people are picked over the building behind them

export function createResortScreen({ renderer, layout, assets, bus, sheet, run, onMenu, debug = null }) {
  const W = renderer.width;
  const iso = new IsoProjection({ tileSize: CELL, halfW: HW, halfH: HH, originX: LOT.margin + ROWS_DRAWN * HW, originY: LOT.margin + LOT.topOverhang });
  const worldW = (LOT.cols + ROWS_DRAWN) * HW + LOT.margin * 2;
  const worldH = (LOT.cols + ROWS_DRAWN) * HH + LOT.topOverhang + LOT.margin * 2;
  const camera = new Camera({ viewW: W, viewH: renderer.height, worldW, worldH });
  camera.maxZoom = LOT.zoom.max;
  camera.minZoom = LOT.zoom.min;
  const groundLayer = new CachedLayer({ width: worldW, height: worldH, draw: drawGround });
  const groundScale = () => Math.min(renderer.pixelScale * detailFor(camera.zoom), Math.sqrt(LOT.floorMaxPixels / (worldW * worldH)));

  let world = null;
  let slotN = null;
  let palette = paletteById(null);
  let paths = null; // Set of "c,r" — the lanes people use, drawn as sandy paths
  let buildMode = false;
  let active = false;
  let viewSet = false;
  const taps = []; // recent taps and what they hit (tests / debug)
  let opened = null; // { id, via } — the last sheet opened (tests)

  // --- where things are drawn (projected world) ------------------------------------------------------------------
  const lookOf = (id) => ({ ...ART_LOOK, ...(ART_TWEAK[id] ?? {}) });
  function artRect(it) {
    const look = lookOf(it.id);
    const fp = it.fp;
    const w = (fp.w + fp.h) * HW * look.width;
    const h = w / (assets.aspect(it.def.art) || 1);
    const cx = iso.corner(fp.col + fp.w / 2, fp.row + fp.h / 2).x;
    const front = iso.corner(fp.col + fp.w, fp.row + fp.h).y;
    return { x: cx - w / 2, y: front - h * look.foot, w, h };
  }
  const feetOf = (p) => iso.toWorld(p.agent.x, p.agent.y);
  function personRect(p) {
    const f = feetOf(p);
    const h = PERSON.height;
    const w = h * (assets.aspect(p.art) || 0.8);
    return { x: f.x - w / 2, y: f.y - h * PERSON.feet, w, h };
  }
  // A building is tapped on its painted pixels (core/AlphaHit) or its footprint — so the empty sky of a tall picture never
  // takes a tap meant for the building behind it. Until a mask exists, its silhouette stands in: the footprint diamond's
  // left, front and right corners raised to the top of its art.
  const alpha = new AlphaHit(assets);
  const diamondOf = (it) => iso.outline(it.fp.col, it.fp.row, it.fp.w, it.fp.h);
  function hitsBuilding(it, x, y) {
    const a = alpha.painted(it.def.art, artRect(it), x, y);
    if (a === null) return inside(outlineOf(it), x, y);
    return a || inside(diamondOf(it), x, y);
  }
  function outlineOf(it) {
    const fp = it.fp;
    const L = iso.corner(fp.col, fp.row + fp.h);
    const B = iso.corner(fp.col + fp.w, fp.row + fp.h);
    const R = iso.corner(fp.col + fp.w, fp.row);
    const r = artRect(it);
    const top = r.y + r.h * 0.08;
    return [L, B, R, { x: R.x, y: top }, { x: L.x, y: top }];
  }
  const depthOf = (it) => (it.kind === 'guest' || it.kind === 'staff' ? it.agent.x + it.agent.y : (it.fp.col + it.fp.w / 2 + it.fp.row + it.fp.h / 2) * CELL);

  // The tap list: one entry per thing, hit-tested on what is drawn.
  const selection = new Selection(bus, { depthOf: (e) => depthOf(e.ref) + (e.person ? PEOPLE_FIRST : 0), minHitSize: 90 });
  function syncSelection() {
    for (const e of [...selection.items]) selection.remove(e);
    for (const it of world.items) selection.add({ ref: it, person: false, hitTest: (x, y) => hitsBuilding(it, x, y) });
    for (const p of world.people)
      selection.add({
        ref: p,
        person: true,
        hitTest: (x, y) => {
          const r = personRect(p);
          const b = { x: r.x + r.w * 0.18, y: r.y + r.h * 0.04, w: r.w * 0.64, h: r.h * 0.94 };
          const pad = Math.max(0, (90 - b.w) / 2);
          return x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y && y <= b.y + b.h;
        },
      });
  }

  // --- screen rects ------------------------------------------------------------------------------------------------
  const menuRect = () => {
    const sr = layout.safeRect;
    return { x: sr.x + 24, y: sr.y + 24, w: 220, h: 110 };
  };
  const plateRect = () => {
    const m = menuRect();
    const sr = layout.safeRect;
    return { x: m.x + m.w + 20, y: m.y, w: sr.x + sr.w - 24 - (m.x + m.w + 20), h: m.h };
  };
  // The temporary bottom-row shortcut (the five-button bar and the Menu button come later).
  const shortcutRect = () => {
    const sr = layout.safeRect;
    const w = Math.min(560, sr.w - 48);
    return { x: sr.x + (sr.w - w) / 2, y: sr.y + sr.h - 24 - 130, w, h: 130 };
  };
  const bannerRect = () => {
    const sr = layout.safeRect;
    return { x: sr.x + 24, y: sr.y + 24, w: sr.w - 48, h: 300 };
  };
  const doneRect = () => {
    const b = bannerRect();
    return { x: b.x + b.w - 300 - 24, y: b.y + b.h - 24 - 110, w: 300, h: 110 };
  };
  const onUi = (p) => (buildMode ? hitRect(p, bannerRect()) : hitRect(p, menuRect()) || hitRect(p, plateRect()) || hitRect(p, shortcutRect()));
  const overSheet = (p) => sheet.active && p.y >= sheet.rect().y;

  // The camera sees the lot between the header and the bottom row.
  function fitView() {
    const top = menuRect();
    const bottom = shortcutRect();
    camera.viewX = 0;
    camera.viewY = top.y + top.h + 12;
    camera.setView(W, bottom.y - 12 - camera.viewY);
  }
  function resetView() {
    fitView();
    camera.zoom = LOT.zoom.start;
    const c = iso.cellCenter(LOT.cols * 0.42, LOT.rows * 0.62); // the middle of the lot, nearer the road
    camera.centerOn(c.x, c.y);
  }
  function resize() {
    camera.pixelScale = renderer.pixelScale;
    groundLayer.setPixelScale(groundScale());
    const cx = camera.x + camera.visibleW / 2;
    const cy = camera.y + camera.visibleH / 2;
    fitView();
    camera.centerOn(cx, cy);
  }
  bus.on('renderer:resize', () => {
    if (active) resize();
  });

  // --- gestures, taps, sheets ------------------------------------------------------------------------------------
  const gestures = new WorldGestures({ camera, bus, isActive: () => active });
  const pickAt = (sx, sy) => {
    const w = camera.screenToWorld(sx, sy);
    return selection.pick(w.x, w.y)?.ref ?? null;
  };
  const cellAt = (sx, sy) => {
    const w = camera.screenToWorld(sx, sy);
    const plan = iso.toPlan(w.x, w.y);
    const c = { col: Math.floor(plan.x / CELL), row: Math.floor(plan.y / CELL) };
    return world?.grid.inBounds(c.col, c.row) ? c : null;
  };
  const inView = (sx, sy) => sy >= camera.viewY && sy <= camera.viewY + camera.viewH;

  function openSheet(id, via = 'art') {
    if (!world?.byId(id)) return;
    const accent = palette.hex;
    sheet.open(() => resortSheet(world, id, { accent }));
    opened = { id, via };
    debug?.log(`sheet: ${id} (${via})`);
  }
  function setBuildMode(on) {
    if (buildMode === on) return;
    buildMode = on;
    if (on) sheet.close();
    debug?.log(`Build Mode ${on ? 'on' : 'off'}`);
  }

  // The world for the open campaign: a new one when another slot (or Founder) is opened.
  function ensureWorld() {
    const o = run();
    if (!o) return false;
    const founder = founderById(o.data.resort.founder.id);
    palette = paletteById(o.data.resort.palette);
    if (!world || slotN !== o.n || world.founder !== founder) {
      if (slotN !== o.n) viewSet = false;
      world = createResortWorld({ founder });
      slotN = o.n;
      paths = null;
      syncSelection();
    }
    groundLayer.invalidate(); // (the accent colour may differ)
    return true;
  }

  const pose = { bob: 0, tilt: 0, flip: 1 }; // no bob or sway yet (Milestone 1 card)

  const screen = {
    get world() {
      return world;
    },
    get camera() {
      return camera;
    },
    get buildMode() {
      return buildMode;
    },
    get opened() {
      return opened;
    },
    taps,
    setBuildMode,
    openSheet,
    enter() {
      active = true;
      if (!ensureWorld()) return;
      resize();
      if (!viewSet) {
        viewSet = true;
        resetView();
      }
    },
    exit() {
      active = false;
      gestures.reset();
      setBuildMode(false);
      selection.clear();
    },
    update(dt) {
      world?.update(dt);
    },
    onBack() {
      if (buildMode) setBuildMode(false);
      else onMenu();
      return true;
    },
    onDown(p) {
      if (overSheet(p) || onUi(p)) return; // the buttons, the banner and the sheet never pan or pinch the lot
      gestures.down(p);
    },
    onUp(p) {
      gestures.up(p);
    },
    onDragStart(p) {
      gestures.dragStart(p);
    },
    onDrag(p) {
      gestures.drag(p);
    },
    onDragEnd(p) {
      gestures.dragEnd(p);
    },
    onWheel(p) {
      gestures.wheel(p);
    },
    onTap(p) {
      if (!world || gestures.multiTouch) return;
      const log = (picked) => {
        taps.push({ x: p.x, y: p.y, picked });
        if (taps.length > 50) taps.shift();
      };
      if (buildMode) {
        if (hitRect(p, doneRect())) setBuildMode(false);
        return log(hitRect(p, doneRect()) ? 'done' : null);
      }
      if (hitRect(p, menuRect())) {
        onMenu();
        return log('menu');
      }
      if (hitRect(p, shortcutRect())) {
        openSheet('F01', 'shortcut');
        return log('shortcut');
      }
      if (hitRect(p, plateRect()) || !inView(p.x, p.y)) return log(null);
      const picked = pickAt(p.x, p.y);
      if (picked) openSheet(picked.id);
      log(picked?.id ?? null);
    },
    // Long press on empty land → Build Mode (on a building or a person it opens their sheet, like a tap).
    onHold(p) {
      if (!world || buildMode || gestures.multiTouch || gestures.fingers > 1 || onUi(p) || overSheet(p) || !inView(p.x, p.y)) return;
      const picked = pickAt(p.x, p.y);
      if (picked) return openSheet(picked.id);
      const c = cellAt(p.x, p.y);
      if (c && !world.grid.isBlocked(c.col, c.row)) setBuildMode(true);
    },

    render(ctx) {
      ctx.fillStyle = LOOK.verge;
      ctx.fillRect(0, 0, W, renderer.height);
      if (!world) {
        drawButton(ctx, menuRect(), '‹ Menu', { accent: C.progress });
        return;
      }
      camera.apply(ctx);
      drawRoad(ctx); // live, so it runs off both sides of the screen at any zoom
      groundLayer.setPixelScale(groundScale());
      groundLayer.renderView(ctx, { x: camera.x, y: camera.y, w: camera.visibleW, h: camera.visibleH });
      if (buildMode) drawBuildGrid(ctx);
      assets.detail = detailFor(camera.zoom);
      const things = [...world.items, ...world.people].sort((a, b) => depthOf(a) - depthOf(b));
      for (const it of things) {
        if (it.kind === 'guest' || it.kind === 'staff') {
          const r = personRect(it);
          pose.flip = it.facing;
          drawCharacter(ctx, assets, it.art, r.x + r.w / 2, r.y + r.h, r.w, r.h, pose);
        } else {
          const r = artRect(it);
          assets.draw(ctx, it.def.art, r.x, r.y, r.w, r.h);
        }
      }
      assets.detail = 1;
      camera.restore(ctx);
      if (buildMode) drawBanner(ctx);
      else {
        drawButton(ctx, menuRect(), '‹ Menu', { accent: C.progress });
        drawPlate(ctx);
        drawButton(ctx, shortcutRect(), 'Reception', { accent: C.action });
      }
    },

    // --- test helpers (?debug=1) -------------------------------------------------------------------------------------
    // A screen point where this thing is what a tap picks (it is in front there), nearest its middle — or null when it
    // is hidden or off screen at this view.
    visiblePointOf(id) {
      const it = world?.byId(id);
      if (!it) return null;
      const mid = screen.pointOf(id);
      const r = it.kind === 'guest' || it.kind === 'staff' ? personRect(it) : artRect(it);
      let best = null;
      for (let i = 1; i < 12; i++)
        for (let j = 1; j < 12; j++) {
          const s = camera.worldToScreen(r.x + (r.w * i) / 12, r.y + (r.h * j) / 12);
          if (!inView(s.x, s.y) || s.x < 30 || s.x > W - 30 || onUi(s) || overSheet(s) || pickAt(s.x, s.y) !== it) continue;
          const d = Math.hypot(s.x - mid.x, s.y - mid.y);
          if (!best || d < best.d) best = { x: s.x, y: s.y, d };
        }
      return best;
    },
    // Screen point of a thing's middle: a building's silhouette centre, a person's chest.
    pointOf(id) {
      const it = world?.byId(id);
      if (!it) return null;
      let w;
      if (it.kind === 'guest' || it.kind === 'staff') {
        const r = personRect(it);
        w = { x: r.x + r.w / 2, y: r.y + r.h * 0.45 };
      } else {
        const o = outlineOf(it);
        w = { x: (o[0].x + o[2].x) / 2, y: (o[1].y + o[3].y) / 2 };
      }
      return camera.worldToScreen(w.x, w.y);
    },
    // A screen point on empty land (a free tile that is not a path, on screen, clear of the buttons and every picture).
    emptyPoint() {
      if (!world) return null;
      const P = pathCells();
      const mid = camera.worldToScreen(camera.x + camera.visibleW / 2, camera.y + camera.visibleH / 2);
      let best = null;
      for (let r = 0; r < LOT.rows; r++)
        for (let c = 0; c < LOT.cols; c++) {
          if (world.grid.isBlocked(c, r) || P.has(`${c},${r}`)) continue;
          const w = iso.cellCenter(c, r);
          const s = camera.worldToScreen(w.x, w.y);
          if (!inView(s.x, s.y) || s.x < 60 || s.x > W - 60 || onUi(s) || pickAt(s.x, s.y)) continue;
          const d = Math.hypot(s.x - mid.x, s.y - mid.y);
          if (!best || d < best.d) best = { x: s.x, y: s.y, d, col: c, row: r };
        }
      return best;
    },
    rectOf(id) {
      return { menu: menuRect(), shortcut: shortcutRect(), done: buildMode ? doneRect() : null, banner: buildMode ? bannerRect() : null, plate: plateRect() }[id] ?? null;
    },
    pathCells: () => pathCells(),
  };

  // --- the lanes people use: from the parking door to every doorway, the shortest walks over free tiles -----------
  function pathCells() {
    if (paths) return paths;
    paths = new Set();
    if (!world) return paths;
    const from = world.byId('F07').door;
    for (const it of world.items) {
      paths.add(`${it.door.col},${it.door.row}`);
      for (const t of findPath(world.grid, from, it.door) ?? []) paths.add(`${t.col},${t.row}`);
    }
    paths.add(`${from.col},${from.row}`);
    return paths;
  }

  // --- drawing -----------------------------------------------------------------------------------------------------
  function patch(g, pts, fill, stroke = null, lw = 2) {
    isoPath(g, pts);
    g.fillStyle = fill;
    g.fill();
    if (stroke) {
      g.strokeStyle = stroke;
      g.lineWidth = lw;
      g.stroke();
    }
  }
  function band(g, r0, r1, c0, c1, fill) {
    patch(g, [iso.corner(c0, r0), iso.corner(c1, r0), iso.corner(c1, r1), iso.corner(c0, r1)], fill);
  }
  function line(g, a, b) {
    g.beginPath();
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
    g.stroke();
  }
  // The road in front of the lot: a pale kerb strip, the tarmac, its edges and the dashed centre line. Drawn live (a few
  // shapes) over the verge, far past both ends of the lot, so it never stops at the edge of a picture.
  function drawRoad(g) {
    const R = LOT.rows;
    const far = 40;
    g.lineJoin = 'round';
    band(g, R, R + LOT.road.from, -far, LOT.cols + far, LOOK.kerb);
    band(g, R + LOT.road.from, R + LOT.road.to, -far, LOT.cols + far, LOOK.road);
    g.strokeStyle = LOOK.roadEdge;
    g.lineWidth = 6;
    line(g, iso.corner(-far, R + LOT.road.from), iso.corner(LOT.cols + far, R + LOT.road.from));
    line(g, iso.corner(-far, R + LOT.road.to), iso.corner(LOT.cols + far, R + LOT.road.to));
    g.strokeStyle = LOOK.roadLine;
    g.lineWidth = 8;
    const mid = R + (LOT.road.from + LOT.road.to) / 2;
    g.setLineDash([0.45 * Math.hypot(HW, HH), 0.55 * Math.hypot(HW, HH)]);
    line(g, iso.corner(-far, mid), iso.corner(LOT.cols + far, mid));
    g.setLineDash([]);
  }
  // The lot's grass, the sandy lanes, the accent kerb round the lot and a soft shade under each building — drawn once
  // into the cached layer (again when the slot or its colour changes). The rest of the layer stays clear (the verge
  // and the road are under it).
  function drawGround(g) {
    const R = LOT.rows;
    g.lineJoin = 'round';
    // The lot: grass in soft two-tone tiles.
    for (let r = 0; r < R; r++) for (let c = 0; c < LOT.cols; c++) patch(g, iso.outline(c, r), (c + r) % 2 ? LOOK.grassA : LOOK.grassB);
    g.strokeStyle = LOOK.grassLine;
    g.lineWidth = 1.2;
    for (let c = 0; c <= LOT.cols; c += 1) line(g, iso.corner(c, 0), iso.corner(c, R));
    // The lanes: sandy tiles, edged in the accent colour, joined across neighbouring tiles.
    const P = pathCells();
    const has = (c, r) => P.has(`${c},${r}`);
    for (const pass of [0, 1]) {
      const inset = pass ? 0.16 : 0.08;
      const fill = pass ? LOOK.path : palette.hex;
      for (const k of P) {
        const [c, r] = k.split(',').map(Number);
        patch(g, iso.outline(c + inset, r + inset, 1 - inset * 2, 1 - inset * 2), fill);
        if (has(c + 1, r)) patch(g, iso.outline(c + 1 - inset, r + inset, inset * 2, 1 - inset * 2), fill);
        if (has(c, r + 1)) patch(g, iso.outline(c + inset, r + 1 - inset, 1 - inset * 2, inset * 2), fill);
      }
    }
    // The lane out to the road from the parking door.
    const d = world?.byId('F07')?.door;
    if (d) {
      patch(g, iso.outline(d.col + 0.08, d.row + 0.08, 0.84, R + LOT.road.from - d.row - 0.08), palette.hex);
      patch(g, iso.outline(d.col + 0.16, d.row + 0.16, 0.68, R + LOT.road.from - d.row - 0.16), LOOK.path);
    }
    // A soft shade under every building, to seat its art on the grass.
    for (const it of world?.items ?? []) patch(g, iso.outline(it.fp.col - 0.04, it.fp.row - 0.04, it.fp.w + 0.08, it.fp.h + 0.08), LOOK.shade);
    // The lot's edge: a low kerb in the accent colour all round.
    g.strokeStyle = palette.dark;
    g.lineWidth = 16;
    isoPath(g, iso.outline(0, 0, LOT.cols, R));
    g.stroke();
    g.strokeStyle = palette.hex;
    g.lineWidth = 9;
    isoPath(g, iso.outline(0, 0, LOT.cols, R));
    g.stroke();
  }
  // Build Mode (placeholder): the hidden grid shown over the lot.
  function drawBuildGrid(ctx) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 2 / camera.zoom;
    for (let c = 0; c <= LOT.cols; c++) line(ctx, iso.corner(c, 0), iso.corner(c, LOT.rows));
    for (let r = 0; r <= LOT.rows; r++) line(ctx, iso.corner(0, r), iso.corner(LOT.cols, r));
    ctx.restore();
  }
  function drawPlate(ctx) {
    const r = plateRect();
    const o = run();
    if (!o) return;
    card(ctx, r, 'normal');
    ctx.fillStyle = palette.hex;
    ctx.beginPath();
    ctx.roundRect(r.x + 10, r.y + 14, 14, r.h - 28, 7);
    ctx.fill();
    text(ctx, o.data.resort.name, r.x + 40, r.y + 14, { size: S.heading, bold: true, color: palette.dark, maxWidth: r.w - 60 });
    text(ctx, managerLine(o.data.resort.manager), r.x + 40, r.y + 66, { size: S.small, color: C.textMuted, maxWidth: r.w - 60 });
  }
  function drawBanner(ctx) {
    const b = bannerRect();
    card(ctx, b, 'gold');
    text(ctx, 'Build Mode', b.x + 32, b.y + 28, { size: S.title, bold: true, color: C.gold, maxWidth: b.w - 64 });
    para(ctx, 'Nothing to build yet — building, moving and upgrading arrive in a later update.', b.x + 32, b.y + 104, doneRect().x - b.x - 56, { size: S.body, color: C.text });
    drawButton(ctx, doneRect(), 'Done', { accent: C.action, font: font(S.button, true) });
  }

  return screen;
}

// Is the point inside a convex polygon (points in order)?
function inside(pts, x, y) {
  let sign = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const cr = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
    if (cr !== 0) {
      const s = cr > 0 ? 1 : -1;
      if (sign && s !== sign) return false;
      sign = s;
    }
  }
  return true;
}
