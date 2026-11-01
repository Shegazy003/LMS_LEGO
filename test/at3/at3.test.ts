// AT-3 The publisher builds the subject (contract 0.3, section 3).
// Drives the real publisher pages in Chromium, at phone width and in Arabic,
// against the Worker running locally (Wrangler + workerd, local D1 and R2).
// Only what exists before Hadeer starts is seeded: the owner part goes through
// the real owner pages; the people, the group "Science" and the empty subject
// "Mathematics" assigned to Hadeer come from the test seeding route, because
// the admin screens are task 4. Everything Hadeer does (chapter, lesson, five
// materials, refused uploads, publish, unpublish, reorder) goes through her
// real pages in a real browser. Screenshots go to evidence/at-3/.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { startWorker, type RunningWorker } from '../support/worker.ts';
import { Client, tinyPng, utcDatePlusDays } from '../support/http.ts';
import { appointAdmin, createSpace, seed, setUpOwner, signedIn, tinyPdf, type SeedResult } from '../support/seed.ts';

const EVIDENCE = fileURLToPath(new URL('../../evidence/at-3/', import.meta.url));
const SPACE = 'مدرسة مسك';
const ADMIN = { display_name: 'Amal Hassan', username: 'amal.admin', password: 'admin-first-pass', mobile: '01012345678' };
const ADMIN_B = { display_name: 'Basem Fawzy', username: 'basem.admin', password: 'admin-b-pass', mobile: '01087654321' };
const HADEER = { username: 'hadeer', password: 'hadeer-first-pass', display_name: 'Hadeer', mobile: '01022223333', role: 'publisher' as const };
const SHIMAA = { username: 'shimaa', password: 'shimaa-first-pass', display_name: 'Shimaa', mobile: '01066667777', role: 'publisher' as const };
const NOUR = { username: 'nour.old', password: 'nour-first-pass', display_name: 'Nour', mobile: '01077778888', role: 'publisher' as const };
const SALMA = { username: 'salma.learner', password: 'salma-first-pass', display_name: 'Salma Adel', mobile: '01033334444', role: 'learner' as const };
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
const MAX_UPLOAD = 25 * 1024 * 1024;

// The plain messages, in the space's first language (Arabic).
const REFUSED_TYPE = 'لا يمكن إضافة هذا الملف. يمكن رفع ملف PDF أو صورة (PNG أو JPEG أو WebP أو GIF) فقط.';
const REFUSED_SIZE = 'لا يمكن إضافة هذا الملف. الحد الأقصى لحجم الملف 25 ميغابايت.';
const REFUSED_LINK = 'لا يمكن إضافة هذا الرابط. اكتب رابطاً كاملاً يبدأ بـ http:// أو https://.';
const NO_ACCESS = 'ليس لديك صلاحية للوصول إلى هذه الصفحة.';

let worker: RunningWorker;
let browser: Browser;
let hadeerCtx: BrowserContext;
let hadeer: Page;
let salmaCtx: BrowserContext;
let salma: Page;
let owner: Client;
let spaceA = '';
let spaceB = '';
let seededA: SeedResult;
let seededB: SeedResult;
// Ids of what Hadeer creates, read back from the database after she creates them.
const made = { chapter: '', lesson: '', materials: [] as string[] };
const externalRequests: string[] = [];

const at = (path: string) => worker.url + path;
const mathId = () => seededA.subjects.Mathematics.id;
const editorPath = (subjectId = mathId()) => `/s/${spaceA}/publish/edit/${subjectId}`;
const lessonEditorPath = () => `/s/${spaceA}/publish/compose/${made.lesson}`;
const readPath = () => `/s/${spaceA}/read/${made.lesson}`;

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `${EVIDENCE}${name}.png`, fullPage: true });
}

async function signIn(page: Page, username: string, password: string): Promise<void> {
  await page.goto(at('/signin'));
  await page.fill('input[name=username]', username);
  await page.fill('input[name=password]', password);
  await Promise.all([page.waitForEvent('load'), page.click('form#signin button[type=submit]')]);
}

/** Submits a form the way a person does (its own button) and returns the
 * status of the form's own response (before any redirect). */
async function submit(page: Page, form: string, button = 'button[type=submit]'): Promise<number> {
  const [res] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === 'POST' && r.request().frame() === page.mainFrame()),
    page.waitForEvent('load'),
    page.locator(form).locator(button).click(),
  ]);
  return res.status();
}

