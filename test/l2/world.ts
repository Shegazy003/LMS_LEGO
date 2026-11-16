// The made-up world of LMS wave 1, task L2 (product-contract v2 on PIL-210,
// AT-4 and AT-5): the L1 world (test/wave1/world.ts: Mesk School with Hadeer,
// Shimaa, Salma, Youssef and Omar C; the Company and University spaces) plus
// Mona, the guardian of Salma and Youssef, appointed and linked through the
// admin's real forms, and these results (made-up, inserted as Publish leaves
// them, one history row per value):
// - Salma: "Quiz 1" (Mathematics, 2026-10-20) 12 / 20; "Quiz 3" (Mathematics,
//   2026-11-12) 14 / 20, corrected from 13; "Unit test" (Mathematics,
//   2026-11-12) 16 / 20; a draft 19 / 20 in the newer "Final test" (2026-11-14).
// - Omar C (omar.c, not linked to Mona): 23 / 25 in "Science quiz"
//   (Science club, 2026-11-15), an exam only he sat.
// - Youssef: no result.
//
// With the activity story (AT-4.2): lesson activity is switched on on day 0
// and Salma opens "Adding fractions"; Mona was linked to Youssef on day 0 and
// is linked to Salma on day 1, when Salma opens "Comparing fractions"; on
// day 2 Salma opens "Reading decimals". The test clock moves the day.
import assert from 'node:assert/strict';
import type { Browser, Page } from 'playwright';
import { Client, setClockOffsetDays, utcDatePlusDays, workerNow } from '../support/http.ts';
import { signedIn } from '../support/seed.ts';
import { G1 } from '../at9/world.ts';
import {
  ADMIN, COMPANY_ADMIN, HADEER, OMAR, SALMA, UNIVERSITY_ADMIN, YOUSSEF, as, browserAs, lessonPath, wave1World, words,
  type SpaceIds, type Tab, type Wave1World, type Width,
} from '../wave1/world.ts';
import type { Lang } from '../../src/labels.ts';

export { ADMIN, HADEER, OMAR, SALMA, YOUSSEF, as, browserAs, words };
export const MONA = { ...G1 };
/** The guardians of the Company and University spaces, each linked to Salma there (UX-9, UX-17b). */
export const RANIA = { display_name: 'Rania Supervisor', username: 'rania.g', password: 'rania-first-pass', role: 'guardian', mobile: '01043434343' } as const;
export const SAMIR = { display_name: 'Samir Guardian', username: 'samir.g', password: 'samir-first-pass', role: 'guardian', mobile: '01044444444' } as const;

export const DATES = { quiz1: '2026-10-20', quiz3: '2026-11-12', draft: '2026-11-14', science: '2026-11-15' };
/** Salma's first result row (ownResults order: newest exam date, then exam title, then id). */
export const SALMA_FIRST = { exam: 'Quiz 3', subject: 'Mathematics', date: DATES.quiz3, score: '14 / 20', corrected: true };
export const OMAR_EXAM = 'Science quiz';
export const OMAR_SCORE = '23 / 25';
export const DRAFT_SCORE = '19 / 20';

export interface L2World extends Wave1World {
  /** Mona's user id. */
  mona: string;
  /** The day of the activity story's last open (day 2), when told. */
  days: string[];
  /** A fresh sign-in of the school's admin (a session does not outlive a move of the clock by days). */
  adminNow(): Promise<Client>;
}

export const linkedHome = (s: { id: string }) => `/s/${s.id}/linked`;
export const learnerPage = (s: { id: string }, learnerId: string) => `/s/${s.id}/linked/${learnerId}`;
export const activityPage = (s: { id: string }, learnerId: string) => `/s/${s.id}/linked/${learnerId}/activity`;
export const editorPath = (s: { id: string }, lessonId: string, query = '') => `/s/${s.id}/publish/compose/${lessonId}${query}`;

