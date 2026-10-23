// The standard station / staff sheet (any series game; RACEWORKS Milestone 29, style guide §3): every station, facility
// and worker sheet is built here, so they all have the same parts in the same order:
//   header      picture · name · one line on what it is for (· an optional tag chip, badge) · Help (?) · ✕
//   Now         the live state, in plain words ("Tessa is building the Club Hatch · 40 %")
//   main        1–3 big main actions (orange unless the game gives another accent)
//   more        secondary / info buttons (blue)
//   body        anything else the station needs (its own sections, e.g. a project's numbers)
//   upgrade     what it does now, what it could become, the cost and the unlock rule (+ its Upgrade button)
// Plain data in, a core/ui/BottomSheet menu out (std: 'station', so a test can check every sheet came from here).
//   stationSheet({ title, line, art, badge?, tag?, accent?, now, main, more, body, upgrade, help, text })
//     now: [line]  (strings or { text, color })      main / more: [button]     body: [section]
//     upgrade: { lines?: [line], buttons?: [button], sections?: [section] } — lines first, then buttons, then sections
//     help: () => void (the Help button in the header)        text: { now, upgrade } section titles (the game's words)
import { THEME } from '../Theme.js';

const C = THEME.color;

export function stationSheet({ title, line = '', art = null, badge = null, tag = null, accent = null, now = [], main = [], more = [], body = [], upgrade = null, help = null, text = {} }) {
  const T = { now: 'Now', upgrade: 'Upgrade', ...text };
  const sections = [];
  const nowLines = (now ?? []).filter((l) => l && (typeof l === 'string' ? l.trim() : l.text));
  if (nowLines.length) sections.push({ title: T.now, lines: nowLines.map((l) => (typeof l === 'string' ? { text: l, color: C.actionDark } : l)), std: 'now' });
  const mains = (main ?? []).filter(Boolean).slice(0, 3);
  if (mains.length) sections.push({ columns: 1, buttons: mains.map((b) => ({ accent: C.action, ...b })), std: 'main' });
  const mores = (more ?? []).filter(Boolean);
  if (mores.length) sections.push({ columns: mores.length === 1 ? 1 : 2, buttons: mores.map((b) => ({ accent: C.progress, ...b })), std: 'more' });
  for (const s of body ?? []) if (s) sections.push(s);
  if (upgrade) {
    const lines = (upgrade.lines ?? []).filter(Boolean);
    const buttons = (upgrade.buttons ?? []).filter(Boolean);
    if (lines.length || buttons.length) sections.push({ title: T.upgrade, lines, columns: 1, buttons, std: 'upgrade' });
    for (const s of upgrade.sections ?? []) if (s) sections.push(s);
  }
  return { title, subtitle: line, art, badge, tag, accent, help, sections, std: 'station' };
}

export const isStationSheet = (menu) => menu?.std === 'station';
