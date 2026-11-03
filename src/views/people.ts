// One person's page, as their appointer sees it (the admin for publishers and
// learners, the owner for admins; docs/02-LEGO-MODEL.md, rule 5), and the two
// steps of a reset link: the confirmation (last digits, one tap) and the link
// itself (a WhatsApp button and a Copy button, side by side).
//
// The registered number is shown only as its last digits. In full it appears
// in exactly one place: the WhatsApp button's wa.me address on the link step.
import { html } from 'hono/html';
import type { Label } from '../labels.ts';
import { DISPLAY_NAME_MAX } from '../names.ts';
import { errorBox, sentence, type Html } from './layout.ts';

export interface PersonView {
  id: string;
  username: string;
  display_name: string;
  roleLabel: string;
  valid_until: string;
  digits: string;
  /** Whether access has ended (by its end date, or with "End access now"), and on which day. */
  ended: boolean;
  endedDate: string;
}

/** Where the person's pages live, and how a page is framed (space or owner layout). */
export interface PersonFrame {
  t: Label;
  base: string; // e.g. /s/<space>/admin/people/<user>
  back: { href: string; label: string };
  frame: (title: string, body: Html) => Html;
  /** For typed end dates: today, and the appointer's own end date (none for the owner). */
  today: string;
  ownEnd: string | null;
  spaceName: string;
}

/** What the appointer typed into the correction or restore form, kept when it is refused. */
export interface CorrectionValues {
  display_name?: string;
  mobile?: string;
  valid_until?: string;
}

export type PersonNotice = 'setPasswordDone' | 'saved' | 'mobileChanged' | 'accessEndedDone' | 'accessRestored' | 'linkDone' | 'unlinkDone' | 'linkRestored';

/** A guardian's links, on their person page (release 2, R2-a): the learners
 * linked now, the removed links (each can be restored), and the learners of
 * the space who can still be linked. */
export interface LinksView {
  active: { id: string; display_name: string }[];
  ended: { id: string; display_name: string }[];
  choices: { id: string; display_name: string }[];
}

function backLink(f: PersonFrame): Html {
  return html`<p><a id="back" href="${f.back.href}">${f.back.label}</a></p>`;
}

function endDateField(f: PersonFrame, value: string): Html {
  const { t } = f;
  return html`<label>${t('endDate')}<input name="valid_until" type="date" required min="${f.today}" ${f.ownEnd ? html`max="${f.ownEnd}"` : ''} value="${value}">${
    f.ownEnd ? html`<span class="hint">${sentence(t, 'endDateOwnHint', { date: f.ownEnd })}</span>` : ''}</label>`;
}

/** One person: their details, the correction form (name, mobile, end date),
 * and either the reset link, a new password and "End access now", or, once
 * their access has ended, "Restore access" with a new end date. */
export function personPage(
  f: PersonFrame,
  p: PersonView,
  v: { error?: string; notice?: PersonNotice; values?: CorrectionValues; links?: LinksView } = {},
): Html {
  const { t } = f;
  const typed = v.values ?? {};
  const status = p.ended ? sentence(t, 'endedOn', { date: p.endedDate }) : sentence(t, 'validUntil', { date: p.valid_until });
  const correct = html`<h2>${t('correctTitle')}</h2>
<form id="correct" class="stack card" method="post" action="${f.base}/correct">
  <label>${t('displayName')}<input name="display_name" required maxlength="${DISPLAY_NAME_MAX}" dir="auto" value="${typed.display_name ?? p.display_name}"></label>
  <label>${t('mobile')}<input name="mobile" type="tel" dir="ltr" autocomplete="off" value="${typed.mobile ?? ''}"><span class="hint">${sentence(t, 'mobileKeepHint', { digits: p.digits })}</span></label>
  ${p.ended ? '' : endDateField(f, typed.valid_until ?? p.valid_until)}
  <p class="muted">${t('correctNote')}</p>
  <button type="submit">${t('saveCorrection')}</button>
</form>`;
  const ended = html`<h2>${t('restoreTitle')}</h2>
<form id="restore" class="stack card" method="post" action="${f.base}/restore">
  <p class="muted">${t('restoreNote')}</p>
  ${endDateField(f, typed.valid_until ?? '')}
  <button type="submit">${t('restoreTitle')}</button>
</form>`;
  const body = html`${backLink(f)}
<h1 id="person-name" dir="auto">${p.display_name}</h1>
<div id="person" class="card">
  <div>${t('username')}: <bdi dir="ltr">${p.username}</bdi></div>
  <div>${t('roleField')}: ${p.roleLabel}</div>
  <div class="muted"><span id="person-status">${status}</span> · ${sentence(t, 'mobileEnding', { digits: p.digits })}</div>
</div>
${v.notice ? html`<p id="done" class="done" role="status">${t(v.notice)}</p>` : ''}
${errorBox(v.error)}
${v.links ? linksSection(f, v.links) : ''}
${correct}
${p.ended ? ended : activeActions(f, p)}`;
  return f.frame(p.display_name, body);
}

