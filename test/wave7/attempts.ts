// LMS wave 7 (product-contract v2 on PIL-261, section 3, W7-b and section
// 6.1): attempts written directly into the rows, each built by the product's
// own pure scorer `buildAttempt` (src/quiz.ts), so a test attempt is exactly
// the row W7-2's sending stores for the same answers (AT-3.10b compares them).
// Used by W7-1 before learners can take a quiz. Made-up data only.
import assert from 'node:assert/strict';
import { buildAttempt, type QuizQuestion } from '../../src/quiz.ts';

type Sql = (q: string) => Promise<Record<string, unknown>[]>;
const q = (s: string) => s.replace(/'/g, "''");

/** The row buildAttempt gives for these answers (`posted`: question id to the chosen answer id; a question left out is unanswered). */
export function attemptRow(questions: readonly QuizQuestion[], posted: Record<string, string>) {
  const built = buildAttempt(questions, posted);
  assert.ok(built, 'the posted ids belong to the quiz');
  return built;
}

/** Writes one attempt of `learner` on a quiz, as buildAttempt scores it; returns its score. */
export async function writeAttempt(
  sql: Sql,
  v: { id?: string; space: string; quiz: string; rev?: number; learner: string; questions: readonly QuizQuestion[]; posted: Record<string, string>; sentAt: number },
): Promise<number> {
  const built = attemptRow(v.questions, v.posted);
  const id = v.id ?? `w7b-${v.quiz}-${v.learner}`;
  await sql(`INSERT INTO quiz_attempt (id, space_id, quiz_id, learner_user_id, rev, answers_json, right_flags, score, question_count, sent_at)
    VALUES ('${q(id)}', '${q(v.space)}', '${q(v.quiz)}', '${q(v.learner)}', ${v.rev ?? 0}, '${q(built.answers_json)}', '${built.right_flags}', ${built.score}, ${built.question_count}, ${v.sentAt})`);
  return built.score;
}

/** Answers every question of a quiz: `pick(i)` gives, for question i, 'right', 'wrong' or null (no answer). */
export function answersFor(questions: readonly QuizQuestion[], pick: (i: number) => 'right' | 'wrong' | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [i, question] of questions.entries()) {
    const p = pick(i);
    if (p === null) continue;
    out[question.id] = p === 'right' ? question.rightId : question.answers.find((a) => a.id !== question.rightId)!.id;
  }
  return out;
}

/** Many attempts in one statement (W7-e: 300 learners on QL), each scored by buildAttempt; `rows` gives each learner and its answers. */
export async function writeAttempts(sql: Sql, v: { space: string; quiz: string; questions: readonly QuizQuestion[]; sentAt: number; rows: { learner: string; posted: Record<string, string> }[] }): Promise<void> {
  for (let i = 0; i < v.rows.length; i += 100) {
    const values = v.rows.slice(i, i + 100).map((r) => {
      const built = attemptRow(v.questions, r.posted);
      return `('${q(`w7e-${v.quiz}-${r.learner}`)}', '${q(v.space)}', '${q(v.quiz)}', '${q(r.learner)}', 0, '${q(built.answers_json)}', '${built.right_flags}', ${built.score}, ${built.question_count}, ${v.sentAt})`;
    });
    await sql(`INSERT INTO quiz_attempt (id, space_id, quiz_id, learner_user_id, rev, answers_json, right_flags, score, question_count, sent_at) VALUES ${values.join(', ')}`);
  }
}
