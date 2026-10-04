/**
 * A token bucket, sized to a provider's published shape.
 *
 * Some APIs meter every authenticated call against a Read or a Write bucket that refills
 * continuously with a burst; e.g. Kalshi's default is a cost of 10 tokens and a three-second
 * burst, and a `429` from it carries no `Retry-After`, so a backoff is blind.
 */
export class TokenBucket {
  private tokens: number;
  private last = Date.now();

  constructor(
    private readonly ratePerSec: number,
    private readonly burst: number,
  ) {
    this.tokens = burst;
  }

  private refill(now: number): void {
    this.tokens = Math.min(this.burst, this.tokens + ((now - this.last) / 1000) * this.ratePerSec);
    this.last = now;
  }

  /** Take `cost` if available; false without consuming otherwise. */
  tryTake(cost: number, now = Date.now()): boolean {
    this.refill(now);
    if (this.tokens < cost) return false;
    this.tokens -= cost;
    return true;
  }

  /** Wait until `cost` tokens are available, then take them. */
  async take(cost = 1): Promise<void> {
    for (;;) {
      const now = Date.now();
      this.refill(now);
      if (this.tokens >= cost) {
        this.tokens -= cost;
        return;
      }
      const need = cost - this.tokens;
      const waitMs = Math.max(10, Math.ceil((need / this.ratePerSec) * 1000));
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }

  get available(): number {
    this.refill(Date.now());
    return this.tokens;
  }
}
