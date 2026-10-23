// The Help archive (BOTWORKS Milestone 26; any series game): opened from the top bar's Help button.
//   Topics      short pages (a picture from the game's art + a few paragraphs), one row each with its icon
//   Tips seen   every tutorial card the player has seen, to read again
//   and a switch to turn the guide off / back on.
// createHelpArchive({ renderer, layout, assets, router, guide, topics, text, fill })
//   topics: [{ id, title, icon, art, paras: [..] }] (game data) · text: labels (HELP_TEXT) · fill(step) → the step with
//   its run-specific words filled in (optional) · guide: core/GuideSystem (seenSteps, state.off, turnOn / turnOff)
//   enter({ back, topic }) — topic: open straight on that page
//   walkthroughs (optional, DEVWORKS M40d): a third tab listing each feature walkthrough with "Show me (again)" and,
//     while it waits, "Dismiss": { list() → [{ id, title, line, status: 'new'|'later'|'done', icon }], more() → how many
//     are still to open, show(id), dismiss(id) }; text: walksTab, noWalks, walksMore(n), showMe, showAgain, dismiss,
//     walkStatus { new, later, done }
//   icon: the Help picture (Robot Workshop's ui_icon_27 by default; DEVWORKS passes its own)
//   RACEWORKS Milestone 29 (all optional): guide may be null (a game with no first-time guide yet) — then there is no
//     "Tips seen" tab and no guide switch; footer: { label, onTap } puts one button in the guide switch's place (e.g.
//     Settings); onLeave(back) — called instead of router.go(back) when Help closes (a game whose screens need params);
//     enter({ topic, direct: true }) — opened straight on one page: Back (and ‹) leave Help from it, not to the list
import { THEME, font, lineH } from '../Theme.js';
import { ScrollPanel } from './ScrollPanel.js';
import { drawButton, hitRect } from './Button.js';
import { card, text, para, listRow, listRowHeight, tabRects, drawTabs, tabAt, emptyState, stateHeight } from './Kit.js';

const C = THEME.color;
const S = THEME.size;
const HEAD_H = 150;
const TABS_H = 110;
const FOOT_H = 160;
const GAP = 16;

