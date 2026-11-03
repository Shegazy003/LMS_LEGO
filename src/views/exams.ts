// The pages of exams and marks (release 2, R2-b; wireframe-marks and
// wireframe-my-results on PIL-120).
//
// The publisher's pages, all under /s/<space>/publish behind the publisher
// gate: the list of a subject's exams with the form that makes one, the marks
// page (every learner of the subject on one page, sorted by name then
// username, each with a second identifier, a mark box with a numeric keyboard
// and an Absent tick), and the page that lists every row before publishing.
// The learner's pages, under /s/<space>/results behind the learner gate: My
// results (their own published results only, no average, rank, grade or
// anyone else) and one result of theirs. Addresses use neutral words ("marks",
// "results") so that no address names a kit word; every word on the page
// comes from the label function and the space's kit.
import { html } from 'hono/html';
import type { ExamRow, OwnResult, ResultRow, RosterRow } from '../exams.ts';
import { markText } from '../exams.ts';
import type { Label, Lang } from '../labels.ts';
import { RENAME_MAX } from '../names.ts';
import { errorBox, sentence, type Html } from './layout.ts';
import { spacePage } from './learn.ts';
import type { SpaceView } from './space.ts';

const publishBase = (space: SpaceView) => `/s/${space.id}/publish`;
export const marksPath = (space: SpaceView, examId: string) => `${publishBase(space)}/marks/${examId}`;
const listPath = (space: SpaceView, subjectId: string) => `${publishBase(space)}/edit/${subjectId}/marks`;

const value = (t: Label, status: 'marked' | 'absent', mark: number | null) => (status === 'absent' ? t('absent') : markText(mark ?? 0));

function examMeta(t: Label, exam: ExamRow): Html {
  return html`<p id="exam-meta" class="muted"><bdi>${exam.subject_title}</bdi> · ${sentence(t, 'examMeta', { date: exam.exam_date, max: markText(exam.max_mark) })}</p>`;
}

const secondId = (t: Label, tail: string) => html`<span class="muted second-id">${sentence(t, 'secondId', { tail })}</span>`;

// ------------------------------------------------------- the exam list ----
export interface NewExamValues {
  title?: string;
  exam_date?: string;
  max_mark?: string;
}

/** A subject's exams, each a way into its marks page, and the form that makes a new one. */
export function examListPage(
  t: Label,
  lang: Lang,
  space: SpaceView,
  v: { subject: { id: string; title: string }; exams: ExamRow[]; values?: NewExamValues; error?: string },
): Html {
  const values = v.values ?? {};
  const items = v.exams.map((e) => html`<li data-exam="${e.id}"><a class="exam" href="${marksPath(space, e.id)}"><bdi>${e.title}</bdi></a>
  <div class="muted">${sentence(t, 'examMeta', { date: e.exam_date, max: markText(e.max_mark) })}</div></li>`);
  const list = items.length
    ? html`<ul id="exam-list" class="list card">${items}</ul>`
    : html`<p id="exam-none" class="card muted">${t('nothingHere')}</p>`;
  const body = html`<p><a id="back" href="${publishBase(space)}/edit/${v.subject.id}"><bdi>${v.subject.title}</bdi></a></p>
<h1 id="exam-list-title">${t('examList')}</h1>
${list}
<h2>${t('examNew')}</h2>
${errorBox(v.error)}
<form id="new-exam" class="stack card" method="post" action="${listPath(space, v.subject.id)}">
  <label>${t('titleField')}<input name="title" required maxlength="${RENAME_MAX}" value="${values.title ?? ''}"></label>
  <label>${t('examDate')}<input name="exam_date" type="date" required value="${values.exam_date ?? ''}"></label>
  <label>${t('maxMark')}<input name="max_mark" required inputmode="decimal" autocomplete="off" dir="ltr" maxlength="8" value="${values.max_mark ?? ''}"></label>
  <button type="submit">${t('examCreate')}</button>
</form>`;
  return spacePage(t, lang, space, t('examList'), body);
}

