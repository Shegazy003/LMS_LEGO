// AT-9e (contract product-contract-r2, R2-a): the admin removes the link G1-B
// after a page step naming both people; B vanishes from G1 on the next
// request, including in a session already open. Restore brings it back
// unchanged. The admin's screens in Chromium at phone width, Arabic; G1's
// already-open sign-in is checked at request level. Screenshots go to
// evidence/at-9/.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser } from 'playwright';
import { follow, phone, readable, shot, signIn, submit } from '../support/browser.ts';
import { A, ADMIN, B, G1, as, buildWorld, personPath, type World } from './world.ts';

const EVIDENCE = fileURLToPath(new URL('../../evidence/at-9/', import.meta.url));
let w: World;
let browser: Browser;
const linkRows = async () => (await w.p.sql('SELECT * FROM guardian_link ORDER BY id')).map((r) => JSON.stringify(r));
const learnersOn = (html: string) => [...html.matchAll(/data-learner="([^"]+)"/g)].map((m) => m[1]);

describe('AT-9e the admin removes the link G1-B after a step naming both; B vanishes at once; Restore brings it back unchanged', { concurrency: false }, () => {
  before(async () => {
    mkdirSync(EVIDENCE, { recursive: true });
    w = await buildWorld({ links: true });
    browser = await chromium.launch();
  });
  after(async () => {
    await browser?.close();
    await w?.close();
  });

  it('remove, step one names both people; a plain visit and Cancel change nothing; the confirming tap removes the link; G1\'s open sign-in loses B at its next request', async () => {
    const g1 = await as(w, G1); // signed in before the change, and kept
    const bPage = `/s/${w.spaceId}/linked/${w.ids[B.username]}`;
    assert.deepEqual(learnersOn(await (await g1.get(`/s/${w.spaceId}`)).text()).sort(), [w.ids[A.username], w.ids[B.username]].sort(), 'G1 sees A and B');
    assert.equal((await g1.get(bPage)).status, 200, 'and B\'s page');
    const before = await linkRows();

    const ph = await phone(browser);
    await signIn(w.p.url, ph.page, ADMIN.username, ADMIN.password);
    await ph.page.goto(w.p.url + personPath(w, w.ids[G1.username]));
    await follow(ph.page, `#links [data-linked="${w.ids[B.username]}"] a.unlink`);
    assert.equal((await ph.page.locator('#unlink-title').innerText()).trim(), `إزالة الربط بين ${G1.display_name} و ${B.display_name}؟`, 'the step names both people');
    await shot(ph.page, EVIDENCE, '9e-1-remove-link-step-ar');
    assert.deepEqual(await linkRows(), before, 'opening the step changes nothing');
    await follow(ph.page, '#cancel-unlink');
    assert.ok(ph.page.url().endsWith(personPath(w, w.ids[G1.username])), 'Cancel goes back');
    assert.deepEqual(await linkRows(), before, 'Cancel changes nothing');
    assert.equal((await g1.get(bPage)).status, 200, 'B is still there');

    await follow(ph.page, `#links [data-linked="${w.ids[B.username]}"] a.unlink`);
    assert.equal(await submit(ph.page, 'form#confirm-unlink'), 303, 'the confirming tap');
    assert.ok((await readable(ph.page)).includes('أُزيل الربط. لم يُحذف شيء؛ ويمكنك استعادته أدناه.'));
    await shot(ph.page, EVIDENCE, '9e-2-link-removed-ar');

    // G1's sign-in that was already open: the very next request.
    const home = await (await g1.get(`/s/${w.spaceId}`)).text();
    assert.deepEqual(learnersOn(home), [w.ids[A.username]], 'B has vanished from G1\'s home');
    assert.ok(!home.includes(B.display_name), 'B\'s name is gone');
    const refused = await g1.get(bPage);
    const nobody = await g1.get(`/s/${w.spaceId}/linked/00000000-0000-4000-8000-000000000000`);
    assert.equal(refused.status, 403, 'B\'s page is refused');
    assert.equal(await refused.text(), await nobody.text(), 'refused exactly as for a person who does not exist');

    // Only the one link changed, and only its ended_at; nothing was deleted.
    const after = (await w.p.sql('SELECT * FROM guardian_link ORDER BY id')) as Record<string, unknown>[];
    assert.equal(after.length, 3, 'no row deleted');
    const removed = after.filter((r) => r.ended_at !== null);
    assert.equal(removed.length, 1);
    assert.equal(removed[0].learner_user_id, w.ids[B.username]);

    // Restore: the same row comes back unchanged.
    await ph.page.locator('#links-ended summary').click();
    await shot(ph.page, EVIDENCE, '9e-3-removed-links-ar');
    assert.equal(await submit(ph.page, `#links-ended [data-unlinked="${w.ids[B.username]}"] form`), 303, 'Restore the link');
    assert.ok((await readable(ph.page)).includes('تمت استعادة الربط.'));
    assert.deepEqual(await linkRows(), before, 'every link row exactly as before (same id, creator and time)');
    assert.deepEqual(learnersOn(await (await g1.get(`/s/${w.spaceId}`)).text()).sort(), [w.ids[A.username], w.ids[B.username]].sort(), 'G1 sees B again');
    assert.equal((await g1.get(bPage)).status, 200);
    await ph.ctx.close();
  });

  it('the remove step and the tap are refused for a link that is not active, and change nothing', async () => {
    const before = await linkRows();
    const path = `${personPath(w, w.ids[G1.username])}/links/${w.ids['omar.c']}/remove`;
    assert.equal((await w.admin.get(path)).status, 403, 'no such link: the step');
    assert.equal((await w.admin.post(path, {})).status, 403, 'no such link: the tap');
    const g1 = await as(w, G1);
    assert.equal((await g1.post(`${personPath(w, w.ids[G1.username])}/links/${w.ids[A.username]}/remove`, {})).status, 403, 'the guardian cannot remove a link');
    assert.deepEqual(await linkRows(), before);
  });
});
