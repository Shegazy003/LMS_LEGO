#!/usr/bin/env node
// Measures what one password hash and one password check cost in the local
// Workers runtime (workerd, started by `wrangler dev`), at several PBKDF2
// iteration counts, and prints a table in milliseconds.
//
//   npm run measure:password-cost                 # 10000 20000 50000 100000
//   node scripts/measure-password-cost.mjs 15000 25000
//   MEASURE_TRIALS=15 npm run measure:password-cost
//
// What this tells you, and what it does not: the numbers are for THIS machine.
// Cloudflare's edge runs other CPUs, so the free plan's 10 ms CPU limit can
// only be confirmed live (README "Password strength": the CPU column of
// Workers Logs). CI never turns these timings into a pass or a fail.
//
// It runs the product's own src/auth/password.ts inside a throwaway Worker
// (scripts/measure-password-cost.worker.ts) with no bindings, on a free local
// port. No Cloudflare account is used.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { cpus, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const wrangler = join(root, 'node_modules', '.bin', 'wrangler');
const counts = (process.argv.slice(2).length ? process.argv.slice(2) : ['10000', '20000', '50000', '100000']).map(Number);
const trials = Math.max(3, Number(process.env.MEASURE_TRIALS ?? '9') || 9);
const REPS = 5;

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const ms = (x) => x.toFixed(1).padStart(6);

const dir = mkdtempSync(join(tmpdir(), 'lms-lego-measure-'));
const config = join(dir, 'wrangler.json');
writeFileSync(config, JSON.stringify({
  name: 'lms-lego-measure-password-cost',
  main: join(root, 'scripts', 'measure-password-cost.worker.ts'),
  compatibility_date: '2026-10-01',
}));
const port = await freePort();
const base = `http://127.0.0.1:${port}`;
let log = '';
const child = spawn(
  wrangler,
  ['dev', '--config', config, '--ip', '127.0.0.1', '--port', String(port), '--show-interactive-dev-session=false', '--log-level', 'warn'],
  { cwd: root, env: { ...process.env, WRANGLER_SEND_METRICS: 'false', NO_COLOR: '1', CI: 'true' }, detached: true },
);
child.stdout.on('data', (d) => (log += d));
child.stderr.on('data', (d) => (log += d));
const stop = () => {
  try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already gone */ }
  rmSync(dir, { recursive: true, force: true });
};

try {
  const deadline = Date.now() + 90_000;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`wrangler dev exited early\n${log}`);
    try {
      await fetch(`${base}/?op=hash&iterations=${counts[0]}&reps=1`);
      break;
    } catch {
      if (Date.now() > deadline) throw new Error(`wrangler dev did not start\n${log}`);
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  const one = async (op, n) => {
    const res = await fetch(`${base}/?op=${op}&iterations=${n}&reps=${REPS}`);
    if (res.status !== 200) throw new Error(`${op} at ${n}: ${res.status} ${await res.text()}`);
    return (await res.json()).msEach;
  };

  const rows = [];
  for (const n of counts) {
    await one('hash', n); // warm-up
    const hash = [];
    const verify = [];
    for (let t = 0; t < trials; t++) {
      hash.push(await one('hash', n));
      verify.push(await one('verify', n));
    }
    rows.push({ n, hash: median(hash), verify: median(verify), lo: Math.min(...verify), hi: Math.max(...verify) });
  }

  console.log(`Password cost in the local Workers runtime (wrangler dev / workerd), ${trials} trials x ${REPS} runs, median ms`);
  console.log(`Machine: ${cpus()[0]?.model ?? 'unknown CPU'}, ${cpus().length} cores; Node ${process.version}`);
  console.log('');
  console.log('| Iterations | Hash (ms) | Verify (ms) | Verify range (ms) | Hash + verify (ms) |');
  console.log('|---:|---:|---:|---:|---:|');
  for (const r of rows) {
    console.log(`| ${r.n.toLocaleString('en-US')} | ${ms(r.hash)} | ${ms(r.verify)} | ${ms(r.lo)} to ${ms(r.hi)} | ${ms(r.hash + r.verify)} |`);
  }
  console.log('');
  console.log('A sign-in costs one verify; a password change, and a sign-in that re-writes an older hash, cost a verify and a hash.');
  console.log('These are this machine\'s numbers. Check the real cost live in the CPU column of Workers Logs.');
} finally {
  stop();
}
