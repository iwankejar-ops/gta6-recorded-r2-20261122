// input.js — keyboard state, pressed-edge detection, mouse drag orbit.
// GRAND CITY 6 — original code, written for this entry.

export class Input {
  constructor(canvas) {
    this.keys = {};
    this.pressed = {};
    this.yawDelta = 0;
    this.pitchDelta = 0;
    this.wheelDelta = 0;
    this._dragging = false;
    this._lastX = 0;
    this._lastY = 0;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys[e.code] = true;
      this.pressed[e.code] = true;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    window.addEventListener('blur', () => { this.keys = {}; });

    canvas.addEventListener('pointerdown', (e) => {
      this._dragging = true;
      this._lastX = e.clientX;
      this._lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this._dragging) return;
      this.yawDelta += (e.clientX - this._lastX) * 0.005;
      this.pitchDelta += (e.clientY - this._lastY) * 0.004;
      this._lastX = e.clientX;
      this._lastY = e.clientY;
    });
    const stop = () => { this._dragging = false; };
    canvas.addEventListener('pointerup', stop);
    canvas.addEventListener('pointercancel', stop);
    canvas.addEventListener('wheel', (e) => {
      this.wheelDelta += e.deltaY;
      e.preventDefault();
    }, { passive: false });
  }

  down(code) { return !!this.keys[code]; }
  /** True once per key press; consumed after read. */
  wasPressed(code) {
    const v = !!this.pressed[code];
    if (v) this.pressed[code] = false;
    return v;
  }
  /** Movement axes: x = strafe/right, y = forward. */
  moveAxes() {
    let x = 0, y = 0;
    if (this.down('KeyW') || this.down('ArrowUp')) y += 1;
    if (this.down('KeyS') || this.down('ArrowDown')) y -= 1;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { x, y };
  }
  consumeMouse() {
    const d = { yaw: this.yawDelta, pitch: this.pitchDelta, wheel: this.wheelDelta };
    this.yawDelta = 0;
    this.pitchDelta = 0;
    this.wheelDelta = 0;
    return d;
  }
}
