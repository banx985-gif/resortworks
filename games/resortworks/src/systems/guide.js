// The first-time guide (Milestone 33, bible §34) on core/GuideSystem: Dame Opal's nine light tips (data/guide.js), each
// finished by the thing it asks for (or counted as done if the player already did it), then the scripted Stars-vs-Prestige
// question. A new resort starts it; an NG+ resort or a player whose account finished (or switched off) the guide before
// starts with it off; it can be replayed from Office → Help (or Settings → Help / tutorial replay).
//   createGuide({ saved, bus, founder, account, ngPlus, targetRect, canShow }) → g
//     g.update() · g.current (the step showing, its words with the Founder's line) · g.skip() · g.off() · g.replay()
//     g.answer(id) → { right, reply } (the quiz) · g.finished · g.understood · g.hello (Opal's line for this Founder)
//     g.seen (steps seen, for Help) · g.core (core/GuideSystem) · serialize()
//   On the bus: core's 'guide:show' / 'guide:done' / 'guide:change' · 'guide:understood' (the quiz answered right)
import { GuideSystem } from '../../../../core/GuideSystem.js';
import { GUIDE_STEPS, FOUNDER_LINES, STARS_VS_PRESTIGE } from '../../data/guide.js';

const clone = (x) => JSON.parse(JSON.stringify(x));

export function createGuide({ saved = null, bus, founder = 'S01', account = {}, ngPlus = 0, targetRect = () => ({ x: 0, y: 0, w: 1, h: 1 }), canShow = () => true } = {}) {
  let tr = targetRect;
  let cs = canShow;
  const line = FOUNDER_LINES[founder] ?? FOUNDER_LINES.S01;
  const steps = GUIDE_STEPS.map((s) => ({ id: s.id, title: s.title, text: s.text, target: s.target ?? null, tip: true, advance: { event: s.event }, skipIf: s.quiz ? undefined : s.event, quiz: !!s.quiz }));
  const core = new GuideSystem({ steps, bus, targetRect: (name) => tr(name), screen: () => 'resort', canShow: () => cs() });
  let s = saved ? clone(saved) : { state: null, understood: false, finished: false, answers: [] };
  if (s.state) core.load(s.state);
  else if (ngPlus > 0 || account?.guideDone) core.turnOff(); // an NG+ resort, or the player has been through it before
  // (the open sheets are the 'open:<id>' events the steps wait for)
  bus?.on('sheet:open', ({ id }) => id && bus.emit(`open:${id}`, {}));
  bus?.on('guide:done', () => {
    if (core.steps.every((x) => core.state.done.includes(x.id))) {
      s.finished = true;
      if (account) account.guideDone = true;
    }
  });
  const g = {
    update: () => core.update(),
    // the screen: where each target is now, and whether a tip may show (no sheet or big moment up)
    attachScreen({ targetRect: t, canShow: c } = {}) {
      if (t) tr = t;
      if (c) cs = c;
    },
    get current() {
      const c = core.current;
      if (!c || !core.visible) return null;
      const extra = c.id === line.step ? ` ${line.tip}` : '';
      return { ...c, text: `${c.text}${extra}` };
    },
    get hello() {
      return line.hello;
    },
    skip: () => core.skip(),
    off() {
      core.turnOff();
      if (account) account.guideDone = true;
    },
    replay() {
      core.reset();
      s = { state: null, understood: false, finished: false, answers: [] };
      core.update();
    },
    // The scripted check: the right answer finishes the last step.
    answer(id) {
      const a = STARS_VS_PRESTIGE.answers.find((x) => x.id === id);
      if (!a) return null;
      s.answers.push(id);
      if (a.right && !s.understood) {
        s.understood = true;
        bus?.emit('guide:understood', {});
      }
      return { right: a.right, reply: a.reply };
    },
    get understood() {
      return s.understood;
    },
    get finished() {
      return s.finished;
    },
    get isOff() {
      return core.state.off;
    },
    get seen() {
      return core.seenSteps;
    },
    get done() {
      return [...core.state.done];
    },
    core,
    serialize: () => ({ ...clone(s), state: core.serialize() }),
  };
  return g;
}
