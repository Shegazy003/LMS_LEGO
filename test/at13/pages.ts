// Shared by the AT-13 privacy tests (contract product-contract-r2, AT-13 and
// section 3): every page a guardian (or the dual-role person) can reach, in
// Arabic and in English, found by following the links on the pages themselves
// from the person's home, plus the addresses a curious person could type.
import { Client } from '../support/http.ts';
import { A, B, G1, G2, as, linkThrough, type World } from '../at9/world.ts';
import { resultsWorld } from '../at10/marks.ts';
import { utcDatePlusDays } from '../support/http.ts';
import { UI } from '../../src/i18n/ui.ts';

export interface Reached {
  path: string;
  status: number;
  cacheControl: string | null;
  contentType: string;
  body: string;
}

export type PrivacyWorld = Awaited<ReturnType<typeof resultsWorld>>;

/** The world for AT-13: G1 linked to A and B, G2 to A, and B (a learner) also
 * the guardian of A; from R2-b, a published Mathematics exam (A 17, B Absent,
 * C 12, D 15.5) and an Arabic draft for A (test/at10/marks.ts). */
export async function privacyWorld(): Promise<PrivacyWorld> {
  const w = await resultsWorld({ links: true, extra: [{ username: B.username, role: 'guardian', valid_until: utcDatePlusDays(30) }] });
  const res = await linkThrough(w, w.ids[B.username], w.ids[A.username]);
  if (res.status !== 303) {
    await w.close();
    throw new Error(`B linked to A: ${res.status}`);
  }
  return w;
}

/** The results pages a curious person could type: My results, every result row (published and draft), and the marks pages
 * (R2-b); from R2-c, the publisher's history and correction pages and the admin's results pages. */
export function resultPaths(w: PrivacyWorld): string[] {
  return [
    `/s/${w.spaceId}/results`,
    ...[...Object.values(w.published), ...Object.values(w.draft)].map((r) => `/s/${w.spaceId}/results/${r.id}`),
    `/s/${w.spaceId}/publish/marks/${w.exam}`, `/s/${w.spaceId}/publish/marks/${w.draftExam}`,
    `/s/${w.spaceId}/publish/marks/${w.exam}/history`, `/s/${w.spaceId}/publish/marks/${w.exam}/correct?learner=${w.ids[A.username]}`,
    `/s/${w.spaceId}/admin/results`, `/s/${w.spaceId}/admin/results/${w.exam}`, `/s/${w.spaceId}/admin/results/${w.draftExam}`,
  ];
}

/** R2-c: the results section of a guardian's learner page. Its digits are
 * allowed only in these forms: each result's exam date (YYYY-MM-DD), its
 * score ("mark / maximum", or none for Absent) and its "Corrected on <date>"
 * line. Returns the page with the section taken out, and every piece of the
 * section, outside those forms, that holds a digit (none expected). */
export function resultsSection(html: string): { rest: string; strays: string[] } {
  const strays: string[] = [];
  // LMS wave 1, L2 (product-contract v2 on PIL-210, sections 8.1 and 10.5): the guardian home's "Latest result"
  // line of each own linked learner is that learner page's first result row, held to the same allowed forms.
  const rest = html.replace(/<section id="results"[^>]*>([\s\S]*?)<\/section>|<a class="latest-result[^"]*"[^>]*>([\s\S]*?)<\/a>/g, (_, inPage: string | undefined, onHome: string | undefined) => {
    const section = inPage ?? onHome ?? '';
    const left = section
      .replace(/<span class="muted date" dir="ltr">\d{4}-\d{2}-\d{2}<\/span>/g, ' ')
      .replace(/<span class="score" dir="auto">(\d{1,4}(\.\d)? \/ \d{1,4}(\.\d)?|[^<\d]*)<\/span>/g, ' ')
      .replace(/<span class="corrected">[^<\d]*\d{4}-\d{2}-\d{2}[^<\d]*<\/span>/g, ' ')
      .replace(/<[^>]+>/g, ' ');
    for (const m of left.matchAll(/[^\s]*[0-9٠-٩][^\s]*/g)) strays.push(m[0]);
    return ' ';
  });
  return { rest, strays };
}

export const VIEWERS = { G1, G2, B } as const;

