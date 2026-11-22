// LMS wave 7, W7-1 (product-contract v2 on PIL-261, sections 4.2 and 5.5;
// ux-plan UX-68 to UX-71, UX-75, UX-77 to UX-79): the quiz card on a subjects
// editor and on its admin page, the quiz list, the quiz editor, and the
// responsible publishers results pages. Plain forms that work without script;
// with script the status line, or the refused field, takes focus. The admins
// pages and every editor show no learner name, score or count; only the
// responsible publishers list and results pages read attempts.
// Every word comes from the label function. Teacher text (titles, questions,
// answers) is only ever shown as escaped text: titles in <bdi>, question and
// answer texts in an element with dir="auto" (a questions line break shows
// through CSS pre-line). Dates are Latin-digit YYYY-MM-DD inside dir="ltr".
// The CSS is the `/* wave 7 quizzes */` block of layout.ts.
// `quizResultBody` draws one attempts questions with the chosen answer, the
// right answer and the verdict; W7-2s result page and preview reuse it.
import { html, raw } from 'hono/html';
import { utcDate } from '../access.ts';
import { secondIds } from '../exams.ts';
import type { Label, LabelKey, Lang } from '../labels.ts';
import {
  QUIZ_OPTIONS_MAX, QUIZ_OPTIONS_MIN, QUIZ_OPTION_MAX, QUIZ_QUESTIONS_MAX, QUIZ_TEXT_MAX, QUIZ_TITLE_MAX,
  type QuizListRow, type QuizQuestion, type QuizResultRow, type QuizRow, type QuizState,
} from '../quiz.ts';
import { sentence, type Html } from './layout.ts';
import { spacePage } from './learn.ts';
import type { SpaceView } from './space.ts';

/** A kit word as it reads inside a sentence (lower case in English; Arabic has no case). */
const low = (t: Label, lang: Lang, key: 'learner' | 'admin' | 'guardian') => t(key).toLocaleLowerCase(lang);

/** A product sentence whose values are ready markup (a title in <bdi>). */
export function filled(t: Label, key: LabelKey, values: Record<string, Html | string>): (Html | string)[] {
  const names = Object.keys(values);
  const markers = Object.fromEntries(names.map((n, i) => [n, `\u0001${i}\u0002`]));
  return t(key, markers).split(/\u0001(\d+)\u0002/).map((part, i) => (i % 2 === 1 ? values[names[Number(part)]] : part));
}

const title = (text: string) => html`<bdi>${text}</bdi>`;
const STATE_KEY: Record<QuizState, LabelKey> = { draft: 'quizStateDraft', open: 'quizStateOpen', closed: 'quizStateClosed' };

/** With script: the refused field, else the top message, else the status line takes focus (UX-71). */
const FOCUS_SCRIPT = `(function(){var e=document.querySelector('.quiz-page [aria-invalid=true]')||document.querySelector('#quiz-message')||document.querySelector('.quiz-page .quiz-status');if(e){e.focus();addEventListener('load',function(){e.focus();});}})();`;
const focus = html`<script>${raw(FOCUS_SCRIPT)}</script>`;

const back = (t: Label, href: string) => html`<p class="quiz-back"><a id="quiz-back" href="${href}">${t('back')}</a></p>`;
const status = (text: string, failed = false) => html`<p class="quiz-status ${failed ? 'error' : 'done'}" role="status" tabindex="-1">${text}</p>`;
const fieldError = (id: string, text: string) => html`<p id="${id}" class="error quiz-error">${text}</p>`;
const invalid = (errorId: string) => html` aria-invalid="true" aria-describedby="${errorId}"`;

// --------------------------------------------------------------- the card ----

/** The quiz card (section 4.2, UX-68): heading, help, the link to the quiz list. A link only: no count, no read. */
export function quizCard(t: Label, lang: Lang, href: string, subjectTitle: string): Html {
  return html`<section id="quizzes" class="card" aria-labelledby="quizzes-title"><h2 id="quizzes-title">${t('quizCardTitle')}</h2>
<p class="quiz-help">${filled(t, 'quizCardHelp', { learner: low(t, lang, 'learner'), subjectTitle: title(subjectTitle), admin: low(t, lang, 'admin'), guardian: low(t, lang, 'guardian') })}</p>
<p class="quiz-manage"><a class="quiz-link-button" href="${href}">${t('quizManageLink')}</a></p>
</section>`;
}

