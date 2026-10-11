import type { IncomingMessage } from 'node:http';

/**
 * Counts failed attempts per client, e.g. wrong passwords, and blocks a client that fails too
 * often within a time window. A success does not reset the count, so mixing in a right answer
 * does not buy more guesses.
 */
export class Attempts {
  private readonly failures = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  /** Seconds until the client may try again, or 0 if it may try now. */
  retryAfter(key: string, now = Date.now()): number {
    const times = this.recent(key, now);
    if (times.length < this.max) return 0;
    return Math.ceil(((times[0] ?? now) + this.windowMs - now) / 1000);
  }

  fail(key: string, now = Date.now()): void {
    const times = this.recent(key, now);
    times.push(now);
    this.failures.set(key, times);
    if (this.failures.size > 10_000) this.prune(now);
  }

  private recent(key: string, now: number): number[] {
    return (this.failures.get(key) ?? []).filter((t) => t > now - this.windowMs);
  }

  private prune(now: number): void {
    for (const [key, times] of this.failures) {
      if (times.every((t) => t <= now - this.windowMs)) this.failures.delete(key);
    }
  }
}

/**
 * The address a request comes from. Behind a reverse proxy every request comes from the proxy,
 * so with trustProxy the address the proxy passes on counts instead. Only switch that on when
 * a proxy sets the header, because otherwise any client could send it.
 */
export function clientAddress(req: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const real = req.headers['x-real-ip'];
    if (typeof real === 'string' && real.trim()) return real.trim();
    const forwarded = req.headers['x-forwarded-for'];
    // The proxy appends the address it saw; earlier entries come from the client.
    const last = typeof forwarded === 'string' ? forwarded.split(',').pop()?.trim() : undefined;
    if (last) return last;
  }
  return req.socket.remoteAddress ?? 'unknown';
}
