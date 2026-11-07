// Visible achievements (Milestone 26, bible §28): the 40 names are the bible's; what unlocks each (a fact from the resort's
// systems, src/systems/achievements.js) and the counters are Claude Code's picks (DECISIONS M26). Plain data for
// core/AchievementSystem: { id, name, text, requires: { fact, op, value } (or all / any), progress?: { fact, target } }.
// They are account-wide (kept in the account store, never lost with a slot). Every check runs on 'tick' (each band edge
// and the moments that matter). Reward: REP +20 in the run that unlocks it; the ten marked big also give a Staff Item
// (the items' achievement source). No secret recipes (M27).
const a = (id, name, text, requires, extra = {}) => ({ id, name, text, requires, triggerEvents: ['tick'], ...extra });
const gte = (fact, value) => ({ fact, op: 'gte', value });
const eq = (fact, value) => ({ fact, op: 'eq', value });
const has = (fact, value) => ({ fact, op: 'has', value });
export const ACHIEVEMENTS = [
  a('ACH01', 'First Check-In', 'Check in your first booked guest.', gte('checkIns', 2)), // (the motel's first guest came with it: the 2nd check-in is the first the player booked)
  a('ACH02', 'Full House', 'Every room occupied on one night.', gte('fullNights', 1)),
  a('ACH03', 'Five Stars', 'Reach a 5★ rating.', gte('bestStars', 5), { big: true }),
  a('ACH04', 'No Vacancy', 'Every room occupied 7 nights in a row.', gte('fullStreakBest', 7), { progress: { fact: 'fullStreakBest', target: 7 } }),
  a('ACH05', 'Clean Sweep', 'A month of 20+ stays, every one scoring Clean 80 or more.', gte('cleanMonths', 1)),
  a('ACH06', 'Perfect Recovery', 'A guest who complained, put right, leaves 5★.', gte('perfectRecoveries', 1)),
  a('ACH07', 'Repeat Business', '10 returning guests.', gte('returns', 10), { progress: { fact: 'returns', target: 10 } }),
  a('ACH08', 'Family Favourite', 'Win the Family Favourite award.', has('awardsWon', 'AWR03')),
  a('ACH09', 'Wedding Season', '3 weddings held to Success or better.', gte('weddings', 3), { progress: { fact: 'weddings', target: 3 } }),
  a('ACH10', 'Conference King', '5 conferences or summits held to Success or better.', gte('conferences', 5), { progress: { fact: 'conferences', target: 5 } }),
  a('ACH11', 'Food Destination', 'Food Destination theme at 75 or more.', gte('theme.TH08', 75)),
  a('ACH12', 'Spa Life', '30 wellness stays at 85+.', gte('spaStays', 30), { progress: { fact: 'spaStays', target: 30 } }),
  a('ACH13', 'Roadside No More', 'Reach the Holiday Lodge stage.', gte('stageIndex', 1)),
  a('ACH14', 'Destination', 'Reach the Destination Resort stage.', gte('stageIndex', 2)),
  a('ACH15', 'Luxury', 'Reach the Luxury Retreat stage.', gte('stageIndex', 3), { big: true }),
  a('ACH16', 'World Class', 'Reach the World-Class Resort stage.', gte('stageIndex', 4), { big: true }),
  a('ACH17', 'First Award', 'Win any award.', gte('awardCount', 1)),
  a('ACH18', 'Crown Winner', 'Win the Global Destination Crown.', has('awardsWon', 'AWR10'), { big: true }),
  a('ACH19', 'VIP Visit', 'Host a VIP guest.', gte('vipStays', 1)),
  a('ACH20', 'Celebrity Weekend', 'A Celebrity Guest leaves at 90+.', gte('celebrity90', 1)),
  a('ACH21', 'Legendary Staff', 'Hire a Legendary staff member.', gte('legendaryHired', 1), { big: true }),
  a('ACH22', 'Secret Staff', 'Hire a Secret staff member.', gte('secretHired', 1)),
  a('ACH23', 'Signature Resort', 'Choose a Signature identity.', eq('signature', true), { big: true }),
  a('ACH24', 'Package Master', 'Sell every one of the 10 packages.', gte('packageKinds', 10), { progress: { fact: 'packageKinds', target: 10 } }),
  a('ACH25', 'All Rooms', 'Have all 12 room types built at once.', gte('roomKinds', 12), { progress: { fact: 'roomKinds', target: 12 } }),
  a('ACH26', 'All Facilities', 'Have all 33 visible facilities built at once.', gte('facilityKinds', 33), { progress: { fact: 'facilityKinds', target: 33 }, big: true }),
  a('ACH27', 'Research Master', 'Finish all 36 research projects.', gte('researchDone', 36), { progress: { fact: 'researchDone', target: 36 }, big: true }),
  a('ACH28', 'Perfect Event', 'An event scoring 95 or more.', gte('bestEvent', 95)),
  a('ACH29', 'No Breakdowns', 'A whole year (336 days) without a breakdown.', gte('daysNoBreakdown', 336), { progress: { fact: 'daysNoBreakdown', target: 336 } }),
  a('ACH30', 'Quiet Luxury', '10 luxury stays at 90+ with no noise lost.', gte('quietLuxury', 10), { progress: { fact: 'quietLuxury', target: 10 } }),
  a('ACH31', 'Budget Hero', 'A 4★ month with every room type on Value pricing.', gte('budgetHero', 1)),
  a('ACH32', 'Guestbook 100', '100 guests in the Guestbook.', gte('guestbook', 100), { progress: { fact: 'guestbook', target: 100 } }),
  a('ACH33', 'Staff Loyalty', 'A staff member reaches Level 10.', gte('bestLevel', 10), { progress: { fact: 'bestLevel', target: 10 } }),
  a('ACH34', 'Resort Legend', 'Prestige 90.', gte('prestige', 90), { big: true }),
  a('ACH35', 'High Roller', '1,000,000 Credits in the bank.', gte('cash', 1000000)),
  a('ACH36', 'Green Stay', 'Energy Efficiency researched and the Eco Garden theme at 50+.', { all: [has('research', 'R27'), gte('theme.TH07', 50)] }),
  a('ACH37', 'Service Culture', 'Service 90+ at a month end.', gte('bestMonthService', 90)),
  a('ACH38', 'World Partner', 'Meet Crown Escapes’ goal.', has('partnersMet', 'P08')),
  a('ACH39', 'Secret Award', 'Win a secret award.', { any: [has('awardsWon', 'AWR11'), has('awardsWon', 'AWR12')] }),
  a('ACH40', 'Beyond Five Stars', 'Prestige 100 with a 5★ rating.', { all: [gte('prestige', 100), gte('bestStars', 5)] }, { big: true }),
  a('ACH42', 'Meet the Maker', 'Hire Aaron, the founder of Banx Games.', gte('aaronHired', 1)), // (Milestone 27b)
].map((d) => ({ ...d, reward: [{ currency: 'rep', amount: 20 }, ...(d.big ? [{ currency: 'item', amount: 1 }] : [])] }));
export const achievementById = (id) => ACHIEVEMENTS.find((x) => x.id === id) ?? null;
// The unlock toast and the screen: a code-drawn medal (no achievement art is filed).
export const MEDAL = { gold: '#E3B341', silver: '#B9C2CC', locked: '#5C6670' };
