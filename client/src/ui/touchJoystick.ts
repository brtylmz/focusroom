import type { MoveAxis } from '../systems/input.js';
import { el } from './dom.js';

const RADIUS = 52;

/** On-screen stick for touch devices. Reports a camera-relative axis in the range -1..1. */
export class TouchJoystick {
  readonly element: HTMLElement;
  private readonly knob: HTMLElement;
  private activePointer: number | null = null;
  private centerX = 0;
  private centerY = 0;

  constructor(
    parent: HTMLElement,
    private readonly onAxis: (axis: MoveAxis) => void,
  ) {
    this.knob = el('div', { class: 'joystick-knob' });
    this.element = el('div', { class: 'joystick', attrs: { 'aria-hidden': 'true' } }, [this.knob]);
    if (window.matchMedia?.('(pointer: coarse)').matches) this.element.classList.add('visible');
    parent.append(this.element);

    this.element.addEventListener('pointerdown', (e) => {
      this.activePointer = e.pointerId;
      this.element.setPointerCapture(e.pointerId);
      const rect = this.element.getBoundingClientRect();
      this.centerX = rect.left + rect.width / 2;
      this.centerY = rect.top + rect.height / 2;
      this.handle(e);
    });
    this.element.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.activePointer) this.handle(e);
    });
    const release = (e: PointerEvent) => {
      if (e.pointerId !== this.activePointer) return;
      this.activePointer = null;
      this.knob.style.transform = '';
      this.onAxis({ forward: 0, strafe: 0 });
    };
    this.element.addEventListener('pointerup', release);
    this.element.addEventListener('pointercancel', release);
  }

  private handle(e: PointerEvent): void {
    const dx = e.clientX - this.centerX;
    const dy = e.clientY - this.centerY;
    const dist = Math.hypot(dx, dy);
    const scale = dist > RADIUS ? RADIUS / dist : 1;
    const x = (dx * scale) / RADIUS;
    const y = (dy * scale) / RADIUS;
    this.knob.style.transform = `translate(${dx * scale}px, ${dy * scale}px)`;
    this.onAxis({ strafe: x, forward: -y });
  }
}
