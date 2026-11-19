// LMS housekeeping Q1 (PIL-243): the CI test set-up's `wrangler d1 execute`
// calls retry on the two infrastructure flakes seen in CI, SQLITE_BUSY (rollback
// job: PIL-215 main, runs 44432026699 and 44452874419) and ECONNRESET (wave-1
// job, run 44443909726), through one shared helper (test/support/busy.ts).
//
// HQ-1: every call site goes through that helper (scan below).
// HQ-4: a stubbed command proves HQ-2 (only those two errors are retried) and
// HQ-3 (at most 3 extra attempts with a short wait; then the original error is
// printed and the step fails with a non-zero exit).
// Test support only: nothing under src/ or migrations/ changes.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { describe, it, before, after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { RETRIES, retryD1, withBusyRetry } from '../support/busy.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));
const driver = fileURLToPath(new URL('./d1-retry-driver.ts', import.meta.url));

// The error shapes CI met (wrangler d1 execute, exit 1).
const BUSY = 'X [ERROR] SQLite failed; database is locked: SQLITE_BUSY';
const RESET = 'X [ERROR] Error: read ECONNRESET';
const OTHER = 'X [ERROR] no such table: nothing: SQLITE_ERROR';
const LOCKED_ONLY = 'X [ERROR] database is locked';

// A stand-in for `wrangler d1 execute`: on its n-th call it does what the n-th
// entry of PLAN says (busy, reset, other, locked, ok); it counts its calls in COUNTER.
const STUB = `
import { readFileSync, writeFileSync } from 'node:fs';
const counter = process.env.COUNTER;
let n = 0;
try { n = Number(readFileSync(counter, 'utf8')); } catch {}
writeFileSync(counter, String(n + 1));
const plan = process.env.PLAN.split(',');
const step = plan[Math.min(n, plan.length - 1)];
const text = { busy: ${JSON.stringify(BUSY)}, reset: ${JSON.stringify(RESET)}, other: ${JSON.stringify(OTHER)}, locked: ${JSON.stringify(LOCKED_ONLY)} };
if (step === 'ok') { process.stdout.write('[{"results":[{"ok":1}],"success":true}]\\n'); process.exit(0); }
process.stderr.write(text[step] + '\\n');
process.exit(1);
`;

let dir: string;
let stub: string;
let runs = 0;

/** Runs the driver (sync or async form) against the stub with a plan: exit code, output, stub calls, time taken. */
function drive(mode: 'sync' | 'async', plan: string, waitMs?: number) {
  const counter = join(dir, `count-${++runs}`);
  const started = Date.now();
  const r = spawnSync(process.execPath, [driver, mode, stub], {
    encoding: 'utf8',
    env: { ...process.env, PLAN: plan, COUNTER: counter, ...(waitMs === undefined ? {} : { HQ_WAIT_MS: String(waitMs) }) },
  });
  let calls = 0;
  try { calls = Number(readFileSync(counter, 'utf8')); } catch { /* never called */ }
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, calls, ms: Date.now() - started };
}

describe('HQ-4 the shared retry helper, driven with a stubbed d1 execute command', () => {
  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'lms-lego-hq-'));
    stub = join(dir, 'stub-d1-execute.mjs');
    writeFileSync(stub, STUB);
  });
  after(() => rmSync(dir, { recursive: true, force: true }));

  for (const mode of ['sync', 'async'] as const) {
    it(`HQ-4(a) ${mode}: a busy error then success passes, after one retry with a warning`, () => {
      const r = drive(mode, 'busy,ok', 10);
      assert.equal(r.status, 0, r.stderr);
      assert.equal(r.calls, 2, 'one try and one retry');
      assert.match(r.stdout, /"results":\[\{"ok":1\}\]/, 'the successful attempt\'s output');
      assert.match(r.stderr, /SQLITE_BUSY; retry 1 of 3/);
    });

    it(`HQ-4(a) ${mode}: a connection reset then success passes, after one retry`, () => {
      const r = drive(mode, 'reset,ok', 10);
      assert.equal(r.status, 0, r.stderr);
      assert.equal(r.calls, 2);
      assert.match(r.stderr, /ECONNRESET; retry 1 of 3/);
    });

    it(`HQ-4(b) ${mode}: a busy error on every attempt fails after 3 retries, with the original error and a non-zero exit`, () => {
      const r = drive(mode, 'busy'); // the default wait, as in CI
      assert.notEqual(r.status, 0, 'the step fails');
      assert.equal(r.calls, 1 + RETRIES, 'one try and exactly 3 retries');
      assert.equal(RETRIES, 3);
      assert.ok(r.stderr.includes(BUSY), `the original error is printed:\n${r.stderr}`);
      for (let n = 1; n <= 3; n++) assert.match(r.stderr, new RegExp(`retry ${n} of 3`));
      assert.doesNotMatch(r.stderr, /retry 4 of/);
      // Short waits between attempts (0.5 s, 1 s, 1.5 s): at least 3 s in all, and well under a minute.
      assert.ok(r.ms >= 3000 && r.ms < 30_000, `took ${r.ms} ms`);
    });

    it(`HQ-4(b) ${mode}: a connection reset on every attempt fails after 3 retries, with the original error`, () => {
      const r = drive(mode, 'reset', 10);
      assert.notEqual(r.status, 0);
      assert.equal(r.calls, 4);
      assert.ok(r.stderr.includes(RESET), r.stderr);
    });

    it(`HQ-4(c) ${mode}: any other error fails on the first attempt with no retry, unchanged`, () => {
      for (const plan of ['other,ok', 'locked,ok']) {
        const r = drive(mode, plan, 10);
        assert.notEqual(r.status, 0, `${plan}: the step fails`);
        assert.equal(r.calls, 1, `${plan}: no retry`);
        assert.ok(r.stderr.includes(plan === 'other,ok' ? OTHER : LOCKED_ONLY), `${plan}: the original error:\n${r.stderr}`);
        assert.doesNotMatch(r.stderr, /retry \d of/, `${plan}: no retry warning`);
      }
    });
  }

  it('HQ-4(b) a helper inside another (startProduct().sql over worker.sql) still makes at most 3 retries in all', async () => {
    let calls = 0;
    const inner = (q: string) => retryD1(async () => { calls++; throw new Error(`wrangler d1 execute exited 1\n${q}\n${BUSY}`); }, { waitMs: 1, warn: () => {}, label: q });
    const outer = withBusyRetry(inner, { waitMs: 1, warn: () => {} });
    await assert.rejects(outer('SELECT 1'), (err: Error) => err.message.includes(BUSY));
    assert.equal(calls, 4, 'one try and 3 retries, not 3 retries of 3 retries');
  });
});

