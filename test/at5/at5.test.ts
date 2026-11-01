// AT-5 The kit changes every word, and no code changes (contract 0.3, section 3).
// Drives the real owner, admin, publisher and learner pages in Chromium, at
// phone width and Arabic first, against the Worker running locally (Wrangler +
// workerd, local D1 and R2). Nothing is seeded: Mesk School, its people, the
// group Science, the subject Mathematics and its content are made through the
// real screens of AT-1 (owner), AT-2 (admin) and AT-3 (publisher). Then the
// owner creates Delta Logistics on the Company kit, switches Mesk School to the
// Company kit (with the confirm step) and renames Trainer to Coach / مرشد.
//
// "No code changes" is checked three ways around the owner's kit change:
// - the code: the same commit, no change on disk to the code or its
//   configuration, and the production bundle (built as a deploy builds it)
//   hashes to the same bytes;
// - the running Worker: the same instance served the pages before and after
//   (the test build's boot identity is unchanged, so nothing was reloaded or
//   redeployed);
// - the data: every row of every product table is compared before and after;
//   the only rows that changed are this space's own kit row.
// Screenshots go to evidence/at-5/.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from 'playwright';
import { startWorker, type RunningWorker } from '../support/worker.ts';
import { Client, tinyPng, workerNow } from '../support/http.ts';
import { tinyPdf } from '../support/seed.ts';
import { assertPage, follow, hasWord, phone, readable, shot as shotIn, signIn as signInAt, submit, type Phone } from '../support/browser.ts';
import { changes, codeIdentity, productionBundleHash, sha256, snapshot, solidPng, type Snapshot } from '../support/state.ts';

const EVIDENCE = fileURLToPath(new URL('../../evidence/at-5/', import.meta.url));
const MESK = 'مدرسة مسك';
const DELTA = 'Delta Logistics';
const OWNER = { username: 'owner', password: 'owner-pass-2026', mobile: '+201000000001' };
const ADMIN = { display_name: 'Amal Hassan', username: 'amal.admin', password: 'admin-first-pass', mobile: '01012345678' };
const DELTA_ADMIN = { display_name: 'Basem Fawzy', username: 'basem.admin', password: 'admin-b-pass', mobile: '01087654321' };
interface Person { display_name: string; username: string; password: string; role: 'publisher' | 'learner'; mobile: string }
const HADEER: Person = { display_name: 'Hadeer', username: 'hadeer', password: 'hadeer-first-pass', role: 'publisher', mobile: '01022223333' };
const SHIMAA: Person = { display_name: 'Shimaa', username: 'shimaa', password: 'shimaa-first-pass', role: 'publisher', mobile: '01066667777' };
const SALMA: Person = { display_name: 'Salma Adel', username: 'salma.learner', password: 'salma-first-pass', role: 'learner', mobile: '01033334444' };
const OMAR: Person = { display_name: 'Omar Nabil', username: 'omar.learner', password: 'omar-first-pass', role: 'learner', mobile: '01055556666' };
const PEOPLE = [HADEER, SHIMAA, SALMA, OMAR];
const VIDEO_URL = 'https://www.youtube.com/watch?v=fractions101';
const WEB_URL = 'https://example.org/fractions/adding';
const NOTE = 'Add the tops, keep the bottom: 1/4 + 2/4 = 3/4.';
const PDF = tinyPdf('Adding fractions');
const PNG = tinyPng();
const RED_LOGO = solidPng(138, 28, 18);

// The words people see. School kit before; Company kit with Coach after.
const SCHOOL_AR = { publisher: 'معلّم', learner: 'طالب', group: 'فصل', subject: 'مادّة', chapter: 'وحدة', lesson: 'درس', admin: 'مدير' };
const AFTER_AR = { publisher: 'مرشد', learner: 'موظّف', group: 'فريق', subject: 'دورة', chapter: 'وحدة', lesson: 'جلسة' };
const AFTER_EN = { publisher: 'Coach', learner: 'Employee', group: 'Team', subject: 'Course', chapter: 'Module', lesson: 'Session' };
/** Words that must be gone from every Mesk page after the change (the old kit's, and the Company word that was renamed). */
const GONE = ['معلّم', 'طالب', 'فصل', 'مادّة', 'درس', 'مدير', 'مدرّب'];

