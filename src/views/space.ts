// Pages inside a space: shown in the space’s first language, with its kit’s
// labels and its theme.
import { html } from 'hono/html';
import { dirFor, type Label, type Lang } from '../labels.ts';
import { adminActivityLink } from './activity.ts';
import { layout, sentence, type Html } from './layout.ts';
import { previewPath, viewAsLink } from './preview.ts';

export interface SpaceView {
  id: string;
  name: string;
  primaryColor: string;
  hasLogo: boolean;
  /** Whether the person holds the guardian role here today (release 2): the nav then leads to their guardian home too. */
  guardian?: boolean;
  /** Whether the person holds the learner role here today (wave 1): the nav then leads to My results too. */
  learner?: boolean;
  /** LMS wave 3a: this learner page is drawn as a preview (contract sections 7 and 8). */
  preview?: PreviewFrame;
}

/** What a learner page drawn as a preview carries (wave 3a, section 7.2):
 * where its learner links lead, the `from` they keep, and the banner and
 * bottom line around the page. */
export interface PreviewFrame {
  /** The preview's own base address: /s/<space>/preview, or /owner/spaces/<space>/preview. */
  base: string;
  /** The checked `from` value every preview link carries unchanged (none for the owner). */
  from: string | null;
  banner: Html;
  end: Html;
}

/** The reason sentence's id: every inert control is described by it (UX-19). */
export const INERT = html` aria-disabled="true" aria-describedby="preview-reason"`;

/** The address of a learner page of this space (`rest` after /s/<space>, with
 * any query and #anchor). In a preview, the matching preview address carrying
 * the same `from` (section 8.2); otherwise the learner's own address. */
export function learnerUrl(space: SpaceView, rest = ''): string {
  const p = space.preview;
  if (!p) return `/s/${space.id}${rest}`;
  const hash = rest.indexOf('#');
  const path = hash < 0 ? rest : rest.slice(0, hash);
  const anchor = hash < 0 ? '' : rest.slice(hash);
  const from = p.from ? `${path.includes('?') ? '&' : '?'}from=${encodeURIComponent(p.from)}` : '';
  return `${p.base}${path}${from}${anchor}`;
}

/** The page the top navigation marks as current (wave 1, UX-3). */
export type NavCurrent = 'home' | 'results';

// The space’s band (logo and name) is not a landmark of its own (role none),
// so the top navigation under it is the page’s first landmark (wave 1, UX-3).
export function spaceHeader(space: SpaceView): Html {
  return html`<header class="space-header" role="none" style="background:${space.primaryColor}">
  ${space.hasLogo ? html`<img id="space-logo" src="/s/${space.id}/logo" alt="">` : ''}
  <h1 id="space-name">${space.name}</h1>
</header>`;
}

/** The places every member can always go: this space’s home and My account;
 * for a guardian (release 2) their guardian home, so a person who is also a
 * publisher or a learner here reaches each view under its own role; and for a
 * learner (wave 1, section 4.4) My results, here and nowhere else on the page.
 * The current page is marked with aria-current and by more than colour. */
export function spaceNav(t: Label, space: SpaceView, current?: NavCurrent): Html {
  const mark = (on: boolean) => (on ? html` aria-current="page"` : '');
  const guardian = space.guardian ? html`<a id="nav-guardian" href="/s/${space.id}/linked">${t('guardianHome')}</a>` : '';
  const results = space.learner ? html`<a id="nav-results" href="${learnerUrl(space, '/results')}"${mark(current === 'results')}>${t('myResults')}</a>` : '';
  // In a preview, My account keeps its text and place and leads nowhere (section 6.3).
  const account = space.preview
    ? html`<a id="nav-account" tabindex="0"${INERT}>${t('myAccount')}</a>`
    : html`<a id="nav-account" href="/account">${t('myAccount')}</a>`;
  return html`<nav id="top-nav" class="nav" aria-label="${t('mainNav')}"><a id="nav-home" href="${learnerUrl(space)}"${mark(current === 'home')}>${t('home')}</a>${guardian}${results}${account}</nav>`;
}

// Where each tile of the admin’s home leads (neutral address words, AT-2).
const ADMIN_TILES = { publisher: 'people', learner: 'people', group: 'sets', subject: 'topics' } as const;

/** The admin’s home: the space with its name, logo, colour and kit labels; each
 * label is the way into its admin page. */
export function adminHome(t: Label, lang: Lang, space: SpaceView, displayName: string): Html {
  const concepts = (Object.keys(ADMIN_TILES) as (keyof typeof ADMIN_TILES)[]).map(
    (c) => html`<li data-concept="${c}"><a href="/s/${space.id}/admin/${ADMIN_TILES[c]}">${t(c)}</a></li>`,
  );
  const body = html`<p>${t('welcome', { name: displayName })}</p>
<ul id="concepts" class="tiles">${concepts}</ul>
<p><a id="admin-results" class="button plain" href="/s/${space.id}/admin/results">${t('resultsAll')}</a> ${viewAsLink(t, 'view-as', previewPath(space.id, '', 'home'))}</p>
${adminActivityLink(t, space)}`;
  return layout({ t, lang, title: space.name, body, signedIn: true, header: html`${spaceHeader(space)}${spaceNav(t, space, 'home')}` });
}

/** In place of the space after the end date (or before the start date): the
 * plain message, in the space’s first language, then in its second. */
export function accessEndedPage(
  first: { t: Label; lang: Lang },
  second: { t: Label; lang: Lang } | null,
  v: { spaceName: string; date: string; contactKey: 'ownerWord' | 'admin'; notStarted?: boolean },
  signedIn = true,
): Html {
  const key = v.notStarted ? 'accessNotStarted' : 'accessEnded';
  const id = v.notStarted ? 'access-not-started' : 'access-ended';
  const vars = (t: Label) => ({ space: v.spaceName, date: v.date, ...(v.notStarted ? {} : { contact: t(v.contactKey) }) });
  const body = html`<div class="card">
  <p id="${id}" class="message">${sentence(first.t, key, vars(first.t))}</p>
  ${second ? html`<p id="${id}-alt" lang="${second.lang}" dir="${dirFor(second.lang)}">${sentence(second.t, key, vars(second.t))}</p>` : ''}
</div>`;
  return layout({ t: first.t, lang: first.lang, title: first.t(key, vars(first.t)), body, signedIn });
}

/** One of a person’s spaces; endedOn is the day their access there ended, or null while it lasts. */
export interface MembershipItem {
  id: string;
  name: string;
  endedOn: string | null;
}

/** For a person with more than one space. A space whose access has ended is
 * marked so, with the day (release 1.1, AT-6 follow-up); its link still opens
 * the "access ended" message. */
export function membershipsPage(t: Label, lang: Lang, spaces: MembershipItem[]): Html {
  const item = (s: MembershipItem) => html`<li data-space="${s.id}"${s.endedOn ? html` data-ended="1"` : ''}><a href="/s/${s.id}"><bdi>${s.name}</bdi></a>${
    s.endedOn ? html`<div class="muted">${sentence(t, 'endedOn', { date: s.endedOn })}</div>` : ''}</li>`;
  const body = html`<h1>${t('yourSpaces')}</h1>
${spaces.length
  ? html`<ul id="my-spaces" class="list card">${spaces.map(item)}</ul>`
  : html`<p class="message">${t('noMemberships')}</p>`}`;
  return layout({ t, lang, title: t('yourSpaces'), body, signedIn: true });
}
