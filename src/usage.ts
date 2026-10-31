// Usage counting for the owner's panel, without spending the scarce resource.
//
// Requests and database writes are counted in memory, per Worker isolate, and
// added to the day's row in D1 at most once a minute (one write per isolate per
// minute at the very most, however busy the product is). The panel shows the
// stored total plus what this isolate has not flushed yet. Counts held by an
// isolate that is shut down before its next flush are lost, so the panel is
// approximate (it can only under-count). Files stored are read from R2 itself.
import { utcDate } from './access.ts';

export const FLUSH_INTERVAL_MS = 60_000;
export const FREE_PLAN = {
  requestsPerDay: 100_000, // Workers free plan
  writesPerDay: 100_000, // D1 free plan, rows written
  storageBytes: 10 * 1000 ** 3, // R2 free plan, 10 GB (decimal, the lower reading)
};

export interface FlushBatch {
  day: string;
  requests: number;
  writes: number;
}

export class UsageMeter {
  private counts = new Map<string, { requests: number; writes: number }>();
  private lastFlush: number;

  constructor(now: number) {
    this.lastFlush = now;
  }

  private bucket(day: string) {
    let b = this.counts.get(day);
    if (!b) this.counts.set(day, (b = { requests: 0, writes: 0 }));
    return b;
  }

  recordRequest(now: number): void {
    this.bucket(utcDate(now)).requests++;
  }

  recordWrites(n: number, now: number): void {
    if (n > 0) this.bucket(utcDate(now)).writes += n;
  }

  pending(day: string): { requests: number; writes: number } {
    const b = this.counts.get(day);
    return { requests: b?.requests ?? 0, writes: b?.writes ?? 0 };
  }

  /** Returns one day's counts to write, and forgets them, when a minute has
   * passed since the last flush, or when an earlier day is still pending. */
  takeFlush(now: number): FlushBatch | null {
    const today = utcDate(now);
    const days = [...this.counts.keys()].sort();
    const oldest = days[0];
    if (!oldest) return null;
    if (oldest === today && now - this.lastFlush < FLUSH_INTERVAL_MS) return null;
    const b = this.counts.get(oldest)!;
    this.counts.delete(oldest);
    this.lastFlush = now;
    return { day: oldest, requests: b.requests, writes: b.writes };
  }

  restore(batch: FlushBatch): void {
    const b = this.bucket(batch.day);
    b.requests += batch.requests;
    b.writes += batch.writes;
  }
}

export function formatBytes(n: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = n;
  while (v >= 1000 && i < units.length - 1) {
    v /= 1000;
    i++;
  }
  const shown = i === 0 || v >= 100 ? String(Math.round(v)) : v.toFixed(1).replace(/\.0$/, '');
  return `${shown} ${units[i]}`;
}
