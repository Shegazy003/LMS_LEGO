// LMS wave 5 (product-contract v2 on PIL-246, section 4; ux-plan UX-51 to
// UX-53, UX-57): the announcement card of a subject, on the responsible
// publisher's editor and on the admin's subject page, and its edit and remove
// pages. Plain forms that work without script; with script the count follows
// the server's rules and the button is disabled after the first press. Every
// text is an escaped text node; every word comes from the label function. The
// card's CSS is the `/* wave 5 announcements */` block of layout.ts.
import { html, raw } from 'hono/html';
import type { Label, Lang } from '../labels.ts';
import {
  ANN_FOLDED, ANN_HOME, ANN_HOME_DAYS, ANN_MAX, ANN_SHOWN, COUNT_RULES_JS, mayEdit, mayRemove,
  type AnnouncementRow, type AuthorRole,
} from '../announcements.ts';
import { utcDate } from '../access.ts';
import type { Html } from './layout.ts';
import { spacePage } from './learn.ts';
import type { SpaceView } from './space.ts';

/** From the 11th item on, the card says the item no longer shows to learners (section 4.2). */
const SHOWN_TO_LEARNERS = ANN_SHOWN + ANN_FOLDED;

/** What the card's status line says after a press (section 4.2): only when it matches the stored state; a failed write always. */
export type AnnStatus = 'posted' | 'saved' | 'removed' | 'failed' | null;
const STATUS_KEY = { posted: 'annPosted', saved: 'annSaved', removed: 'annRemovedDone', failed: 'markFailed' } as const;

/** A typed text sent back after a refusal (section 4.3): the text as typed, and the error. */
export interface AnnRefusal {
  typed: string;
  error: string;
}

/** A product sentence whose values are ready markup (here: the role word and a <time>). */
function filled(t: Label, key: 'annByLine' | 'annEdited', values: Record<string, Html>): (Html | string)[] {
  const names = Object.keys(values);
  const markers = Object.fromEntries(names.map((n, i) => [n, `\u0001${i}\u0002`]));
  return t(key, markers).split(/\u0001(\d+)\u0002/).map((part, i) => (i % 2 === 1 ? values[names[Number(part)]] : part));
}

const day = (iso: string) => html`<bdi dir="ltr"><time datetime="${iso}">${utcDate(Date.parse(iso))}</time></bdi>`;

/** The role and date line, and when edited the edited line (ux-plan UX-54, UX-56). */
export function byLine(t: Label, row: Pick<AnnouncementRow, 'author_role' | 'created_at' | 'edited_at'>): Html {
  const by = filled(t, 'annByLine', { role: html`<bdi>${t(row.author_role)}</bdi>`, date: day(row.created_at) });
  const edited = row.edited_at ? html` · <span class="ann-edited">${filled(t, 'annEdited', { date: day(row.edited_at) })}</span>` : '';
  return html`<p class="ann-by">${by}${edited}</p>`;
}

/** The text area with its label, error and count, and the button (UX-53). */
function textForm(t: Label, v: { id: string; action: string; label: Html; value: string; error?: string; button: string; cancel?: string }): Html {
  const err = v.error ? html`<p id="${v.id}-error" class="error ann-error">${v.error}</p>` : '';
  const invalid = v.error ? html` aria-invalid="true" aria-describedby="${v.id}-error" autofocus` : '';
  const count = t('annCount', { n: '{n}', max: String(ANN_MAX) });
  const over = t('annTooLong', { n: '{n}', max: String(ANN_MAX) });
  return html`<form id="${v.id}" class="ann-form" method="post" action="${v.action}">
  <label for="${v.id}-body">${v.label}</label>
  <textarea id="${v.id}-body" name="body" rows="4" dir="auto"${invalid}>${v.value}</textarea>
  ${err}<p class="ann-count" aria-live="polite" data-count="${count}" data-over="${over}"></p>
  <div class="ann-actions"><button type="submit" class="secondary">${v.button}</button>${v.cancel ? html`<a class="ann-cancel" href="${v.cancel}">${t('annCancel')}</a>` : ''}</div>
</form>
<script>${raw(FORM_SCRIPT)}</script>`;
}

/** The live count in code points (the server's rules), shown at most once per
 * input pause; the button is disabled after the first press; focus goes to
 * the status line after a press, or to the field after a refusal. */
const FORM_SCRIPT = `(function(){${COUNT_RULES_JS}var max=${ANN_MAX};
document.querySelectorAll('form.ann-form').forEach(function(f){if(f.getAttribute('data-ready'))return;f.setAttribute('data-ready','1');
var a=f.querySelector('textarea'),o=f.querySelector('.ann-count'),b=f.querySelector('button[type=submit]'),tm=0;
function show(){var n=annLen(a.value),bad=n>max;o.textContent=(bad?o.getAttribute('data-over'):o.getAttribute('data-count')).replace('{n}',String(n));o.classList.toggle('ann-over',bad);}
a.addEventListener('input',function(){clearTimeout(tm);tm=setTimeout(show,250);});show();
f.addEventListener('submit',function(){b.disabled=true;});
if(a.getAttribute('aria-invalid')==='true')a.focus();});
var s=document.querySelector('#announcements .ann-status');if(s){s.focus();addEventListener('load',function(){s.focus();});}})();`;

