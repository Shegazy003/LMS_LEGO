// LMS wave 7, W7-2 (product-contract v2 on PIL-261, sections 5.1 to 5.4 and
// 5.6; ux-plan UX-72 to UX-74, UX-76 to UX-79): the learners side of quizzes.
// The quiz section of a subject page, the take page and the result page. The
// preview draws the same functions with its own addresses (learnerUrl).
// Plain HTML that works without script, and no script element at all: the
// take page carries no part of the key (no marker of the right answer in any
// tag, attribute or order; answers in the teachers order with random ids),
// and the server scores the sending. A refused sending shows its message at
// the top (role="alert", autofocus) with the answers that still fit checked.
// Teacher text is only shown as escaped text: titles in <bdi>, question and
// answer texts with dir="auto" (a line break shows through CSS pre-line).
// The result page reuses quizResultBody (W7-1), the same drawer as the
// teachers answers page. The CSS is the `/* wave 7 quizzes */` block.
import { html } from 'hono/html';
import { utcDate } from '../access.ts';
import type { Label, Lang } from '../labels.ts';
import type { LearnerQuizRow, QuizQuestion } from '../quiz.ts';
import { sentence, type Html } from './layout.ts';
import { spacePage } from './learn.ts';
import { filled, quizResultBody } from './quizzes.ts';
import { learnerUrl, type SpaceView } from './space.ts';

/** Items shown before the fold on the subject page (section 5.1). */
export const QUIZ_SECTION_SHOWN = 5;

const title = (text: string) => html`<bdi>${text}</bdi>`;

// --------------------------------------------------------- subject page ----

/** The quiz section of a subject page (UX-72), or nothing when the learner has no quiz to list. */
export function quizSection(t: Label, space: SpaceView, rows: readonly LearnerQuizRow[]): Html | string {
  if (rows.length === 0) return '';
  const item = (r: LearnerQuizRow) => html`<li class="quiz-row"><a class="quiz-row-link" href="${learnerUrl(space, r.score === null ? `/quiz/${r.id}` : `/quiz/${r.id}/result`)}">${title(r.title)}</a>
<span class="quiz-meta">${r.score === null
    ? sentence(t, 'quizNotTaken', { n: String(r.questions) })
    : sentence(t, 'quizTakenScore', { score: String(r.score), total: String(r.total ?? r.questions) })}</span></li>`;
  const shown = rows.slice(0, QUIZ_SECTION_SHOWN);
  const more = rows.slice(QUIZ_SECTION_SHOWN);
  return html`
<section id="quizzes" class="card quiz-section" aria-labelledby="quizzes-title"><h2 id="quizzes-title">${t('quizSectionTitle')}</h2>
<ul class="quiz-list">${shown.map(item)}</ul>${more.length
    ? html`
<details id="quiz-more" class="quiz-fold"><summary>${sentence(t, 'quizMoreTitle', { n: String(more.length) })}</summary><ul class="quiz-list">${more.map(item)}</ul></details>`
    : ''}
</section>`;
}

// ------------------------------------------------------------ take page ----

/** The take page (UX-73): every question a fieldset of radio buttons, one form, one primary button. `checked` holds
 * the answers kept after a refused sending; `message` the refusal shown at the top. */
export function quizTakePage(
  t: Label,
  lang: Lang,
  space: SpaceView,
  v: { quiz: { id: string; title: string; rev: number; questions: readonly QuizQuestion[] }; checked: Readonly<Record<string, string>>; message: string | null },
): Html {
  const q = v.quiz;
  const question = (x: QuizQuestion, i: number) => html`<fieldset class="quiz-question card"><legend>${sentence(t, 'quizQuestionHeading', { n: String(i + 1) })}: <span class="quiz-text" dir="auto">${x.text}</span></legend>
${x.answers.map((a) => html`<label class="quiz-choice"><input type="radio" class="quiz-radio" name="q-${x.id}" value="${a.id}" required${v.checked[x.id] === a.id ? html` checked` : ''}> <span class="quiz-answer-text" dir="auto">${a.text}</span></label>
`)}</fieldset>
`;
  const body = html`<h1 id="quiz-take-title" dir="auto">${title(q.title)}</h1>
<div class="quiz-page">${v.message ? html`<p id="quiz-message" class="error" role="alert" tabindex="-1" autofocus>${v.message}</p>` : ''}
<p class="quiz-help">${sentence(t, 'quizTakeHelp', { n: String(q.questions.length) })}</p>
<form id="quiz-take" class="quiz-form" method="post" action="${learnerUrl(space, `/quiz/${q.id}`)}"><input type="hidden" name="rev" value="${q.rev}">
${q.questions.map(question)}<button type="submit">${t('quizSubmit')}</button></form>
</div>`;
  return spacePage(t, lang, space, q.title, body);
}

// ---------------------------------------------------------- result page ----

/** The result page (UX-74): the score line, the sent date, the shared drawer, the way back. `status` is
 * quizAlreadySent after a second sending, or quizPreviewNotSaved in the preview. */
export function quizResultPage(
  t: Label,
  lang: Lang,
  space: SpaceView,
  v: {
    quiz: { title: string; questions: readonly QuizQuestion[] };
    subject: { id: string; title: string };
    answers: Readonly<Record<string, string>>;
    score: number;
    total: number;
    sentAt: number;
    status: 'quizAlreadySent' | 'quizPreviewNotSaved' | null;
  },
): Html {
  const body = html`<h1 id="quiz-result-title" dir="auto">${filled(t, 'quizResultTitle', { title: title(v.quiz.title) })}</h1>
<div class="quiz-page">${v.status ? html`<p class="quiz-status done" role="status" tabindex="-1" autofocus>${t(v.status)}</p>` : ''}
<p id="quiz-score" class="quiz-score">${sentence(t, 'quizScoreLine', { score: String(v.score), total: String(v.total) })}</p>
<p class="quiz-sub">${filled(t, 'quizSentOn', { date: html`<bdi dir="ltr" class="quiz-date">${utcDate(v.sentAt)}</bdi>` })}</p>
${quizResultBody(t, v.quiz.questions, v.answers)}
<p class="quiz-back"><a id="quiz-back" href="${learnerUrl(space, `/learn/${v.subject.id}`)}"><span>${filled(t, 'quizBackToSubject', { subjectTitle: title(v.subject.title) })}</span></a></p>
</div>`;
  return spacePage(t, lang, space, t('quizResultTitle', { title: v.quiz.title }), body);
}
