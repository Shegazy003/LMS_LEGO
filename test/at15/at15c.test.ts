// AT-15c (contract product-contract-r2, R2-d): the guardian's page. With it on,
// learner A opens lesson L1 on one day and again on a later day: the database
// holds one row for (L1, A) with the later date; a second open the same day
// changes nothing. G1 opens the Lesson activity page for A (from the guardian
// home; a switcher moves between A and B; a back link returns to the guardian
// home): for each subject assigned to A, each lesson title with "Last opened
// on <date with year>" or "No open recorded", and always "Recording since
// <date with year>". Never "Not opened", in any wording; no time, count or
// duration. 40 lessons per subject stay readable at phone width. G2 sees A; G1
// sees A and B on separate pages; a learner not linked to the viewer is
// refused identically. Only lesson titles and dates: no content, file or link.
// Screenshots go to evidence/at-15/.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser } from 'playwright';
import { assertPage, phone, readable, shot, signIn } from '../support/browser.ts';
import { setClockOffsetDays } from '../support/http.ts';
import { seed } from '../support/seed.ts';
import { useLanguage, visible } from '../at13/pages.ts';
import { A, ADMIN, B, C, G1, G2, as } from '../at9/world.ts';
import { activityPath, activityWorld, guardianSees, moveToDay, open, switchOn, viewRows, type ActivityWorld } from './activity.ts';

const EVIDENCE = fileURLToPath(new URL('../../evidence/at-15/', import.meta.url));
const FORTY = Array.from({ length: 40 }, (_, i) => ({ title: `Reading ${String(i + 1).padStart(2, '0')}: a story about the river and the long road home` }));

