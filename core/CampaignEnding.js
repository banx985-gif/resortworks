// The campaign ending (any series game): when the last campaign year is over, the ending fires once — then the
// calendar simply keeps running as "postgame" with nothing reset.
//
//   new CampaignEnding({ bus, clock, endYear, canReach, onReach })
//     endYear   the last year of the campaign (the game's data: Robot Workshop 16). The ending fires on the first day
//               after it — the day after Year endYear, Month 12 ends — once the month-end has been handled.
//     canReach()  optional: false holds it back (e.g. the company has closed)
//     onReach()   the game's part, run before 'campaign:ending' is sent (work out the grade, archive the run…)
//   state: { reached, day, stage, postgame }   stage: the game's own words for how far its ceremony has got
//   Emits 'campaign:ending' ({ day }) once per run, and 'ending:stage' ({ stage }).
// Month rollovers: the clock sends 'clock:day' before 'clock:month', so on day 1 of a month this waits for the month
// event (which the game's own month-end handler, registered first, has already run through).
export class CampaignEnding {
  constructor({ bus = null, clock, endYear, canReach = () => true, onReach = () => {} }) {
    this.bus = bus;
    this.clock = clock;
    this.endYear = endYear;
    this.canReach = canReach;
    this.onReach = onReach;
    this.reset();
    bus?.on('clock:day', () => clock.day !== 1 && this.check());
    bus?.on('clock:month', () => this.check());
  }

  reset() {
    this.state = { reached: false, day: null, stage: null, postgame: false };
  }

  get reached() {
    return this.state.reached;
  }

  // Past the ending and playing on.
  get postgame() {
    return this.state.postgame;
  }

  // The tag a game shows next to the date ("Postgame"), or null.
  dateTag(label = 'Postgame') {
    return this.state.reached ? label : null;
  }

  // Is the campaign's last year over? (Also true for a save loaded after it.)
  get due() {
    return !this.state.reached && this.clock.year > this.endYear;
  }

  check() {
    if (!this.due || !this.canReach()) return false;
    this.reach();
    return true;
  }

  // Fires the ending now (the check above, or a debug switch).
  reach() {
    if (this.state.reached) return false;
    this.state = { reached: true, day: this.clock.totalDays, stage: 'ceremony', postgame: false };
    this.onReach();
    this.bus?.emit('campaign:ending', { day: this.state.day });
    return true;
  }

  setStage(stage) {
    this.state.stage = stage;
    this.bus?.emit('ending:stage', { stage });
  }

  // The player chose to play on: the ending is behind them.
  continuePostgame() {
    this.state.stage = 'done';
    this.state.postgame = true;
    this.bus?.emit('ending:stage', { stage: 'done' });
  }

  // Waiting on the player (the ceremony or the end choice is still open).
  get pending() {
    return this.state.reached && this.state.stage !== 'done';
  }

  serialize() {
    return { ...this.state };
  }

  load(data) {
    this.reset();
    if (data) this.state = { ...this.state, ...data };
  }
}
