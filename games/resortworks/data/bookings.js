// Booking / room core numbers (Milestone 3, bible §9 / §10 / §27B / §27E / §27F). Plain data — src/systems/bookings.js
// runs it. Picks the bible leaves open are Cowork's (marked) or Claude Code's, and are logged in docs/DECISIONS.md.

// The two Roadside room types (bible §27E). cap = guests it sleeps; rate = base nightly rate in Credits (the Standard
// pricing band is 1.00×, so it is also the offer's rate until pricing bands arrive). Milestone 4: clean = base clean
// minutes (bible §27E); beds = bed spaces (linen: 2 units each, data/housekeeping.js).
// (Milestone 15) all twelve (bible §27E: capacity, base rate, clean minutes; build cost / upkeep / stage in data/build.js
// and data/finance.js). rank = the order of their base rates (an "upgrade" in Fit is a higher rank); beds = one linen bed
// space a guest it sleeps (the Roadside pair keep their 2).
export const ROOM_TYPES = {
  RM01: { id: 'RM01', name: 'Budget Room', cap: 2, rate: 70, rank: 1, clean: 35, beds: 2 },
  RM02: { id: 'RM02', name: 'Standard Room', cap: 2, rate: 105, rank: 2, clean: 40, beds: 2 },
  RM03: { id: 'RM03', name: 'Family Room', cap: 4, rate: 155, rank: 3, clean: 55, beds: 4 },
  RM04: { id: 'RM04', name: 'Garden Room', cap: 2, rate: 175, rank: 4, clean: 45, beds: 2 },
  RM05: { id: 'RM05', name: 'Poolside Room', cap: 4, rate: 210, rank: 5, clean: 55, beds: 4 },
  RM06: { id: 'RM06', name: 'Premium Room', cap: 2, rate: 275, rank: 6, clean: 50, beds: 2 },
  RM07: { id: 'RM07', name: 'Family Suite', cap: 5, rate: 345, rank: 7, clean: 70, beds: 5 },
  RM08: { id: 'RM08', name: 'Spa Suite', cap: 2, rate: 390, rank: 8, clean: 55, beds: 2 },
  RM09: { id: 'RM09', name: 'Luxury Suite', cap: 2, rate: 540, rank: 9, clean: 60, beds: 2 },
  RM10: { id: 'RM10', name: 'Private Villa', cap: 4, rate: 720, rank: 10, clean: 80, beds: 4 },
  RM11: { id: 'RM11', name: 'Honeymoon Villa', cap: 2, rate: 840, rank: 11, clean: 70, beds: 2 },
  RM12: { id: 'RM12', name: 'Presidential Retreat', cap: 6, rate: 1350, rank: 12, clean: 110, beds: 6 },
};
// (Milestone 15) rooms by level and use (bible §27E; Cowork's "Loved" numbers, Kairosoft rule 6):
//   Lv2 / Lv3: +8 Room score each and +10% on the rate ceiling each (the room's nightly rate and what guests think is
//   fair both rise by it — Claude Code's reading of "rate ceiling"). Loved: each stay of 4★ or more gives the room a point;
//   at 25 / 75 / 150 points it has +2 / +4 / +6 Room score (capped at +6), shown as a small heart on the map.
export const ROOM_LEVEL = { score: 8, rate: 0.1 };
export const LOVED = { minStars: 4, steps: [{ at: 25, add: 2 }, { at: 75, add: 4 }, { at: 150, add: 6 }] };
// (Milestone 15) capacity rules (bible §27B): a party must fit one room (Claude Code's pick: splitting a group across rooms
// is the World-Class "group allocation" unlock, so no party splits before it); a family needs a room for 4 or more.
export const CAPACITY = { familyMin: 4, splitStage: 'worldclass' };
export const PRICE_BAND = { id: 'standard', name: 'Standard', mult: 1.0 }; // bible §27E pricing band used for offers

