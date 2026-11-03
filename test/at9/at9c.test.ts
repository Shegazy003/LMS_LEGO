// AT-9c (contract product-contract-r2, R2-a): the admin sends G1 a
// first-password reset link through the existing WhatsApp / Copy flow
// (release 1 behaviour, unchanged): last digits, one confirming tap, the
// WhatsApp and Copy buttons with the fixed message, a link that works once.
// The admin's screens in Chromium at phone width, Arabic; the link is then used
// at request level. Screenshots go to evidence/at-9/.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser } from 'playwright';
import { Client } from '../support/http.ts';
import { readIssued } from '../support/admin.ts';
import { phone, readable, shot, signIn, submit } from '../support/browser.ts';
import { ADMIN, G1, SPACE, buildWorld, personPath, type World } from './world.ts';

const EVIDENCE = fileURLToPath(new URL('../../evidence/at-9/', import.meta.url));
let w: World;
let browser: Browser;

describe('AT-9c the admin sends G1 a first-password reset link through the WhatsApp / Copy flow', { concurrency: false }, () => {
  before(async () => {
    mkdirSync(EVIDENCE, { recursive: true });
    w = await buildWorld({ guardians: true });
    browser = await chromium.launch();
  });
  after(async () => {
    await browser?.close();
    await w?.close();
  });

  it('the release 1 flow, unchanged, for a guardian: last digits, one tap, WhatsApp and Copy, the fixed message; the link works once', async () => {
    const ph = await phone(browser);
    await signIn(w.p.url, ph.page, ADMIN.username, ADMIN.password);
    await ph.page.goto(w.p.url + personPath(w, w.ids[G1.username]));
    await Promise.all([ph.page.waitForEvent('load'), ph.page.locator('form#send-link button[type=submit]').click()]);
    assert.equal((await ph.page.locator('#confirm-digits').innerText()).trim(), '4141', 'the confirmation shows the last digits only');
    await shot(ph.page, EVIDENCE, '9c-1-confirm-digits-ar');
    const status = await submit(ph.page, 'form#confirm-link');
    const issued = readIssued(status, await ph.page.content());
    assert.equal(issued.status, 200);
    assert.equal(issued.number, '201041414141', 'WhatsApp goes to the registered number');
    assert.ok(issued.message.startsWith(`السلام عليكم. هذه رسالة من ${SPACE}.`), 'the fixed message, in the space\'s first language');
    assert.ok(issued.message.includes(G1.display_name) && issued.message.includes(issued.link), 'it names the guardian and carries the link');
    assert.ok(await ph.page.locator('#whatsapp').isVisible() && await ph.page.locator('#copy').isVisible(), 'WhatsApp and Copy side by side');
    assert.ok(!(await readable(ph.page)).includes('1041414141'), 'the page shows the number only as its last digits');
    await shot(ph.page, EVIDENCE, '9c-2-link-ready-ar');
    await ph.ctx.close();

    // G1 opens the link, sets the first password, and signs in with it.
    const visitor = new Client(w.p.url);
    assert.equal((await visitor.get(`/r/${issued.token}`)).status, 200);
    assert.equal((await visitor.post(`/r/${issued.token}`, { username: G1.username, new_password: 'mona-own-pass-1' })).status, 200);
    assert.equal((await visitor.get(`/r/${issued.token}`)).status, 410, 'it works once');
    assert.equal((await new Client(w.p.url).post('/signin', { username: G1.username, password: G1.password })).status, 401, 'the old first password no longer works');
    const g1 = new Client(w.p.url);
    assert.equal((await g1.post('/signin', { username: G1.username, password: 'mona-own-pass-1' })).status, 302, 'the new password works');
    assert.equal((await g1.get(`/s/${w.spaceId}/linked`)).status, 200, 'and leads to the guardian home');
  });
});
