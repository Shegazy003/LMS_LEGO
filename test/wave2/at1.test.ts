// LMS wave 2, W2-1, AT-1 (product-contract v2 on PIL-225): the learner marks a
// lesson done, and undoes it. One describe per labelled expectation, each its
// own CI step (`W2 AT-1.<n> ...`), each on a fresh world.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser } from 'playwright';
import type { Client } from '../support/http.ts';
import {
  MATH_ORDER, OMAR, SALMA, T1, T2, as, browserAs, home, lessonPath, markClock, markPath, marks, plain, press, salmaThreeMarks, subjectPath,
  wave2World, words, type Wave1World,
} from './world.ts';

const personPath = (w: Wave1World, userId: string) => `/s/${w.school.id}/admin/people/${userId}`;

/** The text of the element with this id in a fetched page, or null. */
function byId(html: string, id: string): string | null {
  const m = new RegExp(`<(\\w+)[^>]*\\bid="${id}"[^>]*>([\\s\\S]*?)</\\1>`).exec(html);
  return m ? plain(m[2]) : null;
}

async function page(c: Client, path: string): Promise<string> {
  const res = await c.get(path);
  assert.equal(res.status, 200, `${path} answers 200`);
  return res.text();
}

describe('W2 AT-1.1 after "Mark as done" the same lesson shows the status line, the Done tag and "Mark as not done"; one mark is stored', { concurrency: false }, () => {
  let w: Wave1World;
  before(async () => (w = await wave2World()));
  after(() => w?.close());

  it('W2 AT-1.1 the press answers 303 to the lesson at its done block, and the page shows the done state', async () => {
    const salma = await as(w, SALMA, 'en');
    const lesson = w.school.lessons['Comparing fractions'];
    const before = await page(salma, lessonPath(w.school, lesson));
    assert.equal(byId(before, 'done-control'), 'Mark as done', 'before: one button "Mark as done"');
    assert.equal(byId(before, 'done-tag'), null, 'before: no Done tag');
    const outlineBefore = await page(salma, subjectPath(w.school, w.school.math));

    const res = await press(salma, w.school, lesson, 'done');
    assert.equal(res.status, 303);
    assert.equal(res.headers.get('location'), `/s/${w.school.id}/read/${lesson}?marked=done#done-state`);
    assert.equal(res.headers.get('set-cookie'), null, 'no cookie is set');

    const after = await page(salma, `/s/${w.school.id}/read/${lesson}?marked=done`);
    assert.equal(byId(after, 'done-status'), 'Marked as done.', 'the status line');
    assert.match(after, /<p id="done-status"[^>]*role="status"/, 'the status line is a status region');
    assert.equal(byId(after, 'done-tag'), '✓ Done', 'the tag "Done", with its tick');
    assert.match(after, /id="lesson-place"[^>]*>[\s\S]*?<\/p>\s*<p id="done-tag"/, 'the tag sits right under the place line');
    assert.equal(byId(after, 'done-control'), 'Mark as not done', '"Mark as not done" in place of "Mark as done"');
    assert.ok(!plain(after).includes('Mark as done'), 'no "Mark as done" left');

    const rows = await marks(w);
    assert.equal(rows.length, 1, 'exactly one done mark');
    assert.deepEqual([rows[0].space_id, rows[0].learner_user_id, rows[0].lesson_id], [w.school.id, w.ids[SALMA.username], lesson]);
    // W2-1b: the outline now shows this one mark (it was "exactly as before" while the split held the ticks back).
    const outlineAfter = await page(salma, subjectPath(w.school, w.school.math));
    assert.notEqual(outlineAfter, outlineBefore, 'the outline shows the mark');
    assert.equal(byId(outlineAfter, 'done-progress'), 'Done: 1 of 5 lessons');
  });
});

