// The publisher's pages (AT-3): their home (their own subjects), the subject
// editor (publish state, chapters and lessons) and the lesson editor (the five
// material kinds). Every address is under /s/<space>/publish, behind the
// publisher gate, and every form posts there; words come from the label
// function and the space's kit.
import { html } from 'hono/html';
import type { Label, Lang } from '../labels.ts';
import type { MaterialRow, OutlineChapter, SubjectItem, SubjectRow } from '../learning.ts';
import type { EditableLesson } from '../publishing.ts';
import { errorBox, ltrSentence, type Html } from './layout.ts';
import { materialItem, spacePage } from './learn.ts';
import type { SpaceView } from './space.ts';

const TITLE_MAX = 200;
const NOTE_MAX = 10_000;
const ACCEPT = 'application/pdf,image/png,image/jpeg,image/webp,image/gif';
const addressField = (t: Label) => ltrSentence(t, 'addressField', { http: 'http://', https: 'https://' });

const base = (space: SpaceView) => `/s/${space.id}/publish`;

/** Two small buttons that move an item one place; the ends are disabled. */
function moveForm(t: Label, action: string, first: boolean, last: boolean, cls = 'move'): Html {
  return html`<form class="${cls}" method="post" action="${action}">
  <button type="submit" name="direction" value="up" aria-label="${t('moveUp')}" title="${t('moveUp')}" ${first ? 'disabled' : ''}>↑</button>
  <button type="submit" name="direction" value="down" aria-label="${t('moveDown')}" title="${t('moveDown')}" ${last ? 'disabled' : ''}>↓</button>
</form>`;
}

/** A publisher's home: exactly the subjects they are responsible for, each a way into its editor. */
export function publisherHome(t: Label, lang: Lang, space: SpaceView, displayName: string, items: SubjectItem[]): Html {
  const list = html`<ul id="publisher-list" class="list card">${items.map(
    (s) => html`<li class="row"><a class="edit" href="${base(space)}/edit/${s.id}"><bdi>${s.title}</bdi></a>
  <span class="muted" data-published="${s.is_published}">${s.is_published ? t('published') : t('notPublished')}</span></li>`,
  )}</ul>`;
  const body = html`<p>${t('welcome', { name: displayName })}</p>
<h2>${t('responsibleFor')} <span class="muted">· ${t('subject')}</span></h2>
${items.length ? list : html`<p id="nothing-yet" class="card message">${t('nothingHere')}</p>`}`;
  return spacePage(t, lang, space, space.name, body);
}

function entryRow(t: Label, space: SpaceView, entry: { id: string; title: string }, first: boolean, last: boolean): Html {
  const move = moveForm(t, `${base(space)}/compose/${entry.id}/move`, first, last, 'move-inner');
  return html`<li class="row"><a data-lesson="${entry.id}" href="${base(space)}/compose/${entry.id}"><bdi>${entry.title}</bdi></a>${move}</li>`;
}

function chapterEditor(t: Label, space: SpaceView, ch: OutlineChapter, i: number, count: number): Html {
  const entries = ch.lessons;
  const rows = entries.map((e, j) => entryRow(t, space, e, j === 0, j === entries.length - 1));
  const list = rows.length ? html`<ol class="list">${rows}</ol>` : html`<p class="muted">${t('nothingHere')}</p>`;
  const move = moveForm(t, `${base(space)}/part/${ch.id}/move`, i === 0, i === count - 1);
  return html`<section class="card" data-chapter="${ch.id}">
  <div class="row"><h3><span class="muted">${t('chapter')}</span> <bdi class="title">${ch.title}</bdi></h3>${move}</div>
  ${list}
  <form class="add-lesson inline-add" method="post" action="${base(space)}/part/${ch.id}/add">
    <label>${t('add')} ${t('lesson')}<input name="title" required maxlength="${TITLE_MAX}"></label>
    <button type="submit">${t('add')}</button>
  </form>
</section>`;
}

