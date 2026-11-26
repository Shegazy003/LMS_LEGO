// LMS wave 8, W8-1a (product-contract v2 on PIL-299, sections 3.2 and 3.7;
// ux-plan UX-86, UX-87, UX-91 to UX-93): the Opening dates card on a subjects
// editor and on its admin page, and the Opening dates page both lead to.
// Every row has the same controls, whatever its state (T2): one form per
// chapter, a fieldset whose legend is the title, the state line, the
// conditional lines, the date field, the two before-opening radios, Save and
// Clear date. Plain forms that work without script; with script the rows
// status line, or the refused field, takes focus. No learner data anywhere:
// no name, no count, no lock state (T3). Every word comes from the label
// function; dates and "00:00 UTC" are Latin-digit and left to right inside
// dir="ltr". No new CSS: the classes are wave 6's due page and wave 7's quiz
// form (radios of 44 px).
import { html, raw } from 'hono/html';
import type { Label, Lang, LabelKey } from '../labels.ts';
import { isOpenNow, openBounds, openLines, rowAnchor, type OpenRow } from '../opening.ts';
import type { Html } from './layout.ts';
import { spacePage } from './learn.ts';
import type { SpaceView } from './space.ts';

/** A time or zone inside a sentence (UX-91): "00:00" and "UTC", isolated left to right as dates are. */
const TIMES = /(\d{2}:\d{2}|UTC)/;

/** A product sentence whose values are ready markup (a title in <bdi>, a <time>), with "00:00" and "UTC" isolated. */
function filled(t: Label, key: LabelKey, values: Record<string, Html>, words: Record<string, string> = {}): (Html | string)[] {
  const names = Object.keys(values);
  const markers = Object.fromEntries(names.map((n, i) => [n, `\u0001${i}\u0002`]));
  return t(key, { ...words, ...markers }).split(/\u0001(\d+)\u0002/).flatMap((part, i) => (i % 2 === 1
    ? [values[names[Number(part)]]]
    : part.split(TIMES).map((bit, j) => (j % 2 === 1 ? html`<bdi dir="ltr">${bit}</bdi>` : bit))));
}

/** A date as the product shows dates (K2, as wave 6 dueOn): Latin digits, left to right. */
const dateOf = (iso: string) => html`<bdi dir="ltr" class="due-date"><time datetime="${iso}">${iso}</time></bdi>`;

/** The card (S1, UX-86): heading and the one-tap link to the Opening dates page. A link only: no count, no read. */
export function openingCard(t: Label, href: string): Html {
  return html`<section id="opening-dates" class="card" aria-labelledby="opening-card-title"><h2 id="opening-card-title">${t('openCardTitle')}</h2>
<p class="due-set"><a class="due-link" href="${href}">${t('openSetLink')}</a></p>
</section>`;
}

/** What the page says on a row after a press: only when it matches the stored state; a failed write always. */
export type OpenStatus = { chapter: string; said: 'saved' | 'cleared' | 'failed' } | null;
/** A refused Save (S2a, S2b): the row, the value kept in its field, and the message under it. */
export interface OpenRefusal { chapter: string; kept: string; error: string; before: 'locked' | 'hidden' }

const STATUS_KEY = { saved: 'openSaved', cleared: 'openCleared', failed: 'openFailed' } as const;

interface PageView {
  subjectTitle: string;
  back: string;
  action: string;
  rows: OpenRow[];
  inOrder: boolean;
  now: number;
  status: OpenStatus;
  refusal: OpenRefusal | null;
}

