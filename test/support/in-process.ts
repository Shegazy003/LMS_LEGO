// The product's real router (src/app.ts) run inside the test process, for
// tests that must step between two requests at an exact database statement
// (hardening task H-1: the re-hash race) or read every line the product logs
// (the no-secrets guard). D1 is the product's own schema (every migration in
// migrations/) on SQLite, the engine D1 runs, as in
// test/unit/session-refresh.test.ts; R2 is an in-memory map. Requests reach
// the router through fetch() on a private address, so the usual Client
// (test/support/http.ts) and seed helpers work unchanged. No Wrangler, no
// network, no Cloudflare account.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const root = fileURLToPath(new URL('../..', import.meta.url));
type Param = string | number | null;

/** Called around every database statement: before it runs, and after it ran. */
export interface StatementHooks {
  before?(sql: string, params: Param[]): Promise<void> | void;
  after?(sql: string, params: Param[]): Promise<void> | void;
  /** Rewrites a statement before it runs (a deliberately broken product, for a test's self-check). */
  rewrite?(sql: string, params: Param[]): [string, Param[]];
  /** Sees every statement that runs, also those inside a batch (the wave 3a statement spy). */
  seen?(sql: string, params: Param[]): void;
}

export function d1Over(sqlite: DatabaseSync, hooks: StatementHooks): D1Database {
  const exec = (sql: string, params: Param[]) => {
    const [s, p] = hooks.rewrite ? hooks.rewrite(sql, params) : [sql, params];
    hooks.seen?.(s, p);
    const prepared = sqlite.prepare(s);
    if (/^\s*(SELECT|WITH)\b/i.test(s)) return { results: prepared.all(...p), meta: { rows_written: 0, changes: 0 } };
    const r = prepared.run(...p);
    return { results: [], meta: { rows_written: Number(r.changes), changes: Number(r.changes) } };
  };
  const statement = (sql: string, params: Param[] = []) => ({
    sql,
    params,
    bind: (...p: Param[]) => statement(sql, p),
    async all() {
      await hooks.before?.(sql, params);
      const out = exec(sql, params);
      await hooks.after?.(sql, params);
      return out;
    },
    async run() {
      return this.all();
    },
    async first() {
      return (await this.all()).results[0] ?? null;
    },
  });
  return {
    prepare: (sql: string) => statement(sql),
    // One transaction, as D1 runs a batch. Hooks are not called inside it:
    // nothing can step between the statements of a batch.
    async batch(statements: ReturnType<typeof statement>[]) {
      sqlite.exec('BEGIN');
      try {
        const out = statements.map((s) => exec(s.sql, s.params));
        sqlite.exec('COMMIT');
        return out;
      } catch (err) {
        sqlite.exec('ROLLBACK');
        throw err;
      }
    },
  } as unknown as D1Database;
}

function r2InMemory(): R2Bucket {
  const objects = new Map<string, { bytes: Uint8Array; contentType?: string }>();
  const toBytes = async (v: unknown): Promise<Uint8Array> =>
    v instanceof Uint8Array ? v : v instanceof ArrayBuffer ? new Uint8Array(v) : new Uint8Array(await new Response(v as BodyInit).arrayBuffer());
  return {
    async put(key: string, value: unknown, opts?: { httpMetadata?: { contentType?: string } }) {
      objects.set(key, { bytes: await toBytes(value), contentType: opts?.httpMetadata?.contentType });
      return { key };
    },
    async get(key: string) {
      const o = objects.get(key);
      if (!o) return null;
      return {
        key, size: o.bytes.length, body: new Response(o.bytes).body, httpMetadata: { contentType: o.contentType }, httpEtag: `"${key}"`,
        arrayBuffer: async () => o.bytes.buffer, writeHttpMetadata: (h: Headers) => o.contentType && h.set('content-type', o.contentType),
      };
    },
    async head(key: string) {
      const o = objects.get(key);
      return o ? { key, size: o.bytes.length } : null;
    },
    async delete(keys: string | string[]) {
      for (const k of Array.isArray(keys) ? keys : [keys]) objects.delete(k);
    },
    async list() {
      return { objects: [...objects].map(([key, o]) => ({ key, size: o.bytes.length })), truncated: false };
    },
  } as unknown as R2Bucket;
}

