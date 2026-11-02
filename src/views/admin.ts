// The admin's pages (AT-2): people (appoint a publisher or a learner), groups
// and subjects. Every address is under /s/<space>/admin, behind the admin
// gate, with neutral address words (people, sets, topics) so that no address
// names a concept; every word on the page comes from the label function and
// the space's kit.
import { html, raw } from 'hono/html';
import type { Label, Lang } from '../labels.ts';
import { SEARCH_MAX, type Choice, type PersonRow, type SetRow, type TopicRow } from '../admin.ts';
import { endedDate } from '../access.ts';
import { DISPLAY_NAME_MAX, RENAME_MAX, USERNAME_MAX } from '../names.ts';
import { lastDigits } from '../reset.ts';
import { errorBox, sentence, type Html } from './layout.ts';
import { spacePage } from './learn.ts';
import type { SpaceView } from './space.ts';

const NAME_MAX = 100;
const TITLE_MAX = 200;
const base = (space: SpaceView) => `/s/${space.id}/admin`;

export interface AppointForm {
  display_name?: string;
  username?: string;
  role?: string;
  mobile?: string;
  valid_until?: string;
}

/** A person on the people list: their row, and whether their access has ended. */
export type ListedPerson = PersonRow & { ended: boolean };

function personRow(t: Label, space: SpaceView, p: ListedPerson): Html {
  const when = p.ended
    ? sentence(t, 'endedOn', { date: endedDate(p.valid_until, p.ended_on) })
    : sentence(t, 'validUntil', { date: p.valid_until });
  return html`<li data-user="${p.id}"><a class="person" href="${base(space)}/people/${p.id}"><bdi>${p.display_name}</bdi></a>
  <div class="muted">${t(p.role === 'publisher' ? 'publisher' : 'learner')} · ${when} · ${sentence(t, 'mobileEnding', { digits: lastDigits(p.mobile) })}</div></li>`;
}

/** The people of the space (publishers and learners), found by the search box
 * when something was typed: those with access first, then the ended ones in a
 * collapsed "Ended" part; and the form to appoint one. */
export function peoplePage(
  t: Label,
  lang: Lang,
  space: SpaceView,
  v: { people: ListedPerson[]; search: string; today: string; ownEnd: string; values: AppointForm; error?: string },
): Html {
  const current = v.people.filter((p) => !p.ended).map((p) => personRow(t, space, p));
  const ended = v.people.filter((p) => p.ended).map((p) => personRow(t, space, p));
  const role = v.values.role ?? 'publisher';
  const none = v.search ? html`<p id="search-none" class="card muted">${sentence(t, 'searchNone', { q: v.search })}</p>` : html`<p id="people" class="card muted">${t('noneAppointed')}</p>`;
  const body = html`<h1>${t('people')}</h1>
<form id="search" class="inline-add card" method="get" action="${base(space)}/people" role="search">
  <label>${t('searchLabel')}<input name="q" type="search" maxlength="${SEARCH_MAX}" value="${v.search}" dir="auto" autocomplete="off"></label>
  <button type="submit">${t('searchButton')}</button>
  ${v.search ? html`<a id="show-everyone" href="${base(space)}/people">${t('showEveryone')}</a>` : ''}
</form>
${current.length ? html`<ul id="people" class="list card">${current}</ul>` : ended.length ? '' : none}
${ended.length
  ? html`<details id="ended" class="card"${v.search ? raw(' open') : ''}><summary>${t('endedTitle', { count: String(ended.length) })}</summary><ul class="list">${ended}</ul></details>`
  : ''}
<h2>${t('appointPerson')}</h2>
${errorBox(v.error)}
<form id="appoint" class="stack card" method="post" action="${base(space)}/people">
  <label>${t('displayName')}<input name="display_name" required maxlength="${DISPLAY_NAME_MAX}" value="${v.values.display_name ?? ''}"></label>
  <label>${t('username')}<input name="username" required maxlength="${USERNAME_MAX}" autocomplete="off" dir="ltr" value="${v.values.username ?? ''}"><span class="hint">${t('usernameHint')}</span></label>
  <label>${t('firstPassword')}<input name="password" type="password" required minlength="8" autocomplete="new-password"><span class="hint">${t('passwordHint')}</span></label>
  <label>${t('roleField')}<select name="role">
    <option value="publisher" ${role === 'publisher' ? 'selected' : ''}>${t('publisher')}</option>
    <option value="learner" ${role === 'learner' ? 'selected' : ''}>${t('learner')}</option>
  </select></label>
  <label>${t('mobile')}<input name="mobile" type="tel" required dir="ltr" value="${v.values.mobile ?? ''}"><span class="hint">${t('mobileParentHint')}</span></label>
  <label>${t('endDate')}<input name="valid_until" type="date" required min="${v.today}" max="${v.ownEnd}" value="${v.values.valid_until ?? ''}"><span class="hint">${sentence(t, 'endDateOwnHint', { date: v.ownEnd })}</span></label>
  <button type="submit">${t('appoint')}</button>
</form>`;
  return spacePage(t, lang, space, t('people'), body);
}

