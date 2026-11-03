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
import { startInProcess } from './in-process.ts';
import { startWorker } from './worker.ts';

export interface Product {
  url: string;
  runtime: 'workerd' | 'in-process';
  /** Reads the product's database directly (one statement). */
  sql(query: string): Promise<Record<string, unknown>[]>;
  stop(): Promise<void>;
}

async function bodyOf(req: IncomingMessage): Promise<Buffer | undefined> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

async function inProcess(): Promise<Product> {
  const w = await startInProcess();
  let served = '';
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
    sql: async (query) => w.sqlite.prepare(query).all() as Record<string, unknown>[],
    async stop() {
      await new Promise((resolve) => server.close(resolve));
      w.stop();
    },
  };
}

/** In-process when asked for, or on a Windows machine outside CI (where Wrangler's binary does not start); workerd otherwise. */
export const runtime = (): Product['runtime'] =>
  process.env.LMS_TEST_RUNTIME === 'in-process' || (process.platform === 'win32' && !process.env.CI) ? 'in-process' : 'workerd';

export async function startProduct(): Promise<Product> {
  if (runtime() === 'in-process') return inProcess();
  const w = await startWorker();
  return { url: w.url, runtime: 'workerd', sql: (q) => w.sql(q), stop: () => w.stop() };
}
