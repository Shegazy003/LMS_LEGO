// AT-1 The owner shapes a space and appoints its admin (contract 0.3, section 3).
// Drives the real pages in Chromium against the Worker running locally
// (Wrangler + workerd, local D1 and R2), and checks status codes and stored
// rows directly. Screenshots go to evidence/at-1/.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { startWorker, type RunningWorker } from '../support/worker.ts';
import { Client, setClockOffsetDays, setClockTo, utcDatePlusDays, workerNow, tinyPng } from '../support/http.ts';

const EVIDENCE = fileURLToPath(new URL('../../evidence/at-1/', import.meta.url));
const SPACE = 'مدرسة مسك';
const COLOUR = '#0b6e4f';
const COLOUR_RGB = 'rgb(11, 110, 79)';
const OWNER = { username: 'owner', password: 'owner-pass-2026', mobile: '+201000000001' };
const ADMIN = {
  display: 'Amal Hassan',
  username: 'amal.admin',
  password: 'admin-first-pass',
  mobile: '01012345678',
  stored: '+201012345678',
};
const SCHOOL_AR = ['معلّم', 'طالب', 'فصل', 'مادّة'];

let worker: RunningWorker;
let browser: Browser;
let ownerCtx: BrowserContext;
let owner: Page;
let adminCtx: BrowserContext;
let admin: Page;
let spaceId = '';
let endDate = '';
// "Today" is the product's today: the Worker's clock, not this runner's. A
// run may cross midnight UTC between appointing the admin and moving the
// clock, so the end date is taken from the Worker, and the clock is later set
// to fixed times of that date, not moved by whole days from "now".
let today = '';
const noonOf = (date: string) => Date.parse(date + 'T12:00:00Z');

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `${EVIDENCE}${name}.png`, fullPage: true });
}

async function signIn(page: Page, username: string, password: string): Promise<void> {
  await page.goto(worker.url + '/signin');
  await page.fill('input[name=username]', username);
  await page.fill('input[name=password]', password);
  await Promise.all([page.waitForEvent('load'), page.click('form#signin button[type=submit]')]);
}

async function signOut(page: Page): Promise<void> {
  await Promise.all([page.waitForURL(/\/signin$/), page.click('form#signout button[type=submit]')]);
}

async function ownerClient(): Promise<Client> {
  const c = new Client(worker.url);
  const res = await c.post('/signin', { username: OWNER.username, password: OWNER.password });
  assert.equal(res.status, 302, 'owner signs in');
  return c;
}

function usageFrom(html: string, kind: string): { value: number; limit: number } {
  const m = html.match(new RegExp(`data-usage="${kind}"[^>]*data-value="(\\d+)"[^>]*data-limit="(\\d+)"`));
  assert.ok(m, `usage line "${kind}" present with data-value and data-limit`);
  return { value: Number(m[1]), limit: Number(m[2]) };
}

function logoForm(bytes: Uint8Array, name: string, type: string, extra: Record<string, string> = {}): FormData {
  const f = new FormData();
  const fields = { name: 'Refused Space', kit: 'school', languages: 'ar,en', primary_color: COLOUR, country_code: '+20', ...extra };
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  f.set('logo', new Blob([bytes], { type }), name);
  return f;
}

