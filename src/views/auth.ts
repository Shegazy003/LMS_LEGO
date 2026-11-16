// Owner first setup, the one-time recovery code, sign-in and recovery.
import { html } from 'hono/html';
import type { Label, Lang } from '../labels.ts';
import { USERNAME_MAX } from '../names.ts';
import { errorBox, layout, type Html } from './layout.ts';

export function setupPage(t: Label, lang: Lang, v: { error?: string; username?: string; mobile?: string }): Html {
  const body = html`<h1>${t('setupTitle')}</h1>
<p>${t('setupIntro')}</p>
${errorBox(v.error)}
<form id="setup" class="stack card" method="post" action="/setup">
  <label>${t('username')}<input name="username" required maxlength="${USERNAME_MAX}" autocomplete="username" dir="auto" value="${v.username ?? ''}"><span class="hint">${t('usernameHint')}</span></label>
  <label>${t('password')}<input name="password" type="password" required minlength="8" autocomplete="new-password"><span class="hint">${t('passwordHint')}</span></label>
  <label>${t('mobile')}<input name="mobile" type="tel" required dir="ltr" value="${v.mobile ?? ''}"><span class="hint">${t('mobileInternationalHint')}</span></label>
  <button type="submit">${t('createAccount')}</button>
</form>`;
  return layout({ t, lang, title: t('setupTitle'), body, switchFrom: '/setup' });
}

export function recoveryCodePage(t: Label, lang: Lang, code: string, afterReset = false): Html {
  const body = html`<h1>${t('recoveryTitle')}</h1>
${afterReset ? html`<p>${t('recoveryAfterReset')}</p>` : ''}
<p id="recovery-code" class="code">${code}</p>
<p>${t('recoveryOnce')}</p>
<p><a id="continue" href="/owner">${t('continue')}</a></p>`;
  return layout({ t, lang, title: t('recoveryTitle'), body, signedIn: true });
}

/** Sign-in (LMS wave 1, L2, section 8.4): the same page for everyone, whoever
 * signs in. Under the form, the way for everyone who forgot a password (the
 * person who gave them their account can send a reset link), and apart from
 * it, smaller, the product owner's way to the recovery code. */
export function signInPage(t: Label, lang: Lang, v: { error?: string; username?: string }): Html {
  const body = html`<h1>${t('signIn')}</h1>
${errorBox(v.error)}
<form id="signin" class="stack card" method="post" action="/signin">
  <label>${t('username')}<input name="username" required maxlength="${USERNAME_MAX}" autocomplete="username" dir="auto" value="${v.username ?? ''}"></label>
  <label>${t('password')}<input name="password" type="password" required autocomplete="current-password"></label>
  <button type="submit">${t('signIn')}</button>
</form>
<p id="forgot" class="forgot">${t('forgotPassword')}</p>
<p id="owner-recovery" class="owner-recovery"><a href="/recover">${t('ownerRecovery')}</a></p>`;
  return layout({ t, lang, title: t('signIn'), body, switchFrom: '/signin' });
}

/** The owner's recovery (unchanged form); from L2 it first says whom it is for, and leads back to sign-in. */
export function recoverPage(t: Label, lang: Lang, v: { error?: string; username?: string }): Html {
  const body = html`<h1>${t('recoverTitle')}</h1>
<p id="recover-who" class="recover-who">${t('recoverOnlyOwner')} <a id="back-to-signin" href="/signin">${t('backToSignIn')}</a></p>
${errorBox(v.error)}
<form id="recover" class="stack card" method="post" action="/recover">
  <label>${t('username')}<input name="username" required maxlength="${USERNAME_MAX}" autocomplete="username" dir="auto" value="${v.username ?? ''}"></label>
  <label>${t('recoveryCode')}<input name="code" required dir="ltr" autocomplete="one-time-code"></label>
  <label>${t('newPassword')}<input name="password" type="password" required minlength="8" autocomplete="new-password"><span class="hint">${t('passwordHint')}</span></label>
  <button type="submit">${t('setNewPassword')}</button>
</form>`;
  return layout({ t, lang, title: t('recoverTitle'), body, switchFrom: '/recover' });
}
