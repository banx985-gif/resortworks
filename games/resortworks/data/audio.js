// RESORTWORKS sound (Milestone 31, bible §36 audio list) — plain data for core/AudioManager and core/SoundSynth. No audio
// files and no licensed music: every sound is a code-made recipe (a real file with the same id in assets/audio/ wins
// with no code change). Bright, warm, holiday-ish; never harsh. Sound starts only after the first tap (the browser rule),
// and every moment with a sound also has its words on screen, so nothing is lost with the sound off.
// PLACEHOLDERS (DECISIONS M31): every recipe, and which moment plays which.
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const tone = (m, t, d, wave = 'triangle', v = 1, extra = {}) => ({ wave, f: hz(m), t, d, v, ...extra });
const sweep = (f, f2, t, d, wave = 'sine', v = 1, extra = {}) => ({ wave, f, f2, t, d, v, ...extra });
const arp = (notes, step, len, wave = 'triangle', v = 1, from = 0) => notes.map((m, i) => tone(m, from + i * step, len, wave, v));
const S = (group, layers, extra = {}) => ({ group, recipe: { layers, gain: extra.gain ?? 0.4, echo: extra.echo, loop: extra.loop }, volume: extra.volume ?? 1, loop: !!extra.loop });
const ROOM = { delay: 0.12, feedback: 0.3, mix: 0.25 };
const noise = (t, d, lp, v = 1, extra = {}) => ({ wave: 'noise', t, d, lp, v, ...extra });

export const AUDIO_BASE = 'assets/audio/';
export const AUDIO_MANIFEST = 'assets/audio/manifest.json';

export const SOUNDS = {
  sfx_ui: S('ui', [sweep(820, 1100, 0, 0.04, 'sine')], { gain: 0.16 }),
  sfx_checkin: S('workshop', [tone(88, 0, 0.35, 'sine', 0.8), tone(84, 0.12, 0.45, 'sine', 0.5)], { gain: 0.28, echo: ROOM }), // the reception bell
  sfx_complaint: S('progression', [tone(67, 0, 0.18, 'triangle', 0.7), tone(63, 0.2, 0.3, 'triangle', 0.6)], { gain: 0.26 }), // two notes down, gentle
  sfx_clean: S('workshop', [noise(0, 0.25, 3000, 0.5, { a: 0.05 }), sweep(1400, 1900, 0.2, 0.12, 'sine', 0.4)], { gain: 0.2 }), // a swish and a sparkle
  sfx_repair: S('workshop', [noise(0, 0.04, 2000, 0.8), noise(0.12, 0.04, 2000, 0.8), tone(55, 0.24, 0.2, 'square', 0.3, { duty: 0.3 })], { gain: 0.22 }), // tap-tap-clunk
  sfx_item: S('economy', arp([76, 79, 84], 0.07, 0.25, 'triangle', 0.7), { gain: 0.3, echo: ROOM }), // a Staff Item
  sfx_memory: S('progression', [tone(72, 0, 0.6, 'sine', 0.6, { a: 0.08 }), tone(79, 0.15, 0.7, 'sine', 0.5, { a: 0.08 })], { gain: 0.26, echo: ROOM }), // a Guestbook memory
  sfx_award: S('competition', [...arp([67, 72, 76, 79], 0.1, 0.25, 'triangle', 0.7), tone(84, 0.4, 0.8, 'sine', 0.6)], { gain: 0.4, echo: ROOM }),
  sfx_prestige: S('competition', [...arp([72, 79, 84, 88], 0.09, 0.4, 'sine', 0.6), tone(91, 0.36, 1.0, 'sine', 0.4)], { gain: 0.36, echo: ROOM }),
  sfx_event: S('progression', [noise(0, 0.6, 1200, 0.5, { a: 0.1 }), ...arp([72, 76, 79], 0.12, 0.3, 'triangle', 0.5, 0.2)], { gain: 0.3 }), // a cheering crowd, roughly
  sfx_secret: S('competition', [...arp([72, 76, 79, 83, 88], 0.07, 0.3, 'sine', 0.6), tone(91, 0.4, 0.9, 'sine', 0.4)], { gain: 0.34, echo: ROOM }),
  sfx_purchase: S('economy', [tone(81, 0, 0.08, 'triangle', 0.8), tone(88, 0.08, 0.25, 'triangle', 0.8)], { gain: 0.28 }),
  // ambience loops (bible §36: lobby, restaurant, pool, garden; guest chatter): soft beds, never loud
  amb_lobby: S('workshop', [noise(0, 2, 900, 0.35, { hold: true }), tone(60, 0, 2, 'sine', 0.05, { hold: true })], { gain: 0.08, loop: true }),
  amb_pool: S('workshop', [noise(0, 2, 2200, 0.4, { hold: true, vib: { rate: 0.6, depth: 1 } })], { gain: 0.07, loop: true }),
  amb_garden: S('workshop', [noise(0, 2, 600, 0.25, { hold: true }), sweep(4200, 4400, 0.4, 0.05, 'sine', 0.15), sweep(4300, 4500, 1.3, 0.05, 'sine', 0.12)], { gain: 0.07, loop: true }), // evening crickets
};
// One gentle code-made tune for the resort by day (no licensed music; "Music volume" sets it).
export const MUSIC = {
  music_day: { bpm: 96, bars: 4, root: 62, chords: [[0, 4, 7], [5, 9, 12], [-3, 0, 4], [7, 11, 14]], gain: 0.16, pad: { wave: 'triangle', v: 0.3, octave: 0 }, bass: { wave: 'sine', v: 0.35, steps: [0, 8] }, arp: { wave: 'sine', v: 0.18, every: 2, octave: 1 } },
};
// Which moment plays which sound (main.js listens on the bus).
export const EVENT_SOUNDS = {
  'booking:checkin': 'sfx_checkin',
  'complaint:new': 'sfx_complaint',
  'hk:done': 'sfx_clean',
  'mt:done': 'sfx_repair',
  'items:new': 'sfx_item',
  'guestbook:memory': 'sfx_memory',
  'awards:prestige': 'sfx_prestige',
  'events:result': 'sfx_event',
  'secrets:found': 'sfx_secret',
  'achievement:unlocked': 'sfx_item',
  'money:change': 'sfx_purchase',
};
// The ambience by the part of the day (Morning–Afternoon: the lobby and the pool; Evening–Night: the garden).
export const AMBIENCE_BY_BAND = { morning: 'amb_lobby', midday: 'amb_pool', afternoon: 'amb_pool', evening: 'amb_garden', night: 'amb_garden' };
// Haptics on the big moments (Settings → Haptics).
export const HAPTICS = { 'secrets:found': 'strong', 'ending:reached': 'strong', 'achievement:unlocked': 'medium', 'awards:result': 'medium', 'staff:levelUp': 'light' };
