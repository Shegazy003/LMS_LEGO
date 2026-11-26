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
  lessons: { id: string; title: string; due_on?: string | null }[];
  /** LMS wave 6 (section 5.5): the due date of the chapter (null without one), from the same outline read; each lesson carries its own. */
  due_on?: string | null;
  /** LMS wave 8 (section 3.1, D2): the opening date (null without one) and the before-opening choice (1 hidden, 0 shown locked), from the same outline read. */
  opens_on?: string | null;
  opens_hidden?: number;
}

export interface LessonRow {
  id: string;
  title: string;
  body_text: string;
  chapter_id: string;
  chapter_title: string;
  subject_id: string;
  /** LMS wave 8 (section 3.3): the opening date and choice of its chapter, from the same read. */
  opens_on?: string | null;
  opens_hidden?: number;
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
  /** LMS wave 8 (section 3.3): the opening date and choice of its chapter, from the same read. */
  opens_on?: string | null;
  opens_hidden?: number;
}

/** The learner rule (LMS wave 7, W7-3; contract v3 addendum on PIL-285, G4.4),
 * the one SQL condition that decides which subjects a person reads as a
 * learner: subject `s` is published and assigned to them, directly or through a
 * group of the subject's space. It binds the person's id twice. Shared by
 * subjectsForLearner (its SQL text unchanged) and quizScoresOfLinked
 * (src/quiz.ts); it is scoped by s.space_id itself. */
export const LEARNER_RULE = 's.is_published = 1\n        AND EXISTS (\n          SELECT 1 FROM subject_access a\n           WHERE a.space_id = s.space_id AND a.subject_id = s.id\n             AND (a.user_id = ? OR a.group_id IN (\n               SELECT gm.group_id FROM group_member gm WHERE gm.space_id = s.space_id AND gm.user_id = ?)))';

/** The SQL text of subjectsForLearner, byte for byte as on W7-2-main (AT-7.5 compares them). */
export const SUBJECTS_FOR_LEARNER_SQL = 'SELECT s.id, s.title, s.is_published FROM subject s\n      WHERE s.space_id = ? AND ' + LEARNER_RULE + '\n      ORDER BY s.title, s.id';

/** The learner’s home: published subjects assigned to them, directly or
 * through a group of this space. */
export function subjectsForLearner(db: Db, spaceId: string, userId: string): Promise<SubjectItem[]> {
  return db.all<SubjectItem>(SUBJECTS_FOR_LEARNER_SQL, spaceId, userId, userId);
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
  /** LMS wave 8 (section 3.3): the chapters of the steps not open yet today (shown locked), by id, with their date; a hidden one is in no step. */
  opening: Map<string, string>;
  /** LMS wave 8 (L2): for a learner with no marks here, the chapter they wait for when no lesson of the card is open yet; null otherwise. */
  next: WaitingFor | null;
}

/** LMS wave 8 (L2): the first chapter not open yet that holds what is left to do, with its date. */
export interface WaitingFor {
  title: string;
  date: string;
}

/** The learner home’s cards in one read, whatever the number of subjects
 * (section 4.5): exactly the subjects of subjectsForLearner, in its order. */
