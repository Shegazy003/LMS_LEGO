// LMS wave 3b, task W3b-1: the pages of "Add from a spreadsheet"
// (product-contract v2 on PIL-232, section 4; ux-plan UX-36 to UX-42). Every
// address is under /s/<space>/admin/upload, behind the admin gate. Every word
// comes from the label function and the space's kit; every name and username
// read from the file is escaped and isolated in its own <bdi>, so it can neither
// add markup nor reorder the text around it. Mobile numbers are shown only as
// their last digits. Everything works without script; with script, the Add
// button is disabled after the first press and the skip link moves focus.
import { html, raw } from 'hono/html';
import type { Label, Lang } from '../labels.ts';
import { lastDigits } from '../reset.ts';
import {
  COLUMNS, UPLOAD_MAX_ROWS, type AddedPerson, type CheckedRow, type Checked, type FileRefusal, type Reason, type UploadRow,
} from '../upload.ts';
import { sentence, type Html } from './layout.ts';
import { spacePage } from './learn.ts';
import type { SpaceView } from './space.ts';

const base = (space: SpaceView) => `/s/${space.id}/admin`;
const NONE = '—';

/** The one shared date form, with the month as a word (Gregorian calendar): "3 June 2027". */
export function monthDate(t: Label, iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${Number(d)} ${t('monthWords').split(',')[Number(m) - 1]} ${y}`;
}

const bdi = (text: string) => (text.trim() ? html`<bdi>${text}</bdi>` : html`<bdi>${NONE}</bdi>`);
const ltr = (text: string) => html`<bdi dir="ltr">${text}</bdi>`;

/** The message of a whole-file refusal, in the page's language. */
export function refusalText(t: Label, lang: Lang, r: FileRefusal): string {
  const join = (list: string[]) => (list.length ? list.join(lang === 'ar' ? '، ' : ', ') : NONE);
  switch (r.kind) {
    case 'notCsv': return t('fileNotCsv');
    case 'notUtf8': return t('fileNotUtf8');
    case 'tooBig': return t('fileTooBig', { n: r.people, max: String(UPLOAD_MAX_ROWS) });
    case 'empty': return t('fileEmpty');
    case 'password': return t('filePassword');
    case 'columns': {
      const text = t('fileColumns', {
        columns: join(COLUMNS.map((c) => t(c))), missing: join(r.missing.map((c) => t(c))), unknown: join(r.unknown.map((u) => (u ? `"${u}"` : '""'))),
      });
      return r.twice.length ? `${text} ${t('fileColumnsTwice', { twice: join(r.twice.map((c) => t(c))) })}` : text;
    }
  }
}

/** One refusal reason of a row, in the page's language. */
function reasonText(t: Label, r: Reason, ownEnd: string): Html | Html[] | string[] {
  switch (r.key) {
    case 'rowUsernameTwice': return sentence(t, 'rowUsernameTwice', { rows: r.rows.join(', ') });
    case 'rowEndDateOwn': return sentence(t, 'rowEndDateOwn', { date: ownEnd });
    case 'rowFields': return sentence(t, 'rowFields', { n: String(r.n) });
    default: return html`${t(r.key)}`;
  }
}

/** Styles of these pages only: the tables become stacked cards below 768 px; the focus ring on the blocks that take focus. */
const STYLE = html`<style>
.upload-how li{margin:4px 0}
.upload-actions{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin:12px 0}
a.button.plain.secondary-link{display:inline-flex;align-items:center;justify-content:center;min-height:44px;min-width:44px}
form.upload-form button[type=submit],#add{min-height:48px}
@media (max-width:767px){form.upload-form button[type=submit],#add{width:100%}}
[tabindex="-1"]:focus{outline:3px solid #1b1f24;outline-offset:2px}
.rows{width:100%;border-collapse:collapse;background:#fff;border:1px solid #e3e6ea;border-radius:12px}
.rows th,.rows td{text-align:start;vertical-align:top;padding:8px 10px;border-bottom:1px solid #eef0f3}
.rows td ul{margin:0;padding-inline-start:18px}
.rows td{overflow-wrap:anywhere;word-break:break-word}
@media (max-width:767px){
.rows,.rows tbody,.rows tr,.rows td{display:block;width:100%}
.rows thead{display:none}
.rows tr{border-bottom:1px solid #c9ced6;padding:8px 0}
.rows td{border:0;padding:2px 12px}
.rows td::before{content:attr(data-label) ": ";font-weight:600}
}
.tag{display:inline-block;padding:0 8px;border:1px solid #57606a;border-radius:999px;font-size:.875rem;font-weight:600;color:#1b1f24;background:#fff}
#added li{display:flex;flex-wrap:wrap;gap:4px 12px;align-items:center}
#added a.person{display:inline-flex;align-items:center;min-height:44px;font-weight:600}
#added a.button.send-link{display:inline-flex;align-items:center;justify-content:center;min-height:44px;min-width:44px}
#uploads ul{list-style:none;margin:0;padding:0}
#uploads a{display:flex;align-items:center;min-height:44px;overflow-wrap:anywhere}
</style>`;

// ---------------------------------------------------------------- step 1 ----

export interface UploadView {
  /** The admin's own end date. */
  ownEnd: string;
  /** A whole-file refusal to show at the top (status 400). */
  refusal?: string;
  /** W3b-1b (UX-40): this space's latest uploads, newest first (src/upload.ts uploadsOf). */
  uploads: readonly UploadRow[];
}

/** The day of an upload, with the month as a word. */
const uploadDay = (t: Label, row: UploadRow) => monthDate(t, new Date(row.uploaded_at).toISOString().slice(0, 10));

/** "Earlier uploads" (UX-40): each a link to its done page, or "No uploads yet.". */
function earlierUploads(t: Label, space: SpaceView, uploads: readonly UploadRow[]): Html {
  const list = uploads.length
    ? html`<ul>${uploads.map((u) => html`<li><a id="u-${u.id}" href="${base(space)}/upload/${u.id}"><span>${sentence(t, 'uploadsRow', {
      date: uploadDay(t, u), name: u.uploader, added: String(u.lines_added), refused: String(u.lines_refused),
    })}</span></a></li>`)}</ul>`
    : html`<p id="uploads-none">${t('uploadsNone')}</p>`;
  return html`<section id="uploads" class="card" aria-labelledby="uploads-title">
  <h2 id="uploads-title">${t('uploadsHeading')}</h2>
  ${list}
</section>`;
}

/** Step 1 (UX-36): the how-to with the five columns, the limits, the empty sheet, the file field and "Check the file". */
export function uploadPage(t: Label, lang: Lang, space: SpaceView, v: UploadView): Html {
  const alert = v.refusal ? html`<div id="refusal" class="error" role="alert" tabindex="-1" autofocus>${v.refusal}</div>` : '';
  const body = html`${STYLE}<h1 id="upload-title"${v.refusal ? '' : raw(' tabindex="-1"')}>${t('uploadTitle')}</h1>
<p id="upload-step">${t('uploadStep1')}</p>
${alert}
<section id="upload-how" class="card">
  <p>${t('uploadHow')}</p>
  <ul class="upload-how" id="columns">
    <li data-col="displayName"><strong>${t('displayName')}</strong></li>
    <li data-col="username"><strong>${t('username')}</strong> <span class="hint">${t('usernameHint')}</span></li>
    <li data-col="roleField" id="role-line"><strong>${t('uploadRoleCol')}</strong></li>
    <li data-col="mobile"><strong>${t('mobile')}</strong> <span class="hint">${t('mobileParentHint')}</span></li>
    <li data-col="endDate" id="date-line"><strong>${sentence(t, 'uploadDateCol', { date: v.ownEnd })}</strong></li>
  </ul>
  <p id="upload-limits">${t('uploadLimits', { max: String(UPLOAD_MAX_ROWS) })}</p>
  <p><a id="upload-sheet" class="button plain secondary-link" href="${base(space)}/upload/sheet.csv" download>${t('uploadSheet')}</a></p>
</section>
<form id="upload" class="stack card upload-form" method="post" action="${base(space)}/upload/check" enctype="multipart/form-data" autocomplete="off">
  <label for="upload-file">${t('uploadFile')}</label>
  <input id="upload-file" name="file" type="file" accept=".csv,text/csv" required>
  <button id="check-file" type="submit">${t('uploadCheck')}</button>
  <p class="muted" id="upload-saves">${t('uploadCheckSaves')}</p>
</form>
${earlierUploads(t, space, v.uploads)}`;
  return spacePage(t, lang, space, t('uploadTitle'), body);
}

/** The empty sheet (section 4 step 2): the header line in the space's first language, with a UTF-8 byte-order mark so Excel shows Arabic. */
export function emptySheet(t: Label): string {
  return `﻿${COLUMNS.map((c) => t(c)).join(',')}\r\n`;
}

// ---------------------------------------------------------------- step 2 ----

export interface CheckView {
  checked: Checked;
  /** The file's text, carried to the add (hidden), with the fingerprint. */
  text: string;
  ownEnd: string;
  /** The notice at the top: changed since the check (409), or the add failed. */
  notice?: 'checkChanged' | 'uploadFailed';
}

function refusedTable(t: Label, rows: readonly CheckedRow[], ownEnd: string): Html {
  const head = [t('checkRowHead'), t('username'), t('displayName'), t('checkReasons')];
  return html`<table class="rows" id="refused-rows"><thead><tr>${head.map((h) => html`<th scope="col">${h}</th>`)}</tr></thead><tbody>${rows.map((r) => html`<tr data-row="${r.row}">
  <td data-label="${head[0]}">${sentence(t, 'checkRow', { n: String(r.row) })}</td>
  <td data-label="${head[1]}" class="username">${bdi(r.username)}</td>
  <td data-label="${head[2]}" class="name">${bdi(r.name)}</td>
  <td data-label="${head[3]}"><ul class="reasons">${r.reasons.map((x) => html`<li data-reason="${x.key}">${reasonText(t, x, ownEnd)}</li>`)}</ul></td>
</tr>`)}</tbody></table>`;
}

function addTable(t: Label, rows: readonly CheckedRow[]): Html {
  const head = [t('checkRowHead'), t('displayName'), t('username'), t('roleField'), t('mobile'), t('endDate')];
  return html`<table class="rows" id="add-rows"><thead><tr>${head.map((h) => html`<th scope="col">${h}</th>`)}</tr></thead><tbody>${rows.map((r) => {
    const p = r.person!;
    return html`<tr data-row="${r.row}">
  <td data-label="${head[0]}">${sentence(t, 'checkRow', { n: String(r.row) })}</td>
  <td data-label="${head[1]}" class="name">${bdi(r.name)}</td>
  <td data-label="${head[2]}" class="username">${ltr(p.username)}</td>
  <td data-label="${head[3]}">${t(p.role === 'publisher' ? 'publisher' : p.role === 'guardian' ? 'guardian' : 'learner')}</td>
  <td data-label="${head[4]}">${sentence(t, 'mobileEnding', { digits: lastDigits(p.mobile) })}</td>
  <td data-label="${head[5]}">${bdi(monthDate(t, p.validUntil))}</td>
</tr>`;
  })}</tbody></table>`;
}

// With script: the first press disables Add and marks it busy, so a second press sends nothing; the skip link moves focus to Add.
const CHECK_SCRIPT = raw(`<script>(function(){var f=document.getElementById('add-form'),b=document.getElementById('add'),s=document.getElementById('skip'),sent=false;
if(f&&b)f.addEventListener('submit',function(e){if(sent){e.preventDefault();return;}sent=true;setTimeout(function(){b.disabled=true;b.setAttribute('aria-busy','true');b.classList.add('busy');},0);});
if(s&&b)s.addEventListener('click',function(e){e.preventDefault();b.focus();});})();</script>`);

/** Step 2 (UX-37, UX-38): the summary, refused rows first with every reason, the rows to be added, then the action block. */
export function checkPage(t: Label, lang: Lang, space: SpaceView, v: CheckView): Html {
  const c = v.checked;
  const notice = v.notice ? html`<div id="notice" class="error" role="alert" tabindex="-1" autofocus>${t(v.notice)}</div>` : '';
  const actions = c.add.length
    ? html`<form id="add-form" method="post" action="${base(space)}/upload/add" autocomplete="off">
  <input type="hidden" name="text" value="${v.text}">
  <input type="hidden" name="fp" value="${c.fingerprint}">
  <button id="add" type="submit">${t('checkAdd', { n: String(c.add.length) })}</button>
</form>
<a id="another" class="button plain secondary-link" href="${base(space)}/upload">${t('checkAnother')}</a>`
    : html`<p id="check-none">${t('checkNone')}</p>
<a id="another" class="button plain secondary-link" href="${base(space)}/upload">${t('checkAnother')}</a>`;
  const body = html`${STYLE}${notice}<h1 id="check-title" tabindex="-1"${v.notice ? '' : raw(' autofocus')}>${t('checkTitle')}</h1>
<div id="summary" class="card" role="status">
  <p>${sentence(t, 'checkSummary', { rows: String(c.rows), add: String(c.add.length), refused: String(c.refused.length) })}</p>
  <p><strong>${t('checkNothingSaved')}</strong></p>
</div>
${c.add.length > 10 ? html`<p><a id="skip" href="#add">${t('checkSkip')}</a></p>` : ''}
${c.refused.length ? html`<h2 id="refused-title">${t('checkRefused')}</h2>${refusedTable(t, c.refused, v.ownEnd)}` : ''}
${c.add.length ? html`<h2 id="add-title">${t('checkWillAdd')}</h2>${addTable(t, c.add)}` : ''}
<div id="actions" class="upload-actions">${actions}</div>
${c.add.length ? CHECK_SCRIPT : ''}`;
  return spacePage(t, lang, space, t('checkTitle'), body, { wide: true });
}

// ------------------------------------------------------------- done page ----

export interface DoneView {
  upload: UploadRow;
  people: AddedPerson[];
  /** A second press of the same form (the repeat rule): told at the top, which takes focus. */
  again: boolean;
}

// With script: back from a reset-link page at #p-<userId>, focus lands on that person's name link
// (a page opened at an existing fragment skips autofocus, so the h1 does not take it). The browser clears
// focus when it scrolls to the fragment after loading, so the focus is set after the load event.
const DONE_SCRIPT = raw(`<script>(function(){function go(){var h=location.hash.slice(1);if(!/^p-[0-9a-f-]{36}$/.test(h))return;var r=document.getElementById(h);var a=r&&r.querySelector('a.person');if(a)a.focus();}
if(document.readyState==='complete')setTimeout(go,0);else window.addEventListener('load',function(){setTimeout(go,0);});})();</script>`);

/** The done page (UX-39, UX-43): who was added, who has no password yet, and for each of them "Send reset link by WhatsApp". */
export function donePage(t: Label, lang: Lang, space: SpaceView, v: DoneView): Html {
  const day = new Date(v.upload.uploaded_at).toISOString().slice(0, 10);
  const again = v.again ? html`<div id="again" class="done" role="status" tabindex="-1" autofocus>${t('doneAgain')}</div>` : '';
  const anyWithout = v.people.some((p) => p.no_password);
  const rows = v.people.map((p) => html`<li id="p-${p.id}" data-user="${p.id}">
  <a class="person" href="${base(space)}/people/${p.id}"><bdi>${p.display_name}</bdi></a>
  ${ltr(p.username)}
  <span class="muted">${t(p.role === 'publisher' ? 'publisher' : p.role === 'guardian' ? 'guardian' : 'learner')}</span>
  <span class="tag" data-tag="${p.no_password ? 'no-password' : 'password-set'}">${t(p.no_password ? 'noPasswordTag' : 'passwordSetTag')}</span>
  ${p.no_password ? html`<a id="send-${p.id}" class="button send-link" href="${base(space)}/people/${p.id}/link?back=${v.upload.id}">${t('sendResetLink')}</a>` : ''}
</li>`);
  const body = html`${STYLE}${again}<h1 id="done-title" tabindex="-1"${v.again ? '' : raw(' autofocus')}>${sentence(t, 'doneTitle', { n: String(v.people.length) })}</h1>
<p id="done-meta">${sentence(t, 'doneMeta', { date: uploadDay(t, v.upload), name: v.upload.uploader, n: String(v.upload.lines_refused) })}</p>
${anyWithout ? html`<p id="done-no-password">${t('doneNoPassword')}</p>` : ''}
<ul id="added" class="list card">${rows}</ul>
<div class="upload-actions">
  <a id="back-people" class="button plain secondary-link" href="${base(space)}/people">${t('backToPeople')}</a>
  <a id="to-group" class="button plain secondary-link" href="${base(space)}/sets">${t('addToGroup')}</a>
</div>
${DONE_SCRIPT}`;
  return spacePage(t, lang, space, t('doneTitle', { n: String(v.people.length) }), body);
}