function row(t: Label, lang: Lang, v: PageView, r: OpenRow): Html {
  const title = html`<bdi>${r.title}</bdi>`;
  const field = `open-${r.id}`;
  const open = isOpenNow(r.opens_on, v.now);
  const lines = openLines(r, v.inOrder, v.now);
  const refused = v.refusal && v.refusal.chapter === r.id ? v.refusal : null;
  const { min, max } = openBounds(v.now);
  // The field is empty when there is no date or the date has passed (T2); a refused row keeps the typed value (UX-87).
  const value = refused ? refused.kept : open ? '' : r.opens_on!;
  const hidden = refused ? refused.before === 'hidden' : !open && r.opens_hidden === 1;
  const status = v.status && v.status.chapter === r.id
    ? html`<p class="due-status ${v.status.said === 'failed' ? 'error' : 'done'}" role="status" tabindex="-1">${t(STATUS_KEY[v.status.said])}</p>`
    : '';
  const state = r.opens_on === null
    ? html`<p class="due-value" data-state="none">${t('openNone')}</p>`
    : open
      ? html`<p class="due-value" data-state="open">${filled(t, 'openSince', { date: dateOf(r.opens_on) })}</p>`
      : html`<p class="due-value" data-state="${r.opens_hidden === 1 ? 'hidden' : 'locked'}">${filled(t, r.opens_hidden === 1 ? 'openStateHidden' : 'openStateLocked', { date: dateOf(r.opens_on) })}</p>`;
  const learner = t('learner').toLocaleLowerCase(lang);
  const warn = [
    lines.started ? html`<p class="draft" data-line="openStartedWarn">${t('openStartedWarn', { learner })}</p>` : '',
    lines.dueWarn ? html`<p class="draft" data-line="openDueWarn">${t('openDueWarn')}</p>` : '',
    lines.cascade ? html`<p class="draft" data-line="openOrderCascade">${filled(t, 'openOrderCascade', { title })}</p>` : '',
  ];
  const invalid = refused ? html` aria-invalid="true" aria-describedby="${field}-error" autofocus` : '';
  const error = refused ? html`<p id="${field}-error" class="error due-error">${refused.error}</p>` : '';
  const radio = (value: 'locked' | 'hidden', key: LabelKey, on: boolean) =>
    html`<label class="quiz-choice check"><input type="radio" class="quiz-radio" name="before" value="${value}"${on ? raw(' checked') : ''}><span>${t(key)}</span></label>`;
  return html`<li id="${rowAnchor(r.id)}" class="due-item" tabindex="-1"><form class="due-row quiz-form" method="post" action="${v.action}/${r.id}"><fieldset class="quiz-options"><legend class="due-title">${title}</legend>
  ${status}${state}${warn}
  <label for="${field}">${filled(t, 'openLabel', { title })}</label>
  <span class="due-fields"><input type="date" id="${field}" name="opens_on" value="${value}" min="${min}" max="${max}"${invalid}></span>
  ${error}
  <fieldset class="quiz-options"><legend>${t('openBefore')}</legend>${radio('locked', 'openShowLocked', !hidden)}${radio('hidden', 'openHide', hidden)}</fieldset>
  <span class="quiz-actions"><button type="submit" name="action" value="save" class="due-button" aria-label="${t('openSaveFor', { title: r.title })}">${t('openSave')}</button><button type="submit" name="action" value="clear" formnovalidate class="due-button quiz-secondary" aria-label="${t('openClearFor', { title: r.title })}">${t('openClear')}</button></span>
</fieldset></form></li>`;
}

/** With script: the rows status line takes focus, or the refused field (UX-86, UX-87). */
const FOCUS_SCRIPT = `(function(){var e=document.querySelector('#open-list [aria-invalid=true]')||document.querySelector('#open-list .due-status');if(e){e.focus();addEventListener('load',function(){e.focus();});}})();`;

/** The Opening dates page (T2, UX-86): the back link, the heading, the help, then every chapter not removed, in outline order. */
export function openingPage(t: Label, lang: Lang, space: SpaceView, v: PageView): Html {
  const low = (key: 'chapter' | 'learner') => t(key).toLocaleLowerCase(lang);
  const words = { chapter: low('chapter'), learner: low('learner') };
  const orderWords = { chapter: words.chapter };
  const help = html`<div class="card"><p class="due-help">${filled(t, 'openCardHelp', {}, words)}</p>${v.inOrder ? html`<p class="due-help" id="open-order-note">${t('openOrderNote', orderWords)}</p>` : ''}</div>`;
  const list = v.rows.length
    ? html`<ol id="open-list" class="due-list">${v.rows.map((r) => row(t, lang, v, r))}</ol>
<script>${raw(FOCUS_SCRIPT)}</script>`
    : html`<p class="card muted" id="open-empty">${t('openEmpty')}</p>`;
  const body = html`<p class="due-back"><a id="open-back" href="${v.back}"><span>${filled(t, 'quizBackToSubject', { subjectTitle: html`<bdi>${v.subjectTitle}</bdi>` })}</span></a></p>
<h1 id="open-title" dir="auto">${filled(t, 'openPageTitle', { subjectTitle: html`<bdi>${v.subjectTitle}</bdi>` })}</h1>
${help}
<div class="due-page">${list}</div>`;
  return spacePage(t, lang, space, t('openCardTitle'), body);
}
