// The publisher's editing (AT-3): chapters, lessons and materials of the
// subjects a publisher is responsible for, and publishing them.
//
// Three rules, each kept by every function here:
// - Space: every statement names the space_id of every space table it
//   touches (test/guards/space-isolation.test.ts checks this).
// - Ownership: a publisher edits only a subject whose responsible publisher
//   they are (docs/02-LEGO-MODEL.md, rule 6). Lookups return null for anything
//   else, and every insert and update repeats the check inside the statement
//   itself, so the write and the check cannot drift apart.
// - Order: a new chapter, lesson or material goes last; moving swaps an item
//   with its neighbour and renumbers the siblings 1, 2, 3, ...
// - Removal (release 1.1, AT-8): a removed item keeps its row and position
//   (src/removal.ts). Lookups here find only items that show, so nothing is
//   added to, moved, renamed or replaced inside a removed item; moving skips
//   removed siblings but keeps their places, so a restored item comes back
//   where it was.
import type { Db, Param } from './db.ts';
import type { MaterialKind, SubjectRow } from './learning.ts';

export type Direction = 'up' | 'down';
export const isDirection = (v: string): v is Direction => v === 'up' || v === 'down';

/** The ids in their new order after moving one id a place up or down. */
export function moveItem(ids: readonly string[], id: string, direction: Direction): string[] {
  const out = [...ids];
  const i = out.indexOf(id);
  const j = direction === 'up' ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= out.length) return out;
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

// --------------------------------------------------------------- lookups ----
export interface EditableChapter {
  id: string;
  title: string;
  subject_id: string;
}

export interface EditableLesson {
  id: string;
  title: string;
  chapter_id: string;
  chapter_title: string;
  subject_id: string;
}

export interface EditableMaterial {
  id: string;
  kind: MaterialKind;
  title: string;
  lesson_id: string;
  lesson_title: string;
  subject_id: string;
}

export function editableSubject(db: Db, spaceId: string, userId: string, subjectId: string): Promise<SubjectRow | null> {
  return db.first<SubjectRow>(
    'SELECT s.id, s.title, s.publisher_user_id, s.is_published FROM subject s WHERE s.id = ? AND s.space_id = ? AND s.publisher_user_id = ?',
    subjectId, spaceId, userId,
  );
}

export function editableChapter(db: Db, spaceId: string, userId: string, chapterId: string): Promise<EditableChapter | null> {
  return db.first<EditableChapter>(
    `SELECT c.id, c.title, c.subject_id FROM chapter c
       JOIN subject s ON s.id = c.subject_id AND s.space_id = c.space_id
      WHERE c.id = ? AND c.space_id = ? AND c.removed_at IS NULL AND s.publisher_user_id = ?`,
    chapterId, spaceId, userId,
  );
}

export function editableLesson(db: Db, spaceId: string, userId: string, lessonId: string): Promise<EditableLesson | null> {
  return db.first<EditableLesson>(
    `SELECT l.id, l.title, l.chapter_id, c.title AS chapter_title, c.subject_id FROM lesson l
       JOIN chapter c ON c.id = l.chapter_id AND c.space_id = l.space_id AND c.removed_at IS NULL
       JOIN subject s ON s.id = c.subject_id AND s.space_id = c.space_id
      WHERE l.id = ? AND l.space_id = ? AND l.removed_at IS NULL AND s.publisher_user_id = ?`,
    lessonId, spaceId, userId,
  );
}

export function editableMaterial(db: Db, spaceId: string, userId: string, materialId: string): Promise<EditableMaterial | null> {
  return db.first<EditableMaterial>(
    `SELECT m.id, m.kind, m.title, m.lesson_id, l.title AS lesson_title, c.subject_id FROM material m
       JOIN lesson l ON l.id = m.lesson_id AND l.space_id = m.space_id AND l.removed_at IS NULL
       JOIN chapter c ON c.id = l.chapter_id AND c.space_id = l.space_id AND c.removed_at IS NULL
       JOIN subject s ON s.id = c.subject_id AND s.space_id = c.space_id
      WHERE m.id = ? AND m.space_id = ? AND m.removed_at IS NULL AND s.publisher_user_id = ?`,
    materialId, spaceId, userId,
  );
}

// ---------------------------------------------------------------- writes ----
// Each insert copies the row's space from its parent, which the database also
// requires (the parent is referred to by id and space_id), and inserts nothing
// unless the parent belongs to this space and this publisher. They return
// whether a row was written.

