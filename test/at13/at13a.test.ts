// AT-13a (contract product-contract-r2, R2-a; R2-d): on every guardian page
// except the lesson-activity page (all its states), there is no
// lesson-activity phrase, open date, count or time (the scan of section 3).
// After R2-d, the only write of a lesson open is the one of AT-15.
//
// The lesson-activity phrases are the exact phrases of the feature, in both
// languages, not word stems: ordinary words such as "Open" are never hit
// (ACTIVITY_PHRASES, test/at13/pages.ts). From R2-d the exempt list of
// dictionary keys is R2-d's own keys; any other key that carries a phrase
// fails. On a guardian page the exempt pieces (the "not switched on" line and
// the link to the lesson-activity page, marked data-activity) are taken out
// before the scan; the lesson-activity page itself is exempt.
import { describe, it, before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UI } from '../../src/i18n/ui.ts';
import type { World } from '../at9/world.ts';
import {
  A, B, G1, G2, EXEMPT_KEYS, UPLOADED, activityIn, as, crawl, doneHits, doneWords, exemptRemoved, guardianPaths, isExemptPage, privacyWorld, resultsSection,
  annHits, lockHits, quizHits, todoHits, uploadHits, useLanguage, visible, withAnnouncements, withDoneMarks, withDueDates, withLocks, withQuizzes, withUpload,
} from './pages.ts';
import { HADEER } from '../at9/world.ts';
import { withoutElement } from '../wave7/guardian.ts';

export { ACTIVITY_PHRASES, EXEMPT_KEYS, activityIn } from './pages.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));

test('AT-13a scan self-check: the phrases, dates, counts and times are found; ordinary words are not', () => {
  assert.ok(activityIn('Last opened on 3 Nov 2026').length >= 2);
  assert.ok(activityIn('آخر فتح في ٣ نوفمبر').length >= 2);
  assert.deepEqual(activityIn('Opened 3 times'), ['a number (a count, a date or a time)']);
  assert.deepEqual(activityIn('at 23:30'), ['a time of day', 'a number (a count, a date or a time)']);
  assert.deepEqual(activityIn('Open in a new tab · View · فتح · Mathematics'), [], 'ordinary words such as Open are not phrases');
});

test('AT-13a dictionary: no product sentence outside the exempt keys carries a lesson-activity phrase, in Arabic or English', () => {
  const offences: string[] = [];
  for (const lang of ['en', 'ar'] as const) {
    for (const [key, text] of Object.entries(UI[lang])) {
      if (EXEMPT_KEYS.includes(key)) continue;
      const hits = activityIn(text).filter((h) => !h.startsWith('a '));
      if (hits.length) offences.push(`${lang}.${key}: ${hits.join(', ')}`);
    }
  }
  assert.deepEqual(offences, []);
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? sourceFiles(p) : p.endsWith('.ts') || p.endsWith('.sql') ? [p] : [];
  });
}

test('AT-13a after R2-d: lesson views live only in their migration and src/activity.ts, and the only write is AT-15\'s', () => {
  const files = [...sourceFiles(join(root, 'src')), ...sourceFiles(join(root, 'migrations'))];
  assert.ok(files.length > 20);
  const found = files.filter((f) => /lesson_view|lesson_open|opened_on|opened_at/i.test(readFileSync(f, 'utf8'))).map((f) => relative(root, f).replace(/\\/g, '/'));
  assert.deepEqual(found.sort(), ['migrations/0010_lesson_views.sql', 'src/activity.ts'], 'nothing else names a lesson open');
  const writes = [...readFileSync(join(root, 'src', 'activity.ts'), 'utf8').matchAll(/(INSERT\s+INTO|UPDATE)\s+lesson_view\b(?!_)/g)];
  assert.equal(writes.length, 1, 'one statement writes a lesson view (recordOpen, AT-15d)');
});

