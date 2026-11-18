// LMS wave 3b, W3b-1 (product-contract v2 on PIL-232, AT-2): "Add" saves
// exactly the rows that passed, all or nothing. One test per labelled
// expectation (AT-2.1 to AT-2.5); each CI step selects its test by name, so
// every test makes what it needs itself (the add of class-mixed.csv is made
// once per world and shared). Made-up names and numbers only.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import {
  ADMIN, AMAL_END, END, HEADER_EN, MIXED, MIXED_ADDED, MIXED_NUMBERS, NO_PASSWORD, as, browserAs, carriedForm, checkFile, classMixed, csv, donePath,
  pressAdd, snapshot, uploadIdOf, uploadPath, wave3bWorld, word, type Wave3aWorld,
} from './world.ts';
import { byId, tableRows, textOf } from './pages.ts';
import { appointAdmin, seed, signedIn } from '../support/seed.ts';
import { utcDatePlusDays } from '../support/http.ts';

let w: Wave3aWorld;
before(async () => {
  w = await wave3bWorld();
});
after(async () => {
  await w?.close();
});

const CHANGED = 'Something changed since the check, for example a username was taken. This is the new check. Nothing was saved.';
const AGAIN = 'These people were already added by this upload. Nothing new was saved.';
const ROLES: Record<string, string> = { fatma: 'guardian', hala: 'guardian', tarek: 'publisher' };
const today = () => new Date().toISOString().slice(0, 10);

const idOf = async (username: string) => String((await w.p.sql(`SELECT id FROM user WHERE username = '${username}'`))[0]?.id ?? '');

/** class-mixed.csv with every new username changed (omar.c stays: it is in use), for the tests that must not meet AT-2.1's people. */
const variant = (suffix: string) => csv(MIXED.map((r, i) => (i === 0 || r[1] === 'omar.c' ? r : [r[0], r[1] + suffix, ...r.slice(2)])));

let shared: Promise<{ uploadId: string; form: { text: string; fp: string }; before: Record<string, unknown[]>; res: Response }> | null = null;
/** Amal checks class-mixed.csv and presses "Add the people listed (8)" once (once per world). */
function mixedAdded() {
  shared ??= (async () => {
    const amal = await as(w, ADMIN, 'en');
    const form = carriedForm(await (await checkFile(amal, w.school, classMixed(), 'class-mixed.csv')).text());
    assert.ok(form, 'the check page carries the form');
    const before = await snapshot(w);
    const res = await pressAdd(amal, w.school, form);
    return { uploadId: uploadIdOf(res.headers.get('location')), form, before, res };
  })();
  return shared;
}

/** A second admin of Mesk School (made once per world). */
let ola: Promise<Awaited<ReturnType<typeof signedIn>>> | null = null;
const OLA = { display_name: 'Ola Test', username: 'ola.w3b', password: 'ola-wave3b-pass', mobile: '01046460010' };
function secondAdmin() {
  ola ??= (async () => {
    await appointAdmin(w.owner, w.school.id, { ...OLA, valid_until: AMAL_END });
    const c = await signedIn(w.p.url, OLA.username, OLA.password);
    assert.equal((await c.post('/account/language', { lang: 'en' })).status, 303);
    return c;
  })();
  return ola;
}

/** The 409 answer of AT-2.2: a fresh check page that starts with the notice, which sits above the summary. */
async function assertChanged(res: Response, what: string) {
  assert.equal(res.status, 409, `${what}: 409`);
  const html = await res.text();
  assert.equal(textOf(byId(html, 'notice') ?? ''), CHANGED, `${what}: the notice`);
  assert.ok(html.indexOf('id="notice"') < html.indexOf('id="check-title"') && html.indexOf('id="check-title"') < html.indexOf('id="summary"'), `${what}: the notice comes first`);
  assert.ok(html.includes('id="summary"'), `${what}: a fresh check page`);
}

