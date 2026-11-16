// The made-up world of LMS wave 1, task L1 (product-contract v2 on PIL-210,
// section 3, "Made-up outlines"). Mesk School (School kit) with Hadeer and
// Shimaa as publishers; Salma, assigned the subjects below (Mathematics through
// the group Science); Youssef, assigned nothing; Omar, a second learner of the
// group. Positions are deliberately not 1, 2, 3 and the chapters are seeded out
// of order, so only `position` can put them in order. Removed rows are set
// directly in the database, as the publisher's Remove would leave them.
//
// Mathematics: Fractions (Adding fractions, Comparing fractions), Empty chapter,
// Decimals (Reading decimals, removed Old decimals), removed Draft chapter
// (Draft lesson), Percent (What is a percent), Review (Review sheet).
// Arabic grammar (3 chapters), Reading club (no publisher, one lesson), Science
// club (no chapters), Physics (unpublished), Forklift safety (the Company
// space, Karim's). The Company space (Delta Logistics) and a University space
// (Nile University) give Salma the same Mathematics outline and Reading club.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Browser, BrowserContext, Page } from 'playwright';
import { Client, utcDatePlusDays } from '../support/http.ts';
import { appointAdmin, b64, createSpace, seed, setUpOwner, signedIn, tinyPdf, type SeedSubject } from '../support/seed.ts';
import { startProduct, type Product } from '../support/product.ts';
import { makeLabel, type Label, type Lang } from '../../src/labels.ts';
import { seedKit } from '../../src/kits/seed.ts';
import { A, C, HADEER, KARIM, SHIMAA } from '../at9/world.ts';

export const SALMA = { ...A, display_name: 'Salma Test' };
export const YOUSSEF = { display_name: 'Youssef Test', username: 'youssef.w1', password: 'youssef-wave1-pass', role: 'learner' as const, mobile: '01032323299' };
export const OMAR = C;
export { HADEER, SHIMAA, KARIM };
export const ADMIN = { display_name: 'Amal Hassan', username: 'amal.admin', password: 'admin-first-pass', mobile: '01012345678' };
export const COMPANY_ADMIN = { display_name: 'Basem Fawzy', username: 'basem.admin', password: 'admin-other-pass', mobile: '01087654321' };
export const UNIVERSITY_ADMIN = { display_name: 'Nadia Farid', username: 'nadia.admin', password: 'admin-third-pass', mobile: '01087650000' };

/** The Mathematics sequence (AT-2.1), in reading order. */
export const MATH_ORDER = ['Adding fractions', 'Comparing fractions', 'Reading decimals', 'What is a percent', 'Review sheet'];
/** The chapters of Mathematics shown to a reader, in order (removed "Draft chapter" left out). */
export const MATH_CHAPTERS = ['Fractions', 'Empty chapter', 'Decimals', 'Percent', 'Review'];
/** Salma's published, assigned subjects in Mesk School, in the home's order (by title). */
export const SALMA_SUBJECTS = ['Arabic grammar', 'Mathematics', 'Reading club', 'Science club'];

const note = (title: string, text: string) => ({ kind: 'note' as const, title, text });

/** Mathematics, seeded out of order: only `position` orders it. */
function mathematics(publisher: string | undefined, access: { groups?: string[]; users?: string[] }): SeedSubject {
  return {
    title: 'Mathematics', publisher, published: true, ...access,
    chapters: [
      { title: 'Review', position: 70, lessons: [{ title: 'Review sheet', position: 10, materials: [note('Note', 'All of it once more')] }] },
      {
        title: 'Decimals', position: 35, lessons: [
          { title: 'Old decimals', position: 10, materials: [note('Note', 'Removed lesson text')] },
          { title: 'Reading decimals', position: 5, materials: [note('Note', 'Tenths and hundredths')] },
        ],
      },
      {
        title: 'Fractions', position: 10, lessons: [
          { title: 'Comparing fractions', position: 20, materials: [
            { kind: 'pdf', title: 'Worksheet', base64: b64(tinyPdf('Compare')), contentType: 'application/pdf' },
            note('Note', 'Compare with a common denominator'),
          ] },
          { title: 'Adding fractions', position: 10, materials: [note('Note', 'Add the tops')] },
        ],
      },
      { title: 'Empty chapter', position: 20, lessons: [] },
      { title: 'Draft chapter', position: 40, lessons: [{ title: 'Draft lesson', position: 10, materials: [note('Note', 'Draft text')] }] },
      { title: 'Percent', position: 50, lessons: [{ title: 'What is a percent', position: 10, materials: [note('Note', 'Out of a hundred')] }] },
    ],
  };
}

