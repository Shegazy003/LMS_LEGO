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
import { previewPath, viewAsLink } from './preview.ts';
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

/** What the setting card says after a press (LMS wave 4, section 4.2): the new value, only when it matches the stored one; a failed save always. */
export type OrderStatus = 'on' | 'off' | 'failed' | null;

const ORDER_CARD_CSS = `#order-state{display:flex;flex-direction:column;gap:8px;margin:12px 0;border-radius:8px}
#order-state:focus{outline:3px solid #1b1f24;outline-offset:4px}
#order-state>*{margin:0}
#order-state .order-value{font-weight:700}
#order-state .order-explain{color:#57606a;font-size:.9rem;overflow-wrap:anywhere}
#order-state form{display:flex}
#order-state button.order-switch{min-height:44px;min-width:44px;background:#fff;color:#1a5fd0;border:2px solid #1a5fd0}`;

/** The setting card (LMS wave 4, section 4.2, UX-44) of the publisher's editor
 * (inside the card of Publish and Preview) and of the admin's subject page (a
 * card of its own): the value as text, the explanation and one button in the
 * secondary style, a plain form with one field (a set, not a switch). The
 * block takes focus when the page opens at #order-state after a press. It
 * names no learner, count or total. */
export function orderCard(t: Label, lang: Lang, v: { action: string; on: boolean; status: OrderStatus; own: boolean }): Html {
  const kit = { chapter: t('chapter').toLocaleLowerCase(lang), lesson: t('lesson').toLocaleLowerCase(lang), learner: t('learner').toLocaleLowerCase(lang) };
  const said = v.status === 'failed' ? 'markFailed' : v.status === 'on' ? 'orderNowOn' : 'orderNowOff';
  const status = v.status ? html`<p id="order-status" class="${v.status === 'failed' ? 'error' : 'done'}" role="status">${t(said)}</p>` : '';
  return html`<section id="order-state" class="order-card${v.own ? ' card' : ''}" tabindex="-1" data-order="${v.on ? 1 : 0}"><style>${raw(ORDER_CARD_CSS)}</style>
  ${status}<p id="order-value" class="order-value">${t(v.on ? 'orderStateOn' : 'orderStateOff')}</p>
  <p class="order-explain">${t('orderExplain', kit)}</p>
  <form id="order-form" method="post" action="${v.action}"><input type="hidden" name="state" value="${v.on ? 'off' : 'on'}"><button type="submit" class="order-switch">${t(v.on ? 'orderSwitchOff' : 'orderSwitchOn')}</button></form>
</section>`;
}

/** A person on the people list: their row, whether their access has ended, and (wave 3b) whether they have no password yet. */
export type ListedPerson = PersonRow & { ended: boolean; no_password?: boolean };

// LMS wave 3b (ux-plan UX-39): "No password yet" is a text tag with a border, never colour alone.
const NO_PASSWORD_TAG = 'display:inline-block;padding:0 8px;border:1px solid #57606a;border-radius:999px;font-size:.875rem;font-weight:600;color:#1b1f24;background:#fff';

/** A membership's role in the space's kit words. */
const roleWord = (t: Label, role: string) => t(role === 'publisher' ? 'publisher' : role === 'guardian' ? 'guardian' : 'learner');

function personRow(t: Label, space: SpaceView, p: ListedPerson): Html {
  const when = p.ended
    ? sentence(t, 'endedOn', { date: endedDate(p.valid_until, p.ended_on) })
    : sentence(t, 'validUntil', { date: p.valid_until });
  const tag = p.no_password ? html` <span class="tag" data-tag="no-password" style="${NO_PASSWORD_TAG}">${t('noPasswordTag')}</span>` : '';
  return html`<li data-user="${p.id}"><a class="person" href="${base(space)}/people/${p.id}"><bdi>${p.display_name}</bdi></a>${tag}
  <div class="muted">${roleWord(t, p.role)} · ${when} · ${sentence(t, 'mobileEnding', { digits: lastDigits(p.mobile) })}</div></li>`;
}

const ROLES = ['publisher', 'learner', 'guardian'] as const;

/** The people of the space (publishers and learners), found by the search box
 * when something was typed: those with access first, then the ended ones in a
 * collapsed "Ended" part; and the form to appoint one.
 * LMS-D9 (owner decision D9): the role field starts on an empty, disabled
 * "Choose a role" (no role is preselected); a refused role is said next to the
 * field, which points at it; after Appoint the page names the person and the
 * role given (`added`); one line says how to fix a wrong role. */
