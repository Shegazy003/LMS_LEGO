// LMS wave 7 (product-contract v2 on PIL-261, sections 4 to 7): online quizzes.
// W7-1 builds the teachers side: a subjects responsible publisher or any admin
// of the space creates, edits, opens, closes, removes, restores and copies a
// short multiple-choice quiz; the responsible publisher reads its results.
// Stored in migrations/0016_quizzes.sql: `quiz` (the questions, answers and
// right answers in questions_json) and `quiz_attempt` (one learners one
// sending). A quiz names no person.
// The server is the authority on every rule (section 4.4): the limits below,
// the text rules, and the lock (section 4.5): once a quiz has an attempt its
// questions never change again. Every write is one statement scoped to the
// space, the subject and a quiz that is not removed, and repeats the publisher
// check for a publisher; a question write is also guarded by the stored `rev`
// and by "no attempt exists". `buildAttempt` is the pure scorer W7-2s sending
// and preview use; W7-1 uses it to write test attempts (test/wave7/attempts.ts).
import type { Db } from './db.ts';

/** Title: 1 to 120 characters after trimming. */
export const QUIZ_TITLE_MAX = 120;
/** Question text: 1 to 500 characters; line breaks allowed. */
export const QUIZ_TEXT_MAX = 500;
/** Each answer: 1 to 200 characters, one line. */
export const QUIZ_OPTION_MAX = 200;
/** Filled answers per question. */
export const QUIZ_OPTIONS_MIN = 2;
export const QUIZ_OPTIONS_MAX = 5;
/** Questions per quiz. */
export const QUIZ_QUESTIONS_MAX = 20;
/** Quizzes not removed per subject (a copy counts). */
export const QUIZ_PER_SUBJECT_MAX = 30;
/** The quiz lists fold shows this many of the most recently removed quizzes (section 4.2). */
export const QUIZ_REMOVED_SHOWN = 10;
/** Names per results page (AT-2.2). */
export const QUIZ_RESULTS_PAGE = 50;

export const QUIZ_STATES = ['draft', 'open', 'closed'] as const;
export type QuizState = (typeof QUIZ_STATES)[number];

// --------------------------------------------------------------- shapes ----
// Section 6.1. questions_json: [{ id, text, answers: [{ id, text }], rightId }] in question order.
// answers_json: { <question id>: <chosen answer id> } for every answered question; right_flags: '1'/'0' per question.

export interface QuizAnswer { id: string; text: string }
export interface QuizQuestion { id: string; text: string; answers: QuizAnswer[]; rightId: string }

/** Reads stored questions_json; anything that is not the shape reads as no question. */
export function parseQuestions(json: string): QuizQuestion[] {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(value)) return [];
  return value.filter((q): q is QuizQuestion => Boolean(q) && typeof q.id === 'string' && typeof q.text === 'string' && typeof q.rightId === 'string' && Array.isArray(q.answers));
}

// ------------------------------------------------------------------ ids ----

const ID_LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const ID_LENGTH = 16;

/** A new random id: 16 lowercase letters from the crypto source (about 75 bits), so it is never derived from a
 * position or from rightness, and has no digit that could equal or contain a position (AT-4.1c). */
export function newQuizId(): string {
  let out = '';
  while (out.length < ID_LENGTH) {
    for (const b of crypto.getRandomValues(new Uint8Array(ID_LENGTH))) {
      // 234 = 9 × 26: only bytes below it, so every letter is equally likely.
      if (b < 234 && out.length < ID_LENGTH) out += ID_LETTERS[b % 26];
    }
  }
  return out;
}

// ----------------------------------------------------------- text rules ----

const length = (s: string) => [...s].length;
/** Control characters (Unicode Cc). The questions line break is the one allowed, and only in a question. */
const CONTROL = /\p{Cc}/u;

/** A typed title, trimmed, or null when it breaks the rule (empty, too long, a control character). */
export function cleanTitle(typed: string): string | null {
  const v = typed.trim();
  return v !== '' && length(v) <= QUIZ_TITLE_MAX && !CONTROL.test(v) ? v : null;
}

/** A typed question text: line breaks become \n, trimmed; null when empty, too long, or with another control character. */
export function cleanText(typed: string): string | null {
  const v = typed.replace(/\r\n?/g, '\n').trim();
  return v !== '' && length(v) <= QUIZ_TEXT_MAX && !CONTROL.test(v.replace(/\n/g, '')) ? v : null;
}

