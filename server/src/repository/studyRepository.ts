export interface StudyRepository {
  addFocusMs(playerId: string, dateKey: string, ms: number): void;
  getFocusMs(playerId: string, dateKey: string): number;
}

/** Process-memory implementation. Replace with a database-backed class without touching the rooms. */
export class InMemoryStudyRepository implements StudyRepository {
  private readonly totals = new Map<string, number>();
  private currentDay = '';

  addFocusMs(playerId: string, dateKey: string, ms: number): void {
    if (dateKey !== this.currentDay) this.startDay(dateKey);
    const key = keyOf(dateKey, playerId);
    this.totals.set(key, (this.totals.get(key) ?? 0) + ms);
  }

  getFocusMs(playerId: string, dateKey: string): number {
    return this.totals.get(keyOf(dateKey, playerId)) ?? 0;
  }

  private startDay(dateKey: string): void {
    this.currentDay = dateKey;
    for (const key of this.totals.keys()) {
      if (!key.startsWith(`${dateKey}|`)) this.totals.delete(key);
    }
  }
}

function keyOf(dateKey: string, playerId: string): string {
  return `${dateKey}|${playerId}`;
}
