// AT-7 The admin tidies groups and subjects (release 1.1, contract 0.2, section 3).
// Drives the real admin pages in Chromium, at phone width, Arabic first and
// then the same screens in English, against the Worker running locally
// (Wrangler + workerd, local D1 and R2). The Worker's clock is set to midday
// UTC of today for the whole run, so end dates never cross midnight.
//
// Seeded (only what earlier acceptance tests already proved): the owner, Mesk
// School (مدرسة مسك) and its admin, and a second space (Delta Logistics) with
// its admin, through the owner's real forms (AT-1); Hadeer (publisher), two
// learners, the group Science and two published subjects of Hadeer's
// (Mathematics and Reading, each with a chapter, a lesson, a PDF and a note,
// both assigned to Science) through the test seeding route (the admin's and
// publisher's screens for these are proven by AT-2 and AT-3). Everything AT-7
// is about (renaming the group and the subject, refused names, removing a
// learner from the group, unassigning the group from a subject, re-adding
// both) goes through the admin's real screens in a real browser; the new names
// are read on the admin's, the publisher's and the learners' real pages, in
// Arabic and in English. Screenshots go to evidence/at-7/.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from 'playwright';
import { startWorker, type RunningWorker } from '../support/worker.ts';
import { Client, setClockOffsetMs, setStartOffset, workerNow } from '../support/http.ts';
import { appointAdmin, b64, createSpace, seed, setUpOwner, signedIn, tinyPdf } from '../support/seed.ts';
import { assertPage, follow, phone, readable, shot as shotIn, signIn as signInAt, submit, type Phone } from '../support/browser.ts';
import { changes, sha256, snapshot, type Snapshot } from '../support/state.ts';

const EVIDENCE = fileURLToPath(new URL('../../evidence/at-7/', import.meta.url));
const SPACE = 'مدرسة مسك';
const SPACE_B = 'Delta Logistics';
const ADMIN = { display_name: 'Amal Hassan', username: 'amal.admin', password: 'admin-first-pass', mobile: '01012345678' };
const ADMIN_B = { display_name: 'Basem Fawzy', username: 'basem.admin', password: 'admin-b-pass', mobile: '01087654321' };
interface Person { display_name: string; username: string; password: string; role: 'publisher' | 'learner'; mobile: string }
const HADEER: Person = { display_name: 'Hadeer', username: 'hadeer', password: 'hadeer-first-pass', role: 'publisher', mobile: '01022223333' };
const SALMA: Person = { display_name: 'Salma Adel', username: 'salma.learner', password: 'salma-first-pass', role: 'learner', mobile: '01033334444' };
const OMAR: Person = { display_name: 'عمر نبيل', username: 'omar.learner', password: 'omar-first-pass', role: 'learner', mobile: '01055556666' };
const PEOPLE = [HADEER, SALMA, OMAR];
const DAY = 86_400_000;

const OLD_SET = 'Science';
const NEW_SET = 'Science 5A';
const OLD_TOPIC = 'Mathematics';
const NEW_TOPIC = 'الرياضيات للصف الخامس'; // the subject's real name
const READING = 'Reading';
const READING_EN = 'Reading, Grade 5';
const MATH_PDF = tinyPdf('Adding fractions');
const READING_PDF = tinyPdf('First story');

// Plain messages, from the product dictionary (Arabic first).
const AR = {
  nameRefused: 'اكتب اسماً من 1 إلى 100 حرف، في سطر واحد. لم يتغيّر شيء.',
  renamed: 'تم الحفظ. يظهر الاسم الجديد في كل صفحة.',
  saved: 'تم الحفظ.',
  renameSet: 'تغيير اسم الـفصل',
  renameTopic: 'تغيير اسم الـمادّة',
};
const EN = {
  nameRefused: 'Type a name of 1 to 100 characters, on one line. Nothing was changed.',
  renamed: 'Saved. The new name shows on every page.',
  renameSet: 'Rename the Class',
  renameTopic: 'Rename the Subject',
};