// The Roadside guest types (Cowork's pick: all fit a 2-person room). budget / nights from bible §27F. party = people in
// the party; weight = share of offers; wants = chance of asking for each room type (Claude Code's pick from the budgets:
// a Road Trip Couple (95) or Solo Traveller (100) sits between the two rates; a Retired Couple (165) wants Standard).
// sprite = their walking picture (card), art = their sheet / offer picture. (Milestone 7) patience = bible §27F Patience
// (0–100): how likely a trigger is to become a complaint (data/complaints.js). (Milestone 9) noise = bible §27F Noise
// tolerance (0–100): noise over half of it costs Comfort, over all of it is a noise trigger (data/layout.js).
export const GUEST_TYPES = {
  GT01: { id: 'GT01', name: 'Road Trip Couple', budget: 95, patience: 55, noise: 60, nights: [1, 2], party: 2, weight: 40, wants: { RM01: 0.55, RM02: 0.45 }, sprite: 'world_guest_adult_a', art: 'guest_gt01' },
  GT03: { id: 'GT03', name: 'Solo Traveller', budget: 100, patience: 60, noise: 50, nights: [1, 3], party: 1, weight: 35, wants: { RM01: 0.6, RM02: 0.4 }, sprite: 'world_guest_adult_b', art: 'guest_gt03' },
  GT04: { id: 'GT04', name: 'Retired Couple', budget: 165, patience: 70, noise: 30, nights: [3, 6], party: 2, weight: 25, wants: { RM01: 0.15, RM02: 0.85 }, sprite: 'world_guest_elder', art: 'guest_gt04', tags: ['couple', 'quiet'] },
};
GUEST_TYPES.GT01.tags = ['couple', 'roadtrip'];
GUEST_TYPES.GT03.tags = ['solo'];
// (Milestone 18) the other 21 guest types (bible §9 / §27F: budget, patience, noise tolerance, nights). They come once the
// resort has reached their stage (data/build.js STAGES) and has what draws them (needs: one of these facilities built), and
// only when a room they fit is built (src/systems/guests.js). wants: null = worked out from the rooms built — each room type
// they fit, weighted by how close its rate is to their budget. Claude Code's picks (DECISIONS M18): party (a family or a
// group booking is 4 people in one room; groups bigger than a room are M19 events), weight, stage, needs, tags (what
// packages, themes, partners and awards read) and the walking picture.
const gt = (id, name, budget, patience, noise, nights, party, weight, stage, tags, extra = {}) => ({ id, name, budget, patience, noise, nights, party, weight, stage, tags, wants: null, sprite: extra.sprite ?? 'world_guest_adult_a', art: `guest_${id.toLowerCase()}`, ...extra });
Object.assign(GUEST_TYPES, {
  GT02: gt('GT02', 'Budget Family', 130, 50, 65, [2, 4], 4, 25, 'holiday', ['family'], { family: true, sprite: 'world_guest_child' }),
  GT05: gt('GT05', 'Young Couple', 190, 60, 55, [2, 4], 2, 22, 'holiday', ['couple', 'romance']),
  GT06: gt('GT06', 'Family Holiday', 220, 55, 65, [4, 7], 4, 18, 'holiday', ['family'], { family: true, sprite: 'world_guest_child' }),
  GT07: gt('GT07', 'Business Traveller', 210, 45, 25, [1, 3], 1, 15, 'holiday', ['business', 'solo'], { sprite: 'world_guest_adult_b' }),
  GT08: gt('GT08', 'Tour Group', 145, 50, 70, [2, 4], 4, 10, 'holiday', ['group', 'adventure'], { sprite: 'world_guest_group_proxy' }),
  GT09: gt('GT09', 'Sports Team', 170, 55, 75, [2, 5], 4, 8, 'destination', ['group', 'sport', 'adventure'], { needs: ['F16'], sprite: 'world_guest_group_proxy' }),
  GT10: gt('GT10', 'Wedding Party', 260, 45, 70, [2, 4], 4, 8, 'destination', ['group', 'wedding', 'romance', 'event', 'night'], { needs: ['F19', 'F20'], sprite: 'world_guest_group_proxy' }),
  GT11: gt('GT11', 'Honeymoon Couple', 420, 70, 20, [3, 7], 2, 8, 'destination', ['couple', 'romance', 'honeymoon', 'quiet']),
  GT12: gt('GT12', 'Wellness Guest', 360, 75, 20, [3, 7], 1, 10, 'destination', ['wellness', 'solo', 'quiet'], { needs: ['F16', 'F17', 'F18'], sprite: 'world_guest_adult_b' }),
  GT13: gt('GT13', 'Adventure Guest', 280, 60, 60, [2, 5], 2, 10, 'destination', ['adventure'], { needs: ['F13', 'F14'] }),
  GT14: gt('GT14', 'Foodie Couple', 340, 65, 45, [2, 4], 2, 10, 'destination', ['couple', 'foodie'], { needs: ['F09', 'F22', 'F25'] }),
  GT15: gt('GT15', 'Conference Group', 300, 40, 55, [2, 5], 2, 8, 'destination', ['business', 'event', 'group'], { needs: ['F19'], sprite: 'world_guest_adult_b' }),
  GT16: gt('GT16', 'Luxury Couple', 650, 75, 20, [3, 6], 2, 10, 'luxury', ['couple', 'luxury', 'quiet'], { sprite: 'world_guest_vip' }),
  GT17: gt('GT17', 'Luxury Family', 780, 65, 35, [4, 7], 4, 8, 'luxury', ['family', 'luxury'], { family: true, sprite: 'world_guest_vip' }),
  GT18: gt('GT18', 'Celebrity Guest', 1000, 50, 15, [2, 5], 2, 3, 'luxury', ['luxury', 'prestige', 'vip', 'celebrity', 'night'], { sprite: 'world_guest_vip' }),
  GT19: gt('GT19', 'Famous Athlete', 850, 55, 25, [2, 4], 1, 3, 'luxury', ['luxury', 'prestige', 'vip', 'sport', 'celebrity'], { needs: ['F16'], sprite: 'world_guest_vip' }),
  GT20: gt('GT20', 'Mystery Critic', 500, 70, 35, [1, 3], 1, 3, 'destination', ['critic', 'solo'], { sprite: 'world_guest_adult_b' }),
  GT21: gt('GT21', 'Royal-Style VIP', 1300, 65, 10, [2, 5], 2, 2, 'worldclass', ['luxury', 'prestige', 'vip'], { sprite: 'world_guest_vip' }),
  GT22: gt('GT22', 'Billionaire Eccentric', 1600, 45, 40, [3, 7], 2, 2, 'worldclass', ['luxury', 'prestige', 'vip'], { sprite: 'world_guest_vip' }),
  GT23: gt('GT23', 'Legendary Travel Writer', 700, 80, 30, [3, 5], 1, 2, 'luxury', ['critic', 'prestige'], { sprite: 'world_guest_adult_b' }),
  GT24: gt('GT24', 'Paradise Guest', 2000, 85, 10, [7, 7], 2, 2, 'prestige', ['luxury', 'prestige', 'vip', 'quiet'], { needs: ['F34'], sprite: 'world_guest_vip' }),
});
for (const t of Object.values(GUEST_TYPES)) {
  t.stage ??= 'roadside';
  t.tags ??= [];
}
export const GUEST_IDS = Object.keys(GUEST_TYPES).sort();