export interface InProcessWorker {
  /** The address the Client uses (reaches the router in this process). */
  url: string;
  sqlite: DatabaseSync;
  /** The in-memory file store (LMS wave 4, AT-1.4(b): shared with a second build on a copy of the database). */
  files: R2Bucket;
  /** Swaps the statement hooks (or clears them with {}). */
  setHooks(h: StatementHooks): void;
  /** Every line the product wrote to the console since the start (or since clearLog). */
  log(): string[];
  clearLog(): void;
  /** Waits for work the product left running after a response (waitUntil). */
  settle(): Promise<void>;
  stop(): void;
}

let address = 0;

/** Where an in-process product comes from (LMS wave 4, AT-1.4(b), the base comparison): by default this checkout's
 * code on a fresh database with every migration; or another checkout's code (`root`, e.g. main b4ad669), and/or a
 * database and file store already filled (then no migration is applied here). */
export interface InProcessSource {
  root?: string;
  sqlite?: DatabaseSync;
  files?: R2Bucket;
}

/** Starts the product's router in this process with the test build's hooks and the given Wrangler variables. */
export async function startInProcess(vars: Record<string, string> = {}, from: InProcessSource = {}): Promise<InProcessWorker> {
  (globalThis as { __TEST_HOOKS__?: boolean }).__TEST_HOOKS__ = true;
  const { app } = (from.root
    ? await import(pathToFileURL(join(from.root, 'src', 'app.ts')).href)
    : await import('../../src/app.ts')) as typeof import('../../src/app.ts');
  const sqlite = from.sqlite ?? new DatabaseSync(':memory:');
  if (!from.sqlite) {
    const dir = join(from.root ?? root, 'migrations');
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) sqlite.exec(readFileSync(join(dir, f), 'utf8'));
  } else if (!from.root) {
    // LMS wave 8 (W8-1b, contract on PIL-299, C6 and AT-3.8): this checkout's learner reads use the opening-date
    // columns. A database copy filled by an earlier build (the base comparisons; wave 4's must stay untouched) gains
    // the additive migration 0017 here, with no date stored, as each later wave's copy gained its own migration.
    const cols = sqlite.prepare("SELECT name FROM pragma_table_info('chapter')").all().map((r) => String(r.name));
    if (cols.length && !cols.includes('opens_on')) sqlite.exec(readFileSync(join(root, 'migrations', '0017_chapter_opening.sql'), 'utf8'));
  }
  const files = from.files ?? r2InMemory();
  let hooks: StatementHooks = {};
  const env = {
    DB: d1Over(sqlite, { before: (s, p) => hooks.before?.(s, p), after: (s, p) => hooks.after?.(s, p), rewrite: (s, p) => (hooks.rewrite ? hooks.rewrite(s, p) : [s, p]), seen: (s, p) => hooks.seen?.(s, p) }),
    FILES: files,
    TEST_HOOKS: '1',
    ...vars,
  };
  const pending: Promise<unknown>[] = [];
  const ctx = { waitUntil: (p: Promise<unknown>) => void pending.push(p.catch(() => undefined)), passThroughOnException: () => undefined, props: {} };
  const url = `http://lms-in-process-${++address}.test`;

  const lines: string[] = [];
  const original = { log: console.log, info: console.info, warn: console.warn, error: console.error, debug: console.debug };
  const capture = (level: keyof typeof original) => (...args: unknown[]) => {
    // Node prints its own process warnings through console.error; they are the runtime's, not the product's.
    if (new Error().stack?.includes('node:internal/process/warning')) return original[level](...args);
    lines.push(args.map((a) => (typeof a === 'string' ? a : a instanceof Error ? `${a.name}: ${a.message}\n${a.stack ?? ''}` : JSON.stringify(a))).join(' '));
    void level;
  };
  for (const level of Object.keys(original) as (keyof typeof original)[]) console[level] = capture(level);

  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    if (!req.url.startsWith(url + '/')) return realFetch(input, init);
    return app.fetch(req, env, ctx);
  }) as typeof fetch;

  return {
    url,
    sqlite,
    files,
    setHooks: (h) => void (hooks = h),
    log: () => [...lines],
    clearLog: () => void (lines.length = 0),
    settle: async () => {
      while (pending.length) await pending.shift();
    },
    stop() {
      globalThis.fetch = realFetch;
      Object.assign(console, original);
      sqlite.close();
    },
  };
}
