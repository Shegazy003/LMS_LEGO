// Hardening task H-1 (docs/09-CONTRACT-R1.1.md section 4): Workers Logs on,
// safely, within the free plan. Decision (README "Logs"):
// - Workers Logs are ON: the product's own log lines (src/log.ts) are kept.
// - Request logs (Cloudflare's "invocation logs", one per request, with the
//   request's address) stay OFF: a reset link's token is part of its address
//   (/r/<token>), and an address must never reach a log. Traces stay off.
// - Sampling is 1 (every line is kept). The product writes at most two lines
//   per request (test/guards/log-redaction.test.ts counts the places), so
//   the free plan's 100,000 requests a day give at most 200,000 lines: within
//   the free plan's 200,000 log events a day. From 1 December 2026 Cloudflare
//   counts 0.5 GB a day instead; a line is under 400 characters, so 200,000
//   lines stay far below it. On the free plan Cloudflare stops keeping logs at
//   the cap and charges nothing.
// Wrangler's own reading of the configuration (a dry-run deploy) must accept
// every key, so a typo cannot silently leave request logs on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FREE_PLAN } from '../../src/usage.ts';
import { logLine } from '../../src/log.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));
// Workers Logs on the Workers Free plan (Cloudflare's Workers Logs pricing, read 2 November 2026).
const FREE_LOG_EVENTS_PER_DAY = 200_000;
// From 1 December 2026 (Cloudflare Observability pricing, Free plan): 0.5 GB of ingestion a day.
const FREE_LOG_BYTES_PER_DAY_FROM_DEC_2026 = 0.5 * 1000 ** 3;
// What Cloudflare adds to each line (timestamps, Worker and request metadata): a generous allowance.
const ENRICHMENT_BYTES = 2_000;
// The product's log lines per request at most: one per logError call site (src/app.ts).
const LINES_PER_REQUEST = 2;

function readConfig(): any {
  const text = readFileSync(join(root, 'wrangler.jsonc'), 'utf8');
  return JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
}

test('H1-1 Workers Logs are on for production', () => {
  const o = readConfig().observability;
  assert.ok(o, 'wrangler.jsonc has an observability block');
  assert.equal(o.enabled, true);
  assert.equal(o.logs?.enabled, true);
});

test('H1-1 request logs stay off (a reset link\'s token is in its address), and traces stay off', () => {
  const config = readConfig();
  assert.equal(config.observability.logs.invocation_logs, false, 'invocation (request) logs off');
  assert.notEqual(config.observability.traces?.enabled, true, 'traces off');
  // No environment turns them back on.
  for (const [name, env] of Object.entries<any>(config.env ?? {})) {
    assert.notEqual(env.observability?.logs?.invocation_logs, true, `env ${name}`);
    assert.notEqual(env.observability?.traces?.enabled, true, `env ${name}`);
  }
  // The address that carries the token, so the reason above stays true.
  const app = readFileSync(join(root, 'src', 'app.ts'), 'utf8');
  assert.match(app, /app\.(get|post)\('\/r\/:token'/, 'the reset link carries its token in the address');
});

test('H1-2 the sampling rate is stated and fits the free plan\'s log allowance', () => {
  const o = readConfig().observability;
  assert.equal(o.head_sampling_rate, 1, 'sampling stated: every line');
  assert.equal(o.logs.head_sampling_rate, 1, 'sampling stated for logs: every line');
  const linesPerDay = FREE_PLAN.requestsPerDay * LINES_PER_REQUEST * o.logs.head_sampling_rate;
  assert.equal(FREE_PLAN.requestsPerDay, 100_000, 'the Workers free plan: 100,000 requests a day');
  assert.ok(linesPerDay <= FREE_LOG_EVENTS_PER_DAY, `${linesPerDay} lines a day at most, allowance ${FREE_LOG_EVENTS_PER_DAY}`);
  const longest = logLine('usage flush failed', new Error('x'.repeat(10_000))).length;
  const bytesPerDay = linesPerDay * (longest + ENRICHMENT_BYTES);
  assert.ok(bytesPerDay <= FREE_LOG_BYTES_PER_DAY_FROM_DEC_2026, `${bytesPerDay} bytes a day at most, allowance from December 2026 ${FREE_LOG_BYTES_PER_DAY_FROM_DEC_2026}`);
});

/** Wrangler's dry-run deploy of a configuration; returns its exit code and everything it printed. */
function dryRun(configFile?: string): { status: number | null; text: string } {
  const out = mkdtempSync(join(tmpdir(), 'lms-lego-logs-'));
  try {
    const args = ['deploy', '--dry-run', '--outdir', join(out, 'bundle'), ...(configFile ? ['--config', configFile] : [])];
    const res = spawnSync(process.execPath, [join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js'), ...args], {
      cwd: root,
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false', NO_COLOR: '1' },
      encoding: 'utf8',
    });
    return { status: res.status, text: `${res.stdout}\n${res.stderr}` };
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

const UNACCEPTED = /unexpected fields|observability.*(invalid|unexpected|not supported)/i;

test('H1-1 self-check: Wrangler reports a misspelt request-logs key (so the check below can see one)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lms-lego-typo-'));
  try {
    const file = join(dir, 'wrangler.jsonc');
    const config = {
      name: 'lms-lego', main: join(root, 'src', 'index.ts'), compatibility_date: '2026-10-01', define: { __TEST_HOOKS__: 'false' },
      observability: { enabled: true, logs: { enabled: true, invocation_log: false } },
    };
    writeFileSync(file, JSON.stringify(config));
    assert.match(dryRun(file).text, UNACCEPTED);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('H1-1 Wrangler accepts the observability settings as written (dry-run deploy of the production configuration)', () => {
  const { status, text } = dryRun();
  assert.equal(status, 0, text);
  assert.doesNotMatch(text, UNACCEPTED, text);
});