describe('AT-1 owner shapes a space and appoints its admin', { concurrency: false }, () => {
  before(async () => {
    mkdirSync(EVIDENCE, { recursive: true });
    worker = await startWorker();
    browser = await chromium.launch();
    ownerCtx = await browser.newContext({ locale: 'en-US', viewport: { width: 412, height: 915 } });
    owner = await ownerCtx.newPage();
    adminCtx = await browser.newContext({ locale: 'ar-EG', viewport: { width: 412, height: 915 } });
    admin = await adminCtx.newPage();
    for (const ctx of [ownerCtx, adminCtx]) ctx.setDefaultTimeout(15_000);
  });

  after(async () => {
    if (worker) await setClockOffsetDays(worker.url, 0).catch(() => undefined);
    await browser?.close();
    await worker?.stop();
  });

  it('AT-1.1 first visit with no owner opens owner setup; the recovery code is shown exactly once', async () => {
    await owner.goto(worker.url + '/');
    assert.match(owner.url(), /\/setup$/, 'first visit goes to setup');

    // A mobile number that is not in international form is refused.
    await owner.fill('input[name=username]', OWNER.username);
    await owner.fill('input[name=password]', OWNER.password);
    await owner.fill('input[name=mobile]', '01000000001');
    await owner.click('form#setup button[type=submit]');
    await owner.locator('#error').waitFor({ state: 'visible' }); // plain refusal message

    await owner.fill('input[name=username]', OWNER.username);
    await owner.fill('input[name=password]', OWNER.password);
    await owner.fill('input[name=mobile]', OWNER.mobile);
    await owner.click('form#setup button[type=submit]');
    const code = (await owner.locator('#recovery-code').innerText()).trim();
    assert.match(code, /^[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){3}$/);
    await shot(owner, '01-owner-setup-recovery-code-shown-once');

    // Never again: not on setup, not on the owner home.
    const again = await owner.goto(worker.url + '/setup');
    assert.ok(!(await owner.content()).includes(code), 'setup does not show the code again');
    assert.notEqual(await owner.locator('form#setup').count(), 1, 'setup form is gone');
    assert.ok(again);
    await owner.goto(worker.url + '/owner');
    assert.ok(!(await owner.content()).includes(code), 'owner home does not show the code');

    // A second owner cannot be created.
    const intruder = new Client(worker.url);
    const res = await intruder.post('/setup', { username: 'second', password: 'second-owner-pass', mobile: '+201000000002' });
    assert.equal(res.status, 403);
    const owners = await worker.sql('SELECT username, mobile, password_hash, recovery_hash FROM user WHERE is_owner = 1');
    assert.equal(owners.length, 1);
    assert.equal(owners[0].username, OWNER.username);
    assert.equal(owners[0].mobile, OWNER.mobile);
    assert.match(String(owners[0].password_hash), /^pbkdf2-sha256\$100000\$/);
    assert.ok(!String(owners[0].recovery_hash).includes(code.replace(/-/g, '')), 'only a hash of the code is stored');
  });

  it('AT-1.2 sign-in and sign-out use a server-side session in an HTTP-only cookie', async () => {
    const c = new Client(worker.url);
    const wrong = await c.post('/signin', { username: OWNER.username, password: 'not-the-password' });
    assert.equal(wrong.status, 401);
    assert.equal((await c.get('/owner')).status, 302, 'no session after a wrong password');

    const ok = await c.post('/signin', { username: OWNER.username, password: OWNER.password });
    assert.equal(ok.status, 302);
    const cookie = c.lastSetCookie.find((l) => l.startsWith('lms_session='));
    assert.ok(cookie, 'session cookie set');
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Lax/i);
    assert.match(cookie, /Path=\//i);
    const token = cookie.split(';')[0];
    assert.equal((await c.get('/owner')).status, 200);
    // A sign-in form posted from another site is refused, even with the right password.
    const crossSite = await fetch(worker.url + '/signin', {
      method: 'POST',
      redirect: 'manual',
      headers: { origin: 'https://attacker.example', 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username: OWNER.username, password: OWNER.password }),
    });
    assert.equal(crossSite.status, 403, 'a cross-site form is refused with 403');
    assert.ok(!crossSite.headers.getSetCookie().some((l) => l.startsWith('lms_session=')), 'and starts no session');

    const stored = await worker.sql('SELECT id FROM session');
    assert.ok(stored.length >= 1, 'sessions live on the server');
    assert.ok(stored.every((r) => !token.includes(String(r.id))), 'the cookie value is not stored as-is');

    assert.equal((await c.post('/signout', {})).status, 302);
    const replay = await fetch(worker.url + '/owner', { redirect: 'manual', headers: { cookie: token } });
    assert.equal(replay.status, 302, 'the old cookie is dead after sign-out');
    assert.match(replay.headers.get('location') ?? '', /\/signin$/);

    // Same journey in the browser.
    await signOut(owner);
    await signIn(owner, OWNER.username, OWNER.password);
    assert.match(owner.url(), /\/owner$/);
    await shot(owner, '02-owner-home-after-sign-in');
  });

  it('AT-1.3 the owner regenerates the recovery code; the old one dies; the new one resets the password', async () => {
    const before = await worker.sql("SELECT recovery_hash FROM user WHERE is_owner = 1");
    await owner.click('form#regenerate-code button[type=submit]');
    const fresh = (await owner.locator('#recovery-code').innerText()).trim();
    assert.match(fresh, /^[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){3}$/);
    await shot(owner, '03-owner-new-recovery-code');
    const after = await worker.sql("SELECT recovery_hash FROM user WHERE is_owner = 1");
    assert.notEqual(after[0].recovery_hash, before[0].recovery_hash, 'old code replaced');

    const c = new Client(worker.url);
    const wrongCode = await c.post('/recover', { username: OWNER.username, code: 'AAAA-BBBB-CCCC-DDDD', password: 'owner-pass-renewed' });
    assert.equal(wrongCode.status, 401);

    const recovered = await c.post('/recover', { username: OWNER.username, code: fresh, password: 'owner-pass-renewed' });
    assert.equal(recovered.status, 200);
    const page = await recovered.text();
    const next = page.match(/id="recovery-code"[^>]*>([^<]+)</)?.[1]?.trim();
    assert.ok(next && next !== fresh, 'a new code is shown once after using the old one');
    assert.equal((await c.get('/owner')).status, 200, 'recovery signs the owner in');

    const reuse = await new Client(worker.url).post('/recover', { username: OWNER.username, code: fresh, password: 'another-password' });
    assert.equal(reuse.status, 401, 'a used code is dead');
    assert.equal((await new Client(worker.url).post('/signin', { username: OWNER.username, password: OWNER.password })).status, 401, 'old password is dead');
    OWNER.password = 'owner-pass-renewed';
    await ownerClient();

    // The browser session from before the reset is dead; sign in again.
    await owner.goto(worker.url + '/owner');
    assert.match(owner.url(), /\/signin$/);
    await signIn(owner, OWNER.username, OWNER.password);
    assert.match(owner.url(), /\/owner$/);
  });

  it('AT-1.4 the owner creates مدرسة مسك on the School kit, Arabic first, with a logo and a colour', async () => {
    await owner.click('a#new-space');
    await owner.fill('input[name=name]', SPACE);
    await owner.selectOption('select[name=kit]', 'school');
    await owner.selectOption('select[name=languages]', 'ar,en');
    await owner.setInputFiles('input[name=logo]', { name: 'mesk-logo.png', mimeType: 'image/png', buffer: Buffer.from(tinyPng()) });
    await owner.fill('input[name=primary_color]', COLOUR);
    await owner.fill('input[name=country_code]', '+20');
    await shot(owner, '04-owner-new-space-form');
    await Promise.all([
      owner.waitForURL((u) => /^\/owner\/spaces\/[^/]+$/.test(u.pathname) && !u.pathname.endsWith('/new')),
      owner.click('form#new-space button[type=submit]'),
    ]);
    spaceId = owner.url().split('/').pop()!;
    assert.ok(spaceId.length > 0);
    assert.ok((await owner.content()).includes(SPACE));
    await shot(owner, '05-owner-space-created');

    const rows = await worker.sql(`SELECT s.name, s.default_country_code, k.json FROM space s JOIN kit k ON k.id = s.kit_id WHERE s.id = '${spaceId}'`);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].name, SPACE);
    assert.equal(rows[0].default_country_code, '+20');
    const kit = JSON.parse(String(rows[0].json));
    assert.equal(kit.seed, 'school');
    assert.deepEqual(kit.languages, ['ar', 'en']);
    assert.equal(kit.theme.primaryColor, COLOUR);
    assert.equal(kit.labels.ar.publisher, 'معلّم');

    // Logo rules: PNG, JPEG or SVG only, and size-limited.
    const c = await ownerClient();
    const gif = await c.post('/owner/spaces', logoForm(new TextEncoder().encode('GIF89a-not-allowed'), 'logo.gif', 'image/gif'));
    assert.equal(gif.status, 400);
    assert.match(await gif.text(), /id="error"/);
    const disguised = await c.post('/owner/spaces', logoForm(new TextEncoder().encode('<html>hi</html>'), 'logo.png', 'image/png'));
    assert.equal(disguised.status, 400, 'content decides, not the file name');
    const big = new Uint8Array(1024 * 1024 + 1);
    big.set(tinyPng());
    const tooBig = await c.post('/owner/spaces', logoForm(big, 'big.png', 'image/png'));
    assert.equal(tooBig.status, 400);
    const svg = await c.post('/owner/spaces', logoForm(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'l.svg', 'image/svg+xml', { name: 'SVG Space' }));
    assert.equal(svg.status, 302, 'SVG logos are accepted');
    const refused = await worker.sql("SELECT COUNT(*) AS n FROM space WHERE name = 'Refused Space'");
    assert.equal(Number(refused[0].n), 0, 'refused uploads create nothing');
  });

  it('AT-1.5 the owner appoints the admin with an end date of today plus 30 days', async () => {
    today = new Date(await workerNow(worker.url)).toISOString().slice(0, 10);
    endDate = utcDatePlusDays(30, Date.parse(today + 'T00:00:00Z'));
    // A number that cannot be normalised is refused with a plain message.
    await owner.fill('input[name=display_name]', ADMIN.display);
    await owner.fill('input[name=username]', ADMIN.username);
    await owner.fill('input[name=password]', ADMIN.password);
    await owner.fill('input[name=mobile]', '12');
    await owner.fill('input[name=valid_until]', endDate);
    await owner.click('form#appoint-admin button[type=submit]');
    await owner.locator('#error').waitFor({ state: 'visible' }); // plain refusal for an unreadable number

    await owner.fill('input[name=display_name]', ADMIN.display);
    await owner.fill('input[name=username]', ADMIN.username);
    await owner.fill('input[name=password]', ADMIN.password);
    await owner.fill('input[name=mobile]', ADMIN.mobile);
    await owner.fill('input[name=valid_until]', endDate);
    await Promise.all([owner.waitForEvent('load'), owner.click('form#appoint-admin button[type=submit]')]);
    const list = await owner.locator('#admins').innerText();
    assert.ok(list.includes(ADMIN.username) && list.includes(endDate), 'admin listed with end date');
    assert.ok(!list.includes(ADMIN.stored), 'the full mobile number is not shown');
    await shot(owner, '06-owner-admin-appointed');

    const users = await worker.sql(`SELECT id, mobile, password_hash, display_name, is_owner FROM user WHERE username = '${ADMIN.username}'`);
    assert.equal(users.length, 1);
    assert.equal(users[0].mobile, ADMIN.stored, 'mobile stored in international form');
    assert.match(String(users[0].password_hash), /^pbkdf2-sha256\$/);
    assert.equal(Number(users[0].is_owner), 0);
    const m = await worker.sql(`SELECT space_id, role, valid_until FROM membership WHERE user_id = '${users[0].id}'`);
    assert.deepEqual(m.map((r) => [r.space_id, r.role, r.valid_until]), [[spaceId, 'admin', endDate]]);

    const c = await ownerClient();
    const dup = await c.post(`/owner/spaces/${spaceId}/admins`, {
      display_name: 'X', username: ADMIN.username, password: 'another-pass', mobile: '01012345679', valid_until: endDate,
    });
    assert.equal(dup.status, 400, 'usernames are unique');
    const past = await c.post(`/owner/spaces/${spaceId}/admins`, {
      display_name: 'Y', username: 'past.admin', password: 'another-pass', mobile: '01012345679', valid_until: utcDatePlusDays(-1, Date.parse(today + 'T00:00:00Z')),
    });
    assert.equal(past.status, 400, 'an end date in the past is refused');
  });

  it('AT-1.6 the admin signs in and sees مدرسة مسك with logo and colour, right-to-left, with the School labels', async () => {
    await signIn(admin, ADMIN.username, ADMIN.password);
    assert.ok(admin.url().endsWith(`/s/${spaceId}`), `admin lands in the space, got ${admin.url()}`);
    assert.equal(await admin.getAttribute('html', 'dir'), 'rtl');
    assert.equal(await admin.getAttribute('html', 'lang'), 'ar');
    assert.equal((await admin.locator('#space-name').innerText()).trim(), SPACE);
    const logoOk = await admin.locator('#space-logo').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0);
    assert.ok(logoOk, 'logo loads');
    const bg = await admin.locator('header.space-header').evaluate((el) => getComputedStyle(el).backgroundColor);
    assert.equal(bg, COLOUR_RGB, 'space colour applied');
    for (const word of SCHOOL_AR) {
      assert.ok(await admin.getByText(word, { exact: true }).first().isVisible(), `label ${word} visible`);
    }
    await shot(admin, '07-admin-home-rtl-school-labels');

    const c = new Client(worker.url);
    assert.equal((await c.post('/signin', { username: ADMIN.username, password: ADMIN.password })).status, 302);
    assert.equal((await c.get('/owner')).status, 403, 'an admin cannot open the owner pages');
    assert.equal((await c.get(`/s/${spaceId}`)).status, 200);
  });

  it('AT-1.7 the owner home shows files stored and today\'s requests and writes against the free-plan lines', async () => {
    await owner.goto(worker.url + '/owner');
    const panel = await owner.locator('#usage').innerText();
    assert.ok(panel.includes('100,000'), 'free-plan line for requests and writes');
    assert.ok(panel.includes('10 GB'), 'free-plan line for storage');
    await shot(owner, '08-owner-usage-panel');

    const c = await ownerClient();
    const first = await (await c.get('/owner')).text();
    const requests = usageFrom(first, 'requests');
    const writes = usageFrom(first, 'writes');
    const storage = usageFrom(first, 'storage');
    assert.equal(requests.limit, 100_000);
    assert.equal(writes.limit, 100_000);
    assert.equal(storage.limit, 10_000_000_000);
    assert.ok(requests.value > 10, `requests counted (${requests.value})`);
    assert.ok(writes.value > 5, `writes counted (${writes.value})`);
    assert.ok(storage.value >= tinyPng().byteLength, `logo bytes counted (${storage.value})`);

    // Counting must not cost a database write per request.
    const started = Date.now();
    for (let i = 0; i < 50; i++) assert.equal((await c.get('/owner')).status, 200);
    const second = await (await c.get('/owner')).text();
    const minutes = Math.floor((Date.now() - started) / 60_000);
    assert.ok(usageFrom(second, 'requests').value - requests.value >= 50, '50 requests were counted');
    const extraWrites = usageFrom(second, 'writes').value - writes.value;
    assert.ok(extraWrites <= 1 + minutes, `50 requests cost ${extraWrites} database writes`);
  });

  it('AT-1.8 after the end date the admin still signs in but sees "access ended", and every direct link is refused (403)', async () => {
    // On the end date itself the admin still has access.
    assert.equal((await setClockTo(worker.url, noonOf(endDate))).status, 200);
    await adminCtx.clearCookies();
    await signIn(admin, ADMIN.username, ADMIN.password);
    assert.equal((await admin.locator('#space-name').innerText()).trim(), SPACE);

    // The day after, access has ended.
    assert.equal((await setClockTo(worker.url, noonOf(endDate) + 86_400_000)).status, 200);
    await adminCtx.clearCookies();
    await signIn(admin, ADMIN.username, ADMIN.password);
    assert.ok(admin.url().endsWith(`/s/${spaceId}`), 'the admin can still sign in');
    const english = `Your access to ${SPACE} ended on ${endDate}. Contact the owner.`;
    const arabic = `انتهى وصولك إلى ${SPACE} في ${endDate}. تواصل مع المالك.`;
    assert.equal((await admin.locator('#access-ended').innerText()).trim(), arabic, 'message in the first language');
    assert.equal((await admin.locator('#access-ended-alt').innerText()).trim(), english, 'and in the second');
    assert.equal(await admin.getAttribute('html', 'dir'), 'rtl');
    assert.equal(await admin.locator('#space-logo').count(), 0, 'the space is not shown');
    for (const word of SCHOOL_AR) assert.equal(await admin.getByText(word, { exact: true }).count(), 0);
    await shot(admin, '09-admin-access-ended');

    for (const path of [`/s/${spaceId}`, `/s/${spaceId}/`, `/s/${spaceId}/logo`, `/s/${spaceId}/people`, `/s/${spaceId}/subjects/1`]) {
      const res = await admin.goto(worker.url + path);
      assert.equal(res?.status(), 403, `${path} refused with 403`);
      assert.equal((await admin.locator('#access-ended-alt').innerText()).trim(), english, `${path} shows the message`);
    }
    const c = new Client(worker.url);
    assert.equal((await c.post('/signin', { username: ADMIN.username, password: ADMIN.password })).status, 302);
    const direct = await c.get(`/s/${spaceId}/logo`);
    assert.equal(direct.status, 403);
    const words = (await direct.text()).replace(/<[^>]*>/g, ''); // the text, without markup
    assert.ok(words.includes(english), 'the direct link answers with the same message');
  });
});
