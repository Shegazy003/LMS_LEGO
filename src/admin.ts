// The admin's work in one space (AT-2): people, groups and subjects.
//
// Rules kept by every function here:
// - Space: every statement names the space_id of every space table it touches
//   (test/guards/space-isolation.test.ts checks this). An id from another
//   space finds nothing and changes nothing.
// - Authority (docs/02-LEGO-MODEL.md, rules 1, 2 and 5): an admin appoints
//   publishers and learners only, never longer than their own end date, and
//   manages (new password, reset link) only the publishers and learners of
//   their own space. The owner manages the admins they appointed.
// - Each insert that links rows (a group member, a subject's reader) selects
//   its rows from this space in the same statement, so it cannot link across.
import type { Db, Param } from './db.ts';

export const APPOINTABLE = ['publisher', 'learner'] as const;
export type Appointable = (typeof APPOINTABLE)[number];
export const isAppointable = (role: string): role is Appointable => (APPOINTABLE as readonly string[]).includes(role);

export interface PersonRow {
  id: string;
  username: string;
  display_name: string;
  mobile: string;
  role: string;
  valid_from: string;
  valid_until: string;
  /** The day of "End access now" (release 1.1), or null. */
  ended_on: string | null;
}

export interface Choice {
  id: string;
  display_name: string;
}

/** The longest search the people list reads; anything longer is cut. */
export const SEARCH_MAX = 100;

/** What was typed into the people list's search box, trimmed and bounded. */
export function searchText(raw: string): string {
  return [...raw.trim()].slice(0, SEARCH_MAX).join('');
}

/** The publishers and learners of this space, publishers first. With a
 * search, only those whose name or username contains it (letter case aside,
 * for a–z), in this space only. instr() reads the typed text as plain text
 * (no wildcards) and has no pattern-length limit, which D1 sets on LIKE. */
export function peopleOf(db: Db, spaceId: string, search = ''): Promise<PersonRow[]> {
  return db.all<PersonRow>(
    `SELECT u.id, u.username, u.display_name, u.mobile, m.role, m.valid_from, m.valid_until, m.ended_on
       FROM membership m JOIN user u ON u.id = m.user_id
      WHERE m.space_id = ? AND m.role IN ('publisher', 'learner')
        AND (instr(lower(u.display_name), lower(?)) > 0 OR instr(u.username, lower(?)) > 0)
      ORDER BY CASE m.role WHEN 'publisher' THEN 0 ELSE 1 END, u.display_name, u.username`,
    spaceId, search, search,
  );
}

/** A person this space's admin may manage: a publisher or learner of this
 * space who is not also an admin here, and not the owner. Otherwise null. */
export function managedPerson(db: Db, spaceId: string, userId: string): Promise<PersonRow | null> {
  return db.first<PersonRow>(
    `SELECT u.id, u.username, u.display_name, u.mobile, m.role, m.valid_from, m.valid_until, m.ended_on
       FROM membership m JOIN user u ON u.id = m.user_id
      WHERE m.space_id = ? AND m.user_id = ? AND m.role IN ('publisher', 'learner') AND u.is_owner = 0
        AND NOT EXISTS (SELECT 1 FROM membership a WHERE a.space_id = m.space_id AND a.user_id = m.user_id AND a.role = 'admin')
      ORDER BY CASE m.role WHEN 'publisher' THEN 0 ELSE 1 END
      LIMIT 1`,
    spaceId, userId,
  );
}

/** An admin of this space (whom the owner manages). Otherwise null. */
export function spaceAdmin(db: Db, spaceId: string, userId: string): Promise<PersonRow | null> {
  return db.first<PersonRow>(
    `SELECT u.id, u.username, u.display_name, u.mobile, m.role, m.valid_from, m.valid_until, m.ended_on
       FROM membership m JOIN user u ON u.id = m.user_id
      WHERE m.space_id = ? AND m.user_id = ? AND m.role = 'admin' AND u.is_owner = 0`,
    spaceId, userId,
  );
}

