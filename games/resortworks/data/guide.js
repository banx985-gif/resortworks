// The first-time guide (Milestone 33, bible §34) — plain data for core/GuideSystem, run by src/systems/guide.js. Dame Opal
// Fairweather (M6b) is its face. The bible's order: (create the resort and choose the Founder: Resort Setup) → inspect
// Reception / a room → accept the first booking → watch the check-in → watch the check-out and the Dirty room →
// housekeeping cleans → inspect the Small Pool → train staff → receive a review → Stars vs Prestige. Each step is a light
// tip (never pauses, never blocks a tap) that finishes itself when the player does it — or counts as done if they already
// did. The last step is a scripted check: one question about Stars vs Prestige, answered on its own small sheet.
// The words are Claude Code's (DECISIONS M33); each of the five Founders adds their own line (FOUNDER_LINES).
export const GUIDE_FACE = { key: 'cast_opal', name: 'Dame Opal' };
export const GUIDE_STEPS = [
  { id: 'reception', title: 'Your Reception', text: 'Tap Reception: your booking offers wait there.', target: 'F01', event: 'open:F01' },
  { id: 'accept', title: 'Your first booking', text: 'Accept an offer. Auto Assign gives the guests the best free room, and it turns Reserved.', target: 'shortcut', event: 'booking:action' },
  { id: 'checkin', title: 'Check-in', text: 'At Midday your guests drive in and check in at Reception. Watch them walk to their room.', event: 'booking:checkin' },
  { id: 'checkout', title: 'Check-out', text: 'On their last Morning they check out. Their room turns Dirty until it is cleaned.', event: 'booking:checkout' },
  { id: 'clean', title: 'Housekeeping', text: 'Your housekeeper cleans the Dirty room: it is ready for the next guests.', event: 'hk:done' },
  { id: 'pool', title: 'The Small Pool', text: 'Tap the Small Pool. Facilities lift every stay; keep them in good condition.', target: 'F03', event: 'open:F03' },
  { id: 'train', title: 'Train your team', text: 'At the Motel Service Block, tap a staff member and Train them (once a week each). Better staff, better stays.', target: 'F02', event: 'staff:trained' },
  { id: 'review', title: 'Your first review', text: 'A review! Every stay is scored on seven parts. Tap the toast to read it.', event: 'review:new' },
  { id: 'stars', title: 'Stars and Prestige', text: 'One question before you go: tap here.', event: 'guide:understood', quiz: true },
];
// The scripted check (bible §34 "explain star rating vs Prestige"): the explanation, then one question.
export const STARS_VS_PRESTIGE = {
  title: 'Stars and Prestige',
  explain: [
    'Your star rating (★ to ★★★★★) is how guests rate you now: it comes from the last 28 days of reviews, so it rises and falls month by month.',
    'Prestige (0–100) is your resort’s lasting fame: awards, famous guests and great moments. It builds slowly and stays.',
  ],
  question: 'A bad month of reviews: which one drops?',
  answers: [
    { id: 'stars', label: 'The star rating', right: true, reply: 'Right! Stars follow the last 28 days. Prestige is earned for good.' },
    { id: 'prestige', label: 'Prestige', right: false, reply: 'Not quite: Prestige stays. It’s the star rating that follows the last 28 days of reviews. Try again.' },
  ],
};
// The five Founder variants (bible §34 "all five Founder variants"): Opal's opening line for each, and a tip on the step
// that is their own job.
export const FOUNDER_LINES = {
  S01: { hello: 'Maya, you know a front desk better than anyone: start where the guests do.', step: 'reception', tip: 'Your Front Office skill makes check-ins quicker.' },
  S11: { hello: 'Ruby, a spotless room is half a five-star stay, and nobody knows it like you.', step: 'clean', tip: 'You can clean too: your rooms turn round faster.' },
  S21: { hello: 'Leo, guests remember a good meal. Let’s get them through the door first.', step: 'review', tip: 'Food is one of the seven parts. Your café keeps it up.' },
  S31: { hello: 'Kai, fun is your trade. First, guests; then we keep them smiling.', step: 'pool', tip: 'Activities are one of the seven parts. Your pool keeps them busy.' },
  S41: { hello: 'Gus, a resort that works is a resort that wins. Let me show you round.', step: 'pool', tip: 'You keep things running: Condition falls every day, and you repair it.' },
};
// The Help archive (Office → Help): short pages to read any time, and the guide's tips seen.
export const HELP_TOPICS = [
  { id: 'bookings', title: 'Bookings', icon: 'ui_06', paras: ['Offers come in each Morning at Reception. Accept one and Auto Assign picks the best free room (or tap the offer to pick one yourself).', 'Guests arrive at Midday, stay their nights and check out on their last Morning.'] },
  { id: 'rooms', title: 'Rooms and cleaning', icon: 'ui_08', paras: ['A room a guest has left is Dirty until a housekeeper cleans it. A room not ready when guests arrive makes them wait: that costs Service.'] },
  { id: 'reviews', title: 'Reviews, stars and Prestige', icon: 'ui_19', paras: ['Every stay is scored on seven parts: Room, Clean, Service, Food, Activities, Comfort and Value.', 'Your star rating comes from the last 28 days of reviews. Prestige is lasting fame from awards, famous guests and great moments.'] },
  { id: 'staff', title: 'Staff', icon: 'ui_02', paras: ['Hire from the week’s applicants at the Motel Service Block, train each person once a week, and give them Staff Items they love.', 'Tired staff work slower: keep priorities sensible.'] },
  { id: 'build', title: 'Building', icon: 'ui_33', paras: ['Long-press empty land for Build Mode. New rooms and facilities open as your resort grows: Roadside Motel → Holiday Lodge → Destination → Luxury → World-Class.'] },
  { id: 'money', title: 'Money', icon: 'ui_25', paras: ['Rooms, food and activities earn Credits; wages, upkeep and supplies cost them. Set prices per room type in Rates.', 'If cash runs out, Emergency Credit steps in — but pay it back.'] },
  { id: 'secrets', title: 'Secrets', icon: 'sec_found', paras: ['Fifty secrets hide in the resort. Rumours appear in the Secret Archive as you get close. Found ones show exactly what they needed.'] },
  { id: 'ending', title: 'Year 20 and New Game+', icon: 'ui_30', paras: ['After twenty years your resort is graded C to S+. Then New Game+ starts a fresh resort in another slot with one Legacy Staff member — your old one is kept.'] },
];
