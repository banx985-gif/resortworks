// Code-made sounds and music (Robot Workshop Milestone 25): turns a small recipe (plain data) into samples, so a game
// can have every sound before any audio file exists. Pure maths — no Web Audio needed — so it also runs in the tests.
// A café or shipyard game reuses it with its own recipes.
//
// Sound recipe:
//   { gain = 0.6, layers: [layer…], echo?: { delay, feedback, mix } , loop?: true }
//   layer: { wave: 'sine'|'square'|'triangle'|'saw'|'noise', f (Hz), f2? (Hz at the end: a pitch sweep),
//            curve: 'exp'|'lin', t = 0 (start, s), d (length, s), a = 0.005 (attack, s), shape = 1.6 (fade curve),
//            v = 1 (level), vib?: { rate, depth } (vibrato, depth in semitones), lp? (low-pass Hz), duty? (square),
//            hold? (true: stays at full level instead of fading — for loops) }
// Music recipe (a short loop, repeated):
//   { bpm, bars, root (MIDI note), chords: [[semitones from root] per bar], gain,
//     pad?: { wave, v, octave }, bass?: { wave, v, steps: [0–15 on a 16-step bar] }, arp?: { wave, v, every (steps), octave },
//     lead?: { wave, v, notes: [[step, semitone, length in steps] …] (over the whole loop) },
//     drums?: { v, kick: [steps], snare: [steps], hat: [steps] }, swing? }
//
//   renderSound(recipe, sampleRate) → Float32Array      renderMusic(recipe, sampleRate) → Float32Array (one loop)
//   soundLength(recipe) → seconds
export const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

// A tiny seeded generator, so a recipe always sounds the same (and the tests can compare).
function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
}

function wave(kind, phase, duty = 0.5) {
  const p = phase - Math.floor(phase);
  switch (kind) {
    case 'square':
      return p < duty ? 0.8 : -0.8;
    case 'triangle':
      return 4 * Math.abs(p - 0.5) - 1;
    case 'saw':
      return 2 * p - 1;
    default:
      return Math.sin(2 * Math.PI * p);
  }
}

export function soundLength(recipe) {
  let end = 0;
  for (const l of recipe.layers ?? []) end = Math.max(end, (l.t ?? 0) + l.d);
  const e = recipe.echo;
  return end + (e ? e.delay * 4 : 0) + 0.01;
}

// One layer, added into out[] from sample `at`.
function addLayer(out, l, sr, at, noise) {
  const n = Math.max(1, Math.round(l.d * sr));
  const a = Math.max(1, Math.round((l.a ?? 0.005) * sr));
  const shape = l.shape ?? 1.6;
  const lin = l.curve === 'lin';
  const f1 = l.f ?? 440;
  const f2 = l.f2 ?? f1;
  const lpK = l.lp ? 1 - Math.exp((-2 * Math.PI * l.lp) / sr) : 0;
  let phase = 0;
  let y = 0;
  for (let i = 0; i < n && at + i < out.length; i++) {
    const k = i / n;
    let f = lin ? f1 + (f2 - f1) * k : f1 * Math.pow(f2 / f1, k);
    if (l.vib) f *= Math.pow(2, (l.vib.depth * Math.sin(2 * Math.PI * l.vib.rate * (i / sr))) / 12);
    phase += f / sr;
    let s = l.wave === 'noise' ? noise() : wave(l.wave, phase, l.duty);
    if (lpK) s = y += lpK * (s - y);
    const env = i < a ? i / a : l.hold ? (i > n - a ? (n - i) / a : 1) : Math.pow(1 - (i - a) / Math.max(1, n - a), shape);
    out[at + i] += s * env * (l.v ?? 1);
  }
}

export function renderSound(recipe, sampleRate = 22050) {
  const sr = sampleRate;
  const out = new Float32Array(Math.ceil(soundLength(recipe) * sr));
  const noise = rng(recipe.seed ?? 7);
  for (const l of recipe.layers ?? []) addLayer(out, l, sr, Math.round((l.t ?? 0) * sr), noise);
  if (recipe.echo) echo(out, recipe.echo, sr);
  return finish(out, recipe.gain ?? 0.6);
}

function echo(out, e, sr) {
  const d = Math.max(1, Math.round(e.delay * sr));
  const fb = e.feedback ?? 0.3;
  const mix = e.mix ?? 0.3;
  const wet = new Float32Array(out.length);
  for (let i = d; i < out.length; i++) wet[i] = (out[i - d] + wet[i - d] * fb) * 1;
  for (let i = 0; i < out.length; i++) out[i] += wet[i] * mix;
}

