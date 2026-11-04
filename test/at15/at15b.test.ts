// AT-15b (contract product-contract-r2, R2-d): the admin switches lesson
// activity on from one page. The page states in plain words what is recorded,
// who sees it, how long it is kept, and shows the learner's notice. The switch
// needs the required tick "people were told"; without it nothing is switched.
// The setting stores who, when, the tick and the day recording started. A
// plain link (GET) never switches it. Opens before the switch-on are not
// recorded. Another role cannot switch it, by screen or forged request
// (refused identically). Switching it off stops recording on the next request
// and deletes every lesson_view row of the space (the page says so first).
// Screenshots go to evidence/at-15/.
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser } from 'playwright';
import { assertPage, phone, readable, shot, signIn } from '../support/browser.ts';
import { workerNow } from '../support/http.ts';
import { signedIn } from '../support/seed.ts';
import { visible } from '../at13/pages.ts';
import { ADMIN, A, B, G1, HADEER, KARIM, OTHER_ADMIN, as } from '../at9/world.ts';
import { activityWorld, adminNow, open, productToday, settingRow, switchOff, switchOn, switchPath, viewRows, type ActivityWorld } from './activity.ts';

const EVIDENCE = fileURLToPath(new URL('../../evidence/at-15/', import.meta.url));

