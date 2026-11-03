// AT-9f (contract product-contract-r2, R2-a): ending G1's access (release 1.1
// screens) shows "Your access to <space> ended on <date>. Contact the <admin
// label>." on every page and refuses every direct link. Ending A's access
// hides A from G1 and G2; Restore brings A back. G1's message is shown in
// Chromium at phone width; the rest at request level. Screenshots go to
// evidence/at-9/.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser } from 'playwright';
import { utcDatePlusDays, workerNow } from '../support/http.ts';
import { assertPage, phone, readable, shot, signIn } from '../support/browser.ts';
import { A, B, G1, G2, SPACE, as, buildWorld, personPath, type World } from './world.ts';

const EVIDENCE = fileURLToPath(new URL('../../evidence/at-9/', import.meta.url));
let w: World;
let browser: Browser;
let today = '';
const learnersOn = (html: string) => [...html.matchAll(/data-learner="([^"]+)"/g)].map((m) => m[1]).sort();
const AR_ENDED = (d: string) => `انتهى وصولك إلى ${SPACE} في ${d}. للتواصل: مدير.`;
const EN_ENDED = (d: string) => `Your access to ${SPACE} ended on ${d}. Contact the Administrator.`;
const plain = (html: string) => html.replace(/<[^>]+>/g, '');

describe('AT-9f ending G1\'s access, or a learner\'s, takes effect at once; Restore brings it back', { concurrency: false }, () => {
  before(async () => {
    mkdirSync(EVIDENCE, { recursive: true });
    w = await buildWorld({ links: true });
    browser = await chromium.launch();
    today = new Date(await workerNow(w.p.url)).toISOString().slice(0, 10);
  });
  after(async () => {
    await browser?.close();
    await w?.close();
  });

  it('End access now for G1: the message on every page, every direct link refused, also after signing in again; Restore gives G1 back the same learners', async () => {
    const open = await as(w, G1);
    const ph = await phone(browser);
    await signIn(w.p.url, ph.page, G1.username, G1.password);
    assert.equal((await w.admin.post(`${personPath(w, w.ids[G1.username])}/end`, {})).status, 303, 'End access now, through the release 1.1 screen');

    const pages = ['', '/linked', `/linked/${w.ids[A.username]}`, `/linked/${w.ids[B.username]}`, '/linked/no-such-id', `/learn/${w.content.math}`, `/read/${w.content.lesson}`, `/file/${w.content.pdf}`, '/admin', '/publish'];
    // The sign-in that was open: its next page says why, once; then it is over.
    const first = await open.get(`/s/${w.spaceId}/linked`);
    assert.equal(first.status, 403);
    const firstText = plain(await first.text());
    assert.ok(firstText.includes(AR_ENDED(today)) && firstText.includes(EN_ENDED(today)), 'the message, Arabic then English');
    assert.equal((await open.get(`/s/${w.spaceId}/linked`)).status, 302, 'the stopped sign-in is over (to sign-in)');

    // Signing in again: every page of the space gives the message and refuses.
    const again = await as(w, G1);
    for (const path of pages) {
      const res = await again.get(`/s/${w.spaceId}${path}`);
      assert.equal(res.status, 403, `${path || '/'}: refused`);
      assert.equal(res.headers.get('cache-control'), 'no-store');
      const text = plain(await res.text());
      assert.ok(text.includes(AR_ENDED(today)), `${path || '/'}: the message`);
      for (const name of [A.display_name, B.display_name, 'Mathematics']) assert.ok(!text.includes(name), `${path || '/'}: shows no ${name}`);
    }

    // In the browser, at phone width.
    await ph.page.goto(w.p.url + `/s/${w.spaceId}/linked`);
    await assertPage(ph.page, 'G1 after End access now', 'ar');
    assert.ok((await readable(ph.page)).includes(AR_ENDED(today)));
    await shot(ph.page, EVIDENCE, '9f-1-guardian-access-ended-ar');
    await ph.ctx.close();

    // Restore: the same links, nothing to redo.
    assert.equal((await w.admin.post(`${personPath(w, w.ids[G1.username])}/restore`, { valid_until: utcDatePlusDays(20) })).status, 303);
    const back = await as(w, G1);
    assert.deepEqual(learnersOn(await (await back.get(`/s/${w.spaceId}`)).text()), [w.ids[A.username], w.ids[B.username]].sort(), 'G1 sees A and B again');
  });

  it('ending A\'s access hides A from G1 and G2 at their next request; Restore brings A back', async () => {
    const g1 = await as(w, G1);
    const g2 = await as(w, G2);
    const aPage = `/s/${w.spaceId}/linked/${w.ids[A.username]}`;
    assert.equal((await g2.get(aPage)).status, 200, 'G2 sees A before');
    assert.equal((await w.admin.post(`${personPath(w, w.ids[A.username])}/end`, {})).status, 303, 'End access now for A');

    assert.deepEqual(learnersOn(await (await g1.get(`/s/${w.spaceId}`)).text()), [w.ids[B.username]], 'G1 sees B only');
    const g2Home = await (await g2.get(`/s/${w.spaceId}`)).text();
    assert.deepEqual(learnersOn(g2Home), [], 'G2 sees nobody');
    assert.ok(plain(g2Home).includes('لم يُربط بك أي حساب بعد. للتواصل: مدير.'), 'G2\'s home says nobody is linked');
    for (const c of [g1, g2]) {
      const res = await c.get(aPage);
      assert.equal(res.status, 403, 'A\'s page refused');
      assert.equal(await res.text(), await (await c.get(`/s/${w.spaceId}/linked/no-such-id`)).text(), 'refused identically');
    }
    assert.equal((await w.admin.post(`${personPath(w, w.ids[A.username])}/restore`, { valid_until: utcDatePlusDays(15) })).status, 303, 'Restore A');
    assert.deepEqual(learnersOn(await (await g1.get(`/s/${w.spaceId}`)).text()), [w.ids[A.username], w.ids[B.username]].sort(), 'G1 sees A again');
    assert.deepEqual(learnersOn(await (await g2.get(`/s/${w.spaceId}`)).text()), [w.ids[A.username]], 'G2 sees A again');
    assert.equal((await g2.get(aPage)).status, 200);
    assert.equal(Number((await w.p.sql('SELECT COUNT(*) AS n FROM guardian_link WHERE ended_at IS NULL'))[0].n), 3, 'no link was touched');
  });
});
