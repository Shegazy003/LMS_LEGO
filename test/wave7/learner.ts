// LMS wave 7, W7-2 (product-contract v2 on PIL-261, sections 5.1 to 5.4 and
// 5.6): reading the learner's pages in tests. The quiz section of a subject
// page, the take page and the result page, parsed from the product's markup;
// the learner addresses; and a reset to W7-a without attempts, so each CI
// step (each runs alone) starts from the same world. Made-up data only.
import assert from 'node:assert/strict';
import type { Client } from '../support/http.ts';
import { messageOf, statusOf, textOf, withW7a, type Wave1World } from './world.ts';

const unescape = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

export const takePath = (s: { id: string }, quizId: string) => `/s/${s.id}/quiz/${quizId}`;
export const resultPath = (s: { id: string }, quizId: string) => `/s/${s.id}/quiz/${quizId}/result`;
export const previewTakePath = (s: { id: string }, quizId: string) => `/s/${s.id}/preview/quiz/${quizId}`;

/** A GET that must answer `status`; its body. */
export async function htmlOf(c: Client, path: string, status = 200): Promise<string> {
  const res = await c.get(path);
  assert.equal(res.status, status, `GET ${path}`);
  return res.text();
}

/** The fields of a take form: rev and one q-<question id> per answered question. */
export function sending(rev: number, picks: Record<string, string>): Record<string, string> {
  return { rev: String(rev), ...Object.fromEntries(Object.entries(picks).map(([q, a]) => [`q-${q}`, a])) };
}

export interface SectionItem { href: string; title: string; meta: string }
const ITEM = /<li class="quiz-row"><a class="quiz-row-link" href="([^"]+)"><bdi>([\s\S]*?)<\/bdi><\/a>\s*<span class="quiz-meta">([\s\S]*?)<\/span><\/li>/g;
const items = (fragment: string): SectionItem[] => [...fragment.matchAll(ITEM)].map((m) => ({ href: unescape(m[1]), title: unescape(m[2]), meta: textOf(m[3]) }));

/** The quiz section of a subject page (UX-72), or null when there is none. */
export function sectionOf(page: string) {
  const m = /<section id="quizzes" class="card quiz-section"[^>]*>([\s\S]*?)<\/section>/.exec(page);
  if (!m) return null;
  const fold = /<details id="quiz-more" class="quiz-fold"( open)?><summary>([\s\S]*?)<\/summary><ul class="quiz-list">([\s\S]*?)<\/ul><\/details>/.exec(m[1]);
  const list = /<ul class="quiz-list">([\s\S]*?)<\/ul>/.exec(m[1])?.[1] ?? '';
  return {
    html: m[0], at: m.index,
    heading: textOf(/<h2 id="quizzes-title">([\s\S]*?)<\/h2>/.exec(m[1])?.[1] ?? ''),
    items: items(list),
    fold: fold ? { open: Boolean(fold[1]), summary: textOf(fold[2]), items: items(fold[3]) } : null,
  };
}

export interface Choice { name: string; value: string; checked: boolean; text: string }

/** The take page's form (UX-73), or null. */
export function takeOf(page: string) {
  const form = /<form id="quiz-take" class="quiz-form" method="post" action="([^"]+)">([\s\S]*?)<\/form>/.exec(page);
  if (!form) return null;
  const questions = [...form[2].matchAll(/<fieldset class="quiz-question card"><legend>([\s\S]*?)<\/legend>([\s\S]*?)<\/fieldset>/g)].map((m) => ({
    legend: textOf(m[1]),
    text: unescape(/<span class="quiz-text" dir="auto">([\s\S]*?)<\/span>/.exec(m[1])?.[1] ?? ''),
    choices: [...m[2].matchAll(/<label class="quiz-choice"><input type="radio" class="quiz-radio" name="([^"]+)" value="([^"]+)" required( checked)?> <span class="quiz-answer-text" dir="auto">([\s\S]*?)<\/span><\/label>/g)]
      .map((c): Choice => ({ name: unescape(c[1]), value: unescape(c[2]), checked: Boolean(c[3]), text: unescape(c[4]) })),
  }));
  return {
    action: unescape(form[1]),
    rev: Number(/<input type="hidden" name="rev" value="(\d+)">/.exec(form[2])?.[1] ?? -1),
    title: textOf(/<h1 id="quiz-take-title" dir="auto">([\s\S]*?)<\/h1>/.exec(page)?.[1] ?? ''),
    titleInBdi: /<h1 id="quiz-take-title" dir="auto"><bdi>/.test(page),
    help: textOf(/<p class="quiz-help">([\s\S]*?)<\/p>/.exec(page)?.[1] ?? ''),
    submit: textOf(/<button type="submit">([\s\S]*?)<\/button>/.exec(form[2])?.[1] ?? ''),
    questions,
    checked: Object.fromEntries(questions.flatMap((q) => q.choices.filter((c) => c.checked).map((c) => [c.name.replace(/^q-/, ''), c.value]))),
    message: messageOf(page),
  };
}

/** The result page (UX-74): title, status, score line, sent line, each question's answers and verdict, the back link. */
export function resultOf(page: string) {
  const sections = [...page.matchAll(/<section class="quiz-question card">([\s\S]*?)<\/section>/g)].map((m) => ({
    heading: textOf(/<h2>([\s\S]*?)<\/h2>/.exec(m[1])?.[1] ?? ''),
    answers: [...m[1].matchAll(/<li class="quiz-answer[^"]*">([\s\S]*?)<\/li>/g)].map((a) => textOf(a[1])),
    verdict: textOf(/<p class="quiz-verdict [a-z-]+">([\s\S]*?)<\/p>/.exec(m[1])?.[1] ?? ''),
  }));
  const back = /<p class="quiz-back"><a id="quiz-back" href="([^"]+)">([\s\S]*?)<\/a><\/p>/.exec(page);
  return {
    title: textOf(/<h1 id="quiz-result-title" dir="auto">([\s\S]*?)<\/h1>/.exec(page)?.[1] ?? ''),
    status: statusOf(page),
    score: textOf(/<p id="quiz-score" class="quiz-score">([\s\S]*?)<\/p>/.exec(page)?.[1] ?? ''),
    sent: textOf(/<p class="quiz-sub">([\s\S]*?)<\/p>/.exec(page)?.[1] ?? ''),
    dateLtr: /<p class="quiz-sub">[\s\S]*?<bdi dir="ltr" class="quiz-date">\d{4}-\d{2}-\d{2}<\/bdi>/.test(page),
    sections,
    back: back ? { href: unescape(back[1]), text: textOf(back[2]) } : null,
  };
}

/** Back to W7-a with no attempt: every quiz row and attempt deleted, W7-a written again (test data only). */
export async function resetQuizzes(w: Wave1World): Promise<void> {
  await w.p.sql('DELETE FROM quiz_attempt');
  await w.p.sql('DELETE FROM quiz');
  await withW7a(w);
}

/** The stored attempts, comparable. */
export const attemptsOf = (w: Wave1World, quizId: string) =>
  w.p.sql(`SELECT space_id, quiz_id, learner_user_id, rev, answers_json, right_flags, score, question_count, sent_at FROM quiz_attempt WHERE quiz_id = '${quizId}' ORDER BY learner_user_id`);
