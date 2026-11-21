// LMS wave 5 (product-contract v2 on PIL-246, sections 4 and 6): a subject's
// announcements. A short plain-text note that the subject's responsible
// publisher or the admin of the space posts, edits and removes on the card of
// the subject; its learners read it (section 5). The writer is kept as a role only
// (publisher or admin), never as a person. Each role edits only its own role's
// items; the admin may remove any (moderation). Removing erases the text in
// the same statement. Every write is one statement that repeats the gate.
import type { Db } from './db.ts';

/** The longest announcement, in Unicode code points (section 4.3 rule 5). The one place this number lives. */
export const ANN_MAX = 500;
/** The subject page shows the newest 3 in full, the next 7 folded (section 5.2). */
export const ANN_SHOWN = 3;
export const ANN_FOLDED = 7;
/** The learner home shows the newest 3 of the last 30 days, each cut at 100 code points (section 5.3). */
export const ANN_HOME = 3;
export const ANN_HOME_DAYS = 30;
export const ANN_CUT = 100;
/** A post equal to the newest one of the same role and subject within this time stores nothing (section 4.2, A10). */
export const ANN_DOUBLE_TAP_MS = 10_000;

export type AuthorRole = 'publisher' | 'admin';

export interface AnnouncementRow {
  id: string;
  body: string;
  author_role: AuthorRole;
  created_at: string;
  edited_at: string | null;
  removed_at: string | null;
}

// ------------------------------------------------------------ text rules ----
/** Blank characters (section 4.3 rule 3): Unicode White_Space plus the zero-width and direction marks. */
const BLANK = '\\p{White_Space}\\u200B\\u200C\\u200D\\uFEFF\\u200E\\u200F\\u061C';
const EDGE_BLANKS = new RegExp(`^[${BLANK}]+|[${BLANK}]+$`, 'gu');
/** Control characters other than the line feed, and the bidirectional embedding, override and isolate controls (rule 2). */
const REMOVED = /(?!\n)[\p{Cc}\u202A-\u202E\u2066-\u2069]/gu;

/** The text as stored (section 4.3 rules 1 to 3): line ends unified, tabs as
 * spaces, controls removed, blank characters trimmed at both ends, at most two
 * line breaks in a row. The count script of the card does exactly this. */
export function cleanText(typed: string): string {
  return typed
    .replace(/\r\n|\r|\u2028|\u2029/g, '\n')
    .replace(/\t/g, ' ')
    .replace(REMOVED, '')
    .replace(EDGE_BLANKS, '')
    .replace(/\n{3,}/g, '\n\n');
}

/** The length the rules count: Unicode code points, not UTF-16 units. */
export const codePoints = (text: string): number => [...text].length;

export type CheckedText =
  | { ok: true; text: string }
  | { ok: false; key: 'annEmptyError' }
  | { ok: false; key: 'annTooLong'; n: number };

/** Section 4.3 rules 4 and 5: refused when empty after cleaning or longer than ANN_MAX code points. */
export function checkText(typed: string): CheckedText {
  const text = cleanText(typed);
  if (text === '') return { ok: false, key: 'annEmptyError' };
  const n = codePoints(text);
  if (n > ANN_MAX) return { ok: false, key: 'annTooLong', n };
  return { ok: true, text };
}

const BLANK_JS = BLANK.replace(/\\/g, '\\\\');
/** The same rules in the browser, for the live count (ux-plan UX-53). Kept
 * next to cleanText so the two cannot drift; the unit test runs both. */
export const COUNT_RULES_JS = `function annLen(s){s=s.replace(/\\r\\n|\\r|\\u2028|\\u2029/g,'\\n').replace(/\\t/g,' ').replace(/(?!\\n)[\\p{Cc}\\u202A-\\u202E\\u2066-\\u2069]/gu,'').replace(new RegExp('^[${BLANK_JS}]+|[${BLANK_JS}]+$','gu'),'').replace(/\\n{3,}/g,'\\n\\n');return Array.from(s).length;}`;

