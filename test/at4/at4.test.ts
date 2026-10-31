// AT-4 The learner sees exactly what was assigned (contract 0.3, section 3).
// Drives the real pages in Chromium, at phone width and in Arabic, against the
// Worker running locally (Wrangler + workerd, local D1 and R2). The owner part
// goes through the real owner pages; learners, the group, the subject and its
// five materials (real PDF and PNG bytes in R2) are created through the
// test-only seeding route, because the admin and publisher screens are later
// tasks. Screenshots go to evidence/at-4/.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { startWorker, type RunningWorker } from '../support/worker.ts';
import { Client, setClockOffsetDays, tinyPng, utcDatePlusDays } from '../support/http.ts';
import { appointAdmin, b64, createSpace, seed, setUpOwner, signedIn, tinyPdf, type SeedResult } from '../support/seed.ts';

const EVIDENCE = fileURLToPath(new URL('../../evidence/at-4/', import.meta.url));
const SPACE = 'مدرسة مسك';
const ADMIN = { display_name: 'Amal Hassan', username: 'amal.admin', password: 'admin-first-pass', mobile: '01012345678' };
const HADEER = { username: 'hadeer', password: 'hadeer-first-pass', display_name: 'Hadeer', mobile: '01022223333', role: 'publisher' as const };
const SALMA = { username: 'salma.learner', password: 'salma-first-pass', display_name: 'Salma Adel', mobile: '01033334444', role: 'learner' as const };
const OMAR = { username: 'omar.learner', password: 'omar-first-pass', display_name: 'Omar Nabil', mobile: '01044445555', role: 'learner' as const };
const SALMA_NEW_PASSWORD = 'salma-new-pass-2026';
const VIDEO_URL = 'https://www.youtube.com/watch?v=fractions101';
const WEB_URL = 'https://example.org/fractions/adding';
const NOTE = 'Add the tops, keep the bottom: 1/4 + 2/4 = 3/4.\n<script>alert("x")</script> <b>not bold</b>';
const MATERIALS = [
  { kind: 'pdf', title: 'Worksheet (PDF)' },
  { kind: 'image', title: 'Pizza slices' },
  { kind: 'video_link', title: 'Watch: adding fractions' },
  { kind: 'link', title: 'Practice online' },
  { kind: 'note', title: 'Remember' },
] as const;
const PDF = tinyPdf('Adding fractions');
const PNG = tinyPng();

let worker: RunningWorker;
let browser: Browser;
let salmaCtx: BrowserContext;
let salma: Page;
let omarCtx: BrowserContext;
let omar: Page;
let spaceId = '';
let salmaEnd = '';
let seeded: SeedResult;
let lessonId = '';
let ids: Record<string, string> = {};
let salmaPassword = SALMA.password;
const externalRequests: { url: string; referer: string | undefined }[] = [];

const at = (path: string) => worker.url + path;
const lessonPath = () => `/s/${spaceId}/read/${lessonId}`;
const filePath = (title: string) => `/s/${spaceId}/file/${ids[title]}`;
const subjectPath = (title: string) => `/s/${spaceId}/learn/${seeded.subjects[title].id}`;

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `${EVIDENCE}${name}.png`, fullPage: true });
}

async function signIn(page: Page, username: string, password: string): Promise<void> {
  await page.goto(at('/signin'));
  await page.fill('input[name=username]', username);
  await page.fill('input[name=password]', password);
  await Promise.all([page.waitForEvent('load'), page.click('form#signin button[type=submit]')]);
}

async function signOut(page: Page): Promise<void> {
  await Promise.all([page.waitForURL(/\/signin$/), page.click('form#signout button[type=submit]')]);
}

/** A learner page offers no way to change anything: no form but sign-out (and,
 * on My account, the password form), no field, no other button, and no link to
 * an admin, publisher or owner page. */