async function appoint(admin: Client, spaceId: string, g: { display_name: string; username: string; password: string; role: string; mobile: string }): Promise<void> {
  const res = await admin.post(`/s/${spaceId}/admin/people`, { ...g, valid_until: utcDatePlusDays(30) });
  assert.equal(res.status, 303, `${g.username} appointed (got ${res.status})`);
}

async function idOf(w: Wave1World, username: string): Promise<string> {
  const rows = await w.p.sql(`SELECT id FROM user WHERE username = '${username}'`);
  assert.equal(rows.length, 1, username);
  return String(rows[0].id);
}

/** Links a guardian to a learner through the admin's real form. */
export async function linkThrough(admin: Client, spaceId: string, guardianId: string, learnerId: string): Promise<void> {
  const res = await admin.post(`/s/${spaceId}/admin/people/${guardianId}/links`, { learner: learnerId });
  assert.equal(res.status, 303, `linked (got ${res.status})`);
}

/** Ends a guardian's link through the admin's real form. */
export async function unlinkThrough(admin: Client, spaceId: string, guardianId: string, learnerId: string): Promise<void> {
  const res = await admin.post(`/s/${spaceId}/admin/people/${guardianId}/links/${learnerId}/remove`, {});
  assert.equal(res.status, 303, `unlinked (got ${res.status})`);
}

async function moveTo(w: Wave1World, days: number): Promise<string> {
  assert.equal((await setClockOffsetDays(w.p.url, days)).status, 200, 'the test clock moved');
  return new Date(await workerNow(w.p.url)).toISOString().slice(0, 10);
}

/** The results of section 3's AT-4 steps, in three statements. */
async function results(w: Wave1World): Promise<void> {
  const s = w.school;
  const hadeer = w.ids[HADEER.username];
  const salma = w.ids[SALMA.username];
  const omar = w.ids[OMAR.username];
  await w.p.sql(`INSERT INTO exam (id, space_id, subject_id, title, exam_date, max_mark, created_by, created_at) VALUES
    ('l2-quiz1', '${s.id}', '${s.math}', 'Quiz 1', '${DATES.quiz1}', 20, '${hadeer}', 1),
    ('l2-quiz3', '${s.id}', '${s.math}', 'Quiz 3', '${DATES.quiz3}', 20, '${hadeer}', 1),
    ('l2-unit', '${s.id}', '${s.math}', 'Unit test', '${DATES.quiz3}', 20, '${hadeer}', 1),
    ('l2-final', '${s.id}', '${s.math}', 'Final test', '${DATES.draft}', 20, '${hadeer}', 1),
    ('l2-science', '${s.id}', '${s.science}', '${OMAR_EXAM}', '${DATES.science}', 25, '${hadeer}', 1)`);
  await w.p.sql(`INSERT INTO exam_result (id, space_id, exam_id, learner_user_id, status, mark, published_at, changed_by, changed_at) VALUES
    ('l2-r-quiz1', '${s.id}', 'l2-quiz1', '${salma}', 'marked', 12, 2, '${hadeer}', 2),
    ('l2-r-quiz3', '${s.id}', 'l2-quiz3', '${salma}', 'marked', 14, 2, '${hadeer}', 3),
    ('l2-r-unit', '${s.id}', 'l2-unit', '${salma}', 'marked', 16, 2, '${hadeer}', 2),
    ('l2-r-final', '${s.id}', 'l2-final', '${salma}', 'marked', 19, NULL, '${hadeer}', 2),
    ('l2-r-science', '${s.id}', 'l2-science', '${omar}', 'marked', 23, 2, '${hadeer}', 2)`);
  await w.p.sql(`INSERT INTO exam_result_history (id, result_id, previous_status, previous_mark, new_status, new_mark, reason, changed_by, changed_at) VALUES
    ('l2-h-quiz1', 'l2-r-quiz1', NULL, NULL, 'marked', 12, NULL, '${hadeer}', 2),
    ('l2-h-quiz3', 'l2-r-quiz3', NULL, NULL, 'marked', 13, NULL, '${hadeer}', 2),
    ('l2-h-quiz3-c', 'l2-r-quiz3', 'marked', 13, 'marked', 14, 'Question 2 re-marked', '${hadeer}', 3),
    ('l2-h-unit', 'l2-r-unit', NULL, NULL, 'marked', 16, NULL, '${hadeer}', 2),
    ('l2-h-science', 'l2-r-science', NULL, NULL, 'marked', 23, NULL, '${hadeer}', 2)`);
}

