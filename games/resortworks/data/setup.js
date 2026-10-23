// Resort Setup lists (Milestone 0, bible §5). Plain data only: names have no gameplay effect, the colour is cosmetic,
// and the Founder perk is text until a later milestone applies it (the opening team of Founder + four staff is M1+).

export const NAME_MAX = { resort: 24, manager: 20 };

// Made-up resort names for Random (fictional only — no real hotel brands or famous resorts).
export const RESORT_NAMES = [
  'Sunny Palms Motel', 'Driftwood Rest', 'Lagoon Light Lodge', 'Coral Cove Stop', 'Seabreeze Inn',
  'Palm Hollow Motel', 'Sandpiper Rest', 'Blue Heron Lodge', 'Turtle Rock Stop', 'Hibiscus Court',
  'Golden Dune Motel', 'Starfish Rest', 'Mango Grove Inn', 'Tidewater Lodge', 'Kingfisher Court',
  'Pebble Shore Motel', 'Frangipani House', 'Saltwind Rest', 'Moonbay Lodge', 'Pelican Path Inn',
  'Lilypad Motel', 'Waveside Rest', 'Bamboo Gate Lodge', 'Sunset Mile Motel', 'Cockle Bay Inn',
];

// General Manager names for Random: a first and a last name. Shown as "General Manager <name>".
export const MANAGER_FIRST = [
  'Aaron', 'Priya', 'Owen', 'Leila', 'Marcus', 'Hana', 'Tomas', 'Grace', 'Idris', 'Mei', 'Callum', 'Amara',
  'Jonas', 'Sofia', 'Kofi', 'Elena', 'Rafi', 'Bea', 'Declan', 'Noor', 'Luca', 'Tess', 'Arjun', 'Freya',
];
export const MANAGER_LAST = [
  'Reyes', 'Walsh', 'Okafor', 'Lindqvist', 'Moreau', 'Tanaka', 'Hughes', 'Patel', 'Novak', 'Silva',
  'Mensah', 'Rossi', 'Carter', 'Nguyen', 'Byrne', 'Ahmed', 'Fischer', 'Delgado', 'Park', 'Quinn',
];

// The six RESORTWORKS accent palettes (bible §5 "6 accent palettes"; names from the M0 card / DECISIONS 22 Oct).
// hex = the main accent; light = a soft wash behind it; dark = text or outlines on the light wash. Cosmetic only: the
// resort sign, the slot accent strip, small identity markings.
export const PALETTES = [
  { id: 'lagoon', name: 'Lagoon Teal', hex: '#1FA3A0', light: '#D9F2F0', dark: '#116664' },
  { id: 'coral', name: 'Sunset Coral', hex: '#F07A5A', light: '#FDE5DD', dark: '#A4432A' },
  { id: 'palm', name: 'Palm Green', hex: '#3E9B4F', light: '#DFF1DF', dark: '#245E2F' },
  { id: 'sand', name: 'Sand Gold', hex: '#D9A43A', light: '#FBF0D4', dark: '#84601A' },
  { id: 'hibiscus', name: 'Hibiscus Pink', hex: '#E0508A', light: '#FBDDEA', dark: '#962A58' },
  { id: 'sky', name: 'Sky Blue', hex: '#3A9BE0', light: '#DDEEFB', dark: '#1D5F92' },
];
export const paletteById = (id) => PALETTES.find((p) => p.id === id) ?? PALETTES[0];

// The five staff roles (bible §8). colour: the code-drawn portrait's tunic while the art loads.
export const ROLES = {
  FO: { id: 'FO', name: 'Front Office', colour: '#1597BF' },
  HK: { id: 'HK', name: 'Housekeeping', colour: '#7A8C9E' },
  HS: { id: 'HS', name: 'Hospitality', colour: '#F2862B' },
  AE: { id: 'AE', name: 'Activities & Entertainment', colour: '#E0508A' },
  MG: { id: 'MG', name: 'Maintenance & Grounds', colour: '#3E9B4F' },
};

export const FOUNDER_PERK = "+6% to their role's contribution. Your Founder is remembered in the resort's history.";

