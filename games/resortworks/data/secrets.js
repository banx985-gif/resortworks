// The Secret Engine's 50 (Milestone 27, bible §29): plain rules for core/SecretEngine, run by src/systems/secrets.js.
// The names, categories, requirements and rewards are the bible's, word for word where it gives a number. How each
// requirement is measured (the facts below, kept by src/systems/secrets.js) and the clue words are Claude Code's
// readings (DECISIONS M27). Every rule is checked on 'tick' (each Night and Midday band edge and the moments that
// matter) — nothing else ever looks at a rule. NG+ rules need that New Game+ level (M28 sets it; 0 until then).
//
// A condition: { fact, op, value, kind, category } (kind: count / threshold / fixed — how a repeat run eases it, §30.4a;
// category: what clue stage 2 names as still missing). Facts named here are defined in src/systems/secrets.js FACTS.
//
// Rewards (rewardActions, each fired at most once a run through core/UnlockRunner; currency once per account):
//   staff     a Legendary / Secret applicant for ARRIVAL.days (ARRIVAL.repeatDays on a repeat run)
//   guest     a secret guest type can book from now on (this run)
//   facility  a secret facility can be built (this run)          award     a secret award is judged (this run)
//   partner   a secret partner can offer a contract (this run)   stage     the Prestige Grounds gate's secret
//   prestige  Prestige +amount (this run)                        prestigeTokens  account Prestige Tokens (once ever)
//   boost     a small lasting bonus this run (BOOSTS)            clue      raise another secret's clue stage
//   cosmetic  an account keepsake (badges, covers, plaques …)    ending    the True RESORTWORKS ending (account)
const n = (fact, value, category, kind = 'count') => ({ fact, op: 'gte', value, kind, category });
const yes = (fact, category) => ({ fact, op: 'eq', value: true, kind: 'fixed', category });
const has = (fact, value, category) => ({ fact, op: 'has', value, kind: 'fixed', category });
const no = (fact, category) => ({ fact, op: 'eq', value: 0, kind: 'fixed', category });
const lv = (id, level = 3) => ({ fact: `level.${id}`, op: 'gte', value: level, kind: 'fixed', category: 'facilities' });
const built = (id) => ({ fact: `built.${id}`, op: 'eq', value: true, kind: 'fixed', category: 'facilities' });
const sec = (id, category, name, requires, reward, rumour, extra = {}) => ({
  id,
  category,
  name,
  ngPlusMin: extra.ng ?? 0,
  triggerEvents: ['tick'],
  requiresAll: requires,
  oncePerRun: true,
  clueStages: [
    { text: rumour, minMet: 1 },
    { text: 'Almost there. Still missing: {missing}.', minMet: 'allButOne' },
  ],
  rewardActions: [].concat(reward),
  rewardWords: extra.words,
  exact: extra.exact,
});
const staff = (id) => ({ type: 'staff', id });
const guest = (id) => ({ type: 'guest', id });
const cosmetic = (id, name) => ({ type: 'cosmetic', id, name });
const boost = (id) => ({ type: 'boost', id });
const prestige = (amount, id) => ({ type: 'prestige', id, amount });
const tokens = (amount) => ({ type: 'prestigeTokens', id: 'tokens', amount });

// The four rare guests (the gods card's "legendary guests"): what SEC02 "all four prestige guest types" means here.
export const RARE_FOUR = ['GT20', 'GT21', 'GT22', 'GT23'];
// The arrival window for a secret's Legendary / Secret applicant (the M27b / M28b cards: 56 days, 84 on a repeat run).
export const ARRIVAL = { days: 56, repeatDays: 84 };
// A repeat run's easing (§30.4a, core's default): counts halved, thresholds 15% easier.
export const EASING = { countFactor: 0.5, thresholdPct: 15 };
// Lasting bonuses (Claude Code's picks, small: S+ stays rare). sat: + satisfaction for those stays; tags: whose.
export const BOOSTS = {
  quietLuxury: { name: 'Quiet-luxury boost', words: 'Luxury guests +2 satisfaction', sat: 2, tags: ['luxury'] },
  wellness: { name: 'Wellness prestige boost', words: 'Wellness guests +2 satisfaction', sat: 2, tags: ['wellness'] },
  dining: { name: 'Signature dining bonus', words: 'Foodie guests +2 satisfaction', sat: 2, tags: ['foodie'] },
  recovery: { name: 'Service-recovery trait', words: 'A guest whose complaint was put right +3 satisfaction', sat: 3, recovered: true },
  organic: { name: 'Organic demand boost', words: 'Booking demand +3%', demand: 0.03 },
  resilience: { name: 'Resilience bonus', words: 'Guests +1 satisfaction in Wet months', sat: 1, wet: true },
  weddingGarden: { name: 'Prestige wedding garden', words: 'Weddings score +3', eventScore: 3, events: ['EV03', 'EV11'] },
};
// Prestige Tokens (account, never bought): what SEC16 / SEC48 / SEC49 give. NG+ setup spends them (M28).