// --------------------------------------------------------------- the list ----

/** What the list says after a press: only when it matches the stored state of that quiz. */
export type QuizListStatus = { said: 'removed' | 'restored' | 'failed'; title: string } | null;

export function quizListPage(
  t: Label,
  lang: Lang,
  space: SpaceView,
  v: {
    subjectTitle: string;
    back: string;
    /** The list's own address (the create form posts here; each quiz is under it). */
    path: string;
    rows: QuizListRow[];
    /** The responsible publisher's list: each quiz shows its results link with the count of attempts. */
    publisher: boolean;
    status: QuizListStatus;
    /** A refused create (title kept), or a refused restore (quizLimit). */
    refusal: { kept: string; error: string } | null;
    restoreRefused: string | null;
  },
): Html {
  const shown = v.rows.filter((r) => r.removed_at === null);
  const removed = v.rows.filter((r) => r.removed_at !== null);
  const said = v.status
    ? status(t(v.status.said === 'removed' ? 'quizRemoved' : v.status.said === 'restored' ? 'quizRestored' : 'markFailed'), v.status.said === 'failed')
    : '';
  const err = v.refusal ? fieldError('quiz-new-error', v.refusal.error) : '';
  const row = (r: QuizListRow) => html`<li class="quiz-row" id="quiz-${r.id}"><a class="quiz-row-link" href="${v.path}/${r.id}">${title(r.title)}</a>
<span class="quiz-meta"><span class="quiz-state">${t(STATE_KEY[r.state])}</span> · <span class="quiz-count">${sentence(t, 'quizQuestionCount', { n: String(r.questions) })}</span></span>${v.publisher
    ? html`
<a class="quiz-results-link" href="${v.path}/${r.id}/results">${sentence(t, 'quizResultsLink', { n: String(r.attempts ?? 0) })}</a>`
    : ''}</li>`;
  const restoreRow = (r: QuizListRow) => html`<li class="quiz-row" id="quiz-${r.id}"><span class="quiz-row-title">${title(r.title)}</span>
<form class="quiz-restore" method="post" action="${v.path}/${r.id}/restore"><button type="submit" class="quiz-secondary" aria-label="${t('quizRestoreFor', { title: r.title })}">${t('quizRestore')}</button></form></li>`;
  const body = html`${back(t, v.back)}
<h1 id="quiz-list-title" dir="auto">${filled(t, 'quizListTitle', { subjectTitle: title(v.subjectTitle) })}</h1>
<div class="quiz-page">${said}${v.restoreRefused ? html`<p id="quiz-message" class="error" role="alert" tabindex="-1">${v.restoreRefused}</p>` : ''}
<form id="quiz-new" class="quiz-form card" method="post" action="${v.path}"><label for="quiz-new-title">${t('quizNewLabel')}</label>
<input id="quiz-new-title" name="title" required maxlength="${QUIZ_TITLE_MAX}" dir="auto" value="${v.refusal?.kept ?? ''}"${v.refusal ? invalid('quiz-new-error') : ''}>${err}
<button type="submit">${t('quizCreate')}</button></form>
${shown.length ? html`<ul id="quiz-list" class="quiz-list">${shown.map(row)}</ul>` : ''}
${removed.length ? html`<details id="quiz-removed" class="quiz-fold"><summary>${sentence(t, 'quizRemovedTitle', { n: String(removed.length) })}</summary><ul class="quiz-list">${removed.map(restoreRow)}</ul></details>` : ''}
</div>${focus}`;
  return spacePage(t, lang, space, t('quizCardTitle'), body);
}

// ------------------------------------------------------------- the editor ----

/** What the editor says after a press (section 4.2): only when it matches the stored state. */
export type QuizEditorStatus =
  | { at: 'state'; key: 'quizCreated' | 'quizSaved' | 'quizOpened' | 'quizClosed' | 'quizCopied' | 'markFailed' }
  | { at: 'question'; key: 'quizQuestionSaved' | 'markFailed'; question: string }
  | { at: 'questions'; key: 'quizQuestionRemoved' }
  | null;