// --------------------------------------------------------------- reading ----
/** An announcement as a learner reads it (section 5): never a removed one. */
export type ShownRow = Pick<AnnouncementRow, 'id' | 'body' | 'author_role' | 'created_at' | 'edited_at'>;
/** One item of the learner home (section 5.3): with its subject. */
export type HomeRow = ShownRow & { subject_id: string; subject_title: string };

/** How many a subject page reads: the newest 3 in full and the next 7 folded (section 5.2). */
export const ANN_SUBJECT_ROWS = ANN_SHOWN + ANN_FOLDED;

/** The subject page block (section 5.2): the newest 10 of the subject that are not removed, in one statement. */
export function subjectRows(db: Db, spaceId: string, subjectId: string): Promise<ShownRow[]> {
  return db.all<ShownRow>(
    `SELECT id, body, author_role, created_at, edited_at FROM announcement
      WHERE space_id = ? AND subject_id = ? AND removed_at IS NULL
      ORDER BY created_at DESC, id DESC LIMIT ?`,
    spaceId, subjectId, ANN_SUBJECT_ROWS,
  );
}

/** The earliest posting time the learner home shows (section 5.3): 30 days before now. */
export const homeSince = (nowMs: number): string => new Date(nowMs - ANN_HOME_DAYS * 86_400_000).toISOString();

const BLANK_ONLY = new RegExp(`^[${BLANK}]+$`, 'u');
const segmenter = new Intl.Segmenter('und', { granularity: 'grapheme' });

/** The home's cut (section 5.3): a text over 100 code points is cut at the last
 * blank character at or before code point 100; with none, at code point 100,
 * moved back to the start of the character it would split (a combining mark, a
 * ZWJ sequence or a surrogate pair stay whole). Cut only between whole
 * characters as a reader sees them (grapheme clusters); the "…" is added by the view. */
export function cutText(text: string): { text: string; cut: boolean } {
  if (codePoints(text) <= ANN_CUT) return { text, cut: false };
  let at = 0; // code points before the current character
  let lastBlank = -1; // code points before the last blank character that starts at or before code point 100
  let lastWhole = 0; // code points of the whole characters that fit in 100
  for (const { segment } of segmenter.segment(text)) {
    if (at >= ANN_CUT) break;
    // A blank character starting at code point at + 1 (at most 100).
    if (BLANK_ONLY.test(segment) && at > 0) lastBlank = at;
    const n = codePoints(segment);
    if (at + n <= ANN_CUT) lastWhole = at + n;
    at += n;
  }
  const keep = lastBlank > 0 ? lastBlank : lastWhole;
  return { text: [...text].slice(0, keep).join('').replace(EDGE_BLANKS, ''), cut: true };
}

/** The card's list (section 4.2): every row of the subject, newest first, in
 * one statement. Removed rows (their text already erased) come too, only so
 * the status line can tell a real "removed" from a stale address. */
export function cardRows(db: Db, spaceId: string, subjectId: string): Promise<AnnouncementRow[]> {
  return db.all<AnnouncementRow>(
    `SELECT id, body, author_role, created_at, edited_at, removed_at FROM announcement
      WHERE space_id = ? AND subject_id = ? ORDER BY created_at DESC, id DESC`,
    spaceId, subjectId,
  );
}

/** One announcement of this subject (removed or not), for its edit and remove addresses. */
export function oneRow(db: Db, spaceId: string, subjectId: string, id: string): Promise<AnnouncementRow | null> {
  return db.first<AnnouncementRow>(
    'SELECT id, body, author_role, created_at, edited_at, removed_at FROM announcement WHERE id = ? AND space_id = ? AND subject_id = ?',
    id, spaceId, subjectId,
  );
}

// --------------------------------------------------------------- writing ----
/** Who writes, and the gate each write repeats in its own statement: the
 * publisher must still be the subject's responsible publisher; the admin's gate
 * (an active admin of the space) has run before the handler. */
export type Writer = { role: 'publisher'; userId: string } | { role: 'admin' };

/** The gate of a publisher, repeated in a write: still the responsible publisher of the subject (the last bound parameters). */
const gateParams = (w: Writer, spaceId: string, subjectId: string): string[] => (w.role === 'publisher' ? [subjectId, spaceId, w.userId] : []);