describe('AT-15b the admin switch: plain words, a required tick, only the admin, and switching off deletes', { concurrency: false }, () => {
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

  it('the page says what is recorded, who sees it, how long it is kept and that switching off deletes, and shows the learner\'s notice (English)', async () => {
    const admin = await adminNow(w);
    assert.equal((await admin.post('/account/language', { lang: 'en' })).status, 303);
    const res = await admin.get(switchPath(w));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    const html = await res.text();
    for (const words of [
      'What is recorded', 'The Lesson and the date it was last opened, when a Student opens it. Not the time of day, not how long or how often, and no content.',
      'Who sees it', 'Only a Parent linked to that child, and only from the day it was switched on and the day they were linked. No Teacher and no Administrator sees it.',
      'How long it is kept', 'While the setting is on. Every record is deleted when it is switched off, or on request.',
      'Switching off stops recording at once and deletes every record in this School.',
      'Your parent can see which lessons you opened and the date you last opened them.',
      'Every Parent and every Student has been told (required)', 'It is a notice, not consent.',
    ]) assert.ok(html.includes(words), `the page says: ${words}`);
    assert.match(html, /<input type="checkbox" name="told" value="1" required>/, 'the tick is required');
    assert.ok(!visible(html).includes('180'), 'no retention limit is claimed (contract v6: no automatic disposal)');
  });

  beforeEach(async () => {
    // Every other check reads the admin's pages in the space's first language, Arabic.
    assert.equal((await (await adminNow(w)).post('/account/language', { lang: 'ar' })).status, 303);
  });

  it('without the tick nothing is switched; a plain link (GET) never switches it', async () => {
    const admin = await adminNow(w);
    for (const fields of [{}, { told: '' }, { told: '0' }, { told: 'yes' }]) {
      const res = await admin.post(switchPath(w), fields);
      assert.equal(res.status, 400, `refused without the tick (${JSON.stringify(fields)})`);
      assert.match(await res.text(), /id="error" class="error" role="alert">ضع العلامة لتأكيد أن الناس أُبلغوا. لم يُفعَّل شيء.</);
    }
    for (const path of [switchPath(w), `${switchPath(w)}?told=1`, `${switchPath(w)}?told=1&action=on`, `${switchPath(w)}/off`, `${switchPath(w)}?done=on`]) {
      assert.equal((await admin.get(path)).status, 200, `GET ${path}`);
    }
    assert.equal(await settingRow(w), null, 'nothing was switched');
  });

  it('another role cannot switch it, by screen or forged request: refused identically, and nothing changes', async () => {
    const publisher = await as(w, HADEER);
    const guardian = await as(w, G1);
    const learner = await as(w, A);
    for (const [who, c] of [['the publisher', publisher], ['a guardian', guardian], ['a learner', learner]] as const) {
      const missing = await c.post(`/s/${w.spaceId}/admin/no-such-page`, { told: '1' });
      const missingBody = await missing.text();
      for (const [method, path] of [['GET', switchPath(w)], ['POST', switchPath(w)], ['GET', `${switchPath(w)}/off`], ['POST', `${switchPath(w)}/off`]] as const) {
        const res = method === 'GET' ? await c.get(path) : await c.post(path, { told: '1' });
        const body = await res.text();
        assert.equal(res.status, 403, `${who}: ${method} ${path}`);
        assert.equal(res.status, missing.status, `${who}: the same status as a page that does not exist`);
        assert.equal(body, missingBody, `${who}: ${method} ${path} answers byte for byte as a page that does not exist`);
      }
    }
    // The admin of another space, with this space's address.
    const otherAdmin = await signedIn(w.p.url, OTHER_ADMIN.username, OTHER_ADMIN.password);
    assert.equal((await otherAdmin.post(switchPath(w), { told: '1' })).status, 403, 'another space\'s admin');
    // The admin's own session, from another site: the cross-origin guard refuses it.
    const admin = await adminNow(w);
    assert.equal((await admin.postWith(switchPath(w), { told: '1' }, { origin: 'https://evil.example' })).status, 403, 'a forged cross-site post');
    assert.equal(await settingRow(w), null, 'nothing was switched');
  });

  it('opens before the switch-on are not recorded; the switch stores who, when, the tick and the start day', async () => {
    assert.equal((await open(w, A)).status, 200, 'A opens the lesson while it is off');
    const before = await workerNow(w.p.url);
    await switchOn(w);
    const after = await workerNow(w.p.url);
    const row = (await settingRow(w))!;
    assert.equal(row.enabled, 1);
    assert.equal(row.told_confirmed, 1, 'the tick');
    assert.equal(row.changed_by, w.ids[ADMIN.username], 'who');
    assert.ok(Number(row.changed_at) >= before && Number(row.changed_at) <= after, 'when');
    assert.equal(row.enabled_since, await productToday(w), 'the day recording started');
    assert.deepEqual(await viewRows(w), [], 'the open before the switch-on was not recorded and cannot be recovered');
    const page = await (await (await adminNow(w)).get(`${switchPath(w)}?done=on`)).text();
    assert.ok(page.includes(`التسجيل منذ <bdi dir="ltr" class="nowrap">${row.enabled_since}</bdi>`), 'the page shows the start day');
    // Switching on again changes nothing: the start day stays.
    await switchOn(w);
    assert.deepEqual(await settingRow(w), row, 'already on: unchanged');
  });

  it('switching off: the step says it deletes, GET changes nothing; then recording stops on the next request and every row of this space is deleted, not another space\'s', async () => {
    assert.equal((await open(w, A)).status, 200);
    assert.equal((await open(w, B)).status, 200);
    await switchOn(w, { spaceId: w.otherSpaceId });
    const karim = await as(w, KARIM);
    assert.equal((await karim.get(`/s/${w.otherSpaceId}/read/${w.content.otherLesson}`)).status, 200);
    const rows = await viewRows(w);
    assert.equal(rows.filter((r) => r.space_id === w.spaceId).length, 2, 'A and B recorded');
    assert.equal(rows.filter((r) => r.space_id === w.otherSpaceId).length, 1, 'Karim recorded in the other space');
    const admin = await adminNow(w);
    const page = await (await admin.get(switchPath(w))).text();
    assert.ok(page.includes('الإيقاف يوقف التسجيل فورًا ويحذف كل السجلات هنا'), 'the page says so before the click');
    const step = await admin.get(`${switchPath(w)}/off`);
    assert.equal(step.status, 200);
    assert.ok((await step.text()).includes('id="confirm-activity-off"'), 'a confirmation step');
    assert.equal((await viewRows(w)).length, 3, 'the step (GET) deletes nothing');
    await switchOff(w, admin);
    assert.deepEqual((await viewRows(w)).map((r) => r.space_id), [w.otherSpaceId], 'every row of this space is gone; the other space keeps its own');
    assert.equal((await settingRow(w))!.enabled, 0);
    assert.equal((await open(w, A)).status, 200);
    assert.deepEqual((await viewRows(w)).map((r) => r.space_id), [w.otherSpaceId], 'the next open records nothing');
  });

  it('in a browser at phone width: the button does nothing without the tick; with it, the switch goes on (Arabic, then English)', async () => {
    const ph = await phone(browser);
    await signIn(w.p.url, ph.page, ADMIN.username, ADMIN.password);
    await ph.page.goto(w.p.url + `/s/${w.spaceId}`);
    await Promise.all([ph.page.waitForEvent('load'), ph.page.locator('#admin-activity').click()]);
    await assertPage(ph.page, 'the switch page, off (Arabic)', 'ar');
    await shot(ph.page, EVIDENCE, '15b-1-switch-off-state-ar');
    await ph.page.locator('form#activity-switch-on button[type=submit]').click();
    await ph.page.waitForTimeout(300);
    assert.equal((await settingRow(w))!.enabled, 0, 'the browser does not send the form without the tick');
    await ph.page.locator('form#activity-switch-on input[name=told]').check();
    await Promise.all([ph.page.waitForEvent('load'), ph.page.locator('form#activity-switch-on button[type=submit]').click()]);
    assert.equal((await settingRow(w))!.enabled, 1, 'switched on with the tick');
    await assertPage(ph.page, 'the switch page, on (Arabic)', 'ar');
    assert.ok((await readable(ph.page)).includes('التسجيل منذ'), 'Recording since, in Arabic');
    await shot(ph.page, EVIDENCE, '15b-2-switched-on-ar');
    await Promise.all([ph.page.waitForEvent('load'), ph.page.locator('#activity-off-step').click()]);
    await assertPage(ph.page, 'the switch-off step (Arabic)', 'ar');
    await shot(ph.page, EVIDENCE, '15b-3-switch-off-step-ar');
    await ph.page.goto(w.p.url + '/account/language');
    await ph.page.selectOption('form#language select[name=lang]', 'en');
    await Promise.all([ph.page.waitForEvent('load'), ph.page.locator('form#language button[type=submit]').click()]);
    await ph.page.goto(w.p.url + switchPath(w));
    await assertPage(ph.page, 'the switch page, on (English)', 'en');
    const en = await readable(ph.page);
    assert.ok(en.includes('Recording since') && en.includes('Switch off and delete the records'), 'English, with the way to switch off');
    await shot(ph.page, EVIDENCE, '15b-4-switched-on-en');
    await ph.ctx.close();
  });
});