/** One item of the card: text, role and date line, the old-item note, and only the controls the role may use (section 4.1, UX-51). */
function cardItem(t: Label, role: AuthorRole, base: string, row: AnnouncementRow, i: number, n: number): Html {
  const pos = { i: String(i + 1), n: String(n) };
  const edit = mayEdit(role, row) ? html`<a class="ann-edit" href="${base}/${row.id}" aria-label="${t('annEditN', pos)}">${t('annEdit')}</a>` : '';
  const remove = mayRemove(role, row) ? html`<a class="ann-remove" href="${base}/${row.id}/remove" aria-label="${t('annRemoveN', pos)}">${t('annRemove')}</a>` : '';
  return html`<li class="ann-item" data-ann="${row.id}" data-role="${row.author_role}">
  <p class="ann-text" dir="auto">${row.body}</p>
  ${byLine(t, row)}${i >= SHOWN_TO_LEARNERS ? html`<p class="ann-old">${t('annOldItem')}</p>` : ''}
  ${edit || remove ? html`<div class="ann-controls">${edit}${remove}</div>` : ''}
</li>`;
}

/** The announcement card (section 4.2, UX-51, UX-52): status line, heading,
 * help line, the unpublished line, the form, then the list newest first. */
export function announcementCard(
  t: Label,
  lang: Lang,
  v: { action: string; role: AuthorRole; published: boolean; rows: AnnouncementRow[]; status: AnnStatus; refusal?: AnnRefusal },
): Html {
  const subject = t('subject').toLocaleLowerCase(lang);
  const learner = t('learner').toLocaleLowerCase(lang);
  const help = t('annHelp', {
    max: String(ANN_MAX), shown: String(ANN_SHOWN), folded: String(ANN_FOLDED), home: String(ANN_HOME), days: String(ANN_HOME_DAYS), subject, learner,
  });
  const shown = v.rows.filter((r) => r.removed_at === null);
  const status = v.status
    ? html`<p class="ann-status ${v.status === 'failed' ? 'error' : 'done'}" role="status" tabindex="-1">${t(STATUS_KEY[v.status])}</p>`
    : '';
  const list = shown.length
    ? html`<ul class="ann-list">${shown.map((row, i) => cardItem(t, v.role, v.action, row, i, shown.length))}</ul>`
    : html`<p class="ann-empty">${t('annEmpty')}</p>`;
  return html`<section id="announcements" class="card" tabindex="-1">
${status}<h2>${t('annTitle')}</h2>
<p class="ann-help">${help}</p>
${v.published ? '' : html`<p class="ann-help ann-unpublished">${t('annUnpublished', { subject })}</p>`}
${textForm(t, { id: 'ann-new', action: v.action, label: html`${t('annNewLabel')}`, value: v.refusal?.typed ?? '', error: v.refusal?.error, button: t('annPost') })}
${list}
</section>`;
}

/** The page around an edit or remove step: the subject's title, then the step in the card's place. */
function stepPage(t: Label, lang: Lang, space: SpaceView, subjectTitle: string, inner: Html): Html {
  const body = html`<p class="muted">${t('subject')}</p>
<h1 dir="auto">${subjectTitle}</h1>
<section id="announcements" class="card">${inner}</section>`;
  return spacePage(t, lang, space, subjectTitle, body);
}

/** The edit page (section 4.2, UX-52): the stored text in the field, Save, then Cancel back to the card. */
export function announcementEditPage(
  t: Label,
  lang: Lang,
  space: SpaceView,
  v: { subjectTitle: string; action: string; back: string; row: AnnouncementRow; refusal?: AnnRefusal },
): Html {
  const inner = html`<h2 id="ann-edit-title">${t('annEdit')}</h2>
${textForm(t, { id: 'ann-edit', action: v.action, label: html`${t('annTitle')}`, value: v.refusal?.typed ?? v.row.body, error: v.refusal?.error, button: t('annSave'), cancel: v.back })}
${byLine(t, v.row)}`;
  return stepPage(t, lang, space, v.subjectTitle, inner);
}

/** The remove confirmation (section 4.2, UX-57): says the text is erased; Remove, then Cancel back to the card. */
export function announcementRemovePage(
  t: Label,
  lang: Lang,
  space: SpaceView,
  v: { subjectTitle: string; action: string; back: string; row: AnnouncementRow },
): Html {
  const inner = html`<h2>${t('annRemove')}</h2>
<p id="ann-remove-ask">${t('annRemoveAsk')}</p>
<p class="ann-quote" dir="auto">${v.row.body}</p>
${byLine(t, v.row)}
<form id="ann-remove" method="post" action="${v.action}"><div class="ann-actions"><button type="submit">${t('annRemove')}</button><a class="ann-cancel" href="${v.back}">${t('annCancel')}</a></div></form>`;
  return stepPage(t, lang, space, v.subjectTitle, inner);
}
