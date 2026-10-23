// What the player has discovered (combos, recipes…), kept twice:
//   run      — this campaign (goes in the campaign save; a new run starts empty)
//   account  — every run ever (its own save record; a new run keeps it)
// A thing discovered in any run is "known": the game may show its exact recipe from then on.
// Clues: something not discovered yet that the player got close to (the game decides what "close" is).
// A clue is kept for the run, so the Archive can list it as a clue after a reload.
//
// discover(id, info) → { firstInRun, firstEver }   addClue(id, info) → true when the clue is new
// Emits 'discovery:new' ({ id, firstEver, info }) and 'discovery:clue' ({ id }).
export class DiscoveryArchive {
  constructor({ bus = null } = {}) {
    this.bus = bus;
    this.account = { found: {} }; // id → { runs, first: info }
    this.resetRun();
  }

  resetRun() {
    this.run = { found: {}, clues: {} }; // id → info
  }

  inRun(id) {
    return !!this.run.found[id];
  }

  // Found in this run or any earlier one.
  known(id) {
    return this.inRun(id) || !!this.account.found[id];
  }

  hasClue(id) {
    return !!this.run.clues[id];
  }

  get runCount() {
    return Object.keys(this.run.found).length;
  }

  discover(id, info = {}) {
    const firstInRun = !this.inRun(id);
    const firstEver = !this.account.found[id];
    if (firstInRun) this.run.found[id] = { ...info };
    delete this.run.clues[id]; // found: no longer just a clue
    if (firstEver) this.account.found[id] = { runs: 0, first: { ...info } };
    if (firstInRun) this.account.found[id].runs++;
    if (firstInRun) this.bus?.emit('discovery:new', { id, firstEver, info });
    return { firstInRun, firstEver };
  }

  addClue(id, info = {}) {
    if (this.known(id) || this.hasClue(id)) return false;
    this.run.clues[id] = { ...info };
    this.bus?.emit('discovery:clue', { id });
    return true;
  }

  // 'found' (this run) · 'known' (an earlier run) · 'clue' · 'unknown'
  state(id) {
    if (this.inRun(id)) return 'found';
    if (this.account.found[id]) return 'known';
    if (this.hasClue(id)) return 'clue';
    return 'unknown';
  }

  serializeRun() {
    return JSON.parse(JSON.stringify(this.run));
  }

  loadRun(data) {
    this.resetRun();
    if (!data) return false;
    this.run = { found: { ...(data.found ?? {}) }, clues: { ...(data.clues ?? {}) } };
    return true;
  }

  serializeAccount() {
    return JSON.parse(JSON.stringify(this.account));
  }

  // Merges, so a run saved before the account record was read can never wipe it.
  loadAccount(data) {
    for (const [id, v] of Object.entries(data?.found ?? {})) {
      const cur = this.account.found[id];
      this.account.found[id] = cur ? { runs: Math.max(cur.runs, v.runs ?? 0), first: cur.first ?? v.first } : { runs: v.runs ?? 0, first: v.first ?? {} };
    }
    // Anything this run found is known to the account too.
    for (const [id, info] of Object.entries(this.run.found)) this.account.found[id] ??= { runs: 1, first: { ...info } };
  }
}
