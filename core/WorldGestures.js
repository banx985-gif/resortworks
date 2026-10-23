// Moving around a "place" screen (any game): one finger pans the Camera, two fingers pinch-zoom it, the wheel zooms.
// A gesture that ever had two fingers down is marked multiTouch, so the screen can refuse to treat it as a tap or a
// long press. (Input itself never sends a tap after a drag, so a pan is never a tap either.)
// Feed it the screen's input hooks; it listens to 'input:move' itself (pinch fingers) while isActive() is true,
// and drops everything on 'loop:pause' (Input forgets its presses then, without an 'up').
//   onDown(p) → gestures.down(p)        onUp(p) → gestures.up(p)
//   onDragStart(p) → gestures.dragStart(p)   onDrag(p) → gestures.drag(p)   onDragEnd(p) → gestures.dragEnd(p)
//   onWheel(p) → gestures.wheel(p)      screen exit → gestures.reset()
// A press the screen keeps for itself (a bar, a sheet, a dragged object) is simply not passed to down().
import { PinchZoom } from './PinchZoom.js';

export class WorldGestures {
  constructor({ camera, bus, isActive = () => true, wheelStep = 1.1 }) {
    this.camera = camera;
    this.pinch = new PinchZoom(camera);
    this.wheelStep = wheelStep;
    this.dragId = null; // the finger that is panning
    this.multiTouch = false; // the current gesture has had two fingers down
    bus.on('input:move', (p) => {
      if (isActive() && this.pinch.points.has(p.id)) this.pinch.move(p.id, p.x, p.y);
    });
    bus.on('loop:pause', () => this.reset());
  }

  // Fingers currently down on the world.
  get fingers() {
    return this.pinch.points.size;
  }

  get pinching() {
    return this.pinch.active;
  }

  owns(id) {
    return this.pinch.points.has(id);
  }

  reset() {
    this.pinch.points.clear();
    this.pinch.last = null;
    this.camera.endDrag();
    this.dragId = null;
  }

  down(p) {
    this.pinch.down(p.id, p.x, p.y);
    if (this.pinch.points.size === 1) this.multiTouch = false; // a new gesture starts
    if (this.pinch.active) {
      this.multiTouch = true;
      this.camera.endDrag(); // two fingers: zoom instead of pan
      this.dragId = null;
    }
  }

  up(p) {
    this.pinch.up(p.id);
    if (p.id === this.dragId) {
      this.camera.endDrag();
      this.dragId = null;
    }
  }

  // Returns true when this drag started a pan.
  dragStart(p) {
    if (this.pinch.active || this.dragId !== null || !this.pinch.points.has(p.id)) return false;
    this.dragId = p.id;
    this.camera.beginDrag(p.startX, p.startY);
    this.camera.dragTo(p.x, p.y);
    return true;
  }

  drag(p) {
    if (this.pinch.active || !this.pinch.points.has(p.id)) return;
    if (this.dragId === null) {
      // One finger left after a pinch: carry on panning from here.
      this.dragId = p.id;
      this.camera.beginDrag(p.x, p.y);
    }
    if (p.id === this.dragId) this.camera.dragTo(p.x, p.y);
  }

  dragEnd(p) {
    if (!p.cancelled) return; // a normal release arrives through up()
    this.up(p);
  }

  wheel(p) {
    this.camera.zoomBy(p.deltaY > 0 ? 1 / this.wheelStep : this.wheelStep, p.x, p.y);
  }
}
