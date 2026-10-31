// The RESORTWORKS chibi cast (M6b, SERIES_CHIBI_CAST.md). Plain data — the shared Works chibis this game uses, never
// replacing Aaron's own RESORTWORKS art (staff portraits and walking pictures, guest-type pictures all stay).
//   NAMED_CAST   the fixed named people (each one chibi, each unique, never a walking guest). portrait = Cowork's stand-in
//                picture (a full-body T-pose, 595 px tall); face = the head-and-shoulders crop (cx = the face's centre as
//                a fraction of the width, size = the square's side as a fraction of the height, from the top), as the
//                Founders' (data/setup.js). milestone = when they first appear; only M6b's are used yet.
//   GUEST_POOL   the everyday chibis that will walk as each guest type once the series sprite sheets exist (decided
//                once for the whole series). sprite: null until then — today's world_guest_* pictures stay the look, and
//                stay the only look for luxury, VIP, celebrity and secret guests.
//   OPAL         Dame Opal Fairweather's lines: the welcome card after START RESORT and one tip at the start of each
//                month's Roadside Guide moment.

export const CHIBI_FILES = {
  1: 'chibi_01_curly_yellow_jumper',
  2: 'chibi_02_teal_hoodie',
  3: 'chibi_03_showman_tux',
  4: 'chibi_04_silver_green_suit',
  5: 'chibi_05_blue_top',
  6: 'chibi_06_red_shirt',
  7: 'chibi_07_moustache_polo',
  8: 'chibi_08_red_cardigan',
  9: 'chibi_09_pink_shorts',
  10: 'chibi_10_topknot_shorts',
  11: 'chibi_11_moustache_shorts',
  12: 'chibi_12_beach_shirt',
  13: 'chibi_13_beard_workwear',
  14: 'chibi_14_glasses_vest',
  15: 'chibi_15_denim_jacket',
  16: 'chibi_16_curly_coral_tee',
  17: 'chibi_17_green_hoodie',
  18: 'chibi_18_yellow_tee',
  19: 'chibi_19_sporty_red',
  20: 'chibi_20_athlete_blue',
  21: 'chibi_21_platinum_sporty',
  22: 'chibi_22_teal_sports_tee',
  23: 'chibi_23_ponytail_purple_sports',
  24: 'chibi_24_orange_tracksuit',
  25: 'chibi_25_grey_pink_blazer',
  26: 'chibi_26_grandad_cardigan',
  27: 'chibi_27_bob_green_shirt',
  28: 'chibi_28_plum_suit',
  29: 'chibi_29_navy_suit',
  30: 'chibi_30_teal_jumper',
};

const castMember = (chibi, id, name, job, milestone, extra = {}) => ({
  chibi,
  file: CHIBI_FILES[chibi],
  id,
  name,
  job,
  milestone,
  art: `cast_${id}`,
  portrait: `assets/images/cast/cast_${id}.png`,
  face: { cx: 0.5, size: 0.7 },
  ...extra,
});
export const NAMED_CAST = [
  castMember(4, 'opal', 'Dame Opal Fairweather', 'Narrator and mentor: the retired hotelier who sold you the motel', 'M6b'),
  castMember(25, 'mabel', 'Mabel Finch', 'Roadside Guide inspector (Guests)', 'M6b', { judge: 'guests' }),
  castMember(7, 'otto', 'Otto Rook', 'Roadside Guide inspector (Service)', 'M6b', { judge: 'service' }),
  castMember(27, 'june', 'June Hollis', 'Roadside Guide inspector (Grounds)', 'M6b', { judge: 'grounds' }),
  castMember(14, 'percy', 'Percy Vale', 'Roadside Guide inspector (Value)', 'M6b', { judge: 'value' }),
  castMember(13, 'dougie', 'Dougie Barnes', 'Builder and foreman: reports build and upgrade progress', 'M12'),
  castMember(3, 'rocco', 'Rocco Sparkle', 'Events host and MC: opens events and gives the live choice', 'M19'),
  castMember(28, 'priya', 'Priya Lark', 'Partner liaison: presents Partner offers and goals', 'M22'),
  castMember(29, 'victor', 'Victor Crane', 'General Manager of rival Crown Bay: rival news and award-night jibes', 'M23'),
];
export const castById = (id) => NAMED_CAST.find((c) => c.id === id) ?? null;
export const judgeCast = (judgeId) => NAMED_CAST.find((c) => c.judge === judgeId) ?? null;

