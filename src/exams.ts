// Exams and marks (release 2, R2-b; contract product-contract-r2, AT-10 and
// AT-11a to 11c, sections 5 and 6).
//
// A publisher makes an exam inside a subject they are responsible for, enters
// the whole list on one page (a mark, or Absent, per learner), keeps it as a
// draft, and publishes it in one atomic step after a page that lists every
// row. Each learner then sees exactly their own published results.
//
// Rules kept by every function here:
// - Space: every statement names the space_id of every space table it touches
//   (test/guards/space-isolation.test.ts); history rows are reached through
//   their result, which carries it.
// - The person, not the address: each write repeats, in its own statement,
//   that the exam belongs to a subject this publisher is responsible for; what
//   a learner reads is found from the session's person, never from an id in
//   the address alone.
// - Drafts are excluded in the query layer: every statement a learner can
//   trigger reads published rows only (published_at IS NOT NULL), so a draft
//   answers exactly as a missing row does.
// - Publishing is one batch (one transaction): every row is published and
//   each gets its history row, or nothing changes at all. A history row is
//   written only for a result this very batch published, and only once, so a
//   second tab pressing Publish changes nothing.
// - Nothing about a mark goes to the log: a failed read or write of results is
//   reported with a fixed message, without the values it carried (section 6,
//   rule 7).
import { membershipStatus } from './access.ts';
import type { Db, Param } from './db.ts';

export const MARK_MAX = 1000;

// -------------------------------------------------------------- reading ----
export type MarkError = 'markMissing' | 'markInvalid' | 'markOutOfRange' | 'markAndAbsent';

/** One row of the marks form, read: a mark, Absent, empty (allowed in a draft), or refused. */
export type RowInput =
  | { kind: 'marked'; mark: number }
  | { kind: 'absent' }
  | { kind: 'empty' }
  | { kind: 'refused'; error: MarkError };

const ARABIC_INDIC = /[٠-٩]/g;
const EASTERN_ARABIC_INDIC = /[۰-۹]/g;

/** A typed number with at most one decimal: Latin or Arabic-Indic digits, with
 * ".", "," or "٫" as the decimal mark, surrounding spaces ignored; a minus sign
 * is read so that a mark below 0 can be named as such. Null when it is not
 * such a number (letters, two decimals, 1,7,5, nothing typed). */