export async function addChapter(db: Db, spaceId: string, userId: string, subjectId: string, title: string): Promise<boolean> {
  const changed = await db.run(
    `INSERT INTO chapter (id, space_id, subject_id, title, position)
     SELECT ?, s.space_id, s.id, ?,
            COALESCE((SELECT MAX(c.position) FROM chapter c WHERE c.space_id = s.space_id AND c.subject_id = s.id), 0) + 1
       FROM subject s WHERE s.id = ? AND s.space_id = ? AND s.publisher_user_id = ?`,
    crypto.randomUUID(), title, subjectId, spaceId, userId,
  );
  return changed === 1;
}

export async function addLesson(db: Db, spaceId: string, userId: string, chapterId: string, title: string): Promise<boolean> {
  const changed = await db.run(
    `INSERT INTO lesson (id, space_id, chapter_id, title, body_text, position)
     SELECT ?, c.space_id, c.id, ?, '',
            COALESCE((SELECT MAX(l.position) FROM lesson l WHERE l.space_id = c.space_id AND l.chapter_id = c.id), 0) + 1
       FROM chapter c JOIN subject s ON s.id = c.subject_id AND s.space_id = c.space_id
      WHERE c.id = ? AND c.space_id = ? AND c.removed_at IS NULL AND s.publisher_user_id = ?`,
    crypto.randomUUID(), title, chapterId, spaceId, userId,
  );
  return changed === 1;
}

export interface NewMaterial {
  id: string;
  kind: MaterialKind;
  title: string;
  storageKey: string | null;
  url: string | null;
  noteText: string | null;
}

export async function addMaterial(db: Db, spaceId: string, userId: string, lessonId: string, m: NewMaterial): Promise<boolean> {
  const changed = await db.run(
    `INSERT INTO material (id, space_id, lesson_id, kind, title, storage_key, url, note_text, position)
     SELECT ?, l.space_id, l.id, ?, ?, ?, ?, ?,
            COALESCE((SELECT MAX(m.position) FROM material m WHERE m.space_id = l.space_id AND m.lesson_id = l.id), 0) + 1
       FROM lesson l
       JOIN chapter c ON c.id = l.chapter_id AND c.space_id = l.space_id AND c.removed_at IS NULL
       JOIN subject s ON s.id = c.subject_id AND s.space_id = c.space_id
      WHERE l.id = ? AND l.space_id = ? AND l.removed_at IS NULL AND s.publisher_user_id = ?`,
    m.id, m.kind, m.title, m.storageKey, m.url, m.noteText, lessonId, spaceId, userId,
  );
  return changed === 1;
}

export async function setPublished(db: Db, spaceId: string, userId: string, subjectId: string, published: boolean): Promise<boolean> {
  const changed = await db.run(
    'UPDATE subject SET is_published = ? WHERE id = ? AND space_id = ? AND publisher_user_id = ?',
    published ? 1 : 0, subjectId, spaceId, userId,
  );
  return changed === 1;
}

// ------------------------------------------------------------- reordering ----
type Sibling = { id: string; position: number; removed_at: number | null };

/** The ids in their new order after moving one id a place up or down among
 * the siblings that show: it swaps places with the nearest shown sibling in
 * that direction, and removed siblings keep their places in between. */
