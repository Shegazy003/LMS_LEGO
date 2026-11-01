// My account: change your own password (docs/02-LEGO-MODEL.md, rule 5), and
// the way to the language of your own pages (AT-5), which has a page of its
// own so that My account keeps a single form besides signing out. Shown in
// the person's chosen language, else the language of their space, else the
// browser's.
import { html } from 'hono/html';
import { makeLabel, type Label, type Lang } from '../labels.ts';
import { errorBox, layout, sentence, type Html } from './layout.ts';

/** Each language named in its own words, so anyone can find theirs. */
const ownName = (l: Lang) => makeLabel(l)(l === 'ar' ? 'langNameAr' : 'langNameEn');

export function accountPage(
  t: Label,
  lang: Lang,
  v: { displayName: string; username: string; error?: string; done?: boolean; languageDone?: boolean },
): Html {
  const body = html`<h1>${t('myAccount')}</h1>
<p class="muted">${t('signedInAs', { name: v.displayName, username: v.username })}</p>
${v.done ? html`<p id="done" class="done" role="status">${t('passwordChanged')}</p>` : ''}
${v.languageDone ? html`<p id="language-done" class="done" role="status">${t('languageSaved')}</p>` : ''}
${errorBox(v.error)}
<h2>${t('languageTitle')}</h2>
<div class="card">
  <p>${sentence(t, 'languageCurrent', { language: ownName(lang) })}</p>
  <p><a id="change-language" href="/account/language">${t('changeLanguage')}</a></p>
</div>
<h2>${t('changePassword')}</h2>
<form id="change-password" class="stack card" method="post" action="/account/password">
  <label>${t('currentPassword')}<input name="current_password" type="password" required autocomplete="current-password"></label>
  <label>${t('newPassword')}<input name="new_password" type="password" required minlength="8" autocomplete="new-password"><span class="hint">${t('passwordHint')}</span></label>
  <button type="submit">${t('saveNewPassword')}</button>
</form>
<p><a id="back-home" href="/">${t('home')}</a></p>`;
  return layout({ t, lang, title: t('myAccount'), body, signedIn: true });
}

/** The language of your own pages: a choice among the languages of your space. */
export function languagePage(t: Label, lang: Lang, v: { languages: readonly Lang[]; error?: string }): Html {
  const body = html`<h1>${t('languageTitle')}</h1>
${errorBox(v.error)}
<form id="language" class="stack card" method="post" action="/account/language">
  <label>${t('languageTitle')}<select name="lang">${v.languages.map(
    (l) => html`<option value="${l}" lang="${l}" ${l === lang ? 'selected' : ''}>${ownName(l)}</option>`,
  )}</select><span class="hint">${t('languageNote')}</span></label>
  <button type="submit">${t('saveLanguage')}</button>
</form>
<p><a id="back-account" href="/account">${t('myAccount')}</a></p>`;
  return layout({ t, lang, title: t('languageTitle'), body, signedIn: true });
}