describe('W3b AT-2', { concurrency: false }, () => {
  it('W3b AT-2.1 one add makes exactly the 8 accounts and memberships, each as its row says, and answers 303 to the done page', async () => {
    const { uploadId, before, res } = await mixedAdded();
    assert.equal(res.status, 303);
    assert.equal(res.headers.get('location'), donePath(w.school, uploadId), 'the done page of the new upload');
    const amalId = await idOf(ADMIN.username);
    const rows = await w.p.sql(`SELECT u.username, u.display_name, u.mobile, u.password_hash, m.space_id, m.role, m.valid_from, m.valid_until, m.granted_by, m.class_upload_id
      FROM user u JOIN membership m ON m.user_id = u.id WHERE m.class_upload_id = '${uploadId}' ORDER BY u.username`);
    assert.deepEqual(rows.map((r) => r.username), [...MIXED_ADDED].sort(), 'exactly the 8, usernames lowercased');
    for (const r of rows) {
      const i = MIXED_ADDED.indexOf(String(r.username));
      const source = MIXED.find((s) => s[1].toLowerCase() === r.username)!;
      assert.equal(r.display_name, source[0], `${r.username}: the name`);
      assert.equal(r.mobile, MIXED_NUMBERS[i], `${r.username}: the mobile in international form`);
      assert.equal(r.space_id, w.school.id, `${r.username}: Mesk School`);
      assert.equal(r.role, ROLES[String(r.username).split('.')[0]] ?? 'learner', `${r.username}: the role`);
      assert.equal(r.valid_from, today(), `${r.username}: from today`);
      assert.equal(r.valid_until, END, `${r.username}: the row's date`);
      assert.equal(r.granted_by, amalId, `${r.username}: granted by Amal`);
      assert.match(String(r.password_hash), NO_PASSWORD, `${r.username}: the no-password value`);
    }
    const after = await snapshot(w);
    assert.equal(after.user.length - before.user.length, 8, '8 new accounts');
    assert.equal(after.membership.length - before.membership.length, 8, '8 new memberships');
    assert.equal(after.class_upload.length - before.class_upload.length, 1, 'one upload row');
    for (const u of ['adel.t', 'rana.t']) assert.equal(await idOf(u), '', `${u} (refused): nothing made`);
    const done = await (await as(w, ADMIN, 'en')).get(donePath(w.school, uploadId));
    assert.equal(done.status, 200);
    const html = await done.text();
    const listed = [...(byId(html, 'added') ?? '').matchAll(/<li id="p-([^"]+)"/g)].map((m) => m[1]);
    assert.equal(listed.length, 8, 'the done page lists the 8');
    for (const u of MIXED_ADDED) assert.ok(listed.includes(await idOf(u)), `the done page lists ${u}`);
    assert.equal(textOf(byId(html, 'done-title') ?? ''), 'People added: 8');
  });

  it('W3b AT-2.2 changed since the check (taken, text edited, fingerprint edited, own end date moved): nothing saved, 409 with a fresh check', async () => {
    const amal = await as(w, ADMIN, 'en');
    const file = variant('b');
    // (a) Another admin appoints one of the 8 usernames between the check and the add.
    const formA = carriedForm(await (await checkFile(amal, w.school, file)).text())!;
    await secondAdmin();
    await seed(w.p.url, { spaceId: w.school.id, grantedBy: OLA.username, people: [{ display_name: 'Huda Other', username: 'huda.tb', password: 'huda-other-pass', role: 'learner', mobile: '01046469001', valid_until: utcDatePlusDays(30) }] });
    let before = await snapshot(w);
    await assertChanged(await pressAdd(amal, w.school, formA), '(a) a username taken');
    assert.deepEqual(await snapshot(w), before, '(a) nothing saved');
    // (b) The carried file text is edited; (c) the carried fingerprint is edited.
    const form = carriedForm(await (await checkFile(amal, w.school, file)).text())!;
    before = await snapshot(w);
    await assertChanged(await pressAdd(amal, w.school, { ...form, text: form.text.replace('Mariam Test', 'Mariam Edited') }), '(b) text edited');
    const fp = form.fp.slice(0, -1) + (form.fp.endsWith('0') ? '1' : '0');
    await assertChanged(await pressAdd(amal, w.school, { ...form, fp }), '(c) fingerprint edited');
    assert.deepEqual(await snapshot(w), before, '(b), (c) nothing saved');
    // (d) Amal's own end date is moved before the rows' date.
    await w.p.sql(`UPDATE membership SET valid_until = '2027-06-01' WHERE space_id = '${w.school.id}' AND role = 'admin' AND user_id = '${await idOf(ADMIN.username)}'`);
    try {
      before = await snapshot(w);
      await assertChanged(await pressAdd(amal, w.school, form), '(d) own end date moved');
      assert.deepEqual(await snapshot(w), before, '(d) nothing saved');
    } finally {
      await w.p.sql(`UPDATE membership SET valid_until = '${AMAL_END}' WHERE space_id = '${w.school.id}' AND role = 'admin' AND user_id = '${await idOf(ADMIN.username)}'`);
    }
  });

  it('W3b AT-2.3 a failed write saves nothing, says so, and logs only the fixed event', async () => {
    const amal = await as(w, ADMIN, 'en');
    const file = csv([HEADER_EN, ['Fail One', 'fail1.t', 'Student', '01046469101', END], ['Fail Two', 'fail2.t', 'Student', '01046469102', END]]);
    const form = carriedForm(await (await checkFile(amal, w.school, file)).text())!;
    const before = await snapshot(w);
    w.p.faults!.clearLog();
    // The test hook breaks the batch's last statement, so the whole batch is rolled back.
    let n = 0;
    w.p.faults!.set({ rewrite: (sql, p) => (/^\s*INSERT INTO membership/.test(sql) && ++n === 2 ? ['INSERT INTO no_such_table VALUES (1)', []] : [sql, p]) });
    let res: Response;
    try {
      res = await pressAdd(amal, w.school, form);
    } finally {
      w.p.faults!.set({});
    }
    assert.ok(n >= 2, 'the batch reached the broken statement');
    const html = await res.text();
    assert.equal(textOf(byId(html, 'notice') ?? ''), 'Nothing was saved. Please try again.');
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await snapshot(w), before, 'no user, membership or upload row is left');
    await w.p.faults!.settle();
    const logs = w.p.faults!.log();
    assert.equal(logs.length, 1, `one log line: ${JSON.stringify(logs)}`);
    assert.ok(logs[0].includes('class upload failed'), 'the fixed event');
    assert.ok(!/no_such_table|SQLITE|Error|fail1|Fail One|01046469101/.test(logs[0]), `no error text and nothing from the file: ${logs[0]}`);
  });

  it('W3b AT-2.4 a second press is not a second add; another admin gets the changed answer; a second check offers no add', async () => {
    const { uploadId, form } = await mixedAdded();
    const amal = await as(w, ADMIN, 'en');
    const before = await snapshot(w);
    // The same request sent twice more.
    for (const n of [1, 2]) {
      const res = await pressAdd(amal, w.school, form);
      assert.equal(res.status, 303, `press ${n + 1}: 303`);
      assert.equal(res.headers.get('location'), `${donePath(w.school, uploadId)}?again=1`, `press ${n + 1}: the first upload's done page`);
    }
    const again = await (await amal.get(`${donePath(w.school, uploadId)}?again=1`)).text();
    assert.equal(textOf(byId(again, 'again') ?? ''), AGAIN);
    assert.ok(again.indexOf('id="again"') < again.indexOf('id="done-title"'), 'the done page starts with it');
    assert.ok(/<div id="again"[^>]*role="status"/.test(again), 'in a role="status" block');
    assert.deepEqual(await snapshot(w), before, 'nothing saved');
    // Browser Back and press again (script off, so the form is sent again).
    const browser = await chromium.launch();
    try {
      const tab = await browserAs(browser, w, ADMIN, { lang: 'en', script: false });
      await tab.page.goto(`${w.p.url}${uploadPath(w.school)}`);
      await tab.page.setInputFiles('#upload-file', { name: 'class-mixed.csv', mimeType: 'text/csv', buffer: Buffer.from(variant('d')) });
      await Promise.all([tab.page.waitForEvent('load'), tab.page.click('form#upload button[type=submit]')]);
      // The check page is a no-store answer to a POST, so Chromium's Back asks to send the check again
      // (ERR_CACHE_MISS here); the saved copy of the page stands for the page as the browser showed it.
      const checkUrl = tab.page.url();
      const saved = await tab.page.content();
      await Promise.all([tab.page.waitForEvent('load'), tab.page.click('#add')]);
      const first = tab.page.url();
      const mid = await snapshot(w);
      await tab.page.route(checkUrl, (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: saved }));
      await tab.page.goto(checkUrl);
      await tab.page.unroute(checkUrl);
      await Promise.all([tab.page.waitForEvent('load'), tab.page.click('#add')]);
      assert.equal(tab.page.url(), `${first}?again=1`, 'Back and press again: the first upload\'s done page');
      assert.equal(textOf(await tab.page.locator('#again').innerHTML()), AGAIN);
      assert.deepEqual(await snapshot(w), mid, 'Back and press again: nothing saved');
      await tab.ctx.close();

      // Another admin of Mesk posts the same form: the changed answer, nothing saved.
      const other = await secondAdmin();
      const b2 = await snapshot(w);
      await assertChanged(await pressAdd(other, w.school, form), 'another admin');
      assert.deepEqual(await snapshot(w), b2, 'another admin: nothing saved');

      // The same file checked again: all 8 in use, no add button.
      const html = await (await checkFile(amal, w.school, classMixed())).text();
      const refused = new Map(tableRows(html, 'refused-rows').map((r) => [r.row, r.reasons]));
      for (const row of [2, 3, 5, 6, 7, 8, 10, 13]) assert.deepEqual(refused.get(row), ['This username is already in use.'], `row ${row}: in use`);
      assert.ok(!html.includes('id="add-form"') && !html.includes('id="add"'), 'no add button');

      // With script on, a double click sends one request and the button is disabled.
      const on = await browserAs(browser, w, ADMIN, { lang: 'en' });
      await on.page.goto(`${w.p.url}${uploadPath(w.school)}`);
      await on.page.setInputFiles('#upload-file', { name: 'class.csv', mimeType: 'text/csv', buffer: Buffer.from(csv([HEADER_EN, ['Click Once', 'click1.t', 'Student', '01046469201', END]])) });
      await Promise.all([on.page.waitForEvent('load'), on.page.click('form#upload button[type=submit]')]);
      let posts = 0;
      on.page.on('request', (r) => void (r.method() === 'POST' && r.url().endsWith('/upload/add') && posts++));
      // The button's state as the page changes it, reported out of the page (the answer may replace the page quickly).
      const states: boolean[] = [];
      await on.page.exposeFunction('reportAdd', (disabled: boolean) => void states.push(disabled));
      await on.page.evaluate(() => {
        const b = document.getElementById('add') as HTMLButtonElement;
        new MutationObserver(() => (window as unknown as { reportAdd(d: boolean): void }).reportAdd(b.disabled)).observe(b, { attributes: true });
      });
      await on.page.dblclick('#add', { noWaitAfter: true });
      await on.page.waitForURL(/\/admin\/upload\/[0-9a-f-]{36}$/);
      assert.ok(states.includes(true), 'the button is disabled after the first press');
      assert.equal(posts, 1, 'a double click sends one request');
      await on.ctx.close();
    } finally {
      await browser.close();
    }
  });

  it('W3b AT-2.5 the people list shows the 8 with "No password yet"; everyone else is unchanged; with script off the add works the same', async () => {
    const { before } = await mixedAdded();
    const after = await snapshot(w);
    for (const t of ['user', 'membership']) {
      const ids = (rows: unknown[]) => new Map(rows.map((r) => [JSON.parse(String(r)).id, r]));
      const now = ids(after[t]);
      for (const [id, row] of ids(before[t])) assert.equal(now.get(id), row, `${t} ${id}: unchanged`);
    }
    const people = await (await (await as(w, ADMIN, 'en')).get(`/s/${w.school.id}/admin/people`)).text();
    for (const u of MIXED_ADDED) {
      const li = new RegExp(`<li data-user="${await idOf(u)}">([\\s\\S]*?)</li>`).exec(people);
      assert.ok(li, `${u} is on the people list`);
      assert.ok(/data-tag="no-password"[^>]*>No password yet</.test(li[1]), `${u}: the tag`);
    }
    const tagged = (people.match(/data-tag="no-password"/g) ?? []).length;
    const without = Number((await w.p.sql(`SELECT COUNT(*) AS n FROM membership m JOIN user u ON u.id = m.user_id WHERE m.space_id = '${w.school.id}' AND m.role <> 'admin' AND u.password_hash LIKE '%$AAAAAAAAAAAAAAAAAAAAAA$%'`))[0].n);
    assert.equal(tagged, without, 'only people without a password are tagged');
    // Script off: the add works the same.
    const browser = await chromium.launch();
    try {
      const tab = await browserAs(browser, w, ADMIN, { lang: 'en', script: false });
      await tab.page.goto(`${w.p.url}${uploadPath(w.school)}`);
      await tab.page.setInputFiles('#upload-file', { name: 'class.csv', mimeType: 'text/csv', buffer: Buffer.from(csv([HEADER_EN, ['Plain One', 'plain1.t', 'Student', '01046469301', END], ['Plain Two', 'plain2.t', 'Parent', '01046469302', END]])) });
      await Promise.all([tab.page.waitForEvent('load'), tab.page.click('form#upload button[type=submit]')]);
      await Promise.all([tab.page.waitForEvent('load'), tab.page.click('#add')]);
      assert.match(tab.page.url(), /\/admin\/upload\/[0-9a-f-]{36}$/, 'the done page');
      assert.equal(await tab.page.locator('#done-title').innerText(), 'People added: 2');
      assert.ok(await idOf('plain1.t') && await idOf('plain2.t'), 'both saved');
      await tab.ctx.close();
    } finally {
      await browser.close();
    }
    void word;
  });
});
