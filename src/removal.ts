// Removing and restoring a chapter, a lesson or a material (release 1.1, AT-8).
//
// A removal is a soft removal: one statement sets removed_at on the item's
// own row (migrations/0006_content_removed.sql). Nothing else changes: the
// row, its position, its children and its file stay exactly as they were, so
// it cannot be left half removed, and "Restore" (one statement setting
// removed_at back to NULL) puts it back in its old place with the same file.
// Nothing is ever deleted from the database or from storage here.
//
// Rules kept by every statement:
// - Space and ownership, as in src/publishing.ts: every statement names the
//   space_id of every space table it touches, and repeats the check that the
//   publisher is responsible for the subject, inside the statement itself.
// - A lesson that still shows a material, or a chapter that still shows a
//   lesson, is not removed: the check is inside the same statement, so a
//   material restored at the same moment cannot slip under a removed lesson.
// - Only an item that shows can be removed, and only an item whose chapter
//   (and lesson) shows can be restored: restoring never brings something back
//   inside a removed item.
//
// Reading pages never show removed rows (src/learning.ts); the lookups at the
// end of this file only tell a reading page that an address it cannot find
// was removed, so it can answer "not found" (404) instead of "no access".
import type { Db } from './db.ts';
import type { MaterialKind } from './learning.ts';

// --------------------------------------------------------------- removing ----

export async function removeMaterial(db: Db, spaceId: string, userId: string, materialId: string, at: number): Promise<boolean> {
  const changed = await db.run(
    `UPDATE material SET removed_at = ?
      WHERE id = ? AND space_id = ? AND removed_at IS NULL
        AND EXISTS (SELECT 1 FROM lesson l
                      JOIN chapter c ON c.id = l.chapter_id AND c.space_id = l.space_id
                      JOIN subject s ON s.id = c.subject_id AND s.space_id = c.space_id
                     WHERE l.id = material.lesson_id AND l.space_id = material.space_id
                       AND l.removed_at IS NULL AND c.removed_at IS NULL AND s.publisher_user_id = ?)`,
    at, materialId, spaceId, userId,
  );
  return changed === 1;
}

export async function removeLesson(db: Db, spaceId: string, userId: string, lessonId: string, at: number): Promise<boolean> {
  const changed = await db.run(
    `UPDATE lesson SET removed_at = ?
      WHERE id = ? AND space_id = ? AND removed_at IS NULL
        AND EXISTS (SELECT 1 FROM chapter c JOIN subject s ON s.id = c.subject_id AND s.space_id = c.space_id
                     WHERE c.id = lesson.chapter_id AND c.space_id = lesson.space_id AND c.removed_at IS NULL AND s.publisher_user_id = ?)
        AND NOT EXISTS (SELECT 1 FROM material m WHERE m.space_id = lesson.space_id AND m.lesson_id = lesson.id AND m.removed_at IS NULL)`,
    at, lessonId, spaceId, userId,
  );
  return changed === 1;
}

export async function removeChapter(db: Db, spaceId: string, userId: string, chapterId: string, at: number): Promise<boolean> {
  const changed = await db.run(
    `UPDATE chapter SET removed_at = ?
      WHERE id = ? AND space_id = ? AND removed_at IS NULL
        AND EXISTS (SELECT 1 FROM subject s WHERE s.id = chapter.subject_id AND s.space_id = chapter.space_id AND s.publisher_user_id = ?)
        AND NOT EXISTS (SELECT 1 FROM lesson l WHERE l.space_id = chapter.space_id AND l.chapter_id = chapter.id AND l.removed_at IS NULL)`,
    at, chapterId, spaceId, userId,
  );
  return changed === 1;
}

// -------------------------------------------------------------- restoring ----
// `at` is not needed to restore; it keeps one shape for every change.

export async function restoreMaterial(db: Db, spaceId: string, userId: string, materialId: string, _at: number): Promise<boolean> {
  const changed = await db.run(
    `UPDATE material SET removed_at = NULL
      WHERE id = ? AND space_id = ? AND removed_at IS NOT NULL
        AND EXISTS (SELECT 1 FROM lesson l
                      JOIN chapter c ON c.id = l.chapter_id AND c.space_id = l.space_id
                      JOIN subject s ON s.id = c.subject_id AND s.space_id = c.space_id
                     WHERE l.id = material.lesson_id AND l.space_id = material.space_id
                       AND l.removed_at IS NULL AND c.removed_at IS NULL AND s.publisher_user_id = ?)`,
    materialId, spaceId, userId,
  );
  return changed === 1;
}