/** The L2 world. `story`: the activity story of AT-4.2 (the clock ends on day 2). `kits`: a guardian linked to Salma in the Company and University spaces. */
export async function l2World(opts: { story?: boolean; kits?: boolean } = {}): Promise<L2World> {
  const base = await wave1World();
  try {
    const w = base as L2World;
    w.adminNow = () => signedIn(w.p.url, ADMIN.username, ADMIN.password);
    w.days = [];
    const s = w.school;
    await appoint(w.admin, s.id, MONA);
    w.mona = await idOf(w, MONA.username);
    w.ids[MONA.username] = w.mona;
    await results(w);
    await linkThrough(w.admin, s.id, w.mona, w.ids[YOUSSEF.username]);
    if (opts.story) {
      const day0 = await moveTo(w, 0);
      assert.equal((await w.admin.post(`/s/${s.id}/admin/activity`, { told: '1' })).status, 303, 'activity on');
      const open = async (title: string) => assert.equal((await (await as(w, SALMA)).get(lessonPath(s, s.lessons[title]))).status, 200, `Salma opens ${title}`);
      await open('Adding fractions');
      const day1 = await moveTo(w, 1);
      await linkThrough(await w.adminNow(), s.id, w.mona, w.ids[SALMA.username]);
      await open('Comparing fractions');
      const day2 = await moveTo(w, 2);
      await open('Reading decimals');
      w.days = [day0, day1, day2];
    } else {
      await linkThrough(w.admin, s.id, w.mona, w.ids[SALMA.username]);
    }
    if (opts.kits) {
      for (const [sp, admin, g] of [[w.company, COMPANY_ADMIN, RANIA], [w.university, UNIVERSITY_ADMIN, SAMIR]] as const) {
        const a = await signedIn(w.p.url, admin.username, admin.password);
        await appoint(a, sp.id, g);
        const id = await idOf(w, g.username);
        w.ids[g.username] = id;
        await linkThrough(a, sp.id, id, w.ids[SALMA.username]);
      }
      // One corrected result for Salma in each of the two spaces, so their cards show a full result line.
      const by = w.ids[COMPANY_ADMIN.username] ?? w.ids['hadeer.trainer'];
      await w.p.sql(`INSERT INTO exam (id, space_id, subject_id, title, exam_date, max_mark, created_by, created_at) VALUES
        ('l2-c-quiz', '${w.company.id}', '${w.company.math}', 'Quiz 3', '${DATES.quiz3}', 20, '${by}', 1),
        ('l2-u-quiz', '${w.university.id}', '${w.university.math}', 'Quiz 3', '${DATES.quiz3}', 20, '${by}', 1)`);
      await w.p.sql(`INSERT INTO exam_result (id, space_id, exam_id, learner_user_id, status, mark, published_at, changed_by, changed_at) VALUES
        ('l2-c-r', '${w.company.id}', 'l2-c-quiz', '${w.ids[SALMA.username]}', 'marked', 14, 2, '${by}', 3),
        ('l2-u-r', '${w.university.id}', 'l2-u-quiz', '${w.ids[SALMA.username]}', 'marked', 14, 2, '${by}', 3)`);
      await w.p.sql(`INSERT INTO exam_result_history (id, result_id, previous_status, previous_mark, new_status, new_mark, reason, changed_by, changed_at) VALUES
        ('l2-c-h1', 'l2-c-r', NULL, NULL, 'marked', 13, NULL, '${by}', 2), ('l2-c-h2', 'l2-c-r', 'marked', 13, 'marked', 14, 'Re-marked', '${by}', 3),
        ('l2-u-h1', 'l2-u-r', NULL, NULL, 'marked', 13, NULL, '${by}', 2), ('l2-u-h2', 'l2-u-r', 'marked', 13, 'marked', 14, 'Re-marked', '${by}', 3)`);
    }
    return w;
  } catch (err) {
    await base.close();
    throw err;
  }
}

