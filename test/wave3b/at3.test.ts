// LMS wave 3b, W3b-1 (product-contract v2 on PIL-232, AT-3): no password
// column; each new person sets their own password through today's reset link.
// AT-3.1 and AT-3.3 to AT-3.5 came with W3b-1a; AT-3.2 (the person-page line)
// and AT-3.6 (the follow-up from the done page) with W3b-1b. One test per
// label; each makes the people it needs (fresh usernames). Made-up data only.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import {
  ADMIN, END, HEADER_EN, NO_PASSWORD, SALMA, as, browserAs, carriedForm, checkFile, csv, donePath, pressAdd, snapshot, spied, uploadIdOf, wave3bWorld, writes, type Wave3aWorld,
} from './world.ts';
import { verifyPassword } from '../../src/auth/password.ts';
import { UI } from '../../src/i18n/ui.ts';
import { Client } from '../support/http.ts';
import { signedIn } from '../support/seed.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));
let w: Wave3aWorld;
before(async () => {
  w = await wave3bWorld();
});
after(async () => {
  await w?.close();
});

type Row = [string, string, string, string, string];
/** Adds these rows through the check and the add, as Amal; returns the upload id and the new people's ids. */
async function addRows(rows: Row[]): Promise<{ uploadId: string; ids: string[]; checkHtml: string; doneHtml: string }> {
  const amal = await as(w, ADMIN, 'en');
  const checkHtml = await (await checkFile(amal, w.school, csv([HEADER_EN, ...rows]))).text();
  const res = await pressAdd(amal, w.school, carriedForm(checkHtml)!);
  assert.equal(res.status, 303, 'added');
  const uploadId = uploadIdOf(res.headers.get('location'));
  const ids = [];
  for (const r of rows) ids.push(String((await w.p.sql(`SELECT id FROM user WHERE username = '${r[1]}'`))[0].id));
  const doneHtml = await (await amal.get(donePath(w.school, uploadId))).text();
  return { uploadId, ids, checkHtml, doneHtml };
}
const hashOf = async (id: string) => String((await w.p.sql(`SELECT password_hash FROM user WHERE id = '${id}'`))[0].password_hash);
const failures = async (username: string) => Number((await w.p.sql(`SELECT failures FROM attempt_limit WHERE key = 'u:${username}'`))[0]?.failures ?? 0);
const person = (id: string) => `/s/${w.school.id}/admin/people/${id}`;
/** The admin sends a reset link (today's confirming tap); returns its token. */
async function sendLink(amal: Client, id: string): Promise<string> {
  const res = await amal.post(`${person(id)}/link`, {});
  assert.equal(res.status, 200, 'the link page');
  const m = /\/r\/([A-Za-z0-9_-]{20,})/.exec(await res.text());
  assert.ok(m, 'the link is shown once');
  return m[1];
}
const SIGN_IN_FAILED = UI.en.signInFailed;