/** The answer boxes of a question form: answer1 … answer5 (a sixth means the form was not the products). */
export const ANSWER_FIELDS = Array.from({ length: QUIZ_OPTIONS_MAX }, (_, i) => `answer${i + 1}`);

/** What a question form asks for, or why it is refused (section 4.4). `box` is the 1-based answer box. */
export type QuestionInput =
  | { ok: true; text: string; answers: { box: number; text: string }[]; rightBox: number }
  | { ok: false; error: 'quizTextInvalid' | 'quizOptionsInvalid' | 'quizCorrectInvalid'; field: string };

/** Reads one posted question form: text, answer1 … answer5, right (the box of the right answer). */
export function readQuestion(body: Record<string, unknown>): QuestionInput {
  const str = (name: string) => (typeof body[name] === 'string' ? (body[name] as string) : '');
  const text = cleanText(str('text'));
  if (text === null) return { ok: false, error: 'quizTextInvalid', field: 'text' };
  // A box beyond the fifth, filled, is refused like six answers (only a hand-made POST has one).
  for (const name of Object.keys(body)) {
    const m = /^answer(\d+)$/.exec(name);
    if (m && Number(m[1]) > QUIZ_OPTIONS_MAX && str(name).trim() !== '') return { ok: false, error: 'quizOptionsInvalid', field: 'answer1' };
  }
  const answers: { box: number; text: string }[] = [];
  for (const [i, name] of ANSWER_FIELDS.entries()) {
    const raw = str(name).trim();
    if (raw === '') continue;
    if (length(raw) > QUIZ_OPTION_MAX || CONTROL.test(raw)) return { ok: false, error: 'quizOptionsInvalid', field: name };
    if (answers.some((a) => a.text === raw)) return { ok: false, error: 'quizOptionsInvalid', field: name };
    answers.push({ box: i + 1, text: raw });
  }
  if (answers.length < QUIZ_OPTIONS_MIN) return { ok: false, error: 'quizOptionsInvalid', field: ANSWER_FIELDS[answers.length] ?? 'answer1' };
  const right = Number(str('right'));
  if (!answers.some((a) => a.box === right)) return { ok: false, error: 'quizCorrectInvalid', field: 'right' };
  return { ok: true, text, answers, rightBox: right };
}

/** The stored question for a valid form. An answer box keeps the id of the answer that box showed (`kept`, by box), else gets a new one. */
export function questionFrom(input: Extract<QuestionInput, { ok: true }>, id: string = newQuizId(), kept: readonly (string | undefined)[] = []): QuizQuestion {
  const answers = input.answers.map((a) => ({ id: kept[a.box - 1] ?? newQuizId(), text: a.text }));
  const right = answers[input.answers.findIndex((a) => a.box === input.rightBox)];
  return { id, text: input.text, answers, rightId: right.id };
}

/** The same questions, answers and right answers in the same order, every id new (a copy, section 4.6). */
export function withNewIds(questions: readonly QuizQuestion[]): QuizQuestion[] {
  return questions.map((q) => {
    const answers = q.answers.map((a) => ({ id: newQuizId(), text: a.text }));
    const right = q.answers.findIndex((a) => a.id === q.rightId);
    return { id: newQuizId(), text: q.text, answers, rightId: answers[right]?.id ?? '' };
  });
}

// ------------------------------------------------------------- scoring ----

/** One sending, scored (section 6.1): what the attempt row stores. */
export interface BuiltAttempt { answers_json: string; right_flags: string; score: number; question_count: number }

/** The pure scorer (section 6.1, AT-3.2): checks every posted id against the quiz and scores it, one point per right
 * answer; an unanswered question is wrong. A posted question id the quiz does not have, or an answer id that is not
 * one of that questions, is refused (null). `posted` maps question id to the chosen answer id. */
export function buildAttempt(questions: readonly QuizQuestion[], posted: Readonly<Record<string, string>>): BuiltAttempt | null {
  if (questions.length < 1 || questions.length > QUIZ_QUESTIONS_MAX) return null;
  for (const [qid, aid] of Object.entries(posted)) {
    const q = questions.find((x) => x.id === qid);
    if (!q || !q.answers.some((a) => a.id === aid)) return null;
  }
  const answers: Record<string, string> = {};
  let flags = '';
  for (const q of questions) {
    const chosen = Object.hasOwn(posted, q.id) ? posted[q.id] : undefined;
    if (chosen !== undefined) answers[q.id] = chosen;
    flags += chosen !== undefined && chosen === q.rightId ? '1' : '0';
  }
  return { answers_json: JSON.stringify(answers), right_flags: flags, score: [...flags].filter((f) => f === '1').length, question_count: questions.length };
}

