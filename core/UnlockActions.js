// Unlock actions: "unlock part X", "make facility Y buildable", "turn on feature Z" — written as data,
// run by this one runner. Any system can fire them (a research node, an achievement, a story beat…).
//   action: { type: 'part' | 'facility' | 'feature' | …, id }     the game chooses the type words
// Each (type, id) fires at most once per run: running it again does nothing. What has fired is plain
// data for the save. The game can react through handlers ({ part: (action, source) => … }) or the event.
// Emits 'unlock:fired' ({ action, source }).
export class UnlockRunner {
  constructor({ bus = null, handlers = {} } = {}) {
    this.bus = bus;
    this.handlers = handlers;
    this.reset();
  }

  reset() {
    this.unlocked = {}; // type → [ids] in the order they fired
    this.log = []; // { type, id, source } in firing order
  }

  has(type, id) {
    return !!this.unlocked[type]?.includes(id);
  }

  list(type) {
    return [...(this.unlocked[type] ?? [])];
  }

  // Fire a list of actions. Returns the ones that fired now (already-fired ones are skipped).
  run(actions = [], source = null) {
    const fired = [];
    for (const action of actions) {
      if (!action?.type || action.id === undefined || this.has(action.type, action.id)) continue;
      (this.unlocked[action.type] ||= []).push(action.id);
      this.log.push({ type: action.type, id: action.id, source });
      this.handlers[action.type]?.(action, source);
      this.bus?.emit('unlock:fired', { action, source });
      fired.push(action);
    }
    return fired;
  }

  serialize() {
    return { unlocked: JSON.parse(JSON.stringify(this.unlocked)), log: JSON.parse(JSON.stringify(this.log)) };
  }

  load(s) {
    this.reset();
    if (!s) return;
    this.unlocked = JSON.parse(JSON.stringify(s.unlocked ?? {}));
    this.log = JSON.parse(JSON.stringify(s.log ?? []));
  }
}
