export interface MoveAxis {
  /** -1 (back) to 1 (forward), relative to the camera. */
  forward: number;
  /** -1 (left) to 1 (right), relative to the camera. */
  strafe: number;
}

const FORWARD_KEYS = ['KeyW', 'ArrowUp'];
const BACK_KEYS = ['KeyS', 'ArrowDown'];
const LEFT_KEYS = ['KeyA', 'ArrowLeft'];
const RIGHT_KEYS = ['KeyD', 'ArrowRight'];
const GAME_KEYS = new Set([...FORWARD_KEYS, ...BACK_KEYS, ...LEFT_KEYS, ...RIGHT_KEYS, 'Space', 'Tab']);

/** Keyboard state for the room. Ignores keys while a text field has focus so chat typing never moves the avatar. */
export class Keyboard {
  private readonly down = new Set<string>();
  private readonly pressed = new Set<string>();
  private touchAxis: MoveAxis = { forward: 0, strafe: 0 };

  constructor(private readonly isTyping: () => boolean) {}

  attach(): () => void {
    const onDown = (e: KeyboardEvent) => {
      if (this.isTyping()) return;
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
    };
    const onUp = (e: KeyboardEvent) => {
      this.down.delete(e.code);
    };
    const onBlur = () => this.down.clear();
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
    };
  }

  setTouchAxis(axis: MoveAxis): void {
    this.touchAxis = axis;
  }

  isDown(codes: string[]): boolean {
    return codes.some((c) => this.down.has(c));
  }

  /** True once per key press; cleared at the end of each frame. */
  wasPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  axis(): MoveAxis {
    const keyForward = this.isDown(FORWARD_KEYS) ? 1 : this.isDown(BACK_KEYS) ? -1 : 0;
    const keyStrafe = this.isDown(RIGHT_KEYS) ? 1 : this.isDown(LEFT_KEYS) ? -1 : 0;
    const forward = clamp(keyForward + this.touchAxis.forward);
    const strafe = clamp(keyStrafe + this.touchAxis.strafe);
    return { forward, strafe };
  }

  hasMovementInput(): boolean {
    const a = this.axis();
    return a.forward !== 0 || a.strafe !== 0;
  }

  endFrame(): void {
    this.pressed.clear();
  }
}

function clamp(v: number): number {
  return Math.max(-1, Math.min(1, v));
}
