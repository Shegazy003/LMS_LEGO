// AT-6 The admin corrects a person (release 1.1, contract 0.2, section 3).
// Drives the real admin pages in Chromium, at phone width, Arabic first and
// then the same screens in English, against the Worker running locally
// (Wrangler + workerd, local D1 and R2). The Worker's clock is set to midday
// UTC of today for the whole run (contract: "with the test clock at midday UTC").
//
// Seeded (only what earlier acceptance tests already proved): the owner, Mesk
// School and its admin through the owner's real forms (AT-1); Hadeer and Shimaa
// (publishers), two learners, the group Science and two published subjects
// through the test seeding route (the admin's and publisher's screens for these
// are proven by AT-2 and AT-3). Everything AT-6 is about (search, corrections,
// End access now, typed dates, the Ended part of the list, Restore access) goes
// through the admin's real screens in a real browser. Screenshots go to
// evidence/at-6/.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from 'playwright';
import { startWorker, type RunningWorker } from '../support/worker.ts';
import { Client, setClockOffsetMs, setClockTo, setStartOffset, workerNow } from '../support/http.ts';
import { appointAdmin, b64, createSpace, seed, setUpOwner, tinyPdf } from '../support/seed.ts';
import { assertPage, follow, phone, readable, shot as shotIn, signIn as signInAt, submit, type Phone } from '../support/browser.ts';
import { changes, snapshot } from '../support/state.ts';

const EVIDENCE = fileURLToPath(new URL('../../evidence/at-6/', import.meta.url));
const SPACE = 'مدرسة مسك';
const ADMIN = { display_name: 'Amal Hassan', username: 'amal.admin', password: 'admin-first-pass', mobile: '01012345678' };
interface Person { display_name: string; username: string; password: string; role: 'publisher' | 'learner'; mobile: string }
const HADEER: Person = { display_name: 'Hadeer', username: 'hadeer', password: 'hadeer-first-pass', role: 'publisher', mobile: '01022223333' };
const SHIMAA: Person = { display_name: 'Shimaa', username: 'shimaa', password: 'shimaa-first-pass', role: 'publisher', mobile: '01066667777' };
// The first learner was appointed with a misspelled name and a wrong number.
const SALMA: Person = { display_name: 'Salma Adell', username: 'salma.learner', password: 'salma-first-pass', role: 'learner', mobile: '01033334444' };
const OMAR: Person = { display_name: 'عمر نبيل', username: 'omar.learner', password: 'omar-first-pass', role: 'learner', mobile: '01055556666' };
const PEOPLE = [HADEER, SHIMAA, SALMA, OMAR];
const SALMA_FIXED = { display_name: 'Salma Adel', mobile: '0102 999 8877', stored: '+201029998877' };
const DAY = 86_400_000;

// Plain messages, from the product dictionary (Arabic first).
const AR = {
  mobileRefused: 'تعذّرت قراءة رقم الهاتف المحمول هذا. اكتبه بالطريقة المحلية (مثل 010…) أو بعلامة + ورمز الدولة.',
  dateBeforeToday: 'اختر تاريخ انتهاء من اليوم فصاعداً.',
  dateBeyondOwn: (d: string) => `لا يمكن أن يتجاوز تاريخ الانتهاء تاريخ انتهائك أنت، ${d}.`,
  ended: (d: string) => `انتهى وصولك إلى ${SPACE} في ${d}. للتواصل: مدير.`,
  searchNone: (q: string) => `لا أحد هنا يطابق «${q}».`,
  mobileChanged: 'تم الحفظ. لم يعد أي رابط إعادة تعيين أُرسل من قبل يعمل؛ والرابط التالي يذهب إلى الرقم الجديد.',
  saved: 'تم الحفظ.',
  endTitle: (n: string) => `إنهاء وصول ${n} الآن؟`,
  endedDone: 'انتهى الوصول. لم يُحذف شيء؛ ويمكنك استعادته أدناه.',
  restored: 'تمت استعادة الوصول.',
  endedOn: (d: string) => `انتهى الوصول في ${d}`,
  until: (d: string) => `حتى ${d}`,
  endedSummary: (n: number) => `انتهى وصولهم (${n})`,
  linkDead: 'هذا الرابط لم يعد يعمل. اطلب رابطاً جديداً ممّن أرسله.',
};
const EN = {
  ended: (d: string) => `Your access to ${SPACE} ended on ${d}. Contact the Administrator.`,
  dateBeforeToday: 'Choose an end date from today onwards.',
  endTitle: (n: string) => `End access for ${n} now?`,
  endedOn: (d: string) => `access ended on ${d}`,
  endedSummary: (n: number) => `Ended (${n})`,
  restored: 'Access restored.',
};

