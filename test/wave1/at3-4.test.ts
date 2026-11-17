// AT-3.4 (product-contract v2, LMS wave 1, L1, section 12): tables, columns,
// indexes and migration files are identical to the base commit L1 branched
// from (main cd393f09, release 2 merged); the only new storage is the notice
// cookie of section 7.2; the lesson-activity records are unchanged in number
// and value by any L1 page except the lesson open itself.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { SALMA, activity, as, home, lessonPath, subjectPath, wave1World, withResults, type Wave1World } from './world.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));

/** The migration files of the base commit cd393f0969a8eb8b0de26a5c87e9d4ca69d6cc07, SHA-256 of each with LF line ends. */
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
};

const schemaQuery = "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations' ORDER BY type, name";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? sourceFiles(p) : p.endsWith('.ts') ? [p] : [];
  });
}

describe('AT-3.4 no new stored data: schema and migrations as the base commit, only the notice cookie, activity records untouched', { concurrency: false }, () => {
  let w: Wave1World;
  before(async () => {
    w = await wave1World();
    await withResults(w);
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
    const live = (await w.p.sql(schemaQuery)).map((r) => JSON.stringify(r));
    assert.deepEqual(live, expected);
    assert.ok(expected.length > 20, `schema objects compared: ${expected.length}`);
    for (const f of sourceFiles(join(root, 'src'))) {
      assert.ok(!/\b(CREATE|ALTER|DROP)\s+(TABLE|INDEX|TRIGGER|VIEW)\b/i.test(readFileSync(f, 'utf8')), `${f}: changes no schema`);
    }
  });

  it('the only new storage is the notice cookie: every cookie a learner page sets is the session or lms_notice_*, and no page uses browser storage', async () => {
    await activity(w, true);
    const s = w.school;
    const c = await as(w, SALMA);
    const names = new Set<string>();
    const paths = [home(s), subjectPath(s, s.math), subjectPath(s, s.math, 'all'), subjectPath(s, s.math, s.chapters.Decimals), `/s/${s.id}/results`,
      ...Object.values(s.lessons).map((id) => lessonPath(s, id))];
    for (const path of paths) {
      const res = await c.get(path);
      for (const line of res.headers.getSetCookie()) names.add(line.split('=')[0]);
      const body = await res.text();
      assert.ok(!/localStorage|sessionStorage|indexedDB|document\.cookie/.test(body), `${path}: no browser storage`);
    }
    assert.deepEqual([...names].filter((n) => n !== 'lms_session'), [`lms_notice_${s.id}_${w.ids[SALMA.username]}`]);
    for (const f of sourceFiles(join(root, 'src'))) assert.ok(!/localStorage|sessionStorage|indexedDB/.test(readFileSync(f, 'utf8')), `${f}: no browser storage`);
  });

  it('with activity on, the home, subject pages, Next and Previous, Expand and Collapse, and My results change no activity record; a lesson open writes its one row', async () => {
    const s = w.school;
    const snapshot = async () => ({
      views: (await w.p.sql('SELECT * FROM lesson_view ORDER BY lesson_id, learner_user_id')).map((r) => JSON.stringify(r)),
      setting: (await w.p.sql('SELECT * FROM lesson_view_setting ORDER BY space_id')).map((r) => JSON.stringify(r)),
    });
    const c = await as(w, SALMA);
    const before = await snapshot();
    for (const path of [home(s), subjectPath(s, s.math), subjectPath(s, s.math, 'all'), subjectPath(s, s.math, 'none'), subjectPath(s, s.math, s.chapters.Decimals),
      subjectPath(s, s.arabic), `/s/${s.id}/results`, home(s)]) {
      assert.equal((await c.get(path)).status, 200, path);
    }
    assert.deepEqual(await snapshot(), before, 'nothing changed');
    // A lesson not opened earlier in this world: its open writes one row.
    assert.equal((await c.get(lessonPath(s, s.arabicLessons.Prepositions))).status, 200);
    const after1 = await snapshot();
    assert.deepEqual(after1.setting, before.setting, 'the switch is untouched');
    assert.equal(after1.views.length, before.views.length + 1, 'the open wrote its one row');
  });
});
