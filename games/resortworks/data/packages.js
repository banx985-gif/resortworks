// Packages (Milestone 18, bible §15 / §27I): a room plus inclusions at one fixed package price — the room's nightly rate
// at booking × the price multiplier, every night. Plain data — src/systems/packages.js runs it.
//   nights   the stay a package guest books (bible §27I; a range keeps the offer's own nights inside it)
//   mult     price multiplier on the included room's current nightly rate
//   incl     the inclusions (bible §27I "Required inclusions"): each is { id, name, facs, per, uses } — one of `facs` must
//            be built for the package to be on sale; each guest uses `uses` places of it each day of the stay (per: 'day')
//            or `uses` places in all, on the first days (per: 'stay'); no facs = nothing to reserve (late checkout, a
//            romance amenity — needs: { roomRank } = the room must be at least that rank). Places are reserved when the
//            booking is accepted (src/systems/packages.js PLACES), so a package can't be sold when they are full.
//   audience the guest types it is for (data/bookings.js tags): an offer from one of them picks it (PICK below)
//   demand   the demand effect while it is on sale (bible §27I): those guest types +pct (held within ±20% with every
//            other source, src/systems/guests.js)
// Claude Code's picks (DECISIONS M18): which tags each audience is, the facility each inclusion means, per day / per stay.
const dining = ['F25', 'F09', 'F22', 'F06']; // a meal: the best dining place with a place free first
const PRESTIGE_EXPERIENCES = ['F34', 'F35', 'F28', 'F30', 'F27']; // Paradise Pavilion, Sky Retreat, Infinity Pool, Luxury Spa, Cabanas
export const PACKAGES = [
  { id: 'PK01', name: 'Roadside Stop', nights: [1, 2], mult: 1.08, incl: [{ id: 'cafe', name: 'Snack Café credit', facs: ['F06'], per: 'stay', uses: 1 }], audience: ['roadtrip'], demand: 0.15, demandWords: 'Road Trip +15%' },
  { id: 'PK02', name: 'Weekend Escape', nights: [2, 2], mult: 1.2, incl: [{ id: 'meal', name: 'Restaurant meal', facs: ['F09', 'F25'], per: 'stay', uses: 1 }, { id: 'late', name: 'Late checkout', facs: null }], audience: ['couple'], demand: 0.12, demandWords: 'Couples +12%' },
  { id: 'PK03', name: 'Family Week', nights: [5, 5], mult: 1.25, incl: [{ id: 'kids', name: 'Kids Club', facs: ['F10'], per: 'day', uses: 1 }, { id: 'fpool', name: 'Family Pool', facs: ['F11'], per: 'day', uses: 1 }], audience: ['family'], demand: 0.18, demandWords: 'Families +18%' },
  { id: 'PK04', name: 'Adventure Break', nights: [3, 3], mult: 1.22, incl: [{ id: 'tour', name: 'Tour', facs: ['F14'], per: 'stay', uses: 1 }, { id: 'golf', name: 'Mini Golf', facs: ['F13'], per: 'day', uses: 1 }], audience: ['adventure'], demand: 0.18, demandWords: 'Adventure +18%' },
  { id: 'PK05', name: 'Wellness Retreat', nights: [4, 4], mult: 1.35, incl: [{ id: 'spa', name: 'Spa', facs: ['F17', 'F30'], per: 'day', uses: 1 }, { id: 'gym', name: 'Gym', facs: ['F16'], per: 'day', uses: 1 }, { id: 'healthy', name: 'Healthy meal', facs: dining, per: 'day', uses: 1 }], audience: ['wellness'], demand: 0.2, demandWords: 'Wellness +20%' },
  { id: 'PK06', name: 'Honeymoon Escape', nights: [4, 4], mult: 1.5, incl: [{ id: 'dinner', name: 'Premium dinner', facs: ['F25'], per: 'stay', uses: 1 }, { id: 'spa', name: 'Spa', facs: ['F17', 'F30'], per: 'stay', uses: 1 }, { id: 'romance', name: 'Romance amenity', facs: null, needs: { roomRank: 6 } }], audience: ['honeymoon'], demand: 0.22, demandWords: 'Honeymoon +22%' },
  { id: 'PK07', name: 'Wedding Weekend', nights: [2, 2], mult: 1.42, incl: [{ id: 'admit', name: 'Event admission', facs: ['F20', 'F19', 'F32'], per: 'stay', uses: 1 }, { id: 'banquet', name: 'Banquet', facs: ['F25', 'F09'], per: 'stay', uses: 1 }], audience: ['wedding'], demand: 0.2, demandWords: 'Wedding groups +20%' },
  { id: 'PK08', name: 'Conference Stay', nights: [2, 2], mult: 1.3, incl: [{ id: 'space', name: 'Event space', facs: ['F19', 'F32'], per: 'day', uses: 1 }, { id: 'catered', name: '2 catered meals', facs: dining, per: 'stay', uses: 2 }], audience: ['business'], demand: 0.18, demandWords: 'Conference +18%' },
  { id: 'PK09', name: 'Luxury Escape', nights: [3, 3], mult: 1.55, incl: [{ id: 'vip', name: 'VIP Lounge', facs: ['F29'], per: 'day', uses: 1 }, { id: 'premium', name: 'Premium dining', facs: ['F25'], per: 'day', uses: 1 }], audience: ['luxury'], demand: 0.2, demandWords: 'Luxury +20%' },
  { id: 'PK10', name: 'Paradise Week', nights: [7, 7], mult: 1.85, incl: [{ id: 'exp', name: '3 prestige experiences', facs: PRESTIGE_EXPERIENCES, per: 'stay', uses: 3, distinct: 3 }, { id: 'vipsvc', name: 'VIP service', facs: ['F29'], per: 'day', uses: 1 }], audience: ['prestige'], demand: 0.25, demandWords: 'Prestige +25%' },
].map((p) => ({ ...p, art: `package_${p.id.toLowerCase()}` }));
export const packageById = (id) => PACKAGES.find((p) => p.id === id) ?? null;

// An offer from a package's audience picks it (when it is on sale and its places are free on their dates) with chance
// base × (1 + R32 Package Marketing + the team's upsell): Claude Code's pick 0.4. Several fit: the dearest first.
export const PICK = { base: 0.4 };
// Places a day for package guests: the facility's guests a part of the day (bible §27G users/band, × level, × R07 / R23
// / the team's traits), the Tour Desk's 16 tour places a day (× R21 Tours & Excursions +25%), an event venue's capacity
// (80 / 100 / 220). A facility not in this list has no places to give (it can't be an inclusion).
export const VENUE_CAP = { F19: 80, F20: 100, F32: 220 };
export const TOUR_PLACES = { F14: 16 };

// (Milestone 18) food and the other places guests spend in (Claude Code's picks, bible §26 "food/drink, activities,
// retail"): each guest staying spends this at the place each day it is open, up to its covers / users a part of the day.
// The Snack Café's 12 is M6's. Gift Shop: retail (bible "+8%" read as 8 Cr a guest). Rooftop Lounge: +15 evening spend a
// guest (§27G), up to its users.
export const SPEND = { F06: 12, F09: 22, F22: 18, F25: 40, F24: 8, F26: 15 };
export const SPEND_LINE = { F06: 'cafe', F09: 'dining', F22: 'dining', F25: 'dining', F24: 'retail', F26: 'evening' };
// Dining (the evening band): every food place's covers — more guests than all of them together is a queue (the slow-food
// complaint, M7); R08 Service Flow cuts the wait 12% (the queue counts 12% fewer).
export const DINING_IDS = ['F06', 'F09', 'F22', 'F25'];
