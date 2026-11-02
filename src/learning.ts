// Reading subjects, chapters, lessons and materials inside one space.
//
// Two rules, each kept by every function here:
// - Space: every query names the space_id of every space table it touches, so
//   an id from another space finds nothing (test/guards/space-isolation.test.ts
//   checks every query in src/ for this).
// - Visibility follows assignment, not role (docs/02-LEGO-MODEL.md, rule 6):
//   an admin reads the whole space; a publisher reads the subjects they are
//   responsible for; a learner reads a published subject assigned to them
//   directly or through a group they belong to. Nobody else reads anything.
// - Removed content is never read (release 1.1, AT-8): every statement here
//   that names a chapter, a lesson or a material excludes removed rows of each
//   (removed_at IS NULL), so a removed item, and everything under a removed
//   chapter or lesson, is absent from every reading page and file link
//   (test/guards/removed-content.test.ts checks every statement).
import type { CurrentSpace } from './app-env.ts';
import type { Db } from './db.ts';

export interface SubjectRow {
  id: string;
  title: string;
  publisher_user_id: string | null;
  is_published: number;
}

export interface SubjectItem {
  id: string;
  title: string;
  is_published: number;
}

export interface OutlineChapter {
  id: string;
  title: string;
  lessons: { id: string; title: string }[];
}

export interface LessonRow {
  id: string;
  title: string;
  body_text: string;
  chapter_title: string;
  subject_id: string;
}

export type MaterialKind = 'pdf' | 'image' | 'video_link' | 'link' | 'note';

export interface MaterialRow {
  id: string;
  kind: MaterialKind;
  title: string;
  url: string | null;
  note_text: string | null;
}

export interface FileRow {
  id: string;
  kind: 'pdf' | 'image';
  title: string;
  storage_key: string;
  subject_id: string;
}

/** The learner's home: published subjects assigned to them, directly or
 * through a group of this space. */
export function subjectsForLearner(db: Db, spaceId: string, userId: string): Promise<SubjectItem[]> {
  return db.all<SubjectItem>(
    `SELECT s.id, s.title, s.is_published FROM subject s
      WHERE s.space_id = ? AND s.is_published = 1
        AND EXISTS (
          SELECT 1 FROM subject_access a
           WHERE a.space_id = s.space_id AND a.subject_id = s.id
             AND (a.user_id = ? OR a.group_id IN (
               SELECT gm.group_id FROM group_member gm WHERE gm.space_id = s.space_id AND gm.user_id = ?)))
      ORDER BY s.title, s.id`,
    spaceId, userId, userId,
  );
}

/** The publisher's home: the subjects they are responsible for. */
export function subjectsForPublisher(db: Db, spaceId: string, userId: string): Promise<SubjectItem[]> {
  return db.all<SubjectItem>(
    'SELECT s.id, s.title, s.is_published FROM subject s WHERE s.space_id = ? AND s.publisher_user_id = ? ORDER BY s.title, s.id',
    spaceId, userId,
  );
}

async function assignedToLearner(db: Db, spaceId: string, subjectId: string, userId: string): Promise<boolean> {
  const row = await db.first(
    `SELECT 1 AS one FROM subject_access a
      WHERE a.space_id = ? AND a.subject_id = ?
        AND (a.user_id = ? OR a.group_id IN (
          SELECT gm.group_id FROM group_member gm WHERE gm.space_id = ? AND gm.user_id = ?))`,
    spaceId, subjectId, userId, spaceId, userId,
  );
  return row !== null;
}

/** The subject, when this person may read it in this space; otherwise null
 * (whether it does not exist, is in another space, or is not theirs). */
export async function readableSubject(db: Db, space: CurrentSpace, userId: string, subjectId: string): Promise<SubjectRow | null> {
  const subject = await db.first<SubjectRow>(
    'SELECT s.id, s.title, s.publisher_user_id, s.is_published FROM subject s WHERE s.id = ? AND s.space_id = ?',
    subjectId, space.id,
  );
  if (!subject) return null;
  if (space.roles.includes('admin')) return subject;
  if (space.roles.includes('publisher') && subject.publisher_user_id === userId) return subject;
  if (space.roles.includes('learner') && subject.is_published === 1 && (await assignedToLearner(db, space.id, subject.id, userId))) {
    return subject;
  }
  return null;
}

/** Chapters in order, each with its lessons in order. */
export async function outline(db: Db, spaceId: string, subjectId: string): Promise<OutlineChapter[]> {
  const rows = await db.all<{ chapter_id: string; chapter_title: string; lesson_id: string | null; lesson_title: string | null }>(
    `SELECT c.id AS chapter_id, c.title AS chapter_title, l.id AS lesson_id, l.title AS lesson_title
       FROM chapter c LEFT JOIN lesson l ON l.chapter_id = c.id AND l.space_id = c.space_id AND l.removed_at IS NULL
      WHERE c.space_id = ? AND c.subject_id = ? AND c.removed_at IS NULL
      ORDER BY c.position, c.id, l.position, l.id`,
    spaceId, subjectId,
  );
  const chapters: OutlineChapter[] = [];
  for (const r of rows) {
    let ch = chapters.at(-1);
    if (!ch || ch.id !== r.chapter_id) chapters.push((ch = { id: r.chapter_id, title: r.chapter_title, lessons: [] }));
    if (r.lesson_id) ch.lessons.push({ id: r.lesson_id, title: r.lesson_title ?? '' });
  }
  return chapters;
}

export function findLesson(db: Db, spaceId: string, lessonId: string): Promise<LessonRow | null> {
  return db.first<LessonRow>(
    `SELECT l.id, l.title, l.body_text, c.title AS chapter_title, c.subject_id
       FROM lesson l JOIN chapter c ON c.id = l.chapter_id AND c.space_id = l.space_id AND c.removed_at IS NULL
      WHERE l.id = ? AND l.space_id = ? AND l.removed_at IS NULL`,
    lessonId, spaceId,
  );
}

/** A lesson's materials in order. */
export function lessonMaterials(db: Db, spaceId: string, lessonId: string): Promise<MaterialRow[]> {
  return db.all<MaterialRow>(
    'SELECT m.id, m.kind, m.title, m.url, m.note_text FROM material m WHERE m.space_id = ? AND m.lesson_id = ? AND m.removed_at IS NULL ORDER BY m.position, m.id',
    spaceId, lessonId,
  );
}

/** A stored file (PDF or image) with the subject it belongs to. */
export function findFile(db: Db, spaceId: string, materialId: string): Promise<FileRow | null> {
  return db.first<FileRow>(
    `SELECT m.id, m.kind, m.title, m.storage_key, c.subject_id
       FROM material m
       JOIN lesson l ON l.id = m.lesson_id AND l.space_id = m.space_id AND l.removed_at IS NULL
       JOIN chapter c ON c.id = l.chapter_id AND c.space_id = l.space_id AND c.removed_at IS NULL
      WHERE m.id = ? AND m.space_id = ? AND m.removed_at IS NULL AND m.kind IN ('pdf', 'image') AND m.storage_key IS NOT NULL`,
    materialId, spaceId,
  );
}