export function readNumber(typed: string): number | null {
  const text = typed
    .replace(ARABIC_INDIC, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(EASTERN_ARABIC_INDIC, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/^[\s ‎‏]+|[\s ‎‏]+$/g, '');
  const m = /^([-−]?)(\d{1,6})(?:[.,٫](\d))?$/.exec(text);
  if (!m) return null;
  const value = Number(m[2]) + (m[3] === undefined ? 0 : Number(m[3]) / 10);
  return m[1] ? -value : value;
}

/** Reads one row of the marks form against the exam's maximum. */
export function readRow(typed: string, absent: boolean, max: number): RowInput {
  const filled = typed.trim() !== '';
  if (filled && absent) return { kind: 'refused', error: 'markAndAbsent' };
  if (absent) return { kind: 'absent' };
  if (!filled) return { kind: 'empty' };
  const mark = readNumber(typed);
  if (mark === null) return { kind: 'refused', error: 'markInvalid' };
  if (mark < 0 || mark > max) return { kind: 'refused', error: 'markOutOfRange' };
  return { kind: 'marked', mark };
}

/** The maximum mark of a new exam: a number above 0, at most MARK_MAX, one decimal at most. */
export function readMaxMark(typed: string): number | null {
  const n = readNumber(typed);
  return n !== null && n > 0 && n <= MARK_MAX ? n : null;
}

/** How a mark is written on every page: 17, 17.5. */
export function markText(mark: number): string {
  return Number.isInteger(mark) ? String(mark) : mark.toFixed(1);
}

// ------------------------------------------------------------------ exams ----
export interface ExamRow {
  id: string;
  subject_id: string;
  subject_title: string;
  title: string;
  exam_date: string;
  max_mark: number;
}

/** The exams of a subject this publisher is responsible for, newest date first. */
export function examsOfSubject(db: Db, spaceId: string, publisherId: string, subjectId: string): Promise<ExamRow[]> {
  return db.all<ExamRow>(
    `SELECT e.id, e.subject_id, s.title AS subject_title, e.title, e.exam_date, e.max_mark
       FROM exam e JOIN subject s ON s.id = e.subject_id AND s.space_id = e.space_id
      WHERE e.space_id = ? AND e.subject_id = ? AND s.publisher_user_id = ?
      ORDER BY e.exam_date DESC, e.created_at DESC, e.id`,
    spaceId, subjectId, publisherId,
  );
}

/** One exam, when it belongs to a subject this publisher is responsible for; otherwise null. */
export function editableExam(db: Db, spaceId: string, publisherId: string, examId: string): Promise<ExamRow | null> {
  return db.first<ExamRow>(
    `SELECT e.id, e.subject_id, s.title AS subject_title, e.title, e.exam_date, e.max_mark
       FROM exam e JOIN subject s ON s.id = e.subject_id AND s.space_id = e.space_id
      WHERE e.id = ? AND e.space_id = ? AND s.publisher_user_id = ?`,
    examId, spaceId, publisherId,
  );
}

/** Makes an exam in a subject this publisher is responsible for (checked in
 * the same statement); returns its id, or null when the subject is not theirs. */
export async function createExam(
  db: Db,
  v: { spaceId: string; publisherId: string; subjectId: string; title: string; date: string; max: number; now: number },
): Promise<string | null> {
  const id = crypto.randomUUID();
  const changed = await db.run(
    `INSERT INTO exam (id, space_id, subject_id, title, exam_date, max_mark, created_by, created_at)
     SELECT ?, s.space_id, s.id, ?, ?, ?, ?, ? FROM subject s WHERE s.id = ? AND s.space_id = ? AND s.publisher_user_id = ?`,
    id, v.title, v.date, v.max, v.publisherId, v.now, v.subjectId, v.spaceId, v.publisherId,
  );
  return changed === 1 ? id : null;
}

// ------------------------------------------------------------- the list ----
export interface RosterRow {
  id: string;
  display_name: string;
  username: string;
  /** The groups through which the subject is assigned to this learner (none when assigned directly). */
  groups: string[];
}

/** Every learner the subject is assigned to today (by group or directly) whose
 * access is active, sorted by name, then username: the same order on every visit. */
export async function rosterOf(db: Db, spaceId: string, subjectId: string, nowMs: number): Promise<RosterRow[]> {
  const rows = await db.all<{ id: string; display_name: string; username: string; valid_from: string; valid_until: string; ended_on: string | null }>(
    `SELECT u.id, u.display_name, u.username, m.valid_from, m.valid_until, m.ended_on
       FROM membership m JOIN user u ON u.id = m.user_id
      WHERE m.space_id = ? AND m.role = 'learner'
        AND EXISTS (
          SELECT 1 FROM subject_access a
           WHERE a.space_id = m.space_id AND a.subject_id = ?
             AND (a.user_id = m.user_id OR a.group_id IN (
               SELECT gm.group_id FROM group_member gm WHERE gm.space_id = m.space_id AND gm.user_id = m.user_id)))
      ORDER BY u.display_name, u.username`,
    spaceId, subjectId,
  );
  const groups = await db.all<{ user_id: string; name: string }>(
    `SELECT gm.user_id, g.name FROM subject_access a
       JOIN "group" g ON g.id = a.group_id AND g.space_id = a.space_id
       JOIN group_member gm ON gm.group_id = g.id AND gm.space_id = g.space_id
      WHERE a.space_id = ? AND a.subject_id = ?
      ORDER BY g.name, g.id`,
    spaceId, subjectId,
  );
  return rows
    .filter((r) => membershipStatus(r.valid_from, r.valid_until, nowMs, r.ended_on) === 'active')
    .map((r) => ({ id: r.id, display_name: r.display_name, username: r.username, groups: groups.filter((g) => g.user_id === r.id).map((g) => g.name) }));
}

/** The second identifier beside each name: the end of the username, long
 * enough (three characters at least) to tell apart people of the same name on
 * this list. */
export function secondIds(rows: readonly { id: string; display_name: string; username: string }[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const r of rows) {
    const twins = rows.filter((o) => o.display_name === r.display_name && o.id !== r.id);
    let n = Math.min(3, r.username.length);
    while (n < r.username.length && twins.some((o) => o.username.slice(-n) === r.username.slice(-n))) n++;
    out.set(r.id, r.username.slice(-n));
  }
  return out;
}

export interface ResultRow {
  id: string;
  learner_user_id: string;
  status: 'marked' | 'absent';
  mark: number | null;
  published_at: number | null;
}

/** Every stored row of an exam (drafts and published), for its publisher. */
export function resultsOfExam(db: Db, spaceId: string, publisherId: string, examId: string): Promise<ResultRow[]> {
  return read(db.all<ResultRow>(
    `SELECT r.id, r.learner_user_id, r.status, r.mark, r.published_at
       FROM exam_result r JOIN exam e ON e.id = r.exam_id AND e.space_id = r.space_id
       JOIN subject s ON s.id = e.subject_id AND s.space_id = e.space_id
      WHERE r.space_id = ? AND r.exam_id = ? AND s.publisher_user_id = ?`,
    spaceId, examId, publisherId,
  ));
}

/** A read or write of results that failed: reported with a fixed message only,
 * never with the marks or names it carried (section 6, rule 7). */
export class ResultsFailed extends Error {
  constructor(what: 'read' | 'write') {
    super(`results ${what} failed`);
    this.name = 'ResultsFailed';
  }
}

async function batch(db: Db, statements: [string, ...Param[]][]): Promise<void> {
  if (!statements.length) return;
  try {
    await db.batch(statements);
  } catch {
    throw new ResultsFailed('write');
  }
}

async function read<T>(rows: Promise<T>): Promise<T> {
  try {
    return await rows;
  } catch {
    throw new ResultsFailed('read');
  }
}

export type DraftValue = { kind: 'marked'; mark: number } | { kind: 'absent' } | { kind: 'empty' };

/** Saves the draft of the given learners in one batch. A row that is already
 * published is never touched (corrections are a separate step, R2-c); an
 * empty row removes that learner's draft row. Each statement repeats that the
 * exam is this publisher's and the person a learner of this space. */
export async function saveDraft(
  db: Db,
  v: { spaceId: string; publisherId: string; examId: string; rows: { learnerId: string; value: DraftValue }[]; now: number },
): Promise<void> {
  const statements: [string, ...Param[]][] = v.rows.map(({ learnerId, value }) => value.kind === 'empty'
    ? [
      `DELETE FROM exam_result
        WHERE space_id = ? AND exam_id = ? AND learner_user_id = ? AND published_at IS NULL
          AND EXISTS (SELECT 1 FROM exam e JOIN subject s ON s.id = e.subject_id AND s.space_id = e.space_id
                       WHERE e.id = exam_result.exam_id AND e.space_id = exam_result.space_id AND s.publisher_user_id = ?)`,
      v.spaceId, v.examId, learnerId, v.publisherId,
    ]
    : [
      `INSERT INTO exam_result (id, space_id, exam_id, learner_user_id, status, mark, published_at, changed_by, changed_at)
       SELECT ?, e.space_id, e.id, m.user_id, ?, ?, NULL, ?, ?
         FROM exam e JOIN subject s ON s.id = e.subject_id AND s.space_id = e.space_id
         JOIN membership m ON m.space_id = e.space_id AND m.user_id = ? AND m.role = 'learner'
        WHERE e.id = ? AND e.space_id = ? AND s.publisher_user_id = ?
       ON CONFLICT (exam_id, learner_user_id) DO UPDATE SET
         status = excluded.status, mark = excluded.mark, changed_by = excluded.changed_by, changed_at = excluded.changed_at
        WHERE exam_result.published_at IS NULL`,
      crypto.randomUUID(), value.kind, value.kind === 'marked' ? value.mark : null, v.publisherId, v.now,
      learnerId, v.examId, v.spaceId, v.publisherId,
    ]);
  await batch(db, statements);
}

/** Publishes the given draft rows in one batch (one transaction), each with
 * its history row (previous = none, the new value, the publisher, the time).
 * Every row is checked in its own statement: still a draft, with exactly the
 * value the publisher confirmed, in an exam of theirs. The history row reads
 * its value back from the result this batch has just published, and only when
 * that result has no history yet; otherwise its value is missing, the
 * database refuses it, and the whole batch changes nothing. */
export async function publishRows(
  db: Db,
  v: { spaceId: string; publisherId: string; examId: string; rows: ResultRow[]; now: number },
): Promise<void> {
  const statements: [string, ...Param[]][] = [];
  for (const r of v.rows) {
    statements.push(
      [
        `UPDATE exam_result SET published_at = ?, changed_by = ?, changed_at = ?
          WHERE id = ? AND space_id = ? AND exam_id = ? AND published_at IS NULL AND status = ? AND mark IS ?
            AND EXISTS (SELECT 1 FROM exam e JOIN subject s ON s.id = e.subject_id AND s.space_id = e.space_id
                         WHERE e.id = exam_result.exam_id AND e.space_id = exam_result.space_id AND s.publisher_user_id = ?)`,
        v.now, v.publisherId, v.now, r.id, v.spaceId, v.examId, r.status, r.mark, v.publisherId,
      ],
      [
        `INSERT INTO exam_result_history (id, result_id, previous_status, previous_mark, new_status, new_mark, reason, changed_by, changed_at)
         VALUES (?, ?, NULL, NULL, (
           SELECT p.status FROM exam_result p
            WHERE p.id = ? AND p.space_id = ? AND p.published_at = ? AND p.changed_by = ?
              AND NOT EXISTS (SELECT 1 FROM exam_result_history h WHERE h.result_id = p.id)
         ), ?, NULL, ?, ?)`,
        crypto.randomUUID(), r.id, r.id, v.spaceId, v.now, v.publisherId, r.mark, v.publisherId, v.now,
      ],
    );
  }
  await batch(db, statements);
}

// ----------------------------------------------------------- the learner ----
export interface OwnResult {
  id: string;
  exam_title: string;
  subject_title: string;
  exam_date: string;
  max_mark: number;
  status: 'marked' | 'absent';
  mark: number | null;
}

/** My results: this learner's own published results in this space, newest
 * exam first. Published rows only: a draft is never read here. Kept after the
 * learner leaves the subject or the group: they are the learner's own record. */
export function ownResults(db: Db, spaceId: string, learnerId: string): Promise<OwnResult[]> {
  return read(db.all<OwnResult>(
    `SELECT r.id, e.title AS exam_title, s.title AS subject_title, e.exam_date, e.max_mark, r.status, r.mark
       FROM exam_result r JOIN exam e ON e.id = r.exam_id AND e.space_id = r.space_id
       JOIN subject s ON s.id = e.subject_id AND s.space_id = e.space_id
      WHERE r.space_id = ? AND r.learner_user_id = ? AND r.published_at IS NOT NULL
      ORDER BY e.exam_date DESC, e.title, r.id`,
    spaceId, learnerId,
  ));
}

/** One of this learner's own published results; null for anything else
 * (another person's, a draft, another space's, or no such row), alike. */
export function ownResult(db: Db, spaceId: string, learnerId: string, resultId: string): Promise<OwnResult | null> {
  return read(db.first<OwnResult>(
    `SELECT r.id, e.title AS exam_title, s.title AS subject_title, e.exam_date, e.max_mark, r.status, r.mark
       FROM exam_result r JOIN exam e ON e.id = r.exam_id AND e.space_id = r.space_id
       JOIN subject s ON s.id = e.subject_id AND s.space_id = e.space_id
      WHERE r.id = ? AND r.space_id = ? AND r.learner_user_id = ? AND r.published_at IS NOT NULL`,
    resultId, spaceId, learnerId,
  ));
}
