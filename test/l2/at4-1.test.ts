// AT-4.1 (product-contract v2, LMS wave 1, L2, section 8.1): Mona's home shows
// one card per active linked learner (as today); each card's result line is
// identical to the first result row of Mona's learner page for that learner
// (ownResults order: exam date newest first, then exam title, then id). For
// Salma "Quiz 3 · Mathematics · <date> · 14 / 20", marked Corrected (before
// "Unit test" by title on the tied date); for Youssef "No results yet.". The
// draft and Omar C's result never appear. After Mathematics is unpublished the
// line still equals the learner page's first row. The home's reads are a fixed
// number, whatever the number of linked learners.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium, type Browser } from 'playwright';
import { startInProcess } from '../support/in-process.ts';
import { appointAdmin, createSpace, seed, setUpOwner, signedIn } from '../support/seed.ts';
import { utcDatePlusDays } from '../support/http.ts';
import { UX_EVIDENCE } from '../wave1/world.ts';
import {
  ADMIN, DRAFT_SCORE, HADEER, MONA, OMAR, OMAR_EXAM, OMAR_SCORE, SALMA, SALMA_FIRST, YOUSSEF, expectedLine, firstResultRow, s4, go, guardianCards, guardianTab,
  l2World, learnerPage, linkThrough, linkedHome, words, type L2World,
} from './world.ts';

describe('AT-4.1 the guardian home shows each linked learner\'s latest published result, equal to the learner page\'s first row', { concurrency: false }, () => {
  let w: L2World;
  let browser: Browser;
  before(async () => {
    w = await l2World();
    browser = await chromium.launch();
  });
  after(async () => {
    await browser?.close();
    await w?.close();
  });

  for (const lang of ['ar', 'en'] as const) {
    it(`${lang}: one card per linked learner; each result line is the learner page's first row; Salma's is Quiz 3, corrected; Youssef has none`, async () => {
      const t = words('school', lang);
      const tab = await guardianTab(browser, w, lang);
      await go(tab.page, w, linkedHome(w.school));
      const cards = await guardianCards(tab.page);
      assert.deepEqual(cards.map((c) => c.name), [SALMA.display_name, YOUSSEF.display_name], 'one card per active linked learner, in today\'s order');
      const text = await tab.page.locator('main').innerText();
      for (const absent of [OMAR_EXAM, OMAR_SCORE, OMAR.username, OMAR.display_name, DRAFT_SCORE, 'Final test']) assert.ok(!text.includes(absent), `${absent} never appears`);
      for (const card of cards) {
        await go(tab.page, w, learnerPage(w.school, card.learnerId));
        const first = await firstResultRow(tab.page);
        assert.deepEqual(card.result, first, `${card.name}: the line's fields are the learner page's first row`);
        assert.equal(card.line, expectedLine(t, first, first ? await s4(w, first.date, lang) : undefined), `${card.name}: the line reads exactly (R1a UX-16a row: the S4 date)`);
        assert.equal(card.lineHref, learnerPage(w.school, card.learnerId), `${card.name}: the whole line links to the learner page`);
      }
      const salma = cards[0];
      assert.deepEqual(salma.result, { ...SALMA_FIRST, score: SALMA_FIRST.score }, 'Salma: Quiz 3, before Unit test on the tied date, corrected');
      if (lang === 'en') assert.equal(salma.line, `Latest result: Quiz 3 · Mathematics · ${await s4(w, SALMA_FIRST.date, 'en')} · 14 / 20 Corrected`);
      assert.equal(cards[1].result, null);
      assert.equal(cards[1].line, lang === 'en' ? 'No results yet.' : t('resultsNone'), 'Youssef: No results yet.');
      assert.equal(cards[0].lastOpened, null, 'activity off: no activity line');
      await tab.ctx.close();
    });
  }

  it('after Mathematics is unpublished, the line still equals the learner page\'s first row', async () => {
    const hadeer = await signedIn(w.p.url, HADEER.username, HADEER.password);
    assert.equal((await hadeer.post(`/s/${w.school.id}/publish/edit/${w.school.math}/unpublish`, {})).status, 303, 'Mathematics unpublished');
    const tab = await guardianTab(browser, w, 'en');
    await go(tab.page, w, linkedHome(w.school));
    const [salma] = await guardianCards(tab.page);
    await go(tab.page, w, learnerPage(w.school, salma.learnerId));
    const first = await firstResultRow(tab.page);
    assert.deepEqual(salma.result, first);
    assert.equal(salma.line, expectedLine(words('school', 'en'), first, first ? await s4(w, first.date, 'en') : undefined));
    await tab.ctx.close();
    assert.equal((await hadeer.post(`/s/${w.school.id}/publish/edit/${w.school.math}/publish`, {})).status, 303, 'published again');
  });

  it('section 8.1: the guardian home reads the database a fixed number of times, whatever the number of linked learners', async () => {
    const p = await startInProcess();
    try {
      const owner = await setUpOwner(p.url);
      const spaceId = await createSpace(owner, { name: 'مدرسة مسك', kit: 'school' });
      await appointAdmin(owner, spaceId, { ...ADMIN, valid_until: utcDatePlusDays(30) });
      const learners = Array.from({ length: 6 }, (_, i) => ({ display_name: `Learner ${i + 1}`, username: `learner.${i + 1}`, password: `learner-pass-${i + 1}`, role: 'learner' as const, mobile: `0103000000${i}` }));
      const s = await seed(p.url, {
        spaceId, grantedBy: ADMIN.username, people: [HADEER, ...learners].map((x) => ({ ...x, valid_until: utcDatePlusDays(30) })),
        subjects: [{ title: 'Mathematics', publisher: HADEER.username, published: true, users: learners.map((l) => l.username), chapters: [{ title: 'One', lessons: [{ title: 'First' }] }] }],
      });
      const admin = await signedIn(p.url, ADMIN.username, ADMIN.password);
      assert.equal((await admin.post(`/s/${spaceId}/admin/people`, { ...MONA, valid_until: utcDatePlusDays(30) })).status, 303);
      const mona = String((p.sqlite.prepare(`SELECT id FROM user WHERE username = '${MONA.username}'`).get() as { id: string }).id);
      assert.equal((await admin.post(`/s/${spaceId}/admin/activity`, { told: '1' })).status, 303, 'activity on (the most reads)');
      const c = await signedIn(p.url, MONA.username, MONA.password);
      const reads = async () => {
        await c.get(`/s/${spaceId}/linked`); // a first visit settles the session refresh
        let n = 0;
        p.setHooks({ before: (sql) => void (/^\s*(SELECT|WITH)\b/i.test(sql) && n++) });
        assert.equal((await c.get(`/s/${spaceId}/linked`)).status, 200);
        p.setHooks({});
        return n;
      };
      await linkThrough(admin, spaceId, mona, s.users[learners[0].username]);
      const one = await reads();
      for (const l of learners.slice(1)) await linkThrough(admin, spaceId, mona, s.users[l.username]);
      const six = await reads();
      assert.equal(six, one, `the same number of reads for 1 and for 6 linked learners (${one})`);
      mkdirSync(UX_EVIDENCE, { recursive: true });
      writeFileSync(`${UX_EVIDENCE}../l2-guardian-home-reads.txt`, `Guardian home database reads (SELECT statements per request, section 8.1, activity on): ${one} with 1 linked learner, ${six} with 6 linked learners.\n`);
    } finally {
      p.stop();
    }
  });
});