describe('W2 AT-1.2 marking is a set, not a switch: a second press keeps the first time; undo deletes; a stale ?marked= shows nothing', { concurrency: false }, () => {
  let w: Wave1World;
  before(async () => (w = await wave2World()));
  after(() => w?.close());

  it('W2 AT-1.2 two tabs, undo twice, and a stale status address', async () => {
    const salma = await as(w, SALMA, 'en');
    const tab2 = await as(w, SALMA, 'en');
    const lesson = w.school.lessons['Comparing fractions'];
    // The second tab is opened before the first press: it still shows "Mark as done".
    const second = await page(tab2, lessonPath(w.school, lesson));
    assert.match(second, /name="state" value="done"/, 'the second tab holds the done press');

    await markClock(w, T1);
    assert.equal((await press(salma, w.school, lesson, 'done')).status, 303, 'first press');
    await markClock(w, T2);
    assert.equal((await press(tab2, w.school, lesson, 'done')).status, 303, 'second-tab press');
    await markClock(w, null);
    const rows = await marks(w);
    assert.equal(rows.length, 1, 'still one row');
    assert.equal(rows[0].marked_at, T1, 'with the first press\'s time');

    const undo = await press(salma, w.school, lesson, 'not-done');
    assert.equal(undo.status, 303);
    assert.equal(undo.headers.get('location'), `/s/${w.school.id}/read/${lesson}?marked=not-done#done-state`);
    assert.deepEqual(await marks(w), [], '"Mark as not done" deletes the row');
    const undone = await page(salma, `/s/${w.school.id}/read/${lesson}?marked=not-done`);
    assert.equal(byId(undone, 'done-status'), 'Done mark removed.');
    assert.equal(byId(undone, 'done-control'), 'Mark as done');

    const again = await press(salma, w.school, lesson, 'not-done');
    assert.equal(again.status, 303, 'pressing it again is no error');
    assert.deepEqual(await marks(w), [], 'and changes nothing');
    const notDone = await page(salma, `/s/${w.school.id}/read/${lesson}?marked=not-done`);
    assert.equal(byId(notDone, 'done-control'), 'Mark as done', 'the not-done state');
    assert.ok(!/class="error"/.test(notDone) && !plain(notDone).includes('Not saved'), 'no error');

    const stale = await page(salma, `/s/${w.school.id}/read/${lesson}?marked=done`);
    assert.equal(byId(stale, 'done-status'), null, 'a stale ?marked=done shows no status line');
    for (const odd of ['yes', 'DONE', '', 'done%20']) {
      assert.equal(byId(await page(salma, `/s/${w.school.id}/read/${lesson}?marked=${odd}`), 'done-status'), null, `?marked=${odd} is ignored`);
    }
  });
});

describe('W2 AT-1.3 with three lessons done the outline ticks exactly those and says "Done: 3 of 5 lessons"; other outlines and the home are unchanged', { concurrency: false }, () => {
  let w: Wave1World;
  before(async () => (w = await wave2World()));
  after(() => w?.close());

  it('W2 AT-1.3 ticks, hidden text, progress line, and nothing else changed', async () => {
    const salma = await as(w, SALMA, 'en');
    const others = [w.school.arabic, w.school.reading, w.school.science];
    const pagesBefore = new Map<string, string>();
    for (const path of [home(w.school), ...others.map((s) => subjectPath(w.school, s)), `/s/${w.school.id}/results`]) pagesBefore.set(path, await page(salma, path));

    await salmaThreeMarks(w, salma);
    const outline = await page(salma, subjectPath(w.school, w.school.math));
    const ticked = [...outline.matchAll(/<li class="is-done"><span class="tick" data-done="lesson"><span aria-hidden="true">✓<\/span><span class="sr-only">([^<]*)<\/span><\/span><a data-lesson="([^"]+)"/g)];
    assert.deepEqual(ticked.map((m) => m[2]).sort(), MATH_ORDER.slice(0, 3).map((t) => w.school.lessons[t]).sort(), 'a tick on exactly the three done lessons');
    for (const m of ticked) assert.equal(m[1], 'Done', 'each with the hidden text "Done"');
    assert.equal((outline.match(/data-done="lesson"/g) ?? []).length, 3, 'no other lesson tick');
    assert.equal(byId(outline, 'done-progress'), 'Done: 3 of 5 lessons', 'the progress line');
    assert.match(outline, /<h1 id="subject-title"[^>]*>[^<]*<\/h1>\s*(?:<style>[^<]*<\/style>)?<p id="done-progress"/, 'right under the title');

    for (const [path, html] of pagesBefore) assert.equal(await page(salma, path), html, `${path} is exactly as before the marks`);
  });
});

