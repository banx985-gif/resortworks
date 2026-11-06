// Research — 36 projects (Milestone 17, bible §22 / §27H): six branches of six tiers. Plain data — src/systems/research.js
// runs it. The bible's numbers are exact; picks it leaves open are Cowork's (marked) or Claude Code's (DECISIONS).

// Tier cost (Credits, paid when the project starts) and length (game days), bible §27H.
export const TIERS = { 1: { cost: 1500, days: 14 }, 2: { cost: 3000, days: 21 }, 3: { cost: 6000, days: 28 }, 4: { cost: 12000, days: 42 }, 5: { cost: 24000, days: 56 }, 6: { cost: 48000, days: 84 } };
// One project at a time; up to 3 more wait in the queue (Cowork's pick). A project needs the tier before it in its branch.
export const QUEUE = { size: 3 };

export const BRANCHES = [
  { id: 'acc', name: 'Accommodation', color: '#3A9BE0' },
  { id: 'hos', name: 'Hospitality', color: '#F07A5A' },
  { id: 'gs', name: 'Guest Services', color: '#1FA3A0' },
  { id: 'ent', name: 'Entertainment', color: '#E0508A' },
  { id: 'ops', name: 'Operations', color: '#3E9B4F' },
  { id: 'mkt', name: 'Marketing & Prestige', color: '#D9A43A' },
];