let worker: RunningWorker;
let browser: Browser;
let amal: Phone;
let admin: Page;
let hadeer: Phone;
let salma: Phone;
let omar: Phone;
let spaceId = '';
let spaceB = '';
let today = '';
let start: Snapshot;
const ids: Record<string, string> = {};
const content: Record<string, string> = {};

const at = (path: string) => worker.url + path;
const plus = (days: number) => new Date(Date.parse(today + 'T00:00:00Z') + days * DAY).toISOString().slice(0, 10);
const shot = (page: Page, name: string) => shotIn(page, EVIDENCE, name);
const signIn = (page: Page, p: { username: string; password: string }) => signInAt(worker.url, page, p.username, p.password);
const CONTENT_TABLES = ['chapter', 'lesson', 'material'];

async function text(page: Page, selector: string): Promise<string> {
  return (await page.locator(selector).innerText()).trim();
}

async function errorText(page: Page): Promise<string> {
  return (await page.locator('#error').innerText()).trim();
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

async function openSet(): Promise<void> {
  await admin.goto(at(`/s/${spaceId}`));
  await follow(admin, '#concepts [data-concept="group"] a');
  assert.ok(admin.url().endsWith(`/s/${spaceId}/admin/sets`), 'the groups page');
  await follow(admin, `[data-set="${ids.science}"] a`);
  assert.ok(admin.url().includes(`/s/${spaceId}/admin/sets/${ids.science}`), 'the group\'s page');
}

async function openTopic(subjectId: string): Promise<void> {
  await admin.goto(at(`/s/${spaceId}`));
  await follow(admin, '#concepts [data-concept="subject"] a');
  assert.ok(admin.url().endsWith(`/s/${spaceId}/admin/topics`), 'the subjects page');
  await follow(admin, `[data-topic="${subjectId}"] a`);
  assert.ok(admin.url().includes(`/s/${spaceId}/admin/topics/${subjectId}`), 'the subject\'s page');
}

/** The subjects a learner's home lists (their titles). */
async function homeList(page: Page): Promise<string[]> {
  await page.goto(at(`/s/${spaceId}`));
  return page.locator('#my-list li').evaluateAll((els) => els.map((e) => (e.textContent ?? '').trim()));
}

/** Opens a direct link in the person's browser: a page is navigated to; a file
 * (which the browser would download or show in its PDF viewer) is fetched with
 * the same browser's cookies. Returns the status and the content type. */
async function open(page: Page, path: string): Promise<{ status: number; type: string }> {
  if (path.includes('/file/')) {
    const res = await page.request.get(at(path));
    return { status: res.status(), type: res.headers()['content-type'] ?? '' };
  }
  const res = await page.goto(at(path));
  return { status: res?.status() ?? 0, type: res?.headers()['content-type'] ?? '' };
}

/** Every direct link of a subject (the subject, its lesson, its file) answers 403 and no file bytes. */
async function assertRefusedEverywhere(page: Page, links: string[], where: string): Promise<void> {
  for (const path of links) {
    const res = await open(page, path);
    assert.equal(res.status, 403, `${where}: ${path} is refused`);
    assert.ok(!res.type.includes('pdf'), `${where}: ${path} sends no file bytes`);
  }
}

async function assertOpensEverywhere(page: Page, links: string[], where: string): Promise<void> {
  for (const path of links) assert.equal((await open(page, path)).status, 200, `${where}: ${path} opens`);
}

const mathLinks = () => [`/s/${spaceId}/learn/${content.math}`, `/s/${spaceId}/read/${content.mathLesson}`, `/s/${spaceId}/file/${content.mathPdf}`];
const readingLinks = () => [`/s/${spaceId}/learn/${content.reading}`, `/s/${spaceId}/read/${content.readingLesson}`, `/s/${spaceId}/file/${content.readingPdf}`];

/** The bytes a learner's browser receives for a file. */
async function fileBytes(page: Page, materialId: string): Promise<string> {
  const res = await page.request.get(at(`/s/${spaceId}/file/${materialId}`));
  assert.equal(res.status(), 200);
  return sha256(await res.body());
}

/** The (subject, group or learner) pairs of subject_access, without their row ids. */
const accessPairs = (s: Snapshot) => s.subject_access.map((r) => {
  const row = JSON.parse(r) as Record<string, unknown>;
  return `${row.subject_id}|${row.group_id ?? ''}|${row.user_id ?? ''}`;
}).sort();

async function chooseLanguage(page: Page, lang: 'ar' | 'en'): Promise<void> {
  await page.goto(at('/account/language'));
  await page.selectOption('form#language select[name=lang]', lang);
  assert.equal(await submit(page, 'form#language'), 303, `the language is now ${lang}`);
}

describe('AT-7 the admin tidies groups and subjects', { concurrency: false }, () => {
  before(async () => {
    mkdirSync(EVIDENCE, { recursive: true });
    worker = await startWorker();
    today = new Date(await workerNow(worker.url)).toISOString().slice(0, 10);
    // Midday UTC today, for the whole run.
    setStartOffset(worker.url, Date.parse(`${today}T12:00:00Z`) - Date.now());
    assert.equal((await setClockOffsetMs(worker.url, 0)).status, 200);
    const owner = await setUpOwner(worker.url);
    spaceId = await createSpace(owner, { name: SPACE, kit: 'school' });
    spaceB = await createSpace(owner, { name: SPACE_B, kit: 'company' });
    await appointAdmin(owner, spaceId, { ...ADMIN, valid_until: plus(60) });
    await appointAdmin(owner, spaceB, { ...ADMIN_B, valid_until: plus(60) });
    const s = await seed(worker.url, {
      spaceId,
      grantedBy: ADMIN.username,
      people: PEOPLE.map((p) => ({ ...p, valid_until: plus(30) })),
      groups: [{ name: OLD_SET, members: [SALMA.username, OMAR.username] }],
      subjects: [
        {
          title: OLD_TOPIC, publisher: HADEER.username, published: true, groups: [OLD_SET],
          chapters: [{ title: 'Fractions', lessons: [{ title: 'Adding fractions', materials: [
            { kind: 'pdf', title: 'Worksheet', base64: b64(MATH_PDF), contentType: 'application/pdf' },
            { kind: 'note', title: 'Remember', text: 'Add the tops, keep the bottom.' },
          ] }] }],
        },
        {
          title: READING, publisher: HADEER.username, published: true, groups: [OLD_SET],
          chapters: [{ title: 'Stories', lessons: [{ title: 'First story', materials: [
            { kind: 'pdf', title: 'Story sheet', base64: b64(READING_PDF), contentType: 'application/pdf' },
            { kind: 'note', title: 'Read aloud', text: 'Read it twice.' },
          ] }] }],
        },
      ],
    });
    const sB = await seed(worker.url, {
      spaceId: spaceB,
      grantedBy: ADMIN_B.username,
      groups: [{ name: 'Drivers', members: [] }],
      subjects: [{ title: 'Safety', published: false }],
    });
    Object.assign(ids, s.users, { science: s.groups[OLD_SET], drivers: sB.groups.Drivers, safety: sB.subjects.Safety.id });
    const math = s.subjects[OLD_TOPIC];
    const reading = s.subjects[READING];
    Object.assign(content, {
      math: math.id, mathLesson: math.chapters.Fractions.lessons['Adding fractions'].id,
      mathPdf: math.chapters.Fractions.lessons['Adding fractions'].materials.Worksheet,
      reading: reading.id, readingLesson: reading.chapters.Stories.lessons['First story'].id,
      readingPdf: reading.chapters.Stories.lessons['First story'].materials['Story sheet'],
    });
    browser = await chromium.launch();
    amal = await phone(browser);
    admin = amal.page;
    hadeer = await phone(browser);
    salma = await phone(browser);
    omar = await phone(browser);
    await signIn(admin, ADMIN);
    await signIn(hadeer.page, HADEER);
    await signIn(salma.page, SALMA);
    await signIn(omar.page, OMAR);
    start = await snapshot(worker);
  });

  after(async () => {
    if (worker) await setClockOffsetMs(worker.url, 0).catch(() => undefined);
    await browser?.close();
    await worker?.stop();
  });

  it('AT-7.1 the admin renames the group "Science" to "Science 5A"; an empty, a too-long and a two-line name are refused with a plain message and nothing is stored', async () => {
    assert.deepEqual((await homeList(salma.page)).sort(), [OLD_TOPIC, READING].sort(), 'positive control: the learner has both subjects through the group');
    await openSet();
    await assertSpacePage(admin, 'group page');
    assert.equal(await text(admin, '#set-name'), OLD_SET);
    assert.equal(await text(admin, '#rename-set-title'), AR.renameSet, 'the rename form uses the kit\'s word');
    assert.equal(await admin.inputValue('form#rename-set input[name=name]'), OLD_SET, 'the form starts with the current name');
    await shot(admin, '01-group-page-with-rename');

    const before = await snapshot(worker);
    for (const [value, why, name] of [
      ['', 'an empty name', '02-empty-group-name-refused'],
      ['S'.repeat(101), 'a name over 100 characters', '03-too-long-group-name-refused'],
      [`${OLD_SET}\u2028 5A`, 'a name on two lines', '04-two-line-group-name-refused'],
    ]) {
      await typeAround(admin, '#rename-set', 'name', value);
      assert.equal(await submit(admin, '#rename-set'), 400, `${why} is refused`);
      assert.equal(await errorText(admin), AR.nameRefused, `${why}: the plain message`);
      assert.equal(await text(admin, '#set-name'), OLD_SET, `${why}: the name is unchanged`);
      await assertSpacePage(admin, `${why} refused`);
      await shot(admin, name);
    }
    assert.deepEqual(changes(before, await snapshot(worker)), {}, 'nothing stored');

    await admin.fill('form#rename-set input[name=name]', NEW_SET);
    assert.equal(await submit(admin, '#rename-set'), 303, 'the new name is saved');
    assert.equal(await text(admin, '#done'), AR.renamed);
    assert.equal(await text(admin, '#set-name'), NEW_SET);
    await assertSpacePage(admin, 'renamed group');
    await shot(admin, '05-group-renamed');
    const diff = changes(before, await snapshot(worker));
    assert.deepEqual(Object.keys(diff), ['group'], 'only the group row changed');
    assert.equal(JSON.parse(diff.group.added[0]).name, NEW_SET);
    assert.equal(diff.group.removed.length, 1);
  });

  it('AT-7.2 the admin renames the subject "Mathematics" to its real name; refused names store nothing; the publisher\'s content is untouched', async () => {
    await openTopic(content.math);
    await assertSpacePage(admin, 'subject page');
    assert.equal(await text(admin, '#topic-title'), OLD_TOPIC);
    assert.equal(await text(admin, '#rename-topic-title'), AR.renameTopic, 'the rename form uses the kit\'s word');
    await shot(admin, '06-subject-page-with-rename');

    const before = await snapshot(worker);
    for (const [value, why] of [['   ', 'a blank name'], ['ر'.repeat(101), 'an Arabic name over 100 characters'], ['Mathe\u2029matics', 'a paragraph break']]) {
      await typeAround(admin, '#rename-topic', 'title', value);
      assert.equal(await submit(admin, '#rename-topic'), 400, `${why} is refused`);
      assert.equal(await errorText(admin), AR.nameRefused, `${why}: the plain message`);
      assert.equal(await text(admin, '#topic-title'), OLD_TOPIC);
    }
    await shot(admin, '07-subject-name-refused');
    assert.deepEqual(changes(before, await snapshot(worker)), {}, 'nothing stored');

    await admin.fill('form#rename-topic input[name=title]', NEW_TOPIC);
    assert.equal(await submit(admin, '#rename-topic'), 303);
    assert.equal(await text(admin, '#done'), AR.renamed);
    assert.equal(await text(admin, '#topic-title'), NEW_TOPIC);
    await assertSpacePage(admin, 'renamed subject');
    await shot(admin, '08-subject-renamed');
    const diff = changes(before, await snapshot(worker));
    assert.deepEqual(Object.keys(diff), ['subject'], 'only the subject row changed');
    const [was, now] = [JSON.parse(diff.subject.removed[0]), JSON.parse(diff.subject.added[0])];
    assert.deepEqual({ ...now, title: was.title }, was, 'only its title changed: publisher, published state and id are kept');
    assert.equal(now.title, NEW_TOPIC);
    const after = await snapshot(worker);
    for (const table of CONTENT_TABLES) assert.deepEqual(after[table], start[table], `the publisher's ${table} rows are untouched`);
  });

  it('AT-7.3 the new names show everywhere at once: the admin\'s, the publisher\'s and the learners\' pages, in Arabic and in English', async () => {
    // The admin's pages.
    await admin.goto(at(`/s/${spaceId}/admin/sets`));
    assert.equal(await text(admin, `[data-set="${ids.science}"] a`), NEW_SET, 'the groups list');
    await admin.goto(at(`/s/${spaceId}/admin/topics`));
    assert.equal(await text(admin, `[data-topic="${content.math}"] a`), NEW_TOPIC, 'the subjects list');
    await admin.goto(at(`/s/${spaceId}/admin/topics/${content.reading}`));
    const readers = await text(admin, 'form#topic-access');
    assert.ok(readers.includes(NEW_SET), 'the group\'s new name among a subject\'s readers');
    const adminText = await readable(admin);
    assert.ok(!adminText.split('\n').some((l) => l.trim() === OLD_SET), 'the old group name is gone');
    await assertSpacePage(admin, 'subject readers with the new group name');
    await shot(admin, '09-admin-pages-new-names');

    // The publisher's pages.
    const p = hadeer.page;
    await p.goto(at(`/s/${spaceId}/publish`));
    let list = await text(p, '#publisher-list');
    assert.ok(list.includes(NEW_TOPIC) && !list.includes(OLD_TOPIC), 'the publisher\'s home');
    await assertSpacePage(p, 'publisher home');
    await shot(p, '10-publisher-home-new-name');
    await p.goto(at(`/s/${spaceId}/publish/edit/${content.math}`));
    assert.equal(await text(p, '#subject-title'), NEW_TOPIC, 'the publisher\'s editor');
    await p.goto(at(`/s/${spaceId}/publish/compose/${content.mathLesson}`));
    assert.equal(await text(p, '#back-subject'), NEW_TOPIC, 'the lesson editor\'s trail');

    // The learner's pages.
    const l = salma.page;
    assert.deepEqual((await homeList(l)).sort(), [NEW_TOPIC, READING].sort(), 'the learner\'s home');
    await assertSpacePage(l, 'learner home');
    await shot(l, '11-learner-home-new-name');
    await l.goto(at(`/s/${spaceId}/learn/${content.math}`));
    assert.equal(await text(l, '#subject-title'), NEW_TOPIC, 'the subject page');
    await l.goto(at(`/s/${spaceId}/read/${content.mathLesson}`));
    assert.ok((await text(l, '#trail')).includes(NEW_TOPIC), 'the lesson page\'s trail');
    await shot(l, '12-learner-lesson-new-name');
    for (const page of [p, l]) assert.ok(!(await readable(page)).includes(OLD_TOPIC), 'the old title is gone');

    // The same pages in English.
    await chooseLanguage(p, 'en');
    await chooseLanguage(l, 'en');
    await p.goto(at(`/s/${spaceId}/publish`));
    list = await text(p, '#publisher-list');
    assert.ok(list.includes(NEW_TOPIC) && !list.includes(OLD_TOPIC), 'the publisher\'s home in English');
    await assertSpacePage(p, 'publisher home (English)', 'en');
    await shot(p, '13-en-publisher-home-new-name');
    await p.goto(at(`/s/${spaceId}/publish/edit/${content.math}`));
    assert.equal(await text(p, '#subject-title'), NEW_TOPIC);
    assert.deepEqual((await homeList(l)).sort(), [NEW_TOPIC, READING].sort(), 'the learner\'s home in English');
    await assertSpacePage(l, 'learner home (English)', 'en');
    await l.goto(at(`/s/${spaceId}/read/${content.mathLesson}`));
    assert.ok((await text(l, '#trail')).includes(NEW_TOPIC));
    await assertSpacePage(l, 'learner lesson (English)', 'en');
    await shot(l, '14-en-learner-lesson-new-name');
  });

  it('AT-7.4 the admin removes one learner from the group: she loses its subjects at her next page and on every direct link; the other learner keeps them; content untouched', async () => {
    await assertOpensEverywhere(salma.page, [...mathLinks(), ...readingLinks()], 'positive control');
    await openSet();
    const before = await snapshot(worker);
    await admin.locator(`form#set-members input[name=member][value="${ids[SALMA.username]}"]`).uncheck();
    await shot(admin, '15-learner-unticked');
    assert.equal(await submit(admin, '#set-members'), 303, 'the group is saved');
    assert.equal(await text(admin, '#done'), AR.saved);
    assert.ok(!(await admin.locator(`form#set-members input[value="${ids[SALMA.username]}"]`).isChecked()), 'she is no longer a member');
    await assertSpacePage(admin, 'group without the learner');
    await shot(admin, '16-learner-removed-from-group');
    const diff = changes(before, await snapshot(worker));
    assert.deepEqual(Object.keys(diff), ['group_member'], 'only her group membership changed');
    assert.deepEqual([diff.group_member.removed.length, diff.group_member.added.length], [1, 0]);
    assert.equal(JSON.parse(diff.group_member.removed[0]).user_id, ids[SALMA.username]);

    // Her next page, with the sign-in she already had.
    assert.deepEqual(await homeList(salma.page), [], 'her home lists nothing now');
    assert.equal(await salma.page.locator('#nothing-yet').count(), 1);
    await assertSpacePage(salma.page, 'learner home after removal', 'en');
    await shot(salma.page, '17-removed-learner-home');
    await assertRefusedEverywhere(salma.page, [...mathLinks(), ...readingLinks()], 'the removed learner');
    await shot(salma.page, '18-removed-learner-direct-link-refused');
    assert.deepEqual((await homeList(omar.page)).sort(), [NEW_TOPIC, READING].sort(), 'the other learner keeps both');
    await assertOpensEverywhere(omar.page, [...mathLinks(), ...readingLinks()], 'the other learner');
  });

  it('AT-7.5 the admin unassigns the group from one subject: its learners lose that subject at their next page and on every direct link, and keep the other', async () => {
    await openTopic(content.reading);
    const before = await snapshot(worker);
    await admin.locator(`form#topic-access input[name=set][value="${ids.science}"]`).uncheck();
    assert.equal(await submit(admin, '#topic-access'), 303, 'the subject\'s readers are saved');
    assert.equal(await text(admin, '#done'), AR.saved);
    await assertSpacePage(admin, 'subject without the group');
    await shot(admin, '19-group-unassigned-from-subject');
    const diff = changes(before, await snapshot(worker));
    assert.deepEqual(Object.keys(diff), ['subject_access'], 'only the assignment changed');
    assert.deepEqual([diff.subject_access.removed.length, diff.subject_access.added.length], [1, 0]);
    assert.equal(JSON.parse(diff.subject_access.removed[0]).group_id, ids.science);

    assert.deepEqual(await homeList(omar.page), [NEW_TOPIC], 'the group\'s learner keeps only the other subject');
    await assertSpacePage(omar.page, 'learner home after unassigning');
    await shot(omar.page, '20-unassigned-group-learner-home');
    await assertRefusedEverywhere(omar.page, readingLinks(), 'the unassigned group\'s learner');
    await assertOpensEverywhere(omar.page, mathLinks(), 'the other subject');
    // The publisher still has her subject, and its content is untouched.
    assert.equal((await hadeer.page.goto(at(`/s/${spaceId}/publish/edit/${content.reading}`)))?.status(), 200, 'the publisher still edits it');
    const after = await snapshot(worker);
    for (const table of CONTENT_TABLES) assert.deepEqual(after[table], start[table], `the publisher's ${table} rows are untouched`);
  });

  it('AT-7.6 re-adding the learner to the group and the group to the subject restores access with nothing lost', async () => {
    await openSet();
    await admin.locator(`form#set-members input[name=member][value="${ids[SALMA.username]}"]`).check();
    assert.equal(await submit(admin, '#set-members'), 303);
    await openTopic(content.reading);
    await admin.locator(`form#topic-access input[name=set][value="${ids.science}"]`).check();
    assert.equal(await submit(admin, '#topic-access'), 303);
    await shot(admin, '21-group-reassigned');

    for (const [who, page] of [['Salma', salma.page], ['Omar', omar.page]] as const) {
      assert.deepEqual((await homeList(page)).sort(), [NEW_TOPIC, READING].sort(), `${who} has both subjects again`);
      await assertOpensEverywhere(page, [...mathLinks(), ...readingLinks()], `${who} after re-adding`);
    }
    await shot(salma.page, '22-readded-learner-home');
    assert.equal(await fileBytes(salma.page, content.mathPdf), sha256(MATH_PDF), 'the same file bytes');
    assert.equal(await fileBytes(omar.page, content.readingPdf), sha256(READING_PDF), 'the same file bytes');

    const end = await snapshot(worker);
    for (const table of CONTENT_TABLES) assert.deepEqual(end[table], start[table], `the ${table} rows are exactly as before`);
    assert.deepEqual(end.group_member, start.group_member, 'the same group members as before');
    assert.deepEqual(accessPairs(end), accessPairs(start), 'the same assignments as before');
    for (const table of ['user', 'membership']) assert.deepEqual(end[table].length, start[table].length, `nothing lost from ${table}`);
  });

  it('AT-7.7 the same screens in English: a refused name says so in English, a rename shows on the learner\'s English page', async () => {
    await chooseLanguage(admin, 'en');
    await openSet();
    await assertSpacePage(admin, 'group page (English)', 'en');
    assert.equal(await text(admin, '#rename-set-title'), EN.renameSet);
    const before = await snapshot(worker);
    await typeAround(admin, '#rename-set', 'name', '');
    assert.equal(await submit(admin, '#rename-set'), 400);
    assert.equal(await errorText(admin), EN.nameRefused);
    await assertSpacePage(admin, 'refused name (English)', 'en');
    await shot(admin, '23-en-empty-name-refused');
    assert.deepEqual(changes(before, await snapshot(worker)), {}, 'nothing stored');

    await openTopic(content.reading);
    assert.equal(await text(admin, '#rename-topic-title'), EN.renameTopic);
    await admin.fill('form#rename-topic input[name=title]', READING_EN);
    assert.equal(await submit(admin, '#rename-topic'), 303);
    assert.equal(await text(admin, '#done'), EN.renamed);
    await assertSpacePage(admin, 'renamed (English)', 'en');
    await shot(admin, '24-en-subject-renamed');
    assert.deepEqual((await homeList(salma.page)).sort(), [NEW_TOPIC, READING_EN].sort(), 'the learner\'s English home shows it at once');
    await shot(salma.page, '25-en-learner-home-renamed');
    await chooseLanguage(omar.page, 'ar');
    assert.deepEqual((await homeList(omar.page)).sort(), [NEW_TOPIC, READING_EN].sort(), 'and the other learner\'s Arabic home');
    await assertSpacePage(omar.page, 'learner home (Arabic)');
  });

  it('AT-7.8 only an admin of that space may rename, remove or unassign: a publisher, a learner, another space\'s admin and forged posts are refused; names are bounded at request level', async () => {
    const adminC = await signedIn(worker.url, ADMIN.username, ADMIN.password);
    const publisherC = await signedIn(worker.url, HADEER.username, HADEER.password);
    const learnerC = await signedIn(worker.url, SALMA.username, SALMA.password);
    const adminB = await signedIn(worker.url, ADMIN_B.username, ADMIN_B.password);
    const set = `/s/${spaceId}/admin/sets/${ids.science}`;
    const topic = `/s/${spaceId}/admin/topics/${content.math}`;
    const writes: [string, Record<string, string>][] = [
      [`${set}/name`, { name: 'Forged' }],
      [`${topic}/name`, { title: 'Forged' }],
      [set, {}], // removes every member
      [topic, { publisher: '' }], // unassigns every reader
    ];
    const before = await snapshot(worker);
    const attempts: [string, () => Promise<Response>][] = [];
    for (const [path, fields] of writes) {
      for (const [who, c] of [['a publisher', publisherC], ['a learner', learnerC], ['another space\'s admin', adminB]] as const) {
        attempts.push([`${who}: POST ${path}`, () => c.post(path, fields)]);
      }
      attempts.push([`a forged cross-origin POST ${path}`, () => adminC.postWith(path, fields, { origin: 'https://evil.example' })]);
      attempts.push([`an origin-less POST ${path}`, () => adminC.postWith(path, fields, {})]);
    }
    // Another space's admin, with this space's ids under their own space's address.
    attempts.push(['another space\'s admin, own address, group name', () => adminB.post(`/s/${spaceB}/admin/sets/${ids.science}/name`, { name: 'Forged' })]);
    attempts.push(['another space\'s admin, own address, subject name', () => adminB.post(`/s/${spaceB}/admin/topics/${content.math}/name`, { title: 'Forged' })]);
    attempts.push(['another space\'s admin, own address, group members', () => adminB.post(`/s/${spaceB}/admin/sets/${ids.science}`, {})]);
    attempts.push(['another space\'s admin, own address, subject readers', () => adminB.post(`/s/${spaceB}/admin/topics/${content.math}`, { publisher: '' })]);
    // This space's admin, with the other space's ids under this space's address.
    attempts.push(['this admin on another space\'s group', () => adminC.post(`/s/${spaceId}/admin/sets/${ids.drivers}/name`, { name: 'Forged' })]);
    attempts.push(['this admin on another space\'s subject', () => adminC.post(`/s/${spaceId}/admin/topics/${ids.safety}/name`, { title: 'Forged' })]);
    for (const [what, send] of attempts) assert.equal((await send()).status, 403, `${what}: refused`);
    assert.deepEqual(changes(before, await snapshot(worker)), {}, 'nothing changed');

    // The bounds, at request level: empty, blank, over 100 characters, more than one line, controls.
    for (const [value, why] of [
      ['', 'empty'], ['   ', 'blank'], ['x'.repeat(101), '101 characters'], ['ع'.repeat(101), '101 Arabic letters'],
      ['Science\n5A', 'a line break'], ['Science\r\n5A', 'a carriage return'], ['Science\t5A', 'a tab'],
      ['Science\u20285A', 'a line separator'], ['\u202ESience', 'a bidirectional control'],
    ]) {
      for (const [path, field] of [[`${set}/name`, 'name'], [`${topic}/name`, 'title']]) {
        const res = await adminC.post(path, { [field]: value });
        assert.equal(res.status, 400, `${path}: ${why} is refused`);
      }
    }
    assert.deepEqual(changes(before, await snapshot(worker)), {}, 'nothing stored by any refused name');
    // Exactly 100 characters (counted as characters, not code units) is accepted.
    for (const name of ['x'.repeat(100), '😀'.repeat(100)]) {
      assert.equal((await adminC.post(`${set}/name`, { name })).status, 303, `${[...name].length} characters accepted`);
      assert.equal((await worker.sql(`SELECT name FROM "group" WHERE id = '${ids.science}'`))[0].name, name);
    }
    assert.equal((await adminC.post(`${set}/name`, { name: `  ${NEW_SET}  ` })).status, 303, 'spaces around a name are trimmed');
    assert.equal((await worker.sql(`SELECT name FROM "group" WHERE id = '${ids.science}'`))[0].name, NEW_SET);
    // Another space's rows were never touched.
    const other = await worker.sql(`SELECT g.name AS g, s.title AS s FROM "group" g, subject s WHERE g.id = '${ids.drivers}' AND s.id = '${ids.safety}'`);
    assert.deepEqual(other[0], { g: 'Drivers', s: 'Safety' });
  });
});
