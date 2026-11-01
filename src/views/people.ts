// One person's page, as their appointer sees it (the admin for publishers and
// learners, the owner for admins; docs/02-LEGO-MODEL.md, rule 5), and the two
// steps of a reset link: the confirmation (last digits, one tap) and the link
// itself (a WhatsApp button and a Copy button, side by side).
//
// The registered number is shown only as its last digits. In full it appears
// in exactly one place: the WhatsApp button's wa.me address on the link step.
import { html } from 'hono/html';
import type { Label } from '../labels.ts';
import { errorBox, sentence, type Html } from './layout.ts';

export interface PersonView {
  id: string;
  username: string;
  display_name: string;
  roleLabel: string;
  valid_until: string;
  digits: string;
}

/** Where the person's pages live, and how a page is framed (space or owner layout). */
export interface PersonFrame {
  t: Label;
  base: string; // e.g. /s/<space>/admin/people/<user>
  back: { href: string; label: string };
  frame: (title: string, body: Html) => Html;
}

function backLink(f: PersonFrame): Html {
  return html`<p><a id="back" href="${f.back.href}">${f.back.label}</a></p>`;
}

export function personPage(f: PersonFrame, p: PersonView, v: { error?: string; done?: boolean } = {}): Html {
  const { t } = f;
  const body = html`${backLink(f)}
<h1 id="person-name" dir="auto">${p.display_name}</h1>
<div id="person" class="card">
  <div>${t('username')}: <bdi dir="ltr">${p.username}</bdi></div>
  <div>${t('roleField')}: ${p.roleLabel}</div>
  <div class="muted">${sentence(t, 'validUntil', { date: p.valid_until })} · ${sentence(t, 'mobileEnding', { digits: p.digits })}</div>
</div>
${v.done ? html`<p id="done" class="done" role="status">${t('setPasswordDone')}</p>` : ''}
${errorBox(v.error)}
<h2>${t('sendResetLink')}</h2>
<form id="send-link" class="stack card" method="get" action="${f.base}/link">
  <p class="muted">${t('resetLinkNote')}</p>
  <button type="submit">${t('sendResetLink')}</button>
</form>
<h2>${t('setPasswordTitle')}</h2>
<form id="set-password" class="stack card" method="post" action="${f.base}/password">
  <p class="muted">${t('setPasswordNote', { name: p.display_name })}</p>
  <label>${t('newPassword')}<input name="new_password" type="password" required minlength="8" autocomplete="new-password"><span class="hint">${t('passwordHint')}</span></label>
  <button type="submit">${t('setPasswordTitle')}</button>
</form>`;
  return f.frame(p.display_name, body);
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