// ---------------------------------------------- corrections (release 1.1) ----
// The appointer corrects a person (AT-6): the admin for the publishers and
// learners of their space, the owner for the admins of a space. `roles` names
// the memberships the appointer manages: ['publisher', 'learner'] or
// ['admin', 'admin'] (always two, so every statement stays one fixed text).
// Nothing here deletes a row: ending keeps the end date, the groups and the
// subjects; restoring sets a new end date and clears the end.
export type ManagedRoles = readonly [string, string];
export const ADMIN_MANAGES: ManagedRoles = ['publisher', 'learner'];
export const OWNER_MANAGES: ManagedRoles = ['admin', 'admin'];

/** Kills every reset link of this person that is still open. */
const killResetLinks = (userId: string, now: number): [string, ...Param[]] => [
  'UPDATE reset_link SET used_at = ? WHERE user_id = ? AND used_at IS NULL', now, userId,
];

/** Saves a corrected display name and mobile number, and an end date when one
 * is given, in one transaction. A changed number kills every reset link issued
 * before it, so a link already sent to the wrong number stops working. */
export async function correctPerson(
  db: Db,
  v: { spaceId: string; userId: string; roles: ManagedRoles; displayName: string; mobile: string; mobileChanged: boolean; validUntil: string | null; now: number },
): Promise<void> {
  await db.batch([
    ['UPDATE user SET display_name = ?, mobile = ? WHERE id = ? AND is_owner = 0', v.displayName, v.mobile, v.userId],
    ...(v.validUntil === null ? [] : [[
      'UPDATE membership SET valid_until = ? WHERE space_id = ? AND user_id = ? AND role IN (?, ?) AND ended_on IS NULL',
      v.validUntil, v.spaceId, v.userId, v.roles[0], v.roles[1],
    ] as [string, ...Param[]]]),
    ...(v.mobileChanged ? [killResetLinks(v.userId, v.now)] : []),
  ]);
}

/** "End access now": the membership ends at once (ended_on is today), every
 * sign-in of the person stops (its expiry becomes 0, so the next page they
 * open can still say why, once; see src/app.ts), and every open reset link is
 * killed. One transaction. */
export async function endAccess(db: Db, v: { spaceId: string; userId: string; roles: ManagedRoles; today: string; now: number }): Promise<void> {
  await db.batch([
    [
      'UPDATE membership SET ended_on = ? WHERE space_id = ? AND user_id = ? AND role IN (?, ?) AND ended_on IS NULL',
      v.today, v.spaceId, v.userId, v.roles[0], v.roles[1],
    ],
    ['UPDATE session SET expires_at = 0 WHERE user_id = ?', v.userId],
    killResetLinks(v.userId, v.now),
  ]);
}

/** "Restore access": the same memberships come back with a new end date; the
 * person's groups and subjects were never removed. */
export async function restoreAccess(db: Db, v: { spaceId: string; userId: string; roles: ManagedRoles; validUntil: string }): Promise<void> {
  await db.run(
    'UPDATE membership SET ended_on = NULL, valid_until = ? WHERE space_id = ? AND user_id = ? AND role IN (?, ?)',
    v.validUntil, v.spaceId, v.userId, v.roles[0], v.roles[1],
  );
}

function choicesWithRole(db: Db, spaceId: string, role: Appointable): Promise<Choice[]> {
  return db.all<Choice>(
    `SELECT u.id, u.display_name FROM membership m JOIN user u ON u.id = m.user_id
      WHERE m.space_id = ? AND m.role = ? ORDER BY u.display_name, u.username`,
    spaceId, role,
  );
}

export const learnersOf = (db: Db, spaceId: string) => choicesWithRole(db, spaceId, 'learner');
export const publishersOf = (db: Db, spaceId: string) => choicesWithRole(db, spaceId, 'publisher');