export async function learnerCards(db: Db, spaceId: string, userId: string, today: string): Promise<LearnerCard[]> {
  const rows = await db.all<CardRow>(
    `SELECT s.id AS subject_id, s.title AS subject_title, s.chapters_in_order AS in_order, u.display_name AS publisher_name, c.id AS chapter_id, c.title AS chapter_title, c.opens_on, c.opens_hidden, l.id AS lesson_id, l.title AS lesson_title
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
  return cardsOf(rows, today);
}

/** An item of the home's announcement block (LMS wave 5, section 5.3). */
export interface HomeAnnouncement {
  id: string;
  subject_id: string;
  subject_title: string;
  body: string;
  author_role: 'publisher' | 'admin';
  created_at: string;
  edited_at: string | null;
}

/** LMS wave 5 (product-contract v2 on PIL-246, section 5.1, "one rule, one
 * place"): the newest announcements (posted at or after `since`, not removed)
 * of the subjects on this learner's cards, in one statement with a fixed
 * number of bound parameters (no list of subject ids). Its subject rule is
 * learnerCards' rule, written out whole (the space guard reads every statement
 * as written): published, and assigned directly or through a group of this
 * space; test/wave5/at2.test.ts (AT-2.3) asserts the two rules are the same
 * text, and that every subject this block shows is one of the cards'. */
export function learnerAnnouncements(db: Db, spaceId: string, userId: string, since: string, limit: number): Promise<HomeAnnouncement[]> {
  return db.all<HomeAnnouncement>(
    `SELECT n.id, n.subject_id, s.title AS subject_title, n.body, n.author_role, n.created_at, n.edited_at
       FROM announcement n
       JOIN subject s ON s.id = n.subject_id AND s.space_id = n.space_id
      WHERE n.space_id = ? AND n.removed_at IS NULL AND n.created_at >= ?
        AND s.space_id = n.space_id AND s.is_published = 1
        AND EXISTS (
          SELECT 1 FROM subject_access a
           WHERE a.space_id = s.space_id AND a.subject_id = s.id
             AND (a.user_id = ? OR a.group_id IN (
               SELECT gm.group_id FROM group_member gm WHERE gm.space_id = s.space_id AND gm.user_id = ?)))
      ORDER BY n.created_at DESC, n.id DESC LIMIT ?`,
    spaceId, since, userId, userId, limit,
  );
}

/** LMS wave 5 (section 5.4): the preview home's announcements, from the
 * subjects of previewCards (every published subject for an admin; the
 * published subjects a publisher is responsible for), on the rules of the home. */
export function previewAnnouncements(db: Db, spaceId: string, previewer: Previewer, since: string, limit: number): Promise<HomeAnnouncement[]> {
  return previewer.kind === 'admin'
    ? db.all<HomeAnnouncement>(
      `SELECT n.id, n.subject_id, s.title AS subject_title, n.body, n.author_role, n.created_at, n.edited_at
         FROM announcement n
         JOIN subject s ON s.id = n.subject_id AND s.space_id = n.space_id
        WHERE n.space_id = ? AND n.removed_at IS NULL AND n.created_at >= ? AND s.is_published = 1
        ORDER BY n.created_at DESC, n.id DESC LIMIT ?`,
      spaceId, since, limit,
    )
    : db.all<HomeAnnouncement>(
      `SELECT n.id, n.subject_id, s.title AS subject_title, n.body, n.author_role, n.created_at, n.edited_at
         FROM announcement n
         JOIN subject s ON s.id = n.subject_id AND s.space_id = n.space_id
        WHERE n.space_id = ? AND n.removed_at IS NULL AND n.created_at >= ? AND s.is_published = 1 AND s.publisher_user_id = ?
        ORDER BY n.created_at DESC, n.id DESC LIMIT ?`,
      spaceId, since, previewer.userId, limit,
    );
}

/** One row of the to-do statement (LMS wave 6, section 5): a listed lesson or
 * chapter of a group, with the full count of the group; a chapter carries how many
 * of its shown lessons there are and how many this learner marked done. */
export interface TodoRow {
  kind: 'lesson' | 'chapter';
  id: string;
  title: string;
  due_on: string;
  subject_id: string;
  subject_title: string;
  chapter_id: string;
  total: number;
  done: number;
  /** 0 overdue, 1 today, 2 the next days (section 5.3). */
  grp: number;
  /** The full count of the group (after the rules of section 5.2). */
  n: number;
}

/* The to-do read of a learner (learnerTodo, LMS wave 6) is in src/progress.ts, the only module that names the done-mark table. */

/** LMS wave 6 (section 5.6): the preview home's to-do list, as a made-up
 * learner assigned exactly the subjects of previewCards (every published
 * subject for an admin; the published subjects a publisher is responsible
 * for) with no done marks sees it: the statement of learnerTodo with that subject
 * rule, every chapter counted with none of its lessons done, and in a subject
 * with chapters in order only the items of a chapter no earlier shown chapter
 * with a shown lesson comes before (chapterLocks with no marks). */
export function previewTodo(db: Db, spaceId: string, previewer: Previewer, today: string, last: string, cap: number): Promise<TodoRow[]> {
  return previewer.kind === 'admin'
    ? db.all<TodoRow>(
      `WITH item AS (
         SELECT 'lesson' AS kind, l.id AS id, l.title AS title, l.due_on AS due_on, s.id AS subject_id, s.title AS subject_title,
                c.id AS chapter_id, c.position AS c_pos, c.title AS c_title, 1 AS k, l.position AS l_pos, l.title AS l_title, 0 AS total, 0 AS done
           FROM lesson l
           JOIN chapter c ON c.id = l.chapter_id AND +c.space_id = l.space_id AND c.removed_at IS NULL
           JOIN subject s ON s.id = c.subject_id AND +s.space_id = c.space_id
          WHERE l.space_id = ? AND l.removed_at IS NULL AND l.due_on IS NOT NULL AND l.due_on <= ? AND s.is_published = 1
            AND (c.opens_on IS NULL OR c.opens_on <= ?)
            AND (s.chapters_in_order <> 1 OR NOT EXISTS (
              SELECT 1 FROM chapter pc
               WHERE pc.space_id = c.space_id AND pc.subject_id = c.subject_id AND pc.removed_at IS NULL AND (pc.opens_on IS NULL OR pc.opens_hidden = 0 OR pc.opens_on <= ?)
                 AND pc.position <= c.position AND (pc.position < c.position OR (pc.position = c.position AND (pc.title < c.title OR (pc.title = c.title AND pc.id < c.id))))
                     AND EXISTS (SELECT 1 FROM lesson pl WHERE pl.space_id = pc.space_id AND pl.chapter_id = pc.id AND pl.removed_at IS NULL)))
         UNION ALL
         SELECT 'chapter', x.id, x.title, x.due_on, x.subject_id, x.subject_title, x.id, x.position, x.title, 0, NULL, NULL, x.total, 0
           FROM (
             SELECT c.id, c.title, c.due_on, c.position, s.id AS subject_id, s.title AS subject_title,
                    (SELECT COUNT(*) FROM lesson tl WHERE tl.space_id = c.space_id AND tl.chapter_id = c.id AND tl.removed_at IS NULL) AS total
               FROM chapter c
               JOIN subject s ON s.id = c.subject_id AND +s.space_id = c.space_id
              WHERE c.space_id = ? AND c.removed_at IS NULL AND c.due_on IS NOT NULL AND c.due_on <= ? AND s.is_published = 1
                AND (c.opens_on IS NULL OR c.opens_on <= ?)
                AND (s.chapters_in_order <> 1 OR NOT EXISTS (
                  SELECT 1 FROM chapter pc
                   WHERE pc.space_id = c.space_id AND pc.subject_id = c.subject_id AND pc.removed_at IS NULL AND (pc.opens_on IS NULL OR pc.opens_hidden = 0 OR pc.opens_on <= ?)
                     AND pc.position <= c.position AND (pc.position < c.position OR (pc.position = c.position AND (pc.title < c.title OR (pc.title = c.title AND pc.id < c.id))))
                     AND EXISTS (SELECT 1 FROM lesson pl WHERE pl.space_id = pc.space_id AND pl.chapter_id = pc.id AND pl.removed_at IS NULL)))
           ) x
          WHERE x.total > 0
       ),
       grouped AS (SELECT item.*, CASE WHEN item.due_on < ? THEN 0 WHEN item.due_on = ? THEN 1 ELSE 2 END AS grp FROM item),
       ranked AS (
         SELECT grouped.*, ROW_NUMBER() OVER w AS rn,
                COUNT(*) OVER (w ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) AS n
           FROM grouped
           WINDOW w AS (PARTITION BY grp ORDER BY due_on, subject_title, subject_id, c_pos, c_title, chapter_id, k, l_pos, l_title, id)
       )
       SELECT kind, id, title, due_on, subject_id, subject_title, chapter_id, total, done, grp, n FROM ranked WHERE rn <= ? ORDER BY grp, rn`,
      // LMS wave 8 (section 3.6): today also in each item filter and each order test (a hidden chapter not open yet is outside the order rule).
      spaceId, last, today, today, spaceId, last, today, today, today, today, cap,
    )
    : db.all<TodoRow>(
      `WITH item AS (
         SELECT 'lesson' AS kind, l.id AS id, l.title AS title, l.due_on AS due_on, s.id AS subject_id, s.title AS subject_title,
                c.id AS chapter_id, c.position AS c_pos, c.title AS c_title, 1 AS k, l.position AS l_pos, l.title AS l_title, 0 AS total, 0 AS done
           FROM lesson l
           JOIN chapter c ON c.id = l.chapter_id AND +c.space_id = l.space_id AND c.removed_at IS NULL
           JOIN subject s ON s.id = c.subject_id AND +s.space_id = c.space_id
          WHERE l.space_id = ? AND l.removed_at IS NULL AND l.due_on IS NOT NULL AND l.due_on <= ? AND s.is_published = 1 AND s.publisher_user_id = ?
            AND (c.opens_on IS NULL OR c.opens_on <= ?)
            AND (s.chapters_in_order <> 1 OR NOT EXISTS (
              SELECT 1 FROM chapter pc
               WHERE pc.space_id = c.space_id AND pc.subject_id = c.subject_id AND pc.removed_at IS NULL AND (pc.opens_on IS NULL OR pc.opens_hidden = 0 OR pc.opens_on <= ?)
                 AND pc.position <= c.position AND (pc.position < c.position OR (pc.position = c.position AND (pc.title < c.title OR (pc.title = c.title AND pc.id < c.id))))
                     AND EXISTS (SELECT 1 FROM lesson pl WHERE pl.space_id = pc.space_id AND pl.chapter_id = pc.id AND pl.removed_at IS NULL)))
         UNION ALL
         SELECT 'chapter', x.id, x.title, x.due_on, x.subject_id, x.subject_title, x.id, x.position, x.title, 0, NULL, NULL, x.total, 0
           FROM (
             SELECT c.id, c.title, c.due_on, c.position, s.id AS subject_id, s.title AS subject_title,
                    (SELECT COUNT(*) FROM lesson tl WHERE tl.space_id = c.space_id AND tl.chapter_id = c.id AND tl.removed_at IS NULL) AS total
               FROM chapter c
               JOIN subject s ON s.id = c.subject_id AND +s.space_id = c.space_id
              WHERE c.space_id = ? AND c.removed_at IS NULL AND c.due_on IS NOT NULL AND c.due_on <= ? AND s.is_published = 1 AND s.publisher_user_id = ?
                AND (c.opens_on IS NULL OR c.opens_on <= ?)
                AND (s.chapters_in_order <> 1 OR NOT EXISTS (
                  SELECT 1 FROM chapter pc
                   WHERE pc.space_id = c.space_id AND pc.subject_id = c.subject_id AND pc.removed_at IS NULL AND (pc.opens_on IS NULL OR pc.opens_hidden = 0 OR pc.opens_on <= ?)
                     AND pc.position <= c.position AND (pc.position < c.position OR (pc.position = c.position AND (pc.title < c.title OR (pc.title = c.title AND pc.id < c.id))))
                     AND EXISTS (SELECT 1 FROM lesson pl WHERE pl.space_id = pc.space_id AND pl.chapter_id = pc.id AND pl.removed_at IS NULL)))
           ) x
          WHERE x.total > 0
       ),
       grouped AS (SELECT item.*, CASE WHEN item.due_on < ? THEN 0 WHEN item.due_on = ? THEN 1 ELSE 2 END AS grp FROM item),
       ranked AS (
         SELECT grouped.*, ROW_NUMBER() OVER w AS rn,
                COUNT(*) OVER (w ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) AS n
           FROM grouped
           WINDOW w AS (PARTITION BY grp ORDER BY due_on, subject_title, subject_id, c_pos, c_title, chapter_id, k, l_pos, l_title, id)
       )
       SELECT kind, id, title, due_on, subject_id, subject_title, chapter_id, total, done, grp, n FROM ranked WHERE rn <= ? ORDER BY grp, rn`,
      spaceId, last, previewer.userId, today, today, spaceId, last, previewer.userId, today, today, today, today, cap,
    );
}

type CardRow = {
  subject_id: string; subject_title: string; in_order: number; publisher_name: string | null;
  chapter_id: string | null; chapter_title: string | null; opens_on: string | null; opens_hidden: number | null; lesson_id: string | null; lesson_title: string | null;
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
export async function previewCards(db: Db, spaceId: string, previewer: Previewer, today: string): Promise<LearnerCard[]> {
  const rows = previewer.kind === 'admin'
    ? await db.all<CardRow>(
      `SELECT s.id AS subject_id, s.title AS subject_title, s.chapters_in_order AS in_order, u.display_name AS publisher_name, c.id AS chapter_id, c.title AS chapter_title, c.opens_on, c.opens_hidden, l.id AS lesson_id, l.title AS lesson_title
         FROM subject s
         LEFT JOIN user u ON u.id = s.publisher_user_id
         LEFT JOIN chapter c ON c.subject_id = s.id AND c.space_id = s.space_id AND c.removed_at IS NULL
         LEFT JOIN lesson l ON l.chapter_id = c.id AND l.space_id = s.space_id AND l.removed_at IS NULL
        WHERE s.space_id = ? AND s.is_published = 1
        ORDER BY s.title, s.id, c.position, c.title, c.id, l.position, l.title, l.id`,
      spaceId,
    )
    : await db.all<CardRow>(
      `SELECT s.id AS subject_id, s.title AS subject_title, s.chapters_in_order AS in_order, u.display_name AS publisher_name, c.id AS chapter_id, c.title AS chapter_title, c.opens_on, c.opens_hidden, l.id AS lesson_id, l.title AS lesson_title
         FROM subject s
         LEFT JOIN user u ON u.id = s.publisher_user_id
         LEFT JOIN chapter c ON c.subject_id = s.id AND c.space_id = s.space_id AND c.removed_at IS NULL
         LEFT JOIN lesson l ON l.chapter_id = c.id AND l.space_id = s.space_id AND l.removed_at IS NULL
        WHERE s.space_id = ? AND s.is_published = 1 AND s.publisher_user_id = ?
        ORDER BY s.title, s.id, c.position, c.title, c.id, l.position, l.title, l.id`,
      spaceId, previewer.userId,
    );
  return cardsOf(rows, today);
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

function cardsOf(rows: CardRow[], today: string): LearnerCard[] {
  const cards: LearnerCard[] = [];
  for (const r of rows) {
    let card = cards.at(-1);
    if (!card || card.id !== r.subject_id) {
      cards.push((card = { id: r.subject_id, title: r.subject_title, publisherName: r.publisher_name, count: 0, first: null, steps: [], inOrder: r.in_order === 1, opening: new Map(), next: null }));
    }
    if (!r.lesson_id) continue;
    // LMS wave 8 (section 3.3, L1): a hidden chapter not open yet adds nothing (no lesson, no count, no step).
    const ch = { opens_on: r.opens_on, opens_hidden: Number(r.opens_hidden ?? 0) };
    if (hiddenNow(ch, today)) continue;
    if (notOpenYet(ch, today)) card.opening.set(r.chapter_id ?? '', r.opens_on!);
    card.count++;
    card.steps.push({ id: r.lesson_id, title: r.lesson_title ?? '', chapterId: r.chapter_id ?? '', chapterTitle: r.chapter_title ?? '' });
  }
  // Start leads to the first lesson a learner with no marks can open: wave 1's first lesson, and from LMS wave 8 (L2) never one not open yet.
  for (const card of cards) {
    const locked = chapterLocks(chaptersOfCard(card), new Set(), { today, inOrder: card.inOrder }).locked;
    const open = card.steps.find((s) => !locked.has(s.chapterId));
    card.first = open ? { id: open.id, title: open.title } : null;
    card.next = !open && card.steps.length ? waitingFor(card, card.steps) : null;
  }
  return cards;
}

/** LMS wave 8 (L2): the chapter of the first of these steps when it is not open yet (shown locked), with its date; otherwise null. */
function waitingFor(card: LearnerCard, left: SequenceStep[]): WaitingFor | null {
  const first = left[0];
  const date = first ? card.opening.get(first.chapterId) : undefined;
  return first && date ? { title: first.chapterTitle, date } : null;
}

/** A card's progress (LMS wave 2, W2-2, section 8.3): how many of its lessons
 * the learner marked done, and where "Continue" leads (null when all are done). */
export interface CardProgress {
  done: number;
  target: SequenceStep | null;
  /** LMS wave 8 (L2): when lessons are left but none is open now, the chapter they wait for; null otherwise. */
  waiting?: WaitingFor | null;
}

/** The home's "Continue where you stopped" area (section 8.3). */
export type ContinueArea =
  | { kind: 'first' }
  | { kind: 'all-done' }
  | { kind: 'target'; card: LearnerCard; done: number; target: SequenceStep }
  /** LMS wave 8 (L2): what is left waits for an opening date; no link. */
  | { kind: 'waiting'; card: LearnerCard; done: number; next: WaitingFor };

/** Where the learner continues (section 8.2), from their own marks only: `order`
 * holds the lesson ids they marked done, newest first, lessons marked at the same
 * time together (progress.ts markOrder). A mark counts only on a lesson of a card
 * (published, assigned, not removed: section 6.3). Nothing else enters the rule:
 * no lesson open, no activity setting, no notice. Pure, so no read is added. */
export function continueWhere(cards: LearnerCard[], order: string[][], today: string): { area: ContinueArea; progress: Map<string, CardProgress> } {
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
    // The first lesson not done after it; if none, the first not-done lesson from the start. LMS wave 4 (section 5.4,
    // A9) and wave 8 (C5, L2): only a lesson open now, by order and by date. With no lock this is wave 2's target;
    // with order alone it is wave 4's (a locked target gave way to the first not-done lesson, which is then open).
    const locked = chapterLocks(chaptersOfCard(card), done, { today, inOrder: card.inOrder }).locked;
    const left = (s: SequenceStep) => !done.has(s.id);
    const open = (s: SequenceStep) => left(s) && !locked.has(s.chapterId);
    const target = card.steps.slice(at + 1).find(open) ?? card.steps.find(open) ?? null;
    const p: CardProgress = { done: done.size, target, waiting: target ? null : waitingFor(card, card.steps.filter(left)) };
    progress.set(card.id, p);
    started.push({ card, newest: group, p });
  }
  if (started.length === 0) return { area: { kind: 'first' }, progress };
  // Subjects by their newest mark, newest first; equal times keep the home's order (a stable sort).
  started.sort((a, b) => a.newest - b.newest);
  const first = started.find((s) => s.p.target);
  const waits = first ? undefined : started.find((s) => s.p.waiting);
  return {
    area: first ? { kind: 'target', card: first.card, done: first.p.done, target: first.p.target! }
      : waits ? { kind: 'waiting', card: waits.card, done: waits.p.done, next: waits.p.waiting! } : { kind: 'all-done' },
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
  | { kind: 'first'; blocking: { id: string; title: string }; left: number; opensOn?: string }
  | { kind: 'later'; left: number; opensOn?: string }
  /** LMS wave 8 (C4): not open yet by its date alone. A reason by order carries `opensOn` too when both apply. */
  | { kind: 'date'; opensOn: string };

export interface ChapterLocks {
  /** The locked chapters, by id, each with its reason. A chapter not here is open. */
  locked: Map<string, LockReason>;
  /** The earliest chapter with a not-done shown lesson (it is open), or null when every lesson is done. */
  blocking: string | null;
  /** The first not-done lesson in reading order while any chapter is locked ("Go to"); null otherwise. LMS wave 8 (C5): only in a chapter open now, and only while a chapter is locked by order. */
  goTo: { id: string; title: string } | null;
  /** LMS wave 8: whether the order rule applied (the order box of wave 4); false when only dates lock. */
  inOrder: boolean;
}

/** A chapter as the lock rule reads it: its shown lessons in order and (LMS wave 8) its opening. */
export interface LockChapter {
  id: string;
  title: string;
  lessons: { id: string; title: string }[];
  opens_on?: string | null;
  opens_hidden?: number;
}

// ------------------------------------------------------- opening dates ----
// LMS wave 8, W8-1b (product-contract v2 on PIL-299, sections 3.1 to 3.6). A
// chapter with opening date X is not open before 00:00 UTC on day X (D1): the
// one `today` of the request is before X. Before it, a learner (and the made-up
// learner of a preview, A1) meets it shown locked, or not at all when hidden.
// From day X every page is as if it had no date (D3). Worked out at each load
// from the outline row; nothing about it is stored.

/** Not open yet on `today` (D1): it has a date and today is before it. */
export const notOpenYet = (ch: { opens_on?: string | null }, today: string): boolean => Boolean(ch.opens_on) && today < ch.opens_on!;

/** Hidden today (D2): not open yet, and its before-opening choice is hidden. */
export const hiddenNow = (ch: { opens_on?: string | null; opens_hidden?: number | null }, today: string): boolean => notOpenYet(ch, today) && Number(ch.opens_hidden) === 1;

/** The chapters a learner sees today (section 3.3, L1, C2): a hidden chapter not open yet is left out, with its lessons. */
export function shownChapters<T extends { opens_on?: string | null; opens_hidden?: number }>(chapters: T[], today: string): T[] {
  return chapters.filter((ch) => !hiddenNow(ch, today));
}

/** The locks a learner meets in a subject (or the made-up learner of a preview, with no marks): null when nothing locks and the order rule is off, so the page is main's. */
export function learnerChapterLocks(chapters: LockChapter[], done: Set<string>, inOrder: boolean, today: string): ChapterLocks | null {
  const locks = chapterLocks(chapters, done, { today, inOrder });
  return inOrder || locks.locked.size ? locks : null;
}

/** The lock rule (section 5.2): a chapter is open when every shown lesson of
 * every earlier chapter carries this learner's done mark; otherwise locked.
 * The first argument holds the shown chapters in reading order with their shown lessons
 * (the outline already leaves out removed ones, so a mark on a removed lesson
 * counts for nothing); `done` holds the learner's marked lesson ids. A chapter
 * with no shown lesson is done by definition and is never shown locked. Marks
 * inside a locked chapter are kept and counted but open nothing before the
 * chapters before it are done. Pure: no read. */
export function chapterLocks(chapters: LockChapter[], done: Set<string>, opts?: { today: string; inOrder: boolean }): ChapterLocks {
  // Without `opts`: wave 4's rule exactly (order on, no date). LMS wave 8 (C1 to C4): with `opts`, a chapter not
  // open yet by its date is locked by it too (shown locked, also when empty, D5); a hidden one not open yet is left
  // out of the rule, as if it had no lessons (C2); a shown-locked one counts in the order rule (C3).
  const today = opts?.today;
  const inOrder = opts?.inOrder ?? true;
  const locked = new Map<string, LockReason>();
  let blocking: { id: string; title: string; left: number } | null = null;
  let goTo: { id: string; title: string } | null = null;
  let leftBefore = 0;
  let byOrder = 0;
  for (const ch of chapters) {
    if (today !== undefined && hiddenNow(ch, today)) continue;
    const notDone = ch.lessons.filter((l) => !done.has(l.id));
    let reason: LockReason | null = null;
    if (inOrder && leftBefore > 0 && ch.lessons.length > 0) {
      reason = byOrder === 0 ? { kind: 'first', blocking: { id: blocking!.id, title: blocking!.title }, left: blocking!.left } : { kind: 'later', left: leftBefore };
      byOrder++;
    }
    if (today !== undefined && notOpenYet(ch, today)) reason = reason ? { ...reason, opensOn: ch.opens_on! } : { kind: 'date', opensOn: ch.opens_on! };
    if (reason) locked.set(ch.id, reason);
    if (!blocking && notDone.length > 0) blocking = { id: ch.id, title: ch.title, left: notDone.length };
    // "Go to" (C5): the first not-done lesson of a chapter open now.
    if (!goTo && !reason && notDone.length > 0) goTo = notDone[0];
    leftBefore += notDone.length;
  }
  return { locked, blocking: blocking?.id ?? null, goTo: byOrder ? goTo : null, inOrder };
}

/** The chapters of the steps of a home card, in order, each with its opening date when not open yet: enough for the lock rule, since a chapter without lessons never locks by order and leads nowhere. */
function chaptersOfCard(card: LearnerCard): LockChapter[] {
  const out: LockChapter[] = [];
  for (const s of card.steps) {
    let ch = out.at(-1);
    if (!ch || ch.id !== s.chapterId) out.push((ch = { id: s.chapterId, title: s.chapterTitle, lessons: [], opens_on: card.opening.get(s.chapterId) ?? null, opens_hidden: 0 }));
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
  // LMS wave 6 (section 6.1): the outline read gains the two due_on columns, no new statement.
  // LMS wave 8 (section 3.6): and the opening date and choice of each chapter, no new statement.
  const rows = await db.all<{ chapter_id: string; chapter_title: string; chapter_due: string | null; opens_on: string | null; opens_hidden: number; lesson_id: string | null; lesson_title: string | null; lesson_due: string | null }>(
    `SELECT c.id AS chapter_id, c.title AS chapter_title, c.due_on AS chapter_due, c.opens_on, c.opens_hidden, l.id AS lesson_id, l.title AS lesson_title, l.due_on AS lesson_due
       FROM chapter c LEFT JOIN lesson l ON l.chapter_id = c.id AND l.space_id = c.space_id AND l.removed_at IS NULL
      WHERE c.space_id = ? AND c.subject_id = ? AND c.removed_at IS NULL
      ORDER BY c.position, c.title, c.id, l.position, l.title, l.id`,
    spaceId, subjectId,
  );
  const chapters: OutlineChapter[] = [];
  for (const r of rows) {
    let ch = chapters.at(-1);
    if (!ch || ch.id !== r.chapter_id) chapters.push((ch = { id: r.chapter_id, title: r.chapter_title, lessons: [], due_on: r.chapter_due ?? null, opens_on: r.opens_on ?? null, opens_hidden: Number(r.opens_hidden ?? 0) }));
    if (r.lesson_id) ch.lessons.push({ id: r.lesson_id, title: r.lesson_title ?? '', due_on: r.lesson_due ?? null });
  }
  return chapters;
}

export function findLesson(db: Db, spaceId: string, lessonId: string): Promise<LessonRow | null> {
  return db.first<LessonRow>(
    `SELECT l.id, l.title, l.body_text, l.chapter_id, c.title AS chapter_title, c.subject_id, c.opens_on, c.opens_hidden
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
    `SELECT m.id, m.kind, m.title, m.storage_key, c.subject_id, l.id AS lesson_id, c.opens_on, c.opens_hidden
       FROM material m
       JOIN lesson l ON l.id = m.lesson_id AND l.space_id = m.space_id AND l.removed_at IS NULL
       JOIN chapter c ON c.id = l.chapter_id AND c.space_id = l.space_id AND c.removed_at IS NULL
      WHERE m.id = ? AND m.space_id = ? AND m.removed_at IS NULL AND m.kind IN ('pdf', 'image') AND m.storage_key IS NOT NULL`,
    materialId, spaceId,
  );
}
