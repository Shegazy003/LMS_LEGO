// The owner's pages: home (spaces, usage panel, recovery code), new space,
// one space (its kit and its admins).
import { html } from 'hono/html';
import type { KitJson, Label, Lang } from '../labels.ts';
import { formatBytes } from '../usage.ts';
import { errorBox, layout, sentence, type Html } from './layout.ts';

export interface UsageLine {
  kind: 'requests' | 'writes' | 'storage';
  value: number;
  limit: number;
}

export interface SpaceSummary {
  id: string;
  name: string;
  t: Label; // the owner's language, this space's kit
  kitName: string;
  adminCount: number;
}

function usageLine(t: Label, line: UsageLine): Html {
  const fmt = (n: number) => (line.kind === 'storage' ? formatBytes(n) : n.toLocaleString('en-US'));
  const share = line.limit > 0 ? line.value / line.limit : 0;
  const percent = `${(share * 100).toLocaleString('en-US', { maximumFractionDigits: share < 0.01 ? 2 : 1 })}%`;
  const title = { requests: t('usageRequests'), writes: t('usageWrites'), storage: t('usageStorage') }[line.kind];
  return html`<li data-usage="${line.kind}" data-value="${line.value}" data-limit="${line.limit}">
  <div>${title}</div>
  <div>${sentence(t, 'usageOf', { value: fmt(line.value), limit: fmt(line.limit), percent })}</div>
  <div class="meter"><span style="width:${Math.min(100, share * 100).toFixed(2)}%"></span></div>
</li>`;
}

export function ownerHome(t: Label, lang: Lang, v: { spaces: SpaceSummary[]; usage: UsageLine[] }): Html {
  const spaces = v.spaces.length
    ? html`<ul id="spaces" class="list">${v.spaces.map(
        (s) => html`<li><a href="/owner/spaces/${s.id}">${s.name}</a>
  <div class="muted">${t('kitIs', { kit: s.kitName })} · ${s.t('appointedCount', { count: String(s.adminCount) })}</div></li>`,
      )}</ul>`
    : html`<p class="muted">${t('noSpaces')}</p>`;
  const body = html`<h1>${t('ownerHomeTitle')}</h1>
<h2>${t('spacesTitle')}</h2>
<div class="card">${spaces}<p><a id="new-space" href="/owner/spaces/new">${t('newSpace')}</a></p></div>
<h2>${t('usageTitle')}</h2>
<div id="usage" class="card"><ul class="list">${v.usage.map((line) => usageLine(t, line))}</ul>
<p class="muted">${t('usageNote')}</p></div>
<h2>${t('recoverySection')}</h2>
<form id="regenerate-code" class="card" method="post" action="/owner/recovery-code">
  <p class="muted">${t('regenerateNote')}</p>
  <button type="submit">${t('regenerateCode')}</button>
</form>`;
  return layout({ t, lang, title: t('ownerHomeTitle'), body, signedIn: true });
}

export interface NewSpaceValues {
  name?: string;
  kit?: string;
  languages?: string;
  primary_color?: string;
  country_code?: string;
}

export function newSpacePage(
  t: Label,
  lang: Lang,
  kits: { id: string; name: string }[],
  v: NewSpaceValues & { error?: string },
): Html {
  const kit = v.kit ?? kits[0]?.id;
  const languages = v.languages ?? 'ar,en';
  const body = html`<h1>${t('newSpaceTitle')}</h1>
${errorBox(v.error)}
<form id="new-space" class="stack card" method="post" action="/owner/spaces" enctype="multipart/form-data">
  <label>${t('spaceName')}<input name="name" required maxlength="100" value="${v.name ?? ''}"></label>
  <label>${t('kitChoice')}<select name="kit">${kits.map(
    (k) => html`<option value="${k.id}" ${k.id === kit ? 'selected' : ''}>${k.name}</option>`,
  )}</select></label>
  <label>${t('languageOrder')}<select name="languages">
    <option value="ar,en" ${languages === 'ar,en' ? 'selected' : ''}>${t('langArEn')}</option>
    <option value="en,ar" ${languages === 'en,ar' ? 'selected' : ''}>${t('langEnAr')}</option>
  </select></label>
  <label>${t('logoField')}<input name="logo" type="file" accept="image/png,image/jpeg,image/svg+xml"></label>
  <label>${t('primaryColor')}<input name="primary_color" type="color" value="${v.primary_color ?? '#1f6feb'}"></label>
  <label>${t('countryCode')}<input name="country_code" required dir="ltr" value="${v.country_code ?? '+20'}"></label>
  <button type="submit">${t('createSpace')}</button>
</form>
<p><a href="/owner">${t('backToSpaces')}</a></p>`;
  return layout({ t, lang, title: t('newSpaceTitle'), body, signedIn: true });
}