async function assertArabicSpacePage(page: Page, where: string): Promise<void> {
  assert.equal(await page.getAttribute('html', 'dir'), 'rtl', `${where}: right-to-left`);
  assert.equal(await page.getAttribute('html', 'lang'), 'ar', `${where}: Arabic`);
  assert.equal((await page.locator('#space-name').innerText()).trim(), SPACE, `${where}: the space's name`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 1, `${where}: fits the phone width (overflow ${overflow}px)`);
}

async function kindsOn(page: Page): Promise<string[]> {
  return page.locator('#items > li').evaluateAll((els) => els.map((e) => e.getAttribute('data-kind') ?? ''));
}

async function titles(page: Page, selector: string): Promise<string[]> {
  return (await page.locator(selector).allInnerTexts()).map((s) => s.trim());
}

function usageFrom(html: string, kind: string): number {
  const m = html.match(new RegExp(`data-usage="${kind}"[^>]*data-value="(\\d+)"`));
  assert.ok(m, `usage line "${kind}" present`);
  return Number(m[1]);
}

/** Bytes stored in R2 for the whole product, as the owner's usage panel reads them. */
async function storedBytes(): Promise<number> {
  return usageFrom(await (await owner.get('/owner')).text(), 'storage');
}

/** Everything under one subject, as one comparable string. */
async function fingerprint(subjectId: string): Promise<string> {
  const rows = await worker.sql(`SELECT x FROM (
      SELECT 's|' || is_published || '|' || title AS x FROM subject WHERE id = '${subjectId}'
      UNION ALL SELECT 'c|' || id || '|' || position || '|' || title FROM chapter WHERE subject_id = '${subjectId}'
      UNION ALL SELECT 'l|' || l.id || '|' || l.position || '|' || l.title FROM lesson l JOIN chapter c ON c.id = l.chapter_id WHERE c.subject_id = '${subjectId}'
      UNION ALL SELECT 'm|' || m.id || '|' || m.position || '|' || m.kind || '|' || m.title FROM material m JOIN lesson l ON l.id = m.lesson_id JOIN chapter c ON c.id = l.chapter_id WHERE c.subject_id = '${subjectId}'
    ) ORDER BY x`);
  return rows.map((r) => String(r.x)).join('\n');
}

async function materialCount(lessonId: string): Promise<number> {
  const rows = await worker.sql(`SELECT COUNT(*) AS n FROM material WHERE lesson_id = '${lessonId}'`);
  return Number(rows[0].n);
}

function fileForm(title: string, bytes: Uint8Array, name: string, type: string): FormData {
  const f = new FormData();
  f.set('kind', 'file');
  f.set('title', title);
  f.set('file', new Blob([bytes], { type }), name);
  return f;
}

/** Every editing action on one subject, by direct address: each a fresh body. */
function editingActions(space: string, ids: { subject: string; chapter: string; lesson: string; material: string }) {
  const p = `/s/${space}/publish`;
  return [
    [`${p}/edit/${ids.subject}/add`, () => ({ title: 'Forged chapter' })],
    [`${p}/edit/${ids.subject}/publish`, () => ({})],
    [`${p}/edit/${ids.subject}/unpublish`, () => ({})],
    [`${p}/part/${ids.chapter}/add`, () => ({ title: 'Forged lesson' })],
    [`${p}/part/${ids.chapter}/move`, () => ({ direction: 'up' })],
    [`${p}/part/${ids.chapter}/move`, () => ({ direction: 'down' })],
    [`${p}/compose/${ids.lesson}/move`, () => ({ direction: 'down' })],
    [`${p}/compose/${ids.lesson}/add`, () => fileForm('Forged PDF', PDF, 'forged.pdf', 'application/pdf')],
    [`${p}/compose/${ids.lesson}/add`, () => ({ kind: 'video_link', title: 'Forged video', url: VIDEO_URL })],
    [`${p}/compose/${ids.lesson}/add`, () => ({ kind: 'link', title: 'Forged link', url: WEB_URL })],
    [`${p}/compose/${ids.lesson}/add`, () => ({ kind: 'note', title: 'Forged note', text: 'forged' })],
    [`${p}/item/${ids.material}/move`, () => ({ direction: 'up' })],
  ] as const;
}