export function peoplePage(
  t: Label,
  lang: Lang,
  space: SpaceView,
  v: {
    people: ListedPerson[]; search: string; today: string; ownEnd: string; values: AppointForm; error?: string;
    /** The error belongs to the role field. */ roleError?: boolean;
    /** The person just appointed. */ added?: ListedPerson;
  },
): Html {
  const current = v.people.filter((p) => !p.ended).map((p) => personRow(t, space, p));
  const ended = v.people.filter((p) => p.ended).map((p) => personRow(t, space, p));
  const role = (ROLES as readonly string[]).includes(v.values.role ?? '') ? v.values.role : '';
  const roleError = v.roleError && v.error ? v.error : undefined;
  const none = v.search ? html`<p id="search-none" class="card muted">${sentence(t, 'searchNone', { q: v.search })}</p>` : html`<p id="people" class="card muted">${t('noneAppointed')}</p>`;
  // The line break is part of the confirmation, so without one the page is main's byte for byte up to the form.
  const added = v.added
    ? html`
<p id="done" class="done" role="status" tabindex="-1">${sentence(t, 'appointedAs', { name: v.added.display_name, role: roleWord(t, v.added.role) })}</p>`
    : '';
  const body = html`<h1>${t('people')}</h1>${added}
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
<p><a id="upload-entry" class="button plain" style="display:inline-flex;align-items:center;min-height:44px" href="${base(space)}/upload">${t('uploadEntry')}</a></p>
${roleError ? '' : errorBox(v.error)}
<form id="appoint" class="stack card" method="post" action="${base(space)}/people">
  <p id="role-help" class="muted">${t('wrongRoleHelp', { correct: t('correctTitle') })}</p>
  <label>${t('displayName')}<input name="display_name" required maxlength="${DISPLAY_NAME_MAX}" value="${v.values.display_name ?? ''}"></label>
  <label>${t('username')}<input name="username" required maxlength="${USERNAME_MAX}" autocomplete="off" dir="ltr" value="${v.values.username ?? ''}"><span class="hint">${t('usernameHint')}</span></label>
  <label>${t('firstPassword')}<input name="password" type="password" required minlength="8" autocomplete="new-password"><span class="hint">${t('passwordHint')}</span></label>
  <label>${t('roleField')}<select name="role" required${roleError ? raw(' aria-describedby="error" aria-invalid="true"') : ''}>
    <option value="" disabled ${role ? '' : 'selected'}>${t('roleChoose')}</option>
    ${ROLES.map((r) => html`<option value="${r}" ${role === r ? 'selected' : ''}>${t(r)}</option>`)}
  </select>${roleError ? html`<span id="error" class="error" role="alert">${roleError}</span>` : ''}</label>
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
export function renameForm(t: Label, v: { id: string; heading: Html | string; action: string; field: 'name' | 'title'; value: string }): Html {
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
    order?: OrderStatus;
    /** LMS wave 5 (section 4.1): the announcement card, after the setting card. */
    announcements?: Html;
    /** LMS wave 6 (section 4.2): the due card, after the announcement card. */
    due?: Html;
    /** LMS wave 7 (section 4.2): the quiz card, after the due card. */
    quizzes?: Html;
    /** LMS wave 8 (S1, UX-86): the Opening dates card, after the quiz card. */
    opening?: Html;
  },
): Html {
  const action = `${base(space)}/topics/${v.topic.id}`;
  const body = html`<p><a id="back" href="${base(space)}/topics">${t('back')}</a></p>
<p class="muted">${t('subject')}</p>
<h1 id="topic-title" dir="auto">${v.topic.title}</h1>
<p class="muted">${v.topic.is_published ? t('published') : t('notPublished')}</p>
<p>${viewAsLink(t, 'view-as', previewPath(space.id, `/learn/${v.topic.id}`, `topic:${v.topic.id}`))}</p>
${v.notice ? html`<p id="done" class="done" role="status">${t(v.notice)}</p>` : ''}
${errorBox(v.error)}
<form id="topic-access" class="stack card" method="post" action="${action}">
  ${publisherSelect(t, v.publishers, v.topic.publisher_user_id)}
  <h3>${t('assignedTo')}</h3>
  <fieldset class="checks"><legend>${t('group')}</legend>${memberChoices('set', v.sets, v.readers.sets, t)}</fieldset>
  <fieldset class="checks"><legend>${t('learner')}</legend>${memberChoices('learner', v.learners, v.readers.learners, t)}</fieldset>
  <button type="submit">${t('save')}</button>
</form>
${renameForm(t, { id: 'rename-topic', heading: t('renameItem', { item: t('subject') }), action: `${action}/name`, field: 'title', value: v.typedName ?? v.topic.title })}
${orderCard(t, lang, { action: `${action}/order`, on: v.topic.chapters_in_order === 1, status: v.order ?? null, own: true })}${v.announcements ?? ''}${v.due ?? ''}${v.quizzes ?? ''}${v.opening ?? ''}`;
  return spacePage(t, lang, space, v.topic.title, body);
}