let worker: RunningWorker;
let browser: Browser;
let amal: Phone;
let admin: Page;
let spaceId = '';
let today = '';
let adminEnd = '';
const ids: Record<string, string> = {};
const content: Record<string, string> = {};

const at = (path: string) => worker.url + path;
const plus = (days: number) => new Date(Date.parse(today + 'T00:00:00Z') + days * DAY).toISOString().slice(0, 10);
const shot = (page: Page, name: string) => shotIn(page, EVIDENCE, name);
const signIn = (page: Page, p: { username: string; password: string }) => signInAt(worker.url, page, p.username, p.password);
const count = async (sql: string) => Number((await worker.sql(sql))[0].n);
/** The Worker's clock, in milliseconds from midday UTC today (the run's starting point). */
const clockAt = (ms: number) => setClockOffsetMs(worker.url, ms);

async function errorText(page: Page): Promise<string> {
  return (await page.locator('#error').innerText()).trim();
}

async function text(page: Page, selector: string): Promise<string> {
  return (await page.locator(selector).innerText()).trim();
}

async function assertSpacePage(page: Page, where: string, lang: 'ar' | 'en' = 'ar'): Promise<void> {
  await assertPage(page, where, lang);
  assert.equal(await text(page, '#space-name'), SPACE, `${where}: the space's name`);
}

async function openPeople(): Promise<void> {
  await admin.goto(at(`/s/${spaceId}`));
  await follow(admin, '#concepts [data-concept="learner"] a');
  assert.ok(admin.url().endsWith(`/s/${spaceId}/admin/people`), 'the people page');
}

/** Types into the people list's search box and presses Search (a GET form: the server narrows the list). */
async function search(q: string): Promise<void> {
  await admin.fill('form#search input[name=q]', q);
  await Promise.all([admin.waitForEvent('load'), admin.locator('form#search button[type=submit]').click()]);
  assert.equal(new URL(admin.url()).searchParams.get('q'), q, 'the search is sent to the server');
}

/** The ids of the people listed in the active list, and in the Ended part of the list. */
async function listed(): Promise<{ active: string[]; ended: string[] }> {
  const ofList = (sel: string) => admin.locator(`${sel} [data-user]`).evaluateAll((els) => els.map((e) => e.getAttribute('data-user') ?? ''));
  return { active: await ofList('#people'), ended: await ofList('#ended') };
}

async function openPerson(p: Person, q: string): Promise<void> {
  await openPeople();
  await search(q);
  await follow(admin, `[data-user="${ids[p.username]}"] a.person`);
  assert.ok(admin.url().endsWith(`/s/${spaceId}/admin/people/${ids[p.username]}`), `${p.username}'s page`);
}

/** The admin presses "Send reset link by WhatsApp" and confirms; returns the link, the number and the message. */
async function sendResetLink(): Promise<{ link: string; number: string; message: string }> {
  await follow(admin, '#send-link button[type=submit]');
  assert.equal(await submit(admin, '#confirm-link'), 200, 'one confirming tap');
  const link = await admin.locator('input#reset-link').inputValue();
  const u = new URL((await admin.locator('a#whatsapp').getAttribute('href')) ?? '');
  return { link, number: u.pathname.slice(1), message: u.searchParams.get('text') ?? '' };
}

function expectedMessage(name: string, link: string): string {
  return [
    `السلام عليكم. هذه رسالة من ${SPACE}.`,
    `أرسل ${ADMIN.display_name} (مدير) رابطاً لتعيين كلمة مرور جديدة لحساب ${name} على ${worker.url}.`,
    'افتح الرابط، واكتب اسم المستخدم ثم كلمة المرور الجديدة. الرابط صالح لمدة 30 دقيقة ولمرة واحدة.',
    link,
  ].join('\n');
}