// ------------------------------------------------------------- reading ----

export interface ResultSeen {
  exam: string;
  subject: string;
  date: string;
  score: string;
  corrected: boolean;
}

export interface GuardianCardSeen {
  learnerId: string;
  name: string;
  /** The result line's whole text, as read. */
  line: string;
  /** The result line's link target. */
  lineHref: string | null;
  /** The fields of the result line, or null for "No results yet.". */
  result: ResultSeen | null;
  /** The "Last opened" line's text, or null when there is none. */
  lastOpened: string | null;
  activityHref: string | null;
  text: string;
}

/** The guardian home's cards, read in a real browser. */
export async function guardianCards(page: Page): Promise<GuardianCardSeen[]> {
  return page.locator('#linked > section.card[data-learner]').evaluateAll((cards) => cards.map((card) => {
    const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
    const txt = (el: Element | null) => (el ? clean((el as HTMLElement).innerText) : null);
    const line = card.querySelector('.latest-result');
    const score = line?.querySelector('.score');
    return {
      learnerId: card.getAttribute('data-learner') ?? '',
      name: clean((card.querySelector('h2') as HTMLElement | null)?.innerText),
      line: txt(line) ?? '',
      lineHref: line?.closest('a')?.getAttribute('href') ?? line?.querySelector('a')?.getAttribute('href') ?? null,
      result: score ? {
        exam: txt(line!.querySelector('.exam')) ?? '', subject: txt(line!.querySelector('.subject')) ?? '', date: txt(line!.querySelector('.date')) ?? '',
        score: txt(score) ?? '', corrected: Boolean(line!.querySelector('.tag')),
      } : null,
      lastOpened: txt(card.querySelector('.last-opened')),
      activityHref: card.querySelector('a.activity-link')?.getAttribute('href') ?? null,
      text: txt(card) ?? '',
    };
  }));
}

/** The first result row of a guardian's learner page, as read; null when it shows "No results yet.". */
export async function firstResultRow(page: Page): Promise<ResultSeen | null> {
  const row = page.locator('#results li.result').first();
  if (!(await row.count())) return null;
  return row.evaluate((li) => {
    const clean = (el: Element | null) => ((el as HTMLElement | null)?.innerText ?? '').replace(/\s+/g, ' ').trim();
    return { exam: clean(li.querySelector('.exam')), subject: clean(li.querySelector('.subject')), date: clean(li.querySelector('.date')), score: clean(li.querySelector('.score')), corrected: Boolean(li.querySelector('.corrected')) };
  });
}

/** The newest row of a guardian's activity page (newest date; on a tie the first in the page's order), or null for none. */
export async function newestActivityRow(page: Page): Promise<{ title: string; date: string } | null> {
  const rows = await page.locator('#activity li.row').evaluateAll((lis) => lis.map((li) => ({
    title: ((li.querySelector('.title') as HTMLElement | null)?.innerText ?? '').trim(),
    date: (li.querySelector('.opened')?.textContent ?? '').match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? '',
  })));
  let best: { title: string; date: string } | null = null;
  for (const r of rows) if (r.date && (!best || r.date > best.date)) best = r;
  return best;
}

/** Opens a page and asserts it answered 200. */
export async function go(page: Page, w: Wave1World, path: string): Promise<void> {
  const res = await page.goto(w.p.url + path);
  assert.equal(res?.status(), 200, `${path} answers 200`);
}

/** A fresh browser signed in as Mona (or another guardian), in her own language. */
export function guardianTab(browser: Browser, w: L2World, lang: Lang = 'ar', opts: { width?: Width; who?: { username: string; password: string } } = {}): Promise<Tab> {
  return browserAs(browser, w, opts.who ?? MONA, { lang, width: opts.width });
}