let worker: RunningWorker;
let browser: Browser;
let owner: Phone;
let amal: Phone;
let hadeer: Phone;
let salma: Phone;
let mesk = '';
let delta = '';
let today = '';
const ids: Record<string, string> = {};
let subjectId = '';
let lessonId = '';
let contentBefore: Snapshot;
let lessonBefore: LessonSeen;
let codeBefore: { commit: string; uncommitted: string; bundle: string; boot: unknown };
let dataBefore: Snapshot;

const at = (path: string) => worker.url + path;
const plus = (days: number) => new Date(Date.parse(today + 'T00:00:00Z') + days * 86_400_000).toISOString().slice(0, 10);
const shot = (page: Page, name: string) => shotIn(page, EVIDENCE, name);
const signIn = (page: Page, username: string, password: string) => signInAt(worker.url, page, username, password);

/** The running Worker instance's identity (test builds only); checked in AT-5.5. */
async function bootId(): Promise<unknown> {
  const res = await fetch(at('/__test/clock'));
  return ((await res.json()) as { boot?: unknown }).boot;
}

async function kitRow(spaceId: string): Promise<{ id: string; name: string; json: Record<string, any> }> {
  const rows = await worker.sql(`SELECT k.id, k.name, k.json FROM kit k JOIN space s ON s.kit_id = k.id WHERE s.id = '${spaceId}'`);
  assert.equal(rows.length, 1, 'one kit row per space');
  return { id: String(rows[0].id), name: String(rows[0].name), json: JSON.parse(String(rows[0].json)) };
}

/** The space's people, groups, assignments and content: everything a kit switch must leave alone. */
async function content(spaceId: string): Promise<Snapshot> {
  const tables = ['membership', 'group', 'group_member', 'subject', 'subject_access', 'chapter', 'lesson', 'material'];
  const results = await worker.sqlAll(tables.map((t) => `SELECT * FROM "${t}" WHERE space_id = '${spaceId}'`).join('; '));
  return Object.fromEntries(tables.map((t, i) => [t, results[i].map((r) => JSON.stringify(r)).sort()]));
}

interface LessonSeen {
  trailTitles: string[];
  title: string;
  items: { kind: string; title: string; href: string; note: string }[];
  files: Record<string, string>;
}

/** The first learner opens Mathematics, Fractions, Adding fractions, and every material in it. */
async function openTheLesson(p: Phone, lang: 'ar' | 'en'): Promise<LessonSeen> {
  const page = p.page;
  await page.goto(at(`/s/${mesk}`));
  await assertPage(page, 'learner home', lang);
  await follow(page, '#my-list a');
  assert.equal((await page.locator('h1#subject-title').innerText()).trim(), 'Mathematics');
  assert.equal((await page.locator('#outline [data-chapter] .title').first().innerText()).trim(), 'Fractions');
  await follow(page, '#outline a[data-lesson]');
  await assertPage(page, 'lesson page', lang);
  const items = await page.locator('#items > li').evaluateAll((els) => els.map((e) => ({
    kind: e.getAttribute('data-kind') ?? '',
    title: (e.querySelector('.title') as HTMLElement | null)?.innerText.trim() ?? '',
    href: e.querySelector('a.open')?.getAttribute('href') ?? '',
    note: (e.querySelector('.note') as HTMLElement | null)?.innerText ?? '',
  })));
  const files: Record<string, string> = {};
  for (const item of items.filter((i) => i.kind === 'pdf' || i.kind === 'image')) {
    const res = await p.ctx.request.get(at(item.href));
    assert.equal(res.status(), 200, `${item.title} opens from our storage`);
    files[item.title] = sha256(await res.body());
  }
  return {
    trailTitles: await page.locator('#trail bdi').allInnerTexts(),
    title: (await page.locator('h1#lesson-title').innerText()).trim(),
    items,
    files,
  };
}

/** Visits a Mesk page and checks its words: the expected ones are there, the old ones are gone. */
async function wordsOn(page: Page, path: string, where: string, expected: string[], lang: 'ar' | 'en' = 'ar'): Promise<string> {
  const res = await page.goto(at(path));
  assert.equal(res?.status(), 200, `${where} opens`);
  await assertPage(page, where, lang);
  const text = await readable(page);
  for (const w of expected) assert.ok(hasWord(text, w), `${where} says ${w}`);
  for (const w of GONE) assert.ok(!hasWord(text, w), `${where} no longer says ${w}`);
  return text;
}

