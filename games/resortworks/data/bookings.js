// Booking / room core numbers (Milestone 3, bible §9 / §10 / §27B / §27E / §27F). Plain data — src/systems/bookings.js
// runs it. Picks the bible leaves open are Cowork's (marked) or Claude Code's, and are logged in docs/DECISIONS.md.

// The two Roadside room types (bible §27E). cap = guests it sleeps; rate = base nightly rate in Credits (the Standard
// pricing band is 1.00×, so it is also the offer's rate until pricing bands arrive). Milestone 4: clean = base clean
// minutes (bible §27E); beds = bed spaces (linen: 2 units each, data/housekeeping.js).
export const ROOM_TYPES = {
  RM01: { id: 'RM01', name: 'Budget Room', cap: 2, rate: 70, rank: 1, clean: 35, beds: 2 },
  RM02: { id: 'RM02', name: 'Standard Room', cap: 2, rate: 105, rank: 2, clean: 40, beds: 2 },
};
export const PRICE_BAND = { id: 'standard', name: 'Standard', mult: 1.0 }; // bible §27E pricing band used for offers

// The Roadside guest types (Cowork's pick: all fit a 2-person room). budget / nights from bible §27F. party = people in
// the party; weight = share of offers; wants = chance of asking for each room type (Claude Code's pick from the budgets:
// a Road Trip Couple (95) or Solo Traveller (100) sits between the two rates; a Retired Couple (165) wants Standard).
// sprite = their walking picture (card), art = their sheet / offer picture.
export const GUEST_TYPES = {
  GT01: { id: 'GT01', name: 'Road Trip Couple', budget: 95, nights: [1, 2], party: 2, weight: 40, wants: { RM01: 0.55, RM02: 0.45 }, sprite: 'world_guest_adult_a', art: 'guest_gt01' },
  GT03: { id: 'GT03', name: 'Solo Traveller', budget: 100, nights: [1, 3], party: 1, weight: 35, wants: { RM01: 0.6, RM02: 0.4 }, sprite: 'world_guest_adult_b', art: 'guest_gt03' },
  GT04: { id: 'GT04', name: 'Retired Couple', budget: 165, nights: [3, 6], party: 2, weight: 25, wants: { RM01: 0.15, RM02: 0.85 }, sprite: 'world_guest_elder', art: 'guest_gt04' },
};

// Offers (Cowork's starting pick): 2–4 new offers each Morning, arriving today to +3 days. Unanswered offers expire at
// the end of the day.
export const OFFERS = { perMorning: [2, 4], arriveWithin: [0, 3] };

// Room states (bible §10). sellable = can be sold / assigned. Cleaning is used from M4 (src/systems/housekeeping.js);
// Maintenance waits for M7. colour = the code-drawn badge on the map.
export const ROOM_STATES = {
  ready: { id: 'ready', name: 'Ready', sellable: true, color: '#3E9B4F' },
  reserved: { id: 'reserved', name: 'Reserved', sellable: false, color: '#3A9BE0' },
  occupied: { id: 'occupied', name: 'Occupied', sellable: false, color: '#F07A5A' },
  dirty: { id: 'dirty', name: 'Dirty', sellable: false, color: '#9A6B3F' },
  cleaning: { id: 'cleaning', name: 'Cleaning', sellable: false, color: '#1FA3A0' },
  maintenance: { id: 'maintenance', name: 'Maintenance', sellable: false, color: '#7A7F86' },
};

// Auto Room Assignment (bible §27B): Fit = 35·typePreference + 20·capacityFit + 15·viewMatch + 10·noiseMatch +
// 10·distanceMatch + 10·priceFit, each 0–1. No view, noise or distance until M9: those three score a neutral 0.5.
export const FIT = {
  weights: { type: 35, capacity: 20, view: 15, noise: 10, distance: 10, price: 10 },
  neutral: 0.5, // view / noise / distance until M9
  // typePreference (Claude Code's pick): the type they asked for 1; one step better (an upgrade) 0.6; worse 0.2.
  type: { same: 1, upgrade: 0.6, downgrade: 0.2 },
  // capacityFit: a full room 1; each empty bed takes off half its share (1 person in a 2-bed room: 0.75).
  // priceFit: 1 − |room rate − guest budget| / budget (0 at most).
};

// The first booked guest of a new resort (Milestone 3: the M2 lone guest): a Road Trip Couple in Room 1, 2 nights.
export const FIRST_GUEST = { type: 'GT01', room: 'R1', nights: 2 };
