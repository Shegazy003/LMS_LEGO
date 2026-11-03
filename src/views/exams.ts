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
import { utcDate } from '../access.ts';
import type { ExamRow, HistoryEntry, OwnResult, PublishedRow, ResultRow, RosterRow } from '../exams.ts';
import { markText } from '../exams.ts';
import type { Label, Lang } from '../labels.ts';
import { RENAME_MAX } from '../names.ts';
import { errorBox, sentence, type Html } from './layout.ts';
import { spacePage } from './learn.ts';
import type { SpaceView } from './space.ts';

const publishBase = (space: SpaceView) => `/s/${space.id}/publish`;
export const marksPath = (space: SpaceView, examId: string) => `${publishBase(space)}/marks/${examId}`;
const correctionPath = (space: SpaceView, examId: string, learnerId: string) => `${marksPath(space, examId)}/correct?learner=${encodeURIComponent(learnerId)}`;
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

export type MarksNotice = 'draftSaved' | 'marksPublished' | 'examSaved';

/** The exam's own fields on its marks page (R2-c, AT-12d): a form while no
 * row is published, then a plain line saying they are locked. */
function examFields(t: Label, space: SpaceView, exam: ExamRow, locked: boolean, values?: NewExamValues, error?: string): Html {
  if (locked) return html`<p id="exam-locked" class="muted">${t('examLockedNote')}</p>`;
  const typed = values ?? { title: exam.title, exam_date: exam.exam_date, max_mark: markText(exam.max_mark) };
  return html`<details class="card"${error ? ' open' : ''}><summary>${t('examEdit')}</summary>
${errorBox(error)}
<form id="exam-edit" method="post" action="${marksPath(space, exam.id)}/details" class="stack">
  <label>${t('titleField')}<input name="title" required maxlength="${RENAME_MAX}" value="${typed.title ?? ''}"></label>
  <label>${t('examDate')}<input name="exam_date" type="date" required value="${typed.exam_date ?? ''}"></label>
  <label>${t('maxMark')}<input name="max_mark" required inputmode="decimal" autocomplete="off" dir="ltr" maxlength="8" value="${typed.max_mark ?? ''}"></label>
  <button type="submit">${t('examSave')}</button>
</form></details>`;
}