/** Submits a form with the browser's own date limits set aside, as a person could with an altered page. */
async function submitTyped(form: string, values: Record<string, string>): Promise<number> {
  for (const [name, value] of Object.entries(values)) await admin.fill(`form${form} input[name=${name}]`, value);
  await admin.locator(`form${form}`).evaluate((f) => { (f as HTMLFormElement).noValidate = true; });
  return submit(admin, form);
}

async function membership(username: string): Promise<{ valid_until: string; ended_on: string | null }> {
  const rows = await worker.sql(
    `SELECT m.valid_until, m.ended_on FROM membership m JOIN user u ON u.id = m.user_id WHERE u.username = '${username}' AND m.space_id = '${spaceId}'`,
  );
  assert.equal(rows.length, 1, `${username}: one membership`);
  return { valid_until: String(rows[0].valid_until), ended_on: rows[0].ended_on === null ? null : String(rows[0].ended_on) };
}

/** The "access ended" page: the message in the space's first language, then its second. */
async function assertEndedPage(page: Page, status: number | undefined, date: string, where: string): Promise<void> {
  assert.equal(status, 403, `${where}: refused`);
  assert.equal(await text(page, '#access-ended'), AR.ended(date), `${where}: the message in Arabic`);
  assert.equal(await text(page, '#access-ended-alt'), EN.ended(date), `${where}: then in English`);
}

