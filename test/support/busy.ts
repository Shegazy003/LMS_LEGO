// HK-1 (product-contract v2 on PIL-216, section 12): a test set-up statement
// run beside the running Worker can meet "database is locked: SQLITE_BUSY"
// (main run 43904114514, wave-1 step AT-1.6). A busy statement is not
// committed, so it is run again: up to `retries` more times, after a short
// wait, with a warning each time. Any other error is thrown at once.
// Test-only: nothing under src/ changes.

export type Sql = (query: string) => Promise<Record<string, unknown>[]>;

const isBusy = (err: unknown) => /SQLITE_BUSY|database is locked/i.test(String((err as Error)?.message ?? err));

export function withBusyRetry(
  sql: Sql,
  opts: { retries?: number; waitMs?: number; warn?: (message: string) => void } = {},
): Sql {
  const retries = opts.retries ?? 3;
  const waitMs = opts.waitMs ?? 500;
  const warn = opts.warn ?? ((m: string) => process.stderr.write(`::warning::${m}\n`));
  return async (query) => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await sql(query);
      } catch (err) {
        if (!isBusy(err) || attempt >= retries) throw err;
        warn(`test set-up met SQLITE_BUSY; retry ${attempt + 1} of ${retries}: ${query.slice(0, 80).replace(/\s+/g, ' ')}`);
        await new Promise((r) => setTimeout(r, waitMs * (attempt + 1)));
      }
    }
  };
}
