// AT-2.6 (product-contract v2, LMS wave 1, L1, section 5.2 "No prefetch"):
// opening a lesson by Next records activity exactly as opening it from the
// outline (one last_opened_on per learner and lesson, only while the switch is
// on); the home, the subject page and the Next and Previous links record
// nothing, and no page asks the browser to prefetch a lesson.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser } from 'playwright';
import { OMAR, SALMA, activity, as, browserAs, go, home, lessonPath, subjectPath, wave1World, type Wave1World } from './world.ts';

const rows = async (w: Wave1World) =>
  (await w.p.sql('SELECT lesson_id, learner_user_id, last_opened_on FROM lesson_view ORDER BY learner_user_id, lesson_id')).map((r) => ({ ...r }));

describe('AT-2.6 Next records an open exactly as the outline does; nothing else records, nothing is prefetched', { concurrency: false }, () => {
  let w: Wave1World;
  let browser: Browser;
  before(async () => {
    w = await wave1World();
    browser = await chromium.launch();
  });
  after(async () => {
    await browser?.close();
    await w?.close();
  });

  it('off: following Next writes nothing', async () => {
    const tab = await browserAs(browser, w, SALMA, { lang: 'en' });
    await go(tab.page, w, lessonPath(w.school, w.school.lessons['Adding fractions']));
    await Promise.all([tab.page.waitForEvent('load'), tab.page.locator('a#next-lesson').click()]);
    assert.deepEqual(await rows(w), []);
    await tab.ctx.close();
  });

  it('on: Next and the outline write the same single row per learner and lesson; home, subject page and the links themselves write none', async () => {
    await activity(w, true);
    const s = w.school;
    const salma = w.ids[SALMA.username];
    const omar = w.ids[OMAR.username];
    const tab = await browserAs(browser, w, SALMA, { lang: 'en' });
    const requested: string[] = [];
    tab.page.on('request', (r) => requested.push(new URL(r.url()).pathname));

    await go(tab.page, w, home(s));
    await go(tab.page, w, subjectPath(s, s.math));
    await go(tab.page, w, subjectPath(s, s.math, 'all'));
    assert.deepEqual(await rows(w), [], 'the home and the subject page record nothing');

    await go(tab.page, w, lessonPath(s, s.lessons['Adding fractions']));
    const afterFirst = await rows(w);
    assert.deepEqual(afterFirst.map((r) => r.lesson_id), [s.lessons['Adding fractions']], 'the open itself, and not the lesson its Next link names');
    await tab.page.waitForTimeout(500);
    assert.ok(!requested.includes(lessonPath(s, s.lessons['Comparing fractions'])), 'the browser was not asked to fetch the next lesson');

    await Promise.all([tab.page.waitForEvent('load'), tab.page.locator('a#next-lesson').click()]);
    await Promise.all([tab.page.waitForEvent('load'), tab.page.locator('a#previous-lesson').click()]);
    await Promise.all([tab.page.waitForEvent('load'), tab.page.locator('a#next-lesson').click()]);
    const byNext = (await rows(w)).filter((r) => r.learner_user_id === salma);
    assert.equal(byNext.length, 2, 'one row per lesson, however often it is opened');

    // Omar opens "Comparing fractions" from the outline: the same row as Salma's by Next.
    const omarTab = await browserAs(browser, w, OMAR, { lang: 'en' });
    await go(omarTab.page, w, subjectPath(s, s.math, 'all'));
    await Promise.all([omarTab.page.waitForEvent('load'), omarTab.page.locator(`a[data-lesson="${s.lessons['Comparing fractions']}"]`).click()]);
    const all = await rows(w);
    const salmaRow = all.find((r) => r.learner_user_id === salma && r.lesson_id === s.lessons['Comparing fractions']);
    const omarRow = all.find((r) => r.learner_user_id === omar && r.lesson_id === s.lessons['Comparing fractions']);
    assert.ok(salmaRow && omarRow);
    assert.equal(salmaRow.last_opened_on, omarRow.last_opened_on, 'the same calendar day, by Next or by the outline');
    assert.deepEqual(Object.keys(salmaRow), Object.keys(omarRow));
    await tab.ctx.close();
    await omarTab.ctx.close();
  });

  it('no page asks the browser to prefetch, prerender or preload anything', async () => {
    const s = w.school;
    const c = await as(w, SALMA);
    for (const path of [home(s), subjectPath(s, s.math), subjectPath(s, s.math, 'all'), lessonPath(s, s.lessons['Comparing fractions']), lessonPath(s, s.lessons['First book'])]) {
      const body = await (await c.get(path)).text();
      assert.ok(!/prefetch|prerender|preload|speculationrules|rel="next"|rel="prev"/i.test(body), `${path}: no prefetch hint`);
      assert.ok(!/<link\b[^>]*href="[^"]*\/read\//i.test(body), `${path}: no link element to a lesson`);
    }
  });
});
