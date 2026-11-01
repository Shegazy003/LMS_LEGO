// The admin's pages (AT-2): people (appoint a publisher or a learner), groups
// and subjects. Every address is under /s/<space>/admin, behind the admin
// gate, with neutral address words (people, sets, topics) so that no address
// names a concept; every word on the page comes from the label function and
// the space's kit.
import { html } from 'hono/html';
import type { Label, Lang } from '../labels.ts';
import type { Choice, PersonRow, SetRow, TopicRow } from '../admin.ts';
import { DISPLAY_NAME_MAX, USERNAME_MAX } from '../names.ts';
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

/** The people of the space (publishers and learners) and the form to appoint one. */
export function peoplePage(
  t: Label,
  lang: Lang,
  space: SpaceView,
  v: { people: PersonRow[]; today: string; ownEnd: string; values: AppointForm; error?: string },
): Html {
  const rows = v.people.map(
    (p) => html`<li data-user="${p.id}"><a class="person" href="${base(space)}/people/${p.id}"><bdi>${p.display_name}</bdi></a>
  <div class="muted">${t(p.role === 'publisher' ? 'publisher' : 'learner')} · ${sentence(t, 'validUntil', { date: p.valid_until })} · ${sentence(t, 'mobileEnding', { digits: lastDigits(p.mobile) })}</div></li>`,
  );
  const role = v.values.role ?? 'publisher';
  const body = html`<h1>${t('people')}</h1>
${rows.length ? html`<ul id="people" class="list card">${rows}</ul>` : html`<p id="people" class="card muted">${t('noneAppointed')}</p>`}
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

/** One group: change who is in it. */
export function setPage(
  t: Label,
  lang: Lang,
  space: SpaceView,
  v: { set: { id: string; name: string }; learners: Choice[]; members: readonly string[]; saved?: boolean; error?: string },
): Html {
  const body = html`<p><a id="back" href="${base(space)}/sets">${t('back')}</a></p>
<p class="muted">${t('group')}</p>
<h1 id="set-name" dir="auto">${v.set.name}</h1>
${v.saved ? html`<p id="done" class="done" role="status">${t('saved')}</p>` : ''}
${errorBox(v.error)}
<form id="set-members" class="stack card" method="post" action="${base(space)}/sets/${v.set.id}">
  <fieldset class="checks"><legend>${t('membersField')}</legend>${memberChoices('member', v.learners, v.members, t)}</fieldset>
  <button type="submit">${t('save')}</button>
</form>`;
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

/** One subject: its responsible publisher and who may read it (groups, learners). */
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
    saved?: boolean;
    error?: string;
  },
): Html {
  const body = html`<p><a id="back" href="${base(space)}/topics">${t('back')}</a></p>
<p class="muted">${t('subject')}</p>
<h1 id="topic-title" dir="auto">${v.topic.title}</h1>
<p class="muted">${v.topic.is_published ? t('published') : t('notPublished')}</p>
${v.saved ? html`<p id="done" class="done" role="status">${t('saved')}</p>` : ''}
${errorBox(v.error)}
<form id="topic-access" class="stack card" method="post" action="${base(space)}/topics/${v.topic.id}">
  ${publisherSelect(t, v.publishers, v.topic.publisher_user_id)}
  <h3>${t('assignedTo')}</h3>
  <fieldset class="checks"><legend>${t('group')}</legend>${memberChoices('set', v.sets, v.readers.sets, t)}</fieldset>
  <fieldset class="checks"><legend>${t('learner')}</legend>${memberChoices('learner', v.learners, v.readers.learners, t)}</fieldset>
  <button type="submit">${t('save')}</button>
</form>`;
  return spacePage(t, lang, space, v.topic.title, body);
}
