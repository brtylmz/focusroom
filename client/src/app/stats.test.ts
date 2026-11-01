import { describe, expect, it } from 'vitest';
import { StatsStore, type StatsStorage } from './stats.js';

function memoryStorage(): StatsStorage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

const DAY = 24 * 60 * 60 * 1000;
const NOON = Date.UTC(2026, 5, 10, 12);

describe('StatsStore', () => {
  it('accumulates focus time and pomodoros for the current day', () => {
    const store = new StatsStore(memoryStorage(), () => NOON);
    store.addFocus(10 * 60_000);
    store.addFocus(5 * 60_000);
    store.addPomodoro();
    expect(store.today()).toEqual({ focusMs: 15 * 60_000, pomodoros: 1 });
  });

  it('sums the last seven days for the weekly total and ignores older days', () => {
    const now = NOON;
    const store = new StatsStore(memoryStorage(), () => now);
    store.addFocus(60_000, now);
    store.addFocus(2 * 60_000, now - 6 * DAY);
    store.addFocus(100 * 60_000, now - 8 * DAY);
    expect(store.weekFocusMs()).toBe(3 * 60_000);
  });

  it('counts consecutive focus days and keeps the streak alive until the end of today', () => {
    let now = NOON;
    const store = new StatsStore(memoryStorage(), () => now);
    store.addFocus(30 * 60_000, now - 2 * DAY);
    store.addFocus(30 * 60_000, now - 1 * DAY);
    expect(store.streak()).toBe(2);
    store.addFocus(30 * 60_000, now);
    expect(store.streak()).toBe(3);
    now += DAY;
    expect(store.streak()).toBe(3);
  });

  it('does not count days with less than a minute of focus toward the streak', () => {
    const now = NOON;
    const store = new StatsStore(memoryStorage(), () => now);
    store.addFocus(10_000, now - DAY);
    expect(store.streak()).toBe(0);
  });

  it('resets all stored statistics', () => {
    const store = new StatsStore(memoryStorage(), () => NOON);
    store.addFocus(60_000);
    store.reset();
    expect(store.today()).toEqual({ focusMs: 0, pomodoros: 0 });
  });
});
