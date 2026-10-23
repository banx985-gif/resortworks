// Candidate board (staff for a robot workshop, cooks for a café, crew for a shipyard…).
//
//   board    boardSize ordinary cards, replaced whole on every refresh
//   special  one extra "special arrival" card: a refresh never pushes it out; it leaves when hired or when
//            its time runs out (then it joins the former pool and may come back later like anyone else)
//   former   people who left (fired, or a special arrival that expired): each new card has reappearChance
//            of being one of them, if their tier and role fit the channel being used
//
// channels (plain data): [{ id, name, cost, roles: [..], weights: { tierId: weight } }]
// Which channels are open, what a refresh costs and who pays is the game's business; this system only
// makes cards. The game supplies:
//   makeCandidate(channel, tier, rng) → plain object { role, tier, … }   (this system adds id + channel)
//   tierWeights(channel) → { tierId: weight }   optional: the channel's weights after conditions
// Free refreshes: auto on the months autoRefresh(month) says, plus freeManualPerYear taps a year.
// Uses its own seeded Rng, so hiring never changes other random results.
// Emits 'recruit:refresh' ({ channel, reason }), 'recruit:arrival' ({ candidate }), 'recruit:expired', 'recruit:taken'.
export class RecruitmentSystem {
  constructor({ rng, bus = null, channels, boardSize = 3, reappearChance = 0.1, freeManualPerYear = 1, autoRefresh = (month) => month % 2 === 1, hooks = {} }) {
    this.rng = rng;
    this.bus = bus;
    this.channels = channels;
    this.boardSize = boardSize;
    this.reappearChance = reappearChance;
    this.freeManualPerYear = freeManualPerYear;
    this.autoRefresh = autoRefresh;
    this.hooks = hooks;
    this.reset();
  }

  reset() {
    this.board = [];
    this.special = null;
    this.former = [];
    this.nextId = 1;
    this.freeManualUsed = {}; // year → taps used
    this.refreshes = 0;
  }

  channel(id) {
    return this.channels.find((c) => c.id === id) ?? null;
  }

  get cards() {
    return this.special ? [...this.board, this.special] : [...this.board];
  }

  get(id) {
    return this.cards.find((c) => c.id === id) ?? null;
  }

  freeManualLeft(year) {
    return Math.max(0, this.freeManualPerYear - (this.freeManualUsed[year] ?? 0));
  }

  useFreeManual(year) {
    if (!this.freeManualLeft(year)) return false;
    this.freeManualUsed[year] = (this.freeManualUsed[year] ?? 0) + 1;
    return true;
  }

  // A fresh board from one channel. The special card stays.
  refresh(channelId, reason = 'paid') {
    const ch = this.channel(channelId);
    if (!ch) return null;
    const weights = this.hooks.tierWeights?.(ch) ?? ch.weights;
    this.board = [];
    for (let i = 0; i < this.boardSize; i++) {
      const tier = this._pickTier(weights);
      if (!tier) break;
      this.board.push(this._card(ch, tier));
    }
    this.refreshes++;
    this.bus?.emit('recruit:refresh', { channel: ch, reason });
    return this.board;
  }

  _pickTier(weights) {
    const list = Object.entries(weights).filter(([, w]) => w > 0);
    const total = list.reduce((t, [, w]) => t + w, 0);
    if (!total) return null;
    let r = this.rng.range(0, total);
    for (const [tier, w] of list) {
      if ((r -= w) < 0) return tier;
    }
    return list.at(-1)[0];
  }

  _card(ch, tier) {
    const taken = new Set(this.cards.map((c) => c.personId ?? c.id));
    const back = this.former.filter((f) => f.tier === tier && ch.roles.includes(f.role) && !taken.has(f.personId));
    if (back.length && this.rng.chance(this.reappearChance)) {
      const f = this.rng.pick(back);
      this.former = this.former.filter((x) => x !== f);
      return { ...f, id: `C${this.nextId++}`, channel: ch.id, returning: true };
    }
    const c = this.hooks.makeCandidate(ch, tier, this.rng);
    return { ...c, id: `C${this.nextId++}`, channel: ch.id };
  }

  // A special arrival (e.g. a tutorial hire): a fourth card for `days` days. Replaces any older special card.
  addSpecial(candidate, { day, days = 56, note = null } = {}) {
    if (this.special) this.former.push(this._forFormer(this.special));
    this.special = { ...candidate, id: `C${this.nextId++}`, channel: 'special', special: { until: day + days, note } };
    this.bus?.emit('recruit:arrival', { candidate: this.special });
    return this.special;
  }

  dailyTick(day) {
    if (this.special && day > this.special.special.until) {
      const gone = this.special;
      this.special = null;
      this.former.push(this._forFormer(gone));
      this.bus?.emit('recruit:expired', { candidate: gone });
    }
  }

  // Month start: the automatic free refresh on the months the game's rule picks.
  monthStart(month, channelId) {
    if (this.autoRefresh(month)) this.refresh(channelId, 'auto');
  }

  // Remove a card (hired). Returns it.
  take(id) {
    const c = this.get(id);
    if (!c) return null;
    if (this.special?.id === id) this.special = null;
    else this.board = this.board.filter((x) => x.id !== id);
    this.bus?.emit('recruit:taken', { candidate: c });
    return c;
  }

  // Someone left (fired): they may turn up again on a later board. person: plain candidate-shaped data.
  release(person) {
    this.former.push(this._forFormer(person));
  }

  _forFormer(c) {
    const { id, channel, special, returning, ...rest } = c;
    return JSON.parse(JSON.stringify(rest));
  }

  serialize() {
    return JSON.parse(
      JSON.stringify({
        rngState: this.rng.getState(),
        board: this.board,
        special: this.special,
        former: this.former,
        nextId: this.nextId,
        freeManualUsed: this.freeManualUsed,
        refreshes: this.refreshes,
      }),
    );
  }

  // Returns false if there was nothing to load.
  load(s) {
    this.reset();
    if (!s) return false;
    const c = JSON.parse(JSON.stringify(s));
    if (c.rngState !== undefined) this.rng.setState(c.rngState);
    this.board = c.board ?? [];
    this.special = c.special ?? null;
    this.former = c.former ?? [];
    this.nextId = c.nextId ?? 1;
    this.freeManualUsed = c.freeManualUsed ?? {};
    this.refreshes = c.refreshes ?? 0;
    return true;
  }
}