async function fillAppoint(page: Page, p: Person, end: string): Promise<void> {
  await page.fill('form#appoint input[name=display_name]', p.display_name);
  await page.fill('form#appoint input[name=username]', p.username);
  await page.fill('form#appoint input[name=password]', p.password);
  await page.selectOption('form#appoint select[name=role]', p.role);
  await page.fill('form#appoint input[name=mobile]', p.mobile);
  await page.fill('form#appoint input[name=valid_until]', end);
}

async function ownerCreatesSpace(v: { name: string; kit: string; languages: string; color: string }): Promise<string> {
  const page = owner.page;
  await page.goto(at('/owner'));
  await follow(page, 'a#new-space');
  await page.fill('form#new-space input[name=name]', v.name);
  await page.selectOption('form#new-space select[name=kit]', v.kit);
  await page.selectOption('form#new-space select[name=languages]', v.languages);
  await page.setInputFiles('form#new-space input[name=logo]', { name: 'logo.png', mimeType: 'image/png', buffer: Buffer.from(PNG) });
  await page.fill('form#new-space input[name=primary_color]', v.color);
  assert.equal(await submit(page, 'form#new-space'), 302, `${v.name} created`);
  const id = page.url().split('/').pop() ?? '';
  assert.match(page.url(), /\/owner\/spaces\/[^/]+$/, 'the space\'s own page');
  return id;
}

async function ownerAppointsAdmin(spaceId: string, a: typeof ADMIN, end: string): Promise<void> {
  const page = owner.page;
  await page.goto(at(`/owner/spaces/${spaceId}`));
  await page.fill('form#appoint-admin input[name=display_name]', a.display_name);
  await page.fill('form#appoint-admin input[name=username]', a.username);
  await page.fill('form#appoint-admin input[name=password]', a.password);
  await page.fill('form#appoint-admin input[name=mobile]', a.mobile);
  await page.fill('form#appoint-admin input[name=valid_until]', end);
  assert.equal(await submit(page, 'form#appoint-admin'), 302, `${a.username} appointed`);
}

async function userId(username: string): Promise<string> {
  const rows = await worker.sql(`SELECT id FROM user WHERE username = '${username}'`);
  assert.equal(rows.length, 1, `${username} exists`);
  return String(rows[0].id);
}

async function tiles(page: Page): Promise<string[]> {
  return (await page.locator('#concepts li').allInnerTexts()).map((s) => s.trim());
}

