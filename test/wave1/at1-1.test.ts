// AT-1.1 (product-contract v2, LMS wave 1, L1): the home lists exactly Salma's
// published, assigned subjects, in today's order (by title); not Physics
// (unpublished), not Forklift safety (another space).
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { startInProcess } from '../support/in-process.ts';
import { appointAdmin, createSpace, seed, setUpOwner, signedIn } from '../support/seed.ts';
import { utcDatePlusDays } from '../support/http.ts';
import { ADMIN, HADEER, SALMA, SALMA_SUBJECTS, UX_EVIDENCE, browserAs, go, home, wave1World, type Wave1World } from './world.ts';
import { cardsOn } from './home.ts';

describe('AT-1.1 the home lists exactly the learner\'s published, assigned subjects, by title', { concurrency: false }, () => {
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

  it('section 4.5: the home reads the database a fixed number of times, whatever the number of subjects (no read per subject)', async () => {
    const p = await startInProcess();
    try {
      const owner = await setUpOwner(p.url);
      const spaceId = await createSpace(owner, { name: 'مدرسة مسك', kit: 'school' });
      await appointAdmin(owner, spaceId, { ...ADMIN, valid_until: utcDatePlusDays(30) });
      const subject = (title: string) => ({ title, publisher: HADEER.username, published: true, users: [SALMA.username], chapters: [{ title: 'One', lessons: [{ title: `${title} 1` }, { title: `${title} 2` }] }] });
      await seed(p.url, { spaceId, grantedBy: ADMIN.username, people: [HADEER, SALMA].map((x) => ({ ...x, valid_until: utcDatePlusDays(30) })), subjects: [subject('Alpha')] });
      const c = await signedIn(p.url, SALMA.username, SALMA.password);
      const reads = async () => {
        await c.get(`/s/${spaceId}`); // a first visit settles the session refresh
        let n = 0;
        p.setHooks({ before: (sql) => void (/^\s*(SELECT|WITH)\b/i.test(sql) && n++) });
        assert.equal((await c.get(`/s/${spaceId}`)).status, 200);
        p.setHooks({});
        return n;
      };
      const one = await reads();
      await seed(p.url, { spaceId, grantedBy: ADMIN.username, subjects: ['Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta'].map(subject) });
      const six = await reads();
      assert.equal(six, one, `the same number of reads for 1 and for 6 subjects (${one})`);
      mkdirSync(UX_EVIDENCE, { recursive: true });
      writeFileSync(`${UX_EVIDENCE}../wave1-home-reads.txt`, `Learner home database reads (SELECT statements per request, section 4.5): ${one} with 1 subject, ${six} with 6 subjects.\n`);
    } finally {
      p.stop();
    }
  });

  for (const lang of ['ar', 'en'] as const) {
    it(`${lang}: one card per subject, Arabic grammar, Mathematics, Reading club, Science club; not Physics, not Forklift safety`, async () => {
      const tab = await browserAs(browser, w, SALMA, { lang });
      await go(tab.page, w, home(w.school));
      const cards = await cardsOn(tab.page);
      assert.deepEqual(cards.map((c) => c.title), SALMA_SUBJECTS);
      const text = await tab.page.locator('main').innerText();
      for (const absent of ['Physics', 'Forklift safety', 'Speed', 'Forklift rules']) assert.ok(!text.includes(absent), `${absent} is not shown`);
      await tab.ctx.close();
    });
  }
});
