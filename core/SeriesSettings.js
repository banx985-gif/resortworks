// The series Settings list (series common feature §2; built for GOALWORKS Milestone 12b from Robot Workshop's Settings and
// the RACEWORKS / DEVWORKS / CAREWORKS copies of it; any series game). The same entries in the same order with the same
// names in every game; a game passes its own lines where its words differ and adds its extras after the series list.
// Values live in core/Settings (this device, never in a campaign slot). Content-free apart from the shared words.
//
//   seriesSettings({ lines = {}, labels = {}, extras = [] }) → the list: [{ id, label, group, options: [{ id, label }], line?, extra? }]
//     lines: { id: 'game words' } replaces an entry's line · labels: { id: 'Name' } renames an entry where the game's
//     bible fixes a different name (RESORTWORKS M0: "Haptics", "Graphics / performance"); the ids, order and values
//     never change · extras: the game's own entries (shown after Help / Credits)
//   SERIES_SETTINGS_DEFAULTS — defaults for every series entry (spread them under the game's extras' defaults)
//   TEXT_SCALE — textSize → core/Theme setTextScale factor
const onOff = [{ id: false, label: 'Off' }, { id: true, label: 'On' }];
const lvl = (ids) => ids.map((id) => ({ id, label: id === 0 ? 'Off' : `${id}%` }));
const muteOpts = [{ id: false, label: 'Playing' }, { id: true, label: 'Muted' }];

const SERIES = [
  { id: 'muted', label: 'Sound', group: 'Sound and music', options: [{ id: true, label: 'Off' }, { id: false, label: 'On' }], line: 'All music and sound effects on or off.' },
  { id: 'music', label: 'Music volume', group: 'Sound and music', options: lvl([0, 25, 50, 75, 100]) },
  { id: 'musicMuted', label: 'Music mute', group: 'Sound and music', options: muteOpts },
  { id: 'sfx', label: 'Sound effects volume', group: 'Sound and music', options: lvl([0, 25, 50, 75, 100]) },
  { id: 'sfxMuted', label: 'Sound effects mute', group: 'Sound and music', options: muteOpts },
  { id: 'haptics', label: 'Vibration', group: 'Feel and look', options: onOff, line: 'A small buzz on the big moments. Phones only.' },
  { id: 'fpsMode', label: 'Graphics', group: 'Feel and look', options: [{ id: 'auto', label: 'Auto' }, { id: 'high', label: 'High' }, { id: 'low', label: 'Low' }], line: 'Auto: 60 FPS, a steady 30 if the phone struggles. High: always 60 with every effect. Low: 30 FPS, fewer effects, simpler figures.' },
  { id: 'textSize', label: 'Text size', group: 'Feel and look', options: [{ id: 'normal', label: 'Normal' }, { id: 'large', label: 'Large' }, { id: 'larger', label: 'Larger' }], line: 'Large: every text 15% bigger; Larger: 30%.' },
  { id: 'reducedFlashes', label: 'Reduced flashes', group: 'Feel and look', options: onOff, line: 'No bright flashes: the big moments fade in gently.' },
  { id: 'screenShake', label: 'Screen shake', group: 'Feel and look', options: [{ id: 'off', label: 'Off' }, { id: 'low', label: 'Low' }, { id: 'normal', label: 'Normal' }], line: 'The little shakes on big moments — never needed to follow the game.' },
  { id: 'showMenu', label: 'Show Menu button', group: 'Menu and hints', options: onOff, line: 'Off: tap the art to get around (Settings stays on the main menu).' },
  { id: 'showHints', label: 'Show next-step hints', group: 'Menu and hints', options: onOff, line: 'A line under the date saying what to do next; tap it to go there.' },
];

export const SERIES_SETTINGS_DEFAULTS = { muted: false, music: 75, musicMuted: false, sfx: 100, sfxMuted: false, haptics: true, fpsMode: 'auto', textSize: 'normal', reducedFlashes: false, screenShake: 'normal', showMenu: true, showHints: true };
export const TEXT_SCALE = { normal: 1, large: 1.15, larger: 1.3 };

export function seriesSettings({ lines = {}, labels = {}, extras = [] } = {}) {
  const own = (d) => ({ ...d, ...(d.id in lines ? { line: lines[d.id] } : {}), ...(d.id in labels ? { label: labels[d.id] } : {}) });
  return [...SERIES.map(own), ...extras.map((d) => ({ ...d, extra: true }))];
}
