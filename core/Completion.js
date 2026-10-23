// Completion tracking with a hidden denominator (any series game with secrets).
//
// Before the player's first campaign ending: only the normal catalogue counts are shown ("research 12 / 36"),
// and nothing about secrets — not even that there is a number to find.
// After the first ending:
//   Company Completion — the normal catalogue added up (achievements, research, events, content…)
//   Discovery — secrets found, shown against a denominator that grows only as clue families are revealed:
//     no family revealed yet → "found / ???"
//     some families revealed → "found / N + ???"   (N = the secrets in the families the player knows about)
//     fullReveal (the game's own condition, e.g. the hardest secret event won once) → "found / total"
//
// completionView({ catalogue, endingSeen, discovery }) → what the screen may show, and nothing more:
//   catalogue: [{ id, label, found, total }]
//   discovery: { found, families: [{ id, total, revealed }], fullReveal }
//   → { catalogue, company: null | { found, total, pct }, discovery: null | { found, known, total, text } }
// `total` in the result is null unless the full reveal has happened; the caller never needs the real total.
export function completionView({ catalogue = [], endingSeen = false, discovery = null }) {
  const cat = catalogue.map((c) => ({ ...c, found: Math.min(c.found, c.total) }));
  if (!endingSeen) return { catalogue: cat, company: null, discovery: null };
  const found = cat.reduce((t, c) => t + c.found, 0);
  const total = cat.reduce((t, c) => t + c.total, 0);
  const company = { found, total, pct: total ? Math.floor((found / total) * 100) : 0 };
  let disc = null;
  if (discovery) {
    const fams = discovery.families ?? [];
    const all = fams.reduce((t, f) => t + f.total, 0);
    const known = fams.filter((f) => f.revealed).reduce((t, f) => t + f.total, 0);
    const f = discovery.found;
    if (discovery.fullReveal) disc = { found: f, known: all, total: all, text: `${f} / ${all}` };
    else if (known) disc = { found: f, known, total: null, text: `${f} / ${known} + ???` };
    else disc = { found: f, known: 0, total: null, text: `${f} / ???` };
  }
  return { catalogue: cat, company, discovery: disc };
}
