// Deploy rails: the deploy workflow (.github/workflows/deploy.yml) is safe,
// checked statically in CI with no Cloudflare account and no new dependency.
//
// - It starts only by hand (workflow_dispatch), never on a push, a pull
//   request, a schedule or another workflow, and its job refuses any ref but
//   main.
// - Its GitHub token is read-only, and two deploys never overlap or cancel.
// - The two Cloudflare secrets are read only as ${{ secrets.NAME }} into the
//   env of the steps that need them, never at job or workflow level (so
//   `npm ci` never sees them), and no script prints them.
// - The steps run in the safe order: checks and the production guard, then
//   the database and bucket, then the migrations, then the deploy, then the
//   smoke check; always the production configuration.
// The workflow is read with a strict YAML-subset reader that fails on anything
// it does not understand (test/support/yaml-subset.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseYaml, type Yaml } from '../support/yaml-subset.ts';

type Map = { [key: string]: Yaml };
const read = (name: string) => readFileSync(new URL(`../../.github/workflows/${name}`, import.meta.url), 'utf8');
const isMap = (v: Yaml): v is Map => typeof v === 'object' && v !== null && !Array.isArray(v);
const SECRETS = ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'];

function load(name: string): Map {
  const doc = parseYaml(read(name));
  assert.ok(isMap(doc), `${name} is a mapping`);
  return doc;
}

interface Step { name?: string; uses?: string; run?: string; env?: Map; with?: Map; if?: string; id?: string }
function jobs(wf: Map): [string, Map][] {
  assert.ok(isMap(wf.jobs), 'jobs');
  return Object.entries(wf.jobs).map(([id, job]) => {
    assert.ok(isMap(job), `job ${id}`);
    return [id, job];
  });
}
function steps(job: Map): Step[] {
  assert.ok(Array.isArray(job.steps), 'steps');
  return job.steps.map((s) => {
    assert.ok(isMap(s));
    return s as unknown as Step;
  });
}

/** Every string anywhere in the document, with where it is. */
function strings(node: Yaml, path: string[] = []): [string[], string][] {
  if (typeof node === 'string') return [[path, node]];
  if (Array.isArray(node)) return node.flatMap((v, i) => strings(v, [...path, String(i)]));
  if (isMap(node)) return Object.entries(node).flatMap(([k, v]) => [[[...path, k], k] as [string[], string], ...strings(v, [...path, k])]);
  return [];
}

test('deploy workflow: it is read in full by the strict reader', () => {
  assert.doesNotThrow(() => load('deploy.yml'));
});

test('deploy workflow: it starts only by hand, from main', () => {
  const wf = load('deploy.yml');
  assert.ok(isMap(wf.on), 'on: is a mapping of triggers');
  assert.deepEqual(Object.keys(wf.on), ['workflow_dispatch'], 'the only trigger is workflow_dispatch');
  const dispatch = wf.on.workflow_dispatch;
  assert.ok(dispatch === null || (isMap(dispatch) && dispatch.inputs === undefined), 'the manual start takes no inputs (nothing a starter types reaches a script)');
  for (const k of ['true', 'push', 'pull_request', 'pull_request_target', 'schedule', 'workflow_run', 'workflow_call', 'repository_dispatch']) {
    assert.equal(wf[k], undefined, `no top-level "${k}" key`);
  }
  const all = jobs(wf);
  assert.ok(all.length >= 1);
  for (const [id, job] of all) {
    assert.equal(String(job.if).replace(/\s+/g, ' ').trim(), "github.ref == 'refs/heads/main'", `job ${id} refuses any ref other than main`);
  }
});

test('deploy workflow: read-only token, no overlap, never cancelled half-way', () => {
  const wf = load('deploy.yml');
  assert.deepEqual(wf.permissions, { contents: 'read' }, 'permissions: contents: read, and nothing else');
  for (const [id, job] of jobs(wf)) {
    if (job.permissions === undefined) continue;
    assert.ok(isMap(job.permissions), `job ${id} permissions`);
    for (const [scope, level] of Object.entries(job.permissions)) assert.ok(level === 'read' || level === 'none', `job ${id} ${scope}: ${level}`);
  }
  assert.ok(isMap(wf.concurrency), 'concurrency is set');
  assert.ok(typeof wf.concurrency.group === 'string' && wf.concurrency.group.length > 0, 'a concurrency group');
  assert.ok(!wf.concurrency.group.includes('${{'), 'one fixed group for every deploy');
  assert.equal(wf.concurrency['cancel-in-progress'], 'false', 'a running deploy is never cancelled');
});