// -------------------------------------------------------- the marks page ----
/** What one row of the marks page shows: the typed text and tick (kept as typed after a refusal), its error, or its published value. */
export interface MarkRowView {
  learner: RosterRow;
  tail: string;
  typed: string;
  absent: boolean;
  error?: string;
  published?: ResultRow;
}

export type MarksNotice = 'draftSaved' | 'marksPublished';

export function marksPage(
  t: Label,
  lang: Lang,
  space: SpaceView,
  v: { exam: ExamRow; rows: MarkRowView[]; notice?: MarksNotice; error?: string },
): Html {
  const open = v.rows.filter((r) => !r.published);
  const row = (r: MarkRowView) => {
    const id = r.learner.id;
    const who = html`<div class="who"><bdi class="name">${r.learner.display_name}</bdi>${secondId(t, r.tail)}</div>`;
    if (r.published) {
      return html`<li class="mark-row" data-learner="${id}" data-published="1">${who}
  <span class="value" dir="auto">${value(t, r.published.status, r.published.mark)}</span> <span class="muted">${t('published')}</span>
  <input type="hidden" name="learner" value="${id}"></li>`;
    }
    return html`<li class="mark-row" data-learner="${id}"${r.error ? html` data-error="1"` : ''}>${who}
  <input type="hidden" name="learner" value="${id}">
  <label class="mark">${t('markField')}<input class="mark" name="mark:${id}" value="${r.typed}" inputmode="decimal" autocomplete="off" dir="ltr" maxlength="12"></label>
  <label class="check absent"><input type="checkbox" name="absent:${id}" value="1"${r.absent ? html` checked` : ''}> ${t('absent')}</label>
  ${r.error ? html`<p class="error row-error" role="alert">${r.error}</p>` : ''}</li>`;
  };
  const buttons = open.length
    ? html`<p class="muted" id="drafts-hidden">${t('draftsHidden')}</p>
<p class="muted" id="publish-note">${t('publishNote')}</p>
<div class="share"><button type="submit" name="action" value="draft" class="plain">${t('saveDraft')}</button><button type="submit" name="action" value="publish">${t('publish')}</button></div>`
    : html`<p id="all-published" class="done">${t('allPublished')}</p>`;
  const body = html`<p><a id="back" href="${listPath(space, v.exam.subject_id)}">${t('examList')}</a></p>
<h1 id="marks-title">${sentence(t, 'marksTitle', { title: v.exam.title })}</h1>
${examMeta(t, v.exam)}
<p id="roster-count" data-count="${v.rows.length}">${sentence(t, 'rosterCount', { count: String(v.rows.length) })}</p>
<p class="muted">${t('rosterOrder')}</p>
${v.notice ? html`<p id="done" class="done" role="status">${t(v.notice)}</p>` : ''}
${errorBox(v.error)}
<form id="marks" method="post" action="${marksPath(space, v.exam.id)}">
<ol id="rows" class="marks">${v.rows.map(row)}</ol>
${buttons}
</form>`;
  return spacePage(t, lang, space, t('marksTitle', { title: v.exam.title }), body);
}

// ------------------------------------------------------ the confirmation ----
export interface ConfirmRowView {
  learner: RosterRow;
  tail: string;
  /** The row to publish, or null for a row that is still empty (a learner new on the list). */
  result: ResultRow | null;
}

/** Every row to be published (name, second identifier, mark or Absent, the
 * maximum, the group), and the confirming button. When the list changed since
 * the marks page was opened, it says how many changed; a new learner's row is
 * empty and must be completed first, so there is no button then. */