function memberChoices(name: string, choices: Choice[], chosen: readonly string[], t: Label): Html {
  if (!choices.length) return html`<p class="muted">${t('nothingHere')}</p>`;
  return html`${choices.map(
    (c) => html`<label class="check"><input type="checkbox" name="${name}" value="${c.id}" ${chosen.includes(c.id) ? 'checked' : ''}><bdi>${c.display_name}</bdi></label>`,
  )}`;
}

/** The groups of the space, with their members, and the form to form one. */
export function setsPage(t: Label, lang: Lang, space: SpaceView, v: { sets: SetRow[]; learners: Choice[]; error?: string; name?: string }): Html {
  const rows = v.sets.map(
    (s) => html`<li data-set="${s.id}"><a href="${base(space)}/sets/${s.id}"><bdi>${s.name}</bdi></a>
  <div class="muted">${s.members.length ? s.members.map((m, i) => html`${i ? '، ' : ''}<bdi>${m.display_name}</bdi>`) : t('nothingHere')}</div></li>`,
  );
  const body = html`<h1>${t('group')}</h1>
${rows.length ? html`<ul id="sets" class="list card">${rows}</ul>` : html`<p id="sets" class="card muted">${t('nothingHere')}</p>`}
<h2>${t('add')} ${t('group')}</h2>
${errorBox(v.error)}
<form id="new-set" class="stack card" method="post" action="${base(space)}/sets">
  <label>${t('spaceName')}<input name="name" required maxlength="${NAME_MAX}" value="${v.name ?? ''}"></label>
  <fieldset class="checks"><legend>${t('membersField')}</legend>${memberChoices('member', v.learners, [], t)}</fieldset>
  <button type="submit">${t('add')}</button>
</form>`;
  return spacePage(t, lang, space, t('group'), body);
}

/** What the page of a group or a subject says after a done form (AT-2 saved, AT-7 renamed). */
export type ItemNotice = 'saved' | 'renamed';

/** The rename form of a group or a subject (AT-7): one line of 1 to 100
 * characters; the page reads the current name, or what was typed when refused. */
function renameForm(t: Label, v: { id: string; heading: Html | string; action: string; field: 'name' | 'title'; value: string }): Html {
  return html`<h2 id="${v.id}-title">${v.heading}</h2>
<form id="${v.id}" class="stack card" method="post" action="${v.action}">
  <label>${t('newName')}<input name="${v.field}" required maxlength="${RENAME_MAX}" dir="auto" autocomplete="off" value="${v.value}"></label>
  <p class="muted">${t('renameNote')}</p>
  <button type="submit">${t('saveName')}</button>
</form>`;
}

