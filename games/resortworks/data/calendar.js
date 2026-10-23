// The resort calendar (Milestone 2, bible §3): core/Clock numbers, the five daily bands and the speed unlock wording.
// Plain data — src/systems/calendar.js runs it.

export const CALENDAR = {
  secondsPerDay: 5, // 1× (bible §3 red-team fix: slow enough to watch a stay)
  daysPerMonth: 28,
  monthsPerYear: 12, // 336 days a year
  speeds: [1, 2, 4], // plus Pause
  startProgress: 0.15, // a new resort opens at the start of Morning on Year 1 · Month 1 · Day 1 (not in the dark)
};

// The five daily bands, in order through the day; share = part of the day (they add up to 1; Cowork's split, the bible
// fixes none). tint = the light over the map: [r, g, b, alpha] (alpha 0 = plain daylight).
export const BANDS = [
  { id: 'night', name: 'Night', label: 'Night', share: 0.15, tint: [24, 34, 92, 0.34] },
  { id: 'morning', name: 'Morning', label: 'Morning · checkout', share: 0.2, tint: [255, 214, 160, 0.1] },
  { id: 'midday', name: 'Midday', label: 'Midday · check-in', share: 0.2, tint: [255, 255, 255, 0] },
  { id: 'afternoon', name: 'Afternoon', label: 'Afternoon · activities', share: 0.25, tint: [255, 236, 190, 0.06] },
  { id: 'evening', name: 'Evening', label: 'Evening · dining', share: 0.2, tint: [255, 128, 60, 0.2] },
];
export const bandById = (id) => BANDS.find((b) => b.id === id) ?? null;

// How the light fades from one band's tint to the next. A band is short (0.75–1.25 s at 1×), so the fade takes `share` of
// the band's real length (kept between min and max seconds), then the light holds. Reduced flashes: the fade takes
// reducedShare of the band (at least reducedMin s) and the tint is softer. At 2× / 4× the whole day passes in 2.5 / 1.25 s,
// so the tint is fainter (speedAlpha) — a gentle pulse, never a strobe.
export const TINT_FADE = { share: 0.4, min: 0.25, max: 1.2, reducedShare: 0.9, reducedMin: 0.6, reducedAlpha: 0.7, speedAlpha: { 1: 1, 2: 0.6, 4: 0.35 } };

// Speed unlocks (bible §3): 2× after the first award or the end of Year 1; 4× at Rank C or Year 4. The plain line a
// locked speed's tap shows.
export const SPEED_UNLOCK = {
  2: { year: 2, rank: null, award: true, line: '2× unlocks at the end of Year 1 (or with your first award).' },
  4: { year: 4, rank: 'C', award: false, line: '4× unlocks in Year 4 (or at Rank C).' },
};
