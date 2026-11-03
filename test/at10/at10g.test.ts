// AT-10g (contract product-contract-r2, owner-added, option C): reset form
// retry feedback. If the first send of the password-reset form is cut off by
// the client (HTTP 499) but the password was changed, the retry of the same
// link shows a clear message in Arabic and English that the password was
// already changed and the person can sign in. It does not show "link gone"
// (410). A link that was never used, expired or tampered with still shows its
// existing messages.
//
// The first send is cut off on the client's side: the server completes it (as
// in the owner's live reset of 3 Nov 2026, PIL-109), and the client never reads
// its answer. The retry is the same form sent again: the same username and the
// same new password, to the same link.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser } from 'playwright';
import { assertPage, phone, readable, shot } from '../support/browser.ts';
import { Client, setClockOffsetMs, utcDatePlusDays } from '../support/http.ts';
import { issueLink } from '../support/admin.ts';
import { appointAdmin, createSpace, seed, setUpOwner, signedIn } from '../support/seed.ts';
import { startProduct, type Product } from '../support/product.ts';

const EVIDENCE = fileURLToPath(new URL('../../evidence/at-10/', import.meta.url));
const ADMIN_AR = { display_name: 'Amal Hassan', username: 'amal.admin', password: 'admin-first-pass', mobile: '01012345678' };
const ADMIN_EN = { display_name: 'Basem Fawzy', username: 'basem.admin', password: 'admin-other-pass', mobile: '01087654321' };
const SALMA = { display_name: 'Salma Test', username: 'salma.a', password: 'salma-first-pass', role: 'learner' as const, mobile: '01031313131' };
const KARIM = { display_name: 'Karim Said', username: 'karim.x', password: 'karim-first-pass', role: 'learner' as const, mobile: '01055556666' };
const AR = 'تم تغيير كلمة المرور بهذا الرابط من قبل. يمكنك تسجيل الدخول بها الآن.';
const EN = 'Your password was already changed with this link. You can sign in with it now.';
const DEAD_AR = 'هذا الرابط لم يعد يعمل. اطلب رابطاً جديداً ممّن أرسله.';

let p: Product;
let browser: Browser;
let arSpace = '';
let enSpace = '';
let ids: Record<string, string> = {};
let arAdmin: Client;
let enAdmin: Client;

const personPath = (space: string, user: string) => `/s/${space}/admin/people/${user}`;
const said = (html: string, id: string) => html.match(new RegExp(`id="${id}"[^>]*>([^<]*)<`))?.[1] ?? '';

/** The first send: the server completes it; the client never reads the answer (the 499 of the live reset). */
async function cutOffFirstSend(token: string, username: string, password: string): Promise<void> {
  const res = await new Client(p.url).post(`/r/${token}`, { username, new_password: password });
  await res.body?.cancel();
}