/** One group: change who is in it, and rename it (AT-7). */
export function setPage(
  t: Label,
  lang: Lang,
  space: SpaceView,
  v: { set: { id: string; name: string }; learners: Choice[]; members: readonly string[]; notice?: ItemNotice; error?: string; typedName?: string },
): Html {
  const action = `${base(space)}/sets/${v.set.id}`;
  const body = html`<p><a id="back" href="${base(space)}/sets">${t('back')}</a></p>
<p class="muted">${t('group')}</p>
<h1 id="set-name" dir="auto">${v.set.name}</h1>
${v.notice ? html`<p id="done" class="done" role="status">${t(v.notice)}</p>` : ''}
${errorBox(v.error)}
<form id="set-members" class="stack card" method="post" action="${action}">
  <fieldset class="checks"><legend>${t('membersField')}</legend>${memberChoices('member', v.learners, v.members, t)}</fieldset>
  <button type="submit">${t('save')}</button>
</form>
${renameForm(t, { id: 'rename-set', heading: t('renameItem', { item: t('group') }), action: `${action}/name`, field: 'name', value: v.typedName ?? v.set.name })}`;
  return spacePage(t, lang, space, v.set.name, body);
}

function publisherSelect(t: Label, publishers: Choice[], chosen: string | null): Html {
  return html`<label>${t('responsibleField')}<select name="publisher">
    <option value="">${t('noOne')}</option>
    ${publishers.map((p) => html`<option value="${p.id}" ${p.id === chosen ? 'selected' : ''}>${p.display_name}</option>`)}
  </select></label>`;
}

/** The subjects of the space and the form to create one. */
export function topicsPage(t: Label, lang: Lang, space: SpaceView, v: { topics: TopicRow[]; publishers: Choice[]; error?: string; title?: string }): Html {
  const rows = v.topics.map(
    (s) => html`<li data-topic="${s.id}"><a href="${base(space)}/topics/${s.id}"><bdi>${s.title}</bdi></a>
  <div class="muted">${t('publisher')}: ${s.publisher_name ? html`<bdi>${s.publisher_name}</bdi>` : t('noOne')} · ${s.is_published ? t('published') : t('notPublished')}</div></li>`,
  );
  const body = html`<h1>${t('subject')}</h1>
${rows.length ? html`<ul id="topics" class="list card">${rows}</ul>` : html`<p id="topics" class="card muted">${t('nothingHere')}</p>`}
<h2>${t('add')} ${t('subject')}</h2>
${errorBox(v.error)}
<form id="new-topic" class="stack card" method="post" action="${base(space)}/topics">
  <label>${t('titleField')}<input name="title" required maxlength="${TITLE_MAX}" value="${v.title ?? ''}"></label>
  ${publisherSelect(t, v.publishers, null)}
  <button type="submit">${t('add')}</button>
</form>`;
  return spacePage(t, lang, space, t('subject'), body);
}

/** One subject: its responsible publisher and who may read it (groups, learners), and its name (AT-7). */
export function topicPage(
  t: Label,
  lang: Lang,
  space: SpaceView,
  v: {
    topic: TopicRow;
    publishers: Choice[];
    sets: { id: string; display_name: string }[];
    learners: Choice[];
    readers: { sets: string[]; learners: string[] };
    notice?: ItemNotice;
    error?: string;
    typedName?: string;
  },
): Html {
  const action = `${base(space)}/topics/${v.topic.id}`;
  const body = html`<p><a id="back" href="${base(space)}/topics">${t('back')}</a></p>
<p class="muted">${t('subject')}</p>
<h1 id="topic-title" dir="auto">${v.topic.title}</h1>
<p class="muted">${v.topic.is_published ? t('published') : t('notPublished')}</p>
${v.notice ? html`<p id="done" class="done" role="status">${t(v.notice)}</p>` : ''}
${errorBox(v.error)}
<form id="topic-access" class="stack card" method="post" action="${action}">
  ${publisherSelect(t, v.publishers, v.topic.publisher_user_id)}
  <h3>${t('assignedTo')}</h3>
  <fieldset class="checks"><legend>${t('group')}</legend>${memberChoices('set', v.sets, v.readers.sets, t)}</fieldset>
  <fieldset class="checks"><legend>${t('learner')}</legend>${memberChoices('learner', v.learners, v.readers.learners, t)}</fieldset>
  <button type="submit">${t('save')}</button>
</form>
${renameForm(t, { id: 'rename-topic', heading: t('renameItem', { item: t('subject') }), action: `${action}/name`, field: 'title', value: v.typedName ?? v.topic.title })}`;
  return spacePage(t, lang, space, v.topic.title, body);
}