export async function restoreLesson(db: Db, spaceId: string, userId: string, lessonId: string, _at: number): Promise<boolean> {
  const changed = await db.run(
    `UPDATE lesson SET removed_at = NULL
      WHERE id = ? AND space_id = ? AND removed_at IS NOT NULL
        AND EXISTS (SELECT 1 FROM chapter c JOIN subject s ON s.id = c.subject_id AND s.space_id = c.space_id
                     WHERE c.id = lesson.chapter_id AND c.space_id = lesson.space_id AND c.removed_at IS NULL AND s.publisher_user_id = ?)`,
    lessonId, spaceId, userId,
  );
  return changed === 1;
}

export async function restoreChapter(db: Db, spaceId: string, userId: string, chapterId: string, _at: number): Promise<boolean> {
  const changed = await db.run(
    `UPDATE chapter SET removed_at = NULL
      WHERE id = ? AND space_id = ? AND removed_at IS NOT NULL
        AND EXISTS (SELECT 1 FROM subject s WHERE s.id = chapter.subject_id AND s.space_id = chapter.space_id AND s.publisher_user_id = ?)`,
    chapterId, spaceId, userId,
  );
  return changed === 1;
}

// ------------------------------------------------- the publisher's lookups ----
export type ContentKind = 'chapter' | 'lesson' | 'material';

/** One of the publisher's own items, removed or not, with what holds it. */
export interface OwnedItem {
  kind: ContentKind;
  id: string;
  title: string;
  subject_id: string;
  /** The lesson (for a material) or chapter (for a lesson) that holds it; null for a chapter. */
  parent_id: string | null;
  parent_title: string | null;
  removed: boolean;
  /** Whether what holds it (its lesson or chapter) is removed. */
  parent_removed: boolean;
}

interface OwnedRow {
  id: string;
  title: string;
  subject_id: string;
  parent_id: string | null;
  parent_title: string | null;
  removed_at: number | null;
  parent_removed: number;
}

const owned = (kind: ContentKind, r: OwnedRow | null): OwnedItem | null =>
  r && { kind, id: r.id, title: r.title, subject_id: r.subject_id, parent_id: r.parent_id, parent_title: r.parent_title, removed: r.removed_at !== null, parent_removed: Number(r.parent_removed) === 1 };

/** An item of a subject this publisher is responsible for, in this space, whether it shows or is removed; otherwise null. */
export async function ownedItem(db: Db, spaceId: string, userId: string, kind: ContentKind, id: string): Promise<OwnedItem | null> {
  if (kind === 'chapter') {
    return owned(kind, await db.first<OwnedRow>(
      `SELECT c.id, c.title, c.subject_id, NULL AS parent_id, NULL AS parent_title, c.removed_at, 0 AS parent_removed
         FROM chapter c JOIN subject s ON s.id = c.subject_id AND s.space_id = c.space_id
        WHERE c.id = ? AND c.space_id = ? AND s.publisher_user_id = ?`,
      id, spaceId, userId,
    ));
  }
  if (kind === 'lesson') {
    return owned(kind, await db.first<OwnedRow>(
      `SELECT l.id, l.title, c.subject_id, c.id AS parent_id, c.title AS parent_title, l.removed_at,
              (c.removed_at IS NOT NULL) AS parent_removed
         FROM lesson l
         JOIN chapter c ON c.id = l.chapter_id AND c.space_id = l.space_id
         JOIN subject s ON s.id = c.subject_id AND s.space_id = c.space_id
        WHERE l.id = ? AND l.space_id = ? AND s.publisher_user_id = ?`,
      id, spaceId, userId,
    ));
  }
  return owned(kind, await db.first<OwnedRow>(
    `SELECT m.id, m.title, c.subject_id, l.id AS parent_id, l.title AS parent_title, m.removed_at,
            (l.removed_at IS NOT NULL OR c.removed_at IS NOT NULL) AS parent_removed
       FROM material m
       JOIN lesson l ON l.id = m.lesson_id AND l.space_id = m.space_id
       JOIN chapter c ON c.id = l.chapter_id AND c.space_id = l.space_id
       JOIN subject s ON s.id = c.subject_id AND s.space_id = c.space_id
      WHERE m.id = ? AND m.space_id = ? AND s.publisher_user_id = ?`,
    id, spaceId, userId,
  ));
}

/** The titles of what still shows inside a lesson (its materials) or a chapter (its lessons), in order. */
export async function stillShowing(db: Db, spaceId: string, kind: 'chapter' | 'lesson', id: string): Promise<string[]> {
  const rows = kind === 'lesson'
    ? await db.all<{ title: string }>(
      'SELECT m.title FROM material m WHERE m.space_id = ? AND m.lesson_id = ? AND m.removed_at IS NULL ORDER BY m.position, m.id',
      spaceId, id,
    )
    : await db.all<{ title: string }>(
      'SELECT l.title FROM lesson l WHERE l.space_id = ? AND l.chapter_id = ? AND l.removed_at IS NULL ORDER BY l.position, l.id',
      spaceId, id,
    );
  return rows.map((r) => r.title);
}

