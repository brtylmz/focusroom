import { dateKeyOf } from '@focusroom/shared';

export interface DayRecord {
  focusMs: number;
  pomodoros: number;
}

type DayMap = Record<string, DayRecord>;

export interface StatsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const STATS_KEY = 'focusroom.stats.v1';
const STREAK_MIN_MS = 60_000;

/** Personal focus statistics kept in localStorage; the clock and storage are injectable for tests. */
export class StatsStore {
  constructor(
    private readonly storage: StatsStorage,
    private readonly now: () => number = Date.now,
  ) {}

  addFocus(ms: number, at: number = this.now()): void {
    if (ms <= 0) return;
    this.update(dateKeyOf(at), (r) => ({ ...r, focusMs: r.focusMs + ms }));
  }

  addPomodoro(at: number = this.now()): void {
    this.update(dateKeyOf(at), (r) => ({ ...r, pomodoros: r.pomodoros + 1 }));
  }

  today(): DayRecord {
    return this.read()[dateKeyOf(this.now())] ?? emptyDay();
  }

  weekFocusMs(): number {
    return this.lastDays(7).reduce((sum, d) => sum + d.focusMs, 0);
  }

  /** Consecutive days with at least one minute of focus, ending today (or yesterday if today is still empty). */
  streak(): number {
    const days = this.read();
    let cursor = this.now();
    if ((days[dateKeyOf(cursor)]?.focusMs ?? 0) < STREAK_MIN_MS) cursor -= DAY_MS;
    let count = 0;
    while ((days[dateKeyOf(cursor)]?.focusMs ?? 0) >= STREAK_MIN_MS) {
      count += 1;
      cursor -= DAY_MS;
    }
    return count;
  }

  lastDays(count: number): DayRecord[] {
    const days = this.read();
    const out: DayRecord[] = [];
    for (let i = 0; i < count; i++) {
      out.push(days[dateKeyOf(this.now() - i * DAY_MS)] ?? emptyDay());
    }
    return out;
  }

  reset(): void {
    this.storage.removeItem(STATS_KEY);
  }

  private update(key: string, change: (r: DayRecord) => DayRecord): void {
    const days = this.read();
    days[key] = change(days[key] ?? emptyDay());
    this.storage.setItem(STATS_KEY, JSON.stringify(days));
  }

  private read(): DayMap {
    try {
      const raw = this.storage.getItem(STATS_KEY);
      return raw ? (JSON.parse(raw) as DayMap) : {};
    } catch {
      return {};
    }
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

function emptyDay(): DayRecord {
  return { focusMs: 0, pomodoros: 0 };
}

export function browserStatsStore(): StatsStore {
  return new StatsStore(localStorage);
}