// Guest type → the chibis that will walk as it (bible guest ids). Event crowds (M19) use the whole pool.
export const GUEST_POOL = {
  GT01: { name: 'Road Trip Couple', chibis: [15, 17], sprite: null },
  GT02: { name: 'Budget Family', chibis: [16, 2, 18], sprite: null },
  GT03: { name: 'Solo Traveller', chibis: [1, 6], sprite: null },
  GT04: { name: 'Retired Couple', chibis: [26, 8], sprite: null },
  GT05: { name: 'Young Couple', chibis: [9, 12], sprite: null },
  GT06: { name: 'Family Holiday', chibis: [10, 11, 18], sprite: null },
  GT07: { name: 'Business Traveller', chibis: [30, 5], sprite: null },
  GT08: { name: 'Tour Group', chibis: [1, 6, 16, 17], sprite: null },
  GT09: { name: 'Sports Team', chibis: [19, 20, 22, 23], sprite: null },
  GT13: { name: 'Adventure Guest', chibis: [21, 24], sprite: null },
  GT15: { name: 'Conference Group', chibis: [30, 5], sprite: null },
};
export const EVENT_CROWD = [...new Set(Object.values(GUEST_POOL).flatMap((g) => g.chibis))].sort((a, b) => a - b);
// The walking picture for a guest type: its chibi sheet once the series sheets exist, else today's sprite (fallback).
export const guestSprite = (typeId, fallback) => GUEST_POOL[typeId]?.sprite ?? fallback;

// Dame Opal Fairweather's lines (Cowork's welcome; the tips are Claude Code's, about booking, cleaning, pricing and
// reviews). A month's tip is picked by its number, so the same month always gets the same line.
export const OPAL = {
  welcomeTitle: 'Welcome to your motel',
  welcome: ['I’ve left you the keys and a very tired pool pump.', 'Make it a place people come back to.'],
  sign: '— Dame Opal Fairweather',
  tips: [
    'New offers arrive every Morning at Reception. Unanswered ones are gone by the end of the day.',
    'A Dirty room can still be booked for a later day, as long as Ruby can get to it first.',
    'Guests who wait for a late room remember it in their Service score.',
    'Prices live at Reception → Rates. Premium earns more a night, but fewer guests book.',
    'If Service drops under 70, Premium prices put even more guests off.',
    'Value pricing fills rooms, but every night earns less. Watch the Finance sheet.',
    'Wages are paid at the end of each month. Keep a little cash aside for them.',
    'If cash runs dry, the bank’s Emergency Credit steps in, but it costs 1.5% a month.',
    'Read the reviews: each guest tells you their best and worst part of the stay.',
    'Good reviews earn REP, and REP raises your Rank. Rank C unlocks 4× speed.',
  ],
};
export const opalTip = (monthN) => OPAL.tips[(Math.max(1, monthN) - 1) % OPAL.tips.length];

// The cast's rules, on core/DataValidator (checked at boot with ?debug=1 and by tests/resortworks/m6b.test.mjs).
// art: true also queues every portrait path (then await v.checkArt()).
export function validateCast(v, { art = false } = {}) {
  const ok = (n) => Number.isInteger(n) && n >= 1 && n <= 30;
  for (const [n, file] of Object.entries(CHIBI_FILES)) v.check(ok(Number(n)) && file.startsWith(`chibi_${String(n).padStart(2, '0')}_`), `chibi ${n} file id`);
  v.uniqueIds('cast member', NAMED_CAST);
  const named = NAMED_CAST.map((c) => c.chibi);
  v.check(new Set(named).size === named.length, 'each named cast member is a different chibi');
  for (const c of NAMED_CAST) {
    v.check(ok(c.chibi), `cast ${c.id}: chibi number 01–30`);
    v.check(c.file === CHIBI_FILES[c.chibi], `cast ${c.id}: file id matches chibi ${c.chibi}`);
    v.check(c.name && c.job && /^M\d+b?$/.test(c.milestone), `cast ${c.id}: name, job and milestone`);
    v.check(c.portrait === `assets/images/cast/cast_${c.id}.png`, `cast ${c.id}: portrait path`);
    v.check(c.face?.cx > 0 && c.face.cx < 1 && c.face.size > 0 && c.face.size <= 1, `cast ${c.id}: face crop`);
    if (art) v.art(`cast ${c.id}`, c.portrait);
  }
  for (const [gt, g] of Object.entries(GUEST_POOL)) {
    v.check(/^GT\d\d$/.test(gt) && g.chibis.length > 0, `guest pool ${gt}`);
    v.check(g.chibis.every(ok), `guest pool ${gt}: chibi numbers 01–30`);
    v.check(!g.chibis.some((n) => named.includes(n)), `guest pool ${gt}: no named cast member walks as a guest`);
    v.check(g.sprite === null, `guest pool ${gt}: no sprite until the series sheets exist`);
  }
  v.check(OPAL.welcome.length === 2 && OPAL.tips.length >= 8 && OPAL.tips.length <= 10, 'Opal: two welcome lines and 8–10 tips');
  return v;
}