/** Sets a person's own language (My account), so every page of theirs is in it. */
export async function useLanguage(c: Client, lang: 'ar' | 'en'): Promise<void> {
  const res = await c.post('/account/language', { lang });
  if (res.status !== 303) throw new Error(`language ${lang}: ${res.status}`);
}

/** Every page reachable by following same-site links from the person's home (sign-out aside), and the typed addresses. */
export async function crawl(c: Client, start: string[], typed: string[] = [], limit = 80, keep: (path: string) => boolean = () => true): Promise<Reached[]> {
  const seen = new Set<string>();
  const queue = [...start, ...typed];
  const out: Reached[] = [];
  while (queue.length && out.length < limit) {
    const path = queue.shift()!;
    if (seen.has(path)) continue;
    seen.add(path);
    const res = await c.get(path);
    const contentType = res.headers.get('content-type') ?? '';
    const body = contentType.startsWith('text/') ? await res.text() : Buffer.from(await res.arrayBuffer()).toString('latin1');
    out.push({ path, status: res.status, cacheControl: res.headers.get('cache-control'), contentType, body });
    if (res.status >= 300 && res.status < 400) {
      const to = res.headers.get('location');
      if (to?.startsWith('/') && keep(to)) queue.push(to);
      continue;
    }
    if (!contentType.startsWith('text/html')) continue;
    for (const m of body.matchAll(/(?:href|src)="(\/[^"#]*)/g)) {
      const next = m[1].replace(/&amp;/g, '&');
      if (!seen.has(next) && keep(next)) queue.push(next);
    }
  }
  return out;
}

/** The guardian pages of a world: homes and each linked learner's page, for every viewer. */
export function guardianPaths(w: World): string[] {
  return [`/s/${w.spaceId}`, `/s/${w.spaceId}/linked`, `/s/${w.spaceId}/linked/${w.ids[A.username]}`, `/s/${w.spaceId}/linked/${w.ids[B.username]}`];
}

/** The text a person reads on a page (tags, scripts and styles removed). */
export function visible(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

export { A, B, G1, G2, as };

// ----------------------------------------------- lesson-activity scan ----
// Section 3: the scan uses the exact phrases of the feature's dictionary keys,
// in both languages, not word stems, so ordinary words such as "Open" are never
// hit. From R2-d the phrases of the feature's own keys are added (R2D_KEYS),
// and those keys are the exempt list.

/** The dictionary keys added by R2-d (lesson activity). Each is shown only on an exempt page or piece. */
export const R2D_KEYS = [
  'activityStatusOn', 'activityStatusOff', 'activityWhatTitle', 'activityWhat', 'activityWhoTitle', 'activityWho', 'activityKeptTitle',
  'activityKept', 'activityStartNote', 'activityNoticeTitle', 'activityTold', 'activityToldNote', 'activitySwitchOn', 'activityToldMissing',
  'activityOffNote', 'activitySwitchOff', 'activityOffConfirmTitle', 'activityOffYes', 'activityOnDone', 'activityOffDone', 'activityNotice',
  'activityOff', 'lastOpenedOn', 'noOpenRecorded', 'recordingSince', 'activityExplain', 'activityWhose',
] as const;

export const ACTIVITY_PHRASES = {
  en: [
    'Last opened on', 'No open recorded', 'Recording since', 'Lesson activity', 'which lessons you opened', 'Not opened', 'last opened', 'times opened',
    'is not switched on in', 'you last opened them',
  ],
  ar: [
    'نشاط الدروس', 'آخر فتح', 'تاريخ آخر فتح', 'لم يُسجَّل فتح', 'لم يسجل فتح', 'التسجيل منذ', 'الدروس التي فتحتها', 'لم يُفتح', 'لم يفتح',
    'لا يوجد فتح مسجّل', 'أي الدروس فتحتها',
  ],
};

/** Dictionary keys allowed to carry a phrase: the exempt places of section 3 (R2-d's own keys). From LMS wave 1
 * (product-contract v2 on PIL-210, sections 7.1 and 10.4), the detail of the learner's notice, which the notice
 * (exempt place 3) shows in full once and then behind "What is recorded"; like the notice line it is marked
 * data-activity and taken out before every page scan. */
// LMS wave 1, L2 (sections 8.1 and 10.5): also the guardian home's "Last opened" piece, shown only while activity is
// on and marked data-activity like every activity piece (taken out before every page scan).
export const EXEMPT_KEYS: string[] = [...R2D_KEYS, 'activityDetail', 'lastOpenedLine', 'lastOpenedNone'];

const MONTHS = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}\b|(يناير|فبراير|مارس|أبريل|إبريل|مايو|يونيو|يوليو|أغسطس|سبتمبر|أكتوبر|نوفمبر|ديسمبر)/i;

/** Every lesson-activity phrase, open date, count or time found in a text. */
export function activityIn(text: string): string[] {
  const hits: string[] = [];
  for (const p of ACTIVITY_PHRASES.en) if (text.toLowerCase().includes(p.toLowerCase())) hits.push(p);
  for (const p of ACTIVITY_PHRASES.ar) if (text.includes(p)) hits.push(p);
  if (/\d{4}-\d{2}-\d{2}/.test(text)) hits.push('a date');
  if (MONTHS.test(text)) hits.push('a month name');
  if (/\b\d{1,2}:\d{2}\b/.test(text)) hits.push('a time of day');
  if (/[0-9٠-٩]/.test(text)) hits.push('a number (a count, a date or a time)');
  return hits;
}

/** The exempt pages (section 3, places 1 and 2): the guardian's lesson-activity page and the admin's switch page with its step. */
export const isExemptPage = (path: string) => /^\/s\/[^/]+\/linked\/[^/]+\/activity(\?|$)/.test(path) || /^\/s\/[^/]+\/admin\/activity(\/off)?(\?|$)/.test(path);

/** A page with its exempt pieces taken out: the learner's notice, the "not
 * switched on" line and the links to the exempt pages, each marked
 * data-activity (src/views/activity.ts). Each is one element holding no
 * element of its own name. */
export function exemptRemoved(html: string): string {
  return html.replace(/<(p|a)\b[^>]*\bdata-activity\b[^>]*>[\s\S]*?<\/\1>/g, ' ');
}

// ------------------------------------------------- done marks (LMS wave 2) ----
// Product-contract v2 on PIL-225, AT-2.4: the scans gain the English and Arabic
// words of every ui.ts key W2-1 added, and the tick's marker attribute, for
// guardian pages and for other learners' reach, and pass with A's marks present.

/** The ui.ts keys W2-1 (W2-1a and W2-1b) and W2-2 added that a page shows as words. (doneCount
 * is only the number part inside doneProgress and allDone, so it is found through them.) */
export const W2_KEYS = [
  'markDone', 'markNotDone', 'doneTag', 'markedDone', 'markedNotDone', 'markFailed', 'doneProgress', 'allDone', 'chapterAllDone',
  // W2-2 (AT-5.4): the learner home's continue area and the started card's action.
  'continueHeading', 'continueFirst', 'continueLink', 'everythingDone', 'readAgain',
] as const;

/** A's done marks while the viewers look around: A presses "Mark as done" on both
 * of her lessons (Mathematics, shared with B and C, and Arabic, hers alone). */
export async function withDoneMarks(w: PrivacyWorld): Promise<void> {
  const a = new Client(w.p.url);
  const signin = await a.post('/signin', { username: A.username, password: A.password });
  if (signin.status !== 302) throw new Error(`A signs in: ${signin.status}`);
  const arabic = await w.p.sql(`SELECT l.id FROM lesson l JOIN chapter c ON c.id = l.chapter_id WHERE c.subject_id = '${w.content.arabic}'`);
  for (const lesson of [w.content.lesson, String(arabic[0].id)]) {
    const res = await a.post(`/s/${w.spaceId}/read/${lesson}/done`, { state: 'done' });
    if (res.status !== 303) throw new Error(`A marks a lesson done: ${res.status}`);
  }
  const rows = await w.p.sql('SELECT COUNT(*) AS n FROM done_mark');
  if (Number(rows[0].n) !== 2) throw new Error(`A's two done marks are stored: ${rows[0].n}`);
}

/** The done-mark words a viewer must never meet, in both languages: the fixed text of each key.
 * A viewer who is also a learner meets "Mark as done" on their own lessons (and, in Arabic, the
 * tag word inside it), so for them those two are left out: the tag is still found by its marker.
 * From W2-2 every learner home (and every preview home) also shows the continue area's heading and
 * its first-time line, so those are left out too: a learner's own progress is found by its marker. */
const LEARNER_TOO = new Set<string>(['markDone', 'doneTag', 'continueHeading', 'continueFirst']);
export function doneWords(learnerToo: boolean): Map<string, string> {
  const words = new Map<string, string>();
  for (const lang of ['en', 'ar'] as const) {
    for (const key of W2_KEYS) {
      if (learnerToo && LEARNER_TOO.has(key)) continue;
      // The longest fixed part of the value (the text between its {placeholders}).
      words.set(`${lang} ${key}`, UI[lang][key].split(/{[^}]*}/).map((x) => x.trim()).sort((x, y) => y.length - x.length)[0]);
    }
  }
  return words;
}