/** The subject editor: whether it is published, its chapters and lessons in order. */
export function subjectEditor(
  t: Label,
  lang: Lang,
  space: SpaceView,
  subject: SubjectRow,
  parts: OutlineChapter[],
  error?: string,
): Html {
  const published = subject.is_published === 1;
  const action = `${base(space)}/edit/${subject.id}`;
  const body = html`<p class="muted">${t('subject')}</p>
<h1 id="subject-title" dir="auto">${subject.title}</h1>
${errorBox(error)}
<div class="card">
  <p id="publish-state" class="${published ? 'done' : 'draft'}" data-published="${published ? 1 : 0}">${t(published ? 'publishedState' : 'draftState')}</p>
  ${published
    ? html`<form id="unpublish" method="post" action="${action}/unpublish"><button type="submit" class="secondary">${t('unpublish')}</button></form>`
    : html`<form id="publish" method="post" action="${action}/publish"><button type="submit">${t('publish')}</button></form>`}
  <p><a id="preview-subject" href="/s/${space.id}/learn/${subject.id}">${t('preview')}</a></p>
</div>
<h2>${t('chapter')} <span class="muted">· ${t('lesson')}</span></h2>
<div id="outline">${parts.map((ch, i) => chapterEditor(t, space, ch, i, parts.length))}</div>
${parts.length ? '' : html`<p class="card muted">${t('nothingHere')}</p>`}
<form id="add-chapter" class="stack card" method="post" action="${action}/add">
  <label>${t('add')} ${t('chapter')}<input name="title" required maxlength="${TITLE_MAX}"></label>
  <button type="submit">${t('add')}</button>
</form>`;
  return spacePage(t, lang, space, subject.title, body);
}

/** The lesson editor: its materials in order (as they are read, with move
 * buttons), then one form for each kind: a file (PDF or image), a video link,
 * a web link, a note. */
export function lessonEditor(
  t: Label,
  lang: Lang,
  space: SpaceView,
  v: { subject: { id: string; title: string }; lesson: EditableLesson; materials: MaterialRow[]; error?: string },
): Html {
  const action = `${base(space)}/compose/${v.lesson.id}/add`;
  const files = v.materials;
  const rows = files.map((m, i) => materialItem(t, space, m, moveForm(t, `${base(space)}/item/${m.id}/move`, i === 0, i === files.length - 1)));
  const items = rows.length ? html`<ol id="items" class="items">${rows}</ol>` : html`<p class="card muted">${t('nothingHere')}</p>`;
  const titleField = html`<label>${t('titleField')}<input name="title" required maxlength="${TITLE_MAX}"></label>`;
  const body = html`<nav id="trail" class="trail muted">
  <span>${t('subject')}: <a id="back-subject" href="${base(space)}/edit/${v.subject.id}"><bdi>${v.subject.title}</bdi></a></span> ·
  <span>${t('chapter')}: <bdi>${v.lesson.chapter_title}</bdi></span> ·
  <span>${t('lesson')}</span>
</nav>
<h1 id="lesson-title" dir="auto">${v.lesson.title}</h1>
${errorBox(v.error)}
<p><a id="preview" href="/s/${space.id}/read/${v.lesson.id}">${t('preview')}</a></p>
<h2>${t('material')}</h2>
${items}
<form id="add-file" class="stack card" method="post" action="${action}" enctype="multipart/form-data">
  <h3>${t('addFile')}</h3>
  <input type="hidden" name="kind" value="file">
  ${titleField}
  <label>${t('fileField')}<input name="file" type="file" required accept="${ACCEPT}"></label>
  <button type="submit">${t('add')}</button>
</form>
<form id="add-video" class="stack card" method="post" action="${action}">
  <h3>${t('addVideo')}</h3>
  <input type="hidden" name="kind" value="video_link">
  ${titleField}
  <label>${addressField(t)}<input name="url" required dir="ltr" inputmode="url" autocomplete="off"><span class="hint">${t('videoHint')}</span></label>
  <button type="submit">${t('add')}</button>
</form>
<form id="add-link" class="stack card" method="post" action="${action}">
  <h3>${t('addLink')}</h3>
  <input type="hidden" name="kind" value="link">
  ${titleField}
  <label>${addressField(t)}<input name="url" required dir="ltr" inputmode="url" autocomplete="off"></label>
  <button type="submit">${t('add')}</button>
</form>
<form id="add-note" class="stack card" method="post" action="${action}">
  <h3>${t('addNote')}</h3>
  <input type="hidden" name="kind" value="note">
  ${titleField}
  <label>${t('noteField')}<textarea name="text" required maxlength="${NOTE_MAX}" dir="auto" rows="5"></textarea></label>
  <button type="submit">${t('add')}</button>
</form>`;
  return spacePage(t, lang, space, v.lesson.title, body);
}