export interface AdminRow {
  username: string;
  display_name: string;
  valid_until: string;
  mobile: string;
}

export interface AppointValues {
  display_name?: string;
  username?: string;
  mobile?: string;
  valid_until?: string;
}

export function ownerSpacePage(
  t: Label, // the owner's language, this space's kit
  lang: Lang,
  v: {
    space: { id: string; name: string; countryCode: string; kit: KitJson };
    admins: AdminRow[];
    error?: string;
    values: AppointValues;
    today: string;
  },
): Html {
  const { space } = v;
  const langNames = space.kit.languages.map((l) => (l === 'ar' ? t('langNameAr') : t('langNameEn'))).join(' · ');
  const admins = v.admins.length
    ? html`<ul id="admins" class="list">${v.admins.map(
        (a) => html`<li><strong>${a.display_name}</strong> · <bdi>${a.username}</bdi>
  <div class="muted">${sentence(t, 'validUntil', { date: a.valid_until })} · ${sentence(t, 'mobileEnding', { digits: a.mobile.slice(-4) })}</div></li>`,
      )}</ul>`
    : html`<p id="admins" class="muted">${t('noneAppointed')}</p>`;
  const body = html`<h1 style="display:flex;align-items:center;gap:12px">
  ${space.kit.theme.logoKey ? html`<img src="/owner/spaces/${space.id}/logo" alt="" width="48" height="48" style="object-fit:contain">` : ''}
  <span>${space.name}</span></h1>
<div class="card">
  <div>${t('kitIs', { kit: space.kit.name[lang] })}</div>
  <div>${t('languagesAre', { languages: langNames })}</div>
  <div>${t('primaryColor')}: <span dir="ltr" style="display:inline-block;width:1em;height:1em;vertical-align:middle;border-radius:3px;background:${space.kit.theme.primaryColor}"></span> <bdi>${space.kit.theme.primaryColor}</bdi></div>
  <div>${t('countryCode')}: <bdi>${space.countryCode}</bdi></div>
</div>
<h2>${t('admin')}</h2>
<div class="card">${admins}</div>
<h2>${t('appointAdmin')}</h2>
${errorBox(v.error)}
<form id="appoint-admin" class="stack card" method="post" action="/owner/spaces/${space.id}/admins">
  <label>${t('displayName')}<input name="display_name" required maxlength="100" value="${v.values.display_name ?? ''}"></label>
  <label>${t('username')}<input name="username" required autocomplete="off" value="${v.values.username ?? ''}"><span class="hint">${t('usernameHint')}</span></label>
  <label>${t('firstPassword')}<input name="password" type="password" required minlength="8" autocomplete="new-password"><span class="hint">${t('passwordHint')}</span></label>
  <label>${t('mobile')}<input name="mobile" type="tel" required dir="ltr" value="${v.values.mobile ?? ''}"><span class="hint">${t('mobileLocalHint')}</span></label>
  <label>${t('endDate')}<input name="valid_until" type="date" required min="${v.today}" value="${v.values.valid_until ?? ''}"></label>
  <button type="submit">${t('appoint')}</button>
</form>
<p><a href="/owner">${t('backToSpaces')}</a></p>`;
  return layout({ t, lang, title: space.name, body, signedIn: true });
}
