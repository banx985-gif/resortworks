// Satisfaction / reviews / REP / star rating numbers (Milestone 5, bible §7 / §9 / §27A / §27F / §27N). Plain data —
// src/systems/reviews.js runs it. Picks the bible leaves open are Cowork's (marked) or Claude Code's, and are logged in
// docs/DECISIONS.md.

// The seven stay categories (bible §9), in the bible's weight order.
export const CATEGORIES = [
  { id: 'room', name: 'Room' },
  { id: 'clean', name: 'Clean' },
  { id: 'service', name: 'Service' },
  { id: 'food', name: 'Food' },
  { id: 'activities', name: 'Activities' },
  { id: 'comfort', name: 'Comfort' },
  { id: 'value', name: 'Value' },
];
export const CATEGORY_IDS = CATEGORIES.map((c) => c.id);

// Each category's inputs at check-out (Cowork's starting picks, M5 card). Every category is clamped 0–100 and rounded.
//   room:       the room type's base, +wanted if it's the type they asked for, +worse if it's a worse type (an upgrade: +0)
//   clean:      base, +short if their room was short on linen, then capped by the linen tier (Basic 82, bible §27N)
//   service:    base − the stay's Service-loss (M4 late rooms) + (Front Office Service − 50) / div
//   food:       base + the Snack Café + (Hospitality Skill − 50) / div, capped by the food tier (Basic 78, bible §27N)
//   activities: base + the Small Pool + (Activities Charm − 50) / div
//   comfort:    by room type (noise arrives in M9)
//   value:      base + span × (guest budget − nightly rate) / budget
// facility: the bonus only counts while that facility stands on the lot. role / stat: whose stat counts (the best one
// on the team in that role).
export const STAY_INPUTS = {
  room: { base: { RM01: 60, RM02: 70 }, wanted: 10, worse: -15 },
  clean: { base: 85, short: -15, cap: 82 },
  service: { base: 75, role: 'FO', stat: 'service', div: 2 },
  food: { base: 60, facility: { id: 'F06', add: 6 }, role: 'HS', stat: 'skill', div: 4, cap: 78 },
  activities: { base: 55, facility: { id: 'F03', add: 8 }, role: 'AE', stat: 'charm', div: 4 },
  comfort: { base: { RM01: 62, RM02: 70 } },
  value: { base: 70, span: 60 },
};

// Review weights per guest type (bible §27F), Room / Clean / Service / Food / Activities / Comfort / Value, each adds up
// to 100. Only the Roadside guest types are in play yet.
export const GUEST_WEIGHTS = {
  GT01: [20, 15, 15, 10, 5, 10, 25], // Road Trip Couple
  GT03: [22, 16, 17, 8, 5, 15, 17], // Solo Traveller
  GT04: [20, 18, 18, 12, 8, 16, 8], // Retired Couple
};

// Review stars from the final satisfaction (M5 card): 90+ = 5, 78+ = 4, 64+ = 3, 50+ = 2, else 1.
export const REVIEW_STARS = [
  { stars: 5, min: 90 },
  { stars: 4, min: 78 },
  { stars: 3, min: 64 },
  { stars: 2, min: 50 },
];

// Reputation Points (bible §27A) — the M5 sources only.
export const REP = { stay: 1, stars: { 1: -12, 4: 3, 5: 7 } };
// Resort Rank (bible §27A): min REP of each rank, ascending.
export const RANKS = [
  { id: 'E', min: 0, name: 'Roadside operator' },
  { id: 'D', min: 750, name: 'Holiday Lodge tier' },
  { id: 'C', min: 2250, name: 'Destination Resort tier' },
  { id: 'B', min: 5500, name: 'Luxury Retreat tier' },
  { id: 'A', min: 10500, name: 'World-Class eligibility' },
  { id: 'S', min: 18000, name: 'Prestige / postgame eligibility' },
];

