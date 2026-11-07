// Weather / seasons / transport (Milestone 24, bible §27 / §27O). Plain data — src/systems/weather.js runs it. The
// profiles and effects are the bible's; which months are which season, which guests are "outdoor" / "indoor" and the
// look are Claude Code's picks (DECISIONS M24).
//
// Each 28-day month rolls its weather from the season band's profile (seeded per run and month, so a reload never
// rerolls it). Season bands (Claude Code's pick): Months 1–3 Mild, 4–6 Warm, 7–9 Wet, 10–12 Cool.
export const SEASON_OF_MONTH = ['mild', 'mild', 'mild', 'warm', 'warm', 'warm', 'wet', 'wet', 'wet', 'cool', 'cool', 'cool'];
export const PROFILES = {
  mild: { mild: 0.6, warm: 0.2, wet: 0.15, cool: 0.05 },
  warm: { warm: 0.55, mild: 0.25, wet: 0.15, cool: 0.05 },
  wet: { wet: 0.5, mild: 0.3, warm: 0.1, cool: 0.1 },
  cool: { cool: 0.5, mild: 0.3, wet: 0.1, warm: 0.1 },
};
// Effects (bible §27O). demand: guest tags → pct (through the ±20% stack, so stacked modifiers never pass ±20%).
//   Warm: outdoor / pool demand +15%, spa demand −5% · Wet: indoor demand +15%, outdoor capacity −35%, a 10% disruption
//   chance for each day of an outdoor event · Cool: pool demand −20%, spa / indoor dining +15% · Mild: nothing.
// Outdoor guests (Claude Code's pick): road trippers, families, adventure and sport; indoor: business, foodies, events.
const OUTDOOR = ['roadtrip', 'family', 'adventure', 'sport'];
const INDOOR = ['business', 'foodie', 'event'];
export const WEATHER = {
  mild: { id: 'mild', name: 'Mild', demand: [], line: 'Mild weather: nothing changes.' },
  warm: { id: 'warm', name: 'Warm', demand: [{ tags: OUTDOOR, v: 0.15 }, { tags: ['wellness'], v: -0.05 }], line: 'Warm: outdoor and pool guests +15%, spa guests −5%.' },
  wet: { id: 'wet', name: 'Wet', demand: [{ tags: INDOOR, v: 0.15 }], outdoorCut: 0.35, disruption: 0.1, line: 'Wet: indoor guests +15%, outdoor places −35%, outdoor events may be rained off.' },
  cool: { id: 'cool', name: 'Cool', demand: [{ tags: ['family'], v: -0.2 }, { tags: ['wellness', 'foodie'], v: 0.15 }], line: 'Cool: pool guests −20%, spa and indoor dining +15%.' },
};
// Outdoor places (their guests a part of the day × (1 − outdoorCut) in Wet weather) and outdoor event venues.
export const OUTDOOR_FAC = ['F03', 'F08', 'F11', 'F13', 'F20', 'F22', 'F27', 'F28', 'F33'];
export const OUTDOOR_VENUES = ['F20'];
// The look (code-drawn, Reduced flashes respected): a tint over the map, and rain streaks or a sun glow.
export const LOOK = {
  mild: { tint: null },
  warm: { tint: [255, 200, 90, 0.08] },
  wet: { tint: [60, 90, 140, 0.16], rain: { drops: 70, speed: 900, len: 26, alpha: 0.35 } },
  cool: { tint: [150, 190, 230, 0.12] },
};
// Arrivals and the shuttle (bible §27: early guests by car / bus, the Shuttle later; no transport sim): each party
// checking in shows a code-drawn vehicle at the car park for a moment (a car, or a coach for a group of 4+); with the
// Shuttle Stop built, guests from the Destination stage on arrive by the shuttle at its stop (and walk from there).
export const ARRIVAL = { showSec: 1.6, coachParty: 4, shuttleFrom: 'destination' };
