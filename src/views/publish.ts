// The publisher's pages (AT-3): their home (their own subjects), the subject
// editor (publish state, chapters and lessons) and the lesson editor (the five
// material kinds). Release 1.1 (AT-8) adds a page for one chapter and one
// material (rename, replace the file, remove), the remove step, and Recently
// removed. Every address is under /s/<space>/publish, behind the publisher
// gate, and every form posts there; words come from the label function and
// the space's kit.
import { html } from 'hono/html';
import type { Label, LabelKey, Lang } from '../labels.ts';
import type { MaterialRow, OutlineChapter, SubjectItem, SubjectRow } from '../learning.ts';
import type { EditableChapter, EditableLesson, EditableMaterial } from '../publishing.ts';
import type { ContentKind, RemovedItem } from '../removal.ts';
import { renameForm } from './admin.ts';
import { errorBox, ltrSentence, sentence, type Html } from './layout.ts';
import { KIND_LABEL, materialItem, spacePage } from './learn.ts';
import type { SpaceView } from './space.ts';

const TITLE_MAX = 200;
const NOTE_MAX = 10_000;
const ACCEPT = 'application/pdf,image/png,image/jpeg,image/webp,image/gif';
const addressField = (t: Label) => ltrSentence(t, 'addressField', { http: 'http://', https: 'https://' });

const base = (space: SpaceView) => `/s/${space.id}/publish`;

/** The address word of each kind of content (neutral words, so no address names a concept). */
export const SEGMENT: Record<ContentKind, 'part' | 'compose' | 'item'> = { chapter: 'part', lesson: 'compose', material: 'item' };

/** What a page of the publisher's says after a done form. */
export type EditorNotice = 'renamed' | 'removedDone' | 'restoredDone' | 'replacedDone';

/** The id of the rename form and its heading, built from the key of the kind of item (never shown). */
const renameId = (kind: ContentKind) => `rename-${kind}`;

const noticeBox = (t: Label, notice?: EditorNotice) => (notice ? html`<p id="done" class="done" role="status">${t(notice)}</p>` : '');

/** Two small buttons that move an item one place; the ends are disabled. */
function moveForm(t: Label, action: string, first: boolean, last: boolean, cls = 'move'): Html {
  return html`<form class="${cls}" method="post" action="${action}">
  <button type="submit" name="direction" value="up" aria-label="${t('moveUp')}" title="${t('moveUp')}" ${first ? 'disabled' : ''}>↑</button>
  <button type="submit" name="direction" value="down" aria-label="${t('moveDown')}" title="${t('moveDown')}" ${last ? 'disabled' : ''}>↓</button>
</form>`;
}

/** The way to an item's remove step: a plain GET form (it changes nothing); the step names the item. */
function removeEntry(t: Label, action: string): Html {
  return html`<h2>${t('remove')}</h2>
<form id="remove-item" class="stack card" method="get" action="${action}">
  <p class="muted">${t('removeNote')}</p>
  <button type="submit" class="secondary">${t('remove')}</button>
</form>`;
}

const recentlyRemovedLink = (t: Label, space: SpaceView, subjectId: string) =>
  html`<p><a id="recently-removed" href="${base(space)}/edit/${subjectId}/removed">${t('recentlyRemoved')}</a></p>`;

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
  <p><a class="change" href="${base(space)}/part/${ch.id}">${t('change')}</a></p>
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
  notice?: EditorNotice,
): Html {
  const published = subject.is_published === 1;
  const action = `${base(space)}/edit/${subject.id}`;
  const body = html`<p class="muted">${t('subject')}</p>
<h1 id="subject-title" dir="auto">${subject.title}</h1>
${noticeBox(t, notice)}
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
</form>
${recentlyRemovedLink(t, space, subject.id)}
<p><a id="exam-list-link" href="${action}/marks">${t('examList')}</a></p>`;
  return spacePage(t, lang, space, subject.title, body);
}

/** The lesson editor: its materials in order (as they are read, with move
 * buttons and a way to change each), then one form for each kind: a file (PDF
 * or image), a video link, a web link, a note; then renaming and removing the
 * lesson itself (AT-8). */
