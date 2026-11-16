// AT-3.5 (product-contract v2, LMS wave 1, L1, section 9): every existing CI
// step named in section 9 is still in the workflow, under its own name, in
// its own job, and runs its own test script; so each one passing in this run
// is the keep-working evidence (a HOLD names the failing step). The scripts
// those steps run still exist in package.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));

/** Section 9, by job: the step names of the base commit's workflow (main cd393f09). */
const SECTION_9: Record<string, string[]> = {
  test: [
    'Unit tests',
    'AT-1 owner shapes a space and appoints its admin',
    'AT-1 guard - every user-facing word comes through the label function',
    'AT-1 guard - the test clock cannot be enabled in production',
    'AT-1 guard - the AT-1 test passes when the run crosses midnight UTC',
    'AT-4 a learner sees exactly what was assigned',
    'AT-4 guard - a space never reads another space\'s rows',
    'AT-3 the publisher builds the subject',
    'AT-3 guard - every admin and publisher route is role-gated',
    'AT-2 the admin staffs the space and assigns a subject',
    'AT-2 guard - reset links are single-use, bound to the username and expire',
    'AT-2 guard - failed sign-ins are rate-limited and access starts on its start date',
    'AT-5 the kit changes every word, and no code changes',
    'AT-5 guard - every form refuses a cross-origin post',
    'AT-5 guard - usernames, display names and kit labels are bounded',
    'AT-6 the admin corrects a person',
    'AT-6 guard - ending access is immediate and stops sessions and reset links',
    'AT-6 follow-ups - ended people and the refresh race',
    'AT-7 the admin tidies groups and subjects',
    'AT-7 guard - unassigning takes effect on every direct link',
    'AT-8 the publisher corrects content safely',
    'AT-8 guard - removed content never reaches a learner',
    'Deploy rails - the production bundle builds and the deploy workflow is safe',
    'Deploy rails - the owner\'s last-resort reset works on the local database',
    'Password strength - stored per password, upgraded at sign-in, production at the decided value',
    'H1-1 H1-2 Workers Logs on, request logs off, sampling within the free plan',
    'H1-3 guard - no product log line holds a password, a token, a full mobile number or a session id',
    'H1-4 the sign-in re-hash never beats a concurrent password change',
  ],
  'release-2': [
    'AT-9a', 'AT-9b', 'AT-9c', 'AT-9d', 'AT-9e', 'AT-9f', 'AT-9g', 'AT-9h', 'AT-13a', 'AT-13b', 'AT-13c', 'AT-13d', 'AT-14b',
  ],
  'release-2-results': ['AT-10a', 'AT-10b', 'AT-10c', 'AT-10d', 'AT-10e', 'AT-10f', 'AT-10g', 'AT-11a', 'AT-11b', 'AT-11c'],
  'release-2-corrections': ['AT-11d', 'AT-11e', 'AT-11f', 'AT-12a', 'AT-12b', 'AT-12c', 'AT-12d', 'AT-12e'],
  'release-2-activity': ['AT-15a', 'AT-15b', 'AT-15c', 'AT-15c-2', 'AT-15d', 'AT-15e', 'AT-15f', 'AT-15g', 'AT-15h', 'AT-15i', 'AT-15j'],
  rollback: ['AT-14a'],
};

/** Each job's steps: name, run command and whether it runs even after an earlier failure. */
function jobs(yaml: string): Record<string, { name: string; run: string; always: boolean }[]> {
  const out: Record<string, { name: string; run: string; always: boolean }[]> = {};
  let job = '';
  let step: { name: string; run: string; always: boolean } | null = null;
  for (const line of yaml.split(/\r?\n/)) {
    const j = line.match(/^ {2}([a-z0-9-]+):\s*$/);
    if (j) {
      job = j[1];
      out[job] = [];
      continue;
    }
    const n = line.match(/^ {6}- name: (.+)$/);
    if (n && job) {
      step = { name: n[1].trim(), run: '', always: false };
      out[job].push(step);
      continue;
    }
    if (/^ {6}- /.test(line)) step = null;
    const r = line.match(/^ {8}run: (.+)$/);
    if (r && step) step.run = r[1].trim();
    if (step && /^ {8}if: (success\(\) \|\| failure\(\)|always\(\))/.test(line)) step.always = true;
  }
  return out;
}

test('AT-3.5 every step of contract section 9 is still in its job under its own name, runs its own script, and runs after an earlier failure', () => {
  const ci = jobs(readFileSync(`${root}.github/workflows/ci.yml`, 'utf8'));
  const scripts = (JSON.parse(readFileSync(`${root}package.json`, 'utf8')) as { scripts: Record<string, string> }).scripts;
  for (const [job, names] of Object.entries(SECTION_9)) {
    assert.ok(ci[job], `job ${job} is in the workflow`);
    for (const name of names) {
      const steps = ci[job].filter((s) => (name.includes(' ') ? s.name === name : s.name.startsWith(`${name} `)));
      assert.ok(steps.length >= 1, `${job}: step "${name}" is there under its own name`);
      for (const s of steps) {
        assert.ok(s.run, `${job}: "${s.name}" runs a command`);
        for (const m of s.run.matchAll(/npm run ([\w:-]+)/g)) assert.ok(scripts[m[1]], `${job}: "${s.name}" runs npm script ${m[1]}, which exists`);
      }
    }
  }
  const at14 = ci.rollback.filter((s) => s.name.startsWith('AT-14a '));
  assert.ok(at14.length >= 10, `every AT-14a step of the rollback job (${at14.length})`);
});