/** A stored answers_json read back (one entry per answered question). */
export function parseAnswers(json: string): Record<string, string> {
  try {
    const v = JSON.parse(json) as unknown;
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === 'string'));
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------- reads ----

/** Who writes: the responsible publisher (each write repeats the check) or an admin (the admin gate has run). */
export type QuizWriter = { role: 'publisher'; userId: string } | { role: 'admin' };
const ownerOf = (w: QuizWriter) => (w.role === 'publisher' ? w.userId : null);
// Every statement below is written whole, so the space guard (test/guards/space-isolation.test.ts) can check it.
// Repeated conditions, each spelled out where it is used:
// - the subject still holds: EXISTS (SELECT 1 FROM subject s WHERE s.id = quiz.subject_id AND s.space_id = quiz.space_id
//   AND (? IS NULL OR s.publisher_user_id = ?)), the owner twice (null for an admin);
// - an active learner: EXISTS (SELECT 1 FROM membership m WHERE m.space_id = a.space_id AND m.user_id = a.learner_user_id
//   AND m.role = learner AND m.ended_on IS NULL AND m.valid_from <= ? AND m.valid_until >= ?), today twice;
// - room in the subject: (SELECT COUNT(*) FROM quiz c WHERE c.space_id = ? AND c.subject_id = ? AND c.removed_at IS NULL) < ?;
// - the next creation stamp: now, or one after the latest of the subject, so creation order is strict within one millisecond.

/** One row of the quiz list. `attempts` only on the responsible publishers list (null on the admins). */
export interface QuizListRow { id: string; title: string; state: QuizState; questions: number; removed_at: number | null; attempts: number | null }

/** The quiz list (section 4.2), one statement: every quiz not removed, in creation order, and the QUIZ_REMOVED_SHOWN most
 * recently removed. With `today` (the responsible publisher only) each row carries its count of attempts of people
 * whose access is active (the same count as its results page); the admins list reads no attempt (AT-2.5). */
export async function quizzesOf(db: Db, spaceId: string, subjectId: string, today: string | null): Promise<QuizListRow[]> {
  type Row = { id: string; title: string; state: QuizState; questions: number; removed_at: number | null; attempts: number | null };
  const rows = today === null
    ? await db.all<Row>(
      `SELECT quiz.id, quiz.title, quiz.state, json_array_length(quiz.questions_json) AS questions, quiz.removed_at, NULL AS attempts
         FROM quiz
        WHERE quiz.space_id = ? AND quiz.subject_id = ?
          AND (quiz.removed_at IS NULL OR quiz.id IN (
            SELECT r.id FROM quiz r WHERE r.space_id = quiz.space_id AND r.subject_id = quiz.subject_id AND r.removed_at IS NOT NULL
             ORDER BY r.removed_at DESC, r.created_at DESC, r.id LIMIT ?))
        ORDER BY quiz.created_at, quiz.id`,
      spaceId, subjectId, QUIZ_REMOVED_SHOWN,
    )
    : await db.all<Row>(
      `SELECT quiz.id, quiz.title, quiz.state, json_array_length(quiz.questions_json) AS questions, quiz.removed_at,
              (SELECT COUNT(*) FROM quiz_attempt a WHERE a.quiz_id = quiz.id AND a.space_id = quiz.space_id
                  AND EXISTS (SELECT 1 FROM membership m WHERE m.space_id = a.space_id AND m.user_id = a.learner_user_id AND m.role = 'learner'
                                 AND m.ended_on IS NULL AND m.valid_from <= ? AND m.valid_until >= ?)) AS attempts
         FROM quiz
        WHERE quiz.space_id = ? AND quiz.subject_id = ?
          AND (quiz.removed_at IS NULL OR quiz.id IN (
            SELECT r.id FROM quiz r WHERE r.space_id = quiz.space_id AND r.subject_id = quiz.subject_id AND r.removed_at IS NOT NULL
             ORDER BY r.removed_at DESC, r.created_at DESC, r.id LIMIT ?))
        ORDER BY quiz.created_at, quiz.id`,
      today, today, spaceId, subjectId, QUIZ_REMOVED_SHOWN,
    );
  return rows.map((r) => ({ ...r, questions: Number(r.questions), attempts: r.attempts === null ? null : Number(r.attempts) }));
}

