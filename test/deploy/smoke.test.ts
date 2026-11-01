// Deploy rails: the smoke check the deploy workflow runs after `wrangler
// deploy` (scripts/smoke-check.mjs) passes on the production build and fails
// on anything that should not be live: a test build, a site that accepts a
// cross-origin form, or a site that does not answer. Run locally, with no
// Cloudflare account.
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { fileURLToPath } from 'node:url';
import { startWorker, type RunningWorker } from '../support/worker.ts';
import { setUpOwner } from '../support/seed.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));
const running: RunningWorker[] = [];
const servers: Server[] = [];

/** Runs the smoke check as the workflow does. Asynchronous, so the fake sites below (in this process) can answer. */
function smoke(address: string): Promise<{ status: number | null; out: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/smoke-check.mjs', address], {
      cwd: root, env: { ...process.env, SMOKE_WAIT_SECONDS: '3' },
    });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('error', reject);
    child.on('exit', (status) => resolve({ status, out }));
  });
}

/** A plain HTTP server that answers every request with the given status, location and body. */
async function fakeSite(answer: (method: string, path: string) => { status: number; location?: string }): Promise<string> {
  const server = createServer((req, res) => {
    const a = answer(req.method ?? 'GET', req.url ?? '/');
    res.writeHead(a.status, { connection: 'close', ...(a.location ? { location: a.location } : {}) });
    res.end('ok');
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const addr = server.address();
  return `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
}

describe('Deploy rails: the post-deploy smoke check', { concurrency: false }, () => {
  after(async () => {
    for (const w of running) await w.stop();
    for (const s of servers) s.closeAllConnections(), s.close();
  });

  it('passes on the production build before setup (redirect to /setup) and after it (redirect to /signin)', async () => {
    const w = await startWorker({ production: true });
    running.push(w);
    const before = await smoke(w.url);
    assert.equal(before.status, 0, before.out);
    assert.match(before.out, /GET \/ answers 302 -> \/setup/);
    assert.match(before.out, /must open the address and complete first setup now/);
    assert.match(before.out, /cross-origin POST is refused with 403/);
    // On an https address the check also posts from http:// on the same host;
    // locally (http) it says it skipped that, because the local proxy rewrites it.
    assert.match(before.out, /same host over http: skipped \(the address is not https\)/);
    assert.match(before.out, /test hooks are absent/);
    await setUpOwner(w.url);
    const afterSetup = await smoke(w.url);
    assert.equal(afterSetup.status, 0, afterSetup.out);
    assert.match(afterSetup.out, /GET \/ answers 302 -> \/signin/);
  });

  it('fails on a test build (the test hooks answer)', async () => {
    const w = await startWorker();
    running.push(w);
    const r = await smoke(w.url);
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, /FAIL \/__test\/clock answered 200/);
  });

  it('fails on a site that accepts a cross-origin post, and on a site that does not answer', async () => {
    const lax = await fakeSite((method, path) => (path === '/' ? { status: 302, location: '/setup' } : path === '/__test/clock' ? { status: 404 } : { status: 200 }));
    const r = await smoke(lax);
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, /FAIL a cross-origin POST answered 200/);

    const down = await fakeSite(() => ({ status: 503 }));
    const d = await smoke(down);
    assert.equal(d.status, 1, d.out);
    assert.match(d.out, /did not answer in 3s/);

    const elsewhere = await fakeSite(() => ({ status: 302, location: 'https://evil.example/setup' }));
    const e = await smoke(elsewhere);
    assert.equal(e.status, 1, e.out);
    assert.match(e.out, /FAIL GET \/ answered 302/);
  });

  it('fails when the home page answers 200 instead of redirecting to /setup or /signin', async () => {
    // Every other check would pass: the cross-origin post is refused and the
    // test hooks are absent. Only the missing redirect on GET / is wrong.
    const flat = await fakeSite((method, path) => (method === 'POST' ? { status: 403 } : path === '/__test/clock' ? { status: 404 } : { status: 200 }));
    const r = await smoke(flat);
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, /FAIL GET \/ answered 200; expected a redirect to \/setup or \/signin/);
  });
});