export function lessonEditor(
  t: Label,
  lang: Lang,
  space: SpaceView,
  v: {
    subject: { id: string; title: string };
    lesson: EditableLesson;
    materials: MaterialRow[];
    error?: string;
    notice?: EditorNotice;
    typedName?: string;
  },
): Html {
  const action = `${base(space)}/compose/${v.lesson.id}/add`;
  const files = v.materials;
  const rows = files.map((m, i) => materialItem(t, space, m, html`${moveForm(t, `${base(space)}/item/${m.id}/move`, i === 0, i === files.length - 1)}
  <a class="change" href="${base(space)}/item/${m.id}">${t('change')}</a>`));
  const items = rows.length ? html`<ol id="items" class="items">${rows}</ol>` : html`<p class="card muted">${t('nothingHere')}</p>`;
  const titleField = html`<label>${t('titleField')}<input name="title" required maxlength="${TITLE_MAX}"></label>`;
  const self = `${base(space)}/compose/${v.lesson.id}`;
  const rename = renameForm(t, { id: renameId('lesson'), heading: t('renameItem', { item: t('lesson') }), action: `${self}/name`, field: 'title', value: v.typedName ?? v.lesson.title });
  const body = html`<nav id="trail" class="trail muted">
  <span>${t('subject')}: <a id="back-subject" href="${base(space)}/edit/${v.subject.id}"><bdi>${v.subject.title}</bdi></a></span> ·
  <span>${t('chapter')}: <bdi>${v.lesson.chapter_title}</bdi></span> ·
  <span>${t('lesson')}</span>
</nav>
<h1 id="lesson-title" dir="auto">${v.lesson.title}</h1>
${noticeBox(t, v.notice)}
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
</form>
${rename}
${removeEntry(t, `${self}/remove`)}
${recentlyRemovedLink(t, space, v.subject.id)}`;
  return spacePage(t, lang, space, v.lesson.title, body);
}

/** One chapter (AT-8): its lessons, renaming it, and the way to remove it. */
export function chapterPage(
  t: Label,
  lang: Lang,
  space: SpaceView,
  v: {
    subject: { id: string; title: string };
    chapter: EditableChapter;
    lessons: { id: string; title: string }[];
    error?: string;
    notice?: EditorNotice;
    typedName?: string;
  },
): Html {
  const self = `${base(space)}/part/${v.chapter.id}`;
  const entries = v.lessons;
  const list = entries.length
    ? html`<ol id="part-entries" class="list card">${entries.map((e) => html`<li><a data-lesson="${e.id}" href="${base(space)}/compose/${e.id}"><bdi>${e.title}</bdi></a></li>`)}</ol>`
    : html`<p class="card muted">${t('nothingHere')}</p>`;
  const rename = renameForm(t, { id: renameId('chapter'), heading: t('renameItem', { item: t('chapter') }), action: `${self}/name`, field: 'title', value: v.typedName ?? v.chapter.title });
  const body = html`<nav id="trail" class="trail muted">
  <span>${t('subject')}: <a id="back" href="${base(space)}/edit/${v.subject.id}"><bdi>${v.subject.title}</bdi></a></span> ·
  <span>${t('chapter')}</span>
</nav>
<h1 id="chapter-title" dir="auto">${v.chapter.title}</h1>
${noticeBox(t, v.notice)}
${errorBox(v.error)}
<h2>${t('lesson')}</h2>
${list}
${rename}
${removeEntry(t, `${self}/remove`)}
${recentlyRemovedLink(t, space, v.subject.id)}`;
  return spacePage(t, lang, space, v.chapter.title, body);
}

/** One material (AT-8): renaming it, replacing its file (a PDF or an image), and the way to remove it. */
export function materialPage(
  t: Label,
  lang: Lang,
  space: SpaceView,
  v: {
    subject: { id: string; title: string };
    material: EditableMaterial;
    error?: string;
    notice?: EditorNotice;
    typedName?: string;
  },
): Html {
  const m = v.material;
  const self = `${base(space)}/item/${m.id}`;
  const isFile = m.kind === 'pdf' || m.kind === 'image';
  const replace = isFile
    ? html`<h2>${t('replaceTitle')}</h2>
<form id="replace-file" class="stack card" method="post" action="${self}/file" enctype="multipart/form-data">
  <p class="muted">${t('replaceNote')}</p>
  <label>${t('fileField')}<input name="file" type="file" required accept="${m.kind === 'pdf' ? 'application/pdf' : 'image/png,image/jpeg,image/webp,image/gif'}"></label>
  <button type="submit">${t('replaceTitle')}</button>
</form>`
    : '';
  const rename = renameForm(t, { id: renameId('material'), heading: t('renameItem', { item: t('material') }), action: `${self}/name`, field: 'title', value: v.typedName ?? m.title });
  const body = html`<nav id="trail" class="trail muted">
  <span>${t('subject')}: <a href="${base(space)}/edit/${v.subject.id}"><bdi>${v.subject.title}</bdi></a></span> ·
  <span>${t('lesson')}: <a id="back" href="${base(space)}/compose/${m.lesson_id}"><bdi>${m.lesson_title}</bdi></a></span>
</nav>
<p class="muted">${t('material')} · ${t(KIND_LABEL[m.kind])}</p>
<h1 id="material-title" dir="auto">${m.title}</h1>
${noticeBox(t, v.notice)}
${errorBox(v.error)}
${isFile ? html`<p><a id="open-file" href="/s/${space.id}/file/${m.id}">${t('open')}</a></p>` : ''}
${rename}
${replace}
${removeEntry(t, `${self}/remove`)}`;
  return spacePage(t, lang, space, m.title, body);
}