const readingClub = (users: string[]): SeedSubject => ({
  title: 'Reading club', published: true, users, chapters: [{ title: 'Books', lessons: [{ title: 'First book', materials: [note('Note', 'Read the first chapter')] }] }],
});

export interface SpaceIds {
  id: string;
  kit: 'school' | 'company' | 'university';
  math: string;
  reading: string;
  /** Lesson ids of this space's Mathematics and Reading club, by title. */
  lessons: Record<string, string>;
  /** Chapter ids of this space's Mathematics, by title. */
  chapters: Record<string, string>;
}

export interface Wave1World {
  p: Product;
  owner: Client;
  admin: Client;
  school: SpaceIds & { arabic: string; science: string; physics: string; arabicLessons: Record<string, string>; arabicChapters: Record<string, string> };
  company: SpaceIds & { forklift: string; forkliftLesson: string };
  university: SpaceIds;
  ids: Record<string, string>;
  close(): Promise<void>;
}

function spaceIds(id: string, kit: SpaceIds['kit'], s: Awaited<ReturnType<typeof seed>>): SpaceIds {
  const math = s.subjects.Mathematics;
  const lessons: Record<string, string> = {};
  const chapters: Record<string, string> = {};
  for (const [title, ch] of Object.entries(math.chapters)) {
    chapters[title] = ch.id;
    for (const [lt, l] of Object.entries(ch.lessons)) lessons[lt] = l.id;
  }
  lessons['First book'] = s.subjects['Reading club'].chapters.Books.lessons['First book'].id;
  return { id, kit, math: math.id, reading: s.subjects['Reading club'].id, lessons, chapters };
}

/** Removes "Old decimals" and "Draft chapter" (with its lesson inside) in one space, as Remove leaves them. */
async function removeDrafts(p: Product, s: SpaceIds): Promise<void> {
  await p.sql(`UPDATE lesson SET removed_at = 1 WHERE id = '${s.lessons['Old decimals']}'`);
  await p.sql(`UPDATE chapter SET removed_at = 1 WHERE id = '${s.chapters['Draft chapter']}'`);
}

export async function wave1World(): Promise<Wave1World> {
  const p = await startProduct();
  // A failed setup must stop the product, or its process keeps the test run alive.
  try {
    return await populate(p);
  } catch (err) {
    await p.stop();
    throw err;
  }
}

