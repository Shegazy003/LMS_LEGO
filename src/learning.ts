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
  /** LMS wave 4 (section 6.1): 1 when the subject opens its chapters in order; read with the row every page already reads. */
  chapters_in_order: number;
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
  chapter_id: string;
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
  /** LMS wave 4 (section 5.4): the lesson the file belongs to, from the same read, so a locked lesson's files are refused. */
  lesson_id: string;
}

/** The learner’s home: published subjects assigned to them, directly or
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

/** One card of the learner home (LMS wave 1, contract section 4): a subject
 * with its publisher’s display name (never the username; null without a
 * publisher), how many lessons it has (not removed, in a chapter that is not
 * removed) and the first of them in the outline’s order (section 5.1). Built
 * from the outline only: nothing about the learner is read. */
export interface LearnerCard {
  id: string;
  title: string;
  publisherName: string | null;
  count: number;
  first: { id: string; title: string } | null;
  /** The subject's reading sequence (wave 1, section 5.1), from the same read: LMS wave 2 (W2-2) works out "Continue" from it. */
  steps: SequenceStep[];
  /** LMS wave 4 (section 5.4): the subject opens its chapters in order, from the same read. */
  inOrder: boolean;
}

/** The learner home’s cards in one read, whatever the number of subjects
 * (section 4.5): exactly the subjects of subjectsForLearner, in its order. */
export async function learnerCards(db: Db, spaceId: string, userId: string): Promise<LearnerCard[]> {
  const rows = await db.all<CardRow>(
    `SELECT s.id AS subject_id, s.title AS subject_title, s.chapters_in_order AS in_order, u.display_name AS publisher_name, c.id AS chapter_id, c.title AS chapter_title, l.id AS lesson_id, l.title AS lesson_title
       FROM subject s
       LEFT JOIN user u ON u.id = s.publisher_user_id
       LEFT JOIN chapter c ON c.subject_id = s.id AND c.space_id = s.space_id AND c.removed_at IS NULL
       LEFT JOIN lesson l ON l.chapter_id = c.id AND l.space_id = s.space_id AND l.removed_at IS NULL
      WHERE s.space_id = ? AND s.is_published = 1
        AND EXISTS (
          SELECT 1 FROM subject_access a
           WHERE a.space_id = s.space_id AND a.subject_id = s.id
             AND (a.user_id = ? OR a.group_id IN (
               SELECT gm.group_id FROM group_member gm WHERE gm.space_id = s.space_id AND gm.user_id = ?)))
      ORDER BY s.title, s.id, c.position, c.title, c.id, l.position, l.title, l.id`,
    spaceId, userId, userId,
  );
  return cardsOf(rows);
}

type CardRow = {
  subject_id: string; subject_title: string; in_order: number; publisher_name: string | null;
  chapter_id: string | null; chapter_title: string | null; lesson_id: string | null; lesson_title: string | null;
};

/** Who a preview is drawn for (LMS wave 3a, contract section 4.1): the admin
 * previews every subject of the space, a publisher (and not admin) the
 * subjects they publish. Being also a learner changes nothing. */
export interface Previewer {
  kind: 'admin' | 'publisher';
  userId: string;
}

/** The preview home's cards (wave 3a, section 5): the cards a made-up learner
 * assigned every published subject of the space (admin), or every published
 * subject this publisher publishes, would see. One read, in the learner home's
 * order and with its counting, whatever the number of subjects (AT-5.4). */
