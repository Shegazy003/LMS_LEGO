// W3a AT-5 (product-contract v2 on PIL-216, sections 9, 10 and 13): keep
// working. AT-5.1 is every existing CI step of section 10 under its own name;
// AT-5.3 (HK-1) is test/wave3a/hk1.test.ts. Each labelled expectation is its
// own CI step (--test-name-pattern "W3a AT-5.<n>").
import { describe, it, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Client } from '../support/http.ts';
import {
  ADMIN, HADEER, MATH_ORDER, SALMA, activity, as, lessonPath, previewHome, previewLesson, previewSubject, subjectPath, wave3aWorld, type Wave3aWorld,
} from './world.ts';

const WRITE = /^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i;

async function ok(c: Client, path: string, what: string): Promise<string> {
  const res = await c.get(path);
  assert.equal(res.status, 200, `${what}: ${path} answers 200`);
  return res.text();
}

const root = fileURLToPath(new URL('../..', import.meta.url));

/** Section 10, by job: the step names (or label prefixes) of the base commit's workflow (main 4092dff). */
const SECTION_10: Record<string, string[]> = {
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
  'release-2': ['AT-9a', 'AT-9b', 'AT-9c', 'AT-9d', 'AT-9e', 'AT-9f', 'AT-9g', 'AT-9h', 'AT-13a', 'AT-13b', 'AT-13c', 'AT-13d', 'AT-14b'],
  'release-2-results': ['AT-10a', 'AT-10b', 'AT-10c', 'AT-10d', 'AT-10e', 'AT-10f', 'AT-10g', 'AT-11a', 'AT-11b', 'AT-11c'],
  'release-2-corrections': ['AT-11d', 'AT-11e', 'AT-11f', 'AT-12a', 'AT-12b', 'AT-12c', 'AT-12d', 'AT-12e'],
  'release-2-activity': ['AT-15a', 'AT-15b', 'AT-15c', 'AT-15c-2', 'AT-15d', 'AT-15e', 'AT-15f', 'AT-15g', 'AT-15h', 'AT-15i', 'AT-15j'],
  'wave-1': [
    'AT-1.1', 'AT-1.2', 'AT-1.3', 'AT-1.4', 'AT-1.5', 'AT-1.6', 'AT-2.1', 'AT-2.2', 'AT-2.3', 'AT-2.4', 'AT-2.5', 'AT-2.6', 'AT-2.7',
    'AT-3.1', 'AT-3.2', 'AT-3.3', 'AT-3.4', 'AT-3.5', 'AT-4.1', 'AT-4.2', 'AT-4.3', 'AT-4.4', 'AT-4.5', 'AT-4.6',
    'AT-5.1', 'AT-5.2', 'AT-5.3', 'AT-5.4', 'AT-5.5',
    'UX-1', 'UX-2', 'UX-3', 'UX-4', 'UX-5', 'UX-6', 'UX-7', 'UX-8', 'UX-9', 'UX-10', 'UX-11', 'UX-12', 'UX-13',
    'UX-14a', 'UX-14b', 'UX-15a', 'UX-15b', 'UX-16a', 'UX-16b', 'UX-17a', 'UX-17b',
  ],
  rollback: ['AT-14a'],
};
const WAVE_3A = [
  'W3a AT-1.1', 'W3a AT-1.2', 'W3a AT-1.3', 'W3a AT-1.4', 'W3a AT-1.5',
  'W3a AT-2.0', 'W3a AT-2.1', 'W3a AT-2.2', 'W3a AT-2.3', 'W3a AT-2.4', 'W3a AT-2.5', 'W3a AT-2.6',
  'W3a AT-3.1', 'W3a AT-3.2', 'W3a AT-3.3', 'W3a AT-3.4', 'W3a AT-3.5',
  'W3a AT-4.1', 'W3a AT-4.2', 'W3a AT-4.3', 'W3a AT-4.4', 'W3a AT-5.1', 'W3a AT-5.2', 'W3a AT-5.3', 'W3a AT-5.4',
  'UX-18', 'UX-19', 'UX-20', 'UX-21', 'UX-22', 'UX-23', 'UX-24', 'UX-25', 'UX-26',
];

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