describe('W2 AT-1.4 every refused press gets the reading page\'s own answer, and nothing is stored', { concurrency: false }, () => {
  let w: Wave1World;
  before(async () => (w = await wave2World()));
  after(() => w?.close());

  it('W2 AT-1.4 refusals: not assigned, unpublished, removed, made up, another site, state, GET and HEAD, ended access', async () => {
    const salma = await as(w, SALMA, 'en');
    const omar = await as(w, OMAR, 'en');
    await press(salma, w.school, w.school.lessons['Adding fractions'], 'done');
    const stored = await marks(w);
    assert.equal(stored.length, 1, 'one existing mark, so "unchanged" means something');
    const physicsLesson = String((await w.p.sql(`SELECT l.id FROM lesson l JOIN chapter c ON c.id = l.chapter_id WHERE c.subject_id = '${w.school.physics}'`))[0].id);

    /** The press is answered exactly as GET /read answers this person for this lesson, and nothing changes. */
    const sameAsReading = async (who: Client, lessonId: string, status: number, what: string) => {
      const reading = await who.get(lessonPath(w.school, lessonId));
      const res = await press(who, w.school, lessonId, 'done');
      assert.equal(reading.status, status, `${what}: the reading page answers ${status}`);
      assert.equal(res.status, status, `${what}: the press answers ${status}`);
      assert.equal(await res.text(), await reading.text(), `${what}: the same page as the reading page`);
      assert.deepEqual(await marks(w), stored, `${what}: nothing stored`);
    };
    await sameAsReading(omar, w.school.arabicLessons['Prepositions'], 403, 'a subject not assigned to the learner');
    await sameAsReading(salma, physicsLesson, 403, 'an unpublished subject');
    await sameAsReading(salma, w.school.lessons['Old decimals'], 404, 'a removed lesson');
    await sameAsReading(salma, w.school.lessons['Draft lesson'], 404, 'a lesson in a removed chapter');
    await sameAsReading(salma, 'made-up-lesson-id', 403, 'a made-up lesson id');

    const lesson = w.school.lessons['Comparing fractions'];
    const forged = await salma.postWith(markPath(w.school, lesson), { state: 'done' }, { origin: 'https://elsewhere.example' });
    assert.equal(forged.status, 403, 'a POST from another site');
    assert.deepEqual(await marks(w), stored, 'another site: nothing stored');

    for (const state of ['', 'DONE', 'toggle', 'not_done']) {
      const res = await press(salma, w.school, lesson, state);
      assert.equal(res.status, 400, `state "${state}": 400`);
      const text = plain(await res.text());
      assert.ok(text.includes(words('school', 'en')('choiceInvalid')), `state "${state}": today's plain error page`);
      assert.deepEqual(await marks(w), stored, `state "${state}": nothing stored`);
    }
    const noState = await salma.post(markPath(w.school, lesson), {});
    assert.equal(noState.status, 400, 'no state at all: 400');

    // GET or HEAD on the mark address: no route, so 404 for the learner, and nothing written (the Builder's choice: 404).
    for (const method of ['GET', 'HEAD']) {
      const res = await fetch(w.p.url + markPath(w.school, lesson) + '?state=done', { method, redirect: 'manual', headers: { cookie: `lms_session=${salma.cookie('lms_session')}` } });
      assert.equal(res.status, 404, `${method} on the mark address: 404`);
      assert.deepEqual(await marks(w), stored, `${method}: nothing stored`);
    }

    // Salma after the admin ends her access: today's access-ended answer, as her reading page gives it. That
    // answer comes once per signed-in browser (release 1.1), so the reading page is asked from a second one.
    const salma2 = await as(w, SALMA, 'en');
    assert.equal((await w.admin.post(`${personPath(w, w.ids[SALMA.username])}/end`, {})).status, 303, 'End access now');
    const reading = await salma2.get(lessonPath(w.school, lesson));
    const res = await press(salma, w.school, lesson, 'done');
    assert.equal(res.status, reading.status, 'ended access: the reading page\'s status');
    assert.equal(await res.text(), await reading.text(), 'ended access: the reading page\'s own page');
    assert.deepEqual(await marks(w), stored, 'ended access: nothing stored');
  });
});

