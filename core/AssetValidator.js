// The asset validator (Milestone 24): checks a game's art manifest against its locked art list and the files that
// exist, and — given a draw record from core/AssetManager's tracker — which pictures were actually shown and whether
// any placeholder or stand-in was drawn. Game-neutral: every list comes in as data.
//
//   validateAssets({
//     artList,        [key]                  the locked list (every picture that must exist)
//     manifest,       { key: path }          what the game loads
//     files,          { key: path } | null   what exists: a disk listing (tests) or what loaded (?debug=1)
//     notInGame,      [key]                  on the list but deliberately not shown in the game (store art…)
//     drawn,          { key: … } | null      keys drawn during a run (AssetManager.trackingReport().drawn)
//     fallbacks,      { key: … } | null      placeholders / stand-ins drawn during a run
//   }) → {
//     ok, counts: { listed, present, loaded, used, fallbacks },
//     missing      on the list, no file
//     misnamed     a file that isn't on the list but nearly matches a key (wrong case, a typo, a stray extension)
//     stray        other files that aren't on the list
//     unlisted     loaded by the game but not on the list
//     unused       on the list (and meant for the game) but never loaded
//     notDrawn     loaded but never drawn during the run (only when a draw record is given)
//     fallbacks    [key] a placeholder or stand-in was drawn
//   }
export function validateAssets({ artList, manifest, files = null, notInGame = [], drawn = null, fallbacks = null }) {
  const list = [...new Set(artList)];
  const listed = new Set(list);
  const skip = new Set(notInGame);
  const loadKeys = Object.keys(manifest);
  const loaded = new Set(loadKeys);
  const have = files ? new Set(Object.keys(files)) : null;

  const missing = have ? list.filter((k) => !have.has(k)) : [];
  const extraFiles = have ? [...have].filter((k) => !listed.has(k)) : [];
  const misnamed = [];
  const stray = [];
  for (const f of extraFiles) {
    const near = list.find((k) => similar(f, k));
    if (near) misnamed.push({ file: files[f], looksLike: near });
    else stray.push(files[f]);
  }
  const unlisted = loadKeys.filter((k) => !listed.has(k));
  const unused = list.filter((k) => !skip.has(k) && !loaded.has(k));
  const notDrawn = drawn ? list.filter((k) => !skip.has(k) && loaded.has(k) && !drawn[k]) : [];
  const fb = fallbacks ? Object.keys(fallbacks) : [];
  const used = drawn ? list.filter((k) => drawn[k]).length : null;
  return {
    ok: !missing.length && !misnamed.length && !unlisted.length && !unused.length && !notDrawn.length && !fb.length,
    counts: { listed: list.length, present: have ? list.length - missing.length : null, loaded: list.filter((k) => loaded.has(k)).length, used, fallbacks: fb.length, notInGame: skip.size },
    missing,
    misnamed,
    stray,
    unlisted,
    unused,
    notDrawn,
    fallbacks: fb,
  };
}

// Near-misses: the same letters ignoring case and separators, or one character different.
function similar(a, b) {
  const n = (s) => String(s).toLowerCase().replace(/\.(png|webp|jpe?g)$/, '').replace(/[^a-z0-9]/g, '');
  const x = n(a);
  const y = n(b);
  if (x === y) return true;
  if (Math.abs(x.length - y.length) > 1) return false;
  let diff = 0;
  for (let i = 0, j = 0; i < x.length || j < y.length; i++, j++) {
    if (x[i] === y[j]) continue;
    if (++diff > 1) return false;
    if (x.length > y.length) j--;
    else if (y.length > x.length) i--;
  }
  return true;
}

// A plain one-line summary for a debug log.
export function assetSummary(r) {
  const c = r.counts;
  return `art: ${c.present ?? '?'}/${c.listed} present, ${c.loaded} loaded${c.used != null ? `, ${c.used} shown` : ''}, ${c.fallbacks} fallbacks` + (r.missing.length ? ` · missing ${r.missing.join(', ')}` : '') + (r.misnamed.length ? ` · misnamed ${r.misnamed.map((m) => m.file).join(', ')}` : '') + (r.unused.length ? ` · unused ${r.unused.join(', ')}` : '');
}