async function populate(p: Product): Promise<Wave1World> {
  const owner = await setUpOwner(p.url);
  const schoolId = await createSpace(owner, { name: 'مدرسة مسك', kit: 'school' });
  const companyId = await createSpace(owner, { name: 'Delta Logistics', kit: 'company', languages: 'ar,en', color: '#1f4e79' });
  const universityId = await createSpace(owner, { name: 'Nile University', kit: 'university', color: '#5b2c6f' });
  const adminEnd = utcDatePlusDays(60);
  await appointAdmin(owner, schoolId, { ...ADMIN, valid_until: adminEnd });
  await appointAdmin(owner, companyId, { ...COMPANY_ADMIN, valid_until: adminEnd });
  await appointAdmin(owner, universityId, { ...UNIVERSITY_ADMIN, valid_until: adminEnd });
  const until = utcDatePlusDays(30);
  const s = await seed(p.url, {
    spaceId: schoolId,
    grantedBy: ADMIN.username,
    people: [HADEER, SHIMAA, SALMA, YOUSSEF, OMAR].map((x) => ({ ...x, valid_until: until })),
    groups: [{ name: 'Science', members: [SALMA.username, OMAR.username] }],
    subjects: [
      mathematics(HADEER.username, { groups: ['Science'] }),
      {
        title: 'Arabic grammar', publisher: SHIMAA.username, published: true, users: [SALMA.username],
        chapters: [
          { title: 'Particles', position: 30, lessons: [{ title: 'Prepositions', materials: [note('Note', 'In, on, from')] }] },
          { title: 'Nouns', position: 10, lessons: [{ title: 'The noun', position: 10 }, { title: 'The dual', position: 20 }] },
          { title: 'Verbs', position: 20, lessons: [{ title: 'Past tense' }] },
        ],
      },
      readingClub([SALMA.username]),
      { title: 'Science club', publisher: SHIMAA.username, published: true, users: [SALMA.username] },
      { title: 'Physics', publisher: HADEER.username, published: false, users: [SALMA.username], chapters: [{ title: 'Motion', lessons: [{ title: 'Speed' }] }] },
    ],
  });
  const company = await seed(p.url, {
    spaceId: companyId,
    grantedBy: COMPANY_ADMIN.username,
    people: [{ ...KARIM, valid_until: until }, { ...HADEER, username: 'hadeer.trainer', valid_until: until }],
    memberships: [{ username: SALMA.username, role: 'learner', valid_until: until }],
    subjects: [
      mathematics('hadeer.trainer', { users: [SALMA.username] }),
      readingClub([SALMA.username]),
      { title: 'Forklift safety', published: true, users: [KARIM.username], chapters: [{ title: 'Dock', lessons: [{ title: 'Forklift rules' }] }] },
    ],
  });
  const university = await seed(p.url, {
    spaceId: universityId,
    grantedBy: UNIVERSITY_ADMIN.username,
    people: [{ ...HADEER, username: 'hadeer.lecturer', valid_until: until }],
    memberships: [{ username: SALMA.username, role: 'learner', valid_until: until }],
    subjects: [mathematics('hadeer.lecturer', { users: [SALMA.username] }), readingClub([SALMA.username])],
  });
  const school = spaceIds(schoolId, 'school', s);
  const arabic = s.subjects['Arabic grammar'];
  const arabicLessons: Record<string, string> = {};
  const arabicChapters: Record<string, string> = {};
  for (const [title, ch] of Object.entries(arabic.chapters)) {
    arabicChapters[title] = ch.id;
    for (const [lt, l] of Object.entries(ch.lessons)) arabicLessons[lt] = l.id;
  }
  const w: Wave1World = {
    p, owner,
    admin: await signedIn(p.url, ADMIN.username, ADMIN.password),
    school: { ...school, arabic: arabic.id, science: s.subjects['Science club'].id, physics: s.subjects.Physics.id, arabicLessons, arabicChapters },
    company: {
      ...spaceIds(companyId, 'company', company), forklift: company.subjects['Forklift safety'].id,
      forkliftLesson: company.subjects['Forklift safety'].chapters.Dock.lessons['Forklift rules'].id,
    },
    university: spaceIds(universityId, 'university', university),
    ids: { ...s.users, ...company.users, ...university.users },
    close: () => p.stop(),
  };
  for (const sp of [w.school, w.company, w.university]) await removeDrafts(p, sp);
  return w;
}

/** A published Mathematics exam "Quiz 1" with Salma's 14 / 20 and Omar's 11 / 20, as Publish leaves it (one history row each); returns the result ids. */
export async function withResults(w: Wave1World): Promise<{ salma: string; omar: string; exam: string }> {
  const hadeer = w.ids[HADEER.username];
  const exam = 'w1-exam-quiz-1';
  await w.p.sql(`INSERT INTO exam (id, space_id, subject_id, title, exam_date, max_mark, created_by, created_at)
    VALUES ('${exam}', '${w.school.id}', '${w.school.math}', 'Quiz 1', '${utcDatePlusDays(-2)}', 20, '${hadeer}', 1)`);
  const out = { salma: 'w1-result-salma', omar: 'w1-result-omar', exam };
  for (const [id, who, mark] of [[out.salma, SALMA.username, 14], [out.omar, OMAR.username, 11]] as const) {
    await w.p.sql(`INSERT INTO exam_result (id, space_id, exam_id, learner_user_id, status, mark, published_at, changed_by, changed_at)
      VALUES ('${id}', '${w.school.id}', '${exam}', '${w.ids[who]}', 'marked', ${mark}, 2, '${hadeer}', 2)`);
    await w.p.sql(`INSERT INTO exam_result_history (id, result_id, previous_status, previous_mark, new_status, new_mark, reason, changed_by, changed_at)
      VALUES ('${id}-h', '${id}', NULL, NULL, 'marked', ${mark}, NULL, '${hadeer}', 2)`);
  }
  return out;
}

// ---------------------------------------------------------------- people ----

