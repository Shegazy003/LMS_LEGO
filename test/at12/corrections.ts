// Shared by the R2-c tests (contract product-contract-r2, AT-11d to 11f,
// AT-12 and the results views of AT-13): the R2-b results world
// (test/at10/marks.ts) with G1 linked to A and B and G2 to A, and the helpers
// that drive the publisher's correction form, the history pages of the
// publisher and the admin, and the results a learner or guardian reads.
//
// The correction form lives on the exam's own address
// (/s/<space>/publish/marks/<exam>/correct, the learner in the query or the
// form), so every publisher route keeps a single id in its address.
import assert from 'node:assert/strict';
import { Client } from '../support/http.ts';
import { A, B, C, D, HADEER, MATH_ORDER, SHIMAA, as, createExam, marksPath, publishAll, resultsWorld, storedRows } from '../at10/marks.ts';
import { G1, G2, personPath } from '../at9/world.ts';

export { A, B, C, D, G1, G2, HADEER, MATH_ORDER, SHIMAA, as, createExam, marksPath, personPath, publishAll, storedRows };

export type CorrectionWorld = Awaited<ReturnType<typeof correctionWorld>>;

/** The R2-b results world (Mid-term: A 17, B Absent, C 12, D 15.5, published;
 * an Arabic draft for A), with G1 linked to A and B and G2 to A. */
export function correctionWorld() {
  return resultsWorld({ links: true });
}

export const correctPath = (w: { spaceId: string }, examId: string) => `${marksPath(w as never, examId)}/correct`;
export const historyPath = (w: { spaceId: string }, examId: string) => `${marksPath(w as never, examId)}/history`;
// A neutral address word ("details"), so that no address names a kit word (test/guards/no-hardcoded-labels.test.ts).
export const examEditPath = (w: { spaceId: string }, examId: string) => `${marksPath(w as never, examId)}/details`;
export const adminResultsPath = (w: { spaceId: string }, examId?: string) => `/s/${w.spaceId}/admin/results${examId ? `/${examId}` : ''}`;
export const linkedPath = (w: { spaceId: string; ids: Record<string, string> }, username: string) => `/s/${w.spaceId}/linked/${w.ids[username]}`;

/** Opens the correction page of one row; returns its status, page and the form's version. */
export async function openCorrection(w: { spaceId: string }, publisher: Client, examId: string, learnerId: string): Promise<{ status: number; html: string; version: string }> {
  const res = await publisher.get(`${correctPath(w, examId)}?learner=${encodeURIComponent(learnerId)}`);
  const html = await res.text();
  return { status: res.status, html, version: html.match(/<form id="correct"[\s\S]*?name="version" value="([^"]*)"/)?.[1] ?? '' };
}

export interface Correction {
  mark?: string;
  absent?: boolean;
  reason: string;
  /** The version the correction page showed; read from the page when not given. */
  version?: string;
}

/** The correction form as the page posts it. */
export function correctionForm(learnerId: string, v: Correction & { version: string }): FormData {
  const f = new FormData();
  f.set('learner', learnerId);
  f.set('mark', v.mark ?? '');
  if (v.absent) f.set('absent', '1');
  f.set('reason', v.reason);
  f.set('version', v.version);
  return f;
}

/** Corrects one published row through the publisher's real form (the page first, then the post). */
export async function correct(w: { spaceId: string }, publisher: Client, examId: string, learnerId: string, v: Correction): Promise<Response> {
  const version = v.version ?? (await openCorrection(w, publisher, examId, learnerId)).version;
  return publisher.post(correctPath(w, examId), correctionForm(learnerId, { ...v, version }));
}

/** Corrects and asserts it was accepted. */
export async function corrected(w: { spaceId: string }, publisher: Client, examId: string, learnerId: string, v: Correction): Promise<void> {
  const res = await correct(w, publisher, examId, learnerId, v);
  assert.equal(res.status, 303, `the correction is accepted (got ${res.status}): ${(await res.text()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 300)}`);
}