// Headline scores (bible §7) and their rolling window. Appeal, Staff Wellbeing and Prestige are fixed for now (M5 card):
// Appeal = base + the Garden Strip (layout effects come in M9), Wellbeing 75 (fatigue in M10), Prestige 0.
export const WINDOW_DAYS = 28;
export const HEADLINE_FIXED = { appeal: { base: 60, facility: { id: 'F08', add: 6 } }, wellbeing: 75, prestige: 0 };
export const HEADLINES = [
  { id: 'satisfaction', name: 'Guest Satisfaction', line: 'How happy guests leave, on average over the last 28 days.' },
  { id: 'service', name: 'Service Quality', line: 'How well the desk looks after them. Late rooms pull it down.' },
  { id: 'appeal', name: 'Resort Appeal', line: 'How good the resort looks. The Garden Strip adds 6.' },
  { id: 'wellbeing', name: 'Staff Wellbeing', line: 'How rested and happy your team is.' },
  { id: 'prestige', name: 'Prestige', line: 'Fame from awards and famous guests. It comes later.' },
];

// The monthly star rating (bible §27A): QualityIndex weights and the star table. 5 stars also needs no headline score
// below fiveMin — Satisfaction, Service, Appeal and Staff Wellbeing (Claude Code's reading: Prestige is left out, as the
// bible says a 5-star resort can still have low Prestige).
export const QUALITY = { satisfaction: 0.34, service: 0.26, appeal: 0.22, wellbeing: 0.1, value: 0.08 };
export const STAR_TABLE = [
  { stars: 5, min: 88 },
  { stars: 4, min: 77 },
  { stars: 3, min: 65 },
  { stars: 2, min: 50 },
  { stars: 1, min: -Infinity },
];
export const FIVE_STAR_HEADLINES = ['satisfaction', 'service', 'appeal', 'wellbeing'];
export const FIVE_STAR_MIN = 72;

// The monthly "Roadside Guide" moment (Kairosoft rule 2): four fictional inspectors, each marking one area out of 10
// (that headline ÷ 10, one decimal), shown one at a time, then the stars (always the §27A table above).
export const GUIDE = {
  name: 'Roadside Guide',
  judges: [
    { id: 'guests', name: 'Mabel Finch', area: 'Guests', from: 'satisfaction', color: '#F07A5A' },
    { id: 'service', name: 'Otto Rook', area: 'Service', from: 'service', color: '#3A9BE0' },
    { id: 'grounds', name: 'June Hollis', area: 'Grounds', from: 'appeal', color: '#3E9B4F' },
    { id: 'value', name: 'Percy Vale', area: 'Value', from: 'value', color: '#E0A93A' },
  ],
};

// The reveal timings (real seconds; Skip always shows everything at once).
export const REVEAL = { review: { step: 0.32, stars: 0.4, text: 0.3 }, guide: { step: 0.6, stars: 0.5 } };

// The review's short comment (core ReviewText): their best and worst category, then a line for the stars.
export const REVIEW_TEXT = {
  strong: {
    room: ['The room was just what we wanted.', 'Lovely room, comfy and neat.'],
    clean: ['Spotless sheets and a fresh bathroom.', 'Everything was so clean.'],
    service: ['The front desk was really kind.', 'Friendly, quick check-in.'],
    food: ['The café food was a treat.', 'Great snacks at the café.'],
    activities: ['We loved the pool.', 'Plenty to do by the pool.'],
    comfort: ['We slept really well.', 'A quiet, cosy night.'],
    value: ['Great value for the price.', 'Cheap and cheerful, money well spent.'],
  },
  weak: {
    room: ['The room felt a bit basic.', 'Not quite the room we hoped for.'],
    clean: ['The room could have been cleaner.', 'The towels felt a bit tired.'],
    service: ['Waiting for our room was annoying.', 'Check-in was slow.'],
    food: ['The food was only OK.', 'The café menu was small.'],
    activities: ['Not much to do.', 'We wanted more to do.'],
    comfort: ['The bed was a little hard.', 'Not the comfiest night.'],
    value: ['A bit pricey for what it is.', 'We expected more for the money.'],
  },
  fit: {
    high: ['We will be back!', 'Highly recommended.'],
    mid: ['A decent stop on the road.', 'Fine for a night or two.'],
    low: ['We won’t rush back.', 'Not great, sorry.'],
  },
};