/** One quiz as its editor, its results and every write read it. */
export interface QuizRow {
  id: string;
  subject_id: string;
  title: string;
  state: QuizState;
  rev: number;
  removed_at: number | null;
  questions: QuizQuestion[];
  /** At least one attempt exists (of anyone): the questions are locked for good (section 4.5). */
  locked: boolean;
  /** How many quizzes not removed the subject holds (this one included when it is not removed): the room for a copy or a restore. */
  inSubject: number;
}

/** The quiz an address names (one read): only of this space and this subject (removed ones too, the caller decides); otherwise null (404). */
export async function quizOf(db: Db, spaceId: string, subjectId: string, quizId: string): Promise<QuizRow | null> {
  const r = await db.first<{ id: string; subject_id: string; title: string; state: QuizState; rev: number; removed_at: number | null; questions_json: string; locked: number; in_subject: number }>(
    `SELECT quiz.id, quiz.subject_id, quiz.title, quiz.state, quiz.rev, quiz.removed_at, quiz.questions_json,
            EXISTS (SELECT 1 FROM quiz_attempt a WHERE a.quiz_id = quiz.id AND a.space_id = quiz.space_id) AS locked,
            (SELECT COUNT(*) FROM quiz c WHERE c.space_id = quiz.space_id AND c.subject_id = quiz.subject_id AND c.removed_at IS NULL) AS in_subject
       FROM quiz WHERE quiz.id = ? AND quiz.space_id = ? AND quiz.subject_id = ?`,
    quizId, spaceId, subjectId,
  );
  if (!r) return null;
  return {
    id: r.id, subject_id: r.subject_id, title: r.title, state: r.state, rev: Number(r.rev), removed_at: r.removed_at,
    questions: parseQuestions(r.questions_json), locked: Number(r.locked) === 1, inSubject: Number(r.in_subject),
  };
}

// --------------------------------------------------------------- writes ----

/** Creates a draft in one statement (AT-1.1); null when the subject is full (or no longer the publishers). */
export async function createQuiz(db: Db, spaceId: string, subjectId: string, title: string, writer: QuizWriter, nowMs: number): Promise<string | null> {
  const id = newQuizId();
  const owner = ownerOf(writer);
  const changed = await db.run(
    `INSERT INTO quiz (id, space_id, subject_id, title, created_at)
     SELECT ?, s.space_id, s.id, ?, MAX(?, COALESCE((SELECT MAX(o.created_at) + 1 FROM quiz o WHERE o.space_id = ? AND o.subject_id = ?), 0))
       FROM subject s WHERE s.id = ? AND s.space_id = ? AND (? IS NULL OR s.publisher_user_id = ?)
        AND (SELECT COUNT(*) FROM quiz c WHERE c.space_id = ? AND c.subject_id = ? AND c.removed_at IS NULL) < ?`,
    id, title, nowMs, spaceId, subjectId, subjectId, spaceId, owner, owner, spaceId, subjectId, QUIZ_PER_SUBJECT_MAX,
  );
  return changed === 1 ? id : null;
}

/** Copies a quiz not removed as a new draft in the same subject, in one statement (AT-1.7): the same title and the given
 * questions (the same, every id new), rev 0, no attempt; null when the subject is full or the source is gone. */
export async function copyQuiz(db: Db, spaceId: string, subjectId: string, sourceId: string, questions: readonly QuizQuestion[], writer: QuizWriter, nowMs: number): Promise<string | null> {
  const id = newQuizId();
  const owner = ownerOf(writer);
  const changed = await db.run(
    `INSERT INTO quiz (id, space_id, subject_id, title, questions_json, rev, state, created_at)
     SELECT ?, quiz.space_id, quiz.subject_id, quiz.title, ?, 0, 'draft',
            MAX(?, COALESCE((SELECT MAX(o.created_at) + 1 FROM quiz o WHERE o.space_id = ? AND o.subject_id = ?), 0))
       FROM quiz WHERE quiz.id = ? AND quiz.space_id = ? AND quiz.subject_id = ? AND quiz.removed_at IS NULL
        AND EXISTS (SELECT 1 FROM subject s WHERE s.id = quiz.subject_id AND s.space_id = quiz.space_id AND (? IS NULL OR s.publisher_user_id = ?))
        AND (SELECT COUNT(*) FROM quiz c WHERE c.space_id = ? AND c.subject_id = ? AND c.removed_at IS NULL) < ?`,
    id, JSON.stringify(questions), nowMs, spaceId, subjectId, sourceId, spaceId, subjectId, owner, owner, spaceId, subjectId, QUIZ_PER_SUBJECT_MAX,
  );
  return changed === 1 ? id : null;
}