/** Each write as one whole statement per role (the space guard reads every statement as written). */
const WRITES = {
  post: {
    publisher: `INSERT INTO announcement (id, space_id, subject_id, body, author_role, created_at)
     SELECT ?, s.space_id, s.id, ?, 'publisher', ? FROM subject s WHERE s.id = ? AND s.space_id = ? AND s.publisher_user_id = ?`,
    admin: `INSERT INTO announcement (id, space_id, subject_id, body, author_role, created_at)
     SELECT ?, s.space_id, s.id, ?, 'admin', ? FROM subject s WHERE s.id = ? AND s.space_id = ?`,
  },
  save: {
    publisher: `UPDATE announcement SET body = ?, edited_at = ?
      WHERE id = ? AND space_id = ? AND subject_id = ? AND removed_at IS NULL AND author_role = 'publisher'
        AND EXISTS (SELECT 1 FROM subject s WHERE s.id = ? AND s.space_id = ? AND s.publisher_user_id = ?)`,
    admin: `UPDATE announcement SET body = ?, edited_at = ?
      WHERE id = ? AND space_id = ? AND subject_id = ? AND removed_at IS NULL AND author_role = 'admin'`,
  },
  remove: {
    publisher: `UPDATE announcement SET removed_at = ?, body = ''
      WHERE id = ? AND space_id = ? AND subject_id = ? AND removed_at IS NULL AND author_role = 'publisher'
        AND EXISTS (SELECT 1 FROM subject s WHERE s.id = ? AND s.space_id = ? AND s.publisher_user_id = ?)`,
    admin: `UPDATE announcement SET removed_at = ?, body = ''
      WHERE id = ? AND space_id = ? AND subject_id = ? AND removed_at IS NULL`,
  },
} as const;

/** Who may edit an item (section 4.1): its own role only. */
export const mayEdit = (role: AuthorRole, row: AnnouncementRow): boolean => row.author_role === role;
/** Who may remove an item: the publisher its own role's items, the admin any. */
export const mayRemove = (role: AuthorRole, row: AnnouncementRow): boolean => role === 'admin' || row.author_role === role;

export type PostResult = 'posted' | 'repeat' | 'refused';

/** Posts an announcement (section 4.2). A double tap (the same text as the
 * newest of this role and subject, under 10 seconds old) stores nothing: one
 * read of that newest row, then at most one write. */
export async function postAnnouncement(db: Db, spaceId: string, subjectId: string, w: Writer, text: string, nowMs: number): Promise<PostResult> {
  const newest = await db.first<{ body: string; created_at: string }>(
    `SELECT body, created_at FROM announcement
      WHERE space_id = ? AND subject_id = ? AND author_role = ? AND removed_at IS NULL
      ORDER BY created_at DESC LIMIT 1`,
    spaceId, subjectId, w.role,
  );
  if (newest && newest.body === text && nowMs - Date.parse(newest.created_at) < ANN_DOUBLE_TAP_MS) return 'repeat';
  const changed = await db.run(
    WRITES.post[w.role],
    crypto.randomUUID(), text, new Date(nowMs).toISOString(), subjectId, spaceId, ...(w.role === 'publisher' ? [w.userId] : []),
  );
  return changed === 1 ? 'posted' : 'refused';
}

/** Saves an edit: same row, same posting time and role; only the text and the edit time change. False when nothing changed (refused). */
export async function saveAnnouncement(db: Db, spaceId: string, subjectId: string, id: string, w: Writer, text: string, nowMs: number): Promise<boolean> {
  const changed = await db.run(WRITES.save[w.role], text, new Date(nowMs).toISOString(), id, spaceId, subjectId, ...gateParams(w, spaceId, subjectId));
  return changed === 1;
}

/** Removes an item: sets removed_at and erases the text in the same statement (section 4.2, 6.5). False when nothing changed. */
export async function removeAnnouncement(db: Db, spaceId: string, subjectId: string, id: string, w: Writer, nowMs: number): Promise<boolean> {
  const changed = await db.run(WRITES.remove[w.role], new Date(nowMs).toISOString(), id, spaceId, subjectId, ...gateParams(w, spaceId, subjectId));
  return changed === 1;
}
