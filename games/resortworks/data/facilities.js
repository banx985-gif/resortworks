// The 35 facilities (bible §20 / §27G): name, picture and the Lv1 effect in plain words (Milestone 12 lists them in Build
// Mode; Milestone 16 makes every effect work). Build numbers (cost, days, upkeep, stage, size) are in data/build.js.
// Plain data. art = assets/images/facilities/<art>.png.
const f = (id, name, line) => ({ id, name, art: `facility_${id.toLowerCase()}`, line });
export const FACILITY_INFO = Object.fromEntries(
  [
    f('F01', 'Reception Desk', 'Checks in two guests at the same time.'),
    f('F02', 'Motel Service Block', 'The staff rest point. Early service jobs are sent out 10% quicker.'),
    f('F03', 'Small Pool', 'Guests who swim here get +8 Activity.'),
    f('F04', 'Laundry Room', 'Washes 50 units of linen a day.'),
    f('F05', 'Maintenance Shed', 'Repairs are done 10% faster.'),
    f('F06', 'Snack Café', 'Serves 20 guests in each part of the day: +6 Food.'),
    f('F07', 'Parking Area', 'Room for 20 more guest arrivals a day.'),
    f('F08', 'Garden Strip', 'Makes everything within 4 tiles more appealing (+6 Appeal).'),
    f('F09', 'Restaurant', 'Serves 50 guests in each part of the day: +10 Food.'),
    f('F10', 'Kids Club', 'Looks after 20 children in each part of the day: +12 Activity for families.'),
    f('F11', 'Family Pool', '35 swimmers in each part of the day: +14 Activity for families.'),
    f('F12', 'Games Room', '24 players in each part of the day: +9 Activity.'),
    f('F13', 'Mini Golf', '20 players in each part of the day: +12 Activity.'),
    f('F14', 'Tour Desk', 'Opens 16 tour places a day.'),
    f('F15', 'Housekeeping Hub', 'Housekeepers lose 20% less time walking between rooms.'),
    f('F16', 'Gym', '25 guests in each part of the day: +10 Comfort and Activity.'),
    f('F17', 'Spa', '18 guests in each part of the day: +16 Comfort.'),
    f('F18', 'Sauna & Steam', '12 guests in each part of the day: +10 Comfort.'),
    f('F19', 'Event Hall', 'Holds events for up to 80 guests.'),
    f('F20', 'Wedding Lawn', 'Holds outdoor events for up to 100 guests.'),
    f('F21', 'Cinema', '60 guests in each part of the day: +12 Activity.'),
    f('F22', 'BBQ Terrace', 'Serves 40 guests in each part of the day: +10 Food and Activity.'),
    f('F23', 'Shuttle Stop', 'Long walks cost guests 35% less.'),
    f('F24', 'Gift Shop', 'Guests spend 8% more in the shops.'),
    f('F25', 'Premium Restaurant', 'Serves 60 guests in each part of the day: +18 Food.'),
    f('F26', 'Rooftop Lounge', '50 guests in each part of the day: +15 evening spend.'),
    f('F27', 'Private Cabanas', '20 guests in each part of the day: +14 Comfort for luxury guests.'),
    f('F28', 'Infinity Pool', '60 swimmers in each part of the day: +20 Appeal and Activity.'),
    f('F29', 'VIP Lounge', '30 guests in each part of the day: +18 Service for VIPs.'),
    f('F30', 'Luxury Spa', '30 guests in each part of the day: +22 Comfort.'),
    f('F31', 'Media & Event Studio', 'Rare events are 20% more likely.'),
    f('F32', 'Grand Ballroom', 'Holds events for up to 220 guests.'),
    f('F33', 'Signature Garden', 'Makes everything within 7 tiles more appealing (+18 Appeal).'),
    f('F34', 'Paradise Pavilion', 'Prestige guests +10 satisfaction.'),
    f('F35', 'Sky Retreat', 'Room for 25 more prestige guests; a secret event hub.'),
  ].map((x) => [x.id, x]),
);
export const facilityInfo = (id) => FACILITY_INFO[id] ?? null;