export function marksPage(
  t: Label,
  lang: Lang,
  space: SpaceView,
  v: { exam: ExamRow; rows: MarkRowView[]; notice?: MarksNotice; error?: string; locked?: boolean; examValues?: NewExamValues; examError?: string },
): Html {
  const open = v.rows.filter((r) => !r.published);
  const row = (r: MarkRowView) => {
    const id = r.learner.id;
    const who = html`<div class="who"><bdi class="name">${r.learner.display_name}</bdi>${secondId(t, r.tail)}</div>`;
    if (r.published) {
      return html`<li class="mark-row" data-learner="${id}" data-published="1">${who}
  <span class="value" dir="auto">${value(t, r.published.status, r.published.mark)}</span> <span class="muted">${t('published')}</span>
  <a class="correct" href="${correctionPath(space, v.exam.id, id)}">${t('correct')}</a>
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
${examFields(t, space, v.exam, Boolean(v.locked), v.examValues, v.examError)}
${v.locked ? html`<p><a id="history-link" href="${marksPath(space, v.exam.id)}/history">${t('historyLink')}</a></p>` : ''}
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

// ------------------------------------------- history and corrections ----
// R2-c (AT-12): every published row with its history, oldest first: the first
// publish, then every correction with the previous value, the new value, who,
// when (date and time, UTC, like every date the product shows) and the reason.
// The publisher reads it under /publish (with a way to correct each row), the
// admin under /admin (read-only). A learner and a guardian never reach it.
export interface HistoryRowView {
  row: PublishedRow;
  tail: string;
  entries: HistoryEntry[];
}

const when = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');

function historyEntry(t: Label, e: HistoryEntry): Html {
  const next = html`<span class="new" dir="auto">${value(t, e.new_status, e.new_mark)}</span>`;
  const by = html`<span class="who"><bdi>${e.who}</bdi></span> · <span class="when" dir="ltr">${when(e.changed_at)}</span>`;
  if (e.previous_status === null) {
    return html`<li class="history-entry" data-kind="publish"><span class="what">${t('historyPublished')}</span> ${next} · ${by}</li>`;
  }
  return html`<li class="history-entry" data-kind="correction"><span class="what">${t('historyCorrected')}</span> <span class="change" dir="ltr"><span class="previous" dir="auto">${value(t, e.previous_status, e.previous_mark)}</span> <span aria-hidden="true">→</span> ${next}</span> · ${by} · <span class="reason"><bdi>${e.reason ?? ''}</bdi></span></li>`;
}

function historySection(t: Label, exam: ExamRow, h: HistoryRowView, correctHref?: string): Html {
  const now = h.row.status === 'absent' ? t('absent') : `${markText(h.row.mark ?? 0)} / ${markText(exam.max_mark)}`;
  return html`<section class="card result-history" id="row-${h.row.learner_user_id}" data-learner="${h.row.learner_user_id}">
  <h2><bdi class="name">${h.row.display_name}</bdi> ${secondId(t, h.tail)}</h2>
  <p>${t('historyNow')} <span class="current" dir="auto">${now}</span></p>
  <ol class="history">${h.entries.map((e) => historyEntry(t, e))}</ol>
  ${correctHref ? html`<p><a class="correct" href="${correctHref}">${t('correct')}</a></p>` : ''}
</section>`;
}

/** The history of every published row of an exam: the publisher's (with Correct on each row) or the admin's (read-only). */
export function historyPage(
  t: Label,
  lang: Lang,
  space: SpaceView,
  v: { exam: ExamRow; rows: HistoryRowView[]; back: { href: string; label: string }; correctable: boolean; notice?: string },
): Html {
  const body = html`<p><a id="back" href="${v.back.href}">${v.back.label}</a></p>
<h1 id="history-title">${sentence(t, 'historyTitle', { title: v.exam.title })}</h1>
${examMeta(t, v.exam)}
${v.notice ? html`<p id="done" class="done" role="status">${v.notice}</p>` : ''}
${v.rows.length
    ? html`<div id="history">${v.rows.map((h) => historySection(t, v.exam, h, v.correctable ? correctionPath(space, v.exam.id, h.row.learner_user_id) : undefined))}</div>`
    : html`<p id="history-none" class="card message">${t('historyNone')}</p>`}`;
  return spacePage(t, lang, space, t('historyTitle', { title: v.exam.title }), body);
}

export interface MarkCorrectionValues {
  mark?: string;
  absent?: boolean;
  reason?: string;
}

/** The correction of one published row: its value and history, and the form
 * (a new mark or Absent, and the required reason). The version is the number
 * of history rows the page showed: a correction made meanwhile (another tab)
 * makes this one change nothing. */
export function correctionPage(
  t: Label,
  lang: Lang,
  space: SpaceView,
  v: { exam: ExamRow; row: HistoryRowView; values?: MarkCorrectionValues; error?: string },
): Html {
  const values = v.values ?? {};
  const id = v.row.row.learner_user_id;
  const body = html`<p><a id="back" href="${marksPath(space, v.exam.id)}">${t('backToMarks')}</a></p>
<h1 id="correct-title">${sentence(t, 'markCorrectTitle', { name: v.row.row.display_name })}</h1>
<p><bdi>${v.exam.title}</bdi></p>
${examMeta(t, v.exam)}
<p class="muted" id="correct-note">${t('markCorrectNote')}</p>
${historySection(t, v.exam, v.row)}
${errorBox(v.error)}
<form id="correct" class="stack card" method="post" action="${marksPath(space, v.exam.id)}/correct">
  <input type="hidden" name="version" value="${String(v.row.row.versions)}">
  <input type="hidden" name="learner" value="${id}">
  <label class="mark">${t('correctNew')}<input name="mark" value="${values.mark ?? ''}" inputmode="decimal" autocomplete="off" dir="ltr" maxlength="12"></label>
  <label class="check absent"><input type="checkbox" name="absent" value="1"${values.absent ? html` checked` : ''}> ${t('absent')}</label>
  <label>${t('correctReason')}<textarea name="reason" required maxlength="${REASON_MAX}" rows="3">${values.reason ?? ''}</textarea></label>
  <button type="submit">${t('correct')}</button>
</form>`;
  return spacePage(t, lang, space, t('markCorrectTitle', { name: v.row.row.display_name }), body);
}

/** The longest reason a correction keeps. */
export const REASON_MAX = 300;

/** The admin's list of every exam of the space with a published result, each leading to its rows and their history. */
export function adminResultsPage(t: Label, lang: Lang, space: SpaceView, exams: ExamRow[]): Html {
  const items = exams.map((e) => html`<li data-exam="${e.id}"><a class="exam" href="/s/${space.id}/admin/results/${e.id}"><bdi>${e.title}</bdi></a>
  <div class="muted"><bdi>${e.subject_title}</bdi> · ${sentence(t, 'examMeta', { date: e.exam_date, max: markText(e.max_mark) })}</div></li>`);
  const body = html`<p><a id="back" href="/s/${space.id}/admin">${space.name}</a></p>
<h1 id="results-all-title">${t('resultsAll')}</h1>
<p class="muted" id="results-all-note">${t('resultsAllNote')}</p>
${items.length ? html`<ul id="admin-results-list" class="list card">${items}</ul>` : html`<p id="history-none" class="card message">${t('historyNone')}</p>`}`;
  return spacePage(t, lang, space, t('resultsAll'), body);
}

/** A plain message on the marks of an exam (a second tab pressing Publish again), with the way back. */
export function marksMessagePage(t: Label, lang: Lang, space: SpaceView, exam: ExamRow, message: string): Html {
  const body = html`<p id="marks-message" class="message">${message}</p>
<p><a id="back-to-marks" href="${marksPath(space, exam.id)}">${t('backToMarks')}</a></p>`;
  return spacePage(t, lang, space, message, body);
}

// ------------------------------------------------------- the learner ----
/** One published result as a learner or a guardian reads it: exam, subject,
 * date, "mark / maximum" or Absent, and, once corrected, "Corrected on
 * <date>" (R2-c, AT-12a). Never the previous value or the reason. A
 * guardian's card carries no result id ('guardian'); a learner's links to the
 * result's own page ('link') or not ('plain'). */
export function resultCard(t: Label, space: SpaceView, r: OwnResult, mode: 'link' | 'plain' | 'guardian'): Html {
  const head = html`<bdi class="exam">${r.exam_title}</bdi> · <bdi class="subject">${r.subject_title}</bdi>`;
  const score = r.status === 'absent' ? t('absent') : `${markText(r.mark ?? 0)} / ${markText(r.max_mark)}`;
  const corrected = r.corrected_at === null ? '' : html`<div class="row"><span class="corrected">${t('correctedOn', { date: utcDate(r.corrected_at) })}</span></div>`;
  return html`<li class="card result"${mode === 'guardian' ? '' : html` data-result="${r.id}"`}>
  <div class="title">${mode === 'link' ? html`<a href="/s/${space.id}/results/${r.id}">${head}</a>` : head}</div>
  <div class="row"><span class="muted date" dir="ltr">${r.exam_date}</span><span class="score" dir="auto">${score}</span></div>
  ${corrected}
</li>`;
}

/** My results: the learner's own published results, and nothing about anyone else. */
export function myResultsPage(t: Label, lang: Lang, space: SpaceView, results: OwnResult[]): Html {
  const body = html`<h1 id="results-title">${t('myResults')}</h1>
<p class="muted" id="results-note">${t('resultsNote')}</p>
${results.length
    ? html`<ol id="results" class="items">${results.map((r) => resultCard(t, space, r, 'link'))}</ol>`
    : html`<p id="results-none" class="card message">${t('resultsNone')}</p>`}`;
  return spacePage(t, lang, space, t('myResults'), body);
}

/** One result of the learner's own. */
export function resultPage(t: Label, lang: Lang, space: SpaceView, r: OwnResult): Html {
  const body = html`<p><a id="back" href="/s/${space.id}/results">${t('myResults')}</a></p>
<ol id="results" class="items">${resultCard(t, space, r, 'plain')}</ol>`;
  return spacePage(t, lang, space, r.exam_title, body);
}