const unescape = (s: string) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
export const text = (s: string) => unescape(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
const pick = (body: string, cls: string) => text(body.match(new RegExp(`<span class="${cls}"[^>]*>([\\s\\S]*?)</span>`))?.[1] ?? '');

export interface HistoryEntry {
  kind: string;
  previous: string;
  value: string;
  who: string;
  when: string;
  reason: string;
}

export interface HistoryRow {
  learner: string;
  name: string;
  current: string;
  entries: HistoryEntry[];
}

/** The rows of a history page (the publisher's or the admin's), in page order. */
export function historyRows(html: string): HistoryRow[] {
  return [...html.matchAll(/<section class="card result-history" id="row-[^"]*" data-learner="([^"]+)">([\s\S]*?)<\/section>/g)].map((m) => ({
    learner: m[1],
    name: text(m[2].match(/<bdi class="name">([\s\S]*?)<\/bdi>/)?.[1] ?? ''),
    current: pick(m[2], 'current'),
    entries: [...m[2].matchAll(/<li class="history-entry" data-kind="(\w+)">([\s\S]*?)<\/li>/g)].map((e) => ({
      kind: e[1], previous: pick(e[2], 'previous'), value: pick(e[2], 'new'), who: pick(e[2], 'who'), when: pick(e[2], 'when'), reason: pick(e[2], 'reason'),
    })),
  }));
}

export interface ResultCard {
  exam: string;
  subject: string;
  date: string;
  score: string;
  corrected: string;
}

/** The result cards of a learner's My results or of a guardian's results section, in page order. */
export function resultCards(html: string): ResultCard[] {
  return [...html.matchAll(/<li class="card result"[^>]*>([\s\S]*?)<\/li>/g)].map((m) => ({
    exam: text(m[1].match(/<bdi class="exam">([\s\S]*?)<\/bdi>/)?.[1] ?? ''),
    subject: text(m[1].match(/<bdi class="subject">([\s\S]*?)<\/bdi>/)?.[1] ?? ''),
    date: pick(m[1], 'muted date'),
    score: pick(m[1], 'score'),
    corrected: pick(m[1], 'corrected'),
  }));
}

/** The results section of a guardian's learner page: its heading and its cards; null when there is none. */
export function guardianResults(html: string): { heading: string; cards: ResultCard[] } | null {
  const section = html.match(/<section id="results"[^>]*>([\s\S]*?)<\/section>/)?.[1];
  if (section === undefined) return null;
  return { heading: text(section.match(/<h2 id="results-title">([\s\S]*?)<\/h2>/)?.[1] ?? ''), cards: resultCards(section) };
}

/** The date of a time in milliseconds as the product writes it (YYYY-MM-DD, UTC). */
export const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
/** The date and time of a time in milliseconds as the history writes it (YYYY-MM-DD HH:MM, UTC). */
export const isoMinute = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');

/** A result and its history rows, read from the database (oldest first). */
export async function stored(w: { p: { sql(q: string): Promise<Record<string, unknown>[]> } }, resultId: string) {
  const [row] = await w.p.sql(`SELECT status, mark, published_at, changed_by, changed_at FROM exam_result WHERE id = '${resultId}'`);
  const history = await w.p.sql(
    `SELECT previous_status, previous_mark, new_status, new_mark, reason, changed_by, changed_at FROM exam_result_history WHERE result_id = '${resultId}' ORDER BY changed_at, rowid`,
  );
  return { row, history };
}

/** Every result row and every history row of the database, for "nothing changed" checks. */
export async function everything(w: { p: { sql(q: string): Promise<Record<string, unknown>[]> } }) {
  const results = (await w.p.sql('SELECT id, status, mark, published_at, changed_by, changed_at FROM exam_result ORDER BY id')).map((r) => JSON.stringify(r));
  const history = (await w.p.sql('SELECT id, result_id, new_status, new_mark, reason FROM exam_result_history ORDER BY id')).map((r) => JSON.stringify(r));
  const exams = (await w.p.sql('SELECT id, title, exam_date, max_mark FROM exam ORDER BY id')).map((r) => JSON.stringify(r));
  return { results, history, exams };
}

/** A fresh Mathematics exam "Quiz 1" (maximum 20), published with A 14, B 11, C 12, D 15. */
export async function quiz1(w: CorrectionWorld): Promise<{ exam: string; rows: Awaited<ReturnType<typeof storedRows>> }> {
  const exam = await createExam(w, w.hadeer, w.content.math, { title: 'Quiz 1', exam_date: '2026-11-05', max_mark: '20' });
  await publishAll(w, w.hadeer, exam, MATH_ORDER.map((p) => p.username), {
    [A.username]: { mark: '14' }, [B.username]: { mark: '11' }, [C.username]: { mark: '12' }, [D.username]: { mark: '15' },
  });
  return { exam, rows: await storedRows(w, exam) };
}

/** True when a number appears in a text on its own (not inside a longer number or a date). */
export const standsAlone = (textToSearch: string, n: string) => new RegExp(`(^|[^\\d.\\-])${n.replace('.', '\\.')}([^\\d.\\-]|$)`).test(textToSearch);

export { as as signedInAs };
