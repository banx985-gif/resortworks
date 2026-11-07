// RESORTWORKS image list: key → path (relative to index.html). Art is added here milestone by milestone; anything
// missing draws the placeholder box, never crashes.
import { FOUNDERS } from './setup.js';
import { FACILITIES, ROOMS, GUEST, STAFF_ROLES } from './lot.js';
import { GUEST_TYPES } from './bookings.js';
import { CLEAN } from './housekeeping.js';
import { JOBS } from './maintenance.js';
import { NAMED_CAST } from './cast.js';
import { FACILITY_INFO } from './facilities.js';
import { ROOM_BUILD, LAND, DOUGIE } from './build.js';
import { STAFF } from './roster.js';
import { RESEARCH, ART_REDO } from './research.js';
import { ITEM_TYPES, ITEMS_ICON } from './items.js';

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
  // Milestone 3: the Roadside guest types' offer / sheet pictures and their walking pictures.
  ...Object.fromEntries(Object.values(GUEST_TYPES).map((g) => [g.art, `assets/images/guests/${g.art}.png`])),
  ...Object.fromEntries(Object.values(GUEST_TYPES).map((g) => [g.sprite, `assets/images/world/${g.sprite}.png`])),
  // Milestone 4: the housekeeper's cleaning pose (the opening team's portraits are the Founders' above).
  [CLEAN.pose]: `assets/images/world/${CLEAN.pose}.png`,
  // Milestone 8: the Maintenance person's repair pose (at every repair and service).
  [JOBS.pose]: `assets/images/world/${JOBS.pose}.png`,
  // M6b: the named chibi cast in use now (Dame Opal and the four Roadside Guide inspectors); the rest join with their
  // milestones.
  ...Object.fromEntries(NAMED_CAST.filter((c) => c.milestone === 'M6b').map((c) => [c.art, c.portrait])),
  // Milestone 12: everything Build Mode can place (the 35 facilities, the 12 room types — later ones open with their
  // stages), the land cards and Dougie Barnes, the builder (cast).
  ...Object.fromEntries(Object.values(FACILITY_INFO).map((f) => [f.art, `assets/images/facilities/${f.art}.png`])),
  ...Object.fromEntries(Object.keys(ROOM_BUILD).map((id) => [`room_${id.toLowerCase()}`, `assets/images/rooms/room_${id.toLowerCase()}.png`])),
  ...Object.fromEntries(LAND.map((l) => [l.art, `assets/images/expansions/${l.art}.png`])),
  [DOUGIE.art]: `assets/images/cast/${DOUGIE.art}.png`,
  // Milestone 13: every staff portrait (the Founders are above; the rest join the applicant pool and the staff book).
  ...Object.fromEntries(STAFF.map((x) => [x.art, `assets/images/staff/${x.art}.png`])),
  // Milestone 17: the research pictures (r01–r05 are marked "to redo": code-drawn until the new files come — src/main.js)
  ...Object.fromEntries(RESEARCH.filter((x) => !ART_REDO.includes(x.id)).map((x) => [x.art, `assets/images/research/${x.art}.png`])),
  // Milestone 14: the Staff Item icons and the Staff Items icon (not drawn yet: code-drawn stand-ins, src/main.js, until
  // the files land under these names — then they load with no code change)
  ...Object.fromEntries(ITEM_TYPES.map((t) => [t.art, `assets/images/items/${t.art}.png`])),
  [ITEMS_ICON]: `assets/images/ui/${ITEMS_ICON}.png`,
  // Milestone 18 on: the UI icons (ui_01–ui_34), the guest types' pictures (all 24, above), packages, events, partners,
  // rivals, awards and themes (all filed, assets/ART_STATUS.md), and the cast who host them.
  ...Object.fromEntries(Array.from({ length: 34 }, (_, i) => `ui_${String(i + 1).padStart(2, '0')}`).map((k) => [k, `assets/images/ui/${k}.png`])),
  ...Object.fromEntries(Array.from({ length: 10 }, (_, i) => `package_pk${String(i + 1).padStart(2, '0')}`).map((k) => [k, `assets/images/packages/${k}.png`])),
  ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => `event_ev${String(i + 1).padStart(2, '0')}`).map((k) => [k, `assets/images/events/${k}.png`])),
  ...Object.fromEntries(Array.from({ length: 10 }, (_, i) => `partner_p${String(i + 1).padStart(2, '0')}`).map((k) => [k, `assets/images/partners/${k}.png`])),
  ...Object.fromEntries(Array.from({ length: 8 }, (_, i) => `rival_rv${String(i + 1).padStart(2, '0')}`).map((k) => [k, `assets/images/rivals/${k}.png`])),
  ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => `award_awr${String(i + 1).padStart(2, '0')}`).map((k) => [k, `assets/images/awards/${k}.png`])),
  ...Object.fromEntries(Array.from({ length: 9 }, (_, i) => `theme_th${String(i + 1).padStart(2, '0')}`).map((k) => [k, `assets/images/themes/${k}.png`])),
  ...Object.fromEntries(NAMED_CAST.filter((c) => ['M19', 'M22', 'M23'].includes(c.milestone)).map((c) => [c.art, c.portrait])),
  ...Object.fromEntries(['world_guest_child', 'world_guest_vip', 'world_guest_group_proxy', 'world_event_crowd_proxy'].map((k) => [k, `assets/images/world/${k}.png`])),
  // Milestone 0 loader test (?screen=test): the placeholder PWA icon as a real image, and one deliberately missing file.
  m0Real: 'assets/branding/pwa/icon-192.png',
  m0Missing: 'assets/m0-missing-test.png',
};

// The studio logo (Banx Games — the new art, kept under the series file name), loaded first by the studio splash.
export const STUDIO_LOGO = { key: 'studioLogo', src: 'assets/branding/banx_gamex_logo.png' };