/** Creates the person's account and their place in this space, in one transaction. */
export async function appoint(
  db: Db,
  v: { spaceId: string; grantedBy: string; username: string; passwordHash: string; displayName: string; mobile: string; role: Appointable; validFrom: string; validUntil: string; now: number },
): Promise<void> {
  const userId = crypto.randomUUID();
  await db.batch([
    [
      'INSERT INTO user (id, username, password_hash, display_name, mobile, is_owner, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)',
      userId, v.username, v.passwordHash, v.displayName, v.mobile, v.now,
    ],
    [
      'INSERT INTO membership (id, space_id, user_id, role, valid_from, valid_until, granted_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
      crypto.randomUUID(), v.spaceId, userId, v.role, v.validFrom, v.validUntil, v.grantedBy,
    ],
  ]);
}

/** Sets a person's password and ends every sign-in of theirs. */
export async function setPassword(db: Db, userId: string, passwordHash: string): Promise<void> {
  await db.batch([
    ['UPDATE user SET password_hash = ? WHERE id = ?', passwordHash, userId],
    ['DELETE FROM session WHERE user_id = ?', userId],
  ]);
}

// ---------------------------------------------------------------- groups ----
export interface SetRow {
  id: string;
  name: string;
  members: Choice[];
}

export async function setsOf(db: Db, spaceId: string): Promise<SetRow[]> {
  const groups = await db.all<{ id: string; name: string }>('SELECT g.id, g.name FROM "group" g WHERE g.space_id = ? ORDER BY g.name, g.id', spaceId);
  const members = await db.all<{ group_id: string; id: string; display_name: string }>(
    `SELECT gm.group_id, u.id, u.display_name FROM group_member gm JOIN user u ON u.id = gm.user_id
      WHERE gm.space_id = ? ORDER BY u.display_name, u.username`,
    spaceId,
  );
  return groups.map((g) => ({ ...g, members: members.filter((m) => m.group_id === g.id).map(({ id, display_name }) => ({ id, display_name })) }));
}

export function findSet(db: Db, spaceId: string, groupId: string): Promise<{ id: string; name: string } | null> {
  return db.first('SELECT g.id, g.name FROM "group" g WHERE g.id = ? AND g.space_id = ?', groupId, spaceId);
}

const addMember = (spaceId: string, groupId: string, userId: string): [string, ...Param[]] => [
  `INSERT INTO group_member (space_id, group_id, user_id)
   SELECT m.space_id, g.id, m.user_id FROM membership m JOIN "group" g ON g.id = ? AND g.space_id = m.space_id
    WHERE m.space_id = ? AND m.user_id = ? AND m.role = 'learner'`,
  groupId, spaceId, userId,
];

/** Creates a group of this space's learners; returns its id. */
export async function createSet(db: Db, spaceId: string, name: string, memberIds: readonly string[]): Promise<string> {
  const id = crypto.randomUUID();
  await db.batch([
    ['INSERT INTO "group" (id, space_id, name) VALUES (?, ?, ?)', id, spaceId, name],
    ...memberIds.map((m) => addMember(spaceId, id, m)),
  ]);
  return id;
}

/** Replaces a group's members. */
export async function saveSetMembers(db: Db, spaceId: string, groupId: string, memberIds: readonly string[]): Promise<void> {
  await db.batch([
    ['DELETE FROM group_member WHERE space_id = ? AND group_id = ?', spaceId, groupId],
    ...memberIds.map((m) => addMember(spaceId, groupId, m)),
  ]);
}

/** Renames a group of this space (AT-7); the caller has checked the name's
 * bounds. One statement on the group's own row: its members and the subjects
 * assigned to it are untouched, and every page reads the name from this row. */
export async function renameSet(db: Db, spaceId: string, groupId: string, name: string): Promise<void> {
  await db.run('UPDATE "group" SET name = ? WHERE id = ? AND space_id = ?', name, groupId, spaceId);
}

