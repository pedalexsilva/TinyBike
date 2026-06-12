/**
 * Unified input layer. The game only ever reads a normalized InputFrame:
 *   { throttle: 0..1, brake: 0..1, steer: -1..1, boostPressed: edge }
 * Desktop: WASD/arrows + Shift/Space for boost.
 * Mobile: auto-throttle, floating virtual joystick (left), boost button (right).
 */
export interface InputFrame {
  throttle: number;
  brake: number;
  steer: number;
  /** True only on the frame the boost was requested (edge-triggered). */
  boostPressed: boolean;
}

export class Input {
  readonly isTouch: boolean;

  private keys = new Set<string>();
  private boostQueued = false;
  private touchSteer = 0;
  private touchSteerActive = false;

  private readonly frame: InputFrame = {
    throttle: 0,
    brake: 0,
    steer: 0,
    boostPressed: false,
  };

  constructor() {
    this.isTouch = window.matchMedia('(pointer: coarse)').matches;

    window.addEventListener('keydown', (e) => {
      if (
        e.code.startsWith('Arrow') ||
        e.code === 'Space' ||
        e.code === 'ShiftLeft' ||
        e.code === 'ShiftRight'
      ) {
        e.preventDefault();
      }
      if (!e.repeat && (e.code === 'Space' || e.code.startsWith('Shift'))) {
        this.boostQueued = true;
      }
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  /** Called by touch UI (boost button). */
  queueBoost(): void {
    this.boostQueued = true;
  }

  /** Called by touch UI (virtual joystick). */
  setTouchSteer(value: number, active: boolean): void {
    this.touchSteer = Math.max(-1, Math.min(1, value));
    this.touchSteerActive = active;
  }

  /** Samples the current input state. Call once per frame. */
  sample(): InputFrame {
    const k = this.keys;
    const f = this.frame;

    if (this.isTouch) {
      f.throttle = 1; // auto-pedal on mobile
      f.brake = 0;
      f.steer = this.touchSteerActive ? this.touchSteer : 0;
    } else {
      f.throttle = k.has('KeyW') || k.has('ArrowUp') ? 1 : 0;
      f.brake = k.has('KeyS') || k.has('ArrowDown') ? 1 : 0;
      const left = k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0;
      const right = k.has('KeyD') || k.has('ArrowRight') ? 1 : 0;
      f.steer = right - left;
    }

    f.boostPressed = this.boostQueued;
    this.boostQueued = false;
    return f;
  }
}
