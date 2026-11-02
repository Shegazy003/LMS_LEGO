// AT-8 The publisher corrects content safely (release 1.1, contract 0.2, section 3).
// Drives the publisher's real pages in Chromium, at phone width, Arabic first
// and then the same screens in English, against the Worker running locally
// (Wrangler + workerd, local D1 and R2). The Worker's clock is set to midday
// UTC of today for the whole run.
//
// Seeded (only what earlier acceptance tests already proved): the owner, Mesk
// School (مدرسة مسك) and its admin through the owner's real forms (AT-1);
// Hadeer and Shimaa (publishers), the learner Salma, the group Science, and
// the published subject Mathematics assigned to Hadeer and to Science through
// the test seeding route (AT-2 proved the admin's screens for these). Hadeer's
// chapters (Fractions, Decimals), lessons (Adding fractions, Fractions quiz,
// Place value) and materials (a PDF, an image, a web link, a note) are seeded
// too: AT-3 proved that her real screens make exactly these rows. Shimaa's own
// subject Physics is seeded as a positive control. Everything AT-8 is about
// (renaming a chapter, a lesson and a material, replacing a PDF, removing,
// Cancel, Recently removed, restoring, the refusals) goes through Hadeer's
// real screens in a real browser; the results are read on Salma's real pages,
// and at request level for status codes, ETags and stored rows. Screenshots
// go to evidence/at-8/.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from 'playwright';
import { startWorker, type RunningWorker } from '../support/worker.ts';
import { Client, setClockOffsetMs, setStartOffset, tinyPng, workerNow } from '../support/http.ts';
import { appointAdmin, b64, createSpace, seed, setUpOwner, signedIn, tinyPdf } from '../support/seed.ts';
import { assertPage, follow, phone, readable, shot as shotIn, signIn as signInAt, submit, type Phone } from '../support/browser.ts';
import { changes, sha256, snapshot, type Snapshot } from '../support/state.ts';

const EVIDENCE = fileURLToPath(new URL('../../evidence/at-8/', import.meta.url));
const SPACE = 'مدرسة مسك';
const ADMIN = { display_name: 'Amal Hassan', username: 'amal.admin', password: 'admin-first-pass', mobile: '01012345678' };
interface Person { display_name: string; username: string; password: string; role: 'publisher' | 'learner'; mobile: string }
const HADEER: Person = { display_name: 'Hadeer', username: 'hadeer', password: 'hadeer-first-pass', role: 'publisher', mobile: '01022223333' };
const SHIMAA: Person = { display_name: 'Shimaa', username: 'shimaa', password: 'shimaa-first-pass', role: 'publisher', mobile: '01066667777' };
const SALMA: Person = { display_name: 'Salma Adel', username: 'salma.learner', password: 'salma-first-pass', role: 'learner', mobile: '01033334444' };
const DAY = 86_400_000;
const MAX_UPLOAD = 25 * 1024 * 1024;

const OLD_PDF = tinyPdf('Adding fractions, first draft');
const NEW_PDF = tinyPdf('Adding fractions, corrected');
const PNG = tinyPng();
const NEW_CHAPTER = 'الكسور';
const NEW_LESSON = 'جمع الكسور';
const NEW_MATERIAL = 'ورقة عمل: جمع الكسور';
const ORDER = ['Worksheet', 'Pizza slices', 'Practice online', 'Remember'];

// The kit's words (school kit) and the plain messages, from the product dictionary.
const AR = {
  chapter: 'وحدة', lesson: 'درس', material: 'مادة تعليمية',
  renameHeading: (item: string) => `تغيير الاسم: ${item}`,
  nameRefused: 'اكتب اسماً من 1 إلى 100 حرف، في سطر واحد. لم يتغيّر شيء.',
  renamed: 'تم الحفظ. يظهر الاسم الجديد في كل صفحة.',
  removeTitle: (item: string, name: string) => `إزالة ${item} «${name}»؟`,
  removed: 'تمت الإزالة. لم يُحذف شيء: العنصر في «أُزيل مؤخراً».',
  restored: 'تمت استعادة العنصر إلى مكانه السابق.',
  refused: (name: string, inside: string) => `ما زال «${name}» يعرض محتوى: أزِل كل ${inside} فيه أولاً، ثم أعد المحاولة. لم تتم إزالة أي شيء.`,
  recentlyRemoved: 'أُزيل مؤخراً',
  replaced: 'تم الحفظ. يظهر الملف الجديد فوراً.',
  replaceKind: 'اختر ملفاً من النوع نفسه: ملف PDF مكان ملف PDF، وصورة مكان صورة. لم يتغيّر شيء.',
  uploadType: 'لا يمكن إضافة هذا الملف. يمكن رفع ملف PDF أو صورة (PNG أو JPEG أو WebP أو GIF) فقط.',
  uploadTooLarge: 'لا يمكن إضافة هذا الملف. الحد الأقصى لحجم الملف 25 ميغابايت.',
  uploadMissing: 'اختر ملفاً لرفعه.',
  notFound: 'هذه الصفحة غير موجودة.',
  noAccess: 'ليس لديك صلاحية للوصول إلى هذه الصفحة.',
};
const EN = {
  chapter: 'Chapter', lesson: 'Lesson', material: 'Material',
  renameHeading: (item: string) => `Rename the ${item}`,
  removeTitle: (item: string, name: string) => `Remove the ${item} “${name}”?`,
  refused: (item: string, name: string, inside: string) =>
    `The ${item} “${name}” still shows content: remove each ${inside} in it first, then try again. Nothing was removed.`,
  recentlyRemoved: 'Recently removed',
  restored: 'Restored in its old place.',
  notFound: 'This page does not exist.',
};

let worker: RunningWorker;
let browser: Browser;
let hadeer: Phone;
let salma: Phone;
let owner: Client;
let hadeerHttp: Client;
let spaceId = '';
let today = '';
const ids: Record<string, string> = {};