/** The remove step (AT-8): a page that names the item. "Yes" posts; Cancel is
 * a plain link back, which changes nothing. When the item still shows content
 * (a lesson with materials, a chapter with lessons) the step says what to
 * remove first and offers no "Yes". */
export function removeConfirmPage(
  t: Label,
  lang: Lang,
  space: SpaceView,
  v: { kind: ContentKind; id: string; title: string; back: string; refused?: { inside: LabelKey; titles: string[] } },
): Html {
  const action = `${base(space)}/${SEGMENT[v.kind]}/${v.id}/remove`;
  const heading = sentence(t, 'removeConfirmTitle', { item: t(v.kind), name: v.title });
  const step = v.refused
    ? html`${errorBox(t('removeRefused', { item: t(v.kind), name: v.title, inside: t(v.refused.inside) }))}
  <p>${t('stillShowing')}</p>
  <ul id="still-showing" class="list">${v.refused.titles.map((title) => html`<li><bdi>${title}</bdi></li>`)}</ul>
  <p><a id="cancel-remove" class="button" href="${v.back}">${t('back')}</a></p>`
    : html`<p class="muted">${t('removeConfirmNote')}</p>
  <div class="share">
    <form id="confirm-remove" method="post" action="${action}"><button type="submit" class="secondary">${t('removeYes')}</button></form>
    <a id="cancel-remove" class="button" href="${v.back}">${t('cancel')}</a>
  </div>`;
  const body = html`<h1 id="remove-title">${heading}</h1>
<div id="remove-confirm" class="card">
  <p class="message"><span class="muted">${t(v.kind)}</span> <bdi dir="auto">${v.title}</bdi></p>
  ${step}
</div>`;
  return spacePage(t, lang, space, t('removeConfirmTitle', { item: t(v.kind), name: v.title }), body);
}

const removedDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function removedEntry(t: Label, space: SpaceView, item: RemovedItem): Html {
  const where = item.kind === 'lesson' ? 'chapter' : item.kind === 'material' ? 'lesson' : null;
  const kindWord = item.material_kind ? html`${t('material')} · ${t(KIND_LABEL[item.material_kind])}` : t(item.kind);
  const restore = item.blocked_by
    ? html`<p class="muted parent-first">${sentence(t, 'restoreParentFirst', { name: item.blocked_by })}</p>`
    : html`<form class="restore" method="post" action="${base(space)}/${SEGMENT[item.kind]}/${item.id}/restore"><button type="submit">${t('restore')}</button></form>`;
  return html`<li data-removed="${item.id}" data-kind="${item.kind}">
  <div><span class="muted">${kindWord}</span> <bdi class="entry-title">${item.title}</bdi></div>
  <div class="muted">${where && item.parent_title ? html`${t(where)}: <bdi>${item.parent_title}</bdi> · ` : ''}${sentence(t, 'removedOn', { date: removedDate(item.removed_at) })}</div>
  ${restore}
</li>`;
}

/** Recently removed (AT-8): everything removed in one subject, each with Restore. */
export function removedPage(
  t: Label,
  lang: Lang,
  space: SpaceView,
  v: { subject: { id: string; title: string }; items: RemovedItem[]; error?: string },
): Html {
  const list = v.items.length
    ? html`<ul id="removed" class="list card">${v.items.map((item) => removedEntry(t, space, item))}</ul>`
    : html`<p id="removed" class="card muted">${t('nothingHere')}</p>`;
  const body = html`<nav id="trail" class="trail muted">
  <span>${t('subject')}: <a id="back" href="${base(space)}/edit/${v.subject.id}"><bdi>${v.subject.title}</bdi></a></span>
</nav>
<h1 id="removed-title">${t('recentlyRemoved')}</h1>
<p class="muted">${t('recentlyRemovedNote')}</p>
${errorBox(v.error)}
${list}`;
  return spacePage(t, lang, space, t('recentlyRemoved'), body);
}
