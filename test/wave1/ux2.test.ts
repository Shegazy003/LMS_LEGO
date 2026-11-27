// UX-2 (ux-plan v2, LMS wave 1, L1): learner home states. No subject: today's
// sentence, no empty card. A subject with no lessons: its card says "No
// <lessons> here yet." with no action. A subject without a publisher: no
// teacher line and no empty gap. An unavailable database shows today's error
// page (the page is server-rendered: no loading state). Screenshots
// UX-2-phone-ar (Youssef) and UX-2-phone-ar-subject (the empty subject card).
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser } from 'playwright';
import { startInProcess } from '../support/in-process.ts';
import { appointAdmin, createSpace, seed, setUpOwner, signedIn } from '../support/seed.ts';
import { utcDatePlusDays } from '../support/http.ts';
import { ADMIN, SALMA, YOUSSEF, browserAs, go, home, uxShot, wave1World, words, type Wave1World } from './world.ts';

describe('UX-2 learner home empty states', { concurrency: false }, () => {
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

  it('no subject: today\'s sentence and no card', async () => {
    const t = words('school', 'ar');
    const tab = await browserAs(browser, w, YOUSSEF, { lang: 'ar' });
    await go(tab.page, w, home(w.school));
    // LMS redesign R1a (UX-103): the existing nothingAssigned text is the heading of the empty home, then one sentence.
    assert.equal((await tab.page.locator('#nothing-yet h2').innerText()).trim(), t('nothingAssigned'));
    assert.equal(await tab.page.locator('#my-list, #my-list > li, .card a.start').count(), 0, 'no empty card');
    await uxShot(tab.page, 'UX-2-phone-ar');
    await tab.ctx.close();
  });

  it('the empty subject card has no action; the card without a publisher has no teacher line and no gap', async () => {
    const t = words('school', 'ar');
    const tab = await browserAs(browser, w, SALMA, { lang: 'ar' });
    await go(tab.page, w, home(w.school));
    const science = tab.page.locator('#my-list > li', { has: tab.page.locator('h2', { hasText: 'Science club' }) });
    assert.equal((await science.locator('.none').innerText()).trim(), t('noLessonsYet'));
    assert.equal(await science.locator('a.start, button').count(), 0, 'no action');
    const reading = tab.page.locator('#my-list > li', { has: tab.page.locator('h2', { hasText: 'Reading club' }) });
    assert.equal(await reading.locator('.teacher').count(), 0, 'no teacher line');
    // No gap. LMS redesign R1a (UX-1 row, look only; UX-99): the count now sits in the card's side column, so "no
    // gap" is read in the title block: with no teacher line the title is centred on the icon tile, no space kept
    // for the line; on a card with a teacher line, the line sits right under the title.
    const math = tab.page.locator('#my-list > li', { has: tab.page.locator('h2', { hasText: 'Mathematics' }) });
    const offset = await reading.evaluate((li) => {
      const h = li.querySelector('h2')!.getBoundingClientRect();
      const i = li.querySelector('.sicon')!.getBoundingClientRect();
      return Math.abs((h.top + h.bottom) / 2 - (i.top + i.bottom) / 2);
    });
    assert.ok(offset <= 2, `no empty gap: the title is centred on the icon tile (${offset} px off)`);
    const under = await math.evaluate((li) => li.querySelector('.teacher')!.getBoundingClientRect().top - li.querySelector('h2')!.getBoundingClientRect().bottom);
    assert.ok(under >= 0 && under <= 4, `the teacher line right under the title (${under} px)`);
    await science.scrollIntoViewIfNeeded();
    await science.screenshot({ path: `${(await import('./world.ts')).UX_EVIDENCE}UX-2-phone-ar-subject.png` });
    await tab.ctx.close();
  });

  it('an unavailable database: today\'s error page, not a half page', async () => {
    const p = await startInProcess();
    try {
      const owner = await setUpOwner(p.url);
      const spaceId = await createSpace(owner, { name: 'مدرسة مسك', kit: 'school' });
      await appointAdmin(owner, spaceId, { ...ADMIN, valid_until: utcDatePlusDays(30) });
      await seed(p.url, { spaceId, grantedBy: ADMIN.username, people: [{ ...SALMA, valid_until: utcDatePlusDays(30) }] });
      const c = await signedIn(p.url, SALMA.username, SALMA.password);
      const ok = await c.get(`/s/${spaceId}`);
      assert.equal(ok.status, 200, 'positive control');
      // From the home's first read of subjects on, the database fails.
      p.setHooks({ before: (sql) => { if (/FROM subject s/.test(sql)) throw new Error('D1 unavailable'); } });
      const res = await c.get(`/s/${spaceId}`);
      assert.equal(res.status, 500, 'today\'s error answer');
      const body = await res.text();
      assert.ok(!body.includes('id="my-list"') && !body.includes('id="nothing-yet"'), 'no half-made home');
    } finally {
      p.stop();
    }
  });
});
