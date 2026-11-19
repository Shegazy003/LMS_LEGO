// HQ-4 driver: runs one stubbed command through the shared retry helper of
// test/support/busy.ts, the same way the test set-up runs `wrangler d1 execute`
// (sync: execFileSync, as the wave tests; async: spawn, as test/support/worker.ts).
// Prints the command's output on success. On failure the error is not caught,
// so Node prints it and this process exits non-zero, as a CI job step would.
//   node test/housekeeping/d1-retry-driver.ts <sync|async> <stub.mjs>
import { execFileSync, spawn } from 'node:child_process';
import { retryD1, retryD1Sync } from '../support/busy.ts';

const [mode, stub] = process.argv.slice(2);
const waitMs = process.env.HQ_WAIT_MS ? Number(process.env.HQ_WAIT_MS) : undefined;

function runAsync(): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [stub]);
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve(out) : reject(new Error(`stub d1 execute exited ${code}\n${out}\n${err}`))));
  });
}

if (mode === 'sync') {
  const out = retryD1Sync(() => execFileSync(process.execPath, [stub], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }), { label: 'stub', waitMs });
  process.stdout.write(out);
} else {
  const out = await retryD1(runAsync, { label: 'stub', waitMs });
  process.stdout.write(out);
}
