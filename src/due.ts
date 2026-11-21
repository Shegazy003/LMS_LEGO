// LMS wave 6 (product-contract v2 on PIL-257, sections 4 and 6): due dates on
// lessons and chapters, the teachers side (W6-1a). A due date is a date only
// (`YYYY-MM-DD`, a UTC day: "by the end of that day"), stored on the lesson or
// chapter row itself (migrations/0015_due_dates.sql); it names no person.
// The server is the authority on the date rules (section 4.3): a newly typed
// date is a real date from today up to DUE_MAX_DAYS after today; re-saving the
// stored date unchanged is accepted (nothing stored), and an empty value
// clears. Every write is one statement scoped to the space, the subject and an
// item that is not removed; the publishers repeats the publisher check.
import { addDays, isIsoDate, utcDate } from './access.ts';
import type { Db } from './db.ts';

/** The latest allowed due date, in days after today (section 4.3, rule 2). */
export const DUE_MAX_DAYS = 730;
/** How many days ahead a learners to-do list looks (section 5.3); the Arabic «أيام» needs 3 to 10. */
export const TODO_AHEAD_DAYS = 7;
/** At most this many items are drawn per to-do group (section 5.3). */
export const TODO_MAX_PER_GROUP = 10;

/** The two kinds of item that carry a due date; the address names one of them. */
export const DUE_KINDS = ['lesson', 'chapter'] as const;
export type DueKind = (typeof DUE_KINDS)[number];
export const isDueKind = (v: string): v is DueKind => (DUE_KINDS as readonly string[]).includes(v);

/** The fields bounds (section 4.3, rule 4), from the requests one `now()`: min = the earlier of today and the stored date, max = today + DUE_MAX_DAYS. */
export function dueBounds(nowMs: number, stored: string | null): { min: string; max: string } {
  const today = utcDate(nowMs);
  return { min: stored !== null && stored < today ? stored : today, max: addDays(today, DUE_MAX_DAYS) };
}

/** What a posted value means against the stored date (section 4.3). */
export type DueChoice =
  | { kind: 'clear' }
  | { kind: 'same' }
  | { kind: 'set'; date: string }
  | { kind: 'invalid'; kept: string };

export function dueChoice(posted: string, stored: string | null, nowMs: number): DueChoice {
  const value = posted.trim();
  if (value === '') return { kind: 'clear' };
  // The field shows the posted value again only when it is a well-formed YYYY-MM-DD (UX-61).
  const kept = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
  if (!isIsoDate(value)) return { kind: 'invalid', kept };
  if (stored !== null && value === stored) return { kind: 'same' };
  const today = utcDate(nowMs);
  if (value < today || value > addDays(today, DUE_MAX_DAYS)) return { kind: 'invalid', kept };
  return { kind: 'set', date: value };
}

/** One row of the due-dates page: a chapter followed by its lessons, in outline order. */
export interface DueLesson { id: string; title: string; due_on: string | null }
export interface DueChapter { id: string; title: string; due_on: string | null; lessons: DueLesson[] }

/** The subjects outline with its due dates (section 4.2), in one read; removed items are not listed. */
export async function dueOutline(db: Db, spaceId: string, subjectId: string): Promise<DueChapter[]> {
  const rows = await db.all<{ chapter_id: string; chapter_title: string; chapter_due: string | null; lesson_id: string | null; lesson_title: string | null; lesson_due: string | null }>(
    `SELECT c.id AS chapter_id, c.title AS chapter_title, c.due_on AS chapter_due, l.id AS lesson_id, l.title AS lesson_title, l.due_on AS lesson_due
       FROM chapter c LEFT JOIN lesson l ON l.chapter_id = c.id AND l.space_id = c.space_id AND l.removed_at IS NULL
      WHERE c.space_id = ? AND c.subject_id = ? AND c.removed_at IS NULL
      ORDER BY c.position, c.title, c.id, l.position, l.title, l.id`,
    spaceId, subjectId,
  );
  const chapters: DueChapter[] = [];
  for (const r of rows) {
    let ch = chapters.at(-1);
    if (!ch || ch.id !== r.chapter_id) chapters.push((ch = { id: r.chapter_id, title: r.chapter_title, due_on: r.chapter_due, lessons: [] }));
    if (r.lesson_id) ch.lessons.push({ id: r.lesson_id, title: r.lesson_title ?? '', due_on: r.lesson_due });
  }
  return chapters;
}

/** The item an address names (one read): only of this space and subject and not removed (a lessons chapter too); otherwise null (404). */
export function dueItem(db: Db, spaceId: string, subjectId: string, kind: DueKind, id: string): Promise<{ id: string; due_on: string | null } | null> {
  return kind === 'chapter'
    ? db.first('SELECT c.id, c.due_on FROM chapter c WHERE c.id = ? AND c.space_id = ? AND c.subject_id = ? AND c.removed_at IS NULL', id, spaceId, subjectId)
    : db.first(
      `SELECT l.id, l.due_on FROM lesson l JOIN chapter c ON c.id = l.chapter_id AND c.space_id = l.space_id
        WHERE l.id = ? AND l.space_id = ? AND l.removed_at IS NULL AND c.subject_id = ? AND c.removed_at IS NULL`,
      id, spaceId, subjectId,
    );
}

/** Who writes: the responsible publisher (the write repeats the check) or an admin (the admin gate has run). */
export type DueWriter = { role: 'publisher'; userId: string } | { role: 'admin' };

/** Sets or clears one items due date in one statement (section 4.3, rule 5); false when nothing matched (the gate no longer holds). */
export async function writeDue(db: Db, spaceId: string, subjectId: string, kind: DueKind, id: string, dueOn: string | null, writer: DueWriter): Promise<boolean> {
  // The publisher check: a write by the publisher needs the subject to be still theirs; a write by an admin passes NULL (any subject of the space).
  const owner = writer.role === 'publisher' ? writer.userId : null;
  const changed = kind === 'chapter'
    ? await db.run(
      `UPDATE chapter SET due_on = ? WHERE id = ? AND space_id = ? AND subject_id = ? AND removed_at IS NULL
          AND EXISTS (SELECT 1 FROM subject s WHERE s.id = chapter.subject_id AND s.space_id = chapter.space_id AND (? IS NULL OR s.publisher_user_id = ?))`,
      dueOn, id, spaceId, subjectId, owner, owner,
    )
    : await db.run(
      `UPDATE lesson SET due_on = ? WHERE id = ? AND space_id = ? AND removed_at IS NULL
          AND EXISTS (SELECT 1 FROM chapter c JOIN subject s ON s.id = c.subject_id AND s.space_id = c.space_id
                       WHERE c.id = lesson.chapter_id AND c.space_id = lesson.space_id AND c.subject_id = ? AND c.removed_at IS NULL AND (? IS NULL OR s.publisher_user_id = ?))`,
      dueOn, id, spaceId, subjectId, owner, owner,
    );
  return changed === 1;
}