// fx: what it does (src/systems/research.js rx(key) adds them up over the projects done) — key, value; later: the milestone
// whose system it needs (kept now, works then). line = the bible's exact effect in plain words.
const r = (id, branch, name, tier, line, fx = null, later = null) => ({ id, branch, name, tier, line, fx, later, art: `research_${id.toLowerCase()}` });
export const RESEARCH = [
  r('R01', 'acc', 'Room Standards', 1, '+4 Room score in every room', { key: 'roomScore', v: 4 }),
  r('R02', 'acc', 'Better Bedding', 2, '+6 Comfort from beds', { key: 'bedComfort', v: 6 }),
  r('R03', 'acc', 'Bathroom Upgrade', 3, '+6 Room score and +3 to the Clean cap', [{ key: 'roomScore', v: 6 }, { key: 'cleanCap', v: 3 }]),
  r('R04', 'acc', 'View Design', 4, 'View bonuses +25%', { key: 'view', v: 0.25 }),
  r('R05', 'acc', 'Luxury Amenities', 5, '+8 satisfaction from amenities in Premium and luxury rooms', { key: 'amenity', v: 8 }),
  r('R06', 'acc', 'Signature Suites', 6, 'Unlocks the Presidential Retreat; +5 Room score in luxury rooms', [{ key: 'unlockRM12', v: 1 }, { key: 'luxRoom', v: 5 }]),
  r('R07', 'hos', 'Kitchen Basics', 1, 'Food places serve 10% more guests', { key: 'foodThroughput', v: 0.1 }),
  r('R08', 'hos', 'Service Flow', 2, 'Dining waits −12%', { key: 'diningWait', v: 0.12 }, 'M18'),
  r('R09', 'hos', 'Menu Variety', 3, '+5 Food score; foodie demand +5%', [{ key: 'food', v: 5 }, { key: 'foodieDemand', v: 0.05, later: 'M18' }]),
  r('R10', 'hos', 'Banquet Service', 4, 'Event catering score +10%', { key: 'eventCatering', v: 0.1 }, 'M19'),
  r('R11', 'hos', 'Fine Dining', 5, '+8 Food at the Premium Restaurant', { key: 'premiumFood', v: 8 }),
  r('R12', 'hos', 'Signature Cuisine', 6, 'Dining memories +10%', { key: 'diningMemory', v: 0.1 }, 'M20'),
  r('R13', 'gs', 'Check-In Flow', 1, 'Reception check-ins +15% faster', { key: 'reception', v: 0.15 }),
  r('R14', 'gs', 'Complaint Recovery', 2, 'Complaint recovery +10%', { key: 'recovery', v: 0.1 }),
  r('R15', 'gs', 'Concierge Service', 3, '+8 Service for concierge and VIP guests', { key: 'vipService', v: 8 }, 'M22'),
  r('R16', 'gs', 'Repeat Guest CRM', 4, 'Repeat guests +20% (relative)', { key: 'repeat', v: 0.2 }, 'M20'),
  r('R17', 'gs', 'VIP Protocol', 5, 'Prestige / VIP expectation penalty −8%', { key: 'vipExpect', v: 0.08 }, 'M22'),
  r('R18', 'gs', 'Perfect Stay', 6, 'The unresolved-service penalty is 20% smaller', { key: 'unresolvedCut', v: 0.2 }),
  r('R19', 'ent', 'Pool Programming', 1, '+5 Activity for pool users', { key: 'poolActivity', v: 5 }),
  r('R20', 'ent', 'Family Activities', 2, '+8 satisfaction for families', { key: 'familySat', v: 8 }),
  r('R21', 'ent', 'Tours & Excursions', 3, 'Tour places +25%; adventure demand +8%', { key: 'tours', v: 0.25 }, 'M18'),
  r('R22', 'ent', 'Events', 4, 'Event score +6', { key: 'eventScore', v: 6 }, 'M19'),
  r('R23', 'ent', 'Night Entertainment', 5, 'Evening places serve 15% more guests', { key: 'eveningThroughput', v: 0.15 }),
  r('R24', 'ent', 'Prestige Experiences', 6, 'Prestige events +15%', { key: 'prestigeEvents', v: 0.15 }, 'M19'),
  r('R25', 'ops', 'Laundry Systems', 1, 'Laundry +20% linen', { key: 'laundry', v: 0.2 }),
  r('R26', 'ops', 'Preventive Maintenance', 2, 'Breakdowns −15% (relative)', { key: 'breakdown', v: 0.15 }),
  r('R27', 'ops', 'Energy Efficiency', 3, 'Utilities cost −12%', { key: 'utilities', v: 0.12 }),
  r('R28', 'ops', 'Housekeeping Routing', 4, 'Housekeeping walks −15%', { key: 'hkTravel', v: 0.15 }),
  r('R29', 'ops', 'Supply Quality', 5, 'Quality supplies’ extra cost −15%', { key: 'qualitySupplies', v: 0.15 }, 'M22'),
  r('R30', 'ops', 'Smart Resort', 6, 'All routine service jobs 5% faster', { key: 'routine', v: 0.05 }),
  r('R31', 'mkt', 'Local Ads', 1, 'Booking demand +6%', { key: 'demand', v: 0.06 }),
  r('R32', 'mkt', 'Package Marketing', 2, 'Unlocks Auto Accept; package demand +8%', [{ key: 'autoAccept', v: 1 }, { key: 'packageDemand', v: 0.08, later: 'M18' }]),
  r('R33', 'mkt', 'Partner Network', 3, 'Partner offers come back 25% sooner', { key: 'partnerCooldown', v: 0.25 }, 'M22'),
  r('R34', 'mkt', 'Influencer Strategy', 4, 'Celebrity and influencer guests +15%', { key: 'celebrity', v: 0.15 }, 'M22'),
  r('R35', 'mkt', 'Global Campaign', 5, 'International and luxury demand +10%', { key: 'luxDemand', v: 0.1 }, 'M22'),
  r('R36', 'mkt', 'World Prestige', 6, 'Prestige from first-time sources +20% (not repeats)', { key: 'prestigeFirst', v: 0.2 }, 'M23'),
];
export const researchById = (id) => RESEARCH.find((x) => x.id === id) ?? null;
// The places that count as pools (R19) and evening places (R23), and the luxury / premium room ranks (R05, R06).
export const POOL_IDS = ['F03', 'F11', 'F28'];
export const EVENING_IDS = ['F21', 'F22', 'F26'];
export const PREMIUM_RANK = 6;
// research_r01–r05 are marked "to redo" in assets/ART_STATUS.md: they draw a code-made placeholder (branch colour + number)
// until Aaron's new files are added to data/assets.js.
export const ART_REDO = ['R01', 'R02', 'R03', 'R04', 'R05'];