// Every write on one quiz below is guarded the same way: this quiz of this space and subject, and the subject still
// the writers (quiz id, space, subject, then the owner twice).

/** Replaces the questions in one statement (add, change or remove a question), guarded by the loaded `rev`, by the quiz
 * not removed and by "no attempt exists" (section 4.5); the rev rises by one. False when the guard did not hold. */
export async function writeQuestions(db: Db, spaceId: string, subjectId: string, quizId: string, questions: readonly QuizQuestion[], rev: number, writer: QuizWriter): Promise<boolean> {
  const owner = ownerOf(writer);
  const changed = await db.run(
    `UPDATE quiz SET questions_json = ?, rev = rev + 1
      WHERE quiz.id = ? AND quiz.space_id = ? AND quiz.subject_id = ?
        AND EXISTS (SELECT 1 FROM subject s WHERE s.id = quiz.subject_id AND s.space_id = quiz.space_id AND (? IS NULL OR s.publisher_user_id = ?))
        AND quiz.removed_at IS NULL AND quiz.rev = ?
        AND NOT EXISTS (SELECT 1 FROM quiz_attempt a WHERE a.quiz_id = quiz.id AND a.space_id = quiz.space_id)`,
    JSON.stringify(questions), quizId, spaceId, subjectId, owner, owner, rev,
  );
  return changed === 1;
}

/** Changes the title in one statement (allowed when locked, section 4.5). */
export async function writeTitle(db: Db, spaceId: string, subjectId: string, quizId: string, title: string, writer: QuizWriter): Promise<boolean> {
  const owner = ownerOf(writer);
  return (await db.run(
    `UPDATE quiz SET title = ?
      WHERE quiz.id = ? AND quiz.space_id = ? AND quiz.subject_id = ?
        AND EXISTS (SELECT 1 FROM subject s WHERE s.id = quiz.subject_id AND s.space_id = quiz.space_id AND (? IS NULL OR s.publisher_user_id = ?))
        AND quiz.removed_at IS NULL`,
    title, quizId, spaceId, subjectId, owner, owner,
  )) === 1;
}

/** The state actions and the state each one leaves (section 4.2). */
export const STATE_ACTIONS = { open: { from: 'draft', to: 'open' }, close: { from: 'open', to: 'closed' }, reopen: { from: 'closed', to: 'open' } } as const;
export type StateAction = keyof typeof STATE_ACTIONS;
export const isStateAction = (v: string): v is StateAction => Object.hasOwn(STATE_ACTIONS, v);

/** Moves the state in one statement, only from the state the action applies to; opening needs a question (AT-1.3). */
export async function writeState(db: Db, spaceId: string, subjectId: string, quizId: string, action: StateAction, writer: QuizWriter): Promise<boolean> {
  const owner = ownerOf(writer);
  const { from, to } = STATE_ACTIONS[action];
  return (await db.run(
    `UPDATE quiz SET state = ?
      WHERE quiz.id = ? AND quiz.space_id = ? AND quiz.subject_id = ?
        AND EXISTS (SELECT 1 FROM subject s WHERE s.id = quiz.subject_id AND s.space_id = quiz.space_id AND (? IS NULL OR s.publisher_user_id = ?))
        AND quiz.removed_at IS NULL AND quiz.state = ? AND json_array_length(quiz.questions_json) > 0`,
    to, quizId, spaceId, subjectId, owner, owner, from,
  )) === 1;
}

