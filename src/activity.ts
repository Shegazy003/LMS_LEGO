// Lesson activity (release 2, R2-d; contract product-contract-r2, AT-15 and
// section 6, rule 2). The admin switches it on for the space, after ticking
// that guardians and learners were told; from then on, each time a learner
// opens a lesson page of their own, the date of that day is kept as the
// lesson's last-opened date (one row per learner and lesson,
// migrations/0010_lesson_views.sql). A guardian linked to the learner sees,
// per lesson, that date or "No open recorded", never before the later of the
// switch-on day and their own link's day. Switching off deletes every row of
// the space.
//
// Rules kept by every function here:
// - Space: every statement names the space_id of every space table it touches
//   (test/guards/space-isolation.test.ts).
// - The only write of a lesson-view row is recordOpen, and the only deletion
//   is switchOff (AT-15d, AT-15g; test/at15). Nothing is ever deleted by age.
// - A date is a calendar day (YYYY-MM-DD, the UTC day the product uses for
//   every date it shows), never a time, a count or a duration (AT-15e).
// - Nothing here is ever sent anywhere: no message, no email, no notification.
import { utcDate } from './access.ts';
import type { Db } from './db.ts';

export interface ActivitySetting {
  enabled: boolean;
  /** The day of the last switch-on (YYYY-MM-DD); null if never switched on. */
  since: string | null;
}

export interface ActivityLesson {
  title: string;
  /** The last-opened date shown to this guardian, or null for "No open recorded". */
  lastOpenedOn: string | null;
}

export interface ActivitySubject {
  title: string;
  /** Its lessons in order. */
  rows: ActivityLesson[];
}

/** The space's switch. A space without a row has never been switched on: off (AT-15a). */
export async function activitySetting(db: Db, spaceId: string): Promise<ActivitySetting> {
  const row = await db.first<{ enabled: number; enabled_since: string | null }>(
    'SELECT v.enabled, v.enabled_since FROM lesson_view_setting v WHERE v.space_id = ?',
    spaceId,
  );
  return { enabled: row?.enabled === 1, since: row?.enabled === 1 ? row.enabled_since : null };
}

/** Switches lesson activity on: records who, when, the tick and the day
 * recording starts. Already on: nothing changes (the start day stays).
 * Returns whether it was switched on now. */
export async function switchOn(db: Db, v: { spaceId: string; by: string; now: number }): Promise<boolean> {
  const changed = await db.run(
    `INSERT INTO lesson_view_setting (space_id, enabled, enabled_since, told_confirmed, changed_by, changed_at) VALUES (?, 1, ?, 1, ?, ?)
     ON CONFLICT (space_id) DO UPDATE SET enabled = 1, enabled_since = excluded.enabled_since, told_confirmed = 1,
       changed_by = excluded.changed_by, changed_at = excluded.changed_at
     WHERE lesson_view_setting.enabled = 0`,
    v.spaceId, utcDate(v.now), v.by, v.now,
  );
  return changed === 1;
}

/** Switches lesson activity off and deletes every lesson-view row of the
 * space, in one transaction: recording stops with the next request, and a
 * later switch-on starts empty (AT-15b, 15h). The only deletion of these rows. */
export async function switchOff(db: Db, v: { spaceId: string; by: string; now: number }): Promise<void> {
  await db.batch([
    ['DELETE FROM lesson_view WHERE space_id = ?', v.spaceId],
    [
      'UPDATE lesson_view_setting SET enabled = 0, told_confirmed = 0, changed_by = ?, changed_at = ? WHERE space_id = ? AND enabled = 1',
      v.by, v.now, v.spaceId,
    ],
  ]);
}

/** The learner opened this lesson today (AT-15d): the row is created, or its
 * date moved to today if earlier; a second open the same day changes nothing.
 * One statement, which repeats every rule: the setting is on, the lesson and
 * its chapter are not removed, and its subject is published and assigned to
 * this learner directly or through a group. The caller has checked that the
 * person opens it as a learner. Returns whether a row was written. */
