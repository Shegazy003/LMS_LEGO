// AT-9h (contract product-contract-r2, R2-a): a person holding guardian and
// publisher (or learner) roles in the same space sees each view under its own
// role. A person who is guardian of themselves is refused at linking.
//
// A person with two roles in one space is written by the seeding route (no
// screen gives an existing person a second role in this release): Hadeer is a
// publisher and a guardian, B is a learner and a guardian. The admin links
// them through the real form: Hadeer to C, B to A. Hadeer's and B's homes are
// shown in Chromium at phone width; screenshots go to evidence/at-9/.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser } from 'playwright';
import { utcDatePlusDays } from '../support/http.ts';
import { follow, phone, readable, shot, signIn } from '../support/browser.ts';
import { A, B, C, G1, HADEER, as, buildWorld, linkThrough, type World } from './world.ts';

const EVIDENCE = fileURLToPath(new URL('../../evidence/at-9/', import.meta.url));
let w: World;
let browser: Browser;
const learnersOn = (html: string) => [...html.matchAll(/data-learner="([^"]+)"/g)].map((m) => m[1]).sort();
const linkCount = async () => Number((await w.p.sql('SELECT COUNT(*) AS n FROM guardian_link'))[0].n);

describe('AT-9h a person with two roles sees each view under its own role; nobody is their own guardian', { concurrency: false }, () => {
  before(async () => {
    mkdirSync(EVIDENCE, { recursive: true });
    const until = utcDatePlusDays(30);
    w = await buildWorld({ guardians: true, extra: [{ username: HADEER.username, role: 'guardian', valid_until: until }, { username: B.username, role: 'guardian', valid_until: until }] });
    assert.equal((await linkThrough(w, w.ids[HADEER.username], w.ids[C.username])).status, 303, 'Hadeer linked to C');
    assert.equal((await linkThrough(w, w.ids[B.username], w.ids[A.username])).status, 303, 'B linked to A');
    browser = await chromium.launch();
  });
  after(async () => {
    await browser?.close();
    await w?.close();
  });

  it('publisher and guardian: Hadeer\'s home is her publisher home; her guardian home shows C only', async () => {
    const hadeer = await as(w, HADEER);
    const home = await (await hadeer.get(`/s/${w.spaceId}`)).text();
    assert.ok(home.includes(`/s/${w.spaceId}/publish/edit/${w.content.math}`), 'her home is the publisher home, with her subject\'s editor');
    assert.ok(home.includes(`href="/s/${w.spaceId}/linked"`), 'the nav leads to her guardian home');
    assert.deepEqual(learnersOn(home), [], 'no learner card on the publisher home');
    const guardian = await (await hadeer.get(`/s/${w.spaceId}/linked`)).text();
    assert.deepEqual(learnersOn(guardian), [w.ids[C.username]], 'as a guardian: C only');
    assert.ok(!guardian.includes('/publish/'), 'the guardian view carries no editor');
    // Each role keeps its own limits: the publisher edits her subject; the guardian page of an unlinked learner is refused.
    assert.equal((await hadeer.get(`/s/${w.spaceId}/publish/edit/${w.content.math}`)).status, 200, 'still edits as a publisher');
    assert.equal((await hadeer.get(`/s/${w.spaceId}/linked/${w.ids[A.username]}`)).status, 403, 'A is not linked to her');

    const ph = await phone(browser);
    await signIn(w.p.url, ph.page, HADEER.username, HADEER.password);
    await shot(ph.page, EVIDENCE, '9h-1-publisher-and-guardian-home-ar');
    await follow(ph.page, '#nav-guardian');
    assert.ok((await readable(ph.page)).includes(C.display_name));
    await shot(ph.page, EVIDENCE, '9h-2-publisher-as-guardian-ar');
    await ph.ctx.close();
  });

  it('learner and guardian: B\'s home is B\'s own learner home; B\'s guardian home shows A only, and B reads only B\'s own lessons', async () => {
    const b = await as(w, B);
    const home = await (await b.get(`/s/${w.spaceId}`)).text();
    assert.ok(home.includes(`/s/${w.spaceId}/learn/${w.content.math}`), 'B\'s own subject, as a learner');
    assert.ok(!home.includes(`/learn/${w.content.arabic}`), 'not A\'s subject');
    assert.deepEqual(learnersOn(home), [], 'no learner card on the learner home');
    assert.ok(home.includes(`href="/s/${w.spaceId}/linked"`), 'the nav leads to B\'s guardian home');
    const guardian = await (await b.get(`/s/${w.spaceId}/linked`)).text();
    assert.deepEqual(learnersOn(guardian), [w.ids[A.username]], 'as a guardian: A only');
    assert.ok(guardian.includes('Arabic'), 'A\'s subject title');
    assert.equal((await b.get(`/s/${w.spaceId}/learn/${w.content.arabic}`)).status, 403, 'being A\'s guardian opens none of A\'s subjects');

    const ph = await phone(browser);
    await signIn(w.p.url, ph.page, B.username, B.password);
    await shot(ph.page, EVIDENCE, '9h-3-learner-and-guardian-home-ar');
    await ph.ctx.close();
  });

  it('a person who would be guardian of themselves is refused at linking, by the form and by the database', async () => {
    const before = await linkCount();
    const res = await linkThrough(w, w.ids[B.username], w.ids[B.username]);
    assert.equal(res.status, 400);
    assert.ok((await res.text()).includes('لا يمكن ربط الشخص بنفسه. لم يتغيّر شيء.'), 'the plain message');
    assert.equal(await linkCount(), before, 'nothing stored');
    // The person page never offers them themselves.
    const page = await (await w.admin.get(`/s/${w.spaceId}/admin/people/${w.ids[B.username]}`)).text();
    const offered = [...(page.match(/<form id="link-learner"[\s\S]*?<\/form>/)?.[0] ?? '').matchAll(/value="([^"]+)"/g)].map((m) => m[1]);
    assert.ok(!offered.includes(w.ids[B.username]), 'not offered');
    // Even a row written straight into the database is refused (CHECK), and an existing one would show nobody.
    await assert.rejects(
      w.p.sql(`INSERT INTO guardian_link (id, space_id, guardian_user_id, learner_user_id, created_by, created_at) VALUES ('self', '${w.spaceId}', '${w.ids[B.username]}', '${w.ids[B.username]}', '${w.ids[G1.username]}', 0)`),
      /CHECK/i,
    );
  });
});