// ---------------------------------------- add from a spreadsheet (LMS wave 3b) ----
// Product-contract v2 on PIL-232, AT-4.3 and section 10 item 3: the scans gain
// the full numbers of people added from a spreadsheet, and the words of the
// ui.ts keys W3b-1 added, and pass with an upload made through the real forms.

/** Two made-up people the admin adds from a spreadsheet before the scans (0104 range, as the other made-up numbers). */
export const UPLOADED = [
  { display_name: 'Upload Test One', username: 'upload.one', mobile: '01046470001' },
  { display_name: 'Upload Test Two', username: 'upload.two', mobile: '01046470002' },
];

/** The ui.ts keys W3b-1 added that a page shows as words (the column words are today's keys; a few keys whose
 * longest fixed part is a single common word, such as "Role:" or "Row", are found through the others). */
export const W3B_KEYS = [
  'uploadEntry', 'uploadTitle', 'uploadStep1', 'uploadHow', 'uploadDateCol', 'uploadLimits', 'uploadSheet', 'uploadFile', 'uploadCheck',
  'uploadCheckSaves', 'checkTitle', 'checkSummary', 'checkNothingSaved', 'checkSkip', 'checkRefused', 'checkWillAdd', 'checkAdd', 'checkAnother',
  'checkNone', 'checkChanged', 'uploadFailed', 'rowName', 'rowUsername', 'rowUsernameTwice', 'rowUsernameTaken', 'rowRoleUnclear', 'rowMobile',
  'rowEndDate', 'rowEndDateOwn', 'rowFields', 'fileNotCsv', 'fileNotUtf8', 'fileTooBig', 'fileEmpty', 'fileColumns', 'fileColumnsTwice',
  'filePassword', 'doneTitle', 'doneMeta', 'doneAgain', 'doneNoPassword', 'noPasswordTag', 'passwordSetTag', 'addToGroup',
  // W3b-1b: the person-page line, the way back from the reset-link pages, Earlier uploads.
  'noPasswordLine', 'backToUpload', 'uploadsHeading', 'uploadsNone',
] as const;