/** A signed-in client whose own language (My account) is set, so every page of theirs is in it. */
export async function as(w: Wave1World, who: { username: string; password: string }, lang: Lang = 'ar'): Promise<Client> {
  const c = await signedIn(w.p.url, who.username, who.password);
  const res = await c.post('/account/language', { lang });
  assert.equal(res.status, 303, `language ${lang}`);
  return c;
}

/** The words of a space's kit in one language. */
export const words = (kit: SpaceIds['kit'], lang: Lang): Label => makeLabel(lang, seedKit(kit));

export const home = (s: { id: string }) => `/s/${s.id}`;
export const subjectPath = (s: { id: string }, subjectId: string, open?: string) => `/s/${s.id}/learn/${subjectId}${open ? `?open=${open}` : ''}`;
export const lessonPath = (s: { id: string }, lessonId: string) => `/s/${s.id}/read/${lessonId}`;

/** Switches lesson activity on (the admin's real form, with the tick) or off (its step). */
export async function activity(w: Wave1World, on: boolean, admin = w.admin, spaceId = w.school.id): Promise<void> {
  const res = on ? await admin.post(`/s/${spaceId}/admin/activity`, { told: '1' }) : await admin.post(`/s/${spaceId}/admin/activity/off`, {});
  assert.equal(res.status, 303, `activity ${on ? 'on' : 'off'}`);
}

// --------------------------------------------------------------- browser ----

export const WIDTHS = { phone: { width: 390, height: 844 }, tablet: { width: 768, height: 1024 }, desktop: { width: 1280, height: 800 } } as const;
export type Width = keyof typeof WIDTHS;

export interface Tab {
  ctx: BrowserContext;
  page: Page;
}

/** A fresh browser (its own cookies) at a width, signed in through the real form, with the person's own language set. */
export async function browserAs(
  browser: Browser, w: Wave1World, who: { username: string; password: string }, opts: { width?: Width; lang?: Lang; cookies?: boolean; script?: boolean } = {},
): Promise<Tab> {
  const ctx = await browser.newContext({ viewport: WIDTHS[opts.width ?? 'phone'], locale: 'ar-EG', javaScriptEnabled: opts.script ?? true });
  ctx.setDefaultTimeout(15_000);
  const page = await ctx.newPage();
  await page.goto(w.p.url + '/signin');
  await page.fill('form#signin input[name=username]', who.username);
  await page.fill('form#signin input[name=password]', who.password);
  await Promise.all([page.waitForEvent('load'), page.click('form#signin button[type=submit]')]);
  await page.goto(w.p.url + '/account/language');
  await page.selectOption('form#language select[name=lang]', opts.lang ?? 'ar');
  await Promise.all([page.waitForEvent('load'), page.locator('form#language button[type=submit]').click()]);
  if (opts.cookies === false) {
    // A browser that refuses every cookie but the session (section 7.2, "If cookies are refused").
    await ctx.route('**/*', async (route) => {
      const res = await route.fetch();
      const headers = { ...res.headers() };
      const kept = res.headersArray().filter((h) => h.name.toLowerCase() === 'set-cookie' && h.value.startsWith('lms_session=')).map((h) => h.value);
      delete headers['set-cookie'];
      await route.fulfill({ response: res, headers: kept.length ? { ...headers, 'set-cookie': kept.join('\n') } : headers });
    });
  }
  return { ctx, page };
}

export async function go(page: Page, w: Wave1World, path: string): Promise<void> {
  const res = await page.goto(w.p.url + path);
  assert.equal(res?.status(), 200, `${path} answers 200`);
}

export const UX_EVIDENCE = fileURLToPath(new URL('../../evidence/ux/', import.meta.url));

/** Saves a ux-plan screenshot: evidence/ux/UX-<n>-<width>-<lang>[-<kit>][-<state>].png. */
export async function uxShot(page: Page, name: string): Promise<void> {
  mkdirSync(UX_EVIDENCE, { recursive: true });
  await page.screenshot({ path: `${UX_EVIDENCE}${name}.png`, fullPage: true });
}

/** The text a person reads in an element (whitespace collapsed). */
export async function textOf(page: Page, selector: string): Promise<string> {
  return ((await page.locator(selector).first().innerText()) ?? '').replace(/\s+/g, ' ').trim();
}

/** The text a person reads on an HTML page fetched without a browser (tags, scripts and styles removed, whitespace collapsed). */
export function plain(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim();
}