const at = (path: string) => worker.url + path;
const plus = (days: number) => new Date(Date.parse(today + 'T00:00:00Z') + days * DAY).toISOString().slice(0, 10);
const shot = (page: Page, name: string) => shotIn(page, EVIDENCE, name);
const signIn = (page: Page, p: { username: string; password: string }) => signInAt(worker.url, page, p.username, p.password);
const pub = () => `/s/${spaceId}/publish`;
const editorPath = () => `${pub()}/edit/${ids.math}`;
const lessonEditorPath = (lesson = ids.adding) => `${pub()}/compose/${lesson}`;
const itemPath = (material: string) => `${pub()}/item/${material}`;
const partPath = (chapter: string) => `${pub()}/part/${chapter}`;
const removedPath = () => `${pub()}/edit/${ids.math}/removed`;
const CONTENT_TABLES = ['chapter', 'lesson', 'material'];

async function text(page: Page, selector: string): Promise<string> {
  return (await page.locator(selector).innerText()).trim();
}

async function errorText(page: Page): Promise<string> {
  return text(page, '#error');
}

async function assertSpacePage(page: Page, where: string, lang: 'ar' | 'en' = 'ar'): Promise<void> {
  await assertPage(page, where, lang);
  assert.equal(await text(page, '#space-name'), SPACE, `${where}: the space's name`);
}

/** Puts a value into a form field as a person with an altered page could
 * (past the browser's maxlength and required checks), so the server's rule is what answers. */
async function typeAround(page: Page, form: string, name: string, value: string): Promise<void> {
  await page.locator(`form${form} [name=${name}]`).evaluate((el, v) => { (el as HTMLInputElement).value = v; }, value);
  await page.locator(`form${form}`).evaluate((f) => { (f as HTMLFormElement).noValidate = true; });
}

async function titles(page: Page, selector: string): Promise<string[]> {
  return (await page.locator(selector).allInnerTexts()).map((s) => s.trim());
}

/** The material titles of a lesson as its page lists them, in order. */
async function materialTitles(page: Page): Promise<string[]> {
  return titles(page, '#items > li .title');
}

