// Reading pages inside a space: the learner's home, a subject with its
// chapters and lessons, and a lesson with its materials. Shown in the space's
// first language with its kit's labels and theme. Nothing here changes
// anything (the publisher's pages are in publish.ts).
import { html } from 'hono/html';
import type { Label, Lang, LabelKey } from '../labels.ts';
import type { LessonRow, MaterialKind, MaterialRow, OutlineChapter, SubjectItem } from '../learning.ts';
import { externalUrl } from '../links.ts';
import { layout, type Html } from './layout.ts';
import { spaceHeader, spaceNav, type SpaceView } from './space.ts';

export function spacePage(t: Label, lang: Lang, space: SpaceView, title: string, body: Html): Html {
  return layout({ t, lang, title, signedIn: true, header: spaceHeader(space), body: html`${spaceNav(t, space)}${body}` });
}

function subjectList(space: SpaceView, items: SubjectItem[]): Html {
  return html`<ul id="my-list" class="list card">${items.map(
    (s) => html`<li><a href="/s/${space.id}/learn/${s.id}"><bdi>${s.title}</bdi></a></li>`,
  )}</ul>`;
}

/** A learner's home: exactly the published subjects assigned to them. */
export function learnerHome(t: Label, lang: Lang, space: SpaceView, displayName: string, items: SubjectItem[]): Html {
  const body = html`<p>${t('welcome', { name: displayName })}</p>
<h2>${t('assignedToYou')} <span class="muted">· ${t('subject')}</span></h2>
${items.length ? subjectList(space, items) : html`<p id="nothing-yet" class="card message">${t('nothingAssigned')}</p>`}`;
  return spacePage(t, lang, space, space.name, body);
}

function chapterBlock(t: Label, space: SpaceView, ch: OutlineChapter): Html {
  const entries = ch.lessons;
  const list = entries.length
    ? html`<ol class="list">${entries.map((l) => html`<li><a data-lesson="${l.id}" href="/s/${space.id}/read/${l.id}"><bdi>${l.title}</bdi></a></li>`)}</ol>`
    : html`<p class="muted">${t('nothingHere')}</p>`;
  return html`<section class="card" data-chapter="${ch.id}">
  <h2><span class="muted">${t('chapter')}</span> <bdi class="title">${ch.title}</bdi></h2>
  ${list}
</section>`;
}

/** A subject: its chapters in order, each with its lessons in order. */
export function subjectPage(t: Label, lang: Lang, space: SpaceView, head: { title: string }, parts: OutlineChapter[]): Html {
  const blocks = parts.length ? parts.map((ch) => chapterBlock(t, space, ch)) : html`<p class="card muted">${t('nothingHere')}</p>`;
  const body = html`<p class="muted">${t('subject')}</p>
<h1 id="subject-title" dir="auto">${head.title}</h1>
<div id="outline">${blocks}</div>`;
  return spacePage(t, lang, space, head.title, body);
}

export const KIND_LABEL: Record<MaterialKind, LabelKey> = {
  pdf: 'kindPdf',
  image: 'kindImage',
  video_link: 'kindVideo',
  link: 'kindLink',
  note: 'kindNote',
};

/** One material as it is read; the publisher's lesson editor adds its own
 * controls after it. */
export function materialItem(t: Label, space: SpaceView, m: MaterialRow, controls: Html | string = ''): Html {
  const head = html`<div class="kind muted">${t(KIND_LABEL[m.kind])}</div><div class="title" dir="auto">${m.title}</div>`;
  const file = `/s/${space.id}/file/${m.id}`;
  let content: Html | string = '';
  if (m.kind === 'pdf') {
    content = html`<a class="open" href="${file}">${t('open')}</a>`;
  } else if (m.kind === 'image') {
    content = html`<img class="preview" src="${file}" alt="${m.title}"><a class="open" href="${file}">${t('open')}</a>`;
  } else if (m.kind === 'video_link' || m.kind === 'link') {
    const url = externalUrl(m.url ?? '');
    content = url
      ? html`<a class="open" href="${url}" target="_blank" rel="noopener noreferrer">${t('openNewTab')}</a>
  <bdi class="muted url" dir="ltr">${new URL(url).host}</bdi>`
      : html`<p class="muted">${t('linkUnusable')}</p>`;
  } else if (m.kind === 'note') {
    content = html`<div class="note" dir="auto">${m.note_text ?? ''}</div>`;
  }
  return html`<li class="card" data-kind="${m.kind}" data-id="${m.id}">${head}${content}${controls}</li>`;
}

/** A lesson: where it sits, then its materials in order. */
export function lessonPage(
  t: Label,
  lang: Lang,
  space: SpaceView,
  v: { subject: { id: string; title: string }; lesson: LessonRow; materials: MaterialRow[] },
): Html {
  const { title, body_text: intro, chapter_title: part } = v.lesson;
  const top = { id: v.subject.id, title: v.subject.title };
  const files = v.materials;
  const introBlock = intro ? html`<p class="body" dir="auto">${intro}</p>` : '';
  const list = files.length
    ? html`<ol id="items" class="items">${files.map((m) => materialItem(t, space, m))}</ol>`
    : html`<p class="card muted">${t('nothingHere')}</p>`;
  const body = html`<nav id="trail" class="trail muted">
  <span>${t('subject')}: <a href="/s/${space.id}/learn/${top.id}"><bdi>${top.title}</bdi></a></span> ·
  <span>${t('chapter')}: <bdi>${part}</bdi></span> ·
  <span>${t('lesson')}</span>
</nav>
<h1 id="lesson-title" dir="auto">${title}</h1>
${introBlock}
<h2>${t('material')}</h2>
${list}`;
  return spacePage(t, lang, space, title, body);
}
