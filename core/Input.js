// Pointer Events → logical coordinates, turned into simple gestures.
// Works the same for mouse, touch and pen. Emits on the bus:
//   input:down, input:move, input:up         (raw, every pointer)
//   input:tap                                (quick press + release without moving)
//   input:dragstart, input:drag, input:dragend
//   input:hold                               (pressed still for holdMs)
//   input:wheel                              (mouse wheel / trackpad: { x, y, deltaY } — zoom on desktop)
// Every payload has logical { x, y, id, pointerType }; drag payloads also have dx/dy and startX/startY.
export class Input {
  constructor(renderer, bus, { dragThreshold = 24, holdMs = 500, tapMaxMs = 400 } = {}) {
    this.renderer = renderer;
    this.bus = bus;
    this.canvas = renderer.canvas;
    this.dragThreshold = dragThreshold; // logical units
    this.holdMs = holdMs;
    this.tapMaxMs = tapMaxMs;
    this.enabled = true;

    this.pointers = new Map(); // id → state
    this.last = null; // last known pointer position, logical

    this._onDown = this._onDown.bind(this);
    this._onMove = this._onMove.bind(this);
    this._onUp = this._onUp.bind(this);
    this._onCancel = this._onCancel.bind(this);

    const c = this.canvas;
    c.addEventListener('pointerdown', this._onDown);
    c.addEventListener('pointermove', this._onMove);
    c.addEventListener('pointerup', this._onUp);
    c.addEventListener('pointercancel', this._onCancel);
    c.addEventListener('lostpointercapture', this._onCancel);
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener(
      'wheel',
      (e) => {
        if (!this.enabled) return;
        e.preventDefault();
        this.bus.emit('input:wheel', this._payload(e, { deltaY: e.deltaY }));
      },
      { passive: false },
    );
  }

  _payload(e, extra) {
    const p = this.renderer.toLogical(e.clientX, e.clientY);
    return { x: p.x, y: p.y, id: e.pointerId, pointerType: e.pointerType, ...extra };
  }

  _onDown(e) {
    if (!this.enabled) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* capture is optional */
    }
    const p = this._payload(e);
    const state = {
      id: e.pointerId,
      startX: p.x,
      startY: p.y,
      x: p.x,
      y: p.y,
      startTime: performance.now(),
      dragging: false,
      held: false,
      holdTimer: 0,
    };
    state.holdTimer = setTimeout(() => {
      if (!state.dragging && this.pointers.get(state.id) === state) {
        state.held = true;
        this.bus.emit('input:hold', { x: state.x, y: state.y, id: state.id, pointerType: e.pointerType });
      }
    }, this.holdMs);
    this.pointers.set(e.pointerId, state);
    this.last = p;
    this.bus.emit('input:down', p);
  }

  _onMove(e) {
    const p = this._payload(e);
    this.last = p;
    const state = this.pointers.get(e.pointerId);
    if (!state) {
      this.bus.emit('input:move', p); // hover (mouse)
      return;
    }
    e.preventDefault();
    const dx = p.x - state.x;
    const dy = p.y - state.y;
    state.x = p.x;
    state.y = p.y;
    this.bus.emit('input:move', p);

    if (!state.dragging) {
      // A hold can still turn into a drag (press, wait, then move — e.g. picking up furniture).
      const dist = Math.hypot(p.x - state.startX, p.y - state.startY);
      if (dist > this.dragThreshold) {
        state.dragging = true;
        clearTimeout(state.holdTimer);
        this.bus.emit('input:dragstart', { ...p, startX: state.startX, startY: state.startY, dx: 0, dy: 0 });
      }
    }
    if (state.dragging) {
      this.bus.emit('input:drag', { ...p, startX: state.startX, startY: state.startY, dx, dy });
    }
  }

  _onUp(e) {
    const state = this.pointers.get(e.pointerId);
    if (!state) return;
    e.preventDefault();
    const p = this._payload(e);
    this._end(state);
    this.bus.emit('input:up', p);
    if (state.dragging) {
      this.bus.emit('input:dragend', { ...p, startX: state.startX, startY: state.startY, dx: 0, dy: 0 });
    } else if (!state.held && performance.now() - state.startTime <= this.tapMaxMs) {
      // Report the tap where the finger first went down: that is the spot the player aimed at.
      this.bus.emit('input:tap', { ...p, x: state.startX, y: state.startY });
    }
  }

  _onCancel(e) {
    const state = this.pointers.get(e.pointerId);
    if (!state) return;
    this._end(state);
    if (state.dragging) {
      this.bus.emit('input:dragend', { x: state.x, y: state.y, id: state.id, cancelled: true, dx: 0, dy: 0 });
    }
  }

  _end(state) {
    clearTimeout(state.holdTimer);
    this.pointers.delete(state.id);
  }

  // Drop all active presses (e.g. when the game pauses). Open drags get a cancelled dragend.
  reset() {
    for (const state of this.pointers.values()) {
      clearTimeout(state.holdTimer);
      if (state.dragging) {
        this.bus.emit('input:dragend', { x: state.x, y: state.y, id: state.id, cancelled: true, dx: 0, dy: 0 });
      }
    }
    this.pointers.clear();
  }
}
