// The running product for the release 2 tests, on one of two runtimes:
// - "workerd" (the default, and what CI runs): the real Worker under Wrangler's
//   workerd with local D1 and R2 (test/support/worker.ts), as every release 1
//   and 1.1 acceptance test runs;
// - "in-process" (LMS_TEST_RUNTIME=in-process, or Windows outside CI): the same
//   router in this process on SQLite with every migration
//   (test/support/in-process.ts), served on a real local port so a browser can
//   drive it. For a machine where Wrangler cannot start (the Builder's Windows
//   machine); CI (Linux, CI=true) never uses it.
// Both answer on a real http://127.0.0.1:<port> address and offer the same
// direct database read, so a test is written once.
import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { startInProcess, type InProcessSource, type InProcessWorker, type StatementHooks } from './in-process.ts';
import { startWorker } from './worker.ts';
import { withBusyRetry } from './busy.ts';

export interface Product {
  url: string;
  runtime: 'workerd' | 'in-process';
  /** Reads the product's database directly (one statement). */
  sql(query: string): Promise<Record<string, unknown>[]>;
  stop(): Promise<void>;
  /** In-process only: the statement spy (wave 3a). Logs every SQL statement run from start() until stop(), which first waits for the work left after the responses. */
  spy?: { start(): void; stop(): Promise<string[]> };
  /** In-process only (LMS wave 2): statement hooks for a forced fault (as AT-15i), and the product's own log lines. */
  faults?: { set(h: StatementHooks): void; clearLog(): void; log(): string[]; settle(): Promise<void> };
}

async function bodyOf(req: IncomingMessage): Promise<Buffer | undefined> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

/** An in-process product (see InProcessSource), with its worker (database and file store) at hand. */
export async function inProcess(from: InProcessSource = {}): Promise<Product & { worker: InProcessWorker }> {
  const w = await startInProcess({}, from);
  let served = '';
  let spied: string[] = [];
  const server = createServer((req, res) => {
    void (async () => {
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) if (v !== undefined && k !== 'host') headers.set(k, Array.isArray(v) ? v.join(', ') : v);
      // The router checks a write's Origin against its own address: the browser's is the served one.
      if (headers.get('origin') === served) headers.set('origin', w.url);
      const method = req.method ?? 'GET';
      const body = method === 'GET' || method === 'HEAD' ? undefined : await bodyOf(req);
      const r = await fetch(w.url + (req.url ?? '/'), { method, headers, body, redirect: 'manual' });
      res.statusCode = r.status;
      r.headers.forEach((value, name) => {
        if (name !== 'set-cookie') res.setHeader(name, name === 'location' ? value.replace(w.url, served) : value);
      });
      const cookies = r.headers.getSetCookie();
      if (cookies.length) res.setHeader('set-cookie', cookies);
      res.end(Buffer.from(await r.arrayBuffer()));
    })().catch((err) => {
      res.statusCode = 599;
      res.end(String(err));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  served = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    url: served,
    runtime: 'in-process',
    worker: w,
    sql: async (query) => w.sqlite.prepare(query).all() as Record<string, unknown>[],
    spy: {
      start() {
        const log: string[] = [];
        spied = log;
        w.setHooks({ seen: (sql) => void log.push(sql) });
      },
      async stop() {
        await w.settle();
        w.setHooks({});
        return spied;
      },
    },
    faults: { set: (h) => w.setHooks(h), clearLog: () => w.clearLog(), log: () => w.log(), settle: () => w.settle() },
    async stop() {
      await new Promise((resolve) => server.close(resolve));
      w.stop();
    },
  };
}

/** In-process when asked for, or on a Windows machine outside CI (where Wrangler's binary does not start); workerd otherwise. */
export const runtime = (): Product['runtime'] =>
  process.env.LMS_TEST_RUNTIME === 'in-process' || (process.platform === 'win32' && !process.env.CI) ? 'in-process' : 'workerd';

/** LMS wave 4, AT-1.4(b): while set, startProduct() starts this instead (so a test world can be built on main's code). */
let instead: (() => Promise<Product>) | null = null;
export function startProductWith(start: (() => Promise<Product>) | null): void {
  instead = start;
}

export async function startProduct(): Promise<Product> {
  if (instead) return instead();
  if (runtime() === 'in-process') return inProcess();
  const w = await startWorker();
  // HK-1: a set-up statement that meets SQLITE_BUSY beside the Worker is run again (test/support/busy.ts).
  return { url: w.url, runtime: 'workerd', sql: withBusyRetry((q) => w.sql(q)), stop: () => w.stop() };
}