async function assertNoEditControls(page: Page, where: string, allowedForms: string[] = ['signout']): Promise<void> {
  const forms = await page.locator('form').evaluateAll((fs) => fs.map((f) => f.id));
  assert.deepEqual(forms.filter((id) => !allowedForms.includes(id)), [], `${where}: no form but ${allowedForms.join(', ')}`);
  const stray = await page
    .locator('input, textarea, select, button, [contenteditable]')
    .evaluateAll((els, allowed) => els.filter((e) => !allowed.some((id) => e.closest(`form#${id}`))).map((e) => e.outerHTML), allowedForms);
  assert.deepEqual(stray, [], `${where}: no field or button outside the allowed forms`);
  const links = await page.locator('a[href*="/admin"], a[href*="/publish"], a[href^="/owner"], a[href*="/edit"]').count();
  assert.equal(links, 0, `${where}: no link to an admin, publisher or owner page`);
}

async function assertArabicSpacePage(page: Page, where: string): Promise<void> {
  assert.equal(await page.getAttribute('html', 'dir'), 'rtl', `${where}: right-to-left`);
  assert.equal(await page.getAttribute('html', 'lang'), 'ar', `${where}: Arabic`);
  assert.equal((await page.locator('#space-name').innerText()).trim(), SPACE, `${where}: the space's name`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 1, `${where}: fits the phone width (overflow ${overflow}px)`);
}