/** Every .ts file under a folder of the repository. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? sources(p) : p.endsWith('.ts') ? [p] : [];
  });
}

describe('W3b AT-3', { concurrency: false }, () => {
  it('W3b AT-3.1 a new person has the no-password value; every sign-in attempt is refused as a wrong password and counts; sign-in has no branch for it', async () => {
    const rows: Row[] = [['Nopass One', 'nopass1.t', 'Student', '01046463001', END], ['Nopass Two', 'nopass2.t', 'Parent', '01046463002', END]];
    const { ids } = await addRows(rows);
    const amalHash = String((await w.p.sql(`SELECT password_hash FROM user WHERE username = '${ADMIN.username}'`))[0].password_hash);
    const configured = amalHash.split('$')[1];
    const hashes = [];
    for (const [i, id] of ids.entries()) {
      const h = await hashOf(id);
      hashes.push(h);
      assert.match(h, NO_PASSWORD, `${rows[i][1]}: today's stored form with the marker salt`);
      assert.equal(h.split('$')[1], configured, `${rows[i][1]}: the configured iteration count`);
      assert.equal(Buffer.from(h.split('$')[3], 'base64url').length, 32, `${rows[i][1]}: a 32-byte hash`);
    }
    assert.notEqual(hashes[0], hashes[1], 'different for every new person');
    for (const [i, r] of rows.entries()) {
      const attempts = ['', 'password123', ...r];
      for (const a of attempts) assert.equal(await verifyPassword(a, hashes[i]), false, `verifyPassword(${JSON.stringify(a)}) is false`);
      for (const a of attempts) {
        await w.p.sql(`DELETE FROM attempt_limit`);
        const res = await new Client(w.p.url).post('/signin', { username: r[1], password: a });
        assert.equal(res.status, 401, `${r[1]} with ${JSON.stringify(a)}: refused`);
        assert.ok((await res.text()).includes(SIGN_IN_FAILED), 'today\'s wrong username-or-password message');
        assert.equal(await failures(r[1]), 1, 'the attempt counts in today\'s limit');
      }
    }
    // The limit holds as today: repeated attempts end in today's "too many" answer.
    await w.p.sql(`DELETE FROM attempt_limit`);
    let last = 0;
    for (let n = 0; n < 12 && last !== 429; n++) last = (await new Client(w.p.url).post('/signin', { username: rows[0][1], password: `guess-${n}` })).status;
    assert.equal(last, 429, 'the attempt limit stops further attempts');
    await w.p.sql(`DELETE FROM attempt_limit`);
    // Guard: the sign-in handler (and verifyPassword) has no branch for the value.
    const app = readFileSync(join(root, 'src/app.ts'), 'utf8');
    const start = app.indexOf("app.post('/signin'");
    const handler = app.slice(start, app.indexOf('\napp.', start + 10));
    assert.ok(start > 0 && handler.includes('verifyPassword'), 'the sign-in handler is found');
    assert.ok(!/NO_PASSWORD_SALT|hasNoPassword/.test(handler), 'the sign-in handler does not refer to NO_PASSWORD_SALT or hasNoPassword');
    assert.ok(!/NO_PASSWORD_SALT|hasNoPassword/.test(readFileSync(join(root, 'src/auth/password.ts'), 'utf8')), 'nor does src/auth/password.ts');
  });

  it('W3b AT-3.2 the person page says No password yet; today\'s reset link flow is unchanged and sets it; the tag and the line then go; Set a new password does the same', async () => {
    const amal = await as(w, ADMIN, 'en');
    const { ids } = await addRows([['Line One', 'line1.t', 'Student', '01046463401', END], ['Line Two', 'line2.t', 'Student', '01046463402', END]]);
    const LINE = UI.en.noPasswordLine;
    assert.equal(LINE, 'No password yet. Send a reset link, or set a first password below.');
    const listed = async (id: string) => {
      const html = await (await amal.get(`/s/${w.school.id}/admin/people`)).text();
      const at = html.indexOf(`<li data-user="${id}">`);
      assert.ok(at > 0, 'the person is on the people list');
      return html.slice(at, html.indexOf('</li>', at));
    };
    for (const id of ids) {
      const html = await (await amal.get(person(id))).text();
      assert.equal(html.split(LINE).length - 1, 1, 'the person page shows the line once');
      assert.ok(html.indexOf(LINE) < html.indexOf('id="send-link"'), 'above the reset link block');
      assert.ok((await listed(id)).includes(UI.en.noPasswordTag), 'the people list shows the tag');
    }
    // A person with a password (Salma) has no line.
    const salma = String((await w.p.sql(`SELECT id FROM user WHERE username = '${SALMA.username}'`))[0].id);
    assert.ok(!(await (await amal.get(person(salma))).text()).includes(LINE), 'no line for a person with a password');
    // Today's flow, unchanged: the confirmation with the last digits, then the link once.
    const confirm = await amal.get(`${person(ids[0])}/link`);
    assert.equal(confirm.status, 200);
    const confirmHtml = await confirm.text();
    assert.ok(confirmHtml.includes('3401') && confirmHtml.includes(UI.en.confirmSend), 'the confirmation with the last digits');
    assert.ok(!confirmHtml.includes(UI.en.backToUpload), 'opened without back: no Back to the upload');
    const token = await sendLink(amal, ids[0]);
    assert.ok(!/\/r\/[A-Za-z0-9_-]{20,}/.test(await (await amal.get(person(ids[0]))).text()), 'the link is shown once (not on the person page)');
    const set = await new Client(w.p.url).post(`/r/${token}`, { username: 'line1.t', new_password: 'line-one-pass' });
    assert.equal(set.status, 200, 'the reset link sets the password');
    await signedIn(w.p.url, 'line1.t', 'line-one-pass');
    assert.ok(!(await (await amal.get(person(ids[0]))).text()).includes(LINE), 'the line is gone');
    assert.ok(!(await listed(ids[0])).includes(UI.en.noPasswordTag), 'the tag is gone');
    // "Set a new password" by Amal: the answer page already has no line; the person signs in.
    const byAdmin = await amal.post(`${person(ids[1])}/password`, { new_password: 'line-two-pass' });
    assert.equal(byAdmin.status, 200);
    assert.ok(!(await byAdmin.text()).includes(LINE), 'no line on the answer page');
    assert.ok(!(await (await amal.get(person(ids[1]))).text()).includes(LINE), 'the line is gone');
    assert.ok(!(await listed(ids[1])).includes(UI.en.noPasswordTag), 'the tag is gone');
    await signedIn(w.p.url, 'line2.t', 'line-two-pass');
  });

  it('W3b AT-3.3 the upload makes no reset link and no password; no page, record or log line holds one; the upload code hashes nothing', async () => {
    const links = Number((await w.p.sql('SELECT COUNT(*) AS n FROM reset_link'))[0].n);
    w.p.faults!.clearLog();
    const { uploadId, ids, checkHtml, doneHtml } = await addRows([['Nolink One', 'nolink1.t', 'Student', '01046463101', END]]);
    assert.equal(Number((await w.p.sql('SELECT COUNT(*) AS n FROM reset_link'))[0].n), links, 'no reset_link row from the check or the add');
    const hash = await hashOf(ids[0]);
    const record = JSON.stringify(await w.p.sql(`SELECT * FROM class_upload WHERE id = '${uploadId}'`));
    for (const [what, text] of [['check page', checkHtml], ['done page', doneHtml], ['upload record', record], ['log', w.p.faults!.log().join('\n')]] as const) {
      assert.ok(!text.includes('pbkdf2') && !text.includes(hash.split('$')[3]), `${what}: no password value`);
      assert.ok(!/\/r\/[A-Za-z0-9_-]{20,}/.test(text), `${what}: no reset link`);
      assert.ok(!/type="password"|name="(new_)?password"/.test(text), `${what}: no password field`);
    }
    assert.deepEqual(w.p.faults!.log(), [], 'no log line');
    // Guard: the upload code imports and calls no password hashing and makes no reset link.
    const app = readFileSync(join(root, 'src/app.ts'), 'utf8');
    const routes = app.slice(app.indexOf('// LMS wave 3b, W3b-1'), app.indexOf("app.get('/s/:spaceId/admin/upload/:uploadId'"));
    assert.ok(routes.includes("app.post('/s/:spaceId/admin/upload/add'"), 'the upload routes are found');
    for (const [file, text] of [['src/upload.ts', readFileSync(join(root, 'src/upload.ts'), 'utf8')], ['src/views/upload.ts', readFileSync(join(root, 'src/views/upload.ts'), 'utf8')], ['the upload routes', routes]] as const) {
      assert.ok(!/hashPassword|issueResetLink/.test(text), `${file}: no hashPassword, no issueResetLink`);
    }
  });

  it('W3b AT-3.4 old reset rules still hold for new people: ended access gets no reset link; a corrected mobile kills earlier links', async () => {
    const amal = await as(w, ADMIN, 'en');
    const { ids } = await addRows([['Ended One', 'ended1.t', 'Student', '01046463201', END], ['Moved One', 'moved1.t', 'Student', '01046463202', END]]);
    // Ended: no reset link and no new password.
    assert.equal((await amal.post(`${person(ids[0])}/end`, {})).status, 303, 'access ended');
    const ended = UI.en.endedNoReset.replace('{name}', 'Ended One');
    for (const res of [await amal.get(`${person(ids[0])}/link`), await amal.post(`${person(ids[0])}/link`, {})]) {
      assert.equal(res.status, 400, 'refused');
      assert.ok((await res.text()).includes(ended), 'today\'s endedNoReset message');
    }
    assert.equal(Number((await w.p.sql(`SELECT COUNT(*) AS n FROM reset_link WHERE user_id = '${ids[0]}'`))[0].n), 0, 'no link made');
    // A corrected mobile kills the earlier link.
    const token = await sendLink(amal, ids[1]);
    const open = await (await new Client(w.p.url).get(`/r/${token}`)).text();
    assert.ok(open.includes('name="new_password"'), 'the link opens the reset form');
    const res = await amal.post(`${person(ids[1])}/correct`, { display_name: 'Moved One', mobile: '01046463299', valid_until: END });
    assert.equal(res.status, 303, 'mobile corrected');
    const dead = await (await new Client(w.p.url).get(`/r/${token}`)).text();
    assert.ok(!dead.includes('name="new_password"'), 'the earlier link is dead');
  });

  it('W3b AT-3.5 every reader of password_hash is listed; each refuses the no-password value; the reset link and Set a new password replace it', async () => {
    // 1. Every statement in src/ that reads password_hash (anything but writing it in an INSERT column list or a SET).
    const READERS = [
      // Today's five (contract "Code facts").
      ['src/app.ts', 'INSERT INTO session (id, user_id, expires_at) SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM user WHERE id = ? AND password_hash = ?)'], // the sign-in's session insert
      ['src/app.ts', 'SELECT id, password_hash FROM user WHERE username = ?'], // sign-in
      ['src/app.ts', 'SELECT password_hash FROM user WHERE id = ?'], // the used-reset-link retry
      ['src/app.ts', 'SELECT password_hash FROM user WHERE id = ?'], // change own password
      ['src/auth/password.ts', 'UPDATE user SET password_hash = ? WHERE id = ? AND password_hash = ?'], // the rehash after a sign-in
      // Wave 3b: the "No password yet" tag, only through hasNoPassword (contract section 6.1).
      ['src/admin.ts', 'SELECT u.id, u.username, u.display_name, u.mobile, m.role, m.valid_from, m.valid_until, m.ended_on, u.password_hash FROM membership m JOIN user u ON u.id = m.user_id'], // the people list
      ['src/admin.ts', 'SELECT u.id, u.username, u.display_name, u.mobile, m.role, m.valid_from, m.valid_until, m.ended_on, u.password_hash FROM membership m JOIN user u ON u.id = m.user_id'], // the person page line (W3b-1b)
      ['src/upload.ts', 'SELECT u.id, u.display_name, u.username, m.role, u.password_hash FROM membership m JOIN user u ON u.id = m.user_id WHERE m.space_id = ? AND m.class_upload_id = ? ORDER BY u.display_name, u.username'], // the done page
    ].map(([f, s]) => `${f}: ${s}`).sort();
    const found: string[] = [];
    for (const file of sources(join(root, 'src'))) {
      const text = readFileSync(file, 'utf8');
      // Each SQL string: a quote followed by a statement keyword, up to the same quote.
      for (const m of text.matchAll(/(['`])\s*((?:SELECT|INSERT|UPDATE|DELETE|WITH)\b(?:(?!\1)[\s\S])*)\1/g)) {
        const sql = m[2].replace(/\s+/g, ' ').trim();
        if (!sql.includes('password_hash')) continue;
        const rest = sql.replace(/^INSERT INTO user \([^)]*\)/, '').replace(/SET password_hash = \?/, '');
        if (rest.includes('password_hash')) found.push(`${relative(root, file).replace(/\\/g, '/')}: ${sql.replace(/ WHERE m\.space_id = \? AND m\.role <> 'admin'[\s\S]*$/, '')}`);
      }
    }
    assert.deepEqual(found.sort().map((s) => (s.startsWith('src/admin.ts') ? s.replace(/ (WHERE|ORDER BY)\b[\s\S]*$/, '') : s)), READERS, 'every reader of password_hash in src/ is listed');
    const hasNoPasswordUsers = sources(join(root, 'src')).filter((f) => /hasNoPassword\(/.test(readFileSync(f, 'utf8'))).map((f) => relative(root, f).replace(/\\/g, '/')).sort();
    assert.deepEqual(hasNoPasswordUsers, ['src/admin.ts', 'src/upload.ts'], 'only the tag readers call hasNoPassword');

    // 2. For a no-password person, each reader refuses.
    const amal = await as(w, ADMIN, 'en');
    const { ids } = await addRows([['Reader One', 'reader1.t', 'Student', '01046463301', END], ['Reader Two', 'reader2.t', 'Student', '01046463302', END]]);
    const value = await hashOf(ids[0]);
    // Sign-in is refused, and the rehash never runs (no write to user).
    await w.p.sql('DELETE FROM attempt_limit');
    const { result, statements } = await spied(w, () => new Client(w.p.url).post('/signin', { username: 'reader1.t', password: 'any-password-1' }));
    assert.equal(result.status, 401, 'sign-in refused');
    assert.ok(!writes(statements).some((s) => /^\s*UPDATE user\b|INSERT INTO session/.test(s)), 'no rehash and no session');
    // The used-reset-link retry is refused and counts as a failure (a link killed by a newer one is used).
    const first = await sendLink(amal, ids[0]);
    await sendLink(amal, ids[0]);
    await w.p.sql('DELETE FROM attempt_limit');
    const retry = await new Client(w.p.url).post(`/r/${first}`, { username: 'reader1.t', new_password: 'retry-password-1' });
    assert.ok(!(await retry.text()).includes(UI.en.resetAlreadyChanged ?? '\u0000'), 'not told the password was already changed');
    assert.equal(await failures('reader1.t'), 1, 'the retry counts as a failure');
    // Change own password: not reachable without a session; the check it runs refuses the current password.
    const own = await new Client(w.p.url).post('/account/password', { current_password: 'x', new_password: 'new-password-1' });
    assert.ok([302, 303, 401, 403].includes(own.status), `change own password needs a session (${own.status})`);
    for (const current of ['', 'password123', 'Reader One', 'reader1.t']) assert.equal(await verifyPassword(current, value), false, `the current-password check refuses ${JSON.stringify(current)}`);
    assert.equal(await hashOf(ids[0]), value, 'nothing replaced the value');

    // 3. The reset link and "Set a new password" replace it with a real hash; the person then signs in.
    await w.p.sql('DELETE FROM attempt_limit');
    const token = await sendLink(amal, ids[0]);
    const set = await new Client(w.p.url).post(`/r/${token}`, { username: 'reader1.t', new_password: 'reader-one-pass' });
    assert.equal(set.status, 200, 'the reset link sets the password');
    assert.doesNotMatch(await hashOf(ids[0]), NO_PASSWORD, 'a real hash after the reset link');
    await signedIn(w.p.url, 'reader1.t', 'reader-one-pass');
    const byAdmin = await amal.post(`${person(ids[1])}/password`, { new_password: 'reader-two-pass' });
    assert.equal(byAdmin.status, 200, 'Set a new password');
    assert.doesNotMatch(await hashOf(ids[1]), NO_PASSWORD, 'a real hash after Set a new password');
    await signedIn(w.p.url, 'reader2.t', 'reader-two-pass');
    void snapshot;
  });

  it('W3b AT-3.6 the follow-up for a whole class: three people in turn from the done page, one tap, the link once, Back to the upload at their row; Password set after one sets it', async () => {
    const rows: Row[] = [['Follow One', 'follow1.t', 'Student', '01046463601', END], ['Follow Two', 'follow2.t', 'Student', '01046463602', END], ['Follow Three', 'follow3.t', 'Parent', '01046463603', END]];
    const { uploadId, ids } = await addRows(rows);
    const done = donePath(w.school, uploadId);
    const browser = await chromium.launch();
    try {
      const { page } = await browserAs(browser, w, ADMIN, { lang: 'en' });
      await page.goto(w.p.url + done);
      const tokens: string[] = [];
      for (const [i, id] of ids.entries()) {
        // One tap on the row's button opens today's confirmation for that person.
        await Promise.all([page.waitForEvent('load'), page.click(`#p-${id} a.send-link`)]);
        assert.equal(new URL(page.url()).pathname + new URL(page.url()).search, `${person(id)}/link?back=${uploadId}`, `${rows[i][1]}: one tap to the confirmation`);
        assert.equal(await page.locator('main h1').innerText(), UI.en.sendResetLink, 'today\'s confirmation');
        assert.equal(await page.locator('#confirm-digits').innerText(), rows[i][3].slice(-4), 'with the last digits');
        assert.equal(await page.locator('#back-upload').innerText(), UI.en.backToUpload, 'Back to the upload on the confirmation');
        // Confirming shows the link once, with Back to the upload.
        await Promise.all([page.waitForEvent('load'), page.click('#confirm-link button')]);
        assert.equal(await page.locator('main h1').innerText(), UI.en.linkReadyTitle, 'the link page');
        const link = await page.locator('#reset-link').inputValue();
        const m = /\/r\/([A-Za-z0-9_-]{20,})$/.exec(link);
        assert.ok(m, 'the link is shown');
        tokens.push(m[1]);
        const back = page.locator('#back-upload');
        assert.equal(await back.innerText(), UI.en.backToUpload);
        assert.equal(await back.getAttribute('href'), `${done}#p-${id}`, 'to the done page at this person\'s row');
        await Promise.all([page.waitForEvent('load'), back.click()]);
        assert.equal(new URL(page.url()).pathname + new URL(page.url()).hash, `${done}#p-${id}`, 'back on the done page at the row');
        const focus = await page.evaluate(() => {
          const a = document.activeElement as HTMLElement | null;
          return a ? { row: a.closest('li')?.id ?? '', person: a.classList.contains('person') } : null;
        });
        assert.deepEqual(focus, { row: `p-${id}`, person: true }, `${rows[i][1]}: focus on their name`);
      }
      assert.equal(new Set(tokens).size, 3, 'three different links');
      // One of them sets a password through the link: the done page then shows "Password set" and no button for them.
      const set = await new Client(w.p.url).post(`/r/${tokens[1]}`, { username: rows[1][1], new_password: 'follow-two-pass' });
      assert.equal(set.status, 200);
      await page.goto(w.p.url + done);
      assert.equal(await page.locator(`#p-${ids[1]} .tag`).innerText(), UI.en.passwordSetTag, '"Password set"');
      assert.equal(await page.locator(`#p-${ids[1]} a.send-link, #p-${ids[1]} a.button, #p-${ids[1]} button`).count(), 0, 'no button');
      for (const id of [ids[0], ids[2]]) {
        assert.equal(await page.locator(`#p-${id} .tag`).innerText(), UI.en.noPasswordTag, 'the others still have no password');
        assert.equal(await page.locator(`#p-${id} a.send-link`).count(), 1, 'and keep their button');
      }
    } finally {
      await browser.close();
    }
  });
});
