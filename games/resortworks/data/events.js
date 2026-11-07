// Events (Milestone 19, bible §17 / §27J): numbers exact from §27J (group size, length, required facilities, base fee,
// Success / Great Success thresholds); the rest Claude Code's picks (DECISIONS M19). src/systems/events.js runs it.
//   need     the required facilities: every group must have one built (a group = any of these ids). The first group's
//            facility is the venue (its places: a hall's / lawn's capacity, otherwise its users a part of the day × level).
//            roomRank: the event also needs a room of that rank or better (Corporate Retreat: Premium rooms).
//            distinct: that many different facilities from the group (Festival Stay: 2 activity facilities).
//   guest    the guest type its party stays as (a room block of their rooms; data/bookings.js)
//   rare     Film Shoot / Celebrity Wedding / International Summit: a rare enquiry (debug-forced in tests)
//   choice   Kairosoft rule 4 — one live choice part-way through, presented by Rocco Sparkle: two or three options and
//            Skip. Each option: score (added to the event score), cost (Credits now), risk { p, score } (a seeded chance of
//            that score instead). Skip changes nothing.
const ACTIVITY = ['F03', 'F10', 'F11', 'F12', 'F13', 'F16', 'F21', 'F22', 'F28'];
const DINING = ['F06', 'F09', 'F22', 'F25'];
const ev = (id, name, group, nights, need, fee, success, great, guest, choice, extra = {}) => ({ id, name, group, nights, need, fee, success, great, guest, choice, art: `event_${id.toLowerCase()}`, ...extra });
export const EVENTS = [
  ev('EV01', 'Birthday Weekend', [8, 20], [2, 2], [['F09', 'F22']], 1500, 70, 90, 'GT05', { q: 'The birthday guest wants a surprise cake on the terrace. Bring it out?', options: [{ id: 'cake', label: 'Bring out the cake', score: 5, cost: 120 }, { id: 'quiet', label: 'Keep it low-key', score: 1, cost: 0 }] }),
  ev('EV02', 'Family Reunion', [15, 40], [2, 2], [['F11'], DINING], 3500, 70, 90, 'GT06', { q: 'Grandma wants a group photo by the pool before lunch. Hold lunch?', options: [{ id: 'photo', label: 'Hold lunch for the photo', score: 4, risk: { p: 0.25, score: -4 } }, { id: 'lunch', label: 'Serve lunch on time', score: 2 }] }),
  ev('EV03', 'Wedding', [30, 100], [2, 2], [['F20', 'F19']], 8000, 72, 92, 'GT10', { q: 'Clouds are rolling in over the ceremony. Move the band indoors?', options: [{ id: 'indoors', label: 'Move the band indoors', score: 3, cost: 400 }, { id: 'stay', label: 'Keep it outside', score: 6, risk: { p: 0.35, score: -10 } }, { id: 'tent', label: 'Hire a marquee', score: 5, cost: 1200 }] }),
  ev('EV04', 'Conference', [30, 80], [2, 3], [['F19']], 7000, 72, 90, 'GT15', { q: 'The keynote speaker is running late. What now?', options: [{ id: 'coffee', label: 'Free coffee break', score: 3, cost: 300 }, { id: 'swap', label: 'Swap the sessions round', score: 4, risk: { p: 0.3, score: -5 } }] }),
  ev('EV05', 'Wellness Retreat', [12, 30], [3, 3], [['F17', 'F30'], ['F16']], 6500, 75, 92, 'GT12', { q: 'The group asks for a sunrise yoga session. Open the gym early?', options: [{ id: 'sunrise', label: 'Open early for sunrise yoga', score: 5, cost: 250 }, { id: 'usual', label: 'Keep the usual hours', score: 0 }] }),
  ev('EV06', 'Sports Camp', [20, 60], [3, 3], [['F16']], 5500, 70, 88, 'GT09', { q: 'The coach wants an extra-early breakfast for training. Can the kitchen do it?', options: [{ id: 'early', label: 'Early breakfast', score: 4, cost: 200 }, { id: 'packed', label: 'Packed breakfasts', score: 2, cost: 80 }] }),
  ev('EV07', 'Food Weekend', [20, 50], [2, 2], [['F09', 'F25']], 6000, 75, 92, 'GT14', { q: 'A famous chef offers a surprise guest course. Let them cook?', options: [{ id: 'chef', label: 'Let the chef cook', score: 7, risk: { p: 0.3, score: -6 } }, { id: 'menu', label: 'Stick to the menu', score: 2 }] }),
  ev('EV08', 'Festival Stay', [30, 100], [2, 2], [ACTIVITY], 7500, 70, 90, 'GT08', { q: 'The headline act wants to play an hour longer. Let them?', options: [{ id: 'encore', label: 'Let them play on', score: 5, risk: { p: 0.3, score: -6 } }, { id: 'curfew', label: 'Keep the curfew', score: 1 }] }, { distinct: 2 }),
  ev('EV09', 'Corporate Retreat', [15, 40], [2, 2], [['F19']], 9000, 75, 92, 'GT07', { q: 'The CEO asks for a private dinner with the team. Lay one on?', options: [{ id: 'dinner', label: 'A private dinner', score: 5, cost: 600 }, { id: 'buffet', label: 'The usual buffet', score: 1 }] }, { roomRank: 6 }),
  ev('EV10', 'Film Shoot', [20, 50], [3, 3], [['F31']], 15000, 78, 94, 'GT18', { q: 'The director wants the pool closed to guests for a day. Agree?', options: [{ id: 'close', label: 'Close the pool for the shoot', score: 6, risk: { p: 0.2, score: -4 } }, { id: 'share', label: 'Share it with guests', score: 2 }] }, { rare: true }),
  ev('EV11', 'Celebrity Wedding', [40, 120], [3, 3], [['F32'], ['F29']], 28000, 82, 95, 'GT18', { q: 'Photographers are at the gate. Keep them out?', options: [{ id: 'security', label: 'Hire extra security', score: 5, cost: 2000 }, { id: 'photo', label: 'Allow one official photo', score: 4, risk: { p: 0.25, score: -8 } }, { id: 'ignore', label: 'Leave them be', score: 0, risk: { p: 0.5, score: -10 } }] }, { rare: true }),
  ev('EV12', 'International Summit', [80, 180], [3, 3], [['F32'], ['F29'], ['F31']], 45000, 85, 96, 'GT21', { q: 'Two delegations want the same suite. Who gets it?', options: [{ id: 'upgrade', label: 'Upgrade both (it costs)', score: 5, cost: 3000 }, { id: 'toss', label: 'First come, first served', score: 1, risk: { p: 0.3, score: -6 } }] }, { rare: true }),
];
export const eventById = (id) => EVENTS.find((e) => e.id === id) ?? null;

