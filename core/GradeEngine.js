// Campaign grade (any series game): categories with max points, each made of simple parts, and grade bands — all
// from the game's data. The game only supplies the facts (plain numbers about the finished run).
//
//   categories: [{ id, name, max, parts: [{ fact, label, full, points, floor = 0 }] }]
//     a part scores points × (value − floor) ÷ (full − floor), kept between 0 and points
//     a category's parts add up to its max (checkGrade says so)
//   bands: [{ id, min }] ascending by min (the first should start at 0)
//   gradeRun({ categories, bands, facts }) →
//     { total, max, band, categories: [{ id, name, max, score, parts: [{ fact, label, value, full, points, got }] }] }
export function gradeRun({ categories, bands, facts }) {
  const out = categories.map((c) => {
    const parts = c.parts.map((p) => {
      const value = Number(facts[p.fact] ?? 0);
      const floor = p.floor ?? 0;
      const frac = p.full === floor ? (value >= p.full ? 1 : 0) : (value - floor) / (p.full - floor);
      const got = p.points * Math.min(1, Math.max(0, Number.isFinite(frac) ? frac : 0));
      return { fact: p.fact, label: p.label, value, full: p.full, points: p.points, got: Math.round(got * 10) / 10 };
    });
    const score = Math.min(c.max, Math.round(parts.reduce((t, p) => t + p.got, 0)));
    return { id: c.id, name: c.name, max: c.max, score, parts };
  });
  const total = out.reduce((t, c) => t + c.score, 0);
  const max = categories.reduce((t, c) => t + c.max, 0);
  return { total, max, band: bandFor(bands, total), categories: out };
}

export function bandFor(bands, total) {
  let best = bands[0]?.id ?? null;
  for (const b of bands) if (total >= b.min) best = b.id;
  return best;
}

// Problems with the data, as sentences (empty = fine).
export function checkGrade({ categories, bands, total = null }) {
  const errs = [];
  const ids = new Set();
  for (const c of categories) {
    if (ids.has(c.id)) errs.push(`grade: category ${c.id} twice`);
    ids.add(c.id);
    const sum = c.parts.reduce((t, p) => t + p.points, 0);
    if (sum !== c.max) errs.push(`grade: ${c.id} parts add up to ${sum}, not ${c.max}`);
    for (const p of c.parts) if (!(p.full > (p.floor ?? 0))) errs.push(`grade: ${c.id}.${p.fact} needs full above floor`);
  }
  const max = categories.reduce((t, c) => t + c.max, 0);
  if (total != null && max !== total) errs.push(`grade: categories add up to ${max}, not ${total}`);
  for (let i = 1; i < bands.length; i++) if (bands[i].min <= bands[i - 1].min) errs.push(`grade: band ${bands[i].id} is not above ${bands[i - 1].id}`);
  if (bands[0]?.min !== 0) errs.push('grade: the first band must start at 0');
  return errs;
}
