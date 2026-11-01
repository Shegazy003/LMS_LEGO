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
  lesson_id: string;
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
    `SELECT c.id, c.subject_id FROM chapter c
       JOIN subject s ON s.id = c.subject_id AND s.space_id = c.space_id
      WHERE c.id = ? AND c.space_id = ? AND s.publisher_user_id = ?`,
    chapterId, spaceId, userId,
  );
}

export function editableLesson(db: Db, spaceId: string, userId: string, lessonId: string): Promise<EditableLesson | null> {
  return db.first<EditableLesson>(
    `SELECT l.id, l.title, l.chapter_id, c.title AS chapter_title, c.subject_id FROM lesson l
       JOIN chapter c ON c.id = l.chapter_id AND c.space_id = l.space_id
       JOIN subject s ON s.id = c.subject_id AND s.space_id = c.space_id
      WHERE l.id = ? AND l.space_id = ? AND s.publisher_user_id = ?`,
    lessonId, spaceId, userId,
  );
}

export function editableMaterial(db: Db, spaceId: string, userId: string, materialId: string): Promise<EditableMaterial | null> {
  return db.first<EditableMaterial>(
    `SELECT m.id, m.lesson_id, c.subject_id FROM material m
       JOIN lesson l ON l.id = m.lesson_id AND l.space_id = m.space_id
       JOIN chapter c ON c.id = l.chapter_id AND c.space_id = l.space_id
       JOIN subject s ON s.id = c.subject_id AND s.space_id = c.space_id
      WHERE m.id = ? AND m.space_id = ? AND s.publisher_user_id = ?`,
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
      WHERE c.id = ? AND c.space_id = ? AND s.publisher_user_id = ?`,
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
       JOIN chapter c ON c.id = l.chapter_id AND c.space_id = l.space_id
       JOIN subject s ON s.id = c.subject_id AND s.space_id = c.space_id
      WHERE l.id = ? AND l.space_id = ? AND s.publisher_user_id = ?`,
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
type Sibling = { id: string; position: number };

/** Writes the new order, touching only the rows whose position changes. */
async function reorder(db: Db, siblings: Sibling[], id: string, direction: Direction, update: string, spaceId: string): Promise<void> {
  const order = moveItem(siblings.map((s) => s.id), id, direction);
  const statements: [string, ...Param[]][] = [];
  order.forEach((sid, i) => {
    if (siblings.find((s) => s.id === sid)?.position !== i + 1) statements.push([update, i + 1, sid, spaceId]);
  });
  if (statements.length) await db.batch(statements);
}

export async function moveChapter(db: Db, spaceId: string, chapter: EditableChapter, direction: Direction): Promise<void> {
  const siblings = await db.all<Sibling>(
    'SELECT c.id, c.position FROM chapter c WHERE c.space_id = ? AND c.subject_id = ? ORDER BY c.position, c.id',
    spaceId, chapter.subject_id,
  );
  await reorder(db, siblings, chapter.id, direction, 'UPDATE chapter SET position = ? WHERE id = ? AND space_id = ?', spaceId);
}

export async function moveLesson(db: Db, spaceId: string, lesson: EditableLesson, direction: Direction): Promise<void> {
  const siblings = await db.all<Sibling>(
    'SELECT l.id, l.position FROM lesson l WHERE l.space_id = ? AND l.chapter_id = ? ORDER BY l.position, l.id',
    spaceId, lesson.chapter_id,
  );
  await reorder(db, siblings, lesson.id, direction, 'UPDATE lesson SET position = ? WHERE id = ? AND space_id = ?', spaceId);
}

export async function moveMaterial(db: Db, spaceId: string, material: EditableMaterial, direction: Direction): Promise<void> {
  const siblings = await db.all<Sibling>(
    'SELECT m.id, m.position FROM material m WHERE m.space_id = ? AND m.lesson_id = ? ORDER BY m.position, m.id',
    spaceId, material.lesson_id,
  );
  await reorder(db, siblings, material.id, direction, 'UPDATE material SET position = ? WHERE id = ? AND space_id = ?', spaceId);
}