/** A guardian's links: who they see now (each with Remove the link, a step
 * that names both people), the removed links with Restore, and a form to link
 * another learner of the space. */
function linksSection(f: PersonFrame, v: LinksView): Html {
  const { t } = f;
  const active = v.active.length
    ? html`<ul id="links" class="list">${v.active.map((l) => html`<li data-linked="${l.id}" class="row"><bdi>${l.display_name}</bdi>
  <a class="unlink" href="${f.base}/links/${l.id}/remove">${t('unlink')}</a></li>`)}</ul>`
    : html`<p id="links" class="muted">${t('linksNone')}</p>`;
  const ended = v.ended.length
    ? html`<details id="links-ended" class="card"><summary>${t('linksEnded')}</summary><ul class="list">${v.ended.map((l) => html`<li data-unlinked="${l.id}" class="row"><bdi>${l.display_name}</bdi>
  <form method="post" action="${f.base}/links"><input type="hidden" name="learner" value="${l.id}"><input type="hidden" name="restore" value="1"><button type="submit">${t('linkRestore')}</button></form></li>`)}</ul></details>`
    : '';
  const add = v.choices.length
    ? html`<form id="link-learner" class="inline-add" method="post" action="${f.base}/links">
  <label>${t('linkAdd')}<select name="learner">${v.choices.map((c) => html`<option value="${c.id}">${c.display_name}</option>`)}</select></label>
  <button type="submit">${t('linkButton')}</button>
</form>`
    : '';
  return html`<h2 id="links-title">${t('linksTitle')}</h2>
<div class="card">
  <p class="muted">${t('linksNote')}</p>
  ${active}
  ${add}
</div>
${ended}`;
}

/** Remove the link, step one: a page that names both people. Cancel goes back
 * (a plain link, which changes nothing); the confirming tap posts. */
export function unlinkConfirmPage(f: PersonFrame, p: PersonView, learner: { id: string; display_name: string }): Html {
  const { t } = f;
  const names = { name: p.display_name, other: learner.display_name };
  const body = html`${backLink(f)}
<h1 id="unlink-title">${sentence(t, 'unlinkConfirmTitle', names)}</h1>
<div id="unlink-confirm" class="card">
  <p class="muted">${sentence(t, 'unlinkConfirmNote', names)}</p>
  <div class="share">
    <form id="confirm-unlink" method="post" action="${f.base}/links/${learner.id}/remove"><button type="submit" class="secondary">${t('unlinkYes')}</button></form>
    <a id="cancel-unlink" class="button" href="${f.base}">${t('cancel')}</a>
  </div>
</div>`;
  return f.frame(t('unlinkConfirmTitle', names), body);
}

