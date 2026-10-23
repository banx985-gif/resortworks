// RESORTWORKS image list: key → path (relative to index.html). Art is added here milestone by milestone; anything
// missing draws the placeholder box, never crashes.
import { FOUNDERS } from './setup.js';

export const ASSETS = {
  // Milestone 0: the five Founders' portraits (setup cards, slot cards, the placeholder resort screen).
  ...Object.fromEntries(FOUNDERS.map((f) => [f.art, f.portrait])),
  // Milestone 0 loader test (?screen=test): the placeholder PWA icon as a real image, and one deliberately missing file.
  m0Real: 'assets/branding/pwa/icon-192.png',
  m0Missing: 'assets/m0-missing-test.png',
};

// The studio logo (Banx Games — the new art, kept under the series file name), loaded first by the studio splash.
export const STUDIO_LOGO = { key: 'studioLogo', src: 'assets/branding/banx_gamex_logo.png' };
