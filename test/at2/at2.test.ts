// AT-2 The admin staffs the space and assigns a subject (contract 0.3, section 3).
// Drives the real admin pages in Chromium, at phone width and in Arabic,
// against the Worker running locally (Wrangler + workerd, local D1 and R2).
// Nothing is seeded: the owner, the space and its admin come from the owner's
// real forms (as in AT-1); every admin action (appointing Hadeer, Shimaa and
// two learners, the group Science, the subject Mathematics and its
// assignments, the reset links and a new password) goes through the admin's
// real screens in a real browser; Hadeer publishes through her own screen
// (AT-3). The WhatsApp button is read, not pressed: the real send is the
// owner's acceptance on a phone (AT-2 step 6). Screenshots go to evidence/at-2/.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { startWorker, type RunningWorker } from '../support/worker.ts';
import { Client, setClockOffsetMs, workerNow } from '../support/http.ts';
import { appointAdmin, createSpace, setUpOwner } from '../support/seed.ts';

const EVIDENCE = fileURLToPath(new URL('../../evidence/at-2/', import.meta.url));
const SPACE = 'مدرسة مسك';
const ADMIN = { display_name: 'Amal Hassan', username: 'amal.admin', password: 'admin-first-pass', mobile: '01012345678' };
interface Person { display_name: string; username: string; password: string; role: 'publisher' | 'learner'; mobile: string; stored: string }
const HADEER: Person = { display_name: 'Hadeer', username: 'hadeer', password: 'hadeer-first-pass', role: 'publisher', mobile: '01022223333', stored: '+201022223333' };
const SHIMAA: Person = { display_name: 'Shimaa', username: 'shimaa', password: 'shimaa-first-pass', role: 'publisher', mobile: '010 6666 7777', stored: '+201066667777' };
// For a learner, the registered number is a parent's.
const SALMA: Person = { display_name: 'Salma Adel', username: 'salma.learner', password: 'salma-first-pass', role: 'learner', mobile: '01033334444', stored: '+201033334444' };
const OMAR: Person = { display_name: 'Omar Nabil', username: 'omar.learner', password: 'omar-first-pass', role: 'learner', mobile: '010-5555-6666', stored: '+201055556666' };
const PEOPLE = [HADEER, SHIMAA, SALMA, OMAR];
const ROLE_AR = { publisher: 'معلّم', learner: 'طالب' };
const MIN = 60_000;

// Plain messages, in the space's first language (Arabic).
const MOBILE_REFUSED = 'تعذّرت قراءة رقم الهاتف المحمول هذا. اكتبه بالطريقة المحلية (مثل 010…) أو بعلامة + ورمز الدولة.';
// Release 2 (R2-a) adds the guardian to the roles an admin may appoint.
const ROLE_REFUSED = 'يمكنك تعيين معلّم أو طالب أو ولي أمر فقط.';
const WRONG_USER = 'اسم المستخدم هذا لا يطابق الرابط. تحقّق منه وحاول مرة أخرى.';
const LINK_DEAD = 'هذا الرابط لم يعد يعمل. اطلب رابطاً جديداً ممّن أرسله.';
const RESET_DONE = 'تم تعيين كلمة المرور الجديدة. سجّل الدخول بها الآن.';
const SIGN_IN_FAILED = 'اسم المستخدم أو كلمة المرور غير صحيحة.';

let worker: RunningWorker;
let browser: Browser;
let adminCtx: BrowserContext;
let admin: Page;
let spaceId = '';
let today = '';
let adminEnd = '';
let peopleEnd = '';
const ids: Record<string, string> = {};
const links: Record<string, string> = {};

const at = (path: string) => worker.url + path;
const plus = (days: number) => new Date(Date.parse(today + 'T00:00:00Z') + days * 86_400_000).toISOString().slice(0, 10);

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `${EVIDENCE}${name}.png`, fullPage: true });
}

async function newPhone(): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ locale: 'ar-EG', viewport: { width: 412, height: 915 } });
  ctx.setDefaultTimeout(15_000);
  return { ctx, page: await ctx.newPage() };
}

async function signIn(page: Page, username: string, password: string): Promise<void> {
  await page.goto(at('/signin'));
  await page.fill('input[name=username]', username);
  await page.fill('input[name=password]', password);
  await Promise.all([page.waitForEvent('load'), page.click('form#signin button[type=submit]')]);
}

