export class SlidingWindowLimiter {
  private hits: number[] = [];

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  allow(now: number): boolean {
    const cutoff = now - this.windowMs;
    while (this.hits.length > 0 && this.hits[0]! <= cutoff) this.hits.shift();
    if (this.hits.length >= this.max) return false;
    this.hits.push(now);
    return true;
  }
}