export const SECRETS = [
  // --- Staff: the Legendary and Secret staff (bible §27D) --------------------------------------------------------------
  sec('SEC01', 'Staff', 'Golden Concierge', [n('recovered90', 20, 'service'), n('foLevelAvg', 12, 'staff', 'threshold')], staff('S09'), 'Guests whisper about a concierge who can turn any bad stay around…'),
  sec('SEC02', 'Staff', 'Impossible Host', [n('rareTypesHosted', 4, 'guests'), has('hiredEver', 'S09', 'staff')], staff('S10'), 'Someone who has seen every kind of great guest wants to meet your Golden Concierge.', { ng: 1 }),
  sec('SEC03', 'Staff', 'White Glove', [n('cleanStreakBest', 100, 'cleaning')], staff('S19'), 'A housekeeper with white gloves is said to judge resorts by their spotless rooms.'),
  sec('SEC04', 'Staff', 'Never Missed', [yes('hkYearOk', 'cleaning'), has('hiredEver', 'S19', 'staff')], staff('S20'), 'A year of rooms that were never late would catch someone’s eye.', { ng: 1 }),
  sec('SEC05', 'Staff', 'Golden Table', [n('food28', 95, 'food', 'threshold'), n('eventsFood90', 10, 'events')], staff('S29'), 'A famous chef only eats where the food is close to perfect, banquets too.'),
  sec('SEC06', 'Staff', 'Perfect Course', [has('awardsWon', 'AWR04', 'awards'), n('luxPrestigeStays', 50, 'guests'), has('hiredRun', 'S29', 'staff')], staff('S30'), 'Chef Aurelia mentions a rival who cooks without a menu…', { ng: 2 }),
  sec('SEC07', 'Staff', 'Showstopper', [n('events95', 12, 'events'), n('event95Kinds', 4, 'events')], staff('S39'), 'An entertainer is looking for a resort where every kind of event is a showstopper.'),
  sec('SEC08', 'Staff', 'Unforgettable', [n('eventMemories', 75, 'memories'), has('hiredRun', 'S39', 'staff')], staff('S40'), 'Luna Star says the best memories bring the best people.', { ng: 2 }),
  sec('SEC09', 'Staff', 'Never Breaks', [n('noLongBreakdownBest', 180, 'maintenance'), yes('opsResearchDone', 'research')], staff('S49'), 'A legendary engineer only works where nothing stays broken.'),
  sec('SEC10', 'Staff', 'Paradise Keeper', [n('appeal95Best', 180, 'appeal'), has('hiredRun', 'S49', 'staff')], staff('S50'), 'Atlas Forge talks about a gardener who keeps paradise in bloom.', { ng: 2 }),
  // --- Guests: the secret guest types (bible §9) ---------------------------------------------------------------------
  sec('SEC11', 'Guests', 'Mystery Critic', [n('stays', 100, 'guests'), no('openComplaints', 'service')], guest('GT20'), 'A critic travels in disguise. They only visit resorts with nothing left unresolved.'),
  sec('SEC12', 'Guests', 'Royal Visit', [n('stars', 5, 'rating', 'fixed'), built('F29'), n('luxury90', 10, 'guests')], guest('GT21'), 'Royal staff have been asking about resorts with a VIP Lounge…'),
  sec('SEC13', 'Guests', 'Eccentric Fortune', [n('roomKinds', 12, 'rooms', 'fixed'), n('facilityKinds', 25, 'facilities', 'fixed'), n('prestige', 70, 'prestige', 'threshold')], guest('GT22'), 'A very rich, very odd traveller wants a resort with everything.'),
  sec('SEC14', 'Guests', 'Travel Legend', [n('visibleAwards', 6, 'awards'), n('positiveMemories', 75, 'memories')], guest('GT23'), 'A legendary travel writer reads award lists and guestbooks.'),
  sec('SEC15', 'Guests', 'Paradise Guest', [n('prestige', 100, 'prestige', 'threshold'), has('awardsWon', 'AWR11', 'awards'), built('F35')], guest('GT24'), 'Somewhere above the clouds, a guest is waiting for paradise.', { ng: 2 }),
  sec('SEC16', 'Guests', 'Cheap Room Celebrity', [n('celebBudget95', 1, 'guests')], [tokens(1), cosmetic('celebMemory', 'Celebrity in the Budget Room')], 'A celebrity once said the best night of her life was in a plain little room…'),
  sec('SEC17', 'Guests', 'Critic Redemption', [yes('criticRedeemed', 'guests')], prestige(3, 'criticRedemption'), 'A critic who was let down might come back… if you’re brave.', { words: 'Prestige +3 (review recovery prestige bonus)' }),
  sec('SEC18', 'Guests', 'Three Generations', [n('familyYears', 3, 'history', 'fixed')], cosmetic('legacyPage', 'Legacy Guestbook page'), 'Some families come back year after year after year.'),
  // --- Facilities: the Paradise facilities and grand sets ------------------------------------------------------------
  sec('SEC19', 'Facilities', 'Paradise Pavilion', [has('awardsWon', 'AWR10', 'awards'), yes('allVisibleBuilt', 'facilities'), n('prestige', 90, 'prestige', 'threshold')], [{ type: 'facility', id: 'F34' }, { type: 'stage', id: 'prestige' }], 'The Crown, every facility and great Prestige: then a pavilion might rise.', { words: 'F34 Paradise Pavilion can be built; the Prestige Grounds stage can open' }),
  sec('SEC20', 'Facilities', 'Sky Retreat', [built('F34'), n('royalTrio90', 3, 'guests', 'fixed'), n('prestige', 100, 'prestige', 'threshold')], { type: 'facility', id: 'F35' }, 'The Pavilion’s guests talk of a retreat in the sky.', { ng: 1, words: 'F35 Sky Retreat can be built' }),
  sec('SEC21', 'Facilities', 'Perfect View', [n('viewRoomsBest', 20, 'views')], cosmetic('landscape', 'Secret landscape set'), 'Twenty happy guests, all with a lovely view, on the same night.'),
  sec('SEC22', 'Facilities', 'Silent Wing', [n('silentWingBest', 30, 'comfort')], boost('quietLuxury'), 'A wing of luxury rooms so quiet you can hear the garden.'),
  sec('SEC23', 'Facilities', 'Family Paradise', [lv('F10'), lv('F11'), lv('F12'), lv('F13'), n('familyStays', 100, 'guests')], cosmetic('familySkin', 'Family prestige skin'), 'Kids everywhere are asking for one resort by name.'),
  sec('SEC24', 'Facilities', 'Wellness Sanctuary', [lv('F17'), lv('F30'), lv('F16'), lv('F18'), n('wellnessStays', 50, 'guests')], boost('wellness'), 'A sanctuary needs every wellness place at its very best.'),
  sec('SEC25', 'Facilities', 'Wedding Destination', [n('weddings', 20, 'events'), n('weddingAvg', 90, 'events', 'threshold'), built('F20'), built('F32')], boost('weddingGarden'), 'Couples dream of a lawn and a ballroom, and twenty perfect weddings.'),
  sec('SEC26', 'Facilities', 'Food Quarter', [lv('F09'), lv('F25'), lv('F22'), n('food28', 95, 'food', 'threshold')], boost('dining'), 'Three great kitchens side by side would make a food quarter.'),
  // --- Behaviour ------------------------------------------------------------------------------------------------------
  sec('SEC27', 'Behaviour', 'One-Star Redemption', [yes('oneToFive', 'guests')], boost('recovery'), 'A guest who hated it once might give you a second chance.'),
  sec('SEC28', 'Behaviour', 'Packed and Perfect', [n('packedBest', 14, 'occupancy')], prestige(5, 'packed'), 'A packed resort with no complaints at all, for two whole weeks.'),
  sec('SEC29', 'Behaviour', 'Half Full Record', [yes('halfFullRecord', 'finance')], cosmetic('yieldBadge', 'Yield-management badge'), 'Fewer guests, more profit? Some managers can.'),
  sec('SEC30', 'Behaviour', 'No Ads Needed', [yes('noAdsYear', 'occupancy')], boost('organic'), 'A full resort that never paid for marketing.'),
  sec('SEC31', 'Behaviour', 'Starter Loyalty', [yes('starterLoyal', 'staff')], cosmetic('founderBadge', 'Service founder badge'), 'One of your very first staff could stay with you to the end.'),
  sec('SEC32', 'Behaviour', 'No Luxury Needed', [yes('fiveNoLuxury', 'rating')], cosmetic('valueBadge', 'Value-excellence badge'), 'Five stars without a single luxury room?'),
  sec('SEC33', 'Behaviour', 'Storm Recovery', [n('stormRecoveries', 1, 'weather')], boost('resilience'), 'When the rain comes, a great team fixes everything fast.'),
  sec('SEC34', 'Behaviour', 'Quiet Week', [n('quietWeekBest', 7, 'comfort')], cosmetic('quietMemory', 'Quiet-resort memory'), 'A full week, nearly full, and nobody complained about noise.'),
  sec('SEC35', 'Behaviour', 'Full Resort Mix', [n('themesMin', 25, 'themes', 'threshold')], prestige(3, 'mix'), 'A little bit of every kind of resort, all at once.', { words: 'Prestige +3 (adaptive prestige)' }),
  sec('SEC36', 'Behaviour', 'Service Miracle', [n('recoveries7Best', 5, 'service')], { type: 'clue', id: 'SEC01' }, 'Five complaints put right in one week, every guest delighted.', { words: 'A clue to a Legendary Front Office person' }),
  // --- Awards / Rivals ------------------------------------------------------------------------------------------------
  sec('SEC37', 'Awards', 'Hidden Paradise Medal', [n('stars', 5, 'rating', 'fixed'), n('prestige', 95, 'prestige', 'threshold'), n('visibleAwards', 8, 'awards'), built('F34'), n('positiveMemories', 200, 'memories')], { type: 'award', id: 'AWR11' }, 'There’s an award nobody talks about, for resorts that are almost paradise.', { words: 'The Hidden Paradise Medal (AWR11) is judged' }),
  sec('SEC38', 'Awards', 'Legendary Resort Circle', [has('awardsWon', 'AWR11', 'awards'), n('paradise95', 1, 'guests'), n('secretsFound', 45, 'secrets')], { type: 'award', id: 'AWR12' }, 'The Circle only invites resorts that know nearly every secret.', { ng: 2, words: 'The Legendary Resort Circle (AWR12) is judged' }),
  sec('SEC39', 'Awards', 'Legacy Hospitality', [n('headline90Best', 180, 'scores'), yes('eliteEveryRole', 'staff')], { type: 'partner', id: 'P09' }, 'Half a year of top scores and an elite team would impress an old hospitality house.', { words: 'P09 Legacy Hospitality can offer a contract' }),
  sec('SEC40', 'Awards', 'Paradise Circle', [has('awardsWon', 'AWR10', 'awards'), yes('p09Active', 'partners'), n('prestigeTypesHosted', 3, 'guests')], { type: 'partner', id: 'P10' }, 'The Crown, Legacy Hospitality and the world’s great guests…', { ng: 1, words: 'P10 Paradise Circle can offer a contract' }),
  sec('SEC41', 'Awards', 'Mirage One', [n('beatCrownBay', 3, 'awards', 'fixed'), n('prestige', 90, 'prestige', 'threshold'), n('secretsFound', 30, 'secrets')], [prestige(3, 'mirage'), cosmetic('mirageTrophy', 'Mirage One rivalry trophy')], 'Beat Crown Bay often enough and the mysterious Mirage One takes notice.', { words: 'Prestige +3 and the Mirage One rivalry trophy (Mirage One already competes: DECISIONS M27)' }),
  sec('SEC42', 'Awards', 'Rival Staff Return', [n('rivalRehires', 1, 'staff')], prestige(3, 'loyalty'), 'Lose someone to a rival, win them back.', { words: 'Prestige +3 (loyalty prestige event)' }),
  // --- History --------------------------------------------------------------------------------------------------------
  sec('SEC43', 'History', 'Guestbook Legend', [n('positiveMemories', 250, 'memories')], cosmetic('goldCover', 'Gold Guestbook cover'), 'A guestbook so full of happy memories it needs a golden cover.'),
  sec('SEC44', 'History', 'Twenty Years Open', [yes('twentyYears', 'history')], cosmetic('endingBonus', 'Ending grade bonus'), 'Twenty years open, still solvent, still loved.'),
  sec('SEC45', 'History', 'Motel to Crown', [n('stageIndex', 4, 'stage', 'fixed'), has('awardsWon', 'AWR10', 'awards')], cosmetic('heritageEntrance', 'Heritage entrance'), 'From a roadside motel to the world’s crown.'),
  sec('SEC46', 'History', 'Perfect Staff Family', [yes('tenYearsEveryRole', 'staff')], prestige(3, 'staffFamily'), 'Someone in every department who has been with you ten years.', { words: 'Prestige +3 (loyalty prestige bonus)' }),
  sec('SEC47', 'History', 'The Regular', [n('mostReturns', 8, 'history', 'fixed')], cosmetic('suitePlaque', 'Named-suite plaque'), 'One guest who just keeps coming back.'),
  // --- New Game+ ------------------------------------------------------------------------------------------------------
  sec('SEC48', 'NG+', 'Back to Basics', [yes('backToBasics', 'awards')], tokens(2), 'The National award, won before anything luxurious was built.', { ng: 1 }),
  sec('SEC49', 'NG+', 'Perfect Service', [n('perfectDay', 1, 'scores')], tokens(3), 'One perfect day: every score at 100 in a busy resort.', { ng: 2 }),
  sec('SEC50', 'NG+', 'Paradise Complete', [has('awardsWon', 'AWR12', 'awards'), n('paradiseHosted', 1, 'guests'), n('otherSecrets', 49, 'secrets', 'fixed')], { type: 'ending', id: 'true' }, 'Every secret, the Circle and the Paradise Guest: the true ending.', { ng: 3, words: 'The True RESORTWORKS ending' }),
];
// (Milestone 27b) Aaron's own secret, SEC-STAFF-L6: not one of the 50 and not needed for SEC50. Cowork's starting picks:
// all five other Legendaries hired at least once (any run), a guest in the Guestbook Hall of Fame, Resort Rank S.
export const LEGEND_SECRETS = [
  {
    ...sec('SEC-STAFF-L6', 'Legend', 'The Founder Drops By', [n('legendsHiredEver', 5, 'staff'), n('hallOfFame', 1, 'guests', 'fixed'), yes('rankS', 'rank')], staff('S51'), 'Word is the people who made this whole world sometimes check in at a great resort…', { words: 'Aaron, the founder of Banx Games, can be hired' }),
    clueStages: [
      { text: 'Word is the people who made this whole world sometimes check in at a great resort…', minMet: 1 },
      { text: 'Legendary staff and legendary guests. Then maybe the boss himself.', minMet: 'allButOne' },
    ],
    arrival: 'The founder of Banx Games drops by to see what you’ve built.',
  },
];
// (Milestone 28b) the Works Gods' five secrets — not of the 50, not for SEC50. Their own engine eases a repeat run by 25%
// (the card). Cowork's starting conditions. Havoc's clues stay hidden until the other four have all been hired once.
const godSec = (id, name, requires, reward, clues, arrival, extra = {}) => ({
  ...sec(id, 'Gods', name, requires, staff(reward), clues[0], extra),
  clueStages: [{ text: clues[0], minMet: 1 }, { text: clues[1], minMet: { share: 0.6 } }, { text: clues[2], minMet: 'allButOne' }],
  triggerEvents: extra.trigger ?? ['tick'],
  arrival,
});
export const GOD_SECRETS = [
  godSec('SEC-GOD-1', 'Bolt, God of Tinkering', [yes('rankA', 'rank'), n('facilitiesLv3', 15, 'facilities'), n('perfectConditionBest', 120, 'maintenance')], 'GOD1', ['A guest swears the sheds hum a happy tune at night.', 'Something golden keeps tightening the pool pump before anyone notices it’s loose.', 'A cog-shaped glow was seen over the Maintenance Shed. Keep every building in perfect shape and see who comes to look.'], 'A cog-shaped glow settles over the Maintenance Shed. Bolt has come to look.'),
  godSec('SEC-GOD-2', 'Jinx, Goddess of Luck', [n('rareFour90', 4, 'guests'), n('secretsFound', 25, 'secrets'), yes('closeWin', 'awards')], 'GOD2', ['Reception’s lucky cat statue winked. Probably.', 'The rarest guests seem to find a lucky resort sooner or later.', 'A giant die was seen rolling across the lobby. Welcome all four legendary guests and win something by a whisker.'], 'A giant die rolls across the lobby and lands on six. Jinx is here.'),
  godSec('SEC-GOD-3', 'Zip, God of Speed', [n('zipStreakBest', 336, 'cleaning'), n('roomTurns', 2000, 'cleaning')], 'GOD3', ['Housekeeping found a room cleaned before they’d even got the keys.', 'Someone saw a blur with winged shoes carrying four suitcases at once.', 'Keep every room ready on time, all year, in a full house, and a bellhop like no other might apply.'], 'A blur with winged shoes stops at the desk. Zip would like a job.'),
  godSec('SEC-GOD-4', 'Kaching, God of Fortune', [n('cash', 1000000, 'finance', 'threshold'), n('profitRecordsYearBest', 3, 'finance'), n('partnerGoals', 8, 'partners')], 'GOD4', ['The café tip jar keeps overflowing with gold coins nobody remembers leaving.', 'A booming laugh echoes round the bar on record-breaking nights.', 'Make a fortune, break your profit records, and keep your Partners happy. Someone very jolly is watching.'], 'A booming laugh fills the bar. Kaching has arrived.'),
  godSec('SEC-GOD-5', 'Havoc, God of Chaos', [n('godsHiredEver', 4, 'gods', 'fixed'), yes('partyNow', 'events')], 'GOD5', ['The other four keep glancing at the pool deck, nervously.', 'Purple sparks were seen in the DJ booth. Nobody booked a DJ.', 'Start a new run with the whole pantheon behind you, then throw a party. He’ll invite himself.'], 'The pool party’s gone… strange.', { ng: 1, trigger: ['tick', 'party'] }),
];
export const GOD_EASING = { countFactor: 0.75, thresholdPct: 25 };
export const PARTY_EVENTS = ['EV01', 'EV08']; // a pool party / evening event (Birthday Weekend, Festival Stay)
export const LUCKY_TAGS = ['vip', 'celebrity', 'critic'];
export const secretById = (id) => SECRETS.find((x) => x.id === id) ?? LEGEND_SECRETS.find((x) => x.id === id) ?? GOD_SECRETS.find((x) => x.id === id) ?? null;
// Each fact in plain words (the Archive's exact conditions once a secret is found). level.Fxx / built.Fxx are worded from
// the facility's name.
export const FACT_WORDS = {
  recovered90: 'complaints put right with the guest at 90+', foLevelAvg: 'Front Office average level', rareTypesHosted: 'rare guest types hosted (Critic, Royal, Billionaire, Travel Writer)',
  hiredEver: 'hired in any run', hiredRun: 'hired in this run', cleanStreakBest: 'room turns in a row at Clean 95+ (none late)', hkYearOk: '365 days with under 1% late rooms',
  food28: 'Food score (last 28 days)', eventsFood90: 'events with food 90+', awardsWon: 'award won', luxPrestigeStays: 'luxury / prestige stays', events95: 'events scored 95+',
  event95Kinds: 'kinds of event scored 95+', eventMemories: 'Great Event memories', noLongBreakdownBest: 'days with no breakdown left over a day', opsResearchDone: 'every Operations research done',
  appeal95Best: 'days in a row at Appeal 95+', stays: 'completed stays', openComplaints: 'open complaints', stars: 'star rating', luxury90: 'luxury stays at 90+', roomKinds: 'room types built',
  facilityKinds: 'facilities built', prestige: 'Prestige', visibleAwards: 'different visible awards won', positiveMemories: 'positive Guestbook memories', celebBudget95: 'a Celebrity in a Budget Room at 95+',
  criticRedeemed: 'the Critic under 70, then back at 95+', familyYears: 'years one family came back in', allVisibleBuilt: 'all 33 visible facilities built', royalTrio90: 'Royal, Billionaire and Travel Writer at 90+',
  viewRoomsBest: 'rooms full on one night with a good view', silentWingBest: 'days with 10 quiet luxury rooms at Condition 95+', familyStays: 'family stays', wellnessStays: 'wellness stays',
  weddings: 'weddings held', weddingAvg: 'weddings’ average score', oneToFive: 'a guest’s 1★ stay, then a 5★ one', packedBest: 'days in a row 95%+ full with no complaints',
  halfFullRecord: 'a profit record in a month under 55% full', noAdsYear: 'a year 75%+ full with no Marketing research', starterLoyal: 'a first-day staff member still here in Year 20',
  fiveNoLuxury: '5★ before any luxury room or facility', stormRecoveries: 'Wet months with 3 quick repairs and guests at 85+', quietWeekBest: 'days in a row 90%+ full with no noise complaints',
  themesMin: 'the lowest theme bar', recoveries7Best: 'complaints put right to 90+ in one week', paradise95: 'a Paradise Guest at 95+', secretsFound: 'secrets found (account)',
  headline90Best: 'days in a row with all five headline scores 90+', eliteEveryRole: 'an Elite (or better) in every role', p09Active: 'Legacy Hospitality under contract',
  prestigeTypesHosted: 'prestige guest types hosted', beatCrownBay: 'award categories where you beat Crown Bay', rivalRehires: 'staff won back from a rival', twentyYears: 'Year 20, solvent, 4★+',
  stageIndex: 'World-Class stage', tenYearsEveryRole: 'someone with 10 years’ service in every role', mostReturns: 'returns by one guest', backToBasics: 'National Resort Award before anything luxurious',
  perfectDay: 'a day with every score at 100, 80%+ full', paradiseHosted: 'a Paradise Guest hosted', otherSecrets: 'other secrets found (account)',
  legendsHiredEver: 'of the five Legendaries hired (any run)', rankA: 'Resort Rank A', facilitiesLv3: 'facilities at Lv3', perfectConditionBest: 'days in a row with every facility at Condition 80+ and no breakdown', rareFour90: 'rare guest types hosted at 90+', closeWin: 'an award won by 1 point or less', zipStreakBest: 'days in a row with no late room, 85%+ full', roomTurns: 'room turns this run', profitRecordsYearBest: 'monthly profit records in one year', partnerGoals: 'different Partners’ goals met', godsHiredEver: 'of the other four gods hired (any run)', partyNow: 'a pool party or evening event just held', hallOfFame: 'guests in the Hall of Fame (a 5★ stay)', rankS: 'Resort Rank S',
};
// The categories the Secret Archive groups them by (bible §29 order).
export const SECRET_CATEGORIES = ['Staff', 'Guests', 'Facilities', 'Behaviour', 'Awards', 'History', 'NG+'];
// What each reward reads as on the Archive (when a rule has no `rewardWords`).
export const REWARD_WORDS = {
  staff: (a, name) => `${name(a.id)} can be hired`,
  guest: (a, name) => `${name(a.id)} can arrive`,
  facility: (a) => `${a.id} can be built`,
  award: (a) => `${a.id} is judged`,
  partner: (a) => `${a.id} can offer a contract`,
  stage: () => 'the Prestige Grounds stage can open',
  prestige: (a) => `Prestige +${a.amount}`,
  prestigeTokens: (a) => `${a.amount} Prestige Token${a.amount === 1 ? '' : 's'}`,
  boost: (a) => BOOSTS[a.id]?.words ?? a.id,
  clue: () => 'a clue',
  cosmetic: (a) => a.name ?? a.id,
  ending: () => 'the True RESORTWORKS ending',
};
// Kairosoft "fixing faults gives a little research" (KAIROSOFT_GAPS, Claude Code's pick): each breakdown repair finished
// takes `minutes` game minutes off the research project running now, at most `capPerMonth` minutes a 28-day month (an
// hour each, a game day a month at most).
export const REPAIR_RESEARCH = { minutes: 60, capPerMonth: 1440 };