// --- Milestone 16: what each facility's Lv1 effect does (bible §27G), × LEVEL_MULT at Lv1 / Lv2 / Lv3 (×1.0 / ×1.5 / ×2.0).
//   cats   — stay categories it adds to: { cat, add, who? } (who: 'family' guests only, 'luxury' = guests in a Luxury Suite
//            or better); users = guests it serves each part of the day (more guests than that: each gets a share)
//   system — what it changes elsewhere (the system that reads it): desk (Reception check-in speed ×), routing (housekeeping
//            and maintenance walks ÷ (1 + n)), linen (linen a day ×), repair (the Shed's repair bonus ×), arrivals (arrivals
//            a day), hkTravel (housekeeping walks × (1 − n)), walkPenalty (the Convenience penalty × (1 − n)), appeal
//            (+ Resort Appeal, with radius: a view source too)
//   later  — a system that comes with a later milestone: stored now, works then ("works from M18" on its sheet)
// The shipped eight's Lv1 effects were already in the game (M1–M9): desk, linen, repair, the café's +6 Food, the pool's +8
// Activity, the Garden's +6 Appeal. M16 adds the Service Block's routing, Parking's arrivals and every level's multiplier.
export const LEVEL_MULT = [1, 1.5, 2];
export const FACILITY_FX = {
  F01: { system: { desk: 1 } },
  F02: { system: { routing: 0.1 } },
  F03: { cats: [{ cat: 'activities', add: 8 }] },
  F04: { system: { linen: 1 } },
  F05: { system: { repair: 1 } },
  F06: { cats: [{ cat: 'food', add: 6 }], users: 20 },
  F07: { system: { arrivals: 20 } },
  F08: { system: { appeal: 6, radius: 4 } },
  F09: { cats: [{ cat: 'food', add: 10 }], users: 50 },
  F10: { cats: [{ cat: 'activities', add: 12, who: 'family' }], users: 20 },
  F11: { cats: [{ cat: 'activities', add: 14, who: 'family' }], users: 35 },
  F12: { cats: [{ cat: 'activities', add: 9 }], users: 24 },
  F13: { cats: [{ cat: 'activities', add: 12 }], users: 20 },
  F14: { system: { tours: 16 } }, // (Milestone 18) tour places a day: a package's tours (src/systems/packages.js)
  F15: { system: { hkTravel: 0.2 } },
  F16: { cats: [{ cat: 'comfort', add: 10 }, { cat: 'activities', add: 10 }], users: 25 },
  F17: { cats: [{ cat: 'comfort', add: 16 }], users: 18 },
  F18: { cats: [{ cat: 'comfort', add: 10 }], users: 12 },
  F19: { later: 'M19', what: 'events for 80' },
  F20: { later: 'M19', what: 'outdoor events for 100' },
  F21: { cats: [{ cat: 'activities', add: 12 }], users: 60 },
  F22: { cats: [{ cat: 'food', add: 10 }, { cat: 'activities', add: 10 }], users: 40 },
  F23: { system: { walkPenalty: 0.35 } },
  F24: { system: { retail: 8 } }, // (Milestone 18) 8 Cr a guest each day (data/packages.js SPEND)
  F25: { cats: [{ cat: 'food', add: 18 }], users: 60 },
  F26: { users: 50, system: { evening: 15 } }, // (Milestone 18) +15 Cr evening spend a guest, up to 50 a part of the day
  F27: { cats: [{ cat: 'comfort', add: 14, who: 'luxury' }], users: 20 },
  F28: { cats: [{ cat: 'activities', add: 20 }], users: 60, system: { appeal: 20 } },
  F29: { users: 30, system: { vipService: 18 } }, // (Milestone 18) 30 places a part of the day (packages); its +18 VIP Service: M22
  F30: { cats: [{ cat: 'comfort', add: 22 }], users: 30 },
  F31: { later: 'M19', what: 'rare events +20%' },
  F32: { later: 'M19', what: 'events for 220' },
  F33: { system: { appeal: 18, radius: 7 } },
  F34: { later: 'M29', what: 'Prestige guests +10 satisfaction' },
  F35: { later: 'M29', what: 'Prestige guest cap +25' },
};
// Guests in a room of this rank or better count as 'luxury' (RM09 Luxury Suite and up).
export const LUXURY_RANK = 9;
