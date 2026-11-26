// AT-5.5 (product-contract v2, LMS wave 1, L2, sections 9, 11 and 12):
// tables, columns, indexes and migrations are identical to the base commit L2
// branched from (main cf03263, L1 merged); the only new storage is the
// language cookie of section 8.3 (and L1's notice cookie); every existing CI
// step named in section 9, and the L1 steps AT-1 to AT-3 and UX-1 to UX-8 (the
// regression re-runs of section 11), is still in the workflow under its own
// name and runs its own script, so each passing in this run is the evidence.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { OWNER } from '../support/seed.ts';
import { lessonPath, subjectPath, home } from '../wave1/world.ts';
import { EnglishDevice } from './signin.ts';
import { HADEER, MONA, SALMA, editorPath, l2World, learnerPage, linkedHome, type L2World } from './world.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));

/** The migration files of the base commit cf03263968ad28240b99c0585abec480f55f8ee4, SHA-256 of each with LF line ends. */
const BASE_MIGRATIONS: Record<string, string> = {
  '0001_init.sql': '9e09a5e89657a55201ac7bd9e0a03ac79d388e510395b57f2e641ff3f12ab5df',
  '0002_learning.sql': '655945c07b14c9b778331d9f639ea2f695b7fda631edeabc6da736045d0c2a58',
  '0003_people.sql': '8f7625c337825becfa06897c1b4ba00f58fee6d44af423bf6b87649f50305a8e',
  '0004_person_language.sql': 'fa0f33c4fa39cb4b4abe424fde761b8dcc24898ea4a30675726b88091a0c415a',
  '0005_membership_ended.sql': 'eecf5948d126e9e6285bce02b9453093c548966d3ff0f0b855772bd4c2bcc4dd',
  '0006_content_removed.sql': 'ff6e1fda7f02b64b01d2ce9a76c204b267e28a5f985271ec843100d57d19cff3',
  '0007_guardians.sql': '7a71fa1935e390f757a62316d3e7130835b41b3e43b7966c30ccd77581ea25b9',
  '0008_exams.sql': '2cdd582036334b0d22af827ae2347c7379e0af26bbd33067ef5181daaba0041e',
  '0010_lesson_views.sql': '5cced02b9b0d13259d7ce148d67cad742293d201122f98a490eb8dd9bd10b95e',
  // LMS wave 2 (contract on PIL-225, as section 11 item 2 for W3a AT-3.5): the done-mark table.
  '0011_done_marks.sql': '4feabd782aca26c332b2282d93744198411dbe20fdef5b201cf006cebf47ab15',
  // LMS wave 3b (contract on PIL-232, as section 10 item 1 for W3a AT-3.5): the upload table and the membership column.
  '0012_class_upload.sql': '2a5b44991ede382449b6ca26a28a81eef40a4c2545cbe376690b247ba41939c6',
  // LMS wave 4 (contract on PIL-238, section 11 item 1): the subject's "open in order" column.
  '0013_chapters_in_order.sql': '51bae431600df24960efe0049a0430f7e68b8892b5aaa628ecf4e4dd3f71e242',
  // LMS wave 5 (contract on PIL-246, section 11 item 1): the announcement table and its index.
  '0014_announcements.sql': 'b7b7387ee238160e340767740316d07584d0949071c353757e2e38eec6bd154e',
  // LMS wave 6 (contract on PIL-257, section 11 item 1): the due_on columns and their indexes.
  '0015_due_dates.sql': '16d726cef46a654fbec914b9ddf0834414a35f1f1d1852e33d2d115772455160',
  // LMS wave 7 (contract on PIL-261, section 11 item 1): the quiz and quiz_attempt tables and their indexes.
  '0016_quizzes.sql': 'ace1442b6cd38a4f2c6128367e7e51dff8d131d8be75c0cbadee333e3e2bc4da',
  // LMS wave 8 (contract on PIL-299, R1): chapter.opens_on and chapter.opens_hidden.
  '0017_chapter_opening.sql': '5135d7abb8ccdce8cf9b3727c69e0d9b79dd81981b6e6acc1b2ccd0bb38bf449',
};

const schemaQuery = "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations' ORDER BY type, name";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? sourceFiles(p) : p.endsWith('.ts') ? [p] : [];
  });
}

/** Section 9, by job: the step names of the base commit's workflow. */
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
  'release-2': ['AT-9a', 'AT-9b', 'AT-9c', 'AT-9d', 'AT-9e', 'AT-9f', 'AT-9g', 'AT-9h', 'AT-13a', 'AT-13b', 'AT-13c', 'AT-13d', 'AT-14b'],
  'release-2-results': ['AT-10a', 'AT-10b', 'AT-10c', 'AT-10d', 'AT-10e', 'AT-10f', 'AT-10g', 'AT-11a', 'AT-11b', 'AT-11c'],
  'release-2-corrections': ['AT-11d', 'AT-11e', 'AT-11f', 'AT-12a', 'AT-12b', 'AT-12c', 'AT-12d', 'AT-12e'],
  'release-2-activity': ['AT-15a', 'AT-15b', 'AT-15c', 'AT-15c-2', 'AT-15d', 'AT-15e', 'AT-15f', 'AT-15g', 'AT-15h', 'AT-15i', 'AT-15j'],
  rollback: ['AT-14a'],
  // Section 11: the L1 steps now on main are L2's regression re-runs.
  'wave-1': [
    'AT-1.1', 'AT-1.2', 'AT-1.3', 'AT-1.4', 'AT-1.5', 'AT-1.6', 'AT-2.1', 'AT-2.2', 'AT-2.3', 'AT-2.4', 'AT-2.5', 'AT-2.6', 'AT-2.7',
    'AT-3.1', 'AT-3.2', 'AT-3.3', 'AT-3.4', 'AT-3.5', 'UX-1', 'UX-2', 'UX-3', 'UX-4', 'UX-5', 'UX-6', 'UX-7', 'UX-8', 'UX-14a', 'UX-15a', 'UX-16a', 'UX-17a',
  ],
};

