/**
 * Accumulates focus time for one player. Credit is only given while `update(true, ...)`
 * has been called; the server clock is the only source of truth.
 */
export class StudyTracker {
  private visitMs = 0;
  private activeSince: number | null = null;

  constructor(private readonly onCredit: (ms: number, at: number) => void) {}

  update(active: boolean, now: number): void {
    if (this.activeSince !== null) {
      this.credit(now - this.activeSince, now);
      this.activeSince = active ? now : null;
    } else if (active) {
      this.activeSince = now;
    }
  }

  isActive(): boolean {
    return this.activeSince !== null;
  }

  liveVisitMs(now: number): number {
    const ongoing = this.activeSince === null ? 0 : Math.max(0, now - this.activeSince);
    return this.visitMs + ongoing;
  }

  private credit(ms: number, at: number): void {
    if (ms <= 0) return;
    this.visitMs += ms;
    this.onCredit(ms, at);
  }
}