/** The values a refused question form keeps (UX-71). */
export interface QuestionKept { text: string; answers: string[]; right: string }

/** A refused value (400): which form, the message, the field it concerns, and what that form keeps. */
export type QuizEditorRefusal =
  | { form: 'title'; kept: string; error: string }
  | { form: 'question'; question: string | 'new'; field: string; error: string; kept: QuestionKept }
  | { form: 'copy'; error: string }
  | null;

/** One question form's fields (UX-70): the text, five answer boxes each with its right-answer radio, the help, the button. */
function questionFields(t: Label, v: { key: string; n: number | null; kept: QuestionKept; refusal: { field: string; error: string } | null }): Html {
  const id = (f: string) => `q-${v.key}-${f}`;
  const errId = id('error');
  const err = v.refusal ? fieldError(errId, v.refusal.error) : '';
  const bad = (f: string) => (v.refusal && v.refusal.field === f ? invalid(errId) : '');
  const answers = Array.from({ length: QUIZ_OPTIONS_MAX }, (_, i) => {
    const box = String(i + 1);
    return html`<div class="quiz-option"><label for="${id(`a${box}`)}">${sentence(t, 'quizOptionLabel', { n: box })}</label>
<span class="quiz-option-fields"><input id="${id(`a${box}`)}" name="answer${box}" maxlength="${QUIZ_OPTION_MAX}" dir="auto" value="${v.kept.answers[i] ?? ''}"${bad(`answer${box}`)}><input type="radio" class="quiz-radio" name="right" value="${box}" aria-label="${t('quizCorrectFor', { n: box })}"${v.kept.right === box ? raw(' checked') : ''}${box === '1' ? bad('right') : ''}></span></div>`;
  });
  return html`<label for="${id('text')}">${t('quizQuestionLabel')}</label>
<textarea id="${id('text')}" name="text" required maxlength="${QUIZ_TEXT_MAX}" rows="3" dir="auto"${bad('text')}>${v.kept.text}</textarea>
<fieldset class="quiz-options"><legend>${t('quizRightMark')}</legend>${answers}</fieldset>
<p class="quiz-help">${sentence(t, 'quizOptionsHelp', { min: String(QUIZ_OPTIONS_MIN), max: String(QUIZ_OPTIONS_MAX) })}</p>${err}`;
}

/** A stored question as its form shows it. */
const keptOf = (q: QuizQuestion): QuestionKept => ({ text: q.text, answers: q.answers.map((a) => a.text), right: String(q.answers.findIndex((a) => a.id === q.rightId) + 1) });

/** A locked question: its text and answers as text, the right one marked in words and with a check shape (UX-70). */
function lockedQuestion(t: Label, q: QuizQuestion, n: number): Html {
  return html`<section id="question-${q.id}" class="quiz-question card" tabindex="-1"><h2>${sentence(t, 'quizQuestionHeading', { n: String(n) })}</h2>
<p class="quiz-text" dir="auto">${q.text}</p>
<ul class="quiz-answers">${q.answers.map((a) => html`<li class="quiz-answer${a.id === q.rightId ? ' quiz-is-right' : ''}"><span class="quiz-answer-text" dir="auto">${a.text}</span>${a.id === q.rightId ? html` <span class="quiz-tag"><span class="quiz-shape" aria-hidden="true">✓</span> ${t('quizRightMark')}</span>` : ''}</li>`)}</ul>
</section>`;
}

