// Complaints / recovery numbers (Milestone 7, bible §18 / §27A / §27F / §27P). Plain data — src/systems/complaints.js
// runs it. Picks the bible leaves open are Cowork's (M7 card) or Claude Code's, and are logged in docs/DECISIONS.md.

// The complaint types (bible §18). on: can happen today (noise, breakdown and package failure wait for M9 / M8 / M18).
// severity: the trigger's weight — the chance a trigger becomes a complaint is (100 − Patience) / 100 × severity (Patience:
// data/bookings.js GUEST_TYPES, bible §27F). Tuned (M7 card): the card's 1.0 / 0.8 / 0.6 / 0.5 / 0.5 gave 1 complaint
// every 23 stays in a 90-day Standard-price run, so every severity is halved (same order): 1 every ~40 (bible §27P: 30–60).
// category: the stay category whose loss a recovery cancels. best: the "best fit" recovery actions (a small hint in the
// sheet, +25 to the success chance).
export const COMPLAINT_TYPES = {
  late: { id: 'late', on: true, severity: 0.5, category: 'service', best: ['apology', 'roomChange'], name: 'Late room', line: 'Their room wasn’t ready. They waited at Reception.' },
  clean: { id: 'clean', on: true, severity: 0.4, category: 'clean', best: ['roomChange'], name: 'Not clean enough', line: 'Their room was short on fresh linen.' },
  queue: { id: 'queue', on: true, severity: 0.3, category: 'service', best: ['apology'], name: 'Slow check-in', line: 'They queued too long at the front desk.' },
  value: { id: 'value', on: true, severity: 0.25, category: 'value', best: ['refund'], name: 'Too pricey', line: 'They think the room costs too much for what it is.' },
  food: { id: 'food', on: true, severity: 0.25, category: 'food', best: ['comp'], name: 'Slow café', line: 'The café was too busy to serve them.' },
  noise: { id: 'noise', on: false, from: 'M9', severity: 0.3, category: 'comfort', best: ['roomChange'], name: 'Too noisy', line: 'It was too noisy to sleep.' },
  breakdown: { id: 'breakdown', on: false, from: 'M8', severity: 0.4, category: 'room', best: ['maintenance'], name: 'Something broke', line: 'Something in their room broke.' },
  package: { id: 'package', on: false, from: 'M18', severity: 0.35, category: 'activities', best: ['refund', 'vip'], name: 'Package let them down', line: 'Their package wasn’t what they paid for.' },
};
export const COMPLAINT_IDS = Object.keys(COMPLAINT_TYPES);

// What sets each trigger off (M7 card):
//   lateMinutes   waited this many game minutes at Reception for a late room (M4)
//   queueMinutes  waited this many game minutes at the front desk to check in (the Front Office person busy or off shift)
//   valueOver     nightly rate more than this share over the guest type's budget
//   food          more guests in the café in its band (Evening, the dining band) than its covers (bible §27G: F06 20)
export const TRIGGERS = { lateMinutes: 30, queueMinutes: 20, valueOver: 0.1, food: { facility: 'F06', covers: 20, band: 'evening' } };

// The front desk (Claude Code's pick, for the queue trigger): one check-in takes the Front Office person checkInMinutes;
// parties arriving together queue one after another. With the Front Office person off shift, a party waits offShiftWait
// game minutes for someone to come to the desk. A party with priority service never queues. The desk is worked out
// alongside the stays (the check-in itself and the walkers keep their M3 / M4 timing).
export const DESK = { role: 'FO', checkInMinutes: 8, offShiftWait: 30 };

// The recovery actions (bible §18). on: works today (maintenance priority waits for M8, VIP escalation for later).
export const ACTIONS = {
  apology: { id: 'apology', on: true, name: 'Apology & priority service', line: 'Say sorry. Their next check-in or clean jumps the queue.', free: true },
  roomChange: { id: 'roomChange', on: true, name: 'Room change', line: 'Move them to a Ready room as good or better.' },
  comp: { id: 'comp', on: true, name: 'Comped café meal', line: 'A free café meal for the party.', perGuest: 12, ledger: 'comps' },
  refund: { id: 'refund', on: true, name: 'Partial refund', line: 'A quarter of one night’s rate back.', share: 0.25, ledger: 'refunds' },
  maintenance: { id: 'maintenance', on: false, from: 'M8', name: 'Maintenance priority', line: 'Send Maintenance first.' },
  vip: { id: 'vip', on: false, from: 'later', name: 'VIP escalation', line: 'The manager looks after them in person.' },
};
export const ACTION_IDS = Object.keys(ACTIONS);

// The recovery result (Cowork's starting numbers, M7 card): success chance = base + (Front Office Service − pivot) +
// bestFit if a best-fit action − perBand per band waited, clamped min–max, rolled from the run's seed. Success: that
// category's loss is cancelled and the stay gets a Recovery Bonus of +bonus final satisfaction (+sameBand more if fixed in
// the band the complaint came in). Fail: fail final satisfaction; a complaint can be tried `tries` times in all.
export const RECOVERY = { role: 'FO', stat: 'service', base: 50, pivot: 50, bestFit: 25, perBand: 10, min: 5, max: 95, bonus: 8, sameBand: 4, fail: -5, tries: 2 };

// Bible §27A: a complaint still unresolved at check-out costs REP.
export const REP_UNRESOLVED = -5;

// The review comment's extra line (M7 card: an unresolved complaint is mentioned; a recovered one too).
export const COMPLAINT_TEXT = {
  unresolved: ['We complained and nobody sorted it out.', 'Nobody fixed our complaint.'],
  recovered: ['Something went wrong, but they fixed it brilliantly.', 'They sorted our problem out fast. Great service!'],
};

// The memory a recovered stay is marked with (M20 Guestbook uses it later).
export const SAVED_MEMORY = 'Saved by great service';

// How many finished complaints the save keeps for the list (open ones are always kept).
export const HISTORY_MAX = 40;
