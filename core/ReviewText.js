// Short customer feedback built from templates (flavour only — never changes any number).
// The game supplies the templates and the facts; the same seed text always gives the same words,
// so no random numbers are used up and saves stay exact.
//   templates: {
//     strong: { statKey: ['Loves how {name} …', …] },   about the best stat
//     weak:   { statKey: ['… wishes it were faster', …] },
//     fit:    { high: [...], mid: [...], low: [...] },   fitBand from the game
//   }
//   facts: { stats: { key: value }, fitBand: 'high' | 'mid' | 'low', name, seed }
export function writeReview(templates, facts) {
  const keys = Object.keys(facts.stats);
  if (!keys.length) return '';
  let best = keys[0];
  let worst = keys[0];
  for (const k of keys) {
    if (facts.stats[k] > facts.stats[best]) best = k;
    if (facts.stats[k] < facts.stats[worst]) worst = k;
  }
  const parts = [
    pickBySeed(templates.strong?.[best], `${facts.seed}|s`),
    pickBySeed(templates.weak?.[worst], `${facts.seed}|w`),
    pickBySeed(templates.fit?.[facts.fitBand], `${facts.seed}|f`),
  ].filter(Boolean);
  return parts.join(' ').replaceAll('{name}', facts.name ?? 'it');
}

// Pick one entry from a list using a text seed (stable: same seed → same entry).
export function pickBySeed(list, seed) {
  if (!list?.length) return '';
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return list[(h >>> 0) % list.length];
}