export async function recordOpen(db: Db, v: { spaceId: string; lessonId: string; learnerId: string; now: number }): Promise<boolean> {
  const changed = await db.run(
    `INSERT INTO lesson_view (space_id, lesson_id, learner_user_id, last_opened_on)
     SELECT l.space_id, l.id, ?, ?
       FROM lesson l
       JOIN chapter c ON c.id = l.chapter_id AND c.space_id = l.space_id AND c.removed_at IS NULL
       JOIN subject s ON s.id = c.subject_id AND s.space_id = l.space_id AND s.is_published = 1
      WHERE l.id = ? AND l.space_id = ? AND l.removed_at IS NULL
        AND EXISTS (SELECT 1 FROM lesson_view_setting v WHERE v.space_id = l.space_id AND v.enabled = 1)
        AND EXISTS (
          SELECT 1 FROM subject_access a
           WHERE a.space_id = l.space_id AND a.subject_id = s.id
             AND (a.user_id = ? OR a.group_id IN (
               SELECT gm.group_id FROM group_member gm WHERE gm.space_id = l.space_id AND gm.user_id = ?)))
     ON CONFLICT (space_id, lesson_id, learner_user_id) DO UPDATE SET last_opened_on = excluded.last_opened_on
      WHERE excluded.last_opened_on > lesson_view.last_opened_on`,
    v.learnerId, utcDate(v.now), v.lessonId, v.spaceId, v.learnerId, v.learnerId,
  );
  return changed === 1;
}

/** The day this guardian's active link to this learner was made (YYYY-MM-DD), or null if there is none. */
export async function linkedSince(db: Db, spaceId: string, guardianId: string, learnerId: string): Promise<string | null> {
  const row = await db.first<{ created_at: number }>(
    `SELECT gl.created_at FROM guardian_link gl
      WHERE gl.space_id = ? AND gl.guardian_user_id = ? AND gl.learner_user_id = ? AND gl.ended_at IS NULL`,
    spaceId, guardianId, learnerId,
  );
  return row ? utcDate(Number(row.created_at)) : null;
}

/** "Recording since" for one guardian and learner (AT-15c-2): the later of the switch-on day and the link's day. */
export const recordingSince = (switchedOn: string, linked: string): string => (linked > switchedOn ? linked : switchedOn);

/** What a guardian sees of one learner's activity: every published subject
 * assigned to the learner (as on the learner's own home), each with its
 * lessons in order (removed ones never), and per lesson the last-opened date
 * if it is on or after `since`, else null. Lesson titles and dates only: no
 * id, content, file or link. */
export async function activityOf(db: Db, spaceId: string, learnerId: string, since: string): Promise<ActivitySubject[]> {
  const rows = await db.all<{ subject_id: string; subject_title: string; lesson_id: string | null; lesson_title: string | null; last_opened_on: string | null }>(
    `SELECT s.id AS subject_id, s.title AS subject_title, l.id AS lesson_id, l.title AS lesson_title, v.last_opened_on
       FROM subject s
       LEFT JOIN chapter c ON c.subject_id = s.id AND c.space_id = s.space_id AND c.removed_at IS NULL
       LEFT JOIN lesson l ON l.chapter_id = c.id AND l.space_id = s.space_id AND l.removed_at IS NULL
       LEFT JOIN lesson_view v ON v.space_id = s.space_id AND v.lesson_id = l.id AND v.learner_user_id = ? AND v.last_opened_on >= ?
      WHERE s.space_id = ? AND s.is_published = 1
        AND EXISTS (
          SELECT 1 FROM subject_access a
           WHERE a.space_id = s.space_id AND a.subject_id = s.id
             AND (a.user_id = ? OR a.group_id IN (
               SELECT gm.group_id FROM group_member gm WHERE gm.space_id = s.space_id AND gm.user_id = ?)))
      ORDER BY s.title, s.id, c.position, c.id, l.position, l.id`,
    learnerId, since, spaceId, learnerId, learnerId,
  );
  const subjects: (ActivitySubject & { id: string })[] = [];
  for (const r of rows) {
    let s = subjects.at(-1);
    if (!s || s.id !== r.subject_id) subjects.push((s = { id: r.subject_id, title: r.subject_title, rows: [] }));
    if (r.lesson_id) s.rows.push({ title: r.lesson_title ?? '', lastOpenedOn: r.last_opened_on });
  }
  return subjects.map(({ title, rows: list }) => ({ title, rows: list }));
}
