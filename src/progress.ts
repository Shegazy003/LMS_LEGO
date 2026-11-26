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
//   No learner id is ever taken from a request. From W6-1c a second maker,
//   linkedAsLearner, gives the learner a guardian is linked to, as the
//   session's link check found them, for that learner's to-do list only.
// - Nothing is recorded implicitly: only markDone writes a row and only
//   markNotDone deletes one; the router calls them only for a POST to the mark
//   address, after the reading-as-a-learner gate.
// - marked_at is never returned: the reads here give lesson ids only, so the
//   time of a press can never reach a page, a header or a log line (AT-2.7).
import type { Context } from 'hono';
import type { AppEnv, CurrentSpace } from './app-env.ts';
import type { Db } from './db.ts';
import type { LinkedLearner } from './guardians.ts';
import { readableSubject, type SubjectRow, type TodoRow } from './learning.ts';

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

/** LMS wave 6, W6-1c (product-contract v3 addendum on PIL-265, G4.3): the
 * learner a guardian may see now, as guardians.ts linkedLearner found them for
 * the session's person (an active link, the learner's access active today);
 * the space is the current one. Only the router makes it, right after that
 * check, and only to read that learner's to-do list (learnerTodo): never a
 * write, never a time, never an id taken from the address alone. */
export function linkedAsLearner(c: Context<AppEnv>, linked: LinkedLearner): Learner {
  return { spaceId: c.get('space').id, userId: linked.id } as Learner;
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

/** LMS wave 6 (product-contract v2 on PIL-257, sections 5.1 to 5.3, 6.1): the
 * to-do list of a learner in one statement with five bound parameters, numbered
 * so that each is bound once (?1 the space and ?2 the learner, both from the
 * Learner, as every statement here; ?3 today, ?4 the last day, ?5 the cap; no
 * list of subject ids). Items: each lesson and each chapter not
 * removed with a due date up to `last`, of a subject on the cards of this learner
 * (the readable-subject rule of learnerCards, written out whole, word for word: the
 * space guard reads every statement as written), that this learner can act on
 * now: a lesson without their done mark, a chapter with a shown lesson
 * without one; in a subject with chapters in order, only while the chapter
 * of the item is open, which is the rule of chapterLocks (no earlier shown chapter has a
 * shown lesson without their mark; outline order is position, title, id).
 * Groups by the one `today`: before it, equal, after; within a group due date,
 * subject title, then outline order; at most `cap` rows per group, each with
 * the full count of its group. test/wave6/at2.test.ts compares every decision with
 * chapterLocks itself. Rows read (AT-3.4b, at most 5,000 in the largest test
 * world): chapters and subjects are looked up by their primary key (`+x.space_id`
 * keeps the space check as a filter, not an index choice); a lock reads only the
 * chapters up to the position of the item; the lesson and done counts of a chapter come
 * from one pass, packed into one number (lessons × 1000000 + done; a chapter
 * holds far fewer than a million lessons); the rank and the group count share one window.
 * LMS wave 8 (product-contract v2 on PIL-299, sections 3.3 and 3.6, D7): an item is listed only once its
 * chapter is open by date (no date, or ?3 is on or after it), and a hidden chapter not open yet is outside
 * the order test, as chapterLocks with dates; the statement keeps its five numbered parameters. */
export function learnerTodo(db: Db, who: Learner, today: string, last: string, cap: number): Promise<TodoRow[]> {
  return db.all<TodoRow>(
    `WITH todo_chapter AS MATERIALIZED (
       SELECT c.id, c.title, c.due_on, c.position, s.id AS subject_id, s.title AS subject_title,
              (SELECT COUNT(*) * 1000000 + COUNT(dd.lesson_id) FROM lesson tl
                 LEFT JOIN done_mark dd ON dd.space_id = tl.space_id AND dd.lesson_id = tl.id AND dd.learner_user_id = ?2
                WHERE tl.space_id = c.space_id AND tl.chapter_id = c.id AND tl.removed_at IS NULL) AS counts
         FROM chapter c
         JOIN subject s ON s.id = c.subject_id AND +s.space_id = c.space_id
        WHERE c.space_id = ?1 AND c.removed_at IS NULL AND c.due_on IS NOT NULL AND c.due_on <= ?4
          AND (c.opens_on IS NULL OR c.opens_on <= ?3)
          AND s.is_published = 1
        AND EXISTS (
          SELECT 1 FROM subject_access a
           WHERE a.space_id = s.space_id AND a.subject_id = s.id
             AND (a.user_id = ?2 OR a.group_id IN (
               SELECT gm.group_id FROM group_member gm WHERE gm.space_id = s.space_id AND gm.user_id = ?2)))
          AND (s.chapters_in_order <> 1 OR NOT EXISTS (
            SELECT 1 FROM chapter pc
             WHERE pc.space_id = c.space_id AND pc.subject_id = c.subject_id AND pc.removed_at IS NULL AND (pc.opens_on IS NULL OR pc.opens_hidden = 0 OR pc.opens_on <= ?3)
               AND pc.position <= c.position AND (pc.position < c.position OR (pc.position = c.position AND (pc.title < c.title OR (pc.title = c.title AND pc.id < c.id))))
               AND EXISTS (SELECT 1 FROM lesson pl WHERE pl.space_id = pc.space_id AND pl.chapter_id = pc.id AND pl.removed_at IS NULL
                     AND NOT EXISTS (SELECT 1 FROM done_mark pd WHERE pd.space_id = pl.space_id AND pd.lesson_id = pl.id AND pd.learner_user_id = ?2))))
     ),
     item AS (
       SELECT 'lesson' AS kind, l.id AS id, l.title AS title, l.due_on AS due_on, s.id AS subject_id, s.title AS subject_title,
              c.id AS chapter_id, c.position AS c_pos, c.title AS c_title, 1 AS k, l.position AS l_pos, l.title AS l_title, 0 AS total, 0 AS done
         FROM lesson l
         JOIN chapter c ON c.id = l.chapter_id AND +c.space_id = l.space_id AND c.removed_at IS NULL
         JOIN subject s ON s.id = c.subject_id AND +s.space_id = c.space_id
        WHERE l.space_id = ?1 AND l.removed_at IS NULL AND l.due_on IS NOT NULL AND l.due_on <= ?4
          AND (c.opens_on IS NULL OR c.opens_on <= ?3)
          AND s.is_published = 1
        AND EXISTS (
          SELECT 1 FROM subject_access a
           WHERE a.space_id = s.space_id AND a.subject_id = s.id
             AND (a.user_id = ?2 OR a.group_id IN (
               SELECT gm.group_id FROM group_member gm WHERE gm.space_id = s.space_id AND gm.user_id = ?2)))
          AND NOT EXISTS (SELECT 1 FROM done_mark d WHERE d.space_id = l.space_id AND d.lesson_id = l.id AND d.learner_user_id = ?2)
          AND (s.chapters_in_order <> 1 OR NOT EXISTS (
            SELECT 1 FROM chapter pc
             WHERE pc.space_id = c.space_id AND pc.subject_id = c.subject_id AND pc.removed_at IS NULL AND (pc.opens_on IS NULL OR pc.opens_hidden = 0 OR pc.opens_on <= ?3)
               AND pc.position <= c.position AND (pc.position < c.position OR (pc.position = c.position AND (pc.title < c.title OR (pc.title = c.title AND pc.id < c.id))))
               AND EXISTS (SELECT 1 FROM lesson pl WHERE pl.space_id = pc.space_id AND pl.chapter_id = pc.id AND pl.removed_at IS NULL
                     AND NOT EXISTS (SELECT 1 FROM done_mark pd WHERE pd.space_id = pl.space_id AND pd.lesson_id = pl.id AND pd.learner_user_id = ?2))))
       UNION ALL
       SELECT 'chapter', x.id, x.title, x.due_on, x.subject_id, x.subject_title, x.id, x.position, x.title, 0, NULL, NULL, x.counts / 1000000, x.counts % 1000000
         FROM todo_chapter x
        WHERE x.counts % 1000000 < x.counts / 1000000
     ),
     grouped AS (SELECT item.*, CASE WHEN item.due_on < ?3 THEN 0 WHEN item.due_on = ?3 THEN 1 ELSE 2 END AS grp FROM item),
     ranked AS (
       SELECT grouped.*, ROW_NUMBER() OVER w AS rn,
              COUNT(*) OVER (w ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) AS n
         FROM grouped
         WINDOW w AS (PARTITION BY grp ORDER BY due_on, subject_title, subject_id, c_pos, c_title, chapter_id, k, l_pos, l_title, id)
     )
     SELECT kind, id, title, due_on, subject_id, subject_title, chapter_id, total, done, grp, n FROM ranked WHERE rn <= ?5 ORDER BY grp, rn`,
    who.spaceId, who.userId, today, last, cap,
  );
}