/** The result line a card should show for a result row, in a language (section 8.1). */
export function expectedLine(t: ReturnType<typeof words>, r: ResultSeen | null): string {
  if (!r) return t('resultsNone');
  return `${t('latestResultLine', { exam: r.exam, subject: r.subject, date: r.date, score: r.score })}${r.corrected ? ` ${t('correctedTag')}` : ''}`;
}

// ------------------------------------------------------- the chooser ----

/** The four kinds of the chooser, in order, with their form ids and the `?add=` value (section 8.2). */
export const KINDS = [
  { kind: 'file', form: 'add-file', choice: 'choiceFile' },
  { kind: 'video_link', form: 'add-video', choice: 'choiceVideo' },
  { kind: 'link', form: 'add-link', choice: 'choiceLink' },
  { kind: 'note', form: 'add-note', choice: 'choiceNote' },
] as const;
export type Kind = (typeof KINDS)[number]['kind'];

export interface ChooserSeen {
  /** How many chooser controls the page holds. */
  choosers: number;
  heading: string;
  choices: { kind: string; text: string; href: string; expanded: string | null }[];
  /** The ids of the add forms a person can see. */
  open: string[];
  /** Every form a person can see that posts to the add route. */
  visibleAddForms: number;
  status: string | null;
  materials: string[];
}

export async function chooserOn(page: Page): Promise<ChooserSeen> {
  return page.evaluate(() => {
    const clean = (el: Element | null) => ((el as HTMLElement | null)?.innerText ?? '').replace(/\s+/g, ' ').trim();
    const shown = (el: Element) => (el as HTMLElement).offsetParent !== null && getComputedStyle(el).visibility !== 'hidden';
    const box = document.querySelector('#add-new');
    const forms = [...document.querySelectorAll('form')].filter((f) => (f.getAttribute('action') ?? '').endsWith('/add') && f.querySelector('input[name=kind]'));
    return {
      choosers: document.querySelectorAll('#add-new').length,
      heading: clean(box?.querySelector('h2') ?? null),
      choices: [...(box?.querySelectorAll('a.choice') ?? [])].map((a) => ({ kind: a.getAttribute('data-kind') ?? '', text: clean(a), href: a.getAttribute('href') ?? '', expanded: a.getAttribute('aria-expanded') })),
      open: forms.filter(shown).map((f) => f.id),
      visibleAddForms: forms.filter(shown).length,
      status: document.querySelector('#added[role=status]') ? clean(document.querySelector('#added')) : null,
      materials: [...document.querySelectorAll('#items > li')].map((li) => clean(li.querySelector('.title'))),
    };
  });
}

/** Material titles and kinds of a lesson, in their stored order. */
export async function storedMaterials(w: Wave1World, lessonId: string): Promise<{ title: string; kind: string }[]> {
  return (await w.p.sql(`SELECT title, kind FROM material WHERE lesson_id = '${lessonId}' AND removed_at IS NULL ORDER BY position, id`))
    .map((r) => ({ title: String(r.title), kind: String(r.kind) }));
}

/** Five additions (AT-4.5) and three refusals, with made-up files. */
export const PDF_BYTES = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
export const PNG_BYTES = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR4nGPgzvMnCTGMahjVMHw1AAAQ/sgBnMi6gAAAAABJRU5ErkJggg==', 'base64');
export const REFUSED = [
  { name: 'worksheet.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: Buffer.from('PK\u0003\u0004 a word document'), key: 'uploadType' },
  { name: 'big.pdf', mimeType: 'application/pdf', buffer: Buffer.concat([PDF_BYTES, Buffer.alloc(25 * 1024 * 1024 + 1 - PDF_BYTES.length, 32)]), key: 'uploadTooLarge' },
  { name: 'drawing.png', mimeType: 'image/png', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect width="4" height="4"/></svg>'), key: 'uploadType' },
] as const;

export type { SpaceIds, Tab, Width };