describe('AT-5 the kit changes every word, and no code changes', { concurrency: false }, () => {
  before(async () => {
    mkdirSync(EVIDENCE, { recursive: true });
    worker = await startWorker();
    today = new Date(await workerNow(worker.url)).toISOString().slice(0, 10);
    browser = await chromium.launch();
    owner = await phone(browser);
    amal = await phone(browser);
    hadeer = await phone(browser);
    salma = await phone(browser);
  });

  after(async () => {
    await browser?.close();
    await worker?.stop();
  });

  it('AT-5.1 Mesk School is made through the real screens: the owner shapes it, the admin staffs it, Hadeer builds and publishes the lesson', async () => {
    // The owner (AT-1 screens), in Arabic at phone width.
    await owner.page.goto(at('/'));
    assert.match(owner.page.url(), /\/setup$/);
    await owner.page.fill('form#setup input[name=username]', OWNER.username);
    await owner.page.fill('form#setup input[name=password]', OWNER.password);
    await owner.page.fill('form#setup input[name=mobile]', OWNER.mobile);
    assert.equal(await submit(owner.page, 'form#setup'), 200, 'owner account created');
    await follow(owner.page, 'a#continue');
    mesk = await ownerCreatesSpace({ name: MESK, kit: 'school', languages: 'ar,en', color: '#0b6e4f' });
    await assertPage(owner.page, 'owner\'s space page', 'ar');
    await ownerAppointsAdmin(mesk, ADMIN, plus(60));

    // The admin (AT-2 screens).
    await signIn(amal.page, ADMIN.username, ADMIN.password);
    assert.ok(amal.page.url().endsWith(`/s/${mesk}`), 'the admin lands in the space');
    assert.deepEqual(await tiles(amal.page), [SCHOOL_AR.publisher, SCHOOL_AR.learner, SCHOOL_AR.group, SCHOOL_AR.subject], 'School kit words');
    await amal.page.goto(at(`/s/${mesk}/admin/people`));
    for (const p of PEOPLE) {
      await fillAppoint(amal.page, p, plus(30));
      assert.equal(await submit(amal.page, 'form#appoint'), 303, `${p.display_name} appointed`);
      ids[p.username] = await userId(p.username);
    }
    await amal.page.goto(at(`/s/${mesk}/admin/sets`));
    await amal.page.fill('form#new-set input[name=name]', 'Science');
    await amal.page.check(`form#new-set input[name=member][value="${ids[SALMA.username]}"]`);
    assert.equal(await submit(amal.page, 'form#new-set'), 303, 'group Science formed');
    await amal.page.goto(at(`/s/${mesk}/admin/topics`));
    await amal.page.fill('form#new-topic input[name=title]', 'Mathematics');
    await amal.page.selectOption('form#new-topic select[name=publisher]', ids[HADEER.username]);
    assert.equal(await submit(amal.page, 'form#new-topic'), 303, 'Mathematics created');
    subjectId = amal.page.url().split('/').pop()!.split('?')[0];
    await amal.page.check('form#topic-access input[name=set]');
    assert.equal(await submit(amal.page, 'form#topic-access'), 303, 'Science assigned');

    // Hadeer (AT-3 screens).
    await signIn(hadeer.page, HADEER.username, HADEER.password);
    await follow(hadeer.page, '#publisher-list a.edit');
    await hadeer.page.fill('form#add-chapter input[name=title]', 'Fractions');
    assert.equal(await submit(hadeer.page, 'form#add-chapter'), 303);
    await hadeer.page.locator('#outline [data-chapter] form.add-lesson input[name=title]').fill('Adding fractions');
    assert.equal(await submit(hadeer.page, '#outline [data-chapter] >> nth=0 >> form.add-lesson'), 303);
    await follow(hadeer.page, '#outline a[data-lesson]');
    lessonId = hadeer.page.url().split('/').pop()!.split('#')[0];
    const lp = hadeer.page;
    await lp.fill('form#add-file input[name=title]', 'Worksheet (PDF)');
    await lp.setInputFiles('form#add-file input[name=file]', { name: 'worksheet.pdf', mimeType: 'application/pdf', buffer: Buffer.from(PDF) });
    assert.equal(await submit(lp, 'form#add-file'), 303);
    await lp.fill('form#add-file input[name=title]', 'Pizza slices');
    await lp.setInputFiles('form#add-file input[name=file]', { name: 'pizza.png', mimeType: 'image/png', buffer: Buffer.from(PNG) });
    assert.equal(await submit(lp, 'form#add-file'), 303);
    await lp.fill('form#add-video input[name=title]', 'Watch: adding fractions');
    await lp.fill('form#add-video input[name=url]', VIDEO_URL);
    assert.equal(await submit(lp, 'form#add-video'), 303);
    await lp.fill('form#add-link input[name=title]', 'Practice online');
    await lp.fill('form#add-link input[name=url]', WEB_URL);
    assert.equal(await submit(lp, 'form#add-link'), 303);
    await lp.fill('form#add-note input[name=title]', 'Remember');
    await lp.fill('form#add-note textarea[name=text]', NOTE);
    assert.equal(await submit(lp, 'form#add-note'), 303);
    await follow(lp, 'a#back-subject');
    assert.equal(await submit(lp, 'form#publish'), 303, 'published');

    // Before the change: the School words, and what the first learner reads.
    await amal.page.goto(at(`/s/${mesk}`));
    await assertPage(amal.page, 'admin home before', 'ar');
    await shot(amal.page, '01-before-admin-home-school-words');
    await hadeer.page.goto(at(`/s/${mesk}`));
    assert.ok(hasWord(await readable(hadeer.page), SCHOOL_AR.subject), 'the publisher home says مادّة');
    await shot(hadeer.page, '02-before-publisher-home');
    await signIn(salma.page, SALMA.username, SALMA.password);
    lessonBefore = await openTheLesson(salma, 'ar');
    assert.deepEqual(lessonBefore.items.map((i) => i.kind), ['pdf', 'image', 'video_link', 'link', 'note'], 'five materials in order');
    assert.equal(Object.keys(lessonBefore.files).length, 2);
    assert.ok(hasWord(await readable(salma.page), SCHOOL_AR.lesson), 'the lesson page says درس');
    await shot(salma.page, '03-before-learner-lesson');
    contentBefore = await content(mesk);
    assert.equal(contentBefore.material.length, 5);
  });

  it('AT-5.2 the owner creates Delta Logistics on the Company kit; its admin sees Trainer, Employee, Team, Course', async () => {
    delta = await ownerCreatesSpace({ name: DELTA, kit: 'company', languages: 'en,ar', color: '#1f3a93' });
    await ownerAppointsAdmin(delta, DELTA_ADMIN, plus(60));
    const basem = await phone(browser, 'en-US');
    await signIn(basem.page, DELTA_ADMIN.username, DELTA_ADMIN.password);
    await assertPage(basem.page, 'Delta admin home', 'en');
    assert.deepEqual(await tiles(basem.page), ['Trainer', 'Employee', 'Team', 'Course']);
    await shot(basem.page, '04-before-delta-admin-home-trainer');
    await basem.ctx.close();
  });

  it('AT-5.3 the owner opens Mesk School\'s kit and switches it to the Company kit, after a warning and a confirm step on the page', async () => {
    const page = owner.page;
    await page.goto(at(`/owner/spaces/${mesk}`));
    // Everything before the owner's kit change, for AT-5.5.
    codeBefore = { ...codeIdentity(), bundle: productionBundleHash(), boot: await bootId() };
    dataBefore = await snapshot(worker);
    const kitBefore = await kitRow(mesk);

    await assertPage(page, 'owner\'s space page with the kit editor', 'ar');
    assert.equal((await page.locator('#kit-name').innerText()).trim(), 'مدرسة', 'the current kit is School');
    assert.equal(await page.inputValue('form#labels input[name="ar.publisher"]'), SCHOOL_AR.publisher);
    assert.equal(await page.inputValue('form#labels input[name="en.publisher"]'), 'Teacher');
    const warning = (await page.locator('form#switch-kit #switch-warning').innerText()).trim();
    assert.ok(warning.includes('بما فيها الأسماء التي عدّلتها'), `the page says custom names will be replaced: ${warning}`);
    await shot(page, '05-owner-kit-editor-school');

    await page.selectOption('form#switch-kit select[name=kit]', 'company');
    assert.equal(await submit(page, 'form#switch-kit'), 200, 'the first press asks for confirmation');
    await assertPage(page, 'confirm step', 'ar');
    const confirm = (await page.locator('#confirm-warning').innerText()).trim();
    assert.ok(confirm.includes('بما فيها الأسماء التي عدّلتها'), 'the confirm step repeats that custom names will be replaced');
    assert.ok((await readable(page)).includes('شركة'), 'the confirm step names the chosen kit');
    assert.ok(await page.locator('a#cancel-switch').isVisible(), 'a way back without switching');
    assert.deepEqual((await kitRow(mesk)).json, kitBefore.json, 'nothing changes before the confirming press');
    await shot(page, '06-owner-switch-confirm-step');

    assert.equal(await submit(page, 'form#confirm-switch'), 303, 'switched');
    assert.ok(await page.locator('#done').isVisible(), 'the owner sees it is done');
    assert.equal((await page.locator('#kit-name').innerText()).trim(), 'شركة', 'the kit is now Company');
    assert.equal(await page.inputValue('form#labels input[name="ar.publisher"]'), 'مدرّب');
    assert.equal(await page.inputValue('form#labels input[name="en.publisher"]'), 'Trainer');
    await shot(page, '07-owner-kit-switched-to-company');

    const switched = await kitRow(mesk);
    assert.equal(switched.id, kitBefore.id, 'the space keeps its own kit row');
    assert.equal(switched.json.seed, 'company');
    assert.equal(switched.json.labels.en.publisher, 'Trainer');
    assert.equal(switched.json.labels.ar.learner, 'موظّف');
    assert.deepEqual(switched.json.languages, kitBefore.json.languages, 'the languages stay');
    assert.deepEqual(switched.json.theme, kitBefore.json.theme, 'the logo and colour stay');
  });

  it('AT-5.4 the owner renames Trainer to Coach in English and to مرشد in Arabic, in Mesk School only', async () => {
    const page = owner.page;
    await page.fill('form#labels input[name="en.publisher"]', 'Coach');
    await page.fill('form#labels input[name="ar.publisher"]', 'مرشد');
    assert.equal(await submit(page, 'form#labels'), 303, 'names saved');
    assert.ok(await page.locator('#done').isVisible());
    assert.equal(await page.inputValue('form#labels input[name="en.publisher"]'), 'Coach');
    assert.equal(await page.inputValue('form#labels input[name="ar.publisher"]'), 'مرشد');
    await assertPage(page, 'owner\'s space page after renaming', 'ar');
    await shot(page, '08-owner-renamed-trainer-to-coach');

    const kit = (await kitRow(mesk)).json;
    assert.equal(kit.labels.en.publisher, 'Coach');
    assert.equal(kit.labels.ar.publisher, 'مرشد');
    assert.deepEqual(Object.keys(kit.labels.ar).sort(), Object.keys(kit.labels.en).sort(), 'the same keys in every language');
  });

  it('AT-5.5 no code changed: the same commit and bundle, the same running Worker, and the only data written is Mesk School\'s own kit row', async () => {
    const codeAfter = { ...codeIdentity(), bundle: productionBundleHash(), boot: await bootId() };
    assert.equal(codeAfter.commit, codeBefore.commit, 'the same commit');
    assert.equal(codeAfter.uncommitted, codeBefore.uncommitted, 'no change on disk to the code or its configuration');
    assert.match(codeAfter.bundle, /^[0-9a-f]{64}$/);
    assert.equal(codeAfter.bundle, codeBefore.bundle, 'the production bundle is byte-identical');
    assert.equal(typeof codeBefore.boot, 'string', 'the test build names the running Worker instance (boot identity)');
    assert.equal(codeAfter.boot, codeBefore.boot, 'the same Worker instance served before and after: nothing was reloaded or redeployed');

    const diff = changes(dataBefore, await snapshot(worker));
    const meskKit = (await kitRow(mesk)).id;
    assert.deepEqual(Object.keys(diff), ['kit'], `only the kit table changed (changed: ${Object.keys(diff).join(', ')})`);
    const touched = (rows: string[]) => rows.map((r) => (JSON.parse(r) as { id: string }).id);
    assert.deepEqual(touched(diff.kit.removed), [meskKit], 'one kit row was rewritten');
    assert.deepEqual(touched(diff.kit.added), [meskKit], 'and it is Mesk School\'s own');
  });

  it('AT-5.6 every page the Mesk School admin, publishers and learners open now says مرشد, موظّف, فريق, دورة', async () => {
    const a = amal.page;
    await a.goto(at(`/s/${mesk}`));
    assert.deepEqual(await tiles(a), [AFTER_AR.publisher, AFTER_AR.learner, AFTER_AR.group, AFTER_AR.subject], 'the admin home');
    await wordsOn(a, `/s/${mesk}`, 'admin home', [AFTER_AR.publisher, AFTER_AR.learner, AFTER_AR.group, AFTER_AR.subject]);
    await shot(a, '09-after-admin-home-coach');
    await wordsOn(a, `/s/${mesk}/admin/people`, 'people page', [AFTER_AR.publisher, AFTER_AR.learner]);
    const roles = await a.locator('form#appoint select[name=role] option').allInnerTexts();
    assert.deepEqual(roles.map((r) => r.trim()), [AFTER_AR.publisher, AFTER_AR.learner], 'the role choices');
    await shot(a, '10-after-admin-people');
    await wordsOn(a, `/s/${mesk}/admin/people/${ids[HADEER.username]}`, 'Hadeer\'s page', [AFTER_AR.publisher]);
    await wordsOn(a, `/s/${mesk}/admin/sets`, 'groups page', [AFTER_AR.group]);
    await wordsOn(a, `/s/${mesk}/admin/topics`, 'subjects page', [AFTER_AR.subject, AFTER_AR.publisher]);
    await wordsOn(a, `/s/${mesk}/admin/topics/${subjectId}`, 'Mathematics (admin)', [AFTER_AR.subject, AFTER_AR.publisher, AFTER_AR.group, AFTER_AR.learner]);

    const h = hadeer.page;
    await wordsOn(h, `/s/${mesk}`, 'Hadeer\'s home', [AFTER_AR.subject]);
    await shot(h, '11-after-publisher-home');
    await wordsOn(h, `/s/${mesk}/publish/edit/${subjectId}`, 'subject editor', [AFTER_AR.subject, AFTER_AR.chapter, AFTER_AR.lesson]);
    await wordsOn(h, `/s/${mesk}/publish/compose/${lessonId}`, 'lesson editor', [AFTER_AR.subject, AFTER_AR.chapter, AFTER_AR.lesson]);
    await shot(h, '12-after-publisher-lesson-editor');
    const shimaa = await phone(browser);
    await signIn(shimaa.page, SHIMAA.username, SHIMAA.password);
    await wordsOn(shimaa.page, `/s/${mesk}`, 'Shimaa\'s home', [AFTER_AR.subject]);
    await shimaa.ctx.close();

    const s = salma.page;
    await wordsOn(s, `/s/${mesk}`, 'the first learner\'s home', [AFTER_AR.subject]);
    await shot(s, '13-after-learner-home');
    await wordsOn(s, `/s/${mesk}/learn/${subjectId}`, 'subject page', [AFTER_AR.subject, AFTER_AR.chapter]);
    await wordsOn(s, `/s/${mesk}/read/${lessonId}`, 'lesson page', [AFTER_AR.subject, AFTER_AR.chapter, AFTER_AR.lesson]);
    const omar = await phone(browser);
    await signIn(omar.page, OMAR.username, OMAR.password);
    await wordsOn(omar.page, `/s/${mesk}`, 'the second learner\'s home', [AFTER_AR.subject]);
    await omar.ctx.close();
  });

  it('AT-5.7 the first learner still opens Mathematics, Fractions, Adding fractions and its five materials, unchanged; people, groups and assignments untouched', async () => {
    const seen = await openTheLesson(salma, 'ar');
    assert.deepEqual(seen, lessonBefore, 'the same titles, materials, order, addresses and file bytes');
    const text = await readable(salma.page);
    for (const w of [AFTER_AR.subject, AFTER_AR.chapter, AFTER_AR.lesson]) assert.ok(hasWord(text, w), `the lesson page says ${w}`);
    await shot(salma.page, '14-after-learner-lesson-unchanged');
    assert.deepEqual(await content(mesk), contentBefore, 'memberships, groups, assignments and content rows are identical');
  });

  it('AT-5.8 Delta Logistics still says Trainer; the seed kit is untouched', async () => {
    const basem = await phone(browser, 'en-US');
    await signIn(basem.page, DELTA_ADMIN.username, DELTA_ADMIN.password);
    await assertPage(basem.page, 'Delta admin home', 'en');
    assert.deepEqual(await tiles(basem.page), ['Trainer', 'Employee', 'Team', 'Course']);
    assert.ok(!hasWord(await readable(basem.page), 'Coach'), 'no Coach in Delta');
    await shot(basem.page, '15-after-delta-still-trainer');
    await basem.ctx.close();
    const kit = (await kitRow(delta)).json;
    assert.equal(kit.labels.en.publisher, 'Trainer');
    assert.equal(kit.labels.ar.publisher, 'مدرّب');

    // A space made now from the Company kit still starts with Trainer.
    const c = new Client(worker.url);
    assert.equal((await c.post('/signin', { username: OWNER.username, password: OWNER.password })).status, 302);
    const f = new FormData();
    for (const [k, v] of Object.entries({ name: 'Third Space', kit: 'company', languages: 'ar,en', primary_color: '#123456', country_code: '+20' })) f.set(k, v);
    const res = await c.post('/owner/spaces', f);
    assert.equal(res.status, 302);
    const third = (res.headers.get('location') ?? '').split('/').pop() ?? '';
    assert.equal((await kitRow(third)).json.labels.en.publisher, 'Trainer', 'the seed still says Trainer');
  });

  it('AT-5.9 switching an account\'s language to English flips that person\'s pages to left-to-right, and only theirs', async () => {
    const a = amal.page;
    await a.goto(at(`/s/${mesk}`));
    await follow(a, 'a#nav-account');
    await assertPage(a, 'My account (Arabic)', 'ar');
    await follow(a, 'a#change-language');
    await assertPage(a, 'the language page (Arabic)', 'ar');
    const options = await a.locator('form#language select[name=lang] option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
    assert.deepEqual(options, ['ar', 'en'], 'a choice among the space\'s languages');
    assert.equal(await a.inputValue('form#language select[name=lang]'), 'ar', 'the default is the space\'s first language');
    await a.selectOption('form#language select[name=lang]', 'en');
    assert.equal(await submit(a, 'form#language'), 303, 'language saved');
    await assertPage(a, 'My account (English)', 'en');
    await shot(a, '16-english-my-account-ltr');
    await follow(a, 'a#back-home');
    assert.ok(a.url().endsWith(`/s/${mesk}`));
    await assertPage(a, 'admin home in English', 'en');
    assert.deepEqual(await tiles(a), [AFTER_EN.publisher, AFTER_EN.learner, AFTER_EN.group, AFTER_EN.subject], 'Coach, Employee, Team, Course');
    assert.equal(await a.locator('header.space-header').evaluate((e) => getComputedStyle(e).direction), 'ltr', 'the layout itself runs left-to-right');
    await shot(a, '17-english-admin-home-ltr');

    // The WhatsApp message stays in the space's first language, whatever the admin reads.
    const amalHttp = new Client(worker.url);
    assert.equal((await amalHttp.post('/signin', { username: ADMIN.username, password: ADMIN.password })).status, 302);
    const linkPage = await (await amalHttp.post(`/s/${mesk}/admin/people/${ids[OMAR.username]}/link`, {})).text();
    const href = linkPage.match(/id="whatsapp"[^>]*href="([^"]*)"/)?.[1]?.replace(/&amp;/g, '&') ?? '';
    const message = new URL(href).searchParams.get('text') ?? '';
    assert.ok(message.startsWith('السلام عليكم'), 'the fixed message is in Arabic');
    assert.ok(message.includes('(مسؤول التدريب)'), 'and names the admin with this kit\'s Arabic word');

    const s = salma.page;
    await s.goto(at('/account/language'));
    await s.selectOption('form#language select[name=lang]', 'en');
    assert.equal(await submit(s, 'form#language'), 303);
    const seen = await openTheLesson(salma, 'en');
    assert.deepEqual(seen.items, lessonBefore.items, 'the same five materials');
    assert.deepEqual(seen.files, lessonBefore.files);
    const trail = (await s.locator('#trail').innerText()).replace(/\s+/g, ' ').trim();
    assert.equal(trail, 'Course: Mathematics · Module: Fractions · Session', 'the lesson page in English with the kit\'s words');
    await shot(s, '18-english-learner-lesson-ltr');

    const omar = await phone(browser);
    await signIn(omar.page, OMAR.username, OMAR.password);
    await assertPage(omar.page, 'another learner\'s home', 'ar');
    await omar.ctx.close();
    const langs = await worker.sql(`SELECT username, lang FROM user WHERE username IN ('${ADMIN.username}', '${SALMA.username}', '${OMAR.username}') ORDER BY username`);
    assert.deepEqual(langs.map((r) => [r.username, r.lang]), [[ADMIN.username, 'en'], [OMAR.username, null], [SALMA.username, 'en']], 'stored per person');

    // And back to Arabic.
    await a.goto(at('/account/language'));
    await a.selectOption('form#language select[name=lang]', 'ar');
    assert.equal(await submit(a, 'form#language'), 303);
    await a.goto(at(`/s/${mesk}`));
    await assertPage(a, 'admin home back in Arabic', 'ar');
  });

  it('AT-5.10 the owner edits Mesk School\'s theme (logo and colour); Delta Logistics keeps its own', async () => {
    const page = owner.page;
    await page.goto(at(`/owner/spaces/${mesk}`));
    await page.fill('form#theme input[name=primary_color]', '#8a1c12');
    await page.setInputFiles('form#theme input[name=logo]', { name: 'red.png', mimeType: 'image/png', buffer: Buffer.from(RED_LOGO) });
    assert.equal(await submit(page, 'form#theme'), 303, 'theme saved');
    assert.ok(await page.locator('#done').isVisible());
    await shot(page, '19-owner-theme-edited');
    const kit = (await kitRow(mesk)).json;
    assert.equal(kit.theme.primaryColor, '#8a1c12');

    await amal.page.goto(at(`/s/${mesk}`));
    const bg = await amal.page.locator('header.space-header').evaluate((e) => getComputedStyle(e).backgroundColor);
    assert.equal(bg, 'rgb(138, 28, 18)', 'the admin sees the new colour');
    const logo = await amal.ctx.request.get(at(`/s/${mesk}/logo`));
    assert.equal(sha256(await logo.body()), sha256(RED_LOGO), 'and the new logo');
    await shot(amal.page, '20-admin-sees-new-theme');
    assert.equal((await kitRow(delta)).json.theme.primaryColor, '#1f3a93', 'Delta keeps its colour');
  });
});
