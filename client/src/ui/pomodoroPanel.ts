import { formatClock, tr, type PomodoroEvent, type PomodoroTimer } from '@focusroom/shared';
import { el } from './dom.js';

export interface PomodoroHooks {
  onChange(): void;
  onEvent(event: PomodoroEvent): void;
}

/** Big countdown with start/pause/reset/skip. Controls other than pause need a seat. */
export class PomodoroPanel {
  readonly element: HTMLElement;
  private readonly clock: HTMLElement;
  private readonly phase: HTMLElement;
  private readonly toggle: HTMLButtonElement;
  private readonly reset: HTMLButtonElement;
  private readonly skip: HTMLButtonElement;
  private readonly hint: HTMLElement;
  private lastClock = '';
  private seated = false;
  private cycles = 4;

  constructor(
    private readonly timer: PomodoroTimer,
    private readonly hooks: PomodoroHooks,
  ) {
    this.clock = el('div', { class: 'timer-display', attrs: { 'aria-live': 'off', role: 'timer' } });
    this.phase = el('div', { class: 'timer-phase' });
    this.toggle = el('button', { class: 'primary', text: tr.pomodoro.start, on: { click: () => this.onToggle() } });
    this.reset = el('button', { text: tr.pomodoro.reset, on: { click: () => this.onReset() } });
    this.skip = el('button', { text: tr.pomodoro.skip, on: { click: () => this.onSkip() } });
    this.hint = el('p', { class: 'hint', text: tr.pomodoro.needSeat });
    this.element = el('div', { class: 'panel collapsible-body' }, [
      el('div', { class: 'collapsible-head' }, [el('h2', { text: tr.pomodoro.heading })]),
      this.clock,
      this.phase,
      el('div', { class: 'row-buttons' }, [this.toggle, this.reset, this.skip]),
      this.hint,
    ]);
    this.refresh();
  }

  setSeated(seated: boolean): void {
    this.seated = seated;
    this.refresh();
  }

  setCycles(cycles: number): void {
    this.cycles = cycles;
    this.refresh();
  }

  /** Called every frame; advances the phase when a countdown finishes. */
  tick(): void {
    const event = this.timer.tick();
    if (event) {
      this.hooks.onEvent(event);
      this.hooks.onChange();
      this.refresh();
      return;
    }
    const text = formatClock(this.timer.remainingMsNow());
    if (text !== this.lastClock) {
      this.lastClock = text;
      this.clock.textContent = text;
    }
  }

  refresh(): void {
    const running = this.timer.status === 'running';
    const phaseName =
      this.timer.phase === 'focus'
        ? tr.pomodoro.focus
        : this.timer.phase === 'shortBreak'
          ? tr.pomodoro.shortBreak
          : tr.pomodoro.longBreak;
    this.phase.textContent = `${phaseName} · ${this.timer.completedFocusInCycle}/${this.cycles} tur`;
    this.toggle.textContent = running ? tr.pomodoro.pause : tr.pomodoro.start;
    this.reset.disabled = !this.seated;
    this.skip.disabled = !this.seated;
    this.toggle.disabled = !this.seated && !running;
    this.hint.hidden = this.seated;
    this.clock.textContent = formatClock(this.timer.remainingMsNow());
    this.lastClock = this.clock.textContent;
  }

  pauseIfRunning(): boolean {
    if (this.timer.status !== 'running') return false;
    this.timer.pause();
    this.refresh();
    this.hooks.onChange();
    return true;
  }

  private onToggle(): void {
    if (this.timer.status === 'running') this.timer.pause();
    else if (this.seated) this.timer.start();
    this.refresh();
    this.hooks.onChange();
  }

  private onReset(): void {
    this.timer.reset();
    this.refresh();
    this.hooks.onChange();
  }

  private onSkip(): void {
    this.timer.skip();
    this.refresh();
    this.hooks.onChange();
  }
}