// The five Founders (bible §5), one per role, each with their real portrait (staff art filed by Cowork).
// face: where the head sits in the full-body picture, for the head-and-shoulders crop on cards — cx = the face's
// centre as a fraction of the picture's width, size = the square crop's side as a fraction of its height.
// perk.effects are stored for the milestone that applies them (live: false until then).
export const FOUNDERS = [
  { id: 'S01', name: 'Maya Bell', role: 'FO', art: 'staff_s01', portrait: 'assets/images/staff/staff_s01.png', face: { cx: 0.52, size: 0.42 }, skin: '#C98E66', hair: '#4A2E1E' },
  { id: 'S11', name: 'Ruby Hale', role: 'HK', art: 'staff_s11', portrait: 'assets/images/staff/staff_s11.png', face: { cx: 0.53, size: 0.42 }, skin: '#F0C7A4', hair: '#7A4A2A' },
  { id: 'S21', name: 'Leo Kitchen', role: 'HS', art: 'staff_s21', portrait: 'assets/images/staff/staff_s21.png', face: { cx: 0.36, size: 0.42 }, skin: '#C98E66', hair: '#2E211A' },
  { id: 'S31', name: 'Kai West', role: 'AE', art: 'staff_s31', portrait: 'assets/images/staff/staff_s31.png', face: { cx: 0.55, size: 0.42 }, skin: '#C98E66', hair: '#5A3A28' },
  { id: 'S41', name: 'Gus Hale', role: 'MG', art: 'staff_s41', portrait: 'assets/images/staff/staff_s41.png', face: { cx: 0.5, size: 0.42 }, skin: '#E2AE88', hair: '#4A3020' },
].map((f) => ({ ...f, perk: { text: FOUNDER_PERK, effects: [{ key: 'roleContributionPct', value: 6, live: false }] } }));
export const founderById = (id) => FOUNDERS.find((f) => f.id === id) ?? null;

// The chosen Founder's permanent run-history flag (bible §5).
export const FOUNDER_FLAG = 'founder';

// The setup lists' rules, on core/DataValidator (checked at boot with ?debug=1 and by tests/resortworks/m0.test.mjs).
// art: true also queues every Founder portrait path (then await v.checkArt()).
export function validateSetup(v, { art = false } = {}) {
  v.check(RESORT_NAMES.length >= 20, 'there must be 20+ resort names');
  v.check(new Set(RESORT_NAMES).size === RESORT_NAMES.length, 'resort names must be unique');
  v.check(RESORT_NAMES.every((n) => n.length <= NAME_MAX.resort), `resort names must fit ${NAME_MAX.resort} letters`);
  v.check(new Set(MANAGER_FIRST).size === MANAGER_FIRST.length, 'manager first names must be unique');
  v.check(new Set(MANAGER_LAST).size === MANAGER_LAST.length, 'manager last names must be unique');
  const longest = Math.max(...MANAGER_FIRST.map((n) => n.length)) + 1 + Math.max(...MANAGER_LAST.map((n) => n.length));
  v.check(longest <= NAME_MAX.manager, `every random manager name must fit ${NAME_MAX.manager} letters (longest ${longest})`);
  v.check(PALETTES.length === 6, 'there must be six palettes');
  v.uniqueIds('palette', PALETTES);
  for (const p of PALETTES) v.check(p.name && ['hex', 'light', 'dark'].every((k) => /^#[0-9A-F]{6}$/i.test(p[k])), `palette ${p.id} needs a name, hex, light and dark`);
  v.check(FOUNDERS.length === 5, 'there must be five Founders');
  v.uniqueIds('founder', FOUNDERS);
  const roles = new Set(Object.keys(ROLES));
  for (const f of FOUNDERS) {
    v.ref(`founder ${f.id}`, 'role', f.role, roles);
    v.check(f.name && f.perk?.text === FOUNDER_PERK, `founder ${f.id} needs a name and the Founder perk text`);
    v.check(/^staff_s\d\d$/.test(f.art) && f.portrait === `assets/images/staff/${f.art}.png`, `founder ${f.id} portrait path`);
    v.check(f.face?.cx > 0 && f.face.cx < 1 && f.face.size > 0 && f.face.size <= 1, `founder ${f.id} face crop`);
    if (art) v.art(`founder ${f.id}`, f.portrait);
  }
  v.check(new Set(FOUNDERS.map((f) => f.role)).size === roles.size, 'one Founder per role');
  return v;
}