export function createHelpArchive({ renderer, layout, assets, router, guide, topics, text: T, fill = null, icon = 'ui_icon_27', walkthroughs = null, footer = null, onLeave = null }) {
  const W = renderer.width;
  let back = 'workshop';
  let tab = 'topics';
  let page = null; // an open topic
  let direct = false; // opened straight on a page (RACEWORKS M29): Back leaves Help from it
  let rows = [];
  let walkHits = []; // the walkthrough buttons (content coordinates)
  const scroll = new ScrollPanel({ getRect: bodyRect, contentHeight: 0 });
  const TABS = [
    { id: 'topics', label: T.topicsTab },
    ...(guide ? [{ id: 'seen', label: T.seenTab }] : []),
    ...(walkthroughs ? [{ id: 'walks', label: T.walksTab ?? 'Walkthroughs' }] : []),
  ];

  const sr = () => layout.safeRect;
  const backRect = () => ({ x: sr().x + 24, y: sr().y + 24, w: 200, h: 110 });
  const tabsArea = () => ({ x: sr().x + 24, y: sr().y + HEAD_H, w: sr().w - 48, h: TABS_H });
  function bodyRect() {
    const s = sr();
    const y = s.y + HEAD_H + (page || !hasTabs() ? 0 : TABS_H + GAP);
    return { x: s.x + 24, y, w: s.w - 48, h: s.y + s.h - (guide || footer ? FOOT_H : 24) - y };
  }
  const toggleRect = () => (guide || footer ? { x: sr().x + 24, y: sr().y + sr().h - FOOT_H + 24, w: sr().w - 48, h: 110 } : null);
  const hasTabs = () => TABS.length > 1;
  const seen = () => (guide?.seenSteps ?? []).map((s) => (fill ? fill(s) : s));

  const screen = {
    scroll,
    toggleRect,
    get tab() {
      return tab;
    },
    get page() {
      return page;
    },
    topicRect(id) {
      const r = rows.find((x) => x.id === id);
      if (!r) return null;
      const b = bodyRect();
      return { x: b.x + r.r.x, y: b.y + r.r.y - scroll.scrollY, w: r.r.w, h: r.r.h };
    },
    tabRect: (id) => tabRects(tabsArea(), TABS.length)[TABS.findIndex((t) => t.id === id)],
    // A walkthrough's button on screen: action 'show' | 'dismiss' (tests).
    walkRect(id, action = 'show') {
      const h = walkHits.find((x) => x.id === id && x.action === action);
      if (!h) return null;
      const b = bodyRect();
      return { x: b.x + h.r.x, y: b.y + h.r.y - scroll.scrollY, w: h.r.w, h: h.r.h };
    },
    scrollToWalk(id) {
      const h = walkHits.find((x) => x.id === id);
      if (h) {
        scroll.scrollY = Math.max(0, h.r.y - 200);
        scroll.clamp?.();
      }
    },
    open(id) {
      page = topics.find((t) => t.id === id) ?? null;
      scroll.scrollY = 0;
    },
    enter(params = {}) {
      back = params.back ?? (router.previous && router.previous !== 'help' ? router.previous : 'workshop');
      tab = params.tab ?? 'topics';
      page = params.topic ? topics.find((t) => t.id === params.topic) ?? null : null;
      direct = !!(params.direct && page);
      scroll.scrollY = 0;
    },
    onBack() {
      if (page && !direct) {
        page = null;
        scroll.scrollY = 0;
        return true;
      }
      if (onLeave) onLeave(back);
      else router.go(back);
      return true;
    },
    onTap(p) {
      if (hitRect(p, backRect())) return screen.onBack();
      if (hitRect(p, toggleRect())) {
        if (!guide) return footer?.onTap();
        return guide.state.off ? guide.turnOn() : guide.turnOff();
      }
      if (!page && hasTabs()) {
        const t = tabAt(p, tabRects(tabsArea(), TABS.length), TABS);
        if (t) {
          tab = t.id;
          scroll.scrollY = 0;
          return;
        }
      }
      if (!page && tab === 'walks' && scroll.contains(p)) {
        const q = scroll.toContent(p);
        const h = walkHits.find((x) => hitRect(q, x.r));
        if (h) h.action === 'dismiss' ? walkthroughs.dismiss(h.id) : walkthroughs.show(h.id);
        return;
      }
      if (page || tab !== 'topics' || !scroll.contains(p)) return;
      const q = scroll.toContent(p);
      const r = rows.find((x) => hitRect(q, x.r));
      if (r) screen.open(r.id);
    },
    onDragStart: (p) => scroll.beginDrag(p),
    onDrag: (p) => scroll.drag(p),
    onDragEnd: (p) => scroll.endDrag(p),
    render(ctx) {
      const s = sr();
      ctx.fillStyle = C.bg;
      ctx.fillRect(0, 0, W, renderer.height);
      drawButton(ctx, backRect(), T.back, { font: font(S.button, true) });
      if (page) {
        assets.drawContained(ctx, page.icon, { x: s.x + 240, y: s.y + 30, w: 96, h: 96 });
        text(ctx, page.title, s.x + 352, s.y + 78, { size: S.heading, bold: true, baseline: 'middle', maxWidth: s.w - 380 });
      } else {
        assets.drawContained(ctx, icon, { x: s.x + 240, y: s.y + 30, w: 96, h: 96 });
        text(ctx, T.title, s.x + 352, s.y + 78, { size: S.title, bold: true, baseline: 'middle', maxWidth: s.w - 380 });
        if (hasTabs()) drawTabs(ctx, tabRects(tabsArea(), TABS.length), TABS, tab);
      }
      const w = bodyRect().w - 12;
      scroll.begin(ctx);
      let y = 0;
      rows = [];
      if (page) y = drawPage(ctx, w);
      else if (tab === 'topics') {
        for (const t of topics) {
          const row = { art: t.icon, title: t.title, lines: [{ text: t.paras[0], size: S.small, color: C.textMuted }], right: '›' };
          const h = listRowHeight(w, row);
          const r = { x: 0, y, w, h };
          listRow(ctx, assets, r, row);
          rows.push({ id: t.id, r });
          y += h + GAP;
        }
      } else if (tab === 'walks') y = drawWalks(ctx, w);
      else {
        const list = seen();
        if (!list.length) {
          const st = { art: icon, title: T.seenTab, text: T.noneSeen };
          const h = stateHeight(w, st);
          emptyState(ctx, assets, { x: 0, y, w, h }, st);
          y += h;
        }
        for (const st of list) {
          const bodyH = para(null, st.text, 0, 0, w - 56, { size: S.body });
          const h = 30 + lineH(S.button, 1.3) + bodyH + 26;
          card(ctx, { x: 0, y, w, h });
          text(ctx, st.title, 28, y + 26, { size: S.button, bold: true, maxWidth: w - 56 });
          para(ctx, st.text, 28, y + 26 + lineH(S.button, 1.3), w - 56, { size: S.body });
          y += h + GAP;
        }
      }
      scroll.contentHeight = Math.max(1, y);
      scroll.end(ctx);
      if (guide) drawButton(ctx, toggleRect(), guide.state.off ? T.guideOn : T.guideOff, { accent: C.progress, font: font(S.button, true) });
      else if (footer) drawButton(ctx, toggleRect(), footer.label, { accent: C.progress, font: font(S.button, true) });
    },
  };

  // The walkthroughs tab: one card each, with Show me (again) and, while it waits, Dismiss.
  function drawWalks(ctx, w) {
    let y = 0;
    walkHits = [];
    const list = walkthroughs.list();
    if (!list.length) {
      const st = { art: icon, title: T.walksTab ?? 'Walkthroughs', text: T.noWalks ?? '' };
      const h = stateHeight(w, st);
      emptyState(ctx, assets, { x: 0, y, w, h }, st);
      y += h + GAP;
    }
    const BTN_H = 100;
    for (const it of list) {
      const waiting = it.status !== 'done';
      const textW = w - 56 - (it.icon ? 110 : 0);
      const tx = 28 + (it.icon ? 110 : 0);
      const bodyH = para(null, it.line, 0, 0, textW, { size: S.small });
      const h = 26 + lineH(S.button, 1.3) + lineH(S.small, 1.3) + bodyH + 20 + BTN_H + 26;
      card(ctx, { x: 0, y, w, h });
      if (it.icon && ctx) assets.drawContained(ctx, it.icon, { x: 24, y: y + 24, w: 90, h: 90 });
      text(ctx, it.title, tx, y + 26, { size: S.button, bold: true, maxWidth: textW });
      const stTxt = T.walkStatus?.[it.status] ?? it.status;
      text(ctx, stTxt, tx, y + 26 + lineH(S.button, 1.3), { size: S.small, bold: true, color: waiting ? C.action : C.good, maxWidth: textW });
      para(ctx, it.line, tx, y + 26 + lineH(S.button, 1.3) + lineH(S.small, 1.3), textW, { size: S.small, color: C.textMuted });
      const by = y + h - 26 - BTN_H;
      const bw = Math.min(380, (w - 56 - 20) / 2);
      const show = { x: 28, y: by, w: bw, h: BTN_H };
      drawButton(ctx, show, waiting ? T.showMe ?? 'Show me' : T.showAgain ?? 'Show me again', { accent: C.good, font: font(S.button, true) });
      walkHits.push({ id: it.id, action: 'show', r: show });
      if (waiting) {
        const dis = { x: 28 + bw + 20, y: by, w: bw, h: BTN_H };
        drawButton(ctx, dis, T.dismiss ?? 'Dismiss', { accent: C.progress, font: font(S.button, true) });
        walkHits.push({ id: it.id, action: 'dismiss', r: dis });
      }
      y += h + GAP;
    }
    const more = walkthroughs.more?.() ?? 0;
    if (more && T.walksMore) {
      text(ctx, T.walksMore(more), 8, y + 10, { size: S.small, color: C.textMuted, maxWidth: w - 16 });
      y += lineH(S.small, 1.3) + 30;
    }
    return y;
  }

  // A topic page: its picture, then its paragraphs.
  function drawPage(ctx, w) {
    let y = 0;
    const ph = Math.min(560, Math.round(w * 0.6));
    if (page.art) {
      // (a page with no picture — RACEWORKS M29: "a picture where one exists" — starts with its words)
      card(ctx, { x: 0, y, w, h: ph + 40 });
      assets.drawContained(ctx, page.art, { x: 20, y: y + 20, w: w - 40, h: ph });
      y += ph + 40 + 28;
    }
    for (const t of page.paras) {
      y += para(ctx, t, 8, y, w - 16, { size: S.body }) + 26;
    }
    return y;
  }

  return screen;
}
