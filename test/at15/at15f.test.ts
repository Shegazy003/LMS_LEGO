// AT-15f (contract product-contract-r2, R2-d): the learner is told, before and
// on the recorded page. Whenever the setting is on, every learner sees one
// permanent line on the learner home and on each lesson page they open,
// whether or not a guardian is linked. School kit: "Your parent can see which
// lessons you opened and the date you last opened them." (and in Arabic);
// Company kit: "Your supervisor can see …", built from the kit's labels. The
// line is on the lesson page itself, so the learner is told in the same
// response that is recorded. It is not shown when the setting is off.
// Screenshots go to evidence/at-15/.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser } from 'playwright';
import { assertPage, phone, readable, shot, signIn } from '../support/browser.ts';
import { makeLabel } from '../../src/labels.ts';
import { seedKit } from '../../src/kits/seed.ts';
import { useLanguage } from '../at13/pages.ts';
import { A, C, D, KARIM, as } from '../at9/world.ts';
import { NOTICE, activityWorld, lessonPath, switchOff, switchOn, viewRows, type ActivityWorld } from './activity.ts';

const EVIDENCE = fileURLToPath(new URL('../../evidence/at-15/', import.meta.url));
const noticeOf = (html: string) => html.match(/<p id="activity-notice"[^>]*>([^<]*)<\/p>/g)?.map((m) => m.replace(/<[^>]+>/g, '')) ?? [];

describe('AT-15f every learner is told on their home and on each lesson page while lesson activity is on', { concurrency: false }, () => {
  let w: ActivityWorld;
  let browser: Browser;
  before(async () => {
    mkdirSync(EVIDENCE, { recursive: true });
    w = await activityWorld();
    browser = await chromium.launch();
  });
  after(async () => {
    await browser?.close();
    await w?.close();
  });

  it('the sentence is built from the kit\'s labels: School and Company, Arabic and English', () => {
    for (const [seed, words] of [['school', NOTICE.school], ['company', NOTICE.company]] as const) {
      for (const lang of ['en', 'ar'] as const) assert.equal(makeLabel(lang, seedKit(seed))('activityNotice'), words[lang], `${seed} ${lang}`);
    }
  });

  it('off: no learner sees the line', async () => {
    for (const who of [A, C]) {
      const c = await as(w, who);
      for (const path of [`/s/${w.spaceId}`, lessonPath(w)]) assert.deepEqual(noticeOf(await (await c.get(path)).text()), [], `${who.username} ${path}`);
    }
  });

  it('on: every learner, with or without a guardian, sees one line on the home page and on each lesson page, in Arabic and English', async () => {
    await switchOn(w);
    for (const who of [A, C, D]) {
      const c = await as(w, who);
      for (const lang of ['ar', 'en'] as const) {
        await useLanguage(c, lang);
        for (const path of [`/s/${w.spaceId}`, lessonPath(w)]) {
          const res = await c.get(path);
          assert.equal(res.status, 200);
          assert.deepEqual(noticeOf(await res.text()), [NOTICE.school[lang]], `${who.username} ${lang} ${path}: one line`);
        }
      }
    }
  });

  it('the line is in the very response that records the open', async () => {
    const before = (await viewRows(w)).length;
    const c = await as(w, A);
    await useLanguage(c, 'ar');
    const nahw = String((await w.p.sql(`SELECT id FROM lesson WHERE title = 'Nahw basics'`))[0].id);
    const res = await c.get(lessonPath(w, nahw));
    assert.deepEqual(noticeOf(await res.text()), [NOTICE.school.ar], 'told in this response');
    assert.equal((await viewRows(w)).length, before + 1, 'and this response recorded the open');
  });

  it('the Company kit says "Your supervisor"', async () => {
    await switchOn(w, { spaceId: w.otherSpaceId });
    const karim = await as(w, KARIM);
    for (const lang of ['en', 'ar'] as const) {
      await useLanguage(karim, lang);
      for (const path of [`/s/${w.otherSpaceId}`, `/s/${w.otherSpaceId}/read/${w.content.otherLesson}`]) {
        assert.deepEqual(noticeOf(await (await karim.get(path)).text()), [NOTICE.company[lang]], `${lang} ${path}`);
      }
    }
  });

  it('in a browser at phone width: the line on the home page and the lesson page (Arabic, English); gone once switched off', async () => {
    const ph = await phone(browser);
    await signIn(w.p.url, ph.page, A.username, A.password);
    await ph.page.goto(w.p.url + '/account/language');
    await ph.page.selectOption('form#language select[name=lang]', 'ar');
    await Promise.all([ph.page.waitForEvent('load'), ph.page.locator('form#language button[type=submit]').click()]);
    await ph.page.goto(w.p.url + `/s/${w.spaceId}`);
    await assertPage(ph.page, 'the learner home (Arabic)', 'ar');
    assert.ok((await readable(ph.page)).includes(NOTICE.school.ar));
    await shot(ph.page, EVIDENCE, '15f-1-learner-home-ar');
    await ph.page.goto(w.p.url + lessonPath(w));
    await assertPage(ph.page, 'the lesson page (Arabic)', 'ar');
    assert.ok((await readable(ph.page)).includes(NOTICE.school.ar));
    await shot(ph.page, EVIDENCE, '15f-2-lesson-page-ar');
    await ph.page.goto(w.p.url + '/account/language');
    await ph.page.selectOption('form#language select[name=lang]', 'en');
    await Promise.all([ph.page.waitForEvent('load'), ph.page.locator('form#language button[type=submit]').click()]);
    await ph.page.goto(w.p.url + lessonPath(w));
    await assertPage(ph.page, 'the lesson page (English)', 'en');
    assert.ok((await readable(ph.page)).includes(NOTICE.school.en));
    await shot(ph.page, EVIDENCE, '15f-3-lesson-page-en');
    await switchOff(w);
    await ph.page.reload();
    assert.ok(!(await readable(ph.page)).includes(NOTICE.school.en), 'not shown once switched off');
    await ph.ctx.close();
  });
});