test('W3a AT-5.1 every existing step of contract section 10 is still in its job under its own name, runs its own script, and runs after an earlier failure', () => {
  const ci = jobs(readFileSync(`${root}.github/workflows/ci.yml`, 'utf8'));
  const scripts = (JSON.parse(readFileSync(`${root}package.json`, 'utf8')) as { scripts: Record<string, string> }).scripts;
  const check = (job: string, names: string[], always: boolean) => {
    assert.ok(ci[job], `job ${job} is in the workflow`);
    for (const name of names) {
      const steps = ci[job].filter((s) => (name.includes(' ') && !name.startsWith('W3a ') ? s.name === name : s.name.startsWith(`${name} `)));
      assert.ok(steps.length >= 1, `${job}: step "${name}" is there under its own name`);
      for (const s of steps) {
        assert.ok(s.run, `${job}: "${s.name}" runs a command`);
        for (const m of s.run.matchAll(/npm run ([\w:-]+)/g)) assert.ok(scripts[m[1]], `${job}: "${s.name}" runs npm script ${m[1]}, which exists`);
        if (always) assert.ok(s.always, `${job}: "${s.name}" runs after an earlier failure`);
      }
    }
  };
  for (const [job, names] of Object.entries(SECTION_10)) check(job, names, job === 'wave-1');
  assert.ok(ci.rollback.filter((s) => s.name.startsWith('AT-14a ')).length >= 10, 'every AT-14a step of the rollback job');
  // The one new job (section 12): one step per W3a label and UX item, each run after an earlier failure.
  check('wave-3a', WAVE_3A, true);
  // Wave 3b adds its own one new job, `wave-3b` (W3b contract section 11), wave 4 `wave-4` (W4 contract section 11 item 3)
  // and wave 5 `wave-5` (W5 contract section 11 item 5), wave 6 `wave-6` (W6 contract section 11 item 5), wave 7 `wave-7`
  // (W7 contract on PIL-261, section 11 item 6), wave 8 `wave-8` (W8 contract on PIL-299, section 6 N1); nothing else may appear.
  const known = new Set(Object.keys(SECTION_10).concat('wave-3a', 'wave-3b', 'wave-4', 'wave-5', 'wave-6', 'wave-7', 'wave-8', 'push')); // "push" is the trigger under on:, not a job
  assert.deepEqual(Object.keys(ci).filter((j) => !known.has(j)), [], 'at most one new job per wave (wave-3a, then wave-3b, wave-4, wave-5, wave-6, wave-7, wave-8)');
});

describe('W3a AT-5 keep working', { concurrency: false }, () => {
  it('W3a AT-5.2 today\'s /learn and /read addresses keep their behaviour; Salma\'s first open after the preview is her first record', async () => {
    const w: Wave3aWorld = await wave3aWorld();
    try {
      await activity(w, true);
      for (const who of [ADMIN, HADEER]) {
        const c = await as(w, who, 'en');
        for (const path of [subjectPath(w.school, w.school.math), lessonPath(w.school, w.school.lessons['Adding fractions'])]) {
          const doc = await ok(c, path, who.username);
          assert.ok(!doc.includes('preview-banner') && !doc.includes('/preview'), `${who.username} ${path}: today's page, not a preview`);
          assert.ok(/<a id="nav-account" href="\/account">/.test(doc), `${who.username} ${path}: their own navigation`);
        }
        // A preview journey through Mathematics records nothing.
        await ok(c, previewHome(w.school, 'home'), 'preview home');
        await ok(c, previewSubject(w.school, w.school.math, 'all', 'home'), 'preview outline');
        for (const t of MATH_ORDER) await ok(c, previewLesson(w.school, w.school.lessons[t], 'home'), t);
      }
      const salmaId = w.ids[SALMA.username];
      const views = () => w.p.sql(`SELECT lesson_id FROM lesson_view WHERE learner_user_id = '${salmaId}'`);
      assert.deepEqual(await views(), [], 'the preview recorded nothing for Salma');
      assert.equal((await w.p.sql('SELECT COUNT(*) AS n FROM lesson_view'))[0].n, 0, 'the preview recorded nothing at all');
      const salma = await as(w, SALMA, 'en');
      const lesson = w.school.lessons['Comparing fractions'];
      await ok(salma, lessonPath(w.school, lesson), 'Salma');
      assert.deepEqual((await views()).map((r) => r.lesson_id), [lesson], 'Salma\'s open is recorded exactly once, as her first record');
    } finally {
      await w.close();
    }
  });

  it('W3a AT-5.4 the admin\'s preview home runs the same number of reads with four or eight published subjects', async (t) => {
    const counts: number[] = [];
    for (const variant of ['as-is', 'more-subjects'] as const) {
      const w = await wave3aWorld(variant);
      try {
        const spy = w.p.spy;
        assert.ok(spy, 'the statement spy runs on the in-process product (LMS_TEST_RUNTIME=in-process)');
        const amal = await as(w, ADMIN, 'en');
        const published = (await w.p.sql(`SELECT COUNT(*) AS n FROM subject WHERE space_id = '${w.school.id}' AND is_published = 1`))[0].n;
        await ok(amal, previewHome(w.school, 'home'), 'warm-up'); // the same session upkeep on both counts
        spy.start();
        const doc = await ok(amal, previewHome(w.school, 'home'), `Amal (${variant})`);
        const reads = (await spy.stop()).filter((s) => !WRITE.test(s));
        assert.equal((doc.match(/<li class="card" data-subject=/g) ?? []).length, published, `${variant}: one card per published subject`);
        // A diagnostic, not console.log: the in-process product captures the console while it runs.
        t.diagnostic(`AT-5.4 Amal's preview home, ${published} published subjects: ${reads.length} database reads`);
        counts.push(reads.length);
      } finally {
        await w.close();
      }
    }
    assert.equal(counts[1], counts[0], `the same number of reads (${counts.join(' and ')})`);
  });
});