describe('W2 AT-1.5 with script off the press works the same: plain form, plain redirect, same status line', { concurrency: false }, () => {
  let w: Wave1World;
  let browser: Browser;
  before(async () => {
    w = await wave2World();
    browser = await chromium.launch();
  });
  after(async () => {
    await browser?.close();
    await w?.close();
  });

  it('W2 AT-1.5 the button posts the form and lands on the same lesson with "Marked as done."', async () => {
    const { ctx, page: tab } = await browserAs(browser, w, SALMA, { lang: 'en', script: false });
    const lesson = w.school.lessons['Comparing fractions'];
    await tab.goto(w.p.url + lessonPath(w.school, lesson));
    assert.equal(await tab.locator('#done-control').evaluate((f) => f.tagName + ' ' + (f as HTMLFormElement).method), 'FORM post', 'a plain form');
    await Promise.all([tab.waitForEvent('load'), tab.locator('#done-control button').click()]);
    const url = new URL(tab.url());
    assert.equal(url.pathname + url.search + url.hash, `${lessonPath(w.school, lesson)}?marked=done#done-state`, 'the plain redirect');
    assert.equal((await tab.locator('#done-status').innerText()).trim(), 'Marked as done.');
    assert.equal(await tab.evaluate(() => document.activeElement?.id), 'done-state', 'the block has focus on arrival');
    assert.equal((await tab.locator('#done-control button').innerText()).trim(), 'Mark as not done');
    assert.equal((await marks(w)).length, 1, 'stored');
    await ctx.close();
  });
});

describe('W2 AT-1.6 in the Company and University kits the outline\'s progress line uses the kit\'s lesson word', { concurrency: false }, () => {
  let w: Wave1World;
  before(async () => (w = await wave2World()));
  after(() => w?.close());

  it('W2 AT-1.6 "Done: 3 of 5 sessions" and "Done: 3 of 5 lectures", and the Arabic line with the kit word', async () => {
    for (const lang of ['en', 'ar'] as const) {
      const salma = await as(w, SALMA, lang);
      for (const s of [w.company, w.university]) {
        for (const title of MATH_ORDER.slice(0, 3)) {
          assert.equal((await press(salma, s, s.lessons[title], 'done')).status, 303, `${s.kit}: ${title}`);
        }
        const t = words(s.kit, lang);
        const line = byId(await page(salma, subjectPath(s, s.math)), 'done-progress');
        const expected = lang === 'en'
          ? { company: 'Done: 3 of 5 sessions', university: 'Done: 3 of 5 lectures' }[s.kit as 'company' | 'university']
          : t('doneProgress', { n: '3', total: '5', count: '' });
        assert.equal(line, expected, `${s.kit} ${lang}`);
        assert.ok(line!.includes(t('lessonPlural')), `${s.kit} ${lang}: the kit's plural lesson word`);
      }
    }
    assert.deepEqual(['company', 'university'].map((k) => words(k as 'company', 'ar')('lessonPlural')), ['الجلسات', 'المحاضرات'], 'the Arabic kit words');
  });
});
