import { describe, expect, it } from 'vitest';
import { PomodoroTimer, DEFAULT_POMODORO, formatClock } from './pomodoro.js';

function fakeClock(start = 0) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

const MIN = 60_000;

describe('PomodoroTimer', () => {
  it('starts idle on a full focus phase', () => {
    const clock = fakeClock();
    const timer = new PomodoroTimer(DEFAULT_POMODORO, clock.now);
    expect(timer.phase).toBe('focus');
    expect(timer.status).toBe('idle');
    expect(timer.remainingMsNow()).toBe(25 * MIN);
  });

  it('counts down while running and keeps time across pause/resume', () => {
    const clock = fakeClock();
    const timer = new PomodoroTimer(DEFAULT_POMODORO, clock.now);
    timer.start();
    clock.advance(10 * MIN);
    timer.pause();
    expect(timer.status).toBe('paused');
    expect(timer.remainingMsNow()).toBe(15 * MIN);
    clock.advance(5 * MIN);
    expect(timer.remainingMsNow()).toBe(15 * MIN);
    timer.start();
    clock.advance(15 * MIN);
    expect(timer.tick()?.type).toBe('focus-completed');
  });

  it('moves to a short break after a focus phase and counts completed focus sessions', () => {
    const clock = fakeClock();
    const timer = new PomodoroTimer(DEFAULT_POMODORO, clock.now);
    timer.start();
    clock.advance(25 * MIN);
    expect(timer.tick()).toEqual({ type: 'focus-completed', phase: 'focus' });
    expect(timer.phase).toBe('shortBreak');
    expect(timer.status).toBe('idle');
    expect(timer.completedFocusTotal).toBe(1);
  });

  it('uses a long break after the configured number of focus cycles', () => {
    const clock = fakeClock();
    const timer = new PomodoroTimer({ ...DEFAULT_POMODORO, cyclesBeforeLongBreak: 2 }, clock.now);
    timer.start();
    clock.advance(25 * MIN);
    timer.tick();
    timer.start();
    clock.advance(5 * MIN);
    timer.tick();
    expect(timer.phase).toBe('focus');
    timer.start();
    clock.advance(25 * MIN);
    timer.tick();
    expect(timer.phase).toBe('longBreak');
    expect(timer.completedFocusTotal).toBe(2);
  });

  it('resets the cycle after a long break completes', () => {
    const clock = fakeClock();
    const timer = new PomodoroTimer({ ...DEFAULT_POMODORO, cyclesBeforeLongBreak: 1 }, clock.now);
    timer.start();
    clock.advance(25 * MIN);
    timer.tick();
    expect(timer.phase).toBe('longBreak');
    timer.start();
    clock.advance(15 * MIN);
    expect(timer.tick()).toEqual({ type: 'break-completed', phase: 'longBreak' });
    expect(timer.phase).toBe('focus');
    expect(timer.completedFocusInCycle).toBe(0);
  });

  it('reports focus running only while the focus phase is running', () => {
    const clock = fakeClock();
    const timer = new PomodoroTimer(DEFAULT_POMODORO, clock.now);
    expect(timer.isFocusRunning).toBe(false);
    timer.start();
    expect(timer.isFocusRunning).toBe(true);
    timer.pause();
    expect(timer.isFocusRunning).toBe(false);
  });

  it('skip and reset change phase or time without counting a completed focus', () => {
    const clock = fakeClock();
    const timer = new PomodoroTimer(DEFAULT_POMODORO, clock.now);
    timer.start();
    clock.advance(3 * MIN);
    timer.skip();
    expect(timer.phase).toBe('shortBreak');
    expect(timer.completedFocusTotal).toBe(0);
    timer.start();
    clock.advance(2 * MIN);
    timer.reset();
    expect(timer.status).toBe('idle');
    expect(timer.remainingMsNow()).toBe(5 * MIN);
  });

  it('applies new settings to an idle timer', () => {
    const clock = fakeClock();
    const timer = new PomodoroTimer(DEFAULT_POMODORO, clock.now);
    timer.updateSettings({ ...DEFAULT_POMODORO, focusMinutes: 50 });
    expect(timer.remainingMsNow()).toBe(50 * MIN);
  });
});

describe('formatClock', () => {
  it('formats milliseconds as mm:ss rounding up partial seconds', () => {
    expect(formatClock(25 * MIN)).toBe('25:00');
    expect(formatClock(59_001)).toBe('01:00');
    expect(formatClock(0)).toBe('00:00');
  });
});
