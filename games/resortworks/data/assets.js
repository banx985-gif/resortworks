// RESORTWORKS image list: key → path (relative to index.html). Art is added here milestone by milestone; anything
// missing draws the placeholder box, never crashes.
import { FOUNDERS } from './setup.js';
import { FACILITIES, ROOMS, GUEST, STAFF_ROLES } from './lot.js';

export const ASSETS = {
  // Milestone 0: the five Founders' portraits (setup cards, slot cards, the Founder's sheet).
  ...Object.fromEntries(FOUNDERS.map((f) => [f.art, f.portrait])),
  // Milestone 1: the Roadside Lot — the eight starting facilities, the first two rooms, the guest (map + sheet picture)
  // and the five staff roles' walking pictures (only the Founder's walks for now).
  ...Object.fromEntries(FACILITIES.map((f) => [f.art, `assets/images/facilities/${f.art}.png`])),
  ...Object.fromEntries(ROOMS.map((r) => [r.art, `assets/images/rooms/${r.art}.png`])),
  [GUEST.art]: `assets/images/world/${GUEST.art}.png`,
  [GUEST.sheetArt]: `assets/images/guests/${GUEST.sheetArt}.png`,
  ...Object.fromEntries(Object.values(STAFF_ROLES).map((s) => [s.art, `assets/images/world/${s.art}.png`])),
  // Milestone 0 loader test (?screen=test): the placeholder PWA icon as a real image, and one deliberately missing file.
  m0Real: 'assets/branding/pwa/icon-192.png',
  m0Missing: 'assets/m0-missing-test.png',
};

// The studio logo (Banx Games — the new art, kept under the series file name), loaded first by the studio splash.
export const STUDIO_LOGO = { key: 'studioLogo', src: 'assets/branding/banx_gamex_logo.png' };