export function moveAmongShown(siblings: readonly { id: string; removed: boolean }[], id: string, direction: Direction): string[] {
  const out = siblings.map((s) => s.id);
  const i = out.indexOf(id);
  if (i < 0 || siblings[i].removed) return out;
  const step = direction === 'up' ? -1 : 1;
  let j = i + step;
  while (j >= 0 && j < out.length && siblings[j].removed) j += step;
  if (j < 0 || j >= out.length) return out;
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

/** Writes the new order, touching only the rows whose position changes. */
async function reorder(db: Db, siblings: Sibling[], id: string, direction: Direction, update: string, spaceId: string): Promise<void> {
  const order = moveAmongShown(siblings.map((s) => ({ id: s.id, removed: s.removed_at !== null })), id, direction);
  const statements: [string, ...Param[]][] = [];
  order.forEach((sid, i) => {
    if (siblings.find((s) => s.id === sid)?.position !== i + 1) statements.push([update, i + 1, sid, spaceId]);
  });
  if (statements.length) await db.batch(statements);
}

export async function moveChapter(db: Db, spaceId: string, chapter: EditableChapter, direction: Direction): Promise<void> {
  const siblings = await db.all<Sibling>(
    'SELECT c.id, c.position, c.removed_at FROM chapter c WHERE c.space_id = ? AND c.subject_id = ? ORDER BY c.position, c.id',
    spaceId, chapter.subject_id,
  );
  await reorder(db, siblings, chapter.id, direction, 'UPDATE chapter SET position = ? WHERE id = ? AND space_id = ?', spaceId);
}

export async function moveLesson(db: Db, spaceId: string, lesson: EditableLesson, direction: Direction): Promise<void> {
  const siblings = await db.all<Sibling>(
    'SELECT l.id, l.position, l.removed_at FROM lesson l WHERE l.space_id = ? AND l.chapter_id = ? ORDER BY l.position, l.id',
    spaceId, lesson.chapter_id,
  );
  await reorder(db, siblings, lesson.id, direction, 'UPDATE lesson SET position = ? WHERE id = ? AND space_id = ?', spaceId);
}

export async function moveMaterial(db: Db, spaceId: string, material: EditableMaterial, direction: Direction): Promise<void> {
  const siblings = await db.all<Sibling>(
    'SELECT m.id, m.position, m.removed_at FROM material m WHERE m.space_id = ? AND m.lesson_id = ? ORDER BY m.position, m.id',
    spaceId, material.lesson_id,
  );
  await reorder(db, siblings, material.id, direction, 'UPDATE material SET position = ? WHERE id = ? AND space_id = ?', spaceId);
}

// ------------------------------------------------------- renaming (AT-8) ----
// One statement each, which repeats the ownership check and finds only an
// item that shows. The caller has checked the title (src/names.ts,
// cleanItemName: 1 to 100 characters on one line). They return whether a row
// was written.

export async function renameChapter(db: Db, spaceId: string, userId: string, chapterId: string, title: string): Promise<boolean> {
  const changed = await db.run(
    `UPDATE chapter SET title = ?
      WHERE id = ? AND space_id = ? AND removed_at IS NULL
        AND EXISTS (SELECT 1 FROM subject s WHERE s.id = chapter.subject_id AND s.space_id = chapter.space_id AND s.publisher_user_id = ?)`,
    title, chapterId, spaceId, userId,
  );
  return changed === 1;
}

export async function renameLesson(db: Db, spaceId: string, userId: string, lessonId: string, title: string): Promise<boolean> {
  const changed = await db.run(
    `UPDATE lesson SET title = ?
      WHERE id = ? AND space_id = ? AND removed_at IS NULL
        AND EXISTS (SELECT 1 FROM chapter c JOIN subject s ON s.id = c.subject_id AND s.space_id = c.space_id
                     WHERE c.id = lesson.chapter_id AND c.space_id = lesson.space_id AND c.removed_at IS NULL AND s.publisher_user_id = ?)`,
    title, lessonId, spaceId, userId,
  );
  return changed === 1;
}

export async function renameMaterial(db: Db, spaceId: string, userId: string, materialId: string, title: string): Promise<boolean> {
  const changed = await db.run(
    `UPDATE material SET title = ?
      WHERE id = ? AND space_id = ? AND removed_at IS NULL
        AND EXISTS (SELECT 1 FROM lesson l
                      JOIN chapter c ON c.id = l.chapter_id AND c.space_id = l.space_id
                      JOIN subject s ON s.id = c.subject_id AND s.space_id = c.space_id
                     WHERE l.id = material.lesson_id AND l.space_id = material.space_id
                       AND l.removed_at IS NULL AND c.removed_at IS NULL AND s.publisher_user_id = ?)`,
    title, materialId, spaceId, userId,
  );
  return changed === 1;
}

// ------------------------------------------------- replacing a file (AT-8) ----
// The new bytes go under a NEW key first (the old object is never
// overwritten); then one statement switches the material to it, keeping its
// id, title, kind and place. The material's address (/s/<space>/file/<id>)
// stays; it serves the new object, whose ETag differs, so a browser's cached
// copy of the old bytes is never confirmed (no 304). The old object is kept
// in storage and counted on the owner's usage panel (AMBER choice, README).

/** A new storage key for a replaced file, under the prefix of the same item (its id). */
export const replacementKey = (spaceId: string, materialId: string) => `spaces/${spaceId}/files/${materialId}/${crypto.randomUUID()}`;

export async function switchFile(db: Db, spaceId: string, userId: string, material: { id: string; kind: MaterialKind }, storageKey: string): Promise<boolean> {
  const changed = await db.run(
    `UPDATE material SET storage_key = ?
      WHERE id = ? AND space_id = ? AND kind = ? AND removed_at IS NULL
        AND EXISTS (SELECT 1 FROM lesson l
                      JOIN chapter c ON c.id = l.chapter_id AND c.space_id = l.space_id
                      JOIN subject s ON s.id = c.subject_id AND s.space_id = c.space_id
                     WHERE l.id = material.lesson_id AND l.space_id = material.space_id
                       AND l.removed_at IS NULL AND c.removed_at IS NULL AND s.publisher_user_id = ?)`,
    storageKey, material.id, spaceId, material.kind, userId,
  );
  return changed === 1;
}