// Offers (Cowork's starting pick): 2–4 new offers each Morning, arriving today to +3 days. Unanswered offers expire at
// the end of the day.
export const OFFERS = { perMorning: [2, 3], arriveWithin: [0, 3] }; // (M12: 2–3, was 2–4 — rooms now held from the arrival day, see DECISIONS)

// Room states (bible §10). sellable = can be sold / assigned. Cleaning is used from M4 (src/systems/housekeeping.js);
// Maintenance from M8 (a broken room, src/systems/maintenance.js). colour = the code-drawn badge on the map.
export const ROOM_STATES = {
  ready: { id: 'ready', name: 'Ready', sellable: true, color: '#3E9B4F' },
  reserved: { id: 'reserved', name: 'Reserved', sellable: false, color: '#3A9BE0' },
  occupied: { id: 'occupied', name: 'Occupied', sellable: false, color: '#F07A5A' },
  dirty: { id: 'dirty', name: 'Dirty', sellable: false, color: '#9A6B3F' },
  cleaning: { id: 'cleaning', name: 'Cleaning', sellable: false, color: '#1FA3A0' },
  maintenance: { id: 'maintenance', name: 'Maintenance', sellable: false, color: '#7A7F86' },
};

// Auto Room Assignment (bible §27B): Fit = 35·typePreference + 20·capacityFit + 15·viewMatch + 10·noiseMatch +
// 10·distanceMatch + 10·priceFit, each 0–1. Milestone 9: view, noise and distance come from the layout
// (src/systems/layout.js); without one (older tests) they score a neutral 0.5.
export const FIT = {
  weights: { type: 35, capacity: 20, view: 15, noise: 10, distance: 10, price: 10 },
  neutral: 0.5, // view / noise / distance with no layout attached
  // typePreference (Claude Code's pick): the type they asked for 1; one step better (an upgrade) 0.6; worse 0.2.
  type: { same: 1, upgrade: 0.6, downgrade: 0.2 },
  // capacityFit: a full room 1; each empty bed takes off half its share (1 person in a 2-bed room: 0.75).
  // priceFit: 1 − |room rate − guest budget| / budget (0 at most).
};

// The first booked guest of a new resort (Milestone 3: the M2 lone guest): a Road Trip Couple in Room 1, 2 nights.
export const FIRST_GUEST = { type: 'GT01', room: 'R1', nights: 2 };