export function quizEditorPage(
  t: Label,
  lang: Lang,
  space: SpaceView,
  v: {
    /** The quiz list (the back link; every post address is under it). */
    list: string;
    /** W7-2 (section 5.6): the preview take page of this quiz, Back returning to where the editor was reached from. */
    preview: string;
    subjectTitle: string;
    quiz: QuizRow;
    status: QuizEditorStatus;
    refusal: QuizEditorRefusal;
    /** A message at the top of the questions (409 quizStale or quizLocked) or at the state line (quizNotReady). */
    message: { at: 'questions' | 'state'; text: string } | null;
  },
): Html {
  const q = v.quiz;
  const base = `${v.list}/${q.id}`;
  const rev = html`<input type="hidden" name="rev" value="${q.rev}">`;
  const refusal = v.refusal;
  const topMessage = (at: 'questions' | 'state') => (v.message && v.message.at === at ? html`<p id="quiz-message" class="error" role="alert" tabindex="-1">${v.message.text}</p>` : '');
  // The title form.
  const titleRefused = refusal && refusal.form === 'title' ? refusal : null;
  const titleForm = html`<form id="quiz-title-form" class="quiz-form" method="post" action="${base}/title">${rev}<label for="quiz-title-field">${t('quizTitleLabel')}</label>
<input id="quiz-title-field" name="title" required maxlength="${QUIZ_TITLE_MAX}" dir="auto" value="${titleRefused ? titleRefused.kept : q.title}"${titleRefused ? invalid('quiz-title-error') : ''}>${titleRefused ? fieldError('quiz-title-error', titleRefused.error) : ''}
<button type="submit">${t('quizSaveTitle')}</button></form>`;
  // The state line: the state in words, the help (read before the actions), the actions that apply.
  const action = (name: string, key: LabelKey, primary: boolean) => html`<form class="quiz-action" method="post" action="${base}/${name}">${rev}<button type="submit"${primary ? '' : raw(' class="quiz-secondary"')}>${t(key)}</button></form>`;
  const actions = q.state === 'draft' ? [action('open', 'quizOpen', true)] : q.state === 'open' ? [action('close', 'quizClose', false)] : [action('reopen', 'quizReopen', false)];
  const stateStatus = v.status && v.status.at === 'state' ? status(t(v.status.key, v.status.key === 'quizOpened' ? { learner: low(t, lang, 'learner'), subjectTitle: v.subjectTitle } : {}), v.status.key === 'markFailed') : '';
  const stateLine = html`<section id="quiz-state" class="quiz-state-line card">${stateStatus}${topMessage('state')}
<p class="quiz-state-now"><span class="quiz-state">${t(STATE_KEY[q.state])}</span></p>
${q.state === 'draft' ? html`<p class="quiz-help">${t('quizDraftHelp', { learner: low(t, lang, 'learner') })}</p>` : ''}${q.locked ? '' : html`<p class="quiz-help quiz-open-help">${t('quizOpenHelp')}</p>`}
<p class="quiz-manage"><a id="quiz-preview-link" class="quiz-link-button" href="${v.preview}">${t('quizPreviewLink', { learner: low(t, lang, 'learner') })}</a></p>
<div class="quiz-actions">${actions}${action('remove', 'quizRemove', false)}</div>
</section>`;
  // The questions: each its own form (UX-70), or read-only when locked.
  const qStatus = (id: string) => (v.status && v.status.at === 'question' && v.status.question === id ? status(t(v.status.key), v.status.key === 'markFailed') : '');
  const qRefusal = (id: string) => (refusal && refusal.form === 'question' && refusal.question === id ? refusal : null);
  const editable = (question: QuizQuestion, i: number) => {
    const n = String(i + 1);
    const r = qRefusal(question.id);
    return html`<section id="question-${question.id}" class="quiz-question card" tabindex="-1"><h2>${sentence(t, 'quizQuestionHeading', { n })}</h2>${qStatus(question.id)}
<form class="quiz-form quiz-question-form" method="post" action="${base}/question/${question.id}">${rev}
${questionFields(t, { key: question.id, n: i + 1, kept: r ? r.kept : keptOf(question), refusal: r })}
<button type="submit">${sentence(t, 'quizSaveQuestion', { n })}</button></form>
<form class="quiz-action quiz-remove-question" method="post" action="${base}/question/${question.id}/remove">${rev}<button type="submit" class="quiz-secondary">${sentence(t, 'quizRemoveQuestion', { n })}</button></form>
</section>`;
  };
  const fresh = qRefusal('new');
  const newQuestion = q.questions.length >= QUIZ_QUESTIONS_MAX
    ? html`<p id="quiz-full" class="quiz-help">${sentence(t, 'quizFull', { max: String(QUIZ_QUESTIONS_MAX) })}</p>`
    : html`<section id="question-new" class="quiz-question quiz-new card" tabindex="-1"><h2>${t('quizNewQuestion')}</h2>
<form class="quiz-form quiz-question-form" method="post" action="${base}/question">${rev}
${questionFields(t, { key: 'new', n: null, kept: fresh ? fresh.kept : { text: '', answers: [], right: '' }, refusal: fresh })}
<button type="submit">${t('quizAddQuestion')}</button></form>
</section>`;
  const removedStatus = v.status && v.status.at === 'questions' ? status(t(v.status.key)) : '';
  const questions = html`<div id="quiz-questions" class="quiz-questions">${removedStatus}${topMessage('questions')}${q.locked
    ? html`<p id="quiz-locked" class="quiz-locked">${t('quizLockedNote')}</p>
${q.questions.map((x, i) => lockedQuestion(t, x, i + 1))}`
    : html`${q.questions.map(editable)}
${newQuestion}`}</div>`;
  const copyRefused = refusal && refusal.form === 'copy' ? refusal : null;
  const copy = html`<form id="quiz-copy" class="quiz-action quiz-copy" method="post" action="${base}/copy">${rev}<button type="submit" class="quiz-secondary"${copyRefused ? invalid('quiz-copy-error') : ''}>${t('quizCopy')}</button>${copyRefused ? fieldError('quiz-copy-error', copyRefused.error) : ''}</form>`;
  const body = html`${back(t, v.list)}
<h1 id="quiz-editor-title" dir="auto">${filled(t, 'quizEditorTitle', { title: title(q.title) })}</h1>
<div class="quiz-page">${titleForm}
${stateLine}
${questions}
${copy}
</div>${focus}`;
  return spacePage(t, lang, space, q.title, body);
}

