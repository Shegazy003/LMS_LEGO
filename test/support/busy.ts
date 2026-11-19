// The one shared retry helper for the test set-up's `wrangler d1 execute` calls.
//
// HK-1 (product-contract v2 on PIL-216, section 12) and LMS housekeeping Q1
// (PIL-243): CI met two infrastructure flakes in these calls,
// "database is locked: SQLITE_BUSY" beside the running Worker (main run
// 43904114514; rollback job runs 44432026699, 44452874419) and a connection
// reset, ECONNRESET (wave-1 job, run 44443909726).
//
// - Only an error whose text (message, stdout or stderr) holds SQLITE_BUSY or
//   ECONNRESET is retried; any other error is thrown at once, unchanged.
// - At most RETRIES (3) more attempts, after a short wait (0.5 s, 1 s, 1.5 s),
//   with a warning each time. After the last one the original error is thrown
//   unchanged, so the test and its CI step fail (non-zero exit).
// - A helper inside another (startProduct().sql over worker.sql) does not
//   multiply the count: an error that has used up its retries is not retried again.
// Test-only: nothing under src/ changes.

export type Sql = (query: string) => Promise<Record<string, unknown>[]>;

/** The fixed number of extra attempts. */
export const RETRIES = 3;

export interface RetryOptions {
  /** The first wait in ms (then twice, three times it); 500 unless a test asks for less. */
  waitMs?: number;
  warn?: (message: string) => void;
  /** What was run, for the warning (a statement or a file). */
  label?: string;
}

const FLAKE = /SQLITE_BUSY|ECONNRESET/;
const USED_UP = Symbol.for('lms-lego.d1-retry.used-up');

function textOf(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as { message?: unknown; stdout?: unknown; stderr?: unknown };
    return [e.message, e.stdout, e.stderr].map((x) => (x == null ? '' : String(x))).join('\n');
  }
  return String(err);
}

/** SQLITE_BUSY or ECONNRESET when the error is one of the two flakes (and has retries left); null otherwise. */
export function flakeOf(err: unknown): string | null {
  if (err && typeof err === 'object' && (err as Record<symbol, unknown>)[USED_UP]) return null;
  const m = FLAKE.exec(textOf(err));
  return m ? m[0] : null;
}

/** After a failed attempt: how long to wait before the next one, or throws the original error. */
function nextWait(err: unknown, attempt: number, opts: RetryOptions): number {
  const kind = flakeOf(err);
  if (!kind) throw err;
  const warn = opts.warn ?? ((m: string) => process.stderr.write(`::warning::${m}\n`));
  const label = (opts.label ?? '').slice(0, 80).replace(/\s+/g, ' ');
  if (attempt >= RETRIES) {
    if (err && typeof err === 'object') {
      try { Object.defineProperty(err, USED_UP, { value: true }); } catch { /* a frozen error is still thrown */ }
    }
    warn(`test set-up still met ${kind} after ${RETRIES} retries; failing with the original error: ${label}`);
    throw err;
  }
  warn(`test set-up met ${kind}; retry ${attempt + 1} of ${RETRIES}: ${label}`);
  return (opts.waitMs ?? 500) * (attempt + 1);
}

/** Runs an async `wrangler d1 execute` call (spawn), retrying only SQLITE_BUSY / ECONNRESET. */
export async function retryD1<T>(run: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await run();
    } catch (err) {
      const ms = nextWait(err, attempt, opts);
      await new Promise((r) => setTimeout(r, ms));
    }
  }
}

/** Runs a synchronous `wrangler d1 execute` call (execFileSync), retrying only SQLITE_BUSY / ECONNRESET. */
export function retryD1Sync<T>(run: () => T, opts: RetryOptions = {}): T {
  for (let attempt = 0; ; attempt++) {
    try {
      return run();
    } catch (err) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, nextWait(err, attempt, opts));
    }
  }
}

/** A statement runner whose statements go through retryD1 (HK-1: startProduct().sql). */
export function withBusyRetry(sql: Sql, opts: Omit<RetryOptions, 'label'> = {}): Sql {
  return (query) => retryD1(() => sql(query), { ...opts, label: query });
}