/** Removes (hides) a quiz in one statement; its rows stay (section 6.3). */
export async function writeRemoved(db: Db, spaceId: string, subjectId: string, quizId: string, writer: QuizWriter, nowMs: number): Promise<boolean> {
  const owner = ownerOf(writer);
  return (await db.run(
    `UPDATE quiz SET removed_at = ?
      WHERE quiz.id = ? AND quiz.space_id = ? AND quiz.subject_id = ?
        AND EXISTS (SELECT 1 FROM subject s WHERE s.id = quiz.subject_id AND s.space_id = quiz.space_id AND (? IS NULL OR s.publisher_user_id = ?))
        AND quiz.removed_at IS NULL`,
    nowMs, quizId, spaceId, subjectId, owner, owner,
  )) === 1;
}

/** Restores a removed quiz in its earlier state, in one statement, while the subject has room (it counts again). */
export async function writeRestored(db: Db, spaceId: string, subjectId: string, quizId: string, writer: QuizWriter): Promise<boolean> {
  const owner = ownerOf(writer);
  return (await db.run(
    `UPDATE quiz SET removed_at = NULL
      WHERE quiz.id = ? AND quiz.space_id = ? AND quiz.subject_id = ?
        AND EXISTS (SELECT 1 FROM subject s WHERE s.id = quiz.subject_id AND s.space_id = quiz.space_id AND (? IS NULL OR s.publisher_user_id = ?))
        AND quiz.removed_at IS NOT NULL
        AND (SELECT COUNT(*) FROM quiz c WHERE c.space_id = ? AND c.subject_id = ? AND c.removed_at IS NULL) < ?`,
    quizId, spaceId, subjectId, owner, owner, spaceId, subjectId, QUIZ_PER_SUBJECT_MAX,
  )) === 1;
}

/** How many quizzes not removed the subject holds (read only after a refused create, copy or restore, to tell the limit from a lost gate). */
export async function quizCount(db: Db, spaceId: string, subjectId: string): Promise<number> {
  const r = await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM quiz c WHERE c.space_id = ? AND c.subject_id = ? AND c.removed_at IS NULL', spaceId, subjectId);
  return Number(r?.n ?? 0);
}

// -------------------------------------------------------------- results ----
// Section 5.5, AT-2: the responsible publisher only. Attempts of people whose access to the space ended are left out
// until it returns; unassigned learners stay. The page is two statements after the gate and the quiz: the names
// (QUIZ_RESULTS_PAGE at most) and one summary row.

/** One row of a results page. `sameName` holds the usernames of everyone listed with the same name (the exam pages rule). */
export interface QuizResultRow { id: string; display_name: string; username: string; score: number; question_count: number; sent_at: number; sameName: string[] }

/** One results page (1-based), in name order (the count comes from quizSummary). */
export async function quizResults(db: Db, spaceId: string, quizId: string, today: string, page: number): Promise<QuizResultRow[]> {
  const rows = await db.all<{ id: string; display_name: string; username: string; score: number; question_count: number; sent_at: number; same_name: string }>(
    `WITH r AS (
       SELECT a.learner_user_id AS id, u.display_name, u.username, a.score, a.question_count, a.sent_at
         FROM quiz_attempt a JOIN user u ON u.id = a.learner_user_id
        WHERE a.quiz_id = ? AND a.space_id = ?
          AND EXISTS (SELECT 1 FROM membership m WHERE m.space_id = a.space_id AND m.user_id = a.learner_user_id AND m.role = 'learner'
                         AND m.ended_on IS NULL AND m.valid_from <= ? AND m.valid_until >= ?))
     SELECT r.id, r.display_name, r.username, r.score, r.question_count, r.sent_at,
            group_concat(r.username, char(10)) OVER (PARTITION BY r.display_name) AS same_name
       FROM r ORDER BY r.display_name, r.username, r.id LIMIT ? OFFSET ?`,
    quizId, spaceId, today, today, QUIZ_RESULTS_PAGE, (page - 1) * QUIZ_RESULTS_PAGE,
  );
  return rows.map((r) => ({
    id: r.id, display_name: r.display_name, username: r.username, score: Number(r.score), question_count: Number(r.question_count), sent_at: Number(r.sent_at),
    sameName: String(r.same_name ?? '').split('\n').filter((u) => u !== r.username),
  }));
}

/** The count and the per-question summary, in one row (right_flags summed per position, one column per possible
 * question, QUIZ_QUESTIONS_MAX of them): how many listed attempts got each question right. */
