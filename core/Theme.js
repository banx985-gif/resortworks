// The series look (bible §33): warm cream panels on a warm mid-tone background, dark graphite text and outlines,
// orange for actions, cyan for progress, green for good, gold for rewards, red only for debt/failure.
// Every screen draws with these names, never with its own colour codes or font sizes (Milestone 17b).
//   THEME.color.*   the palette          THEME.size.*   text sizes (bible §33.2 minimums at 1080 wide)
//   font(size, bold) → a canvas font string (never below the small minimum)
export const THEME = {
  family: '"Nunito", "Segoe UI", system-ui, -apple-system, Roboto, sans-serif',
  color: {
    // surfaces
    bg: '#D8BF98', // warm mid-tone behind everything
    bgDeep: '#C4A67B', // the edge of the world around the workshop
    panel: '#FFF5E2', // warm cream card
    panelAlt: '#F6E6C8', // a quieter cream (list stripes, inactive tabs)
    panelGood: '#E3F4DF',
    panelBad: '#FBE1DA',
    panelGold: '#FFF0C7',
    panelInfo: '#E1F2F7',
    panelDim: '#EADBBE', // locked / disabled cards
    stripe: 'rgba(120,86,40,0.07)',
    sheet: '#FFF8EC', // bottom sheets
    // lines and text
    outline: '#3B332C', // graphite
    line: '#B59D7C', // soft divider / card edge
    text: '#2A241F',
    textMuted: '#6E6153',
    textFaint: '#9A8A76',
    textOnDark: '#FFF8EC',
    textOnAction: '#FFFFFF',
    // meaning
    action: '#F2862B', // orange: tap me
    actionDark: '#B85E14',
    progress: '#1597BF', // cyan: progress / information
    track: '#E5D4B4', // empty part of a bar
    good: '#2E8B57',
    gold: '#B87A00',
    warn: '#D98A00',
    bad: '#C8402F',
    purple: '#7650C4',
    // over the world
    chip: 'rgba(52,42,33,0.86)', // name tags and small labels over the workshop (with textOnDark)
    overlay: 'rgba(58,40,22,0.42)', // behind a bottom sheet or pop-up
    shade: 'rgba(0,0,0,0.16)', // floor shadows
    glow: 'rgba(255,214,120,0.55)',
  },
  size: { small: 28, body: 34, button: 38, heading: 44, title: 56, major: 64 },
  button: { minH: 110, radius: 24, lip: 8 },
  panel: { radius: 28, line: 4 },
};

// The player's text-size setting (bible §33.2 / Milestone 21): every font the game draws goes through font(), so one
// number scales all of it. 1 = Normal, 1.15 = Large. Layout sizes (THEME.size) stay logical; screens that stack lines
// use lineH() so rows grow with the text.
let scale = 1;
export function setTextScale(s) {
  scale = Math.max(1, Math.min(1.5, Number(s) || 1));
}
export function textScale() {
  return scale;
}

// A canvas font string at a theme size (never below the small minimum), after the text-size setting.
export function font(size = THEME.size.body, bold = false) {
  return `${bold ? 'bold ' : ''}${Math.round(Math.max(THEME.size.small, size) * scale)}px ${THEME.family}`;
}

// A line height for text of this size (with the setting applied): size × lead.
export function lineH(size = THEME.size.body, lead = 1.3) {
  return Math.round(Math.max(THEME.size.small, size) * scale * lead);
}

// Mix a colour towards white (t 0–1): hover / pressed shades from one theme colour.
export function tint(hex, t) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s) => Math.round(((n >> s) & 255) + (255 - ((n >> s) & 255)) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

// …or towards black.
export function shade(hex, t) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s) => Math.round(((n >> s) & 255) * (1 - t));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}
