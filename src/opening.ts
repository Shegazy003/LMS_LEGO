// LMS wave 8, W8-1a (product-contract v2 on PIL-299, sections 3.1, 3.2 and 5):
// chapter opening dates, the teachers side. An opening date is a date only
// (`YYYY-MM-DD`, a UTC day, D1): the chapter opens at 00:00 UTC on that day.
// It is stored on the chapter row itself with the before-opening choice
// (migrations/0017_chapter_opening.sql): shown locked (0) or hidden (1). It
// names no person, and nothing about a lock is stored.
// The server is the authority on the rules (S2, S3), mirroring wave 6's
// src/due.ts: Save needs a date; a new date is a real date from today up to
// OPEN_MAX_DAYS after today; the stored date re-sent unchanged is accepted even
// when it has passed (only the choice may change); Clear removes the date and
// resets the choice. Every write is one statement scoped to the space, the
// subject and a chapter that is not removed; the publishers repeats the
// publisher check. In W8-1a no learner, guardian or preview read uses the dates.
import { addDays, isIsoDate, utcDate } from './access.ts';
import type { Db } from './db.ts';
import type { DueWriter } from './due.ts';

/** The latest allowed opening date, in days after today (S2b, as wave 6's due dates). */
export const OPEN_MAX_DAYS = 730;
/** The row's anchor and status parameter (#chapter-id and the chapter query value), built from the concept key, never page text. */
const ROW = 'chapter';
export const ROW_PARAM = ROW;
export const rowAnchor = (id: string) => `${ROW}-${id}`;

/** The before-opening choice (D2): its form value and its stored flag. */
export const OPEN_BEFORE = ['locked', 'hidden'] as const;
export type OpenBefore = (typeof OPEN_BEFORE)[number];
export const isOpenBefore = (v: string): v is OpenBefore => (OPEN_BEFORE as readonly string[]).includes(v);

/** A chapter's stored opening (R1). */
export interface Opening { opens_on: string | null; opens_hidden: number }

/** The fields bounds from the requests one `now()` (D1, S2b): min = today, max = today + OPEN_MAX_DAYS. */
export function openBounds(nowMs: number): { min: string; max: string } {
  const today = utcDate(nowMs);
  return { min: today, max: addDays(today, OPEN_MAX_DAYS) };
}

/** Whether a chapter is open on the request's day (D1, D3): no date, or today is on or after it. */
export function isOpenNow(opensOn: string | null, nowMs: number): boolean {
  return opensOn === null || opensOn <= utcDate(nowMs);
}

/** What a press means against the stored row (S2, S3). */
export type OpenChoice =
  | { kind: 'clear' }
  /** Clear on a row without a date: nothing is stored, the same message shows (S3). */
  | { kind: 'cleared-already' }
  /** Save with an empty date (S2a): 400 openNeedsDate. */
  | { kind: 'needs-date' }
  /** A malformed or out-of-range date, or an unknown choice (S2b): 400 openInvalid; `kept` is the value the field shows again. */
  | { kind: 'invalid'; kept: string }
  /** The stored date re-sent with the stored choice (S2c): nothing is stored. */
  | { kind: 'same' }
  /** The stored date re-sent with the other choice (S2c): the choice only is stored. */
  | { kind: 'choice'; hidden: boolean }
  | { kind: 'set'; date: string; hidden: boolean };

export function openChoice(
  posted: { action: string; opens_on: string; before: string },
  stored: Opening,
  nowMs: number,
): OpenChoice {
  if (posted.action === 'clear') return stored.opens_on === null ? { kind: 'cleared-already' } : { kind: 'clear' };
  const value = posted.opens_on.trim();
  if (value === '') return { kind: 'needs-date' };
  // The field shows the posted value again only when it is a well-formed YYYY-MM-DD (UX-87, as wave 6 UX-61).
  const kept = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
  if (!isIsoDate(value) || !isOpenBefore(posted.before)) return { kind: 'invalid', kept };
  const hidden = posted.before === 'hidden';
  if (stored.opens_on !== null && value === stored.opens_on) {
    return hidden === (stored.opens_hidden === 1) ? { kind: 'same' } : { kind: 'choice', hidden };
  }
  const { min, max } = openBounds(nowMs);
  if (value < min || value > max) return { kind: 'invalid', kept };
  return { kind: 'set', date: value, hidden };
}

