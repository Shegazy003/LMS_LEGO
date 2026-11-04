// Pages inside a space: shown in the space's first language, with its kit's
// labels and its theme.
import { html } from 'hono/html';
import { dirFor, type Label, type Lang } from '../labels.ts';
import { adminActivityLink } from './activity.ts';
import { layout, sentence, type Html } from './layout.ts';

export interface SpaceView {
  id: string;
  name: string;
  primaryColor: string;
  hasLogo: boolean;
  /** Whether the person holds the guardian role here today (release 2): the nav then leads to their guardian home too. */
  guardian?: boolean;
}

export function spaceHeader(space: SpaceView): Html {
  return html`<header class="space-header" style="background:${space.primaryColor}">
  ${space.hasLogo ? html`<img id="space-logo" src="/s/${space.id}/logo" alt="">` : ''}
  <h1 id="space-name">${space.name}</h1>
</header>`;
}

/** The two places every member can always go: this space's home and My
 * account; and for a guardian (release 2) their guardian home, so a person who
 * is also a publisher or a learner here reaches each view under its own role. */
export function spaceNav(t: Label, space: SpaceView): Html {
  const guardian = space.guardian ? html`<a id="nav-guardian" href="/s/${space.id}/linked">${t('guardianHome')}</a>` : '';
  return html`<nav class="nav"><a id="nav-home" href="/s/${space.id}">${t('home')}</a>${guardian}<a id="nav-account" href="/account">${t('myAccount')}</a></nav>`;
}

// Where each tile of the admin's home leads (neutral address words, AT-2).
const ADMIN_TILES = { publisher: 'people', learner: 'people', group: 'sets', subject: 'topics' } as const;

/** The admin's home: the space with its name, logo, colour and kit labels; each
 * label is the way into its admin page. */
export function adminHome(t: Label, lang: Lang, space: SpaceView, displayName: string): Html {
  const concepts = (Object.keys(ADMIN_TILES) as (keyof typeof ADMIN_TILES)[]).map(
    (c) => html`<li data-concept="${c}"><a href="/s/${space.id}/admin/${ADMIN_TILES[c]}">${t(c)}</a></li>`,
  );
  const body = html`${spaceNav(t, space)}<p>${t('welcome', { name: displayName })}</p>
<ul id="concepts" class="tiles">${concepts}</ul>
<p><a id="admin-results" class="button plain" href="/s/${space.id}/admin/results">${t('resultsAll')}</a></p>
${adminActivityLink(t, space)}`;
  return layout({ t, lang, title: space.name, body, signedIn: true, header: spaceHeader(space) });
}

/** In place of the space after the end date (or before the start date): the
 * plain message, in the space's first language, then in its second. */
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

/** One of a person's spaces; endedOn is the day their access there ended, or null while it lasts. */
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