/** Each job's steps: name and run command. */
function jobs(yaml: string): Record<string, { name: string; run: string }[]> {
  const out: Record<string, { name: string; run: string }[]> = {};
  let job = '';
  let step: { name: string; run: string } | null = null;
  for (const line of yaml.split(/\r?\n/)) {
    const j = line.match(/^ {2}([a-z0-9-]+):\s*$/);
    if (j) {
      job = j[1];
      out[job] = [];
      continue;
    }
    const n = line.match(/^ {6}- name: (.+)$/);
    if (n && job) {
      step = { name: n[1].trim(), run: '' };
      out[job].push(step);
      continue;
    }
    if (/^ {6}- /.test(line)) step = null;
    const r = line.match(/^ {8}run: (.+)$/);
    if (r && step) step.run = r[1].trim();
  }
  return out;
}

describe('AT-5.5 no new stored data: schema and migrations as the base commit, only the language cookie; every section 9 step and the L1 steps still run', { concurrency: false }, () => {
  let w: L2World;
  before(async () => {
    w = await l2World({ story: true });
  });
  after(async () => {
    await w?.close();
  });

  it('the migration files are exactly the base commit\'s', () => {
    const dir = join(root, 'migrations');
    const now = Object.fromEntries(readdirSync(dir).sort().map((f) => [f, createHash('sha256').update(readFileSync(join(dir, f), 'utf8').replace(/\r\n/g, '\n')).digest('hex')]));
    assert.deepEqual(now, BASE_MIGRATIONS);
  });

  it('the running database\'s tables, columns and indexes are exactly what the base migrations make, and no code makes any other', async () => {
    const fresh = new DatabaseSync(':memory:');
    for (const f of Object.keys(BASE_MIGRATIONS)) fresh.exec(readFileSync(join(root, 'migrations', f), 'utf8'));
    const expected = (fresh.prepare(schemaQuery).all() as Record<string, unknown>[]).map((r) => JSON.stringify(r));
    fresh.close();
    assert.deepEqual((await w.p.sql(schemaQuery)).map((r) => JSON.stringify(r)), expected);
    for (const f of sourceFiles(join(root, 'src'))) assert.ok(!/\b(CREATE|ALTER|DROP)\s+(TABLE|INDEX|TRIGGER|VIEW)\b/i.test(readFileSync(f, 'utf8')), `${f}: changes no schema`);
  });

  it('the only new storage is the language cookie: every cookie the L2 pages set is the session, an L1 notice cookie or lms_lang; no page uses browser storage', async () => {
    const names = new Set<string>();
    const look = async (c: EnglishDevice, paths: string[]) => {
      for (const path of paths) {
        const res = await c.get(path);
        for (const line of res.headers.getSetCookie()) names.add(line.split('=')[0]);
        const body = await res.text();
        assert.ok(!/localStorage|sessionStorage|indexedDB|document\.cookie/.test(body), `${path}: no browser storage`);
      }
    };
    const out = new EnglishDevice(w.p.url, null);
    await look(out, ['/signin', '/signin?lang=en', '/recover?lang=ar', '/recover', '/setup?lang=en', '/no-such-page']);
    for (const who of [MONA, HADEER, SALMA, OWNER]) {
      const c = new EnglishDevice(w.p.url, null);
      const signin = await c.post('/signin', { username: who.username, password: who.password });
      for (const line of signin.headers.getSetCookie()) names.add(line.split('=')[0]);
      const s = w.school;
      const paths = who === MONA ? [linkedHome(s), learnerPage(s, w.ids[SALMA.username])]
        : who === HADEER ? [editorPath(s, s.lessons['Adding fractions']), editorPath(s, s.lessons['Adding fractions'], '?add=file')]
          : who === SALMA ? ['/home', home(s), subjectPath(s, s.math), lessonPath(s, s.lessons['Review sheet'])] : ['/owner', '/account'];
      await look(c, paths);
    }
    const allowed = (n: string) => n === 'lms_session' || n === 'lms_lang' || /^lms_notice_[^_]+_[^_]+$/.test(n);
    assert.deepEqual([...names].filter((n) => !allowed(n)), [], `cookies set: ${[...names].join(', ')}`);
    assert.ok(names.has('lms_lang'), 'the language cookie is the new one');
    for (const f of sourceFiles(join(root, 'src'))) assert.ok(!/localStorage|sessionStorage|indexedDB/.test(readFileSync(f, 'utf8')), `${f}: no browser storage`);
  });

  it('every step of contract section 9, and every L1 step, is still in its job under its own name and runs its own script', () => {
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
    assert.ok(ci.rollback.filter((s) => s.name.startsWith('AT-14a ')).length >= 10, 'every AT-14a step of the rollback job');
  });
});