// -------------------------------------------------------------- subjects ----
export interface TopicRow {
  id: string;
  title: string;
  is_published: number;
  publisher_user_id: string | null;
  publisher_name: string | null;
}

export function topicsOf(db: Db, spaceId: string): Promise<TopicRow[]> {
  return db.all<TopicRow>(
    `SELECT s.id, s.title, s.is_published, s.publisher_user_id, u.display_name AS publisher_name
       FROM subject s LEFT JOIN user u ON u.id = s.publisher_user_id
      WHERE s.space_id = ? ORDER BY s.title, s.id`,
    spaceId,
  );
}

export function findTopic(db: Db, spaceId: string, subjectId: string): Promise<TopicRow | null> {
  return db.first<TopicRow>(
    `SELECT s.id, s.title, s.is_published, s.publisher_user_id, u.display_name AS publisher_name
       FROM subject s LEFT JOIN user u ON u.id = s.publisher_user_id
      WHERE s.id = ? AND s.space_id = ?`,
    subjectId, spaceId,
  );
}

/** Who may read a subject: its groups and its directly assigned learners. */
export async function topicReaders(db: Db, spaceId: string, subjectId: string): Promise<{ sets: string[]; learners: string[] }> {
  const rows = await db.all<{ group_id: string | null; user_id: string | null }>(
    'SELECT a.group_id, a.user_id FROM subject_access a WHERE a.space_id = ? AND a.subject_id = ?',
    spaceId, subjectId,
  );
  return {
    sets: rows.flatMap((r) => (r.group_id ? [r.group_id] : [])),
    learners: rows.flatMap((r) => (r.user_id ? [r.user_id] : [])),
  };
}

/** Creates a subject with its responsible publisher (or none yet); returns its id. */
export async function createTopic(db: Db, spaceId: string, title: string, publisherId: string | null): Promise<string> {
  const id = crypto.randomUUID();
  await db.run('INSERT INTO subject (id, space_id, title, publisher_user_id, is_published) VALUES (?, ?, ?, ?, 0)', id, spaceId, title, publisherId);
  return id;
}

/** Renames a subject of this space (AT-7); the caller has checked the name's
 * bounds. Only the title changes: the publisher, the published state, who may
 * read it and its chapters, lessons and materials are untouched. */
export async function renameTopic(db: Db, spaceId: string, subjectId: string, title: string): Promise<void> {
  await db.run('UPDATE subject SET title = ? WHERE id = ? AND space_id = ?', title, subjectId, spaceId);
}

/** Sets a subject's responsible publisher and replaces who may read it. The
 * caller has checked that every id is a publisher, group or learner of this space. */
export async function saveTopic(
  db: Db,
  spaceId: string,
  subjectId: string,
  v: { publisherId: string | null; setIds: readonly string[]; learnerIds: readonly string[] },
): Promise<void> {
  await db.batch([
    ['UPDATE subject SET publisher_user_id = ? WHERE id = ? AND space_id = ?', v.publisherId, subjectId, spaceId],
    ['DELETE FROM subject_access WHERE space_id = ? AND subject_id = ?', spaceId, subjectId],
    ...v.setIds.map((g): [string, ...Param[]] => [
      `INSERT INTO subject_access (id, space_id, subject_id, group_id, user_id)
       SELECT ?, g.space_id, ?, g.id, NULL FROM "group" g WHERE g.id = ? AND g.space_id = ?`,
      crypto.randomUUID(), subjectId, g, spaceId,
    ]),
    ...v.learnerIds.map((u): [string, ...Param[]] => [
      `INSERT INTO subject_access (id, space_id, subject_id, group_id, user_id)
       SELECT ?, m.space_id, ?, NULL, m.user_id FROM membership m WHERE m.space_id = ? AND m.user_id = ? AND m.role = 'learner'`,
      crypto.randomUUID(), subjectId, spaceId, u,
    ]),
  ]);
}
