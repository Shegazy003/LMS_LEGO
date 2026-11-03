// Guardians (release 2, R2-a; contract product-contract-r2, AT-9 and section 6).
//
// A guardian is a membership with role 'guardian'. The admin links a guardian
// to learners of the same space (guardian_link, migrations/0007_guardians.sql);
// the guardian then sees, read-only, each linked learner's assigned subject
// titles and each subject's publisher, and nothing else.
//
// Rules kept by every function here:
// - Space: every statement names the space_id of every space table it touches
//   (test/guards/space-isolation.test.ts).
// - The person, not the address: what a guardian sees is found from the
//   session's person (guardianId) and the link rows, never from an id in the
//   address alone. A learner page for anyone not actively linked to the viewer
//   finds nothing, whether the id exists or not.
// - Rules that hide at once: a removed link (ended_at set), a learner whose
//   access ended or has not started, and a guardian whose own access ended are
//   all decided on each request, from the rows as they are then.
// - Nothing is deleted: removing a link sets ended_at; restoring clears it on
//   the same row.
import { membershipStatus } from './access.ts';
import type { Db } from './db.ts';

export interface LinkRow {
  id: string;
  display_name: string;
  /** Milliseconds; null while the link is active. */
  ended_at: number | null;
}

export interface LinkedLearner {
  id: string;
  display_name: string;
}

export interface GuardianSubject {
  title: string;
  publisher_name: string | null;
}

/** Whether this person holds the guardian role in this space (whatever its dates). */
export async function isGuardianHere(db: Db, spaceId: string, userId: string): Promise<boolean> {
  const row = await db.first(
    "SELECT 1 AS one FROM membership m WHERE m.space_id = ? AND m.user_id = ? AND m.role = 'guardian'",
    spaceId, userId,
  );
  return row !== null;
}

/** Whether this person is a learner of this space (whatever its dates): the only people a guardian can be linked to. */
export async function isLearnerHere(db: Db, spaceId: string, userId: string): Promise<boolean> {
  const row = await db.first(
    "SELECT 1 AS one FROM membership m WHERE m.space_id = ? AND m.user_id = ? AND m.role = 'learner'",
    spaceId, userId,
  );
  return row !== null;
}

/** Every link of this guardian in this space, active and removed, for the admin's page. */
export function linksOf(db: Db, spaceId: string, guardianId: string): Promise<LinkRow[]> {
  return db.all<LinkRow>(
    `SELECT gl.learner_user_id AS id, u.display_name, gl.ended_at
       FROM guardian_link gl JOIN user u ON u.id = gl.learner_user_id
      WHERE gl.space_id = ? AND gl.guardian_user_id = ?
      ORDER BY u.display_name, u.username`,
    spaceId, guardianId,
  );
}

/** Links a guardian to a learner of the same space, or restores a removed
 * link (the same row, created_at and created_by unchanged). One statement,
 * which repeats every rule: the guardian holds the guardian role here, the
 * learner is a learner here, and they are not the same person. Returns
 * whether the link is now active. */
export async function link(db: Db, v: { spaceId: string; guardianId: string; learnerId: string; by: string; now: number }): Promise<boolean> {
  const changed = await db.run(
    `INSERT INTO guardian_link (id, space_id, guardian_user_id, learner_user_id, created_by, created_at)
     SELECT ?, g.space_id, g.user_id, l.user_id, ?, ?
       FROM membership g JOIN membership l ON l.space_id = g.space_id AND l.user_id = ? AND l.role = 'learner'
      WHERE g.space_id = ? AND g.user_id = ? AND g.role = 'guardian' AND l.user_id <> g.user_id
     ON CONFLICT (space_id, guardian_user_id, learner_user_id) DO UPDATE SET ended_at = NULL`,
    crypto.randomUUID(), v.by, v.now, v.learnerId, v.spaceId, v.guardianId,
  );
  return changed === 1;
}

/** Removes an active link (ended_at is set; nothing is deleted). Returns whether one was removed. */
export async function unlink(db: Db, v: { spaceId: string; guardianId: string; learnerId: string; now: number }): Promise<boolean> {
  const changed = await db.run(
    'UPDATE guardian_link SET ended_at = ? WHERE space_id = ? AND guardian_user_id = ? AND learner_user_id = ? AND ended_at IS NULL',
    v.now, v.spaceId, v.guardianId, v.learnerId,
  );
  return changed === 1;
}

/** The learners this guardian may see now: actively linked, and with a
 * learner membership of this space that is active today. In name order. */
export async function linkedLearners(db: Db, spaceId: string, guardianId: string, nowMs: number): Promise<LinkedLearner[]> {
  const rows = await db.all<LinkedLearner & { valid_from: string; valid_until: string; ended_on: string | null }>(
    `SELECT u.id, u.display_name, m.valid_from, m.valid_until, m.ended_on
       FROM guardian_link gl
       JOIN membership m ON m.space_id = gl.space_id AND m.user_id = gl.learner_user_id AND m.role = 'learner'
       JOIN user u ON u.id = gl.learner_user_id
      WHERE gl.space_id = ? AND gl.guardian_user_id = ? AND gl.ended_at IS NULL AND gl.learner_user_id <> gl.guardian_user_id
      ORDER BY u.display_name, u.username`,
    spaceId, guardianId,
  );
  return rows
    .filter((r) => membershipStatus(r.valid_from, r.valid_until, nowMs, r.ended_on) === 'active')
    .map(({ id, display_name }) => ({ id, display_name }));
}

/** One linked learner, when this guardian may see them now; otherwise null
 * (not linked, link removed, access ended, another space, or no such person). */
export async function linkedLearner(db: Db, spaceId: string, guardianId: string, learnerId: string, nowMs: number): Promise<LinkedLearner | null> {
  return (await linkedLearners(db, spaceId, guardianId, nowMs)).find((l) => l.id === learnerId) ?? null;
}

/** What a guardian sees of one linked learner: exactly the subjects that
 * learner sees on their own home (published, assigned to them directly or
 * through a group of this space), each with its title and its publisher's
 * name. No ids, no chapters, lessons or materials. */
export function subjectsSeenBy(db: Db, spaceId: string, learnerId: string): Promise<GuardianSubject[]> {
  return db.all<GuardianSubject>(
    `SELECT s.title, u.display_name AS publisher_name
       FROM subject s LEFT JOIN user u ON u.id = s.publisher_user_id
      WHERE s.space_id = ? AND s.is_published = 1
        AND EXISTS (
          SELECT 1 FROM subject_access a
           WHERE a.space_id = s.space_id AND a.subject_id = s.id
             AND (a.user_id = ? OR a.group_id IN (
               SELECT gm.group_id FROM group_member gm WHERE gm.space_id = s.space_id AND gm.user_id = ?)))
      ORDER BY s.title, s.id`,
    spaceId, learnerId, learnerId,
  );
}