describe('AT-13a the running product: guardian pages carry no activity, and opening lessons stores nothing', { concurrency: false }, () => {
  let w: World;
  before(async () => {
    w = await privacyWorld();
    // LMS wave 2 (W2-1, AT-2.4): A's done marks are present while the guardians look around.
    await withDoneMarks(w as Parameters<typeof withDoneMarks>[0]);
    // LMS wave 3b (W3b-1, AT-4.3): people added from a spreadsheet are present too.
    await withUpload(w as Parameters<typeof withUpload>[0]);
    // LMS wave 4 (W4-1a, AT-4.5): A's locks are present too (Arabic in order, its second chapter locked for A).
    await withLocks(w as Parameters<typeof withLocks>[0]);
    // LMS wave 5 (W5-1b, AT-3.1): announcements on A's Arabic and on Mathematics are present too.
    await withAnnouncements(w as Parameters<typeof withAnnouncements>[0]);
    // LMS wave 6 (W6-1b, AT-3.1): due dates on A's Arabic and on Mathematics are present too (A's to-do block on her home).
    await withDueDates(w as Parameters<typeof withDueDates>[0]);
    // LMS wave 7 (W7-1, AT-4.3): a quiz on A's Arabic with A's attempt is present too.
    await withQuizzes(w as Parameters<typeof withQuizzes>[0]);
  });
  after(async () => {
    await w?.close();
  });

  // From R2-c a guardian's learner page carries that learner's results (AT-11d, AT-12a): exam
  // dates, marks and "Corrected on <date>". Those are not lesson activity. The whole page is
  // still scanned for every phrase; the results section's digits are allowed only in exactly
  // those forms (resultsSection, test/at13/pages.ts), and the rest of the page still carries
  // no date, count, time or number at all.
  it('every page a guardian reaches (G1, G2 and the dual-role B), in Arabic and in English: no phrase, no date, no count, no time', async () => {
    let scanned = 0;
    let sections = 0;
    for (const person of [G1, G2, B]) {
      const c = await as(w, person);
      for (const lang of ['ar', 'en'] as const) {
        await useLanguage(c, lang);
        const pages = await crawl(c, guardianPaths(w));
        for (const p of pages.filter((x) => x.contentType.startsWith('text/html') && x.path.includes('/linked') && !isExemptPage(x.path))) {
          scanned++;
          // LMS wave 7, W7-3 (v3 addendum on PIL-285, G9.1): the scans run on the linked learner's page with the guardian's
          // quiz block `#quiz-guardian` removed (its own allow-list is W7 AT-8.2); every other page is scanned whole.
          p.body = /\/linked\/[^/?#]+$/.test(p.path) ? withoutElement(p.body, 'quiz-guardian') : p.body;
          const body = exemptRemoved(p.body);
          const phrases = activityIn(visible(body)).filter((h) => !h.startsWith('a '));
          assert.deepEqual(phrases, [], `${person.username} ${lang} ${p.path}: no lesson-activity phrase`);
          const { rest, strays } = resultsSection(body);
          if (rest !== body) sections++;
          assert.deepEqual(strays, [], `${person.username} ${lang} ${p.path}: the results section holds digits only in its exam dates, scores and Corrected lines`);
          assert.deepEqual(activityIn(visible(rest)), [], `${person.username} ${lang} ${p.path}`);
          // LMS wave 2 (AT-2.4): no done word, tick or marker on any guardian page, the dual-role B's included.
          assert.deepEqual(doneHits(p.body, doneWords(false)), [], `${person.username} ${lang} ${p.path}: no done mark`);
          // LMS wave 3b (AT-4.3): no full number (or its last eight digits) of a person added from a spreadsheet, and no upload word.
          for (const u of UPLOADED) {
            const national = u.mobile.replace(/^0/, '');
            for (const form of [u.mobile, national, `+20${national}`, `20${national}`, national.slice(-8)]) {
              assert.ok(!p.body.includes(form), `${person.username} ${lang} ${p.path}: no number of ${u.username}`);
            }
          }
          assert.deepEqual(uploadHits(p.body), [], `${person.username} ${lang} ${p.path}: no upload word`);
          // LMS wave 4 (AT-4.5): no lock word, reason, order line, Go to or lock marker on any guardian page.
          assert.deepEqual(lockHits(p.body), [], `${person.username} ${lang} ${p.path}: no lock state`);
          // LMS wave 5 (AT-3.1): no announcement text, block or new learner word on any guardian page.
          assert.deepEqual(annHits(p.body), [], `${person.username} ${lang} ${p.path}: no announcement`);
          // LMS wave 6 (AT-3.1): no to-do block, group word, item line or due line on any guardian page.
          assert.deepEqual(todoHits(p.body), [], `${person.username} ${lang} ${p.path}: no to-do state or due date`);
          // LMS wave 7 (AT-4.3): no quiz word, title, question, score or marker on any guardian page.
          assert.deepEqual(quizHits(p.body), [], `${person.username} ${lang} ${p.path}: no quiz or score`);
        }
      }
    }
    assert.ok(scanned >= 12, `guardian pages scanned: ${scanned}`);
    assert.ok(sections >= 6, `results sections checked: ${sections}`);
  });

  test('AT-13a scan self-check (R2-c): the results section allows exam dates, scores and Corrected lines, and nothing else with a digit', () => {
    // LMS redesign R1a (UX-16a row, contract S4): dates are S4 dates; the exam date sits in `<time datetime>`.
    const ok = '<section id="results" data-learner="x"><h2 id="results-title">Results: Salma</h2><ol><li class="card result"><span class="muted date" dir="ltr"><time datetime="2026-11-12">Nov 12</time></span><span class="score" dir="auto">17.5 / 20</span><span class="corrected">Corrected on Nov 3</span></li><li class="card result"><span class="muted date" dir="rtl"><time datetime="2025-11-12">12 نوفمبر 2025</time></span><span class="score" dir="auto">Absent</span></li></ol></section>';
    assert.deepEqual(resultsSection(`<p>a</p>${ok}`), { rest: '<p>a</p> ', strays: [] });
    assert.deepEqual(resultsSection(ok.replace('Results: Salma', 'Last opened 3 times')).strays, ['3']);
    assert.deepEqual(resultsSection(ok.replace('Corrected on Nov 3', 'Corrected at 10:15 on Nov 3')).strays, ['10:15', '3']);
  });

  it('with lesson activity off (the state after deploy), a learner opening their subject, lesson and file (twice), and a guardian, admin and publisher looking, store nothing', async () => {
    const tables = (await w.p.sql("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT IN ('d1_migrations', 'usage_day', 'session')"))
      .map((r) => String(r.name));
    assert.deepEqual(tables.filter((t) => /view|open|activity/i.test(t)).sort(), ['lesson_view', 'lesson_view_setting'], `only R2-d's tables: ${tables.join(', ')}`);
    // One table at a time: parallel `wrangler d1 execute` calls on one local database fail at random.
    const rows = async () => {
      const all: Record<string, string[]> = {};
      for (const t of tables) all[t] = (await w.p.sql(`SELECT * FROM "${t}"`)).map((r) => JSON.stringify(r)).sort();
      return all;
    };
    const people = { a: await as(w, A), g1: await as(w, G1), hadeer: await as(w, HADEER) };
    const before = await rows();
    for (let i = 0; i < 2; i++) {
      for (const path of [`/learn/${w.content.math}`, `/read/${w.content.lesson}`, `/file/${w.content.pdf}`]) {
        assert.equal((await people.a.get(`/s/${w.spaceId}${path}`)).status, 200, `the learner opens ${path}`);
        await w.admin.get(`/s/${w.spaceId}${path}`);
        await people.hadeer.get(`/s/${w.spaceId}${path}`);
        await people.g1.get(`/s/${w.spaceId}${path}`);
      }
      await people.g1.get(`/s/${w.spaceId}/linked/${w.ids[A.username]}`);
    }
    assert.deepEqual(await rows(), before, 'no row written or changed anywhere');
  });
});
