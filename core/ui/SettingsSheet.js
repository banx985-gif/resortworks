// The Settings sheet (series common feature §2; built for GOALWORKS Milestone 12b from the CAREWORKS / RACEWORKS sheets;
// any series game): the series list (core/SeriesSettings) as option rows grouped under headings, then Help / tutorial
// replay, Privacy & legal and Credits, then the game's extras, then its own last buttons (e.g. the display test). Every
// option row ticks the value in force ("✓ " — the series convention). Content-free: the words and what the help rows do
// come from the game.
//
//   settingsSheet({ settings, list, text, accent, art, onHelp, onLegal, onCredits, icons, after })
//     settings: a core/Settings · list: seriesSettings(...) · text: { title, subtitle, helpGroup, help, helpLine, legal,
//     legalLine, credits, creditsLine } · icons: { help, legal, credits } image keys · after: [extra button specs]
//   → a core/ui/BottomSheet menu spec (pass it as sheet.open(() => settingsSheet(...)) so ticks follow each tap)
//   Option button ids: set_<settingId>_<optionId> (tests tap them).
import { THEME } from '../Theme.js';

const C = THEME.color;

export function settingsSheet({ settings, list, text, accent = C.progress, art = null, onHelp = null, onLegal = null, onCredits = null, icons = {}, after = [] }) {
  const sections = [];
  let group = null;
  const heading = (g) => g !== group && sections.push({ title: (group = g).toUpperCase(), lines: [] });
  const optionRow = (d) => ({
    title: d.label,
    lines: d.line ? [{ text: d.line, color: C.textMuted }] : [],
    columns: Math.min(d.options.length, 5),
    buttons: d.options.map((o) => {
      const on = settings.get(d.id) === o.id;
      return { id: `set_${d.id}_${o.id}`, label: `${on ? '✓ ' : ''}${o.label}`, accent: on ? C.good : C.progress, onTap: () => settings.set(d.id, o.id) };
    }),
  });
  for (const d of list.filter((x) => !x.extra)) {
    heading(d.group);
    sections.push(optionRow(d));
  }
  heading(text.helpGroup ?? 'Help and about');
  const rows = [];
  if (onHelp) rows.push({ id: 'setHelp', label: text.help ?? 'Help / tutorial replay', sub: text.helpLine ?? '', icon: icons.help ?? null, accent: C.progress, onTap: onHelp });
  if (onLegal) rows.push({ id: 'setLegal', label: text.legal ?? 'Privacy & legal', sub: text.legalLine ?? '', icon: icons.legal ?? null, accent: C.progress, onTap: onLegal });
  if (onCredits) rows.push({ id: 'setCredits', label: text.credits ?? 'Credits', sub: text.creditsLine ?? '', icon: icons.credits ?? null, accent: C.progress, onTap: onCredits });
  if (rows.length) sections.push({ columns: 1, buttons: rows });
  for (const d of list.filter((x) => x.extra)) {
    heading(d.group);
    sections.push(optionRow(d));
  }
  if (after.length) sections.push({ columns: 1, buttons: after });
  return { title: text.title ?? 'Settings', subtitle: text.subtitle ?? '', art, accent, sections };
}
