// Starts the real Worker locally (Wrangler's workerd + Miniflare emulation of
// D1 and R2) with the test environment, on a free port, with a fresh database.
// No Cloudflare account is used.
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const wrangler = join(root, 'node_modules', '.bin', 'wrangler');
const quietEnv = { ...process.env, WRANGLER_SEND_METRICS: 'false', NO_COLOR: '1', CI: 'true' };

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

/** Runs a wrangler command; resolves with its stdout (warnings go to stderr). */
function run(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(wrangler, args, { cwd: root, env: quietEnv });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve(out) : reject(new Error(`wrangler ${args.join(' ')} exited ${code}\n${out}\n${err}`)),
    );
  });
}

export interface RunningWorker {
  url: string;
  stop(): Promise<void>;
  log(): string;
  /** Reads the local test database directly (to check what was stored). */
  sql(query: string): Promise<Record<string, unknown>[]>;
}

export async function startWorker(): Promise<RunningWorker> {
  const persist = mkdtempSync(join(tmpdir(), 'lms-lego-test-'));
  await run(['d1', 'migrations', 'apply', 'lms-lego', '--local', '--env', 'test', '--persist-to', persist]);
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  let output = '';
  const child: ChildProcess = spawn(
    wrangler,
    [
      'dev', '--env', 'test', '--ip', '127.0.0.1', '--port', String(port),
      '--persist-to', persist, '--show-interactive-dev-session=false', '--log-level', 'warn',
    ],
    { cwd: root, env: quietEnv, detached: true },
  );
  child.stdout?.on('data', (d) => (output += d));
  child.stderr?.on('data', (d) => (output += d));

  const deadline = Date.now() + 90_000;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`wrangler dev exited early\n${output}`);
    try {
      await fetch(url + '/', { redirect: 'manual' });
      break;
    } catch {
      if (Date.now() > deadline) throw new Error(`wrangler dev did not start\n${output}`);
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  return {
    url,
    log: () => output,
    async sql(query: string) {
      const out = await run([
        'd1', 'execute', 'lms-lego', '--local', '--env', 'test', '--persist-to', persist, '--json', '--command', query,
      ]);
      const start = out.search(/^\[/m); // the JSON array starts a line
      if (start < 0) throw new Error(`no JSON from wrangler d1 execute:\n${out}`);
      const parsed = JSON.parse(out.slice(start));
      return parsed[0]?.results ?? [];
    },
    async stop() {
      if (child.exitCode === null && child.pid) {
        const exited = new Promise((r) => child.once('exit', r));
        try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already gone */ }
        await Promise.race([exited, new Promise((r) => setTimeout(r, 5000))]);
      }
      rmSync(persist, { recursive: true, force: true });
    },
  };
}