test('deploy workflow: the two secrets are read only through secrets.*, only into the steps that need them, and nothing prints them', () => {
  const wf = load('deploy.yml');
  const text = read('deploy.yml');
  assert.ok(!/secrets\s*\[|toJSON\s*\(\s*secrets|secrets:\s*inherit|github\.token|GITHUB_TOKEN/i.test(text), 'no bulk or indirect secret access, and no use of the GitHub token');
  assert.equal(wf.env === undefined || !JSON.stringify(wf.env).includes('secrets'), true, 'no secret in the workflow env');

  const uses: string[] = [];
  for (const [path, value] of strings(wf)) {
    if (!/\bsecrets\s*\./i.test(value)) continue; // a secrets.NAME expression (bulk forms are refused above)
    const [jobsKey, jobId, stepsKey, index, envKey, name] = path;
    const where = path.join('.');
    assert.ok(jobsKey === 'jobs' && stepsKey === 'steps' && envKey === 'env' && path.length === 6, `a secret is read only in a step's env (found at ${where})`);
    assert.ok(SECRETS.includes(name), `only the two Cloudflare secrets are read (found ${name})`);
    assert.equal(value, `\${{ secrets.${name} }}`, `${where} is exactly \${{ secrets.${name} }}`);
    uses.push(`${jobId}.${index}.${name}`);
  }
  assert.ok(uses.length >= 2, 'the secrets are used');
  for (const name of SECRETS) assert.ok(uses.some((u) => u.endsWith(`.${name}`)), `${name} is used`);

  for (const [id, job] of jobs(wf)) {
    assert.ok(job.env === undefined || !JSON.stringify(job.env).includes('secrets'), `no secret in job ${id}'s env`);
    for (const step of steps(job)) {
      const label = step.name ?? step.uses ?? '?';
      const hasSecrets = JSON.stringify(step.env ?? {}).includes('secrets');
      if (step.uses) assert.ok(!hasSecrets && !JSON.stringify(step.with ?? {}).includes('secrets'), `no secret is handed to an action (${label})`);
      if (/npm (ci|install)|npm run|node --test/.test(step.run ?? '')) assert.ok(!hasSecrets, `install and test steps never see a secret (${label})`);
      const run = step.run ?? '';
      assert.ok(!run.includes('${{'), `"${label}" puts no expression into its script (values arrive through env)`);
      assert.ok(!/set\s+-[a-z]*x|\bprintenv\b|^\s*env\s*$|export\s+-p|declare\s+-p|\bcompgen\b/m.test(run), `"${label}" never dumps its environment`);
      for (const name of SECRETS) {
        const refs = run.match(new RegExp(`\\$\\{?${name}\\b`, 'g')) ?? [];
        const tests = run.match(new RegExp(`\\[ -[zn] "\\$${name}" \\]`, 'g')) ?? [];
        assert.equal(refs.length, tests.length, `"${label}" reads $${name} only to test that it is set, never to print it`);
      }
    }
  }
});

test('deploy workflow: the steps run in the safe order, on the production configuration', () => {
  const wf = load('deploy.yml');
  const all = jobs(wf);
  assert.equal(all.length, 1, 'one deploy job');
  const list = steps(all[0][1]);
  const index = (what: string, match: (s: Step) => boolean) => {
    const i = list.findIndex(match);
    assert.ok(i >= 0, `a step that ${what}`);
    return i;
  };
  const run = (re: RegExp) => (s: Step) => re.test(s.run ?? '');
  const order = [
    index('checks the two secrets are present', run(/\[ -z "\$CLOUDFLARE_API_TOKEN" \]/)),
    index('checks out the commit', (s) => /^actions\/checkout@/.test(s.uses ?? '')),
    index('installs from the lockfile', run(/^npm ci\b/m)),
    index('type checks', run(/npm run typecheck/)),
    index('runs the production guard', run(/npm run test:guard:clock/)),
    index('confirms or creates the database', run(/wrangler d1 create "\$DB_NAME"/)),
    index('confirms or creates the file bucket', run(/wrangler r2 bucket create "\$BUCKET"/)),
    index('applies the migrations to the live database', run(/wrangler d1 migrations apply "\$DB_NAME" --remote/)),
    index('deploys the Worker', run(/wrangler deploy(?!.*--dry-run)/)),
    index('prints the address and version id', run(/Version id/i)),
    index('runs the smoke check', run(/node scripts\/smoke-check\.mjs/)),
  ];
  assert.equal(order[0], 0, 'the secret check is the very first step');
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'checks → database and bucket → migrations → deploy → address → smoke check');

  const scripts = list.map((s) => s.run ?? '').join('\n');
  assert.ok(!/--env\b|-e\s+test|\bwrangler dev\b|dev:test|__TEST_HOOKS__/.test(scripts), 'always the production configuration: no --env, no test build');
  assert.ok(!/workflow_dispatch|\/dispatches\b/.test(scripts), 'the workflow never starts another workflow');
  for (const s of list) {
    if (s.uses) assert.match(s.uses, /^actions\/(checkout|setup-node)@[0-9a-f]{40}$/, `actions are GitHub's own and pinned to a full commit (${s.uses})`);
    assert.ok(s.name || s.uses, 'every step is named');
  }
  const env = all[0][1].env;
  assert.ok(isMap(env));
  assert.equal(env.DB_NAME, 'lms-lego', 'the database of wrangler.jsonc');
  assert.equal(env.BUCKET, 'lms-lego-files', 'the bucket of wrangler.jsonc');
});

test('deploy workflow: every step is explained by a comment', () => {
  const lines = read('deploy.yml').split('\n');
  const starts = lines.map((l, i) => [l, i] as const).filter(([l]) => /^\s+- (name|uses):/.test(l));
  assert.ok(starts.length >= 10);
  for (const [line, i] of starts) {
    assert.match(lines[i - 1] ?? '', /^\s*#/, `a comment directly above "${line.trim()}"`);
  }
});

test('CI: the deploy rails steps exist and run even after an earlier failure, and CI never reads a secret', () => {
  const ci = load('ci.yml');
  assert.deepEqual(ci.permissions, { contents: 'read' });
  assert.ok(!read('ci.yml').includes('secrets.'), 'CI reads no secret');
  const list = steps(jobs(ci)[0][1]);
  for (const name of [
    'Deploy rails - the production bundle builds and the deploy workflow is safe',
    'Deploy rails - the owner\'s last-resort reset works on the local database',
  ]) {
    const step = list.find((s) => s.name === name);
    assert.ok(step, `CI step "${name}"`);
    assert.equal(step.if, 'success() || failure()');
  }
});