/** The admin adds UPLOADED from a spreadsheet: the check, then Add (the real forms). Returns the upload's id. */
export async function withUpload(w: PrivacyWorld): Promise<string> {
  const text = ['Name,Username,Role,Mobile number,End date', ...UPLOADED.map((p) => `${p.display_name},${p.username},learner,${p.mobile},${utcDatePlusDays(20)}`), ''].join('\r\n');
  const form = new FormData();
  form.set('file', new Blob([text], { type: 'text/csv' }), 'class.csv');
  const checked = await w.admin.post(`/s/${w.spaceId}/admin/upload/check`, form);
  const page = await checked.text();
  const hidden = (name: string) => new RegExp(`<input type="hidden" name="${name}" value="([^"]*)">`).exec(page)?.[1];
  const carried = { text: (hidden('text') ?? '').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'), fp: hidden('fp') ?? '' };
  if (checked.status !== 200 || !carried.fp) throw new Error(`the admin checks the file: ${checked.status}`);
  const added = await w.admin.post(`/s/${w.spaceId}/admin/upload/add`, carried);
  const id = /\/admin\/upload\/([0-9a-f-]{36})$/.exec(added.headers.get('location') ?? '')?.[1];
  if (added.status !== 303 || !id) throw new Error(`the admin adds the people: ${added.status}`);
  return id;
}

/** The upload words a guardian or learner must never meet, in both languages (the longest fixed part of each key). */
export function uploadWords(): Map<string, string> {
  const words = new Map<string, string>();
  for (const lang of ['en', 'ar'] as const) {
    for (const key of W3B_KEYS) words.set(`${lang} ${key}`, UI[lang][key].split(/{[^}]*}/).map((x) => x.trim()).sort((x, y) => y.length - x.length)[0]);
  }
  return words;
}

