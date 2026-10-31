// Usage counting for the owner's panel. Not implemented yet.
export const FLUSH_INTERVAL_MS: number = 0;
export const FREE_PLAN = { requestsPerDay: 0, writesPerDay: 0, storageBytes: 0 };
export interface FlushBatch {
  day: string;
  requests: number;
  writes: number;
}
export class UsageMeter {
  constructor(_now: number) {}
  recordRequest(_now: number): void {
    throw new Error('not implemented');
  }
  recordWrites(_n: number, _now: number): void {
    throw new Error('not implemented');
  }
  takeFlush(_now: number): FlushBatch | null {
    throw new Error('not implemented');
  }
  restore(_batch: FlushBatch): void {
    throw new Error('not implemented');
  }
  pending(_day: string): { requests: number; writes: number } {
    throw new Error('not implemented');
  }
}
export function formatBytes(_n: number): string {
  throw new Error('not implemented');
}