// ---------------------------------------------------------------- HQ-1 ----

function files(d: string, out: string[] = []): string[] {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) files(p, out);
    else if (/\.(ts|mjs|js|cjs)$/.test(e.name)) out.push(p);
  }
  return out;
}

describe('HQ-1 every CI and test set-up call to wrangler d1 execute goes through the shared retry helper', () => {
  it('HQ-1 each `d1 execute` command in test/ is run inside retryD1 or retryD1Sync', (t) => {
    const sites: string[] = [];
    const unwrapped: string[] = [];
    for (const f of files(join(root, 'test'))) {
      readFileSync(f, 'utf8').split(/\r?\n/).forEach((line, i) => {
        if (!/['"]d1['"],\s*['"]execute['"]/.test(line)) return;
        const at = `${relative(root, f).replace(/\\/g, '/')}:${i + 1}`;
        sites.push(at);
        if (!/\bretryD1(Sync)?\(/.test(line)) unwrapped.push(at);
      });
    }
    for (const s of sites) t.diagnostic(`call site ${s}`);
    assert.deepEqual(unwrapped, [], 'no call site is left unwrapped');
    assert.ok(sites.length >= 9, `the known call sites are found (${sites.length})`);
    for (const f of ['test/support/worker.ts', 'test/deploy/migrations.test.ts', 'test/wave2/at3.test.ts', 'test/wave3b/at5.test.ts', 'test/wave4/at5.test.ts']) {
      assert.ok(sites.some((s) => s.startsWith(`${f}:`)), `${f} is among the call sites`);
    }
  });

  it('HQ-1 no shell form of `d1 execute` runs in test/, package.json or the CI workflow', () => {
    for (const f of files(join(root, 'test'))) {
      for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
        assert.ok(!/\b(exec|execSync|spawn|spawnSync)\(\s*[`'"][^`'"]*d1 execute/.test(line), `${relative(root, f)}: a shell d1 execute call`);
      }
    }
    const scripts = Object.values((JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { scripts: Record<string, string> }).scripts);
    assert.ok(!scripts.some((s) => /d1 execute/.test(s)), 'no package script runs d1 execute');
    const ciLines = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8').split(/\r?\n/).filter((l) => !/^\s*(#|- name: )/.test(l));
    assert.ok(!ciLines.some((l) => /d1 execute/.test(l)), 'no CI step runs d1 execute directly (comments and step names aside)');
  });

  it('HQ-1 the rollback job runs the release 1.1 suite with this helper: it copies busy.ts and worker.ts into that checkout before its first test', () => {
    const ci = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8').replace(/\r\n/g, '\n');
    const job = ci.slice(ci.indexOf('\n  rollback:\n'));
    const copy = job.indexOf('cp test/support/busy.ts test/support/worker.ts release-1.1/test/support/');
    const firstTest = job.indexOf('working-directory: release-1.1\n        run: node --test');
    assert.ok(copy > 0, 'the copy is in the rollback job');
    assert.ok(firstTest > copy, 'before the first release 1.1 test step');
    // The release 1.1 worker.ts (f3b1fa7) is this file without the retry; the
    // copy changes only how its set-up statements are run, not the product.
    const worker = readFileSync(join(root, 'test/support/worker.ts'), 'utf8');
    assert.match(worker, /import \{ retryD1 \} from '\.\/busy\.ts';/);
    assert.doesNotMatch(worker, /from '\.\/(?!busy\.ts|http\.ts)[^']+'/, 'worker.ts imports nothing else from test/support that release 1.1 might lack');
  });
});