export async function previewCards(db: Db, spaceId: string, previewer: Previewer): Promise<LearnerCard[]> {
  const rows = previewer.kind === 'admin'
    ? await db.all<CardRow>(
      `SELECT s.id AS subject_id, s.title AS subject_title, s.chapters_in_order AS in_order, u.display_name AS publisher_name, c.id AS chapter_id, c.title AS chapter_title, l.id AS lesson_id, l.title AS lesson_title
         FROM subject s
         LEFT JOIN user u ON u.id = s.publisher_user_id
         LEFT JOIN chapter c ON c.subject_id = s.id AND c.space_id = s.space_id AND c.removed_at IS NULL
         LEFT JOIN lesson l ON l.chapter_id = c.id AND l.space_id = s.space_id AND l.removed_at IS NULL
        WHERE s.space_id = ? AND s.is_published = 1
        ORDER BY s.title, s.id, c.position, c.title, c.id, l.position, l.title, l.id`,
      spaceId,
    )
    : await db.all<CardRow>(
      `SELECT s.id AS subject_id, s.title AS subject_title, s.chapters_in_order AS in_order, u.display_name AS publisher_name, c.id AS chapter_id, c.title AS chapter_title, l.id AS lesson_id, l.title AS lesson_title
         FROM subject s
         LEFT JOIN user u ON u.id = s.publisher_user_id
         LEFT JOIN chapter c ON c.subject_id = s.id AND c.space_id = s.space_id AND c.removed_at IS NULL
         LEFT JOIN lesson l ON l.chapter_id = c.id AND l.space_id = s.space_id AND l.removed_at IS NULL
        WHERE s.space_id = ? AND s.is_published = 1 AND s.publisher_user_id = ?
        ORDER BY s.title, s.id, c.position, c.title, c.id, l.position, l.title, l.id`,
      spaceId, previewer.userId,
    );
  return cardsOf(rows);
}

/** A subject this person may preview (section 4.1), published or not; null otherwise. */
export async function previewableSubject(db: Db, spaceId: string, previewer: Previewer, subjectId: string): Promise<SubjectRow | null> {
  const subject = await db.first<SubjectRow>(
    'SELECT s.id, s.title, s.publisher_user_id, s.is_published, s.chapters_in_order FROM subject s WHERE s.id = ? AND s.space_id = ?',
    subjectId, spaceId,
  );
  if (!subject) return null;
  return previewer.kind === 'admin' || subject.publisher_user_id === previewer.userId ? subject : null;
}

function cardsOf(rows: CardRow[]): LearnerCard[] {
  const cards: LearnerCard[] = [];
  for (const r of rows) {
    let card = cards.at(-1);
    if (!card || card.id !== r.subject_id) {
      cards.push((card = { id: r.subject_id, title: r.subject_title, publisherName: r.publisher_name, count: 0, first: null, steps: [], inOrder: r.in_order === 1 }));
    }
    if (!r.lesson_id) continue;
    card.count++;
    card.first ??= { id: r.lesson_id, title: r.lesson_title ?? '' };
    card.steps.push({ id: r.lesson_id, title: r.lesson_title ?? '', chapterId: r.chapter_id ?? '', chapterTitle: r.chapter_title ?? '' });
  }
  return cards;
}

/** A card's progress (LMS wave 2, W2-2, section 8.3): how many of its lessons
 * the learner marked done, and where "Continue" leads (null when all are done). */
export interface CardProgress {
  done: number;
  target: SequenceStep | null;
}

/** The home's "Continue where you stopped" area (section 8.3). */
export type ContinueArea =
  | { kind: 'first' }
  | { kind: 'all-done' }
  | { kind: 'target'; card: LearnerCard; done: number; target: SequenceStep };

/** Where the learner continues (section 8.2), from their own marks only: `order`
 * holds the lesson ids they marked done, newest first, lessons marked at the same
 * time together (progress.ts markOrder). A mark counts only on a lesson of a card
 * (published, assigned, not removed: section 6.3). Nothing else enters the rule:
 * no lesson open, no activity setting, no notice. Pure, so no read is added. */
