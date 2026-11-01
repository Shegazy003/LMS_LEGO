// The controllable clock exists only in test builds. This proves it cannot be
// switched on in production: the production build does not contain the code at
// all (it is compiled out by a build-time constant), and the production
// configuration does not set the constant or the runtime flag.
//
// Build task 7: production also states its password strength
// (PASSWORD_ITERATIONS) and it is the decided value. Build task 8: the owner
// took decision 2, option B, on 1 November 2026 (docs/07-FIRST-DEPLOY.md):
// 10,000, the floor, set before the first deploy so that no 100,000-iteration
// hash is ever written in production. A later change of decision changes that
// value and the DECIDED_ITERATIONS line below together, in one reviewed pull
// request.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PASSWORD_CEILING, PASSWORD_FLOOR, passwordIterations } from '../../src/auth/password.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));
const wrangler = join(root, 'node_modules', '.bin', 'wrangler');
// A sentence that exists only inside the test seeding code (src/test-hooks.ts).
const SEED_MARKER = 'test seeding refused';
// The production password strength the owner has decided on: option B, 1 November 2026.
const DECIDED_ITERATIONS = 10_000;

function readConfig(): any {
  const text = readFileSync(join(root, 'wrangler.jsonc'), 'utf8');
  return JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
}

function bundle(env: string): string {
  const out = mkdtempSync(join(tmpdir(), 'lms-lego-bundle-'));
  try {
    execFileSync(wrangler, ['deploy', '--dry-run', `--env=${env}`, '--outdir', out], {
      cwd: root,
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
      stdio: 'pipe',
    });
    return readdirSync(out)
      .filter((f) => f.endsWith('.js'))
      .map((f) => readFileSync(join(out, f), 'utf8'))
      .join('\n');
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

test('production guard: production config compiles test hooks out and sets no test flag', () => {
  const config = readConfig();
  assert.equal(config.define?.__TEST_HOOKS__, 'false');
  assert.equal(config.vars?.TEST_HOOKS, undefined);
  assert.equal(config.env?.test?.define?.__TEST_HOOKS__, 'true');
  // Only the test environment may carry the flag.
  for (const [name, env] of Object.entries<any>(config.env ?? {})) {
    if (name !== 'test') {
      assert.notEqual(env.define?.__TEST_HOOKS__, 'true', `env ${name}`);
      assert.equal(env.vars?.TEST_HOOKS, undefined, `env ${name}`);
    }
  }
});

test('production guard: the production bundle contains no clock control and no test seeding, the test bundle does', () => {
  const testBundle = bundle('test');
  assert.ok(testBundle.includes('/__test/clock'), 'the test build must contain the clock route (check is meaningful)');
  assert.ok(testBundle.includes('/__test/seed'), 'the test build must contain the seeding route (check is meaningful)');
  assert.ok(testBundle.includes(SEED_MARKER), 'the test build must contain the seeding code (check is meaningful)');
  const production = bundle('');
  assert.ok(production.length > 1000, 'production bundle was built');
  assert.ok(!production.includes('/__test/'), 'production bundle must not contain test routes');
  assert.ok(!production.includes('/__test/seed'), 'production bundle must not contain the seeding route');
  assert.ok(!production.includes(SEED_MARKER), 'production bundle must not contain the seeding code');
  assert.ok(!production.includes('TEST_HOOKS'), 'production bundle must not read the test flag');
});

test('production guard: production states its password strength, and it is the decided 10,000 (option B), within the floor and ceiling', () => {
  const config = readConfig();
  assert.equal(DECIDED_ITERATIONS, 10_000, 'the decided strength is option B, the floor');
  assert.equal(DECIDED_ITERATIONS, PASSWORD_FLOOR, 'option B is the floor');
  assert.equal(config.vars?.PASSWORD_ITERATIONS, String(DECIDED_ITERATIONS), 'wrangler.jsonc sets PASSWORD_ITERATIONS for production');
  assert.equal(passwordIterations(config.vars.PASSWORD_ITERATIONS), DECIDED_ITERATIONS, 'the Worker reads it as that strength');
  assert.ok(PASSWORD_FLOOR <= DECIDED_ITERATIONS && DECIDED_ITERATIONS <= PASSWORD_CEILING);
  // Any other environment that states a strength must state one the Worker accepts.
  for (const [name, env] of Object.entries<any>(config.env ?? {})) {
    const value = env.vars?.PASSWORD_ITERATIONS;
    if (value !== undefined) assert.doesNotThrow(() => passwordIterations(value), `env ${name}`);
  }
});

test('production guard: the production bundle reads the password strength setting', () => {
  const production = bundle('');
  assert.ok(production.includes('PASSWORD_ITERATIONS'), 'production bundle reads PASSWORD_ITERATIONS');
});