// ------------------------------------------------------------ the results ----

/** One sent date, as the product shows dates. */
const dateOf = (ms: number) => html`<bdi dir="ltr" class="quiz-date">${utcDate(ms)}</bdi>`;
const scoreOf = (t: Label, score: number, total: number) => sentence(t, 'quizScoreCell', { score: String(score), total: String(total) });

/** The responsible publisher's results page of one quiz (section 5.5, UX-75): the count, one page of names, the per-question summary. */
export function quizResultsPage(
  t: Label,
  lang: Lang,
  space: SpaceView,
  v: { list: string; quiz: { id: string; title: string }; rows: QuizResultRow[]; count: number; right: number[] | null; page: number; pages: number },
): Html {
  const path = `${v.list}/${v.quiz.id}/results`;
  const tails = (r: QuizResultRow) => secondIds([r, ...r.sameName.map((u) => ({ id: `same:${u}`, display_name: r.display_name, username: u }))]).get(r.id) ?? '';
  // W7-3 [B] (contract v4 on PIL-295, G5.2): on the admin's scores page (`right` null) the name is plain text, not a link.
  const name = (r: QuizResultRow) => (v.right ? html`<a class="quiz-name" href="${path}/${r.id}"><bdi>${r.display_name}</bdi></a>` : html`<bdi>${r.display_name}</bdi>`);
  const row = (r: QuizResultRow) => html`<tr><td data-label="${t('quizColName')}">${name(r)} <span class="muted second-id">${sentence(t, 'secondId', { tail: tails(r) })}</span></td>
<td data-label="${t('quizColScore')}">${scoreOf(t, r.score, r.question_count)}</td><td data-label="${t('quizColDate')}">${dateOf(r.sent_at)}</td></tr>`;
  const pageLink = (n: number, key: 'quizPagePrev' | 'quizPageNext', rel: string) => html`<a class="quiz-page-link" rel="${rel}" href="${path}?page=${n}">${t(key)}</a>`;
  const pager = v.pages > 1
    ? html`<nav class="quiz-pager" aria-label="${t('quizPageOf', { n: String(v.page), m: String(v.pages) })}">${v.page > 1 ? pageLink(v.page - 1, 'quizPagePrev', 'prev') : ''}<span class="quiz-page-of">${sentence(t, 'quizPageOf', { n: String(v.page), m: String(v.pages) })}</span>${v.page < v.pages ? pageLink(v.page + 1, 'quizPageNext', 'next') : ''}</nav>`
    : '';
  const content = v.count === 0
    ? html`<p id="quiz-results-none" class="quiz-help">${t('quizResultsNone')}</p>`
    : html`<table id="quiz-results" class="quiz-table"><caption>${sentence(t, 'quizResultsCount', { n: String(v.count) })}</caption>
<thead><tr><th scope="col">${t('quizColName')}</th><th scope="col">${t('quizColScore')}</th><th scope="col">${t('quizColDate')}</th></tr></thead>
<tbody>${v.rows.map(row)}</tbody></table>
${pager}
${v.right ? html`<h2 id="quiz-stats-title">${t('quizStatsTitle')}</h2>
<ul id="quiz-stats" class="quiz-stats">${v.right.map((right, i) => html`<li>${sentence(t, 'quizQuestionStat', { n: String(i + 1), right: String(right), all: String(v.count) })}</li>`)}</ul>` : '\n'}`;
  // The admin's scores page says it holds scores only (UX-84, quizAdminScoresNote), right after the title.
  const note = v.right ? '' : html`
<p id="quiz-admin-note" class="muted">${t('quizAdminScoresNote')}</p>`;
  const body = html`${back(t, v.list)}
<h1 id="quiz-results-title" dir="auto">${filled(t, 'quizResultsTitle', { title: title(v.quiz.title) })}</h1>${note}
<div class="quiz-page">${content}
</div>`;
  return spacePage(t, lang, space, t('quizResultsTitle', { title: v.quiz.title }), body);
}