/** The learner's subject page: chapter titles, and every lesson title under them, in order. */
async function learnerOutline(): Promise<{ chapters: string[]; lessons: string[] }> {
  await salma.page.goto(at(`/s/${spaceId}/learn/${ids.math}`));
  return { chapters: await titles(salma.page, '#outline [data-chapter] .title'), lessons: await titles(salma.page, '#outline a[data-lesson]') };
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

/** A file link as the learner's browser asks for it (optionally offering a cached copy's ETag). */
async function learnerFile(material: string, etag?: string) {
  const res = await salma.page.request.get(at(`/s/${spaceId}/file/${material}`), { headers: etag ? { 'if-none-match': etag } : {} });
  return { status: res.status(), etag: res.headers().etag ?? '', type: res.headers()['content-type'] ?? '', body: await res.body() };
}

/** The one stored row of a material, parsed. */
const rowOf = (s: Snapshot, table: string, id: string) =>
  s[table].map((r) => JSON.parse(r) as Record<string, unknown>).find((r) => r.id === id) as Record<string, unknown>;

/** Exactly one row of one table changed, and only in the named columns. */
function assertOneRowChanged(before: Snapshot, after: Snapshot, table: string, id: string, columns: string[], why: string) {
  const diff = changes(before, after);
  assert.deepEqual(Object.keys(diff), [table], `${why}: only the ${table} table changed`);
  assert.deepEqual([diff[table].removed.length, diff[table].added.length], [1, 1], `${why}: exactly one row changed`);
  const was = JSON.parse(diff[table].removed[0]) as Record<string, unknown>;
  const now = JSON.parse(diff[table].added[0]) as Record<string, unknown>;
  assert.equal(now.id, id, `${why}: the row of that item`);
  const changed = Object.keys(now).filter((k) => JSON.stringify(now[k]) !== JSON.stringify(was[k]));
  assert.deepEqual(changed.sort(), [...columns].sort(), `${why}: only ${columns.join(', ')} changed`);
  return { was, now };
}

async function chooseLanguage(page: Page, lang: 'ar' | 'en'): Promise<void> {
  await page.goto(at('/account/language'));
  await page.selectOption('form#language select[name=lang]', lang);
  assert.equal(await submit(page, 'form#language'), 303, `the language is now ${lang}`);
}

/** Opens a material's own page from the lesson editor, the way Hadeer does. */
async function openItem(material: string, lesson = ids.adding): Promise<void> {
  await hadeer.page.goto(at(lessonEditorPath(lesson)));
  await follow(hadeer.page, `#items > li[data-id="${material}"] a.change`);
  assert.ok(hadeer.page.url().includes(itemPath(material)), `the material's page, got ${hadeer.page.url()}`);
}

/** Opens a chapter's own page from the subject editor. */
async function openPart(chapter: string): Promise<void> {
  await hadeer.page.goto(at(editorPath()));
  await follow(hadeer.page, `#outline [data-chapter="${chapter}"] a.change`);
  assert.ok(hadeer.page.url().includes(partPath(chapter)), `the chapter's page, got ${hadeer.page.url()}`);
}

/** Opens Recently removed from the subject editor. */
async function openRemoved(): Promise<void> {
  await hadeer.page.goto(at(editorPath()));
  await follow(hadeer.page, '#recently-removed');
  assert.ok(hadeer.page.url().endsWith(removedPath()), `Recently removed, got ${hadeer.page.url()}`);
}

/** From an item's page, the remove step (a GET page), then "Yes" (a POST). Returns the POST status. */
async function removeFromPage(expectTitle: string): Promise<number> {
  const p = hadeer.page;
  await Promise.all([p.waitForEvent('load'), p.locator('form#remove-item button[type=submit]').click()]);
  assert.ok(p.url().endsWith('/remove'), 'the confirm step is its own page');
  assert.equal(await text(p, '#remove-title'), expectTitle, 'the confirm step names the item');
  return submit(p, 'form#confirm-remove');
}

describe('AT-8 the publisher corrects content safely', { concurrency: false }, () => {
  before(async () => {
    mkdirSync(EVIDENCE, { recursive: true });
    worker = await startWorker();
    today = new Date(await workerNow(worker.url)).toISOString().slice(0, 10);
    setStartOffset(worker.url, Date.parse(`${today}T12:00:00Z`) - Date.now());
    assert.equal((await setClockOffsetMs(worker.url, 0)).status, 200);
    owner = await setUpOwner(worker.url);
    spaceId = await createSpace(owner, { name: SPACE, kit: 'school' });
    await appointAdmin(owner, spaceId, { ...ADMIN, valid_until: plus(60) });
    const s = await seed(worker.url, {
      spaceId,
      grantedBy: ADMIN.username,
      people: [HADEER, SHIMAA, SALMA].map((p) => ({ ...p, valid_until: plus(30) })),
      groups: [{ name: 'Science', members: [SALMA.username] }],
      subjects: [
        {
          title: 'Mathematics', publisher: HADEER.username, published: true, groups: ['Science'],
          chapters: [
            { title: 'Fractions', lessons: [
              { title: 'Adding fractions', materials: [
                { kind: 'pdf', title: 'Worksheet', base64: b64(OLD_PDF), contentType: 'application/pdf' },
                { kind: 'image', title: 'Pizza slices', base64: b64(PNG), contentType: 'image/png' },
                { kind: 'link', title: 'Practice online', url: 'https://example.org/fractions' },
                { kind: 'note', title: 'Remember', text: 'Add the tops, keep the bottom.' },
              ] },
              { title: 'Fractions quiz', materials: [] },
            ] },
            { title: 'Decimals', lessons: [{ title: 'Place value', materials: [] }] },
          ],
        },
        {
          title: 'Physics', publisher: SHIMAA.username, published: false,
          chapters: [{ title: 'Motion', lessons: [{ title: 'Speed', materials: [{ kind: 'note', title: 'Speed note', text: 'v = d / t' }] }] }],
        },
      ],
    });
    const math = s.subjects.Mathematics;
    const adding = math.chapters.Fractions.lessons['Adding fractions'];
    const physics = s.subjects.Physics;
    Object.assign(ids, {
      math: math.id, fractions: math.chapters.Fractions.id, decimals: math.chapters.Decimals.id,
      adding: adding.id, quiz: math.chapters.Fractions.lessons['Fractions quiz'].id, place: math.chapters.Decimals.lessons['Place value'].id,
      worksheet: adding.materials.Worksheet, pizza: adding.materials['Pizza slices'], practice: adding.materials['Practice online'],
      remember: adding.materials.Remember,
      physics: physics.id, motion: physics.chapters.Motion.id, speed: physics.chapters.Motion.lessons.Speed.id,
      speedNote: physics.chapters.Motion.lessons.Speed.materials['Speed note'],
    });
    browser = await chromium.launch();
    hadeer = await phone(browser);
    salma = await phone(browser);
    await signIn(hadeer.page, HADEER);
    await signIn(salma.page, SALMA);
    hadeerHttp = await signedIn(worker.url, HADEER.username, HADEER.password);
  });

  after(async () => {
    if (worker) await setClockOffsetMs(worker.url, 0).catch(() => undefined);
    await browser?.close();
    await worker?.stop();
  });

  it('AT-8.1 Hadeer renames a chapter, a lesson and a material (1 to 100 characters, one line); refused names store nothing; Salma sees the new titles at once', async () => {
    const p = hadeer.page;
    // Positive control: Salma reads the old titles.
    assert.deepEqual((await learnerOutline()).chapters, ['Fractions', 'Decimals']);

    // The chapter.
    await openPart(ids.fractions);
    await assertSpacePage(p, 'chapter page');
    assert.equal(await text(p, '#chapter-title'), 'Fractions');
    assert.equal(await text(p, '#rename-chapter-title'), AR.renameHeading(AR.chapter), 'the rename heading uses the kit\'s word and reads cleanly');
    assert.equal(await p.inputValue('form#rename-chapter input[name=title]'), 'Fractions', 'the form starts with the current title');
    await shot(p, '01-chapter-page-rename');
    const before = await snapshot(worker);
    for (const [value, why] of [['', 'an empty title'], ['ك'.repeat(101), 'a title over 100 characters'], ['Frac\ntions', 'a title on two lines']]) {
      await typeAround(p, '#rename-chapter', 'title', value);
      assert.equal(await submit(p, '#rename-chapter'), 400, `${why} is refused`);
      assert.equal(await errorText(p), AR.nameRefused, `${why}: the plain message`);
      assert.equal(await text(p, '#chapter-title'), 'Fractions', `${why}: the title is unchanged`);
      await assertSpacePage(p, `${why} refused`);
    }
    await shot(p, '02-chapter-name-refused');
    assert.deepEqual(changes(before, await snapshot(worker)), {}, 'nothing stored by a refused title');
    await p.fill('form#rename-chapter input[name=title]', NEW_CHAPTER);
    assert.equal(await submit(p, '#rename-chapter'), 303, 'the chapter is renamed');
    assert.equal(await text(p, '#done'), AR.renamed);
    assert.equal(await text(p, '#chapter-title'), NEW_CHAPTER);
    await assertSpacePage(p, 'chapter renamed');
    await shot(p, '03-chapter-renamed');
    const afterChapter = await snapshot(worker);
    assertOneRowChanged(before, afterChapter, 'chapter', ids.fractions, ['title'], 'renaming the chapter');

    // The lesson, on its own editor.
    await p.goto(at(editorPath()));
    await follow(p, `#outline a[data-lesson="${ids.adding}"]`);
    assert.equal(await text(p, '#rename-lesson-title'), AR.renameHeading(AR.lesson));
    await typeAround(p, '#rename-lesson', 'title', '   ');
    assert.equal(await submit(p, '#rename-lesson'), 400, 'a blank lesson title is refused');
    assert.equal(await errorText(p), AR.nameRefused);
    await p.fill('form#rename-lesson input[name=title]', NEW_LESSON);
    assert.equal(await submit(p, '#rename-lesson'), 303, 'the lesson is renamed');
    assert.equal(await text(p, '#done'), AR.renamed);
    assert.equal(await text(p, '#lesson-title'), NEW_LESSON);
    await assertSpacePage(p, 'lesson renamed');
    await shot(p, '04-lesson-renamed');
    const afterLesson = await snapshot(worker);
    assertOneRowChanged(afterChapter, afterLesson, 'lesson', ids.adding, ['title'], 'renaming the lesson');

    // The material, on its own page.
    await openItem(ids.worksheet);
    await assertSpacePage(p, 'material page');
    assert.equal(await text(p, '#material-title'), 'Worksheet');
    assert.equal(await text(p, '#rename-material-title'), AR.renameHeading(AR.material));
    await typeAround(p, '#rename-material', 'title', 'W'.repeat(101));
    assert.equal(await submit(p, '#rename-material'), 400, 'a material title over 100 characters is refused');
    assert.equal(await errorText(p), AR.nameRefused);
    await p.fill('form#rename-material input[name=title]', NEW_MATERIAL);
    assert.equal(await submit(p, '#rename-material'), 303, 'the material is renamed');
    assert.equal(await text(p, '#done'), AR.renamed);
    assert.equal(await text(p, '#material-title'), NEW_MATERIAL);
    await assertSpacePage(p, 'material renamed');
    await shot(p, '05-material-renamed');
    assertOneRowChanged(afterLesson, await snapshot(worker), 'material', ids.worksheet, ['title'], 'renaming the material');

    // Salma, with the sign-in she already had, sees every new title at once.
    const outline = await learnerOutline();
    assert.deepEqual(outline.chapters, [NEW_CHAPTER, 'Decimals'], 'the new chapter title, in its place');
    assert.deepEqual(outline.lessons, [NEW_LESSON, 'Fractions quiz', 'Place value'], 'the new lesson title, in its place');
    await assertSpacePage(salma.page, 'learner subject page with new titles');
    await shot(salma.page, '06-learner-subject-new-titles');
    await follow(salma.page, `#outline a[data-lesson="${ids.adding}"]`);
    assert.equal(await text(salma.page, '#lesson-title'), NEW_LESSON);
    assert.ok((await text(salma.page, '#trail')).includes(NEW_CHAPTER), 'the trail names the new chapter title');
    assert.deepEqual(await materialTitles(salma.page), [NEW_MATERIAL, ...ORDER.slice(1)], 'the new material title, in its place');
    await shot(salma.page, '07-learner-lesson-new-titles');
    for (const old of ['Fractions', 'Adding fractions', 'Worksheet']) {
      assert.ok(!(await readable(salma.page)).split('\n').some((l) => l.trim() === old), `the old title "${old}" is gone`);
    }
  });

  it('AT-8.2 Hadeer replaces the PDF of a material with another PDF: title and place stay; checks as for uploads; Salma gets the new bytes at once and the old ETag no longer answers', async () => {
    const p = hadeer.page;
    const first = await learnerFile(ids.worksheet);
    assert.equal(first.status, 200, 'positive control: the learner opens the old file');
    assert.equal(sha256(first.body), sha256(OLD_PDF), 'the old bytes');
    assert.ok(first.etag, 'the file has an ETag');
    assert.equal((await learnerFile(ids.worksheet, first.etag)).status, 304, 'positive control: an unchanged file answers 304 to its ETag');

    await openItem(ids.worksheet);
    assert.equal(await p.locator('form#replace-file').count(), 1, 'a PDF material offers "replace the file"');
    const before = await snapshot(worker);
    const storedBefore = await storedBytes();
    // Refused like an upload: not a PDF at all, an image in place of a PDF, no file.
    await p.setInputFiles('form#replace-file input[name=file]', { name: 'worksheet.pdf', mimeType: 'application/pdf', buffer: Buffer.from('plain text pretending') });
    assert.equal(await submit(p, '#replace-file'), 400, 'content that is not a PDF or an image is refused');
    assert.equal(await errorText(p), AR.uploadType);
    await p.setInputFiles('form#replace-file input[name=file]', { name: 'pizza.png', mimeType: 'image/png', buffer: Buffer.from(PNG) });
    assert.equal(await submit(p, '#replace-file'), 400, 'an image in place of a PDF is refused');
    assert.equal(await errorText(p), AR.replaceKind);
    await assertSpacePage(p, 'replace refused');
    await shot(p, '08-replace-refused-wrong-kind');
    await typeAround(p, '#replace-file', 'file', '');
    assert.equal(await submit(p, '#replace-file'), 400, 'no file is refused');
    assert.equal(await errorText(p), AR.uploadMissing);
    const big = new Uint8Array(MAX_UPLOAD + 1);
    big.set(new TextEncoder().encode('%PDF-1.4\n'));
    const tooBig = new FormData();
    tooBig.set('file', new Blob([big], { type: 'application/pdf' }), 'big.pdf');
    const res = await hadeerHttp.post(`${itemPath(ids.worksheet)}/file`, tooBig);
    assert.equal(res.status, 413, 'a file over 25 MB is refused');
    assert.ok((await res.text()).includes(AR.uploadTooLarge), 'with the plain size message');
    assert.deepEqual(changes(before, await snapshot(worker)), {}, 'nothing stored by a refused file');
    assert.equal(await storedBytes(), storedBefore, 'no file stored by a refused file');

    // The real replacement.
    await p.setInputFiles('form#replace-file input[name=file]', { name: 'worksheet-corrected.pdf', mimeType: 'application/pdf', buffer: Buffer.from(NEW_PDF) });
    assert.equal(await submit(p, '#replace-file'), 303, 'the file is replaced');
    assert.equal(await text(p, '#done'), AR.replaced);
    assert.equal(await text(p, '#material-title'), NEW_MATERIAL, 'the title stays');
    await assertSpacePage(p, 'file replaced');
    await shot(p, '09-file-replaced');
    const { was, now } = assertOneRowChanged(before, await snapshot(worker), 'material', ids.worksheet, ['storage_key'], 'replacing the file');
    assert.deepEqual([now.title, now.position, now.kind, now.lesson_id], [was.title, was.position, was.kind, was.lesson_id], 'title, place and kind stay');
    assert.notEqual(now.storage_key, was.storage_key, 'the new bytes are stored under a new key (the old object is kept, never overwritten)');
    assert.equal(await storedBytes(), storedBefore + NEW_PDF.length, 'the old file is kept in storage and still counted; the new one is added');

    // Salma, at once: new bytes at the same address; her cached copy's ETag no longer answers 304.
    const second = await learnerFile(ids.worksheet);
    assert.equal(second.status, 200);
    assert.equal(sha256(second.body), sha256(NEW_PDF), 'the learner gets the new bytes');
    assert.notEqual(second.etag, first.etag, 'a new ETag');
    const revalidated = await learnerFile(ids.worksheet, first.etag);
    assert.equal(revalidated.status, 200, 'the old ETag does not answer 304');
    assert.equal(sha256(revalidated.body), sha256(NEW_PDF), 'and the answer is the new bytes, never the old');
    assert.ok(revalidated.type.includes('application/pdf'));
    await salma.page.goto(at(`/s/${spaceId}/read/${ids.adding}`));
    assert.deepEqual(await materialTitles(salma.page), [NEW_MATERIAL, ...ORDER.slice(1)], 'the material keeps its place');
    await shot(salma.page, '10-learner-lesson-after-replace');
  });

  it('AT-8.3 Hadeer removes a material (a page step names it; Cancel changes nothing), restores it from Recently removed in its old place with the same file, then removes it again', async () => {
    const p = hadeer.page;
    const storedBefore = await storedBytes();
    const start = await snapshot(worker);
    const file = await learnerFile(ids.worksheet);
    assert.equal(file.status, 200, 'positive control: the learner opens it');

    // The confirm step is a GET page: opening it (even twice, by its address) removes nothing; Cancel goes back.
    await openItem(ids.worksheet);
    await Promise.all([p.waitForEvent('load'), p.locator('form#remove-item button[type=submit]').click()]);
    assert.ok(p.url().endsWith(`${itemPath(ids.worksheet)}/remove`), 'the confirm step');
    assert.equal(await text(p, '#remove-title'), AR.removeTitle(AR.material, NEW_MATERIAL), 'it names the material');
    await assertSpacePage(p, 'remove confirm step');
    await shot(p, '11-remove-material-confirm');
    await p.goto(at(`${itemPath(ids.worksheet)}/remove`));
    await p.reload();
    await follow(p, '#cancel-remove');
    assert.ok(p.url().includes(itemPath(ids.worksheet)) && !p.url().endsWith('/remove'), 'Cancel goes back to the material');
    assert.deepEqual(changes(start, await snapshot(worker)), {}, 'Cancel and plain visits changed nothing');
    await salma.page.goto(at(`/s/${spaceId}/read/${ids.adding}`));
    assert.deepEqual(await materialTitles(salma.page), [NEW_MATERIAL, ...ORDER.slice(1)], 'the learner still sees it');

    // Yes: one database change.
    assert.equal(await removeFromPage(AR.removeTitle(AR.material, NEW_MATERIAL)), 303, 'removed');
    assert.ok(p.url().includes(lessonEditorPath()), 'back on the lesson editor');
    assert.equal(await text(p, '#done'), AR.removed);
    assert.deepEqual(await materialTitles(p), ORDER.slice(1), 'gone from the lesson editor');
    await assertSpacePage(p, 'material removed');
    await shot(p, '12-material-removed');
    const removed = await snapshot(worker);
    const { now } = assertOneRowChanged(start, removed, 'material', ids.worksheet, ['removed_at'], 'removing the material');
    assert.ok(now.removed_at, 'a soft removal: the row stays, marked removed');
    assert.equal(await storedBytes(), storedBefore, 'its file stays in storage and is still counted');

    // Salma: gone from the lesson; its address answers "not found", even to her cached copy's ETag.
    await salma.page.goto(at(`/s/${spaceId}/read/${ids.adding}`));
    assert.deepEqual(await materialTitles(salma.page), ORDER.slice(1), 'gone from the learner\'s lesson');
    assert.ok(!(await readable(salma.page)).includes(NEW_MATERIAL));
    await shot(salma.page, '13-learner-lesson-material-gone');
    for (const etag of [undefined, file.etag]) {
      const gone = await learnerFile(ids.worksheet, etag);
      assert.equal(gone.status, 404, `the file link answers not found${etag ? ' (with the old ETag)' : ''}`);
      assert.ok(!gone.type.includes('pdf'), 'and sends no file bytes');
      assert.ok(gone.body.toString('utf8').includes(AR.notFound), 'with the plain "not found" message');
    }
    const page = await salma.page.goto(at(`/s/${spaceId}/file/${ids.worksheet}`)).catch(() => null);
    if (page) assert.equal(page.status(), 404);
    await shot(salma.page, '14-learner-file-link-not-found');

    // Recently removed lists it; Restore puts it back in its old place, with the same file.
    await openRemoved();
    assert.equal(await text(p, 'h1'), AR.recentlyRemoved);
    const listed = p.locator(`#removed > li[data-removed="${ids.worksheet}"]`);
    assert.equal(await listed.count(), 1, 'the removed material is listed');
    assert.ok((await listed.innerText()).includes(NEW_MATERIAL), 'by its title');
    await assertSpacePage(p, 'recently removed');
    await shot(p, '15-recently-removed');
    assert.equal(await submit(p, `#removed > li[data-removed="${ids.worksheet}"] form.restore`), 303, 'restored');
    assert.equal(await text(p, '#done'), AR.restored);
    assert.ok(p.url().includes(lessonEditorPath()), 'back on its lesson');
    assert.deepEqual(await materialTitles(p), [NEW_MATERIAL, ...ORDER.slice(1)], 'in its old place');
    await shot(p, '16-material-restored');
    assert.deepEqual(changes(start, await snapshot(worker)), {}, 'every row exactly as before the removal (same place, same file)');
    await salma.page.goto(at(`/s/${spaceId}/read/${ids.adding}`));
    assert.deepEqual(await materialTitles(salma.page), [NEW_MATERIAL, ...ORDER.slice(1)], 'the learner sees it again, in its old place');
    const back = await learnerFile(ids.worksheet);
    assert.equal(back.status, 200);
    assert.equal(sha256(back.body), sha256(NEW_PDF), 'the same file');
    await shot(salma.page, '17-learner-lesson-material-restored');

    // Removed again.
    await openItem(ids.worksheet);
    assert.equal(await removeFromPage(AR.removeTitle(AR.material, NEW_MATERIAL)), 303, 'removed again');
    assert.deepEqual(await materialTitles(p), ORDER.slice(1));
    assertOneRowChanged(start, await snapshot(worker), 'material', ids.worksheet, ['removed_at'], 'removing it again');
    assert.equal((await learnerFile(ids.worksheet)).status, 404, 'its address answers not found again');
    await openRemoved();
    assert.equal(await p.locator(`#removed > li[data-removed="${ids.worksheet}"]`).count(), 1, 'it waits in Recently removed');
    await shot(p, '18-material-removed-again');
    assert.equal(await storedBytes(), storedBefore, 'nothing was deleted from storage at any step');
  });

  it('AT-8.4 a lesson or a chapter that still shows content is refused with a plain message saying what to remove first; an empty lesson and an empty chapter are removed and restored', async () => {
    const p = hadeer.page;
    const start = await snapshot(worker);

    // The lesson that still shows three materials.
    await p.goto(at(lessonEditorPath()));
    await Promise.all([p.waitForEvent('load'), p.locator('form#remove-item button[type=submit]').click()]);
    assert.equal(await errorText(p), AR.refused(NEW_LESSON, AR.material), 'the plain refusal says what to remove first');
    assert.deepEqual(await titles(p, '#still-showing li'), ORDER.slice(1), 'and lists what still shows');
    assert.equal(await p.locator('form#confirm-remove').count(), 0, 'no "Yes" is offered');
    await assertSpacePage(p, 'lesson removal refused');
    await shot(p, '19-lesson-with-materials-refused');
    const forced = await hadeerHttp.post(`${lessonEditorPath()}/remove`, {});
    assert.equal(forced.status, 400, 'a direct POST is refused too');
    assert.ok((await forced.text()).includes('أزِل كل'), 'with the same plain message');
    assert.deepEqual(changes(start, await snapshot(worker)), {}, 'nothing removed');

    // The empty lesson "Fractions quiz": removed, gone for Salma, restored in its old place.
    await p.goto(at(editorPath()));
    await follow(p, `#outline a[data-lesson="${ids.quiz}"]`);
    assert.equal(await removeFromPage(AR.removeTitle(AR.lesson, 'Fractions quiz')), 303, 'the empty lesson is removed');
    assert.ok(p.url().includes(editorPath()), 'back on the subject editor');
    assert.equal(await text(p, '#done'), AR.removed);
    assert.deepEqual(await titles(p, `#outline [data-chapter="${ids.fractions}"] a[data-lesson]`), [NEW_LESSON], 'gone from the editor');
    await shot(p, '20-empty-lesson-removed');
    assertOneRowChanged(start, await snapshot(worker), 'lesson', ids.quiz, ['removed_at'], 'removing the empty lesson');
    assert.deepEqual((await learnerOutline()).lessons, [NEW_LESSON, 'Place value'], 'gone from the learner\'s subject page');
    const gone = await salma.page.goto(at(`/s/${spaceId}/read/${ids.quiz}`));
    assert.equal(gone?.status(), 404, 'its address answers not found');
    assert.equal(await text(salma.page, 'p.message'), AR.notFound);
    await shot(salma.page, '21-learner-removed-lesson-not-found');
    await openRemoved();
    assert.equal(await submit(p, `#removed > li[data-removed="${ids.quiz}"] form.restore`), 303, 'restored');
    assert.equal(await text(p, '#done'), AR.restored);
    assert.deepEqual(await titles(p, `#outline [data-chapter="${ids.fractions}"] a[data-lesson]`), [NEW_LESSON, 'Fractions quiz'], 'in its old place');
    assert.deepEqual(changes(start, await snapshot(worker)), {}, 'exactly as before');
    assert.deepEqual((await learnerOutline()).lessons, [NEW_LESSON, 'Fractions quiz', 'Place value'], 'back for the learner');

    // Chapters: "Decimals" still shows "Place value" (refused); remove the lesson, then the chapter; restore both.
    await openPart(ids.decimals);
    await Promise.all([p.waitForEvent('load'), p.locator('form#remove-item button[type=submit]').click()]);
    assert.equal(await errorText(p), AR.refused('Decimals', AR.lesson), 'a chapter that still shows lessons is refused');
    assert.deepEqual(await titles(p, '#still-showing li'), ['Place value']);
    assert.equal(await p.locator('form#confirm-remove').count(), 0);
    await shot(p, '22-chapter-with-lessons-refused');
    assert.equal((await hadeerHttp.post(`${partPath(ids.decimals)}/remove`, {})).status, 400, 'a direct POST is refused too');
    assert.deepEqual(changes(start, await snapshot(worker)), {}, 'nothing removed');
    await p.goto(at(lessonEditorPath(ids.place)));
    assert.equal(await removeFromPage(AR.removeTitle(AR.lesson, 'Place value')), 303);
    await openPart(ids.decimals);
    assert.equal(await removeFromPage(AR.removeTitle(AR.chapter, 'Decimals')), 303, 'the empty chapter is removed');
    assert.equal(await text(p, '#done'), AR.removed);
    assert.deepEqual(await titles(p, '#outline [data-chapter] .title'), [NEW_CHAPTER], 'gone from the editor');
    await shot(p, '23-empty-chapter-removed');
    assert.deepEqual((await learnerOutline()).chapters, [NEW_CHAPTER], 'gone from the learner\'s subject page');
    assert.equal((await salma.page.goto(at(`/s/${spaceId}/read/${ids.place}`)))?.status(), 404, 'its lesson answers not found');

    await openRemoved();
    // The lesson inside a removed chapter waits for its chapter: restoring it first is refused.
    assert.equal(await p.locator(`#removed > li[data-removed="${ids.place}"] form.restore`).count(), 0, 'no Restore for a lesson whose chapter is removed');
    assert.equal((await hadeerHttp.post(`${lessonEditorPath(ids.place)}/restore`, {})).status, 400, 'restoring it by a direct POST is refused');
    await shot(p, '24-recently-removed-chapter-and-lesson');
    assert.equal(await submit(p, `#removed > li[data-removed="${ids.decimals}"] form.restore`), 303, 'the chapter is restored');
    assert.deepEqual(await titles(p, '#outline [data-chapter] .title'), [NEW_CHAPTER, 'Decimals'], 'in its old place');
    await openRemoved();
    assert.equal(await submit(p, `#removed > li[data-removed="${ids.place}"] form.restore`), 303, 'then its lesson');
    assert.deepEqual(await titles(p, `#outline [data-chapter="${ids.decimals}"] a[data-lesson]`), ['Place value']);
    await shot(p, '25-chapter-and-lesson-restored');
    assert.deepEqual(changes(start, await snapshot(worker)), {}, 'everything exactly as before');
    assert.deepEqual(await learnerOutline(), { chapters: [NEW_CHAPTER, 'Decimals'], lessons: [NEW_LESSON, 'Fractions quiz', 'Place value'] }, 'back for the learner');
    await assertSpacePage(salma.page, 'learner subject page after restores');
  });

  it('AT-8.5 the same screens in English: the rename heading, the confirm step, the refusal and Recently removed; a restore shows on Salma\'s English page', async () => {
    const p = hadeer.page;
    await chooseLanguage(p, 'en');
    await chooseLanguage(salma.page, 'en');
    await openItem(ids.pizza);
    await assertSpacePage(p, 'material page (English)', 'en');
    assert.equal(await text(p, '#rename-material-title'), EN.renameHeading(EN.material));
    const before = await snapshot(worker);
    await Promise.all([p.waitForEvent('load'), p.locator('form#remove-item button[type=submit]').click()]);
    assert.equal(await text(p, '#remove-title'), EN.removeTitle(EN.material, 'Pizza slices'));
    await assertSpacePage(p, 'confirm step (English)', 'en');
    await shot(p, '26-en-remove-confirm');
    await follow(p, '#cancel-remove');
    assert.deepEqual(changes(before, await snapshot(worker)), {}, 'Cancel changed nothing');

    await p.goto(at(lessonEditorPath()));
    await Promise.all([p.waitForEvent('load'), p.locator('form#remove-item button[type=submit]').click()]);
    assert.equal(await errorText(p), EN.refused(EN.lesson, NEW_LESSON, EN.material));
    await assertSpacePage(p, 'refusal (English)', 'en');
    await shot(p, '27-en-lesson-refused');

    await openRemoved();
    assert.equal(await text(p, 'h1'), EN.recentlyRemoved);
    await assertSpacePage(p, 'recently removed (English)', 'en');
    await shot(p, '28-en-recently-removed');
    assert.equal(await submit(p, `#removed > li[data-removed="${ids.worksheet}"] form.restore`), 303);
    assert.equal(await text(p, '#done'), EN.restored);
    await salma.page.goto(at(`/s/${spaceId}/read/${ids.adding}`));
    assert.deepEqual(await materialTitles(salma.page), [NEW_MATERIAL, ...ORDER.slice(1)], 'restored, in its old place, on the English page');
    await assertSpacePage(salma.page, 'learner lesson (English)', 'en');
    assert.equal(sha256((await learnerFile(ids.worksheet)).body), sha256(NEW_PDF));
    await shot(salma.page, '29-en-learner-lesson-restored');
    // A removed address in English says "not found" in English.
    assert.equal((await hadeerHttp.post(`${itemPath(ids.remember)}/remove`, {})).status, 303);
    const gone = await salma.page.goto(at(`/s/${spaceId}/file/${ids.remember}`));
    assert.equal(gone?.status(), 404);
    await salma.page.goto(at(`/s/${spaceId}/read/${ids.adding}`));
    assert.deepEqual(await materialTitles(salma.page), [NEW_MATERIAL, 'Pizza slices', 'Practice online'], 'the removed note is gone');
    assert.equal((await hadeerHttp.post(`${itemPath(ids.remember)}/restore`, {})).status, 303);
    await salma.page.reload();
    assert.deepEqual(await materialTitles(salma.page), [NEW_MATERIAL, ...ORDER.slice(1)], 'the restored note is back in its place');
    const removedLesson = await hadeerHttp.post(`${lessonEditorPath(ids.quiz)}/remove`, {});
    assert.equal(removedLesson.status, 303);
    const page = await salma.page.goto(at(`/s/${spaceId}/read/${ids.quiz}`));
    assert.equal(page?.status(), 404);
    assert.equal(await text(salma.page, 'p.message'), EN.notFound);
    assert.equal((await hadeerHttp.post(`${lessonEditorPath(ids.quiz)}/restore`, {})).status, 303);
  });

  it('AT-8.6 Shimaa (another publisher), the admin and Salma cannot rename, replace, remove or restore anything of Hadeer\'s, by screen or forged request', async () => {
    // One removed material, so restoring is tried too.
    assert.equal((await hadeerHttp.post(`${itemPath(ids.practice)}/remove`, {})).status, 303);
    const shimaa = await signedIn(worker.url, SHIMAA.username, SHIMAA.password);
    const admin = await signedIn(worker.url, ADMIN.username, ADMIN.password);
    const learner = await signedIn(worker.url, SALMA.username, SALMA.password);
    // Positive control: Shimaa renames her own chapter and removes and restores her own material.
    assert.equal((await shimaa.post(`${partPath(ids.motion)}/name`, { title: 'Motion and speed' })).status, 303, 'Shimaa renames her own chapter');
    assert.equal((await shimaa.post(`${itemPath(ids.speedNote)}/remove`, {})).status, 303, 'Shimaa removes her own material');
    assert.equal((await shimaa.post(`${itemPath(ids.speedNote)}/restore`, {})).status, 303, 'and restores it');

    const pdf = () => {
      const f = new FormData();
      f.set('file', new Blob([tinyPdf('Forged')], { type: 'application/pdf' }), 'forged.pdf');
      return f;
    };
    const writes: [string, () => Record<string, string> | FormData][] = [
      [`${partPath(ids.fractions)}/name`, () => ({ title: 'Forged' })],
      [`${lessonEditorPath()}/name`, () => ({ title: 'Forged' })],
      [`${itemPath(ids.worksheet)}/name`, () => ({ title: 'Forged' })],
      [`${itemPath(ids.worksheet)}/file`, pdf],
      [`${itemPath(ids.worksheet)}/remove`, () => ({})],
      [`${lessonEditorPath(ids.quiz)}/remove`, () => ({})],
      [`${partPath(ids.decimals)}/remove`, () => ({})],
      [`${itemPath(ids.practice)}/restore`, () => ({})],
    ];
    const pages = [
      partPath(ids.fractions), itemPath(ids.worksheet), `${itemPath(ids.worksheet)}/remove`, `${lessonEditorPath(ids.quiz)}/remove`,
      `${partPath(ids.decimals)}/remove`, removedPath(),
    ];
    const before = await snapshot(worker);
    const stored = await storedBytes();
    for (const [who, c] of [['Shimaa', shimaa], ['the admin', admin], ['Salma', learner]] as const) {
      for (const path of pages) {
        const res = await c.get(path);
        assert.equal(res.status, 403, `${who}: GET ${path} refused`);
        const body = await res.text();
        assert.ok(body.includes(AR.noAccess), `${who}: GET ${path} gives the plain refusal`);
        for (const title of [NEW_MATERIAL, NEW_LESSON, 'Practice online']) assert.ok(!body.includes(title), `${who}: ${path} leaks nothing`);
      }
      for (const [path, body] of writes) assert.equal((await c.post(path, body())).status, 403, `${who}: POST ${path} refused`);
    }
    for (const [path, body] of writes) {
      assert.equal((await hadeerHttp.postWith(path, body(), { origin: 'https://evil.example' })).status, 403, `a forged cross-site POST ${path} from Hadeer's own session is refused`);
      assert.equal((await hadeerHttp.postWith(path, body(), {})).status, 403, `an origin-less POST ${path} is refused`);
    }
    assert.deepEqual(changes(before, await snapshot(worker)), {}, 'nothing of Hadeer\'s changed');
    assert.equal(await storedBytes(), stored, 'no file was stored');

    // By screen: Shimaa's browser on Hadeer's pages.
    const shimaaPhone = await phone(browser);
    await signIn(shimaaPhone.page, SHIMAA);
    const res = await shimaaPhone.page.goto(at(itemPath(ids.worksheet)));
    assert.equal(res?.status(), 403, 'Shimaa is refused on Hadeer\'s material page');
    assert.equal(await text(shimaaPhone.page, 'p.message'), AR.noAccess);
    await shot(shimaaPhone.page, '30-shimaa-refused-on-hadeers-material');
    await shimaaPhone.ctx.close();
    assert.equal((await hadeerHttp.post(`${itemPath(ids.practice)}/restore`, {})).status, 303, 'Hadeer herself restores it');
    for (const table of CONTENT_TABLES) assert.ok((await snapshot(worker))[table].length > 0);
  });

  it('AT-8.7 a plain GET to any address never removes, restores, renames or replaces anything: every GET and HEAD of every publisher route, with real ids, changes nothing', async () => {
    (globalThis as { __TEST_HOOKS__?: boolean }).__TEST_HOOKS__ = true;
    const { app, MIDDLEWARE } = await import('../../src/app.ts');
    const routes = (app.routes as { method: string; path: string; handler: unknown }[])
      .filter((r) => !(r.method === 'ALL' && MIDDLEWARE.has(r.handler)) && r.path.startsWith('/s/:spaceId/publish'));
    const writes = routes.filter((r) => r.method === 'POST').map((r) => r.path);
    for (const must of ['/remove', '/restore', '/name', '/file']) {
      assert.ok(writes.some((p) => p.endsWith(must)), `the publisher's ${must} writes exist (so this sweep is meaningful)`);
    }
    // One removed material, so the restore addresses point at something restorable.
    assert.equal((await hadeerHttp.post(`${itemPath(ids.practice)}/remove`, {})).status, 303);
    const real: Record<string, string[]> = {
      subjectId: [ids.math], chapterId: [ids.fractions, ids.decimals], lessonId: [ids.adding, ids.quiz, ids.place],
      materialId: [ids.worksheet, ids.practice, ids.remember],
    };
    const before = await snapshot(worker);
    const stored = await storedBytes();
    let sent = 0;
    for (const path of new Set(routes.map((r) => r.path))) {
      const names = [...path.matchAll(/:([A-Za-z]+)/g)].map((m) => m[1]).filter((n) => n !== 'spaceId');
      const choices = names.length ? real[names[0]] : [''];
      assert.ok(choices, `the sweep knows :${names[0]}`);
      for (const id of choices) {
        const address = path.replace(':spaceId', spaceId).replace(/:([A-Za-z]+)/, id).replace(/\/\*$/, '');
        for (const method of ['GET', 'HEAD']) {
          const res = await fetch(at(address), { method, redirect: 'manual', headers: { cookie: (await hadeer.ctx.cookies()).map((k) => `${k.name}=${k.value}`).join('; ') } });
          await res.arrayBuffer();
          assert.ok(res.status < 500, `${method} ${address}: no server error (${res.status})`);
          sent++;
        }
      }
    }
    assert.ok(sent >= 30, `the sweep sent ${sent} plain requests`);
    assert.deepEqual(changes(before, await snapshot(worker)), {}, 'no plain GET or HEAD changed anything');
    assert.equal(await storedBytes(), stored, 'and nothing was stored');
    assert.equal((await hadeerHttp.post(`${itemPath(ids.practice)}/restore`, {})).status, 303);
  });
});
