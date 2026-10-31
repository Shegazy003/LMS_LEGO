// Pages inside a space: shown in the space's first language, with its kit's
// labels and its theme.
import { html } from 'hono/html';
import { dirFor, type Label, type Lang } from '../labels.ts';
import { layout, sentence, type Html } from './layout.ts';

export interface SpaceView {
  id: string;
  name: string;
  primaryColor: string;
  hasLogo: boolean;
}

function spaceHeader(space: SpaceView): Html {
  return html`<header class="space-header" style="background:${space.primaryColor}">
  ${space.hasLogo ? html`<img id="space-logo" src="/s/${space.id}/logo" alt="">` : ''}
  <h1 id="space-name">${space.name}</h1>
</header>`;
}

/** The admin's home: the space with its name, logo, colour and kit labels. */
export function adminHome(t: Label, lang: Lang, space: SpaceView, displayName: string): Html {
  const concepts = (['publisher', 'learner', 'group', 'subject'] as const).map(
    (c) => html`<li data-concept="${c}">${t(c)}</li>`,
  );
  const body = html`<p>${t('welcome', { name: displayName })}</p>
<ul id="concepts" class="tiles">${concepts}</ul>`;
  return layout({ t, lang, title: space.name, body, signedIn: true, header: spaceHeader(space) });
}

/** In place of the space after the end date: the plain message, in the
 * space's first language, then in its second. */
export function accessEndedPage(
  first: { t: Label; lang: Lang },
  second: { t: Label; lang: Lang } | null,
  v: { spaceName: string; date: string; contactKey: 'ownerWord' | 'admin' },
): Html {
  const vars = (t: Label) => ({ space: v.spaceName, date: v.date, contact: t(v.contactKey) });
  const body = html`<div class="card">
  <p id="access-ended" class="message">${sentence(first.t, 'accessEnded', vars(first.t))}</p>
  ${second ? html`<p id="access-ended-alt" lang="${second.lang}" dir="${dirFor(second.lang)}">${sentence(second.t, 'accessEnded', vars(second.t))}</p>` : ''}
</div>`;
  return layout({ t: first.t, lang: first.lang, title: first.t('accessEnded', vars(first.t)), body, signedIn: true });
}

/** For a person with more than one space. */
export function membershipsPage(t: Label, lang: Lang, spaces: { id: string; name: string }[]): Html {
  const body = html`<h1>${t('yourSpaces')}</h1>
${spaces.length
  ? html`<ul class="list card">${spaces.map((s) => html`<li><a href="/s/${s.id}">${s.name}</a></li>`)}</ul>`
  : html`<p class="message">${t('noMemberships')}</p>`}`;
  return layout({ t, lang, title: t('yourSpaces'), body, signedIn: true });
}