// Peak to `gain`, soft-clipped (never harsh), with tiny fades so nothing clicks.
function finish(out, gain) {
  let peak = 0;
  for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]));
  const k = peak > 0 ? gain / peak : 0;
  const fade = Math.min(64, out.length >> 2);
  for (let i = 0; i < out.length; i++) {
    let v = Math.tanh(out[i] * k * 1.1) / Math.tanh(1.1);
    if (i < fade) v *= i / fade;
    if (i >= out.length - fade) v *= (out.length - 1 - i) / fade;
    out[i] = v;
  }
  return out;
}

// --- music -------------------------------------------------------------------------------------------------------------
export function renderMusic(m, sampleRate = 22050) {
  const sr = sampleRate;
  const beat = 60 / m.bpm;
  const step = beat / 4; // 16 steps a bar
  const bars = m.bars ?? m.chords.length;
  const len = Math.round(bars * 4 * beat * sr);
  const out = new Float32Array(len);
  const noise = rng(m.seed ?? 11);
  const swing = m.swing ?? 0;
  const at = (s) => Math.round((s * step + (s % 2 ? swing * step : 0)) * sr) % len;
  // Notes that run past the loop end wrap round to the start, so the loop is seamless.
  const note = (s, d, f, opts) => {
    const start = at(s);
    const tmp = new Float32Array(Math.round(d * sr) + 2);
    addLayer(tmp, { f, d, ...opts }, sr, 0, noise);
    for (let i = 0; i < tmp.length; i++) out[(start + i) % len] += tmp[i];
  };
  for (let b = 0; b < bars; b++) {
    const chord = m.chords[b % m.chords.length];
    const s0 = b * 16;
    if (m.pad) for (const semi of chord) note(s0, 4 * beat, midiHz(m.root + semi + 12 * (m.pad.octave ?? 0)), { wave: m.pad.wave ?? 'triangle', v: m.pad.v ?? 0.12, a: beat * 0.6, shape: 0.8, lp: m.pad.lp ?? 1800 });
    if (m.bass) for (const s of m.bass.steps ?? [0, 8]) note(s0 + s, beat * (m.bass.len ?? 0.9), midiHz(m.root + chord[0] - 12), { wave: m.bass.wave ?? 'triangle', v: m.bass.v ?? 0.35, a: 0.004, shape: 1.3, lp: 900 });
    if (m.arp) {
      const tones = chord.map((c) => m.root + c + 12 * (m.arp.octave ?? 1));
      for (let s = 0, i = 0; s < 16; s += m.arp.every ?? 2, i++) note(s0 + s, step * (m.arp.every ?? 2) * 0.9, midiHz(tones[i % tones.length]), { wave: m.arp.wave ?? 'square', duty: 0.25, v: m.arp.v ?? 0.08, a: 0.003, shape: 2, lp: m.arp.lp ?? 2600 });
    }
    const d = m.drums;
    if (d) {
      for (const s of d.kick ?? []) note(s0 + s, 0.16, 110, { wave: 'sine', f2: 45, v: (d.v ?? 0.5) * 1.2, a: 0.002, shape: 2 });
      for (const s of d.snare ?? []) note(s0 + s, 0.12, 200, { wave: 'noise', v: (d.v ?? 0.5) * 0.5, a: 0.001, shape: 2.2, lp: 4000 });
      for (const s of d.hat ?? []) note(s0 + s, 0.04, 8000, { wave: 'noise', v: (d.v ?? 0.5) * 0.25, a: 0.001, shape: 3, lp: 9000 });
    }
  }
  for (const [s, semi, l] of m.lead?.notes ?? []) note(s, l * step * 0.95, midiHz(m.root + semi + 12 * (m.lead.octave ?? 1)), { wave: m.lead.wave ?? 'triangle', v: m.lead.v ?? 0.12, a: 0.01, shape: 1.2, vib: { rate: 5, depth: 0.08 }, lp: 3000 });
  // Normalise gently (no fades: it loops).
  let peak = 0;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(out[i]));
  const k = peak > 0 ? (m.gain ?? 0.5) / peak : 0;
  for (let i = 0; i < len; i++) out[i] = Math.tanh(out[i] * k * 1.05) / Math.tanh(1.05);
  return out;
}