describe('AT-3 the publisher builds the subject', { concurrency: false }, () => {
  before(async () => {
    mkdirSync(EVIDENCE, { recursive: true });
    worker = await startWorker();
    owner = await setUpOwner(worker.url);
    spaceA = await createSpace(owner, { name: SPACE, kit: 'school', languages: 'ar,en' });
    spaceB = await createSpace(owner, { name: 'Delta Logistics', kit: 'company', languages: 'en,ar' });
    await appointAdmin(owner, spaceA, { ...ADMIN, valid_until: utcDatePlusDays(60) });
    await appointAdmin(owner, spaceB, { ...ADMIN_B, valid_until: utcDatePlusDays(60) });
    seededA = await seed(worker.url, {
      spaceId: spaceA,
      grantedBy: ADMIN.username,
      people: [
        { ...HADEER, valid_until: utcDatePlusDays(60) },
        { ...SHIMAA, valid_until: utcDatePlusDays(60) },
        { ...NOUR, valid_until: utcDatePlusDays(-1) }, // an expired publisher
        { ...SALMA, valid_until: utcDatePlusDays(60) },
      ],
      groups: [{ name: 'Science', members: [SALMA.username] }],
      subjects: [
        // As the admin will leave it in task 4: assigned, empty, not published.
        { title: 'Mathematics', publisher: HADEER.username, published: false, groups: ['Science'] },
        { title: 'Physics', publisher: SHIMAA.username, published: false, groups: ['Science'] },
        { title: 'Chemistry', publisher: NOUR.username, published: false, groups: ['Science'] },
      ],
    });
    // Another space's subject naming Hadeer as its publisher: only the space
    // boundary can keep her out of it.
    seededB = await seed(worker.url, {
      spaceId: spaceB,
      grantedBy: ADMIN_B.username,
      subjects: [{
        title: 'Forklift safety', publisher: HADEER.username, published: false,
        chapters: [{ title: 'Loading dock', lessons: [{ title: 'Pallet rules', materials: [{ kind: 'note', title: 'B note', text: 'B only' }] }] }],
      }],
    });

    browser = await chromium.launch();
    hadeerCtx = await browser.newContext({ locale: 'ar-EG', viewport: { width: 412, height: 915 } });
    salmaCtx = await browser.newContext({ locale: 'ar-EG', viewport: { width: 412, height: 915 } });
    for (const ctx of [hadeerCtx, salmaCtx]) {
      ctx.setDefaultTimeout(15_000);
      // The two outside addresses are answered locally, so the test needs no network.
      for (const prefix of ['https://www.youtube.com/', 'https://example.org/']) {
        await ctx.route(`${prefix}**`, (route) => {
          externalRequests.push(route.request().url());
          return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>outside</title><p>outside page</p>' });
        });
      }
    }
    hadeer = await hadeerCtx.newPage();
    salma = await salmaCtx.newPage();
  });

  after(async () => {
    await browser?.close();
    await worker?.stop();
  });

  it('AT-3.1 Hadeer signs in and her home lists exactly her own subjects, each with a way into its editor', async () => {
    await signIn(hadeer, HADEER.username, HADEER.password);
    assert.ok(hadeer.url().endsWith(`/s/${spaceA}`), `Hadeer lands in the space, got ${hadeer.url()}`);
    await assertArabicSpacePage(hadeer, 'publisher home');
    assert.deepEqual(await titles(hadeer, '#publisher-list > li bdi'), ['Mathematics'], 'only Mathematics: not Shimaa\'s Physics, not Chemistry');
    const edit = hadeer.locator('#publisher-list > li a.edit');
    assert.equal(await edit.count(), 1);
    assert.equal(await edit.getAttribute('href'), editorPath(), 'the way in is the subject editor');
    await shot(hadeer, '01-hadeer-home-her-subjects');
  });

  it('AT-3.2 Hadeer opens Mathematics and adds the chapter "Fractions" and the lesson "Adding fractions"', async () => {
    await Promise.all([hadeer.waitForEvent('load'), hadeer.locator('#publisher-list a.edit').click()]);
    assert.ok(hadeer.url().endsWith(editorPath()), `subject editor, got ${hadeer.url()}`);
    await assertArabicSpacePage(hadeer, 'subject editor');
    assert.equal((await hadeer.locator('h1#subject-title').innerText()).trim(), 'Mathematics');
    assert.equal(await hadeer.getAttribute('#publish-state', 'data-published'), '0', 'not published yet');
    assert.equal(await hadeer.locator('form#publish').count(), 1, 'a publish button');
    const page = await hadeer.locator('main').innerText();
    for (const word of ['وحدة', 'درس']) assert.ok(page.includes(word), `the editor uses the kit's word ${word}`);
    await shot(hadeer, '02-subject-editor-empty');

    await hadeer.fill('form#add-chapter input[name=title]', 'Fractions');
    assert.equal(await submit(hadeer, 'form#add-chapter'), 303, 'chapter added, then back to the editor');
    assert.ok(hadeer.url().includes(editorPath()), 'back on the subject editor');
    assert.deepEqual(await titles(hadeer, '#outline [data-chapter] .title'), ['Fractions']);

    const chapter = hadeer.locator('#outline [data-chapter]').first();
    await chapter.locator('form.add-lesson input[name=title]').fill('Adding fractions');
    assert.equal(await submit(hadeer, '#outline [data-chapter] >> nth=0 >> form.add-lesson'), 303, 'lesson added');
    assert.deepEqual(await titles(hadeer, '#outline [data-chapter] a[data-lesson]'), ['Adding fractions']);
    await assertArabicSpacePage(hadeer, 'subject editor with a chapter and a lesson');
    await shot(hadeer, '03-chapter-and-lesson-added');

    const rows = await worker.sql(`SELECT c.id AS chapter, c.space_id AS cs, c.position AS cp, l.id AS lesson, l.space_id AS ls, l.position AS lp
      FROM chapter c JOIN lesson l ON l.chapter_id = c.id WHERE c.subject_id = '${mathId()}'`);
    assert.equal(rows.length, 1, 'one chapter with one lesson stored');
    assert.equal(rows[0].cs, spaceA, 'the chapter belongs to the space');
    assert.equal(rows[0].ls, spaceA, 'the lesson belongs to the space');
    assert.equal(Number(rows[0].cp), 1);
    assert.equal(Number(rows[0].lp), 1);
    made.chapter = String(rows[0].chapter);
    made.lesson = String(rows[0].lesson);
  });

  it('AT-3.3 a file that is not a PDF or an image is refused with a plain message, by its content, and nothing is created', async () => {
    await Promise.all([hadeer.waitForEvent('load'), hadeer.locator('a[data-lesson]', { hasText: 'Adding fractions' }).click()]);
    assert.ok(hadeer.url().endsWith(lessonEditorPath()), `lesson editor, got ${hadeer.url()}`);
    await assertArabicSpacePage(hadeer, 'lesson editor');
    assert.equal((await hadeer.locator('h1#lesson-title').innerText()).trim(), 'Adding fractions');
    const before = await storedBytes();

    // Named and declared as a PDF or a PNG, but the content is text, a web page or an SVG drawing.
    const fakes = [
      { name: 'worksheet.pdf', mimeType: 'application/pdf', text: 'This is plain text pretending to be a PDF.' },
      { name: 'page.png', mimeType: 'image/png', text: '<!doctype html><html><body><script>alert(1)</script></body></html>' },
      { name: 'drawing.svg', mimeType: 'image/svg+xml', text: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>' },
    ];
    for (const [i, fake] of fakes.entries()) {
      await hadeer.fill('form#add-file input[name=title]', `Refused ${fake.name}`);
      await hadeer.setInputFiles('form#add-file input[name=file]', { name: fake.name, mimeType: fake.mimeType, buffer: Buffer.from(fake.text) });
      assert.equal(await submit(hadeer, 'form#add-file'), 400, `${fake.name} refused`);
      assert.equal((await hadeer.locator('#error').innerText()).trim(), REFUSED_TYPE, `${fake.name}: the plain message in Arabic`);
      await assertArabicSpacePage(hadeer, 'lesson editor with a refusal');
      if (i === 0) await shot(hadeer, '04-refused-upload-plain-message');
    }

    // Larger than 25 MB, even with a PDF's first bytes.
    const big = new Uint8Array(MAX_UPLOAD + 1);
    big.set(new TextEncoder().encode('%PDF-1.4\n'));
    const hadeerHttp = await signedIn(worker.url, HADEER.username, HADEER.password);
    const tooBig = await hadeerHttp.post(`/s/${spaceA}/publish/compose/${made.lesson}/add`, fileForm('Too big', big, 'big.pdf', 'application/pdf'));
    assert.equal(tooBig.status, 413, 'a file over 25 MB is refused');
    assert.ok((await tooBig.text()).includes(REFUSED_SIZE), 'with the plain size message in Arabic');

    // Video and web links accept only http and https.
    for (const [form, url] of [['form#add-video', 'javascript:alert(1)'], ['form#add-link', 'ftp://example.org/fractions']] as const) {
      await hadeer.fill(`${form} input[name=title]`, 'Refused link');
      await hadeer.fill(`${form} input[name=url]`, url);
      assert.equal(await submit(hadeer, form), 400, `${url} refused`);
      assert.equal((await hadeer.locator('#error').innerText()).trim(), REFUSED_LINK, `${url}: the plain message`);
    }

    assert.equal(await materialCount(made.lesson), 0, 'no material was created');
    assert.equal(await hadeer.locator('#items > li').count(), 0, 'nothing is listed');
    assert.equal(await storedBytes(), before, 'nothing was stored');
  });

  it('AT-3.4 Hadeer attaches a PDF, an image, a video link, a web link and a note; they are listed in that order', async () => {
    await hadeer.goto(at(lessonEditorPath()));
    await hadeer.fill('form#add-file input[name=title]', MATERIALS[0].title);
    await hadeer.setInputFiles('form#add-file input[name=file]', { name: 'worksheet.pdf', mimeType: 'application/pdf', buffer: Buffer.from(PDF) });
    assert.equal(await submit(hadeer, 'form#add-file'), 303, 'PDF added');

    await hadeer.fill('form#add-file input[name=title]', MATERIALS[1].title);
    await hadeer.setInputFiles('form#add-file input[name=file]', { name: 'pizza.png', mimeType: 'image/png', buffer: Buffer.from(PNG) });
    assert.equal(await submit(hadeer, 'form#add-file'), 303, 'image added');

    await hadeer.fill('form#add-video input[name=title]', MATERIALS[2].title);
    await hadeer.fill('form#add-video input[name=url]', VIDEO_URL);
    assert.equal(await submit(hadeer, 'form#add-video'), 303, 'video link added');

    await hadeer.fill('form#add-link input[name=title]', MATERIALS[3].title);
    await hadeer.fill('form#add-link input[name=url]', WEB_URL);
    assert.equal(await submit(hadeer, 'form#add-link'), 303, 'web link added');

    await hadeer.fill('form#add-note input[name=title]', MATERIALS[4].title);
    await hadeer.fill('form#add-note textarea[name=text]', NOTE);
    assert.equal(await submit(hadeer, 'form#add-note'), 303, 'note added');

    assert.ok(hadeer.url().includes(lessonEditorPath()), 'back on the lesson editor');
    assert.deepEqual(await kindsOn(hadeer), MATERIALS.map((m) => m.kind), 'five materials in order');
    assert.deepEqual(await titles(hadeer, '#items > li .title'), MATERIALS.map((m) => m.title));
    const note = hadeer.locator('#items > li[data-kind=note] .note');
    assert.equal(await note.innerText(), NOTE, 'the note as typed');
    assert.equal(await note.locator('script, b').count(), 0, 'markup in a note is not markup');
    await assertArabicSpacePage(hadeer, 'lesson editor with five materials');
    await shot(hadeer, '05-five-materials-attached');

    const rows = await worker.sql(`SELECT id, kind, position, space_id, storage_key, url, note_text FROM material WHERE lesson_id = '${made.lesson}' ORDER BY position`);
    assert.deepEqual(rows.map((r) => r.kind), MATERIALS.map((m) => m.kind));
    assert.deepEqual(rows.map((r) => Number(r.position)), [1, 2, 3, 4, 5], 'each new material goes last');
    for (const r of rows) assert.equal(r.space_id, spaceA, 'every material belongs to the space');
    assert.equal(rows[2].url, VIDEO_URL);
    assert.equal(rows[3].url, WEB_URL);
    assert.equal(rows[4].note_text, NOTE, 'stored as text');
    made.materials = rows.map((r) => String(r.id));
    for (const r of rows.slice(0, 2)) assert.ok(String(r.storage_key).startsWith(`spaces/${spaceA}/`), 'files are stored under the space');

    // The two files are in our storage, with the type found in their content.
    const pdf = await hadeerCtx.request.get(at(`/s/${spaceA}/file/${made.materials[0]}`));
    assert.equal(pdf.status(), 200);
    assert.equal(pdf.headers()['content-type'], 'application/pdf');
    assert.deepEqual(new Uint8Array(await pdf.body()), PDF, 'the uploaded PDF bytes');
    const png = await hadeerCtx.request.get(at(`/s/${spaceA}/file/${made.materials[1]}`));
    assert.equal(png.status(), 200);
    assert.equal(png.headers()['content-type'], 'image/png');
    assert.deepEqual(new Uint8Array(await png.body()), PNG, 'the uploaded image bytes');
  });

  it('AT-3.5 before publishing the assigned learner does not see the subject; after Hadeer publishes, the learner sees the five materials in order and opens each', async () => {
    await signIn(salma, SALMA.username, SALMA.password);
    assert.equal(await salma.locator('#my-list a', { hasText: 'Mathematics' }).count(), 0, 'not listed before publishing');
    await salma.locator('#nothing-yet').waitFor({ state: 'visible' });
    await shot(salma, '06-learner-before-publish');
    const early = await salma.goto(at(readPath()));
    assert.equal(early?.status(), 403, 'the lesson address is refused before publishing');

    await hadeer.goto(at(editorPath()));
    assert.equal(await submit(hadeer, 'form#publish'), 303, 'published');
    assert.equal(await hadeer.getAttribute('#publish-state', 'data-published'), '1', 'the editor shows it published');
    assert.equal(await hadeer.locator('form#unpublish').count(), 1, 'and offers to unpublish');
    await shot(hadeer, '07-subject-published');

    await salma.goto(at(`/s/${spaceA}`));
    assert.deepEqual(await titles(salma, '#my-list a'), ['Mathematics'], 'listed after publishing');
    await Promise.all([salma.waitForEvent('load'), salma.locator('#my-list a', { hasText: 'Mathematics' }).click()]);
    assert.deepEqual(await titles(salma, '#outline [data-chapter] .title'), ['Fractions']);
    await Promise.all([salma.waitForEvent('load'), salma.locator('a[data-lesson]', { hasText: 'Adding fractions' }).click()]);
    assert.ok(salma.url().endsWith(readPath()), `the lesson, got ${salma.url()}`);
    await assertArabicSpacePage(salma, 'learner lesson page');
    assert.deepEqual(await kindsOn(salma), MATERIALS.map((m) => m.kind), 'the lesson shows the five materials in order');
    assert.deepEqual(await titles(salma, '#items > li .title'), MATERIALS.map((m) => m.title));
    assert.equal(await salma.locator('iframe, embed, object, video').count(), 0, 'no third-party frame is embedded');
    await shot(salma, '08-learner-lesson-five-materials');

    // PDF and image open from our storage.
    const pdfHref = await salma.locator('#items > li[data-kind=pdf] a.open').getAttribute('href');
    assert.equal(pdfHref, `/s/${spaceA}/file/${made.materials[0]}`, 'the PDF opens from our address');
    const pdf = await salmaCtx.request.get(at(pdfHref!));
    assert.equal(pdf.status(), 200);
    assert.equal(pdf.headers()['content-type'], 'application/pdf');
    assert.deepEqual(new Uint8Array(await pdf.body()), PDF);
    const img = salma.locator('#items > li[data-kind=image] img');
    assert.equal(await img.getAttribute('src'), `/s/${spaceA}/file/${made.materials[1]}`, 'the image comes from our address');
    assert.ok(await img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth === 16), 'the image loads');

    // The video plays from its link and the web link opens, each in a new tab.
    for (const [kind, url] of [['video_link', VIDEO_URL], ['link', WEB_URL]] as const) {
      const link = salma.locator(`#items > li[data-kind=${kind}] a.open`);
      assert.equal(await link.getAttribute('href'), url);
      assert.equal(await link.getAttribute('target'), '_blank');
      assert.equal(await link.getAttribute('rel'), 'noopener noreferrer');
      const [popup] = await Promise.all([salma.waitForEvent('popup'), link.click()]);
      await popup.waitForLoadState();
      assert.equal(popup.url(), url, `${kind} opens its address in a new tab`);
      await popup.close();
    }
    assert.ok(externalRequests.includes(VIDEO_URL) && externalRequests.includes(WEB_URL), 'both outside addresses were opened');

    const note = salma.locator('#items > li[data-kind=note] .note');
    assert.equal(await note.innerText(), NOTE, 'the note as typed');
    assert.equal(await note.locator('script, b').count(), 0, 'shown escaped');

    // Clicking the PDF in the browser fetches it from our storage (headless
    // Chromium has no PDF viewer, so it arrives as a download).
    const [download] = await Promise.all([salma.waitForEvent('download'), salma.locator('#items > li[data-kind=pdf] a.open').click()]);
    assert.equal(download.url(), at(pdfHref!), 'the PDF comes from our address');
    assert.deepEqual(new Uint8Array(readFileSync(await download.path())), PDF, 'the uploaded PDF bytes');
    await salma.goto(at(`/s/${spaceA}/file/${made.materials[1]}`));
    await shot(salma, '09-learner-opens-the-image-from-storage');
  });

  it('AT-3.6 unpublishing hides the subject from the learner again', async () => {
    await hadeer.goto(at(editorPath()));
    assert.equal(await submit(hadeer, 'form#unpublish'), 303, 'unpublished');
    assert.equal(await hadeer.getAttribute('#publish-state', 'data-published'), '0');
    await salma.goto(at(`/s/${spaceA}`));
    assert.equal(await salma.locator('#my-list a', { hasText: 'Mathematics' }).count(), 0, 'no longer listed');
    for (const path of [readPath(), `/s/${spaceA}/file/${made.materials[0]}`, `/s/${spaceA}/learn/${mathId()}`]) {
      const res = await salma.goto(at(path));
      assert.equal(res?.status(), 403, `${path} refused after unpublishing`);
    }
    await shot(salma, '10-learner-after-unpublish');

    // Published again, so the subject ends as Hadeer meant it.
    await hadeer.goto(at(editorPath()));
    assert.equal(await submit(hadeer, 'form#publish'), 303, 'published again');
    await salma.goto(at(`/s/${spaceA}`));
    assert.deepEqual(await titles(salma, '#my-list a'), ['Mathematics']);
  });

  it('AT-3.7 new items go last, and Hadeer can move a chapter and a material up and down', async () => {
    await hadeer.goto(at(editorPath()));
    await hadeer.fill('form#add-chapter input[name=title]', 'Decimals');
    assert.equal(await submit(hadeer, 'form#add-chapter'), 303);
    assert.deepEqual(await titles(hadeer, '#outline [data-chapter] .title'), ['Fractions', 'Decimals'], 'the new chapter goes last');
    const decimals = '#outline [data-chapter]:nth-child(2) form.move';
    assert.equal(await submit(hadeer, decimals, 'button[value=up]'), 303);
    assert.deepEqual(await titles(hadeer, '#outline [data-chapter] .title'), ['Decimals', 'Fractions'], 'moved up');
    await shot(hadeer, '11-chapter-moved-up');
    assert.equal(await submit(hadeer, '#outline [data-chapter]:nth-child(1) form.move', 'button[value=down]'), 303);
    assert.deepEqual(await titles(hadeer, '#outline [data-chapter] .title'), ['Fractions', 'Decimals'], 'moved back down');

    await hadeer.goto(at(lessonEditorPath()));
    assert.equal(await submit(hadeer, '#items > li[data-kind=note] form.move', 'button[value=up]'), 303);
    assert.deepEqual(await kindsOn(hadeer), ['pdf', 'image', 'video_link', 'note', 'link'], 'the note moved up');
    assert.equal(await submit(hadeer, '#items > li[data-kind=note] form.move', 'button[value=down]'), 303);
    assert.deepEqual(await kindsOn(hadeer), MATERIALS.map((m) => m.kind), 'and back down');
  });

  it('AT-3.8 Shimaa, a second publisher in the same space, gets 403 on Hadeer\'s editor and on every editing action, by direct address and by forged POST', async () => {
    const ids = { subject: mathId(), chapter: made.chapter, lesson: made.lesson, material: made.materials[4] };
    const shimaa = await signedIn(worker.url, SHIMAA.username, SHIMAA.password);
    // Positive control: Shimaa edits her own subject, so the refusals below are about ownership.
    const physics = seededA.subjects.Physics.id;
    assert.equal((await shimaa.get(`/s/${spaceA}/publish/edit/${physics}`)).status, 200, 'Shimaa opens her own editor');
    assert.equal((await shimaa.post(`/s/${spaceA}/publish/edit/${physics}/add`, { title: 'Motion' })).status, 303, 'and adds a chapter to it');
    const shimaaHome = await (await shimaa.get(`/s/${spaceA}/publish`)).text();
    assert.ok(shimaaHome.includes('Physics') && !shimaaHome.includes('Mathematics'), 'Shimaa\'s home lists only her own subject');

    const fp = await fingerprint(mathId());
    const stored = await storedBytes();
    for (const path of [editorPath(), lessonEditorPath()]) {
      const res = await shimaa.get(path);
      assert.equal(res.status, 403, `GET ${path} refused`);
      const body = await res.text();
      assert.ok(body.includes(NO_ACCESS), `${path}: the plain refusal`);
      assert.ok(!body.includes('Adding fractions') && !body.includes('Worksheet'), `${path}: nothing of Hadeer's subject leaks`);
    }
    for (const [path, body] of editingActions(spaceA, ids)) {
      assert.equal((await shimaa.post(path, body())).status, 403, `POST ${path} refused for Shimaa`);
    }
    assert.equal(await fingerprint(mathId()), fp, 'nothing in Hadeer\'s subject changed');
    assert.equal(await storedBytes(), stored, 'nothing was stored');

    // And the other way round: Hadeer cannot open Shimaa's subject.
    const res = await hadeer.goto(at(`/s/${spaceA}/publish/edit/${physics}`));
    assert.equal(res?.status(), 403, 'Hadeer is refused on Shimaa\'s editor');
    assert.equal((await hadeer.locator('p.message').innerText()).trim(), NO_ACCESS);
    await shot(hadeer, '12-hadeer-refused-on-shimaas-subject');
  });

  it('AT-3.9 learners, the admin and an expired publisher are refused on the editor and on every editing action', async () => {
    const ids = { subject: mathId(), chapter: made.chapter, lesson: made.lesson, material: made.materials[4] };
    const fp = await fingerprint(mathId());
    const learner = await signedIn(worker.url, SALMA.username, SALMA.password);
    const admin = await signedIn(worker.url, ADMIN.username, ADMIN.password);
    const expired = await signedIn(worker.url, NOUR.username, NOUR.password);
    for (const [who, c] of [['learner', learner], ['admin', admin], ['expired publisher', expired]] as const) {
      for (const path of [`/s/${spaceA}/publish`, editorPath(), lessonEditorPath()]) {
        assert.equal((await c.get(path)).status, 403, `GET ${path} refused for the ${who}`);
      }
      for (const [path, body] of editingActions(spaceA, ids)) {
        assert.equal((await c.post(path, body())).status, 403, `POST ${path} refused for the ${who}`);
      }
    }
    // The expired publisher is refused on her own subject too, with the plain "access ended" message.
    const own = await expired.get(`/s/${spaceA}/publish/edit/${seededA.subjects.Chemistry.id}`);
    assert.equal(own.status, 403);
    assert.ok((await own.text()).includes('انتهى وصولك إلى'), 'the expired publisher sees "access ended"');
    assert.equal(await fingerprint(mathId()), fp, 'nothing changed');
  });

  it('AT-3.10 every write is space-scoped: Hadeer cannot edit a subject of another space that names her, by either space\'s address', async () => {
    const b = seededB.subjects['Forklift safety'];
    const lesson = b.chapters['Loading dock'].lessons['Pallet rules'];
    const ids = { subject: b.id, chapter: b.chapters['Loading dock'].id, lesson: lesson.id, material: Object.values(lesson.materials)[0] };
    const fp = await fingerprint(b.id);
    const c = await signedIn(worker.url, HADEER.username, HADEER.password);
    for (const space of [spaceA, spaceB]) {
      for (const path of [`/s/${space}/publish/edit/${ids.subject}`, `/s/${space}/publish/compose/${ids.lesson}`]) {
        const res = await c.get(path);
        assert.equal(res.status, 403, `GET ${path} refused`);
        assert.ok(!(await res.text()).includes('Pallet rules'), `${path}: nothing of space B leaks`);
      }
      for (const [path, body] of editingActions(space, ids)) {
        assert.equal((await c.post(path, body())).status, 403, `POST ${path} refused`);
      }
    }
    assert.equal(await fingerprint(b.id), fp, 'nothing in space B changed');
  });

  it('AT-3.11 CSRF: a form posted from another site, or with no origin, is refused for every kind of edit, uploads included', async () => {
    const ids = { subject: mathId(), chapter: made.chapter, lesson: made.lesson, material: made.materials[4] };
    const fp = await fingerprint(mathId());
    const stored = await storedBytes();
    const c = await signedIn(worker.url, HADEER.username, HADEER.password);
    for (const headers of [{ origin: 'https://evil.example' }, { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' }, {}]) {
      for (const [path, body] of editingActions(spaceA, ids)) {
        const res = await c.postWith(path, body(), headers);
        assert.equal(res.status, 403, `cross-site POST ${path} (${JSON.stringify(headers)}) refused`);
      }
    }
    assert.equal(await fingerprint(mathId()), fp, 'nothing changed');
    assert.equal(await storedBytes(), stored, 'nothing was stored');
    // Positive control: the same session, from our own pages, may edit.
    assert.equal((await c.post(`/s/${spaceA}/publish/item/${ids.material}/move`, { direction: 'up' })).status, 303);
    assert.equal((await c.post(`/s/${spaceA}/publish/item/${ids.material}/move`, { direction: 'down' })).status, 303);
    assert.equal(await fingerprint(mathId()), fp, 'moved up and back: the same order');
  });
});
