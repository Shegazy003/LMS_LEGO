// My account: change your own password. Everyone can (docs/02-LEGO-MODEL.md,
// rule 5). Shown in the language of the person's space when they have one.
import { html } from 'hono/html';
import type { Label, Lang } from '../labels.ts';
import { errorBox, layout, type Html } from './layout.ts';

export function accountPage(
  t: Label,
  lang: Lang,
  v: { displayName: string; username: string; error?: string; done?: boolean },
): Html {
  const body = html`<h1>${t('myAccount')}</h1>
<p class="muted">${t('signedInAs', { name: v.displayName, username: v.username })}</p>
${v.done ? html`<p id="done" class="done" role="status">${t('passwordChanged')}</p>` : ''}
${errorBox(v.error)}
<h2>${t('changePassword')}</h2>
<form id="change-password" class="stack card" method="post" action="/account/password">
  <label>${t('currentPassword')}<input name="current_password" type="password" required autocomplete="current-password"></label>
  <label>${t('newPassword')}<input name="new_password" type="password" required minlength="8" autocomplete="new-password"><span class="hint">${t('passwordHint')}</span></label>
  <button type="submit">${t('saveNewPassword')}</button>
</form>
<p><a id="back-home" href="/">${t('home')}</a></p>`;
  return layout({ t, lang, title: t('myAccount'), body, signedIn: true });
}