/** Every upload word in the text a person reads on a page. */
export function uploadHits(body: string, words = uploadWords()): string[] {
  const text = visible(body);
  return [...words].filter(([, value]) => text.includes(value)).map(([name]) => name);
}

/** Every done-mark word or marker on a page (words in the text a person reads, the marker anywhere). */
export function doneHits(body: string, words: Map<string, string>): string[] {
  const text = visible(body);
  const hits = [...words].filter(([, value]) => text.includes(value)).map(([name]) => name);
  if (/\bdata-done\b/.test(body)) hits.push('the tick marker data-done');
  return hits;
}

// ------------------------------------------------- chapters in order (LMS wave 4) ----
// Product-contract v2 on PIL-238, AT-4.5 and section 11 item 3: the scans gain
// the English and Arabic words of every ui.ts key W4-1a added for learners, and
// the locked chapter's marker attribute, for guardian pages and for other
// learners' reach, and pass with A's locks present.

/** The ui.ts keys wave 4 added that a learner's page shows as words (lockedCount and lockedCountOne are only the count inside the reasons, found through them);
 * W4-1b adds the two status lines after a press (markedOpened, markedRelocked). */
export const W4_KEYS = ['orderLine', 'lockedTag', 'lockedReason', 'lockedLater', 'goTo', 'markedOpened', 'markedRelocked'] as const;

/** A's locks while the viewers look around: Arabic (assigned to A alone) gains a lesson A has not marked in its first chapter
 * and a second chapter, and is set in order, so its second chapter is locked for A. Call after withDoneMarks. */
export async function withLocks(w: PrivacyWorld): Promise<void> {
  const grammar = await w.p.sql(`SELECT id, space_id FROM chapter WHERE subject_id = '${w.content.arabic}'`);
  if (grammar.length !== 1) throw new Error(`Arabic has one chapter: ${grammar.length}`);
  const space = String(grammar[0].space_id);
  await w.p.sql(`INSERT INTO lesson (id, space_id, chapter_id, title, body_text, position) VALUES ('w4-nahw-more', '${space}', '${grammar[0].id}', 'Nahw more', '', 50)`);
  await w.p.sql(`INSERT INTO chapter (id, space_id, subject_id, title, position) VALUES ('w4-morphology', '${space}', '${w.content.arabic}', 'Morphology', 50)`);
  await w.p.sql(`INSERT INTO lesson (id, space_id, chapter_id, title, body_text, position) VALUES ('w4-word-forms', '${space}', 'w4-morphology', 'Word forms', '', 1)`);
  await w.p.sql(`UPDATE subject SET chapters_in_order = 1 WHERE id = '${w.content.arabic}'`);
  const a = new Client(w.p.url);
  if ((await a.post('/signin', { username: A.username, password: A.password })).status !== 302) throw new Error('A signs in');
  const outline = await (await a.get(`/s/${w.spaceId}/learn/${w.content.arabic}`)).text();
  if (lockHits(outline).length === 0) throw new Error('A sees her locks on Arabic');
}

/** The lock words a guardian or another learner must never meet, in both languages (the longest fixed part of each key). */
export function lockWords(): Map<string, string> {
  const words = new Map<string, string>();
  for (const lang of ['en', 'ar'] as const) {
    for (const key of W4_KEYS) words.set(`${lang} ${key}`, UI[lang][key].split(/{[^}]*}/).map((x) => x.trim()).sort((x, y) => y.length - x.length)[0]);
  }
  return words;
}

/** Every lock word or marker on a page (words in the text a person reads, the marker anywhere). */
export function lockHits(body: string, words = lockWords()): string[] {
  const text = visible(body);
  const hits = [...words].filter(([, value]) => text.includes(value)).map(([name]) => name);
  if (/\bdata-locked\b/.test(body)) hits.push('the lock marker data-locked');
  return hits;
}
