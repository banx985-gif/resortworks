// Contextual hints (BOTWORKS Milestone 26; any series game): short, one-time tips when the player runs into trouble —
// money running out, an idle research queue, a badly lost contest, an exhausted worker…
// The rules are the game's data; the game says when each one's situation holds:
//   rules: [{ id, check: 'name', title, text, icon }]
//   const hints = new HintSystem({ rules, check: (rule) → bool, post: (rule) → void, quiet: () → bool })
//   hints.evaluate()     at most ONE new hint per call (they never stack): the first rule whose situation holds and
//                        that has not fired this run is posted (the game sends it to a toast + the Inbox) and remembered
//   quiet() → true holds every hint back for now (a tutorial step or a big moment is showing, the first minute…)
//   hints.fired · serialize() / load(data) / reset()
export class HintSystem {
  constructor({ rules = [], check = () => false, post = () => {}, quiet = () => false } = {}) {
    this.rules = rules;
    this.check = check;
    this.post = post;
    this.quiet = quiet;
    this.reset();
  }

  reset() {
    this.fired = [];
  }

  has(id) {
    return this.fired.includes(id);
  }

  evaluate() {
    if (this.quiet()) return null;
    for (const rule of this.rules) {
      if (this.has(rule.id)) continue;
      let hit = false;
      try {
        hit = !!this.check(rule);
      } catch {
        hit = false;
      }
      if (!hit) continue;
      this.fired.push(rule.id);
      this.post(rule);
      return rule;
    }
    return null;
  }

  serialize() {
    return { fired: [...this.fired] };
  }

  load(data) {
    this.reset();
    if (Array.isArray(data?.fired)) this.fired = data.fired.filter((id) => this.rules.some((r) => r.id === id));
  }
}
