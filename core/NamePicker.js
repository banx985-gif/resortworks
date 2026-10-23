// Random names for a new-game setup screen (BOTWORKS Milestone 25b; any series game). The lists are the game's data.
//
//   pickName(list, { not, random })      one entry, never the one already showing (not), when the list has another
//   pickIndex(n, { not, random })        the same for "one of n choices" (colours, founders)
//   randomiseAll(spec, current, random)  spec: { field: list | count } → a new object with every field re-rolled
//                                        (a list gives a name, a count gives an index; each differs from current)
// random: () => [0, 1) — Math.random by default; tests pass a seeded one.
export function pickIndex(n, { not = null, random = Math.random } = {}) {
  if (n <= 0) return -1;
  if (n === 1) return 0;
  const skip = Number.isInteger(not) && not >= 0 && not < n;
  let i = Math.floor(random() * (skip ? n - 1 : n));
  if (skip && i >= not) i++;
  return i;
}

export function pickName(list, { not = null, random = Math.random } = {}) {
  if (!list?.length) return '';
  const at = list.indexOf(not);
  return list[pickIndex(list.length, { not: at >= 0 ? at : null, random })];
}

export function randomiseAll(spec, current = {}, random = Math.random) {
  const out = { ...current };
  for (const [field, src] of Object.entries(spec)) {
    if (Array.isArray(src)) out[field] = pickName(src, { not: current[field], random });
    else out[field] = pickIndex(src, { not: current[field], random });
  }
  return out;
}