export async function quizSummary(db: Db, spaceId: string, quizId: string, today: string, questionCount: number): Promise<{ n: number; right: number[] }> {
  const row = await db.first<Record<string, number>>(
    `SELECT COUNT(*) AS n,
            TOTAL(substr(a.right_flags, 1, 1) = '1') AS r1, TOTAL(substr(a.right_flags, 2, 1) = '1') AS r2,
            TOTAL(substr(a.right_flags, 3, 1) = '1') AS r3, TOTAL(substr(a.right_flags, 4, 1) = '1') AS r4,
            TOTAL(substr(a.right_flags, 5, 1) = '1') AS r5, TOTAL(substr(a.right_flags, 6, 1) = '1') AS r6,
            TOTAL(substr(a.right_flags, 7, 1) = '1') AS r7, TOTAL(substr(a.right_flags, 8, 1) = '1') AS r8,
            TOTAL(substr(a.right_flags, 9, 1) = '1') AS r9, TOTAL(substr(a.right_flags, 10, 1) = '1') AS r10,
            TOTAL(substr(a.right_flags, 11, 1) = '1') AS r11, TOTAL(substr(a.right_flags, 12, 1) = '1') AS r12,
            TOTAL(substr(a.right_flags, 13, 1) = '1') AS r13, TOTAL(substr(a.right_flags, 14, 1) = '1') AS r14,
            TOTAL(substr(a.right_flags, 15, 1) = '1') AS r15, TOTAL(substr(a.right_flags, 16, 1) = '1') AS r16,
            TOTAL(substr(a.right_flags, 17, 1) = '1') AS r17, TOTAL(substr(a.right_flags, 18, 1) = '1') AS r18,
            TOTAL(substr(a.right_flags, 19, 1) = '1') AS r19, TOTAL(substr(a.right_flags, 20, 1) = '1') AS r20
       FROM quiz_attempt a
      WHERE a.quiz_id = ? AND a.space_id = ?
        AND EXISTS (SELECT 1 FROM membership m WHERE m.space_id = a.space_id AND m.user_id = a.learner_user_id AND m.role = 'learner'
                       AND m.ended_on IS NULL AND m.valid_from <= ? AND m.valid_until >= ?)`,
    quizId, spaceId, today, today,
  );
  return { n: Number(row?.n ?? 0), right: Array.from({ length: questionCount }, (_, i) => Number(row?.[`r${i + 1}`] ?? 0)) };
}

// ------------------------------------------------------------- learners ----
// W7-2 (sections 5.1 to 5.4, 5.6): the learners side. The subject page reads one statement (the open quizzes and
// the closed ones this learner took, with their own score, never a question text); the take and result pages read
// one quiz with this learners own attempt; a sending is one insert that re-checks the state, the rev and the removal.

/** One quiz of the subject page (section 5.1): `score` and `total` only when this learner took it. */
export interface LearnerQuizRow { id: string; title: string; questions: number; score: number | null; total: number | null }

/** The subject pages quizzes for one learner (one statement, section 6.1): open quizzes not taken first, then taken
 * ones (open or closed), each group in creation order; never drafts or removed quizzes. A made-up learner (the
 * preview, or staff reading the subject) passes an id that has no attempt. The question count comes from
 * json_array_length, so no question text, answer or key is returned. */
export async function learnerQuizzes(db: Db, spaceId: string, subjectId: string, learnerId: string): Promise<LearnerQuizRow[]> {
  const rows = await db.all<{ id: string; title: string; questions: number; score: number | null; total: number | null }>(
    `SELECT quiz.id, quiz.title, json_array_length(quiz.questions_json) AS questions, a.score, a.question_count AS total
       FROM quiz LEFT JOIN quiz_attempt a ON a.quiz_id = quiz.id AND a.space_id = quiz.space_id AND a.learner_user_id = ?
      WHERE quiz.space_id = ? AND quiz.subject_id = ? AND quiz.removed_at IS NULL
        AND (quiz.state = 'open' OR (quiz.state = 'closed' AND a.id IS NOT NULL))
      ORDER BY a.id IS NOT NULL, quiz.created_at, quiz.id`,
    learnerId, spaceId, subjectId,
  );
  return rows.map((r) => ({ id: r.id, title: r.title, questions: Number(r.questions), score: r.score === null ? null : Number(r.score), total: r.total === null ? null : Number(r.total) }));
}

