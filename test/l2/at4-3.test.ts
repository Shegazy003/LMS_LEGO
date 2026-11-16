// AT-4.3 (product-contract v2, LMS wave 1, L2, sections 8.1 and 10.5): the
// privacy rule the scans keep on the new guardian home. The AT-13b crawl from
// Mona's home, in Arabic and English, with activity on: the forbidden list keeps
// Omar C's username, "Science quiz" and his mark, and Salma's draft mark, and
// none is found anywhere Mona can reach; the positive check finds Salma's
// newest published mark and its exam title on the home, equal to her learner
// page's first row. The AT-13a to AT-13d steps (job release-2) run on the new
// home too, with only the section 10 item 5 changes (their own CI steps).
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '../support/http.ts';
import { crawl, exemptRemoved, useLanguage, visible } from '../at13/pages.ts';
import { DRAFT_SCORE, MONA, OMAR, OMAR_EXAM, OMAR_SCORE, SALMA, SALMA_FIRST, YOUSSEF, l2World, learnerPage, linkedHome, type L2World } from './world.ts';

describe('AT-4.3 the privacy scan of the guardian home: nothing of Omar C, no draft; Salma\'s newest published mark is there', { concurrency: false }, () => {
  let w: L2World;
  before(async () => {
    w = await l2World({ story: true });
  });
  after(async () => {
    await w?.close();
  });

  it('Mona, Arabic and English: no page or body she reaches holds Omar C\'s username, "Science quiz", his mark or Salma\'s draft mark; the home holds Salma\'s first row', async () => {
    const c = new Client(w.p.url);
    assert.equal((await c.post('/signin', { username: MONA.username, password: MONA.password })).status, 302);
    const forbidden: [string, string][] = [
      ['Omar C\'s username', OMAR.username], ['Omar C\'s name', OMAR.display_name], ['Omar C\'s exam', OMAR_EXAM], ['Omar C\'s mark', OMAR_SCORE],
      ['Salma\'s draft mark', DRAFT_SCORE], ['the draft\'s exam', 'Final test'], ['Salma\'s username', SALMA.username], ['Youssef\'s username', YOUSSEF.username],
    ];
    const typed = [...Object.values(w.ids).map((id) => learnerPage(w.school, id)), ...Object.values(w.ids).map((id) => `${learnerPage(w.school, id)}/activity`)];
    let scanned = 0;
    for (const lang of ['ar', 'en'] as const) {
      await useLanguage(c, lang);
      const pages = await crawl(c, ['/home', `/s/${w.school.id}`, linkedHome(w.school)], typed);
      assert.ok(pages.some((p) => p.path === linkedHome(w.school) && p.status === 200), `${lang}: the guardian home is crawled`);
      for (const page of pages) {
        scanned++;
        const hits = forbidden.filter(([, value]) => page.body.toLowerCase().includes(value.toLowerCase())).map(([name]) => name);
        assert.deepEqual(hits, [], `${lang} ${page.path} (${page.status})`);
      }
      const home = pages.find((p) => p.path === linkedHome(w.school))!;
      const homeText = visible(exemptRemoved(home.body)).replace(/\s+/g, ' ');
      assert.ok(homeText.includes(SALMA_FIRST.score) && homeText.includes(SALMA_FIRST.exam), `${lang}: Salma's newest published mark and its exam title are on the home`);
      const salmaPage = pages.find((p) => p.path === learnerPage(w.school, w.ids[SALMA.username]))!;
      const first = salmaPage.body.match(/<li class="card result">([\s\S]*?)<\/li>/)?.[1] ?? '';
      assert.ok(first.includes(`>${SALMA_FIRST.exam}<`) && first.includes(`>${SALMA_FIRST.score}<`), `${lang}: and they are her learner page's first row`);
    }
    assert.ok(scanned >= 12, `bodies scanned: ${scanned}`);
  });
});