describe('AT-10g the retry of a reset form whose first send was cut off says the password is already changed', { concurrency: false }, () => {
  before(async () => {
    mkdirSync(EVIDENCE, { recursive: true });
    p = await startProduct();
    try {
      const owner = await setUpOwner(p.url);
      arSpace = await createSpace(owner, { name: 'مدرسة مسك', kit: 'school' });
      enSpace = await createSpace(owner, { name: 'Delta Logistics', kit: 'company', languages: 'en,ar' });
      await appointAdmin(owner, arSpace, { ...ADMIN_AR, valid_until: utcDatePlusDays(60) });
      await appointAdmin(owner, enSpace, { ...ADMIN_EN, valid_until: utcDatePlusDays(60) });
      ids = { ...(await seed(p.url, { spaceId: arSpace, grantedBy: ADMIN_AR.username, people: [{ ...SALMA, valid_until: utcDatePlusDays(30) }] })).users };
      Object.assign(ids, (await seed(p.url, { spaceId: enSpace, grantedBy: ADMIN_EN.username, people: [{ ...KARIM, valid_until: utcDatePlusDays(30) }] })).users);
      arAdmin = await signedIn(p.url, ADMIN_AR.username, ADMIN_AR.password);
      enAdmin = await signedIn(p.url, ADMIN_EN.username, ADMIN_EN.password);
      browser = await chromium.launch();
    } catch (err) {
      await p.stop();
      throw err;
    }
  });
  after(async () => {
    await browser?.close();
    await p?.stop();
  });

  it('the retry answers 200, not 410: "already changed, sign in", in Arabic and in English; the new password signs in', async () => {
    const link = await issueLink(arAdmin, personPath(arSpace, ids[SALMA.username]));
    assert.equal(link.status, 200);
    await cutOffFirstSend(link.token, SALMA.username, 'salma-new-pass-1');
    const retry = await new Client(p.url).post(`/r/${link.token}`, { username: SALMA.username, new_password: 'salma-new-pass-1' });
    assert.equal(retry.status, 200, 'not 410');
    assert.equal(retry.headers.get('cache-control'), 'no-store');
    const html = await retry.text();
    assert.equal(said(html, 'already-changed'), AR, 'the message in Arabic (the space\'s first language)');
    assert.equal(said(html, 'already-changed-alt'), EN, 'and in English');
    assert.match(html, /<p id="already-changed-alt" lang="en" dir="ltr">/, 'the English line reads left to right');
    assert.ok(!html.includes('link-dead') && !html.includes(DEAD_AR), 'not "link gone"');
    assert.match(html, /href="\/signin"/, 'a way to sign in');
    const c = new Client(p.url);
    assert.equal((await c.post('/signin', { username: SALMA.username, password: 'salma-new-pass-1' })).status, 302, 'the new password signs in');
  });

  it('an English-first space says it in English, then in Arabic', async () => {
    const link = await issueLink(enAdmin, personPath(enSpace, ids[KARIM.username]));
    await cutOffFirstSend(link.token, KARIM.username, 'karim-new-pass-1');
    const retry = await new Client(p.url).post(`/r/${link.token}`, { username: KARIM.username, new_password: 'karim-new-pass-1' });
    assert.equal(retry.status, 200);
    const html = await retry.text();
    assert.equal(said(html, 'already-changed'), EN);
    assert.equal(said(html, 'already-changed-alt'), AR);
    assert.match(html, /<p id="already-changed-alt" lang="ar" dir="rtl">/);
  });

  it('in a real browser at phone width: the retried form shows the message (Arabic page with the English line)', async () => {
    const link = await issueLink(arAdmin, personPath(arSpace, ids[SALMA.username]));
    const ph = await phone(browser);
    await ph.page.goto(`${p.url}/r/${link.token}`);
    await ph.page.fill('form#reset input[name=username]', SALMA.username);
    await ph.page.fill('form#reset input[name=new_password]', 'salma-new-pass-2');
    // The first send reaches the server, but its answer never reaches this page.
    await cutOffFirstSend(link.token, SALMA.username, 'salma-new-pass-2');
    const [res] = await Promise.all([
      ph.page.waitForResponse((r) => r.request().method() === 'POST'),
      ph.page.waitForEvent('load'),
      ph.page.click('form#reset button[type=submit]'),
    ]);
    assert.equal(res.status(), 200);
    await assertPage(ph.page, 'the retried reset (Arabic)', 'ar');
    const text = await readable(ph.page);
    assert.ok(text.includes(AR) && text.includes(EN), 'both languages');
    await shot(ph.page, EVIDENCE, '10g-1-retry-already-changed');
    await ph.ctx.close();
  });

  it('anything else on a used link still shows "link gone" (410): opening it, another password, another username', async () => {
    const link = await issueLink(arAdmin, personPath(arSpace, ids[SALMA.username]));
    await cutOffFirstSend(link.token, SALMA.username, 'salma-new-pass-3');
    const visitor = new Client(p.url);
    for (const [what, send] of [
      ['opening the link again', () => visitor.get(`/r/${link.token}`)],
      ['another password', () => visitor.post(`/r/${link.token}`, { username: SALMA.username, new_password: 'not-the-new-one' })],
      ['another username', () => visitor.post(`/r/${link.token}`, { username: KARIM.username, new_password: 'salma-new-pass-3' })],
    ] as const) {
      const res = await send();
      assert.equal(res.status, 410, what);
      assert.equal(said(await res.text(), 'link-dead'), DEAD_AR, `${what}: the existing message`);
    }
  });

  it('a link never used, an expired link (also after use) and a tampered link keep their existing messages', async () => {
    const fresh = await issueLink(arAdmin, personPath(arSpace, ids[SALMA.username]));
    const visitor = new Client(p.url);
    const form = await visitor.get(`/r/${fresh.token}`);
    assert.equal(form.status, 200, 'never used: the form');
    assert.match(await form.text(), /<form id="reset"/);
    const wrong = await visitor.post(`/r/${fresh.token}`, { username: 'someone.else', new_password: 'whatever-pass' });
    assert.equal(wrong.status, 401, 'never used, wrong username: the existing message');
    assert.match(await wrong.text(), /اسم المستخدم هذا لا يطابق الرابط/);

    const tampered = fresh.token.slice(0, -1) + (fresh.token.endsWith('A') ? 'B' : 'A');
    for (const res of [await visitor.get(`/r/${tampered}`), await visitor.post(`/r/${tampered}`, { username: SALMA.username, new_password: 'salma-new-pass-4' })]) {
      assert.equal(res.status, 410, 'tampered: link gone');
    }

    // Used, then 31 minutes pass: the retry is the usual dead link.
    await cutOffFirstSend(fresh.token, SALMA.username, 'salma-new-pass-4');
    const expiredAfterUse = fresh.token;
    const unused = await issueLink(arAdmin, personPath(arSpace, ids[SALMA.username]));
    await setClockOffsetMs(p.url, 31 * 60_000);
    try {
      const retried = await visitor.post(`/r/${expiredAfterUse}`, { username: SALMA.username, new_password: 'salma-new-pass-4' });
      assert.equal(retried.status, 410, 'used and expired: link gone');
      const expired = await visitor.post(`/r/${unused.token}`, { username: SALMA.username, new_password: 'salma-new-pass-5' });
      assert.equal(expired.status, 410, 'never used but expired: link gone');
      assert.equal(said(await expired.text(), 'link-dead'), DEAD_AR);
    } finally {
      await setClockOffsetMs(p.url, 0);
    }
  });
});
