export type PomodoroPhase = 'focus' | 'shortBreak' | 'longBreak';
export type PomodoroStatus = 'idle' | 'running' | 'paused';

export interface PomodoroSettings {
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  cyclesBeforeLongBreak: number;
}

export interface PomodoroEvent {
  type: 'focus-completed' | 'break-completed';
  phase: PomodoroPhase;
}

export const DEFAULT_POMODORO: PomodoroSettings = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  cyclesBeforeLongBreak: 4,
};

/** Pure pomodoro state machine. Time is read through an injected clock so it can be tested. */
export class PomodoroTimer {
  private phaseValue: PomodoroPhase = 'focus';
  private statusValue: PomodoroStatus = 'idle';
  private remainingMs: number;
  private endsAt = 0;
  private focusInCycle = 0;
  private focusTotal = 0;

  constructor(
    private settings: PomodoroSettings = DEFAULT_POMODORO,
    private readonly now: () => number = Date.now,
  ) {
    this.remainingMs = this.durationOf('focus');
  }

  get phase(): PomodoroPhase {
    return this.phaseValue;
  }

  get status(): PomodoroStatus {
    return this.statusValue;
  }

  get completedFocusTotal(): number {
    return this.focusTotal;
  }

  get completedFocusInCycle(): number {
    return this.focusInCycle;
  }

  get isFocusRunning(): boolean {
    return this.statusValue === 'running' && this.phaseValue === 'focus';
  }

  remainingMsNow(): number {
    if (this.statusValue === 'running') return Math.max(0, this.endsAt - this.now());
    return this.remainingMs;
  }

  start(): void {
    if (this.statusValue === 'running') return;
    this.endsAt = this.now() + this.remainingMs;
    this.statusValue = 'running';
  }

  pause(): void {
    if (this.statusValue !== 'running') return;
    this.remainingMs = Math.max(0, this.endsAt - this.now());
    this.statusValue = 'paused';
  }

  reset(): void {
    this.statusValue = 'idle';
    this.remainingMs = this.durationOf(this.phaseValue);
  }

  skip(): void {
    this.enterPhase(this.nextPhase());
  }

  updateSettings(settings: PomodoroSettings): void {
    this.settings = settings;
    if (this.statusValue === 'idle') this.remainingMs = this.durationOf(this.phaseValue);
  }

  /** Call regularly. Returns an event when a phase completes. */
  tick(): PomodoroEvent | null {
    if (this.statusValue !== 'running') return null;
    if (this.now() < this.endsAt) return null;
    const finished = this.phaseValue;
    if (finished === 'focus') {
      this.focusTotal += 1;
      this.focusInCycle += 1;
    } else if (finished === 'longBreak') {
      this.focusInCycle = 0;
    }
    this.enterPhase(this.nextPhase());
    return { type: finished === 'focus' ? 'focus-completed' : 'break-completed', phase: finished };
  }

  private nextPhase(): PomodoroPhase {
    if (this.phaseValue === 'focus') {
      return this.focusInCycle >= this.settings.cyclesBeforeLongBreak ? 'longBreak' : 'shortBreak';
    }
    return 'focus';
  }

  private enterPhase(phase: PomodoroPhase): void {
    this.phaseValue = phase;
    this.statusValue = 'idle';
    this.remainingMs = this.durationOf(phase);
  }

  private durationOf(phase: PomodoroPhase): number {
    const minutes =
      phase === 'focus'
        ? this.settings.focusMinutes
        : phase === 'shortBreak'
          ? this.settings.shortBreakMinutes
          : this.settings.longBreakMinutes;
    return minutes * 60_000;
  }
}

export function formatClock(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