/** A quiz as the take and result pages read it, with this learners own attempt (null when none). */
export interface TakeRow {
  id: string;
  subject_id: string;
  title: string;
  state: QuizState;
  rev: number;
  removed_at: number | null;
  questions: QuizQuestion[];
  attempt: { answers: Record<string, string>; score: number; total: number; sent_at: number } | null;
}

/** The quiz an address names in this space (one read), removed ones too (the caller decides); null when there is none. */
export async function quizToTake(db: Db, spaceId: string, quizId: string, learnerId: string): Promise<TakeRow | null> {
  const r = await db.first<{ id: string; subject_id: string; title: string; state: QuizState; rev: number; removed_at: number | null; questions_json: string; answers_json: string | null; score: number | null; total: number | null; sent_at: number | null }>(
    `SELECT quiz.id, quiz.subject_id, quiz.title, quiz.state, quiz.rev, quiz.removed_at, quiz.questions_json,
            a.answers_json, a.score, a.question_count AS total, a.sent_at
       FROM quiz LEFT JOIN quiz_attempt a ON a.quiz_id = quiz.id AND a.space_id = quiz.space_id AND a.learner_user_id = ?
      WHERE quiz.id = ? AND quiz.space_id = ?`,
    learnerId, quizId, spaceId,
  );
  if (!r) return null;
  return {
    id: r.id, subject_id: r.subject_id, title: r.title, state: r.state, rev: Number(r.rev), removed_at: r.removed_at,
    questions: parseQuestions(r.questions_json),
    attempt: r.answers_json === null ? null : { answers: parseAnswers(r.answers_json), score: Number(r.score), total: Number(r.total), sent_at: Number(r.sent_at) },
  };
}

/** The posted answers of a take form: `q-<question id>` to the chosen answer id (section 5.3). */
export function postedAnswers(body: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(body)) {
    if (name.startsWith('q-') && typeof value === 'string' && value !== '') out[name.slice(2)] = value;
  }
  return out;
}

/** Stores one sending in one statement (section 5.3): only while the quiz is open, not removed and at the loaded rev;
 * a second sending by the same learner stores nothing (the unique pair). True when the row was stored. */
export async function insertAttempt(db: Db, v: { spaceId: string; quizId: string; learnerId: string; rev: number; built: BuiltAttempt; nowMs: number }): Promise<boolean> {
  return (await db.run(
    `INSERT INTO quiz_attempt (id, space_id, quiz_id, learner_user_id, rev, answers_json, right_flags, score, question_count, sent_at)
     SELECT ?, quiz.space_id, quiz.id, ?, quiz.rev, ?, ?, ?, ?, ?
       FROM quiz WHERE quiz.id = ? AND quiz.space_id = ? AND quiz.state = 'open' AND quiz.removed_at IS NULL AND quiz.rev = ?
     ON CONFLICT DO NOTHING`,
    newQuizId(), v.learnerId, v.built.answers_json, v.built.right_flags, v.built.score, v.built.question_count, v.nowMs, v.quizId, v.spaceId, v.rev,
  )) === 1;
}

/** One listed learners attempt on the quiz (their answers page), or null (no attempt, another space, or access ended). */
export interface QuizAttemptRow { id: string; display_name: string; username: string; answers: Record<string, string>; score: number; question_count: number; sent_at: number }

export async function quizAttemptOf(db: Db, spaceId: string, quizId: string, learnerId: string, today: string): Promise<QuizAttemptRow | null> {
  const r = await db.first<{ id: string; display_name: string; username: string; answers_json: string; score: number; question_count: number; sent_at: number }>(
    `SELECT a.learner_user_id AS id, u.display_name, u.username, a.answers_json, a.score, a.question_count, a.sent_at
       FROM quiz_attempt a JOIN user u ON u.id = a.learner_user_id
      WHERE a.quiz_id = ? AND a.space_id = ? AND a.learner_user_id = ?
        AND EXISTS (SELECT 1 FROM membership m WHERE m.space_id = a.space_id AND m.user_id = a.learner_user_id AND m.role = 'learner'
                       AND m.ended_on IS NULL AND m.valid_from <= ? AND m.valid_until >= ?)`,
    quizId, spaceId, learnerId, today, today,
  );
  if (!r) return null;
  return { id: r.id, display_name: r.display_name, username: r.username, answers: parseAnswers(r.answers_json), score: Number(r.score), question_count: Number(r.question_count), sent_at: Number(r.sent_at) };
}