/** Submits a form with its own button; returns the status of the form's own response. */
async function submit(page: Page, form: string): Promise<number> {
  const [res] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === 'POST' && r.request().frame() === page.mainFrame()),
    page.waitForEvent('load'),
    page.locator(form).locator('button[type=submit]').click(),
  ]);
  return res.status();
}

async function assertArabicPhonePage(page: Page, where: string): Promise<void> {
  assert.equal(await page.getAttribute('html', 'dir'), 'rtl', `${where}: right-to-left`);
  assert.equal(await page.getAttribute('html', 'lang'), 'ar', `${where}: Arabic`);
  assert.equal((await page.locator('#space-name').innerText()).trim(), SPACE, `${where}: the space's name`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 1, `${where}: fits the phone width (overflow ${overflow}px)`);
}

async function errorText(page: Page): Promise<string> {
  return (await page.locator('#error').innerText()).trim();
}

async function fillAppoint(page: Page, p: Omit<Person, 'stored'>, end: string): Promise<void> {
  await page.fill('form#appoint input[name=display_name]', p.display_name);
  await page.fill('form#appoint input[name=username]', p.username);
  await page.fill('form#appoint input[name=password]', p.password);
  await page.selectOption('form#appoint select[name=role]', p.role);
  await page.fill('form#appoint input[name=mobile]', p.mobile);
  await page.fill('form#appoint input[name=valid_until]', end);
}

async function openHomeTile(concept: 'publisher' | 'learner' | 'group' | 'subject'): Promise<void> {
  await admin.goto(at(`/s/${spaceId}`));
  await Promise.all([admin.waitForEvent('load'), admin.locator(`#concepts [data-concept="${concept}"] a`).click()]);
}

async function openPerson(p: Person): Promise<void> {
  await openHomeTile('publisher');
  await Promise.all([admin.waitForEvent('load'), admin.locator(`#people [data-user="${ids[p.username]}"] a.person`).click()]);
  assert.ok(admin.url().endsWith(`/s/${spaceId}/admin/people/${ids[p.username]}`), `${p.display_name}'s page`);
}

/** The admin presses "Send reset link by WhatsApp", sees the last digits, and confirms with one tap. */
async function sendResetLink(p: Person, evidence?: string): Promise<{ link: string; href: string; message: string; number: string }> {
  await openPerson(p);
  const page = await admin.content();
  for (const n of [p.stored, p.stored.slice(1), p.mobile]) assert.ok(!page.includes(n), `${p.display_name}'s page does not show ${n}`);
  if (evidence) await shot(admin, `${evidence}-a-person-page`);
  await Promise.all([admin.waitForEvent('load'), admin.locator('#send-link button[type=submit]').click()]);
  const digits = (await admin.locator('#confirm-digits').innerText()).trim();
  assert.equal(digits, p.stored.slice(-4), 'the confirmation step shows the last digits');
  const confirm = await admin.content();
  for (const n of [p.stored, p.stored.slice(1), p.mobile]) assert.ok(!confirm.includes(n), `the confirmation step does not show ${n}`);
  assert.equal(await admin.locator('a#whatsapp').count(), 0, 'no link before the confirming tap');
  await assertArabicPhonePage(admin, 'confirmation step');
  if (evidence) await shot(admin, `${evidence}-b-confirmation-last-digits`);
  assert.equal(await submit(admin, '#confirm-link'), 200, 'one confirming tap');
  const whatsapp = admin.locator('a#whatsapp');
  const copy = admin.locator('button#copy');
  assert.ok(await whatsapp.isVisible(), 'a WhatsApp button');
  assert.ok(await copy.isVisible(), 'a Copy button');
  const [wa, cp] = [await whatsapp.boundingBox(), await copy.boundingBox()];
  assert.ok(wa && cp && Math.abs(wa.y - cp.y) < 8, 'side by side');
  const link = await admin.locator('input#reset-link').inputValue();
  assert.equal(await copy.getAttribute('data-copy'), link, 'the Copy button holds the same link');
  const href = (await whatsapp.getAttribute('href')) ?? '';
  assert.equal(await whatsapp.getAttribute('target'), '_blank');
  assert.match((await whatsapp.getAttribute('rel')) ?? '', /noopener/);
  await assertArabicPhonePage(admin, 'link step');
  if (evidence) await shot(admin, `${evidence}-c-whatsapp-and-copy-buttons`);
  const u = new URL(href);
  return { link, href, message: u.searchParams.get('text') ?? '', number: u.pathname.slice(1) };
}