export function confirmPage(
  t: Label,
  lang: Lang,
  space: SpaceView,
  v: { exam: ExamRow; rows: ConfirmRowView[]; changed: number; learners: string[]; version: string; error?: string },
): Html {
  const max = markText(v.exam.max_mark);
  const complete = v.rows.every((r) => r.result) && v.changed === 0;
  const row = (r: ConfirmRowView) => html`<li class="mark-row" data-learner="${r.learner.id}"${r.result ? '' : html` data-empty="1"`}>
  <div class="who"><bdi class="name">${r.learner.display_name}</bdi>${secondId(t, r.tail)}</div>
  ${r.result
    ? html`<span class="value" dir="auto">${value(t, r.result.status, r.result.mark)}</span> <span class="muted max" dir="ltr">/ ${max}</span>`
    : html`<span class="muted">${t('newRow')}</span><p class="error row-error" role="alert">${t('markMissing')}</p>`}
  <span class="muted group">${t('group')}: ${r.learner.groups.length ? html`<bdi>${r.learner.groups.join(', ')}</bdi>` : t('directly')}</span></li>`;
  const changed = v.changed
    ? html`<div id="changed" class="draft" role="status"><p>${sentence(t, 'learnersChanged', { count: String(v.changed) })}</p><p>${t('changedNote')}</p></div>`
    : '';
  const action = complete
    ? html`<form id="confirm" method="post" action="${marksPath(space, v.exam.id)}/publish">
  ${v.learners.map((id) => html`<input type="hidden" name="learner" value="${id}">`)}
  <input type="hidden" name="version" value="${v.version}">
  <div class="share"><a id="cancel" class="button plain" href="${marksPath(space, v.exam.id)}">${t('cancel')}</a><button type="submit">${t('confirmYes')}</button></div>
</form>`
    : html`<p id="complete-first" class="error" role="alert">${t('completeFirst')}</p>
<p><a id="back-to-marks" class="button" href="${marksPath(space, v.exam.id)}">${t('backToMarks')}</a></p>`;
  const body = html`<h1 id="confirm-title">${t('confirmTitle')}</h1>
<p><bdi>${v.exam.title}</bdi></p>
${examMeta(t, v.exam)}
${errorBox(v.error)}
${changed}
<p class="muted">${t('publishConfirmNote')}</p>
<ol id="confirm-rows" class="marks">${v.rows.map(row)}</ol>
${action}`;
  return spacePage(t, lang, space, t('confirmTitle'), body);
}

/** A plain message on the marks of an exam (a second tab pressing Publish again), with the way back. */
export function marksMessagePage(t: Label, lang: Lang, space: SpaceView, exam: ExamRow, message: string): Html {
  const body = html`<p id="marks-message" class="message">${message}</p>
<p><a id="back-to-marks" href="${marksPath(space, exam.id)}">${t('backToMarks')}</a></p>`;
  return spacePage(t, lang, space, message, body);
}

// ------------------------------------------------------- the learner ----
function resultCard(t: Label, space: SpaceView, r: OwnResult, link: boolean): Html {
  const head = html`<bdi class="exam">${r.exam_title}</bdi> · <bdi class="subject">${r.subject_title}</bdi>`;
  const score = r.status === 'absent' ? t('absent') : `${markText(r.mark ?? 0)} / ${markText(r.max_mark)}`;
  return html`<li class="card result" data-result="${r.id}">
  <div class="title">${link ? html`<a href="/s/${space.id}/results/${r.id}">${head}</a>` : head}</div>
  <div class="row"><span class="muted date" dir="ltr">${r.exam_date}</span><span class="score" dir="auto">${score}</span></div>
</li>`;
}

/** My results: the learner's own published results, and nothing about anyone else. */
export function myResultsPage(t: Label, lang: Lang, space: SpaceView, results: OwnResult[]): Html {
  const body = html`<h1 id="results-title">${t('myResults')}</h1>
<p class="muted" id="results-note">${t('resultsNote')}</p>
${results.length
    ? html`<ol id="results" class="items">${results.map((r) => resultCard(t, space, r, true))}</ol>`
    : html`<p id="results-none" class="card message">${t('resultsNone')}</p>`}`;
  return spacePage(t, lang, space, t('myResults'), body);
}

/** One result of the learner's own. */
export function resultPage(t: Label, lang: Lang, space: SpaceView, r: OwnResult): Html {
  const body = html`<p><a id="back" href="/s/${space.id}/results">${t('myResults')}</a></p>
<ol id="results" class="items">${resultCard(t, space, r, false)}</ol>`;
  return spacePage(t, lang, space, r.exam_title, body);
}