describe('AT-6 the admin corrects a person', { concurrency: false }, () => {
  before(async () => {
    mkdirSync(EVIDENCE, { recursive: true });
    worker = await startWorker();
    today = new Date(await workerNow(worker.url)).toISOString().slice(0, 10);
    // Midday UTC today, for the whole run; every later move is relative to it.
    setStartOffset(worker.url, Date.parse(`${today}T12:00:00Z`) - Date.now());
    assert.equal((await clockAt(0)).status, 200);
    adminEnd = plus(60);
    const owner = await setUpOwner(worker.url);
    spaceId = await createSpace(owner, { name: SPACE, kit: 'school' });
    await appointAdmin(owner, spaceId, { ...ADMIN, valid_until: adminEnd });
    const s = await seed(worker.url, {
      spaceId,
      grantedBy: ADMIN.username,
      people: PEOPLE.map((p) => ({ ...p, valid_until: p.role === 'publisher' ? plus(30) : plus(10) })),
      groups: [{ name: 'Science', members: [SALMA.username, OMAR.username] }],
      subjects: [
        {
          title: 'Mathematics', publisher: HADEER.username, published: true, groups: ['Science'],
          chapters: [{ title: 'Fractions', lessons: [{ title: 'Adding fractions', materials: [
            { kind: 'pdf', title: 'Worksheet', base64: b64(tinyPdf()), contentType: 'application/pdf' },
            { kind: 'note', title: 'Remember', text: 'Add the tops, keep the bottom.' },
          ] }] }],
        },
        { title: 'Reading', publisher: SHIMAA.username, published: true, users: [OMAR.username] },
      ],
    });
    Object.assign(ids, s.users);
    const math = s.subjects.Mathematics;
    const lesson = math.chapters.Fractions.lessons['Adding fractions'];
    Object.assign(content, { math: math.id, reading: s.subjects.Reading.id, lesson: lesson.id, pdf: lesson.materials.Worksheet });
    browser = await chromium.launch();
    amal = await phone(browser);
    admin = amal.page;
  });

  after(async () => {
    if (worker) await setClockOffsetMs(worker.url, 0).catch(() => undefined);
    await browser?.close();
    await worker?.stop();
  });

  it('AT-6.1 the admin types part of a learner\'s name into the people list\'s search box; the server narrows the list; the admin opens that learner', async () => {
    const midday = new Date(await workerNow(worker.url));
    assert.equal(midday.getUTCHours(), 12, 'the test clock is at midday UTC');
    await signIn(admin, ADMIN);
    await openPeople();
    await assertSpacePage(admin, 'people page');
    assert.deepEqual((await listed()).active.sort(), PEOPLE.map((p) => ids[p.username]).sort(), 'everyone is listed before a search');

    await search('Sal');
    assert.deepEqual(await listed(), { active: [ids[SALMA.username]], ended: [] }, 'only the learner whose name contains "Sal"');
    const page = await readable(admin);
    for (const p of [HADEER, SHIMAA, OMAR]) assert.ok(!page.includes(p.display_name), `${p.display_name} is not on the narrowed page`);
    assert.equal(await admin.inputValue('form#search input[name=q]'), 'Sal', 'the search box keeps what was typed');
    await assertSpacePage(admin, 'narrowed people page');
    await shot(admin, '01-search-part-of-a-name');

    await search('omar.l');
    assert.deepEqual((await listed()).active, [ids[OMAR.username]], 'part of a username finds the person too');
    await search('عمر');
    assert.deepEqual((await listed()).active, [ids[OMAR.username]], 'an Arabic name is found by part of it');
    await search('zzz');
    assert.deepEqual(await listed(), { active: [], ended: [] }, 'nobody matches');
    assert.equal(await text(admin, '#search-none'), AR.searchNone('zzz'), 'a plain message when nobody matches');

    await search('Sal');
    await follow(admin, `[data-user="${ids[SALMA.username]}"] a.person`);
    assert.ok(admin.url().endsWith(`/s/${spaceId}/admin/people/${ids[SALMA.username]}`), 'the learner\'s page');
    assert.equal(await text(admin, '#person-name'), SALMA.display_name);
    assert.equal(await admin.inputValue('form#correct input[name=display_name]'), SALMA.display_name, 'the correction form starts with the name');
    assert.equal(await admin.inputValue('form#correct input[name=mobile]'), '', 'the number is not shown in the form (only its last digits)');
    assert.equal(await admin.inputValue('form#correct input[name=valid_until]'), plus(10), 'the correction form starts with the end date');
    await assertSpacePage(admin, 'person page');
    await shot(admin, '02-learner-page-with-correction-form');
  });

  it('AT-6.2 the admin corrects the display name and the mobile number and moves the end date later; earlier reset links die; the next one goes to the new number with the corrected name', async () => {
    // A link sent to the wrong number before the correction.
    const before = await sendResetLink();
    assert.equal(before.number, '201033334444');
    assert.equal(before.message, expectedMessage(SALMA.display_name, before.link));

    await openPerson(SALMA, 'Sal');
    // A number that cannot be normalised is refused with a plain message, and nothing is stored.
    await admin.fill('form#correct input[name=display_name]', SALMA_FIXED.display_name);
    await admin.fill('form#correct input[name=mobile]', '0102');
    assert.equal(await submit(admin, '#correct'), 400);
    assert.equal(await errorText(admin), AR.mobileRefused);
    await assertSpacePage(admin, 'refused correction');
    await shot(admin, '03-unreadable-number-refused');
    assert.equal(await count(`SELECT COUNT(*) AS n FROM user WHERE username = '${SALMA.username}' AND display_name = '${SALMA.display_name}' AND mobile = '+201033334444'`), 1, 'nothing stored');

    await admin.fill('form#correct input[name=display_name]', SALMA_FIXED.display_name);
    await admin.fill('form#correct input[name=mobile]', SALMA_FIXED.mobile);
    await admin.fill('form#correct input[name=valid_until]', plus(40));
    assert.equal(await submit(admin, '#correct'), 303, 'the corrections are saved');
    assert.equal(await text(admin, '#done'), AR.mobileChanged);
    assert.equal(await text(admin, '#person-name'), SALMA_FIXED.display_name);
    const card = await text(admin, '#person');
    assert.ok(card.includes('8877') && card.includes(AR.until(plus(40))), 'the new last digits and the new end date');
    const html = await admin.content();
    for (const n of [SALMA_FIXED.stored, SALMA_FIXED.stored.slice(1), '01029998877']) assert.ok(!html.includes(n), `the page does not show ${n}`);
    await assertSpacePage(admin, 'corrected person page');
    await shot(admin, '04-name-number-and-end-date-corrected');
    const row = await worker.sql(`SELECT display_name, mobile FROM user WHERE id = '${ids[SALMA.username]}'`);
    assert.deepEqual([row[0].display_name, row[0].mobile], [SALMA_FIXED.display_name, SALMA_FIXED.stored], 'stored in international form');
    assert.deepEqual(await membership(SALMA.username), { valid_until: plus(40), ended_on: null });

    // Every reset link issued before the change stops working.
    const other = await phone(browser);
    const dead = await other.page.goto(before.link);
    assert.equal(dead?.status(), 410, 'the link sent before the change no longer works');
    assert.equal(await text(other.page, '#link-dead'), AR.linkDead);
    await shot(other.page, '05-earlier-reset-link-dead');
    await other.ctx.close();

    // The next reset goes to the corrected number and names the corrected person.
    const next = await sendResetLink();
    assert.equal(next.number, SALMA_FIXED.stored.slice(1), 'the next link goes to the corrected number');
    assert.equal(next.message, expectedMessage(SALMA_FIXED.display_name, next.link), 'the next WhatsApp message carries the corrected name');
    await shot(admin, '06-next-reset-link-to-corrected-number');

    // The corrected name shows on every list.
    await openPeople();
    const list = await text(admin, '#people');
    assert.ok(list.includes(SALMA_FIXED.display_name) && !list.includes(SALMA.display_name), 'the people list');
    await admin.goto(at(`/s/${spaceId}/admin/sets`));
    const sets = await text(admin, '#sets');
    assert.ok(sets.includes(SALMA_FIXED.display_name) && !sets.includes(SALMA.display_name), 'the groups list');
    await admin.goto(at(`/s/${spaceId}/admin/topics/${content.math}`));
    const readers = await text(admin, 'form#topic-access');
    assert.ok(readers.includes(SALMA_FIXED.display_name) && !readers.includes(SALMA.display_name), 'the subject\'s readers');
    SALMA.display_name = SALMA_FIXED.display_name;
  });

  it('AT-6.3 the extended learner keeps access after the old end date', async () => {
    const salma = await phone(browser);
    await signIn(salma.page, SALMA);
    assert.ok(salma.page.url().endsWith(`/s/${spaceId}`), 'the learner signs in');
    assert.equal((await clockAt(11 * DAY)).status, 200, 'the clock moves past the old end date');
    try {
      const home = await salma.page.goto(at(`/s/${spaceId}`));
      assert.equal(home?.status(), 200, 'still in the space after the old end date');
      assert.ok((await text(salma.page, '#my-list')).includes('Mathematics'));
      assert.equal((await salma.page.goto(at(`/s/${spaceId}/read/${content.lesson}`)))?.status(), 200, 'the lesson opens');
      await shot(salma.page, '07-extended-learner-keeps-access');
    } finally {
      assert.equal((await clockAt(0)).status, 200, 'back to midday today');
      await salma.ctx.close();
    }
  });

  it('AT-6.4 End access now: the confirm step names the person, Cancel changes nothing; confirming ends access at once, and sessions and reset links stop', async () => {
    const omar = await phone(browser);
    await signIn(omar.page, OMAR);
    assert.equal((await omar.page.goto(at(`/s/${spaceId}/read/${content.lesson}`)))?.status(), 200, 'the learner reads the lesson');
    await openPerson(OMAR, 'عمر');
    const link = await sendResetLink();
    const learnerCookie = (await omar.ctx.cookies()).find((c) => c.name === 'lms_session')?.value ?? '';
    assert.ok(learnerCookie, 'the learner is signed in');

    await openPerson(OMAR, 'عمر');
    const beforeCancel = await snapshot(worker);
    await follow(admin, 'form#end-access button[type=submit]');
    assert.ok(new URL(admin.url()).pathname.endsWith(`/s/${spaceId}/admin/people/${ids[OMAR.username]}/end`), 'the confirm step is a page of its own');
    assert.equal(await text(admin, '#end-title'), AR.endTitle(OMAR.display_name), 'the confirm step names the person');
    await assertSpacePage(admin, 'end access confirm step');
    await shot(admin, '08-end-access-confirm-step');
    await follow(admin, 'a#cancel-end');
    assert.ok(admin.url().endsWith(`/s/${spaceId}/admin/people/${ids[OMAR.username]}`), 'Cancel goes back to the person');
    assert.deepEqual(changes(beforeCancel, await snapshot(worker)), {}, 'Cancel changed nothing');
    assert.equal((await omar.page.reload())?.status(), 200, 'the learner still reads the lesson after Cancel');

    await follow(admin, 'form#end-access button[type=submit]');
    assert.equal(await submit(admin, '#confirm-end'), 303, 'access ends');
    assert.equal(await text(admin, '#done'), AR.endedDone);
    assert.ok((await text(admin, '#person-status')).includes(AR.endedOn(today)), 'the person page says access ended today');
    assert.equal(await admin.locator('form#end-access').count(), 0, 'no End access now on an ended person');
    assert.equal(await admin.locator('form#restore').count(), 1, 'Restore access instead');
    await assertSpacePage(admin, 'ended person page');
    await shot(admin, '09-access-ended-person-page');
    assert.deepEqual(await membership(OMAR.username), { valid_until: plus(10), ended_on: today }, 'ended today; the end date is kept');

    // The learner's next page: the message, in the space's first language and then its second.
    assert.equal(new Date(await workerNow(worker.url)).getUTCHours(), 12, 'still midday UTC');
    await assertEndedPage(omar.page, (await omar.page.reload())?.status(), today, 'the learner\'s next page');
    await assertPage(omar.page, 'the access ended page', 'ar');
    await shot(omar.page, '10-learner-next-page-access-ended');
    // That sign-in has ended: the cookie opens nothing any more.
    assert.equal(await count(`SELECT COUNT(*) AS n FROM session WHERE user_id = '${ids[OMAR.username]}'`), 0, 'no sign-in of the learner is left');
    const old = await fetch(at(`/s/${spaceId}/read/${content.lesson}`), { redirect: 'manual', headers: { cookie: `lms_session=${learnerCookie}` } });
    assert.equal(old.status, 302, 'the old sign-in opens nothing');
    assert.equal(new URL(old.headers.get('location') ?? '', worker.url).pathname, '/signin');
    // The reset link sent before stops working.
    const deadLink = await phone(browser);
    assert.equal((await deadLink.page.goto(link.link))?.status(), 410, 'the open reset link stopped working');
    await deadLink.ctx.close();

    // Signing in again (release 1 rule 3) shows the same message, and every direct link is refused.
    await signIn(omar.page, OMAR);
    assert.ok(omar.page.url().endsWith(`/s/${spaceId}`));
    for (const path of [
      `/s/${spaceId}`, `/s/${spaceId}/learn/${content.math}`, `/s/${spaceId}/learn/${content.reading}`,
      `/s/${spaceId}/read/${content.lesson}`, `/s/${spaceId}/file/${content.pdf}`,
    ]) {
      await assertEndedPage(omar.page, (await omar.page.goto(at(path)))?.status(), today, `direct link ${path}`);
    }
    await shot(omar.page, '11-every-direct-link-refused');
    await omar.ctx.close();
  });

  it('AT-6.5 the admin changes a publisher\'s end date earlier, to today: access stays through the end of the UTC day; a date before today and one later than the admin\'s own are refused', async () => {
    const hadeer = await phone(browser);
    await signIn(hadeer.page, HADEER);
    await openPerson(HADEER, 'Had');
    await admin.fill('form#correct input[name=valid_until]', today);
    assert.equal(await submit(admin, '#correct'), 303);
    assert.equal(await text(admin, '#done'), AR.saved);
    assert.deepEqual(await membership(HADEER.username), { valid_until: today, ended_on: null });
    assert.equal((await hadeer.page.goto(at(`/s/${spaceId}/publish`)))?.status(), 200, 'the publisher keeps access today');
    assert.ok((await text(hadeer.page, '#publisher-list')).includes('Mathematics'));

    assert.equal(await submitTyped('#correct', { valid_until: plus(-1) }), 400, 'a date before today');
    assert.equal(await errorText(admin), AR.dateBeforeToday);
    await assertSpacePage(admin, 'date before today refused');
    await shot(admin, '12-date-before-today-refused');
    assert.equal(await submitTyped('#correct', { valid_until: plus(61) }), 400, 'a date later than the admin\'s own');
    assert.equal(await errorText(admin), AR.dateBeyondOwn(adminEnd));
    await shot(admin, '13-date-later-than-admins-own-refused');
    assert.deepEqual(await membership(HADEER.username), { valid_until: today, ended_on: null }, 'nothing stored');

    await openPeople();
    assert.ok((await listed()).active.includes(ids[HADEER.username]), 'a publisher ending today is still listed with the active people');
    // 30 seconds after midnight UTC the day is over.
    assert.equal((await setClockTo(worker.url, Date.parse(`${plus(1)}T00:00:30Z`))).status, 200);
    await assertEndedPage(hadeer.page, (await hadeer.page.goto(at(`/s/${spaceId}/publish`)))?.status(), today, 'the publisher the next UTC day');
    await shot(hadeer.page, '14-publisher-ended-the-next-day');
    assert.equal((await clockAt(0)).status, 200);
    await hadeer.ctx.close();
  });

  it('AT-6.6 ended people sit in a collapsed "Ended" part of the list; Restore access with a new end date brings the learner back with the same groups and subjects; nothing is deleted', async () => {
    const before = await snapshot(worker);
    await openPeople();
    const parts = await listed();
    assert.ok(!parts.active.includes(ids[OMAR.username]), 'the ended learner left the active list');
    assert.deepEqual(parts.ended, [ids[OMAR.username]], 'the ended learner is in the Ended part');
    assert.equal(await admin.getAttribute('details#ended', 'open'), null, 'collapsed');
    assert.equal(await text(admin, 'details#ended > summary'), AR.endedSummary(1));
    assert.ok(!(await admin.locator(`#ended [data-user="${ids[OMAR.username]}"]`).isVisible()), 'hidden until opened');
    await shot(admin, '15-ended-part-collapsed');
    await admin.click('details#ended > summary');
    assert.ok((await text(admin, `#ended [data-user="${ids[OMAR.username]}"]`)).includes(AR.endedOn(today)));
    await shot(admin, '16-ended-part-opened');

    await follow(admin, `#ended [data-user="${ids[OMAR.username]}"] a.person`);
    assert.equal(await submitTyped('#restore', { valid_until: plus(-1) }), 400, 'a typed date before today is refused here too');
    assert.equal(await errorText(admin), AR.dateBeforeToday);
    assert.equal(await submitTyped('#restore', { valid_until: plus(61) }), 400, 'and one later than the admin\'s own');
    assert.equal(await errorText(admin), AR.dateBeyondOwn(adminEnd));
    await admin.fill('form#restore input[name=valid_until]', plus(20));
    assert.equal(await submit(admin, '#restore'), 303, 'access restored');
    assert.equal(await text(admin, '#done'), AR.restored);
    assert.ok((await text(admin, '#person-status')).includes(AR.until(plus(20))));
    await assertSpacePage(admin, 'restored person page');
    await shot(admin, '17-access-restored');
    assert.deepEqual(await membership(OMAR.username), { valid_until: plus(20), ended_on: null });

    const afterRestore = await snapshot(worker);
    const diff = changes(before, afterRestore);
    assert.deepEqual(Object.keys(diff), ['membership'], 'only the membership row changed: the same groups and subjects');
    assert.equal(diff.membership.removed.length, 1);
    assert.equal(diff.membership.added.length, 1);
    for (const table of ['user', 'membership', 'group_member', 'subject_access', 'subject', 'material']) {
      assert.equal(afterRestore[table].length, before[table].length, `nothing deleted from ${table}`);
    }

    const omar = await phone(browser);
    await signIn(omar.page, OMAR);
    assert.ok(omar.page.url().endsWith(`/s/${spaceId}`));
    const home = await text(omar.page, '#my-list');
    assert.ok(home.includes('Mathematics') && home.includes('Reading'), 'the same subjects: through the group and directly');
    assert.equal((await omar.page.goto(at(`/s/${spaceId}/read/${content.lesson}`)))?.status(), 200, 'the lesson opens again');
    await shot(omar.page, '18-restored-learner-home');
    await omar.ctx.close();

    await openPeople();
    assert.deepEqual((await listed()).ended, [], 'nobody is ended now');
    assert.equal(await admin.locator('details#ended').count(), 0, 'no Ended part when nobody has ended');
  });

  it('AT-6.7 the same screens in English: search, a refused date, End access now with Cancel and confirm, the Ended part and Restore access', async () => {
    await admin.goto(at('/account/language'));
    await admin.selectOption('form#language select[name=lang]', 'en');
    assert.equal(await submit(admin, 'form#language'), 303, 'the admin reads English');
    await openPeople();
    await assertSpacePage(admin, 'people page (English)', 'en');
    await search('shim');
    assert.deepEqual((await listed()).active, [ids[SHIMAA.username]], 'part of a name, in English');
    await shot(admin, '19-en-search');
    await follow(admin, `[data-user="${ids[SHIMAA.username]}"] a.person`);
    assert.equal(await submitTyped('#correct', { valid_until: plus(-1) }), 400);
    assert.equal(await errorText(admin), EN.dateBeforeToday);
    await assertSpacePage(admin, 'refused date (English)', 'en');
    await shot(admin, '20-en-date-before-today-refused');

    const shimaa = await phone(browser);
    await signIn(shimaa.page, SHIMAA);
    const beforeCancel = await snapshot(worker);
    await admin.goto(at(`/s/${spaceId}/admin/people/${ids[SHIMAA.username]}`));
    await follow(admin, 'form#end-access button[type=submit]');
    assert.equal(await text(admin, '#end-title'), EN.endTitle(SHIMAA.display_name));
    await assertSpacePage(admin, 'confirm step (English)', 'en');
    await shot(admin, '21-en-end-access-confirm-step');
    await follow(admin, 'a#cancel-end');
    assert.deepEqual(changes(beforeCancel, await snapshot(worker)), {}, 'Cancel changed nothing');
    await follow(admin, 'form#end-access button[type=submit]');
    assert.equal(await submit(admin, '#confirm-end'), 303);
    assert.ok((await text(admin, '#person-status')).includes(EN.endedOn(today)));
    await assertEndedPage(shimaa.page, (await shimaa.page.goto(at(`/s/${spaceId}/publish`)))?.status(), today, 'the ended publisher\'s next page');
    await shimaa.ctx.close();

    await openPeople();
    assert.equal(await text(admin, 'details#ended > summary'), EN.endedSummary(1));
    await admin.click('details#ended > summary');
    assert.ok((await text(admin, `#ended [data-user="${ids[SHIMAA.username]}"]`)).includes(EN.endedOn(today)));
    await shot(admin, '22-en-ended-part');
    await follow(admin, `#ended [data-user="${ids[SHIMAA.username]}"] a.person`);
    await admin.fill('form#restore input[name=valid_until]', plus(30));
    assert.equal(await submit(admin, '#restore'), 303);
    assert.equal(await text(admin, '#done'), EN.restored);
    await assertSpacePage(admin, 'restored (English)', 'en');
    await shot(admin, '23-en-access-restored');
    assert.deepEqual(await membership(SHIMAA.username), { valid_until: plus(30), ended_on: null });

    // Nothing was deleted in the whole journey.
    assert.equal(await count('SELECT COUNT(*) AS n FROM user'), 6, 'the owner, the admin and four people');
    assert.equal(await count(`SELECT COUNT(*) AS n FROM membership WHERE space_id = '${spaceId}'`), 5);
    for (const p of PEOPLE) assert.ok(!worker.log().includes(p.mobile), `the Worker log never contains ${p.mobile}`);
    assert.ok(!worker.log().includes(SALMA_FIXED.stored), 'nor the corrected number');
    // A plain HTTP check: the narrowed list comes from the server, not from the page's script.
    const c = new Client(worker.url);
    assert.equal((await c.post('/signin', { username: ADMIN.username, password: ADMIN.password })).status, 302);
    const narrowed = await (await c.get(`/s/${spaceId}/admin/people?q=Sal`)).text();
    assert.ok(narrowed.includes(SALMA.display_name) && !narrowed.includes(OMAR.display_name) && !narrowed.includes(HADEER.display_name), 'server-side search');
  });
});