describe('AT-4 a learner sees exactly what was assigned', { concurrency: false }, () => {
  before(async () => {
    mkdirSync(EVIDENCE, { recursive: true });
    worker = await startWorker();
    const owner = await setUpOwner(worker.url);
    spaceId = await createSpace(owner, { name: SPACE, kit: 'school', languages: 'ar,en' });
    await appointAdmin(owner, spaceId, { ...ADMIN, valid_until: utcDatePlusDays(60) });
    salmaEnd = utcDatePlusDays(10);
    seeded = await seed(worker.url, {
      spaceId,
      grantedBy: ADMIN.username,
      people: [
        { ...HADEER, valid_until: utcDatePlusDays(60) },
        { ...SALMA, valid_until: salmaEnd },
        { ...OMAR, valid_until: utcDatePlusDays(60) },
      ],
      groups: [{ name: 'Science', members: [SALMA.username] }],
      subjects: [
        {
          title: 'Mathematics',
          publisher: HADEER.username,
          published: true,
          groups: ['Science'],
          // Stored out of order on purpose: pages must follow position.
          chapters: [
            { title: 'Decimals', position: 2, lessons: [{ title: 'Decimal places', position: 1 }] },
            {
              title: 'Fractions',
              position: 1,
              lessons: [
                { title: 'Comparing fractions', position: 2 },
                {
                  title: 'Adding fractions',
                  position: 1,
                  body: 'Fractions with the same bottom number.',
                  materials: [
                    { kind: 'note', title: 'Remember', text: NOTE, position: 5 },
                    { kind: 'link', title: 'Practice online', url: WEB_URL, position: 4 },
                    { kind: 'pdf', title: 'Worksheet (PDF)', base64: b64(PDF), contentType: 'application/pdf', position: 1 },
                    { kind: 'video_link', title: 'Watch: adding fractions', url: VIDEO_URL, position: 3 },
                    { kind: 'image', title: 'Pizza slices', base64: b64(PNG), contentType: 'image/png', position: 2 },
                  ],
                },
              ],
            },
          ],
        },
        { title: 'Geometry', publisher: HADEER.username, published: true, users: [SALMA.username] },
        { title: 'Algebra', publisher: HADEER.username, published: false, groups: ['Science'] },
        { title: 'Physics', publisher: HADEER.username, published: true },
      ],
    });
    const lesson = seeded.subjects.Mathematics.chapters.Fractions.lessons['Adding fractions'];
    lessonId = lesson.id;
    ids = lesson.materials;

    browser = await chromium.launch();
    salmaCtx = await browser.newContext({ locale: 'ar-EG', viewport: { width: 412, height: 915 } });
    omarCtx = await browser.newContext({ locale: 'ar-EG', viewport: { width: 412, height: 915 } });
    for (const ctx of [salmaCtx, omarCtx]) {
      ctx.setDefaultTimeout(15_000);
      // The two outside addresses are answered locally, so the test needs no network.
      for (const prefix of ['https://www.youtube.com/', 'https://example.org/']) {
        await ctx.route(`${prefix}**`, (route) => {
          externalRequests.push({ url: route.request().url(), referer: route.request().headers()['referer'] });
          return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>outside</title><p>outside page</p>' });
        });
      }
    }
    salma = await salmaCtx.newPage();
    omar = await omarCtx.newPage();
  });

  after(async () => {
    if (worker) await setClockOffsetDays(worker.url, 0).catch(() => undefined);
    await browser?.close();
    await worker?.stop();
  });

  it('AT-4.1 the first learner signs in and the home lists exactly the published subjects assigned to them, directly or through the group', async () => {
    await signIn(salma, SALMA.username, SALMA.password);
    assert.ok(salma.url().endsWith(`/s/${spaceId}`), `the learner lands in the space, got ${salma.url()}`);
    await assertArabicSpacePage(salma, 'learner home');
    assert.equal(await salma.locator('#concepts').count(), 0, 'not the admin home');
    const titles = await salma.locator('#my-list a').allInnerTexts();
    assert.deepEqual(titles.map((s) => s.trim()), ['Geometry', 'Mathematics'], 'Mathematics (through Science) and Geometry (directly); not Algebra (unpublished) or Physics (not assigned)');
    await assertNoEditControls(salma, 'learner home');
    await shot(salma, '01-first-learner-home');
  });

  it('AT-4.2 the first learner changes their own password; other sign-ins end; the new password works and the old one is refused', async () => {
    const other = await signedIn(worker.url, SALMA.username, SALMA.password);
    assert.equal((await other.get(`/s/${spaceId}`)).status, 200, 'a second sign-in works before the change');

    await Promise.all([salma.waitForEvent('load'), salma.click('a#nav-account')]);
    assert.match(salma.url(), /\/account$/);
    assert.equal(await salma.getAttribute('html', 'dir'), 'rtl', 'My account is right-to-left');
    assert.equal(await salma.getAttribute('html', 'lang'), 'ar', 'My account is in the space\'s first language');
    await assertNoEditControls(salma, 'my account', ['signout', 'change-password']);
    await shot(salma, '02-my-account');

    // The current password is required.
    await salma.fill('input[name=current_password]', 'not-my-password');
    await salma.fill('input[name=new_password]', SALMA_NEW_PASSWORD);
    await Promise.all([salma.waitForEvent('load'), salma.click('form#change-password button[type=submit]')]);
    await salma.locator('#error').waitFor({ state: 'visible' });
    assert.equal((await new Client(worker.url).post('/signin', { username: SALMA.username, password: SALMA_NEW_PASSWORD })).status, 401, 'nothing changed after a wrong current password');

    // A new password shorter than 8 characters is refused.
    await salma.fill('input[name=current_password]', SALMA.password);
    await salma.fill('input[name=new_password]', 'short');
    await salma.evaluate(() => document.querySelector('input[name=new_password]')?.removeAttribute('minlength'));
    await Promise.all([salma.waitForEvent('load'), salma.click('form#change-password button[type=submit]')]);
    await salma.locator('#error').waitFor({ state: 'visible' });

    await salma.fill('input[name=current_password]', SALMA.password);
    await salma.fill('input[name=new_password]', SALMA_NEW_PASSWORD);
    await Promise.all([salma.waitForEvent('load'), salma.click('form#change-password button[type=submit]')]);
    await salma.locator('#done').waitFor({ state: 'visible' });
    salmaPassword = SALMA_NEW_PASSWORD;
    await shot(salma, '03-password-changed');

    const otherAfter = await other.get(`/s/${spaceId}`);
    assert.equal(otherAfter.status, 302, 'the other sign-in has ended');
    assert.match(otherAfter.headers.get('location') ?? '', /\/signin$/);
    assert.equal((await new Client(worker.url).post('/signin', { username: SALMA.username, password: SALMA.password })).status, 401, 'the old password is refused');
    const users = await worker.sql(`SELECT password_hash FROM user WHERE username = '${SALMA.username}'`);
    assert.match(String(users[0].password_hash), /^pbkdf2-sha256\$100000\$/, 'stored as a hash');

    await signOut(salma);
    await signIn(salma, SALMA.username, SALMA_NEW_PASSWORD);
    assert.ok(salma.url().endsWith(`/s/${spaceId}`), 'signs in again with the new password');
  });

  it('AT-4.3 the first learner opens Mathematics, Fractions, Adding fractions: chapters, lessons and materials in order', async () => {
    await Promise.all([salma.waitForEvent('load'), salma.locator('#my-list a', { hasText: 'Mathematics' }).click()]);
    assert.ok(salma.url().endsWith(subjectPath('Mathematics')), `subject page, got ${salma.url()}`);
    await assertArabicSpacePage(salma, 'subject page');
    const chapters = await salma.locator('#outline [data-chapter] .title').allInnerTexts();
    assert.deepEqual(chapters.map((s) => s.trim()), ['Fractions', 'Decimals'], 'chapters in order');
    assert.ok((await salma.locator('#outline').innerText()).includes('وحدة'), 'the kit\'s chapter label');
    const lessons = await salma.locator('#outline [data-chapter]').first().locator('a[data-lesson]').allInnerTexts();
    assert.deepEqual(lessons.map((s) => s.trim()), ['Adding fractions', 'Comparing fractions'], 'lessons in order');
    await assertNoEditControls(salma, 'subject page');
    await shot(salma, '04-subject-mathematics');

    await Promise.all([salma.waitForEvent('load'), salma.locator('a[data-lesson]', { hasText: 'Adding fractions' }).click()]);
    assert.ok(salma.url().endsWith(lessonPath()), `lesson page, got ${salma.url()}`);
    await assertArabicSpacePage(salma, 'lesson page');
    const trail = await salma.locator('#trail').innerText();
    for (const word of ['مادّة', 'وحدة', 'درس', 'Mathematics', 'Fractions']) assert.ok(trail.includes(word), `trail shows ${word}`);
    assert.equal((await salma.locator('h1#lesson-title').innerText()).trim(), 'Adding fractions');
    const kinds = await salma.locator('#items > li').evaluateAll((els) => els.map((e) => e.getAttribute('data-kind')));
    assert.deepEqual(kinds, MATERIALS.map((m) => m.kind), 'five materials in order: PDF, image, video link, web link, note');
    const titles = await salma.locator('#items > li .title').allInnerTexts();
    assert.deepEqual(titles.map((s) => s.trim()), MATERIALS.map((m) => m.title));
    await assertNoEditControls(salma, 'lesson page');
    await shot(salma, '05-lesson-adding-fractions');
  });

  it('AT-4.4 the first learner opens all five materials: PDF and image from our storage, the two links in a new tab, the note as plain text', async () => {
    // PDF: served through the Worker after the access check, never cached without asking.
    const pdfLink = salma.locator('#items > li[data-kind=pdf] a.open');
    assert.equal(await pdfLink.getAttribute('href'), filePath('Worksheet (PDF)'));
    const pdf = await salma.request.get(at(filePath('Worksheet (PDF)')));
    assert.equal(pdf.status(), 200);
    assert.equal(pdf.headers()['content-type'], 'application/pdf');
    assert.equal(pdf.headers()['x-content-type-options'], 'nosniff');
    assert.match(pdf.headers()['cache-control'] ?? '', /no-cache/);
    assert.deepEqual(new Uint8Array(await pdf.body()), PDF, 'the stored PDF bytes');

    // Image: shown on the page and served the same way.
    const img = salma.locator('#items > li[data-kind=image] img');
    assert.equal(await img.getAttribute('src'), filePath('Pizza slices'));
    assert.ok(await img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth === 16), 'the image loads');
    const image = await salma.request.get(at(filePath('Pizza slices')));
    assert.equal(image.status(), 200);
    assert.equal(image.headers()['content-type'], 'image/png');
    assert.equal(image.headers()['x-content-type-options'], 'nosniff');
    assert.match(image.headers()['cache-control'] ?? '', /no-cache/);
    assert.deepEqual(new Uint8Array(await image.body()), PNG, 'the stored image bytes');

    // Video link and web link: a new tab, with no way back to our page.
    for (const [kind, url] of [['video_link', VIDEO_URL], ['link', WEB_URL]] as const) {
      const link = salma.locator(`#items > li[data-kind=${kind}] a.open`);
      assert.equal(await link.getAttribute('href'), url);
      assert.equal(await link.getAttribute('target'), '_blank');
      assert.equal(await link.getAttribute('rel'), 'noopener noreferrer');
      const [popup] = await Promise.all([salma.waitForEvent('popup'), link.click()]);
      await popup.waitForLoadState();
      assert.equal(popup.url(), url, `${kind} opens its address`);
      assert.equal(await popup.evaluate(() => window.opener), null, `${kind}: no opener`);
      await popup.close();
    }
    for (const url of [VIDEO_URL, WEB_URL]) {
      const req = externalRequests.find((r) => r.url === url);
      assert.ok(req, `${url} was opened`);
      assert.equal(req.referer, undefined, 'no referrer is sent');
    }
    assert.ok(salma.url().endsWith(lessonPath()), 'the lesson stays open in its own tab');

    // Note: plain text, markup shown as typed and never run.
    const note = salma.locator('#items > li[data-kind=note] .note');
    assert.equal(await note.innerText(), NOTE);
    assert.equal(await note.locator('script, b').count(), 0, 'markup in a note is not markup');
    assert.ok((await salma.content()).includes('&lt;script&gt;alert'), 'escaped in the page');

    await assertNoEditControls(salma, 'lesson page');
    await salma.locator('#items > li[data-kind=note]').scrollIntoViewIfNeeded();
    await shot(salma, '06-lesson-materials-opened');
    await salma.goto(at(filePath('Pizza slices')));
    await shot(salma, '07-image-from-storage');
  });

  it('AT-4.5 the second learner (same space, not assigned) sees nothing and is refused on the lesson and the PDF addresses', async () => {
    await signIn(omar, OMAR.username, OMAR.password);
    assert.ok(omar.url().endsWith(`/s/${spaceId}`), `the second learner lands in the space, got ${omar.url()}`);
    await assertArabicSpacePage(omar, 'second learner home');
    assert.equal(await omar.locator('#concepts').count(), 0, 'not the admin home');
    assert.equal(await omar.locator('#my-list a').count(), 0, 'nothing is listed');
    await omar.locator('#nothing-yet').waitFor({ state: 'visible' });
    await assertNoEditControls(omar, 'second learner home');
    await shot(omar, '08-second-learner-home-empty');

    const refusal = 'ليس لديك صلاحية للوصول إلى هذه الصفحة.';
    for (const [name, path] of [
      ['lesson', lessonPath()],
      ['PDF', filePath('Worksheet (PDF)')],
      ['image', filePath('Pizza slices')],
      ['subject', subjectPath('Mathematics')],
    ] as const) {
      const res = await omar.goto(at(path));
      assert.equal(res?.status(), 403, `${name} address refused with 403`);
      assert.equal((await omar.locator('p.message').innerText()).trim(), refusal, `${name}: the plain refusal`);
      assert.ok(!(await omar.content()).includes('Adding fractions'), `${name}: nothing of the lesson leaks`);
      await assertNoEditControls(omar, `second learner on the ${name} address`);
      if (name === 'lesson') await shot(omar, '09-second-learner-lesson-refused');
      if (name === 'PDF') await shot(omar, '10-second-learner-pdf-refused');
    }
    const c = await signedIn(worker.url, OMAR.username, OMAR.password);
    const direct = await c.get(filePath('Worksheet (PDF)'));
    assert.equal(direct.status, 403);
    assert.ok(!(await direct.text()).startsWith('%PDF'), 'no PDF bytes');
  });

  it('AT-4.6 role gating: a learner never gets the admin home or any admin, publisher or owner address', async () => {
    const learner = await signedIn(worker.url, SALMA.username, salmaPassword);
    const home = await learner.get(`/s/${spaceId}`);
    assert.equal(home.status, 200);
    assert.ok(!(await home.text()).includes('id="concepts"'), 'the space home is the learner home, not the admin home');
    for (const path of [`/s/${spaceId}/admin`, `/s/${spaceId}/admin/people`, `/s/${spaceId}/admin/subjects/x`, `/s/${spaceId}/publish`, `/s/${spaceId}/publish/x`, '/owner', '/owner/spaces/new']) {
      const res = await learner.get(path);
      assert.equal(res.status, 403, `${path} refused with 403 for a learner`);
    }
    // Assigned and published only: an unpublished or unassigned subject is refused by direct address.
    for (const title of ['Algebra', 'Physics']) {
      assert.equal((await learner.get(subjectPath(title))).status, 403, `${title} refused`);
    }

    // The gate is by role, not a blanket refusal: the admin and the publisher get theirs.
    const admin = await signedIn(worker.url, ADMIN.username, ADMIN.password);
    const adminHome = await admin.get(`/s/${spaceId}`);
    assert.equal(adminHome.status, 200);
    assert.ok((await adminHome.text()).includes('id="concepts"'), 'the admin gets the admin home');
    assert.equal((await admin.get(`/s/${spaceId}/admin`)).status, 200);
    assert.equal((await admin.get(`/s/${spaceId}/publish`)).status, 403, 'an admin is not a publisher');
    const publisher = await signedIn(worker.url, HADEER.username, HADEER.password);
    assert.equal((await publisher.get(`/s/${spaceId}/publish`)).status, 200, 'the publisher gets the publisher home');
    assert.equal((await publisher.get(`/s/${spaceId}/admin`)).status, 403, 'a publisher is not an admin');
    const pubHome = await (await publisher.get(`/s/${spaceId}`)).text();
    assert.ok(!pubHome.includes('id="concepts"'), 'a publisher does not get the admin home');
  });

  it('AT-4.7 after the first learner\'s end date: "access ended … Contact the مدير", and the lesson and PDF addresses are refused with the same message', async () => {
    assert.equal((await setClockOffsetDays(worker.url, 11)).status, 200);
    await salmaCtx.clearCookies();
    await signIn(salma, SALMA.username, salmaPassword);
    assert.ok(salma.url().endsWith(`/s/${spaceId}`), 'the learner can still sign in');
    const arabic = `انتهى وصولك إلى ${SPACE} في ${salmaEnd}. تواصل مع مدير.`;
    const english = `Your access to ${SPACE} ended on ${salmaEnd}. Contact the Administrator.`;
    assert.equal((await salma.locator('#access-ended').innerText()).trim(), arabic, 'in the space\'s first language, contact = the kit\'s admin label');
    assert.equal((await salma.locator('#access-ended-alt').innerText()).trim(), english, 'and in its second language');
    assert.equal(await salma.getAttribute('html', 'dir'), 'rtl');
    assert.equal(await salma.locator('#my-list').count(), 0, 'no subjects shown');
    await assertNoEditControls(salma, 'access ended');
    await shot(salma, '11-first-learner-access-ended');

    for (const [name, path] of [['lesson', lessonPath()], ['PDF', filePath('Worksheet (PDF)')], ['subject', subjectPath('Mathematics')]] as const) {
      const res = await salma.goto(at(path));
      assert.equal(res?.status(), 403, `${name} refused with 403`);
      assert.equal((await salma.locator('#access-ended').innerText()).trim(), arabic, `${name}: the same message`);
      if (name === 'PDF') await shot(salma, '12-first-learner-pdf-after-end-date');
    }
    const c = await signedIn(worker.url, SALMA.username, salmaPassword);
    const pdf = await c.get(filePath('Worksheet (PDF)'));
    assert.equal(pdf.status, 403);
    const words = (await pdf.text()).replace(/<[^>]*>/g, '');
    assert.ok(words.includes(arabic), 'the PDF address answers with the same message');
  });
});