/** One attempt's questions (UX-74, UX-75): each question's text, every answer, the chosen one and the right one marked in
 * words (and a shape, check for right, cross for a wrong choice, hidden from screen readers), and the verdict in words. */
export function quizResultBody(t: Label, questions: readonly QuizQuestion[], answers: Readonly<Record<string, string>>): Html {
  return html`<div class="quiz-result-body">${questions.map((q, i) => {
    const chosen = Object.hasOwn(answers, q.id) ? answers[q.id] : null;
    const verdict: LabelKey = chosen === null ? 'quizNoAnswer' : chosen === q.rightId ? 'quizRight' : 'quizWrong';
    const answer = (a: { id: string; text: string }) => {
      const isRight = a.id === q.rightId;
      const isChosen = a.id === chosen;
      const shape = isRight ? '✓' : isChosen ? '✗' : '';
      return html`<li class="quiz-answer${isRight ? ' quiz-is-right' : ''}${isChosen ? ' quiz-is-chosen' : ''}">${shape ? html`<span class="quiz-shape" aria-hidden="true">${shape}</span> ` : ''}<span class="quiz-answer-text" dir="auto">${a.text}</span>${isChosen ? html` · <span class="quiz-tag">${t('quizChosen')}</span>` : ''}${isRight ? html` · <span class="quiz-tag">${t('quizRightMark')}</span>` : ''}</li>`;
    };
    return html`<section class="quiz-question card"><h2>${sentence(t, 'quizQuestionHeading', { n: String(i + 1) })}</h2>
<p class="quiz-text" dir="auto">${q.text}</p>
<ul class="quiz-answers">${q.answers.map(answer)}</ul>
<p class="quiz-verdict quiz-${verdict === 'quizRight' ? 'right' : verdict === 'quizWrong' ? 'wrong' : 'none'}">${t(verdict)}</p>
</section>`;
  })}</div>`;
}

/** One learner's answers, for the responsible publisher (AT-2.1, UX-75): the heading, the score line, the shared drawer, the way back. */
export function quizAnswersPage(
  t: Label,
  lang: Lang,
  space: SpaceView,
  v: { results: string; quiz: QuizRow; name: string; answers: Record<string, string>; score: number; total: number },
): Html {
  const body = html`${back(t, v.results)}
<h1 id="quiz-answers-title" dir="auto">${filled(t, 'quizAnswersOf', { name: html`<bdi>${v.name}</bdi>` })}</h1>
<p class="quiz-sub" dir="auto">${title(v.quiz.title)}</p>
<p id="quiz-score" class="quiz-score">${sentence(t, 'quizScoreLine', { score: String(v.score), total: String(v.total) })}</p>
${quizResultBody(t, v.quiz.questions, v.answers)}`;
  return spacePage(t, lang, space, t('quizAnswersOf', { name: v.name }), body);
}
