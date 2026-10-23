// Basic screen switching. One screen is active at a time.
// A screen is any object with optional hooks:
//   enter(params), exit(), update(dt), render(ctx, alpha),
//   onTap(p), onDragStart(p), onDrag(p), onDragEnd(p), onHold(p), onDown(p), onUp(p)
//   onBack() → true if the screen dealt with a back press itself (closed its own dialog, asked "discard changes?",
//              opened a pause menu…); false/undefined lets the router go to the previous screen
// The router forwards input events from the bus to the active screen only.
// A modal (e.g. MajorFeedback) can sit on top: while modal.active is true it gets the input instead.
// Layers (e.g. a guide) sit between: each active layer is asked first with handleInput(hook, p);
// returning true means "used it", false lets the tap carry on to the screen.
//
// History (bible §6.2, Milestone 21): every go() is remembered. Going to a screen that is already in the history
// cuts the history back to it (so a screen's own "‹ Back" button and the phone's back button agree), and a root
// screen (the workshop, the main menu) starts the history again. go(name, params, { replace: true }) swaps the top
// entry — for steps that must not be returned to (a race that has been run, a splash screen).
// back(): the top modal first (its onBack), then the layers (a bottom sheet closes), then the screen's onBack,
// then the previous screen. Returns true if anything happened; false at a root with nothing to close.
const INPUT_ROUTES = {
  'input:tap': 'onTap',
  'input:down': 'onDown',
  'input:up': 'onUp',
  'input:dragstart': 'onDragStart',
  'input:drag': 'onDrag',
  'input:dragend': 'onDragEnd',
  'input:hold': 'onHold',
  'input:wheel': 'onWheel',
};

export class ScreenRouter {
  constructor(bus, { roots = [] } = {}) {
    this.bus = bus;
    this.screens = new Map();
    this.current = null;
    this.currentName = null;
    this.modal = null;
    this.layers = [];
    this.roots = new Set(roots);
    this.history = []; // [{ name, params }], the current screen last

    for (const [type, hook] of Object.entries(INPUT_ROUTES)) {
      bus.on(type, (p) => {
        if (this.modal?.active) {
          this.modal[hook]?.(p);
          return;
        }
        for (const layer of this.layers) if (layer.active && layer.handleInput(hook, p) === true) return;
        this.current?.[hook]?.(p);
      });
    }
  }

  register(name, screen) {
    this.screens.set(name, screen);
    return this;
  }

  go(name, params = {}, { replace = false } = {}) {
    const next = this.screens.get(name);
    if (!next) {
      console.error(`[ScreenRouter] unknown screen "${name}"`);
      return;
    }
    const prevName = this.currentName;
    this.previous = prevName;
    this.current?.exit?.();
    this.current = next;
    this.currentName = name;
    this._remember(name, params, replace);
    next.enter?.(params);
    this.bus.emit('screen:change', { from: prevName, to: name });
  }

  _remember(name, params, replace) {
    const h = this.history;
    if (this.roots.has(name)) h.length = 0;
    else {
      const i = h.findIndex((e) => e.name === name);
      if (i >= 0) h.length = i;
      else if (replace) h.pop();
    }
    h.push({ name, params: { ...params } });
  }

  // The screen back would go to (or null).
  get backTarget() {
    return this.history.length > 1 ? this.history[this.history.length - 2] : null;
  }

  back() {
    if (this.modal?.active) {
      this.modal.onBack?.();
      return true; // a modal always takes the back press (it may choose to ignore it)
    }
    for (const layer of this.layers) if (layer.active && layer.onBack?.() === true) return true;
    if (this.current?.onBack?.() === true) return true;
    // A screen opened with params.back (the series convention: "return to this screen") goes there, with
    // params.backParams — the same place its own "‹ Back" button goes.
    const here = this.history[this.history.length - 1];
    if (here?.params?.back && this.screens.has(here.params.back)) {
      this.go(here.params.back, here.params.backParams ?? {});
      return true;
    }
    const to = this.backTarget;
    if (!to) return false;
    this.go(to.name, to.params);
    return true;
  }

  update(dt) {
    this.current?.update?.(dt);
  }

  render(ctx, alpha) {
    this.current?.render?.(ctx, alpha);
  }
}