function expectedMessage(p: Person, link: string): string {
  return [
    `السلام عليكم. هذه رسالة من ${SPACE}.`,
    `أرسل ${ADMIN.display_name} (مدير) رابطاً لتعيين كلمة مرور جديدة لحساب ${p.display_name} على ${worker.url}.`,
    'افتح الرابط، واكتب اسم المستخدم ثم كلمة المرور الجديدة. الرابط صالح لمدة 30 دقيقة ولمرة واحدة.',
    link,
  ].join('\n');
}

/** The person (or a parent) opens the link on their own phone. */
async function useLink(page: Page, link: string, username: string, password: string): Promise<number> {
  const res = await page.goto(link);
  assert.equal(res?.status(), 200, 'the link opens');
  await assertArabicPhonePage(page, 'reset page');
  await page.fill('form#reset input[name=username]', username);
  await page.fill('form#reset input[name=new_password]', password);
  return submit(page, '#reset');
}

async function homeTitles(page: Page): Promise<string[]> {
  const list = page.locator('#my-list li, #publisher-list li a.edit');
  return (await list.allInnerTexts()).map((s) => s.trim());
}

describe('AT-2 the admin staffs the space and assigns a subject', { concurrency: false }, () => {
  before(async () => {
    mkdirSync(EVIDENCE, { recursive: true });
    worker = await startWorker();
    today = new Date(await workerNow(worker.url)).toISOString().slice(0, 10);
    adminEnd = plus(60);
    peopleEnd = plus(30);
    const owner = await setUpOwner(worker.url);
    spaceId = await createSpace(owner, { name: SPACE, kit: 'school' });
    await appointAdmin(owner, spaceId, { ...ADMIN, valid_until: adminEnd });
    browser = await chromium.launch();
    adminCtx = await browser.newContext({ locale: 'ar-EG', viewport: { width: 412, height: 915 }, permissions: ['clipboard-read', 'clipboard-write'] });
    adminCtx.setDefaultTimeout(15_000);
    admin = await adminCtx.newPage();
  });

  after(async () => {
    if (worker) await setClockOffsetMs(worker.url, 0).catch(() => undefined);
    await browser?.close();
    await worker?.stop();
  });

  it('AT-2.1 the admin appoints Hadeer, Shimaa and two learners, each with an end date and a registered mobile typed the local way', async () => {
    await signIn(admin, ADMIN.username, ADMIN.password);
    assert.ok(admin.url().endsWith(`/s/${spaceId}`), 'the admin lands in the space');
    await openHomeTile('publisher');
    assert.ok(admin.url().endsWith(`/s/${spaceId}/admin/people`), 'the people page');
    await assertArabicPhonePage(admin, 'people page');
    assert.equal(await admin.getAttribute('form#appoint input[name=valid_until]', 'max'), adminEnd, 'the date field stops at the admin\'s own end date');

    // A number that cannot be normalised is refused with a plain message.
    await fillAppoint(admin, { ...HADEER, mobile: '0102' }, peopleEnd);
    assert.equal(await submit(admin, '#appoint'), 400);
    assert.equal(await errorText(admin), MOBILE_REFUSED);
    await shot(admin, '01-admin-mobile-refused');
    assert.equal((await worker.sql(`SELECT COUNT(*) AS n FROM user WHERE username = '${HADEER.username}'`))[0].n, 0, 'nothing stored');

    for (const p of PEOPLE) {
      await fillAppoint(admin, p, peopleEnd);
      assert.equal(await submit(admin, '#appoint'), 303, `${p.display_name} appointed`);
    }
    const adminId = String((await worker.sql(`SELECT id FROM user WHERE username = '${ADMIN.username}'`))[0].id);
    for (const p of PEOPLE) {
      const rows = await worker.sql(
        `SELECT u.id, u.mobile, u.display_name, u.password_hash, m.role, m.valid_from, m.valid_until, m.granted_by, m.space_id
           FROM user u JOIN membership m ON m.user_id = u.id WHERE u.username = '${p.username}'`,
      );
      assert.equal(rows.length, 1, `${p.username}: one membership`);
      const r = rows[0];
      ids[p.username] = String(r.id);
      assert.equal(r.mobile, p.stored, `${p.username}: mobile stored in international form`);
      assert.deepEqual([r.role, r.valid_from, r.valid_until, r.granted_by, r.space_id], [p.role, today, peopleEnd, adminId, spaceId]);
      assert.match(String(r.password_hash), /^pbkdf2-sha256\$/);
    }
    const list = admin.locator('#people');
    for (const p of PEOPLE) {
      const row = (await list.locator(`[data-user="${ids[p.username]}"]`).innerText()).trim();
      for (const part of [p.display_name, ROLE_AR[p.role], peopleEnd, p.stored.slice(-4)]) assert.ok(row.includes(part), `${p.username} row shows ${part}`);
    }
    const html = await admin.content();
    for (const p of PEOPLE) for (const n of [p.stored, p.stored.slice(1)]) assert.ok(!html.includes(n), `the list does not show ${n}`);
    await shot(admin, '02-admin-people-appointed');
  });

  it('AT-2.1b the admin cannot appoint another admin, and cannot set an end date later than their own', async () => {
    const roles = await admin.locator('form#appoint select[name=role] option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
    assert.deepEqual(roles, ['publisher', 'learner'], 'only a publisher or a learner can be chosen');

    // Even a page altered to offer "admin" is refused.
    await fillAppoint(admin, { ...HADEER, display_name: 'Second Admin', username: 'second.admin' }, peopleEnd);
    await admin.locator('form#appoint select[name=role]').evaluate((s) => {
      const o = document.createElement('option');
      o.value = 'admin';
      s.appendChild(o);
      (s as HTMLSelectElement).value = 'admin';
    });
    assert.equal(await submit(admin, '#appoint'), 400);
    assert.equal(await errorText(admin), ROLE_REFUSED);

    // An end date after the admin's own is refused (the browser's own date limit set aside).
    await fillAppoint(admin, { ...HADEER, display_name: 'Late End', username: 'late.end' }, plus(61));
    await admin.locator('form#appoint').evaluate((f) => { (f as HTMLFormElement).noValidate = true; });
    assert.equal(await submit(admin, '#appoint'), 400);
    assert.equal(await errorText(admin), `لا يمكن أن يتجاوز تاريخ الانتهاء تاريخ انتهائك أنت، ${adminEnd}.`);
    await shot(admin, '03-admin-end-date-beyond-own-refused');

    const made = await worker.sql("SELECT COUNT(*) AS n FROM user WHERE username IN ('second.admin', 'late.end')");
    assert.equal(Number(made[0].n), 0, 'nothing stored');
    const admins = await worker.sql(`SELECT COUNT(*) AS n FROM membership WHERE space_id = '${spaceId}' AND role = 'admin'`);
    assert.equal(Number(admins[0].n), 1, 'still one admin');
  });

  it('AT-2.2 the admin forms the group Science with only the first learner, creates Mathematics, assigns Hadeer and the group', async () => {
    await openHomeTile('group');
    await assertArabicPhonePage(admin, 'groups page');
    await admin.fill('form#new-set input[name=name]', 'Science');
    const choices = await admin.locator('form#new-set input[name=member]').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
    assert.deepEqual(choices.sort(), [ids[SALMA.username], ids[OMAR.username]].sort(), 'only learners can be chosen');
    await admin.check(`form#new-set input[name=member][value="${ids[SALMA.username]}"]`);
    assert.equal(await submit(admin, '#new-set'), 303);
    const sets = (await admin.locator('#sets').innerText()).trim();
    assert.ok(sets.includes('Science') && sets.includes(SALMA.display_name) && !sets.includes(OMAR.display_name), 'Science with Salma only');
    await shot(admin, '04-admin-group-science');
    const members = await worker.sql(
      `SELECT gm.user_id FROM group_member gm JOIN "group" g ON g.id = gm.group_id WHERE g.space_id = '${spaceId}' AND g.name = 'Science'`,
    );
    assert.deepEqual(members.map((r) => r.user_id), [ids[SALMA.username]]);

    await openHomeTile('subject');
    await assertArabicPhonePage(admin, 'subjects page');
    await admin.fill('form#new-topic input[name=title]', 'Mathematics');
    const publishers = await admin.locator('form#new-topic select[name=publisher] option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value).filter(Boolean));
    assert.deepEqual(publishers.sort(), [ids[HADEER.username], ids[SHIMAA.username]].sort(), 'only publishers can be responsible');
    await admin.selectOption('form#new-topic select[name=publisher]', ids[HADEER.username]);
    assert.equal(await submit(admin, '#new-topic'), 303);
    const subjectId = admin.url().split('/').pop()!;
    assert.match(admin.url(), new RegExp(`/s/${spaceId}/admin/topics/[^/?#]+$`), 'the subject\'s page');
    await admin.check('form#topic-access input[name=set]');
    assert.equal(await submit(admin, '#topic-access'), 303);
    assert.ok(await admin.locator('form#topic-access input[name=set]').isChecked(), 'Science is assigned');
    await shot(admin, '05-admin-subject-mathematics-assigned');

    const subject = await worker.sql(`SELECT title, publisher_user_id, is_published FROM subject WHERE id = '${subjectId}' AND space_id = '${spaceId}'`);
    assert.deepEqual([subject[0].title, subject[0].publisher_user_id, Number(subject[0].is_published)], ['Mathematics', ids[HADEER.username], 0]);
    const access = await worker.sql(
      `SELECT g.name, a.user_id FROM subject_access a LEFT JOIN "group" g ON g.id = a.group_id WHERE a.subject_id = '${subjectId}' AND a.space_id = '${spaceId}'`,
    );
    assert.deepEqual(access.map((r) => [r.name, r.user_id]), [['Science', null]], 'assigned to the group Science');
  });

  it('AT-2.3 Hadeer forgot her password: the admin sends a reset link by WhatsApp; Hadeer sets a new password with her username', async () => {
    const sent = await sendResetLink(HADEER, '06-hadeer');
    links.hadeer = sent.link;
    assert.match(sent.link, new RegExp(`^${worker.url}/r/[A-Za-z0-9_-]{22,}$`));
    assert.ok(sent.href.startsWith('https://wa.me/201022223333?text='), 'a real wa.me link to the registered number in international form');
    assert.equal(sent.number, HADEER.stored.slice(1));
    assert.equal(sent.message, expectedMessage(HADEER, sent.link), 'the fixed message in Arabic, the link alone on the last line');
    await admin.locator('button#copy').click();
    assert.equal(await admin.evaluate(() => navigator.clipboard.readText()), sent.link, 'Copy puts the same link on the clipboard');

    const { ctx, page } = await newPhone();
    const res = await page.goto(sent.link);
    assert.equal(res?.status(), 200);
    await assertArabicPhonePage(page, 'reset page');
    assert.ok((await page.locator('#reset-intro').innerText()).includes(SPACE), 'plain instructions naming the space');
    await shot(page, '07-hadeer-reset-page');
    await page.fill('form#reset input[name=username]', 'shimaa');
    await page.fill('form#reset input[name=new_password]', 'hadeer-new-pass');
    assert.equal(await submit(page, '#reset'), 401, 'a wrong username is refused');
    assert.equal(await errorText(page), WRONG_USER);
    assert.equal(await useLink(page, sent.link, HADEER.username, 'hadeer-new-pass'), 200, 'the right username sets the password');
    assert.equal((await page.locator('#done').innerText()).trim(), RESET_DONE);
    await shot(page, '08-hadeer-new-password-set');

    await signIn(page, HADEER.username, HADEER.password);
    assert.equal(await errorText(page), SIGN_IN_FAILED, 'the old password is dead');
    await signIn(page, HADEER.username, 'hadeer-new-pass');
    assert.ok(page.url().endsWith(`/s/${spaceId}`), 'Hadeer signs in with the new password');
    HADEER.password = 'hadeer-new-pass';

    const again = await page.goto(sent.link);
    assert.equal(again?.status(), 410, 'a second use is refused');
    assert.equal((await page.locator('#link-dead').innerText()).trim(), LINK_DEAD);
    await ctx.close();
  });

  it('AT-2.4 the same for the first learner: the link goes to the parent\'s number; a fresh link kills the earlier one', async () => {
    const first = await sendResetLink(SALMA);
    const second = await sendResetLink(SALMA, '09-salma');
    assert.notEqual(first.link, second.link);
    assert.equal(second.number, '201033334444', 'the parent\'s registered number');
    assert.equal(second.message, expectedMessage(SALMA, second.link));

    const { ctx, page } = await newPhone();
    const old = await page.goto(first.link);
    assert.equal(old?.status(), 410, 'the earlier link is dead');
    assert.equal(await useLink(page, second.link, SALMA.username, 'salma-new-pass'), 200);
    await signIn(page, SALMA.username, 'salma-new-pass');
    assert.ok(page.url().endsWith(`/s/${spaceId}`), 'Salma signs in with the new password');
    SALMA.password = 'salma-new-pass';
    await ctx.close();
  });

  it('AT-2.5 a link stops working when the clock reaches 30 minutes after its creation', async () => {
    const sent = await sendResetLink(OMAR);
    assert.equal(sent.number, '201055556666');
    assert.equal((await setClockOffsetMs(worker.url, 30 * MIN)).status, 200);
    const { ctx, page } = await newPhone();
    const res = await page.goto(sent.link);
    assert.equal(res?.status(), 410, 'refused 30 minutes after creation');
    assert.equal((await page.locator('#link-dead').innerText()).trim(), LINK_DEAD);
    await shot(page, '10-link-expired');
    await ctx.close();
    assert.equal((await setClockOffsetMs(worker.url, 0)).status, 200);
    const stillOld = await new Client(worker.url).post('/signin', { username: OMAR.username, password: OMAR.password });
    assert.equal(stillOld.status, 302, 'Omar\'s password is unchanged');
  });

  it('AT-2.6 the admin sets a new password for Shimaa directly', async () => {
    await openPerson(SHIMAA);
    await admin.fill('form#set-password input[name=new_password]', 'shimaa-new-pass');
    assert.equal(await submit(admin, '#set-password'), 200);
    assert.ok(await admin.locator('#done').isVisible(), 'the admin sees that it is done');
    await shot(admin, '11-admin-sets-shimaa-password');
    const { ctx, page } = await newPhone();
    await signIn(page, SHIMAA.username, SHIMAA.password);
    assert.equal(await errorText(page), SIGN_IN_FAILED, 'the first password is dead');
    await signIn(page, SHIMAA.username, 'shimaa-new-pass');
    assert.ok(page.url().endsWith(`/s/${spaceId}`), 'Shimaa signs in with the password the admin set');
    SHIMAA.password = 'shimaa-new-pass';
    await ctx.close();
  });

  it('AT-2.7 Hadeer\'s home lists Mathematics, Shimaa\'s nothing yet; once Hadeer publishes, the first learner\'s home lists it and the second learner\'s nothing', async () => {
    const hadeer = await newPhone();
    await signIn(hadeer.page, HADEER.username, HADEER.password);
    await assertArabicPhonePage(hadeer.page, 'Hadeer\'s home');
    assert.deepEqual(await homeTitles(hadeer.page), ['Mathematics'], 'Hadeer\'s home lists Mathematics');
    await shot(hadeer.page, '12-hadeer-home-mathematics');
    // Published through Hadeer's own screen (AT-3), so the learners' homes show it.
    await Promise.all([hadeer.page.waitForEvent('load'), hadeer.page.locator('#publisher-list a.edit').click()]);
    assert.equal(await submit(hadeer.page, '#publish'), 303);

    const shimaa = await newPhone();
    await signIn(shimaa.page, SHIMAA.username, SHIMAA.password);
    assert.deepEqual(await homeTitles(shimaa.page), [], 'Shimaa\'s home lists nothing');
    assert.ok(await shimaa.page.locator('#nothing-yet').isVisible());
    await shot(shimaa.page, '13-shimaa-home-nothing-yet');

    const salma = await newPhone();
    await signIn(salma.page, SALMA.username, SALMA.password);
    assert.deepEqual(await homeTitles(salma.page), ['Mathematics'], 'the first learner\'s home lists Mathematics');
    await shot(salma.page, '14-first-learner-home-mathematics');

    const omar = await newPhone();
    await signIn(omar.page, OMAR.username, OMAR.password);
    assert.deepEqual(await homeTitles(omar.page), [], 'the second learner\'s home lists nothing');
    assert.ok(await omar.page.locator('#nothing-yet').isVisible());
    await shot(omar.page, '15-second-learner-home-nothing');
    for (const x of [hadeer, shimaa, salma, omar]) await x.ctx.close();

    for (const p of PEOPLE) for (const n of [p.stored, p.stored.slice(1)]) assert.ok(!worker.log().includes(n), `the Worker log never contains ${n}`);
  });
});
