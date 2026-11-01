// The page a reset link opens (AT-2): the space's name and colour, plain
// instructions in the space's first language, and a form that asks for the
// username and the new password. It never says whose link it is.
import { html } from 'hono/html';
import type { Label, Lang } from '../labels.ts';
import { USERNAME_MAX } from '../names.ts';
import { errorBox, layout, sentence, type Html } from './layout.ts';
import { spaceHeader } from './space.ts';

export interface ResetSpace {
  name: string;
  primaryColor: string;
}

function frame(t: Label, lang: Lang, space: ResetSpace | null, title: string, body: Html): Html {
  const header = space ? spaceHeader({ id: '', name: space.name, primaryColor: space.primaryColor, hasLogo: false }) : undefined;
  return layout({ t, lang, title, body, header });
}

export function resetPage(t: Label, lang: Lang, space: ResetSpace, v: { action: string; error?: string; username?: string }): Html {
  const body = html`<h1>${t('resetTitle')}</h1>
<p id="reset-intro">${sentence(t, 'resetIntro', { space: space.name })}</p>
${errorBox(v.error)}
<form id="reset" class="stack card" method="post" action="${v.action}">
  <label>${t('username')}<input name="username" required maxlength="${USERNAME_MAX}" autocomplete="username" autocapitalize="none" dir="ltr" value="${v.username ?? ''}"></label>
  <label>${t('newPassword')}<input name="new_password" type="password" required minlength="8" autocomplete="new-password"><span class="hint">${t('passwordHint')}</span></label>
  <button type="submit">${t('setNewPassword')}</button>
</form>`;
  return frame(t, lang, space, t('resetTitle'), body);
}

export function resetDonePage(t: Label, lang: Lang, space: ResetSpace): Html {
  const body = html`<h1>${t('resetTitle')}</h1>
<p id="done" class="done" role="status">${t('resetDone')}</p>
<p><a id="to-signin" href="/signin">${t('signIn')}</a></p>`;
  return frame(t, lang, space, t('resetTitle'), body);
}

export function resetDeadPage(t: Label, lang: Lang, space: ResetSpace | null): Html {
  const body = html`<h1>${t('resetTitle')}</h1>
<p id="link-dead" class="message">${t('resetDead')}</p>
<p><a href="/signin">${t('signIn')}</a></p>`;
  return frame(t, lang, space, t('resetTitle'), body);
}
