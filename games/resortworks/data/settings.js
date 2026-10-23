// Settings (Milestone 0, bible §36, series common feature §2): the series list (core/SeriesSettings — same entries and
// order as every Works game) with the names bible §36 fixes, on core/Settings, kept on this device under SETTINGS_KEY (and
// in the account store) — never in a campaign slot, so every resort on this device shares them. RESORTWORKS has no sound,
// menu button or hints yet: those settings are kept, saved and read all the same.
import { seriesSettings, SERIES_SETTINGS_DEFAULTS, TEXT_SCALE } from '../../../core/SeriesSettings.js';

export const SETTINGS = seriesSettings({
  labels: {
    sfx: 'Effects volume',
    sfxMuted: 'Effects mute',
    haptics: 'Haptics',
    fpsMode: 'Graphics / performance',
  },
  lines: {
    muted: 'All music and sound effects on or off (the resort’s sounds arrive in a later update).',
    fpsMode: 'Auto: 60 FPS, a steady 30 if the phone struggles. High: always 60 with every effect. Low: 30 FPS, fewer effects, simpler guest figures.',
  },
});
export const SETTINGS_DEFAULTS = { ...SERIES_SETTINGS_DEFAULTS };
export const SETTINGS_KEY = 'resortworks:settings';
export { TEXT_SCALE };
export const SETTINGS_TEXT = {
  title: 'Settings',
  subtitle: 'This device · every resort',
  helpGroup: 'Help and about',
  help: 'Help / tutorial replay',
  helpLine: 'How to run the resort. The first-time guide comes in a later update.',
  helpBody: 'Start a resort from New Game or an empty campaign slot: name it, name yourself, pick a colour and a Founder, then START RESORT. Each of the four slots is its own resort. The resort itself opens in the next update.',
  legal: 'Privacy & legal',
  legalLine: 'How your resorts are kept',
  legalBody: 'RESORTWORKS keeps your resorts on this device. It has no account and collects no personal data of its own. Every resort, guest and staff member is fictional.',
  credits: 'Credits',
  creditsLine: 'The people behind RESORTWORKS',
  creditsBody: 'RESORTWORKS — a Canvas Management Series game by Aaron (Banx Games). Art by Aaron; code by Claude Code. Thanks for playing!',
  display: 'Display test',
  displayLine: 'The screen-shape and tap test (for checking a new phone)',
};