/** One entry of "Recently removed". */
export interface RemovedItem {
  kind: ContentKind;
  id: string;
  title: string;
  removed_at: number;
  material_kind: MaterialKind | null;
  /** Where it sat: its chapter (a lesson) or its lesson (a material); null for a chapter. */
  parent_title: string | null;
  /** The removed item that holds it, which must be restored first; null when its place shows. */
  blocked_by: string | null;
}

/** Everything removed in one subject, most recent first. The caller has checked the subject is this publisher's. */
export async function recentlyRemoved(db: Db, spaceId: string, subjectId: string): Promise<RemovedItem[]> {
  const chapters = await db.all<{ id: string; title: string; removed_at: number }>(
    `SELECT c.id, c.title, c.removed_at FROM chapter c
      WHERE c.space_id = ? AND c.subject_id = ? AND c.removed_at IS NOT NULL`,
    spaceId, subjectId,
  );
  const lessons = await db.all<{ id: string; title: string; removed_at: number; chapter_title: string; chapter_removed: number | null }>(
    `SELECT l.id, l.title, l.removed_at, c.title AS chapter_title, c.removed_at AS chapter_removed FROM lesson l
       JOIN chapter c ON c.id = l.chapter_id AND c.space_id = l.space_id
      WHERE l.space_id = ? AND c.subject_id = ? AND l.removed_at IS NOT NULL`,
    spaceId, subjectId,
  );
  const materials = await db.all<{
    id: string; title: string; kind: MaterialKind; removed_at: number;
    lesson_title: string; lesson_removed: number | null; chapter_title: string; chapter_removed: number | null;
  }>(
    `SELECT m.id, m.title, m.kind, m.removed_at, l.title AS lesson_title, l.removed_at AS lesson_removed,
            c.title AS chapter_title, c.removed_at AS chapter_removed
       FROM material m
       JOIN lesson l ON l.id = m.lesson_id AND l.space_id = m.space_id
       JOIN chapter c ON c.id = l.chapter_id AND c.space_id = l.space_id
      WHERE m.space_id = ? AND c.subject_id = ? AND m.removed_at IS NOT NULL`,
    spaceId, subjectId,
  );
  const items: RemovedItem[] = [
    ...chapters.map((r) => ({ kind: 'chapter' as const, id: r.id, title: r.title, removed_at: Number(r.removed_at), material_kind: null, parent_title: null, blocked_by: null })),
    ...lessons.map((r) => ({
      kind: 'lesson' as const, id: r.id, title: r.title, removed_at: Number(r.removed_at), material_kind: null,
      parent_title: r.chapter_title, blocked_by: r.chapter_removed !== null ? r.chapter_title : null,
    })),
    ...materials.map((r) => ({
      kind: 'material' as const, id: r.id, title: r.title, removed_at: Number(r.removed_at), material_kind: r.kind,
      parent_title: r.lesson_title,
      blocked_by: r.chapter_removed !== null ? r.chapter_title : r.lesson_removed !== null ? r.lesson_title : null,
    })),
  ];
  return items.sort((a, b) => b.removed_at - a.removed_at || a.title.localeCompare(b.title));
}

// ------------------------------------------------ for the reading pages ----
// Whether an address a reading page could not find belongs to something that
// was removed (the item itself, or the lesson or chapter holding it): its
// subject's id, so the page can answer "not found" to someone who may read
// that subject. Null otherwise (never existed, another space): the page then
// answers its usual "no access".

export async function removedLessonSubject(db: Db, spaceId: string, lessonId: string): Promise<string | null> {
  const row = await db.first<{ subject_id: string }>(
    `SELECT c.subject_id FROM lesson l JOIN chapter c ON c.id = l.chapter_id AND c.space_id = l.space_id
      WHERE l.id = ? AND l.space_id = ? AND (l.removed_at IS NOT NULL OR c.removed_at IS NOT NULL)`,
    lessonId, spaceId,
  );
  return row?.subject_id ?? null;
}

export async function removedMaterialSubject(db: Db, spaceId: string, materialId: string): Promise<string | null> {
  const row = await db.first<{ subject_id: string }>(
    `SELECT c.subject_id FROM material m
       JOIN lesson l ON l.id = m.lesson_id AND l.space_id = m.space_id
       JOIN chapter c ON c.id = l.chapter_id AND c.space_id = l.space_id
      WHERE m.id = ? AND m.space_id = ? AND (m.removed_at IS NOT NULL OR l.removed_at IS NOT NULL OR c.removed_at IS NOT NULL)`,
    materialId, spaceId,
  );
  return row?.subject_id ?? null;
}