/** One row of the Opening dates page (T2): a chapter not removed, in outline order, with what its lines need. */
export interface OpenRow {
  id: string;
  title: string;
  opens_on: string | null;
  opens_hidden: number;
  /** Shown lessons (not removed): an empty chapter locks nothing by order (D5, C3). */
  lessons: number;
  /** The earliest due date inside the chapter (its own or a lesson's), for openDueWarn (T2). */
  first_due: string | null;
}

/** The subjects chapters with their opening dates and due dates (B2: the page's second and last statement). */
export async function openOutline(db: Db, spaceId: string, subjectId: string): Promise<OpenRow[]> {
  const rows = await db.all<{ id: string; title: string; opens_on: string | null; opens_hidden: number; due_on: string | null; lessons: number; lesson_due: string | null }>(
    `SELECT c.id, c.title, c.opens_on, c.opens_hidden, c.due_on, COUNT(l.id) AS lessons, MIN(l.due_on) AS lesson_due
       FROM chapter c LEFT JOIN lesson l ON l.chapter_id = c.id AND l.space_id = c.space_id AND l.removed_at IS NULL
      WHERE c.space_id = ? AND c.subject_id = ? AND c.removed_at IS NULL
      GROUP BY c.id
      ORDER BY c.position, c.title, c.id`,
    spaceId, subjectId,
  );
  return rows.map((r) => {
    const dues = [r.due_on, r.lesson_due].filter((d): d is string => d !== null).sort();
    return { id: r.id, title: r.title, opens_on: r.opens_on, opens_hidden: Number(r.opens_hidden), lessons: Number(r.lessons), first_due: dues[0] ?? null };
  });
}

/** The lines a row shows between its state line and its date field (S5, T2, C3), from the row's own state only. */
export function openLines(row: OpenRow, inOrder: boolean, nowMs: number): { started: boolean; dueWarn: boolean; cascade: boolean } {
  const open = isOpenNow(row.opens_on, nowMs);
  return {
    started: open,
    dueWarn: !open && row.first_due !== null && row.first_due < row.opens_on!,
    cascade: inOrder && !open && row.opens_hidden === 0 && row.lessons > 0,
  };
}

/** The chapter an address names (one read): only of this space and subject and not removed; otherwise null (404). */
export function openItem(db: Db, spaceId: string, subjectId: string, id: string): Promise<({ id: string } & Opening) | null> {
  return db.first(
    'SELECT c.id, c.opens_on, c.opens_hidden FROM chapter c WHERE c.id = ? AND c.space_id = ? AND c.subject_id = ? AND c.removed_at IS NULL',
    id, spaceId, subjectId,
  );
}

/** Sets or clears one chapter's opening in one statement (S3); false when nothing matched (the gate no longer holds). */
export async function writeOpening(db: Db, spaceId: string, subjectId: string, id: string, opensOn: string | null, hidden: boolean, writer: DueWriter): Promise<boolean> {
  // The publisher check, as writeDue: a write by the publisher needs the subject to be still theirs; an admin passes NULL.
  const owner = writer.role === 'publisher' ? writer.userId : null;
  const changed = await db.run(
    `UPDATE chapter SET opens_on = ?, opens_hidden = ? WHERE id = ? AND space_id = ? AND subject_id = ? AND removed_at IS NULL
        AND EXISTS (SELECT 1 FROM subject s WHERE s.id = chapter.subject_id AND s.space_id = chapter.space_id AND (? IS NULL OR s.publisher_user_id = ?))`,
    opensOn, hidden ? 1 : 0, id, spaceId, subjectId, owner, owner,
  );
  return changed === 1;
}