export function continueWhere(cards: LearnerCard[], order: string[][]): { area: ContinueArea; progress: Map<string, CardProgress> } {
  const progress = new Map<string, CardProgress>();
  const started: { card: LearnerCard; newest: number; p: CardProgress }[] = [];
  const marked = new Set(order.flat());
  for (const card of cards) {
    const pos = new Map(card.steps.map((s, i) => [s.id, i]));
    const done = new Set(card.steps.filter((s) => marked.has(s.id)).map((s) => s.id));
    if (done.size === 0) continue;
    // Its newest marked lesson: the latest press; equal times go to the later lesson in reading order.
    const group = order.findIndex((g) => g.some((id) => pos.has(id)));
    const at = Math.max(...order[group].filter((id) => pos.has(id)).map((id) => pos.get(id)!));
    // The first lesson not done after it; if none, the first not-done lesson from the start.
    let target = card.steps.slice(at + 1).find((s) => !done.has(s.id)) ?? card.steps.find((s) => !done.has(s.id)) ?? null;
    // LMS wave 4 (section 5.4, A9): in a subject opened in order, a target in a locked chapter gives way to the
    // first not-done lesson in reading order, which is always open. With the setting off, wave 2's target.
    if (card.inOrder && target && chapterLocks(chaptersOfSteps(card.steps), done).locked.has(target.chapterId)) target = card.steps.find((s) => !done.has(s.id)) ?? null;
    const p = { done: done.size, target };
    progress.set(card.id, p);
    started.push({ card, newest: group, p });
  }
  if (started.length === 0) return { area: { kind: 'first' }, progress };
  // Subjects by their newest mark, newest first; equal times keep the home's order (a stable sort).
  started.sort((a, b) => a.newest - b.newest);
  const first = started.find((s) => s.p.target);
  return {
    area: first ? { kind: 'target', card: first.card, done: first.p.done, target: first.p.target! } : { kind: 'all-done' },
    progress,
  };
}

/** One lesson in a subject’s reading order, with its chapter. */
export interface SequenceStep {
  id: string;
  title: string;
  chapterId: string;
  chapterTitle: string;
}

/** A subject’s sequence (section 5.1): its lessons by chapter order, then
 * lesson order, from the outline (which already skips removed chapters and
 * lessons); a chapter without lessons adds nothing, so the last lesson of a
 * chapter leads to the first lesson of the next chapter that has one. */
export function lessonSequence(chapters: OutlineChapter[]): SequenceStep[] {
  return chapters.flatMap((ch) => ch.lessons.map((l) => ({ id: l.id, title: l.title, chapterId: ch.id, chapterTitle: ch.title })));
}

// ------------------------------------------------------ chapters in order ----
// LMS wave 4 (product-contract v2 on PIL-238, section 5). One rule, worked out
// at every page load from the current outline and the learner's current marks;
// nothing about a lock is stored, so every change (a mark, an undo, a lesson
// added, removed, restored or moved, a chapter moved, the setting switched)
// applies at the next load. Only for a subject whose setting is on, read by a
// person reading it as a learner (progress.ts readsAsLearner), or by the
// made-up learner of a preview (no marks).

/** Why a chapter is locked (section 5.4): the first locked chapter names the
 * blocking chapter and how many of its shown lessons are not done; every later
 * one counts the not-done shown lessons of all chapters before it. */
export type LockReason =
  | { kind: 'first'; blocking: { id: string; title: string }; left: number }
  | { kind: 'later'; left: number };

export interface ChapterLocks {
  /** The locked chapters, by id, each with its reason. A chapter not here is open. */
  locked: Map<string, LockReason>;
  /** The earliest chapter with a not-done shown lesson (it is open), or null when every lesson is done. */
  blocking: string | null;
  /** The first not-done lesson in reading order while any chapter is locked ("Go to"); null otherwise. */
  goTo: { id: string; title: string } | null;
}

/** The lock rule (section 5.2): a chapter is open when every shown lesson of
 * every earlier chapter carries this learner's done mark; otherwise locked.
 * The first argument holds the shown chapters in reading order with their shown lessons
 * (the outline already leaves out removed ones, so a mark on a removed lesson
 * counts for nothing); `done` holds the learner's marked lesson ids. A chapter
 * with no shown lesson is done by definition and is never shown locked. Marks
 * inside a locked chapter are kept and counted but open nothing before the
 * chapters before it are done. Pure: no read. */
