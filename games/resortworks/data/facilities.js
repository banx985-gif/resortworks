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
