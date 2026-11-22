// LMS wave 6, W6-1a (product-contract v2 on PIL-257, section 4.2; ux-plan
// UX-59 to UX-61, UX-64 to UX-66): the due card on a subjects editor and on
// its admin page, and the due-dates page both lead to. Plain forms that work
// without script; with script the rows status line, or the refused field,
// takes focus. No learner data anywhere: no name, no count, no late mark.
// Every word comes from the label function; dates are Latin-digit YYYY-MM-DD
// inside dir="ltr". The CSS is the `/* wave 6 due dates */` block of layout.ts.
import { html, raw } from 'hono/html';
import type { Label, Lang } from '../labels.ts';
import { TODO_AHEAD_DAYS, dueBounds, type DueChapter, type DueKind } from '../due.ts';
import type { Html } from './layout.ts';
import { spacePage } from './learn.ts';
import type { SpaceView } from './space.ts';

/** A product sentence whose values are ready markup (a title in <bdi>, a <time>). */
function filled(t: Label, key: 'dueLabel' | 'dueOn' | 'duePageTitle', values: Record<string, Html>): (Html | string)[] {
  const names = Object.keys(values);
  const markers = Object.fromEntries(names.map((n, i) => [n, `\u0001${i}\u0002`]));
  return t(key, markers).split(/\u0001(\d+)\u0002/).map((part, i) => (i % 2 === 1 ? values[names[Number(part)]] : part));
}

/** A date as the product shows dates: Latin digits, left to right. */
const dateOf = (iso: string) => html`<bdi dir="ltr" class="due-date"><time datetime="${iso}">${iso}</time></bdi>`;

/** The due card (section 4.2, UX-59): heading, help line, the link to the due-dates page. A link only: no count, no read. */
export function dueCard(t: Label, lang: Lang, href: string): Html {
  const low = (key: 'chapter' | 'lesson' | 'subject' | 'learner' | 'guardian') => t(key).toLocaleLowerCase(lang);
  // W6-1c (UX-81): the last sentence names who sees lateness: the learner and, where a link exists, the guardian.
  const help = t('dueCardHelp', { chapter: low('chapter'), lesson: low('lesson'), subject: low('subject'), learner: low('learner'), guardian: low('guardian'), days: String(TODO_AHEAD_DAYS) });
  return html`<section id="due-dates" class="card" aria-labelledby="due-card-title"><h2 id="due-card-title">${t('dueCardTitle')}</h2>
<p class="due-help">${help}</p>
<p class="due-set"><a class="due-link" href="${href}">${t('dueSetLink')}</a></p>
</section>`;
}

/** What the page says on a row after a press (section 4.2): only when it matches the stored state; a failed write always. */
export type DueStatus = { item: string; said: 'saved' | 'cleared' | 'failed' } | null;
/** A refused date (section 4.3): the row, and the value kept in its field (empty when not a well-formed date). */
export interface DueRefusal { item: string; kept: string; error: string }

const STATUS_KEY = { saved: 'dueSaved', cleared: 'dueCleared', failed: 'markFailed' } as const;

interface RowView {
  kind: DueKind;
  id: string;
  title: string;
  due_on: string | null;
  /** A chapter with no shown lesson (dueChapterEmpty). */
  empty: boolean;
}

function row(t: Label, v: { action: string; now: number; status: DueStatus; refusal: DueRefusal | null; emptyLine: string }, r: RowView): Html {
  const title = html`<bdi>${r.title}</bdi>`;
  const status = v.status && v.status.item === r.id
    ? html`<p class="due-status ${v.status.said === 'failed' ? 'error' : 'done'}" role="status" tabindex="-1">${t(STATUS_KEY[v.status.said])}</p>`
    : '';
  const refused = v.refusal && v.refusal.item === r.id ? v.refusal : null;
  const { min, max } = dueBounds(v.now, r.due_on);
  const field = `due-${r.id}`;
  const value = refused ? refused.kept : r.due_on ?? '';
  const invalid = refused ? html` aria-invalid="true" aria-describedby="${field}-error" autofocus` : '';
  const error = refused ? html`<p id="${field}-error" class="error due-error">${refused.error}</p>` : '';
  const current = r.due_on ? html`<p class="due-value">${filled(t, 'dueOn', { date: dateOf(r.due_on) })}</p>` : html`<p class="due-value due-none">${t('dueNone')}</p>`;
  const post = `${v.action}/${r.kind}/${r.id}`;
  const clear = r.due_on
    ? html`<form class="due-clear" method="post" action="${post}"><input type="hidden" name="due_on" value=""><button type="submit" class="due-button" aria-label="${t('dueClearFor', { title: r.title })}">${t('dueClear')}</button></form>`
    : '';
  return html`<div class="due-row" data-kind="${r.kind}">${status}<p class="due-title"><span class="due-kind">${t(r.kind)}</span> ${title}</p>
  ${current}${r.empty ? html`<p class="due-empty">${v.emptyLine}</p>` : ''}
  <form class="due-form" method="post" action="${post}"><label for="${field}">${filled(t, 'dueLabel', { title })}</label><span class="due-fields"><input type="date" id="${field}" name="due_on" value="${value}" min="${min}" max="${max}"${invalid}><button type="submit" class="due-button" aria-label="${t('dueSaveFor', { title: r.title })}">${t('dueSave')}</button></span></form>
  ${error}${clear}
</div>`;
}

/** With script: the rows status line takes focus, or the refused field (UX-61). */
const FOCUS_SCRIPT = `(function(){var e=document.querySelector('#due-list [aria-invalid=true]')||document.querySelector('#due-list .due-status');if(e){e.focus();addEventListener('load',function(){e.focus();});}})();`;

/** The due-dates page (section 4.2, UX-60): the back link, the heading, then every chapter not removed followed by its lessons, one row each. */
export function duePage(
  t: Label,
  lang: Lang,
  space: SpaceView,
  v: { subjectTitle: string; back: string; action: string; outline: DueChapter[]; now: number; status: DueStatus; refusal: DueRefusal | null },
): Html {
  const rv = { ...v, emptyLine: t('dueChapterEmpty', { lesson: t('lesson').toLocaleLowerCase(lang) }) };
  const lessonRows = (ch: DueChapter) => ch.lessons.map((l) => html`<li id="item-${l.id}" class="due-item due-child" tabindex="-1">${row(t, rv, { kind: 'lesson', id: l.id, title: l.title, due_on: l.due_on, empty: false })}</li>`);
  const list = v.outline.length
    ? html`<ol id="due-list" class="due-list">${v.outline.map((ch) => html`<li id="item-${ch.id}" class="due-item due-top" tabindex="-1">${row(t, rv, { kind: 'chapter', id: ch.id, title: ch.title, due_on: ch.due_on, empty: ch.lessons.length === 0 })}${ch.lessons.length ? html`<ol class="due-sub">${lessonRows(ch)}</ol>` : ''}</li>`)}</ol>
<script>${raw(FOCUS_SCRIPT)}</script>`
    : html`<p class="card muted">${t('nothingHere')}</p>`;
  const body = html`<p class="due-back"><a id="due-back" href="${v.back}">${t('back')}</a></p>
<h1 id="due-title" dir="auto">${filled(t, 'duePageTitle', { subjectTitle: html`<bdi>${v.subjectTitle}</bdi>` })}</h1>
<div class="due-page">${list}</div>`;
  return spacePage(t, lang, space, t('dueCardTitle'), body);
}