// Enquiries (Claude Code's picks): each Monday Morning (every 7th day) a seeded roll, ENQUIRY.chance × (1 + P06 EventWorks
// +12% enquiries, M22) — an enquiry for an event the resort can hold (its facilities built), weighted 10 (rare 1 × (1 +
// F31 Media Studio +20% + R24 +15%)). It is for a date 7–14 days ahead and waits 7 days for an answer.
export const ENQUIRY = { everyDays: 7, chance: 0.5, weight: 10, rareWeight: 1, ahead: [7, 14], waitDays: 7 };
// Results (bible §27J): under 50 a failure (REP loss); 50 to Success "completed with issues"; Success the full fee;
// Great Success +35% and a positive memory. Claude Code's picks: failure pays half the fee and costs REP 8; issues pay 80%.
export const RESULT = {
  fail: { id: 'fail', name: 'Failed', below: 50, feeShare: 0.5, rep: -8 },
  issues: { id: 'issues', name: 'Completed with issues', feeShare: 0.8, rep: 0 },
  success: { id: 'success', name: 'Success', feeShare: 1, rep: 25 }, // (M23: bible §27A — a successful normal event +25 REP, a rare one +60)
  great: { id: 'great', name: 'Great Success', feeShare: 1.35, rep: 25 },
};
export const RARE_REP = 60;
// Event score weights (bible §27J): 30% Service + 25% Food + 20% Activity / event delivery + 15% room group score + 10%
// venue condition − penalties. Costs (bible §27N): 18 Credits per attendee a day for food and service (× the food
// supply tier from M22).
export const SCORE_W = { service: 0.3, food: 0.25, delivery: 0.2, rooms: 0.15, venue: 0.1 };
export const PER_ATTENDEE_DAY = 18;
// Rocco Sparkle (chibi 03) hosts: one line to open each event, then the live choice (data/cast.js).
export const ROCCO = { name: 'Rocco Sparkle', art: 'cast_rocco' };
export const ROCCO_OPEN = ['Ladies and gentlemen, the {event} starts NOW!', 'Lights up! Welcome to the {event}!', 'Big smiles, everyone: the {event} is on!', 'Showtime! The {event} begins!'];
