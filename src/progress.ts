// Done marks (LMS wave 2, task W2-1; product-contract v2 on PIL-225, sections
// 4 to 7). A learner presses "Mark as done" at the end of a lesson they read as
// a learner; that press, and only that press, stores one row in done_mark
// (migrations/0011_done_marks.sql). "Mark as not done" deletes it.
//
// Rules kept by every function here (test/wave2, AT-2.5 guard):
// - This is the only module under src/ that names the table. Every statement
//   on it names space_id and learner_user_id, and both are bound from a
//   Learner, which only signedInLearner makes: the space from the address
//   (already checked by the space middleware) and the person from the session.
//   No learner id is ever taken from a request.
// - Nothing is recorded implicitly: only markDone writes a row and only
//   markNotDone deletes one; the router calls them only for a POST to the mark
//   address, after the reading-as-a-learner gate.
// - marked_at is never returned: the reads here give lesson ids only, so the
//   time of a press can never reach a page, a header or a log line (AT-2.7).
import type { Context } from 'hono';
import type { AppEnv, CurrentSpace } from './app-env.ts';
import type { Db } from './db.ts';
import { readableSubject, type SubjectRow } from './learning.ts';

/** Whether this person reads a subject readableSubject gave them as a learner
 * (section 4): an active learner here, and the subject published and assigned
 * to them (directly or by group), whatever other roles they hold. An admin or
 * a publisher reading a subject not assigned to them as a learner does not;
 * nor does anyone in a preview. Done marks are shown and written only when
 * this holds. The learner's own rule is readableSubject's, asked with the
 * learner role alone, so no access rule is written twice. */
export async function readsAsLearner(db: Db, space: CurrentSpace, userId: string, subject: SubjectRow): Promise<boolean> {
  if (!space.roles.includes('learner') || subject.is_published !== 1) return false;
  // readableSubject admitted a person with no wider reach only as a learner, so the assignment is already checked.
  const wider = space.roles.includes('admin') || (space.roles.includes('publisher') && subject.publisher_user_id === userId);
  if (!wider) return true;
  return (await readableSubject(db, { ...space, roles: ['learner'] }, userId, subject.id)) !== null;
}

declare const learnerBrand: unique symbol;

/** The signed-in person in the current space, as the learner whose marks are read or written. */
export interface Learner {
  readonly spaceId: string;
  readonly userId: string;
  readonly [learnerBrand]: true;
}

/** The learner of this request: the current space and the signed-in person, never anything from the request itself. */
export function signedInLearner(c: Context<AppEnv>): Learner {
  return { spaceId: c.get('space').id, userId: c.get('user')!.id } as Learner;
}

// The time a mark is stored (milliseconds since 1970, UTC). Production uses
// the real time; tests fix it (src/test-hooks.ts, /__test/mark-clock) to show
// that a second press keeps the first press's time (AT-1.2).
let fixedAt: number | null = null;

export function setMarkClock(at: number | null): void {
  fixedAt = at;
}

const markTime = (): number => fixedAt ?? Date.now();

/** "Mark as done": the row exists afterwards. A second press changes nothing and keeps the first time (a set, not a switch). */
export async function markDone(db: Db, who: Learner, lessonId: string): Promise<void> {
  await db.run(
    `INSERT INTO done_mark (space_id, learner_user_id, lesson_id, marked_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (space_id, learner_user_id, lesson_id) DO NOTHING`,
    who.spaceId, who.userId, lessonId, markTime(),
  );
}

/** "Mark as not done": the row does not exist afterwards. Pressed again, it changes nothing. */
export async function markNotDone(db: Db, who: Learner, lessonId: string): Promise<void> {
  await db.run(
    'DELETE FROM done_mark WHERE space_id = ? AND learner_user_id = ? AND lesson_id = ?',
    who.spaceId, who.userId, lessonId,
  );
}

/** Whether this learner marked this lesson as done. */
export async function isDone(db: Db, who: Learner, lessonId: string): Promise<boolean> {
  const row = await db.first(
    'SELECT 1 AS one FROM done_mark d WHERE d.space_id = ? AND d.learner_user_id = ? AND d.lesson_id = ?',
    who.spaceId, who.userId, lessonId,
  );
  return row !== null;
}

/** The ids of every lesson this learner marked as done in this space (never the time). The caller keeps only the countable ones (section 6.3, AT-3.6). */
export async function doneLessonIds(db: Db, who: Learner): Promise<Set<string>> {
  const rows = await db.all<{ lesson_id: string }>(
    'SELECT d.lesson_id FROM done_mark d WHERE d.space_id = ? AND d.learner_user_id = ?',
    who.spaceId, who.userId,
  );
  return new Set(rows.map((r) => r.lesson_id));
}

/** The ids of every lesson this learner marked as done in this space, newest
 * press first, lessons pressed at the same time in one group (LMS wave 2, W2-2,
 * section 8.2): the order "Continue where you stopped" needs, for the learner's
 * own home only. The time orders the rows inside the statement and never
 * leaves it: only lesson ids and their rank come back (A4, AT-5.5). The caller
 * keeps only the countable ones (section 6.3). */
export async function markOrder(db: Db, who: Learner): Promise<string[][]> {
  const rows = await db.all<{ lesson_id: string; recency: number }>(
    `SELECT d.lesson_id, DENSE_RANK() OVER (ORDER BY d.marked_at DESC) AS recency
       FROM done_mark d WHERE d.space_id = ? AND d.learner_user_id = ?
      ORDER BY recency, d.lesson_id`,
    who.spaceId, who.userId,
  );
  const groups: string[][] = [];
  for (const r of rows) (groups[Number(r.recency) - 1] ??= []).push(r.lesson_id);
  return groups.filter(Boolean);
}