function activeActions(f: PersonFrame, p: PersonView): Html {
  const { t } = f;
  return html`<h2>${t('sendResetLink')}</h2>
<form id="send-link" class="stack card" method="get" action="${f.base}/link">
  <p class="muted">${t('resetLinkNote')}</p>
  <button type="submit">${t('sendResetLink')}</button>
</form>
<h2>${t('setPasswordTitle')}</h2>
<form id="set-password" class="stack card" method="post" action="${f.base}/password">
  <p class="muted">${t('setPasswordNote', { name: p.display_name })}</p>
  <label>${t('newPassword')}<input name="new_password" type="password" required minlength="8" autocomplete="new-password"><span class="hint">${t('passwordHint')}</span></label>
  <button type="submit">${t('setPasswordTitle')}</button>
</form>
<h2>${t('endNow')}</h2>
<form id="end-access" class="stack card" method="get" action="${f.base}/end">
  <p class="muted">${t('endNowNote')}</p>
  <button type="submit" class="secondary">${t('endNow')}</button>
</form>`;
}

/** "End access now", step one: a page that names the person. Cancel goes back
 * (a plain link, which changes nothing); the confirming tap posts. */
export function endConfirmPage(f: PersonFrame, p: PersonView): Html {
  const { t } = f;
  const body = html`${backLink(f)}
<h1 id="end-title">${sentence(t, 'endConfirmTitle', { name: p.display_name })}</h1>
<div id="end-confirm" class="card">
  <p class="message"><bdi dir="auto">${p.display_name}</bdi> · <bdi dir="ltr">${p.username}</bdi></p>
  <p class="muted">${sentence(t, 'endConfirmNote', { name: p.display_name, space: f.spaceName })}</p>
  <div class="share">
    <form id="confirm-end" method="post" action="${f.base}/end"><button type="submit" class="secondary">${t('endConfirmYes')}</button></form>
    <a id="cancel-end" class="button" href="${f.base}">${t('cancel')}</a>
  </div>
</div>`;
  return f.frame(t('endConfirmTitle', { name: p.display_name }), body);
}

/** Step one: the last digits, and one confirming tap. */
export function confirmLinkPage(f: PersonFrame, p: PersonView): Html {
  const { t } = f;
  const body = html`${backLink(f)}
<h1>${t('sendResetLink')}</h1>
<div class="card">
  <p class="message"><bdi dir="auto">${p.display_name}</bdi></p>
  <p class="message">${t('confirmDigits')} <bdi id="confirm-digits" dir="ltr" class="nowrap">${p.digits}</bdi></p>
  <p class="muted">${t('confirmNote')}</p>
  <form id="confirm-link" method="post" action="${f.base}/link"><button type="submit">${t('confirmSend')}</button></form>
</div>`;
  return f.frame(t('sendResetLink'), body);
}

// The Copy button copies the link; without the clipboard it selects the field.
const COPY_SCRIPT = html`<script>
(function () {
  var button = document.getElementById('copy');
  var field = document.getElementById('reset-link');
  if (!button || !field) return;
  button.addEventListener('click', function () {
    var done = function () { button.textContent = button.getAttribute('data-done'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(button.getAttribute('data-copy')).then(done, function () { field.select(); });
    } else {
      field.select();
      document.execCommand('copy');
      done();
    }
  });
})();
</script>`;

/** Step two: the link, as a WhatsApp button (wa.me with the fixed message) and a Copy button. */
export function linkReadyPage(f: PersonFrame, p: PersonView, v: { link: string; whatsapp: string | null }): Html {
  const { t } = f;
  const body = html`${backLink(f)}
<h1>${t('linkReadyTitle')}</h1>
<div class="card">
  <p class="message"><bdi dir="auto">${p.display_name}</bdi> · ${sentence(t, 'mobileEnding', { digits: p.digits })}</p>
  <p class="muted">${t('linkReadyNote')}</p>
  <div class="share">
    ${v.whatsapp ? html`<a id="whatsapp" class="button whatsapp" href="${v.whatsapp}" target="_blank" rel="noopener noreferrer">${t('openWhatsapp')}</a>` : ''}
    <button id="copy" type="button" data-copy="${v.link}" data-done="${t('copied')}">${t('copyLink')}</button>
  </div>
  <label>${t('theLink')}<input id="reset-link" readonly dir="ltr" value="${v.link}"></label>
</div>
${COPY_SCRIPT}`;
  return f.frame(t('linkReadyTitle'), body);
}