describe('AT-15c the guardian\'s lesson-activity page: one row per lesson with the last date, titles and dates only', { concurrency: false }, () => {
  let w: ActivityWorld;
  let browser: Browser;
  let day0 = '';
  let day2 = '';
  let reading = { id: '', lessons: [] as string[] };
  before(async () => {
    mkdirSync(EVIDENCE, { recursive: true });
    w = await activityWorld();
    browser = await chromium.launch();
    const s = await seed(w.p.url, {
      spaceId: w.spaceId, grantedBy: ADMIN.username,
      subjects: [{ title: 'Reading', published: true, users: [A.username], chapters: [{ title: 'Stories', lessons: FORTY }] }],
    });
    reading = { id: s.subjects.Reading.id, lessons: FORTY.map((l) => s.subjects.Reading.chapters.Stories.lessons[l.title].id) };
  });
  after(async () => {
    await setClockOffsetDays(w.p.url, 0);
    await browser?.close();
    await w?.close();
  });

  it('A opens L1 on one day and again on a later day: one row with the later date; a second open the same day changes nothing', async () => {
    day0 = await moveToDay(w, 0);
    await switchOn(w);
    assert.equal((await open(w, A)).status, 200);
    const mine = async () => (await viewRows(w)).filter((r) => r.learner_user_id === w.ids[A.username] && r.lesson_id === w.content.lesson);
    assert.deepEqual((await mine()).map((r) => r.last_opened_on), [day0]);
    day2 = await moveToDay(w, 2);
    assert.equal((await open(w, A)).status, 200);
    assert.deepEqual((await mine()).map((r) => r.last_opened_on), [day2], 'one row, now with the later date');
    const before = await viewRows(w);
    assert.equal((await open(w, A)).status, 200);
    assert.equal((await open(w, A)).status, 200);
    assert.deepEqual(await viewRows(w), before, 'the same day again changes nothing');
    assert.equal((await mine()).length, 1);
  });

  it('G1 reaches A\'s page from the guardian home: per subject, each lesson with its date or "No open recorded", and "Recording since"', async () => {
    const g1 = await as(w, G1);
    await useLanguage(g1, 'en');
    const home = await (await g1.get(`/s/${w.spaceId}/linked`)).text();
    assert.ok(home.includes(`href="${activityPath(w, w.ids[A.username])}"`), 'the guardian home leads to A\'s lesson activity');
    assert.ok(home.includes(`href="${activityPath(w, w.ids[B.username])}"`), 'and to B\'s');
    const seen = await guardianSees(w, G1, w.ids[A.username]);
    assert.equal(seen.status, 200);
    assert.equal(seen.cacheControl, 'no-store');
    assert.equal(seen.shown.since, day0, 'Recording since the switch-on day (G1 was linked the same day)');
    assert.ok(visible(seen.html).includes(`Recording since`), 'the words');
    assert.deepEqual(Object.keys(seen.shown.subjects), ['Arabic', 'Mathematics', 'Reading'], 'every subject assigned to A (not the unpublished Physics)');
    assert.deepEqual(seen.shown.subjects.Mathematics, { 'Adding fractions': day2 });
    assert.deepEqual(seen.shown.subjects.Arabic, { 'Nahw basics': null }, 'No open recorded');
    assert.equal(Object.keys(seen.shown.subjects.Reading).length, 40);
    assert.ok(visible(seen.html).includes('Last opened on') && visible(seen.html).includes('No open recorded'));
    assert.deepEqual(seen.shown.switcher.map((s) => [s.name, s.current]), [['Salma Test', true], ['Youssef Test', false]], 'the switcher: A shown, B one step away');
    assert.match(seen.html, new RegExp(`<a id="back" href="/s/${w.spaceId}/linked">`), 'the way back to the guardian home');
  });

  it('titles and dates only: no lesson address, file, link or content; never "Not opened", no time, count or duration (Arabic and English)', async () => {
    const g1 = await as(w, G1);
    for (const lang of ['ar', 'en'] as const) {
      await useLanguage(g1, lang);
      const html = await (await g1.get(activityPath(w, w.ids[A.username]))).text();
      const text = visible(html);
      for (const href of html.matchAll(/href="([^"]*)"/g)) {
        assert.ok(href[1] === `/s/${w.spaceId}/linked` || href[1].startsWith(`/s/${w.spaceId}/linked/`) || ['/', `/s/${w.spaceId}`, '/account'].includes(href[1]), `${lang}: only the guardian's own pages are linked (${href[1]})`);
      }
      assert.ok(!/\/read\/|\/file\/|\/learn\//.test(html), `${lang}: no lesson, file or subject address`);
      for (const content of ['Worksheet', 'Pizza slices', 'A note only learners read', 'Fractions</', 'Stories', 'Grammar']) {
        assert.ok(!html.includes(content), `${lang}: no content, file or chapter (${content})`);
      }
      assert.ok(!/not opened|never opened|unopened|times|minutes|hours|studied|completed/i.test(text), `${lang}: never "Not opened", a count or a duration`);
      assert.ok(!/لم يُفتح|لم يفتح|مرات|دقيقة|دقائق|ساعة/.test(text), `${lang}: not in Arabic either`);
      assert.ok(!/\b\d{1,2}:\d{2}\b/.test(text), `${lang}: no time of day`);
      const dates = [...html.matchAll(/<bdi dir="ltr" class="nowrap">([^<]*)<\/bdi>/g)].map((m) => m[1]);
      assert.ok(dates.length >= 2 && dates.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)), `${lang}: every date is a calendar day with its year (${dates.join(', ')})`);
    }
  });

  it('G2 sees A; G1 sees B on a page of its own; a learner not linked to the viewer is refused identically', async () => {
    const g2 = await guardianSees(w, G2, w.ids[A.username]);
    assert.equal(g2.status, 200);
    assert.deepEqual(g2.shown.subjects.Mathematics, { 'Adding fractions': day2 }, 'G2 sees A\'s open');
    assert.deepEqual(g2.shown.switcher.map((s) => s.name), ['Salma Test'], 'G2 has A only');
    const b = await guardianSees(w, G1, w.ids[B.username]);
    assert.equal(b.status, 200);
    assert.deepEqual(Object.keys(b.shown.subjects), ['Mathematics'], 'B\'s own subjects');
    assert.deepEqual(b.shown.subjects.Mathematics, { 'Adding fractions': null }, 'B has not opened it: A\'s open is not B\'s');
    assert.deepEqual(b.shown.switcher.map((s) => [s.name, s.current]), [['Salma Test', false], ['Youssef Test', true]]);
    const c2 = await as(w, G2);
    const missing = await c2.get(`/s/${w.spaceId}/linked/no-such-person/activity`);
    const missingBody = await missing.text();
    assert.equal(missing.status, 403);
    for (const other of [B, C]) {
      const res = await c2.get(activityPath(w, w.ids[other.username]));
      assert.equal(res.status, 403, `G2, ${other.username}`);
      assert.equal(await res.text(), missingBody, `G2, ${other.username}: the same bytes as a learner who does not exist`);
    }
    const other = await c2.get(`/s/${w.otherSpaceId}/linked/${w.ids['karim.x']}/activity`);
    assert.equal(other.status, 403, 'another space');
  });

  it('a long list (40 lessons in one subject) stays readable at phone width, reached from the guardian home, in Arabic and English', async () => {
    for (const id of reading.lessons.slice(0, 3)) assert.equal((await open(w, A, id)).status, 200);
    const ph = await phone(browser);
    await signIn(w.p.url, ph.page, G1.username, G1.password);
    await ph.page.goto(w.p.url + '/account/language');
    await ph.page.selectOption('form#language select[name=lang]', 'ar');
    await Promise.all([ph.page.waitForEvent('load'), ph.page.locator('form#language button[type=submit]').click()]);
    await ph.page.goto(w.p.url + `/s/${w.spaceId}/linked`);
    await Promise.all([ph.page.waitForEvent('load'), ph.page.locator(`section[data-learner="${w.ids[A.username]}"] a.activity-link`).click()]);
    await assertPage(ph.page, 'A\'s lesson activity (Arabic)', 'ar');
    const ar = await readable(ph.page);
    assert.ok(ar.includes('التسجيل منذ') && ar.includes('آخر فتح في') && ar.includes('لم يُسجَّل فتح'), 'the Arabic words');
    assert.equal(await ph.page.locator('#activity section.card').nth(2).locator('li').count(), 40, '40 lessons listed');
    const widths = await ph.page.locator('#activity li').evaluateAll((items) => items.map((li) => li.getBoundingClientRect().right - li.getBoundingClientRect().left));
    assert.ok(widths.every((x) => x <= 412), 'every row fits the phone width');
    await shot(ph.page, EVIDENCE, '15c-1-guardian-activity-ar');
    await Promise.all([ph.page.waitForEvent('load'), ph.page.locator('#activity-learners a:not([aria-current])').click()]);
    await assertPage(ph.page, 'B\'s lesson activity, through the switcher (Arabic)', 'ar');
    assert.ok((await readable(ph.page)).includes('Youssef Test'));
    await ph.page.goto(w.p.url + '/account/language');
    await ph.page.selectOption('form#language select[name=lang]', 'en');
    await Promise.all([ph.page.waitForEvent('load'), ph.page.locator('form#language button[type=submit]').click()]);
    await ph.page.goto(w.p.url + activityPath(w, w.ids[A.username]));
    await assertPage(ph.page, 'A\'s lesson activity (English)', 'en');
    const en = await readable(ph.page);
    assert.ok(en.includes('Recording since') && en.includes('Last opened on') && en.includes('No open recorded'));
    await shot(ph.page, EVIDENCE, '15c-2-guardian-activity-en');
    await Promise.all([ph.page.waitForEvent('load'), ph.page.locator('#back').click()]);
    assert.ok(ph.page.url().endsWith(`/s/${w.spaceId}/linked`), 'the back link returns to the guardian home');
    await ph.ctx.close();
  });
});