export function chapterLocks(chapters: { id: string; title: string; lessons: { id: string; title: string }[] }[], done: Set<string>): ChapterLocks {
  const locked = new Map<string, LockReason>();
  let blocking: { id: string; title: string; left: number } | null = null;
  let goTo: { id: string; title: string } | null = null;
  let leftBefore = 0;
  for (const ch of chapters) {
    const notDone = ch.lessons.filter((l) => !done.has(l.id));
    if (leftBefore > 0 && ch.lessons.length > 0) {
      locked.set(ch.id, locked.size === 0 ? { kind: 'first', blocking: { id: blocking!.id, title: blocking!.title }, left: blocking!.left } : { kind: 'later', left: leftBefore });
    }
    if (!blocking && notDone.length > 0) {
      blocking = { id: ch.id, title: ch.title, left: notDone.length };
      goTo = notDone[0];
    }
    leftBefore += notDone.length;
  }
  return { locked, blocking: blocking?.id ?? null, goTo: locked.size ? goTo : null };
}

/** The chapters of a reading sequence (a home card's steps), in order: enough for the lock rule, since a chapter without lessons never locks or blocks. */
function chaptersOfSteps(steps: SequenceStep[]): { id: string; title: string; lessons: { id: string; title: string }[] }[] {
  const out: { id: string; title: string; lessons: { id: string; title: string }[] }[] = [];
  for (const s of steps) {
    let ch = out.at(-1);
    if (!ch || ch.id !== s.chapterId) out.push((ch = { id: s.chapterId, title: s.chapterTitle, lessons: [] }));
    ch.lessons.push({ id: s.id, title: s.title });
  }
  return out;
}

/** The publisher’s home: the subjects they are responsible for. */
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
    'SELECT s.id, s.title, s.publisher_user_id, s.is_published, s.chapters_in_order FROM subject s WHERE s.id = ? AND s.space_id = ?',
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

/** Chapters in order, each with its lessons in order. A tie in position
 * (if any) is settled by title, then id, so the order is stable (wave 1,
 * section 5.1; the learner home uses the same order). */
export async function outline(db: Db, spaceId: string, subjectId: string): Promise<OutlineChapter[]> {
  const rows = await db.all<{ chapter_id: string; chapter_title: string; lesson_id: string | null; lesson_title: string | null }>(
    `SELECT c.id AS chapter_id, c.title AS chapter_title, l.id AS lesson_id, l.title AS lesson_title
       FROM chapter c LEFT JOIN lesson l ON l.chapter_id = c.id AND l.space_id = c.space_id AND l.removed_at IS NULL
      WHERE c.space_id = ? AND c.subject_id = ? AND c.removed_at IS NULL
      ORDER BY c.position, c.title, c.id, l.position, l.title, l.id`,
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
    `SELECT l.id, l.title, l.body_text, l.chapter_id, c.title AS chapter_title, c.subject_id
       FROM lesson l JOIN chapter c ON c.id = l.chapter_id AND c.space_id = l.space_id AND c.removed_at IS NULL
      WHERE l.id = ? AND l.space_id = ? AND l.removed_at IS NULL`,
    lessonId, spaceId,
  );
}

/** A lesson’s materials in order. */
export function lessonMaterials(db: Db, spaceId: string, lessonId: string): Promise<MaterialRow[]> {
  return db.all<MaterialRow>(
    'SELECT m.id, m.kind, m.title, m.url, m.note_text FROM material m WHERE m.space_id = ? AND m.lesson_id = ? AND m.removed_at IS NULL ORDER BY m.position, m.id',
    spaceId, lessonId,
  );
}

/** A stored file (PDF or image) with the subject it belongs to. */
export function findFile(db: Db, spaceId: string, materialId: string): Promise<FileRow | null> {
  return db.first<FileRow>(
    `SELECT m.id, m.kind, m.title, m.storage_key, c.subject_id, l.id AS lesson_id
       FROM material m
       JOIN lesson l ON l.id = m.lesson_id AND l.space_id = m.space_id AND l.removed_at IS NULL
       JOIN chapter c ON c.id = l.chapter_id AND c.space_id = l.space_id AND c.removed_at IS NULL
      WHERE m.id = ? AND m.space_id = ? AND m.removed_at IS NULL AND m.kind IN ('pdf', 'image') AND m.storage_key IS NOT NULL`,
    materialId, spaceId,
  );
}
