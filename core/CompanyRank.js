// Company rank from a reputation-style number, with thresholds from game data.
//   ranks: [{ id: 'E', min: 0 }, { id: 'D', min: 250 }, ...] (ascending)
// Plain functions, so any system (reputation, per-rank caps, unlock checks) reads ranks the same way.
// The rule every game shares: the score never drops below the floor of the highest rank already reached.

// Index of the highest rank whose threshold the value meets.
export function rankIndexFor(ranks, value) {
  let i = 0;
  for (let k = 0; k < ranks.length; k++) if (value >= ranks[k].min) i = k;
  return i;
}

export function rankIndexOf(ranks, id) {
  return ranks.findIndex((r) => r.id === id);
}

// The lowest the score may fall once this rank has been reached.
export function rankFloor(ranks, highestIndex) {
  return ranks[highestIndex]?.min ?? 0;
}

// Has the company reached rank `id` (or better)?
export function rankAtLeast(ranks, highestIndex, id) {
  const i = rankIndexOf(ranks, id);
  return i >= 0 && highestIndex >= i;
}

// A per-rank table ({ E: 6, D: 8, ... }) read at the given rank. Ranks missing from the table use
// the nearest lower rank that has a value (so 'S+' can share 'S').
export function valueForRank(ranks, table, rankIndex) {
  for (let i = rankIndex; i >= 0; i--) if (ranks[i].id in table) return table[ranks[i].id];
  return undefined;
}
