// Reading pages inside a space: the learner’s home, a subject with its
// chapters and lessons, and a lesson with its materials. Shown in the space’s
// first language with its kit’s labels and theme. Nothing here changes
// anything (the publisher’s pages are in publish.ts).
//
// LMS wave 1, task L1 (product-contract v2 on PIL-210, sections 4 to 7; ux-plan
// UX-1 to UX-8): the home is a set of subject cards with one Start link each;
// every page has the top navigation with My results; a long outline folds; a
// lesson ends with Next and Previous in the outline’s order; the activity
// notice is told in full once, then folded.
import { html } from 'hono/html';
import type { Label, Lang, LabelKey } from '../labels.ts';
import type { LearnerCard, LessonRow, MaterialKind, MaterialRow, OutlineChapter, SequenceStep } from '../learning.ts';
import { externalUrl } from '../links.ts';
import type { NoticeForm } from '../notice.ts';
import { activityNotice } from './activity.ts';
import { layout, sentence, type Html } from './layout.ts';
import { spaceHeader, spaceNav, type NavCurrent, type SpaceView } from './space.ts';

export function spacePage(t: Label, lang: Lang, space: SpaceView, title: string, body: Html, opts: { current?: NavCurrent; wide?: boolean } = {}): Html {
  return layout({ t, lang, title, signedIn: true, wide: opts.wide, header: html`${spaceHeader(space)}${spaceNav(t, space, opts.current)}`, body });
}

const subjectHref = (space: SpaceView, subjectId: string, chapterId?: string) =>
  chapterId ? `/s/${space.id}/learn/${subjectId}?open=${chapterId}#${anchor(chapterId)}` : `/s/${space.id}/learn/${subjectId}`;
/** The id of a chapter on the outline, which the way back scrolls to (section 6.3). */
const anchor = (chapterId: string) => ['chapter', chapterId].join('-');
const lessonHref = (space: SpaceView, lessonId: string) => `/s/${space.id}/read/${lessonId}`;

/** "<n> <lessons>", or "1 <lesson>" in lower case for one (section 4.2), the number isolated. */
function lessonCount(t: Label, lang: Lang, n: number): Html[] | string[] {
  return n === 1
    ? sentence(t, 'lessonCountOne', { lesson: t('lesson').toLocaleLowerCase(lang) })
    : sentence(t, 'lessonCount', { n: String(n) });
}

/** One subject card (section 4.1, UX-1): its title links to the outline, the teacher line only with a publisher, the count, and Start, its one action. */
function subjectCard(t: Label, lang: Lang, space: SpaceView, card: LearnerCard): Html {
  const teacher = card.publisherName ? html`<p class="teacher">${sentence(t, 'teacherLine', { publisher: t('publisher'), name: card.publisherName })}</p>` : '';
  const work = card.first
    ? html`<p class="count muted">${lessonCount(t, lang, card.count)}</p>
  <a class="button start" href="${lessonHref(space, card.first.id)}"><span>${sentence(t, 'startLesson', { title: card.first.title })}</span></a>`
    : html`<p class="none muted">${t('noLessonsYet')}</p>`;
  return html`<li class="card" data-subject="${card.id}">
  <h2 class="title"><a href="${subjectHref(space, card.id)}"><bdi>${card.title}</bdi></a></h2>
  ${teacher}
  ${work}
</li>`;
}

/** A learner’s home: exactly the published subjects assigned to them, as cards;
 * My results is in the top navigation; from R2-d, while lesson activity is on,
 * the learner’s notice (AT-15f), in full once, then folded (wave 1, section 7). */
export function learnerHome(t: Label, lang: Lang, space: SpaceView, displayName: string, cards: LearnerCard[], notice: NoticeForm | null = null): Html {
  const list = cards.length
    ? html`<h2>${t('assignedToYou')} <span class="muted">· ${t('subject')}</span></h2>
<ul id="my-list" class="cards">${cards.map((card) => subjectCard(t, lang, space, card))}</ul>`
    : html`<p id="nothing-yet" class="card message">${t('nothingAssigned')}</p>`;
  const body = html`<p id="greeting">${t('welcome', { name: displayName })}</p>
${notice ? activityNotice(t, notice, `/s/${space.id}`) : ''}
${list}`;
  return spacePage(t, lang, space, space.name, body, { current: 'home', wide: true });
}

/** One chapter as a native disclosure (section 6.1, UX-6): the summary holds the title, the count and a decorative marker. */
function chapterBlock(t: Label, lang: Lang, space: SpaceView, ch: OutlineChapter, open: boolean): Html {
  const entries = ch.lessons;
  const rows = entries.map((l) => html`<li><a data-lesson="${l.id}" href="${lessonHref(space, l.id)}"><bdi>${l.title}</bdi></a></li>`);
  const list = entries.length
    ? html`<ol class="list">${rows}</ol>`
    : html`<p class="none muted">${t('noLessonsYet')}</p>`;
  return html`<details class="card fold" id="chapter-${ch.id}" data-chapter="${ch.id}"${open ? html` open` : ''}>
  <summary><span class="mark" aria-hidden="true"></span><span class="head"><span class="muted">${t('chapter')}</span> <bdi class="title">${ch.title}</bdi></span> <span class="count muted">${lessonCount(t, lang, ch.lessons.length)}</span></summary>
  ${list}
</details>`;
}

/** Which chapters open (sections 6.1 to 6.3): three or fewer, all; more, none,
 * or all with ?open=all, or the one chapter of this subject ?open= names
 * (any other value is ignored). */
export function openChapters(parts: OutlineChapter[], open: string | undefined): Set<string> {
  if (parts.length <= 3 || open === 'all') return new Set(parts.map((ch) => ch.id));
  const one = parts.find((ch) => ch.id === open);
  return new Set(one ? [one.id] : []);
}

/** A subject: its chapters in order, each with its lessons in order, folded when there are more than three. */
export function subjectPage(t: Label, lang: Lang, space: SpaceView, head: { id: string; title: string }, parts: OutlineChapter[], open?: string): Html {
  const opened = openChapters(parts, open);
  const blocks = parts.length ? parts.map((ch) => chapterBlock(t, lang, space, ch, opened.has(ch.id))) : html`<p class="card muted">${t('nothingHere')}</p>`;
  const fold = parts.length > 3
    ? html`<p id="fold-all" class="fold-all"><a id="expand-all" class="button plain" href="/s/${space.id}/learn/${head.id}?open=all">${t('expandAll')}</a><a id="collapse-all" class="button plain" href="/s/${space.id}/learn/${head.id}?open=none">${t('collapseAll')}</a></p>`
    : '';
  const body = html`<p class="muted">${t('subject')}</p>
<h1 id="subject-title" dir="auto">${head.title}</h1>
${fold}
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

/** One material as it is read; the publisher’s lesson editor adds its own
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

/** Where a lesson sits in its subject’s sequence (section 5.1). */
export interface LessonPlace {
  index: number;
  steps: SequenceStep[];
}

/** The block after the materials (section 5.2, UX-4, UX-5): Next first in the
 * reading order (with its chapter on a second line when it crosses into
 * another chapter), then Previous, or "Back to the outline" in Previous’s place
 * on the first lesson; on the last lesson the end sentence, the outline and
 * Home. Every way back to the outline opens this lesson’s chapter. Plain
 * links only: nothing is prefetched, because opening a lesson may record it. */
function lessonNav(t: Label, lang: Lang, space: SpaceView, subject: { id: string; title: string }, lesson: LessonRow, place: LessonPlace): Html {
  const next = place.steps[place.index + 1];
  const previous = place.steps[place.index - 1];
  const forward = lang === 'ar' ? '←' : '→';
  const backward = lang === 'ar' ? '→' : '←';
  const outline = html`<a id="back-to-outline" class="go back" href="${subjectHref(space, subject.id, lesson.chapter_id)}">${t('backToOutline')}</a>`;
  // When Next crosses into another chapter, that chapter goes on a second line of the same link.
  const crossing = next && next.chapterId !== lesson.chapter_id ? html`<span class="line2">${sentence(t, 'chapterLine', { title: next.chapterTitle })}</span>` : '';
  const nextLink = next
    ? html`<a id="next-lesson" class="go next" href="${lessonHref(space, next.id)}"><span class="line1">${sentence(t, 'nextLesson', { title: next.title })}</span>${crossing}<span class="arrow" aria-hidden="true">${forward}</span></a>`
    : '';
  const previousLink = previous
    ? html`<a id="previous-lesson" class="go prev" href="${lessonHref(space, previous.id)}"><span class="arrow" aria-hidden="true">${backward}</span><span class="line1">${sentence(t, 'previousLesson', { title: previous.title })}</span></a>`
    : '';
  let rows: Html;
  if (!next) {
    rows = html`<p id="last-lesson" class="done" role="status">${sentence(t, 'lastLesson', { title: subject.title })}</p>
<div class="pager">${previousLink}</div>
<div class="pager ends">${outline}<a id="end-home" class="go back" href="/s/${space.id}">${t('home')}</a></div>`;
  } else if (!previous) {
    rows = html`<div class="pager">${nextLink}${outline}</div>`;
  } else {
    rows = html`<div class="pager">${nextLink}${previousLink}</div>
<div class="pager ends">${outline}</div>`;
  }
  return html`<nav id="lesson-nav" class="way-on" aria-label="${t('lessonNav')}">${rows}</nav>`;
}

/** A lesson: where it sits (the trail, and its place "<lesson> N / M"), the
 * learner’s notice while lesson activity is on (R2-d, in the same response
 * that is recorded, AT-15f; wave 1: in full once, then folded), its materials
 * in order, and the way on (Next, Previous) in the subject’s order. */
export function lessonPage(
  t: Label,
  lang: Lang,
  space: SpaceView,
  v: { subject: { id: string; title: string }; lesson: LessonRow; materials: MaterialRow[]; place: LessonPlace; notice?: NoticeForm | null },
): Html {
  const { title, body_text: intro, chapter_title: part } = v.lesson;
  const top = { id: v.subject.id, title: v.subject.title };
  const files = v.materials;
  const introBlock = intro ? html`<p class="body" dir="auto">${intro}</p>` : '';
  const list = files.length
    ? html`<ol id="items" class="items">${files.map((m) => materialItem(t, space, m))}</ol>`
    : html`<p class="card muted">${t('nothingHere')}</p>`;
  const where = `${v.place.index + 1} / ${v.place.steps.length}`;
  const body = html`<nav id="trail" class="trail muted">
  <span>${t('subject')}: <a href="${subjectHref(space, top.id, v.lesson.chapter_id)}"><bdi>${top.title}</bdi></a></span> ·
  <span>${t('chapter')}: <bdi>${part}</bdi></span> ·
  <span>${t('lesson')}</span>
</nav>
<div id="lesson-head" class="title-block">
<h1 id="lesson-title" dir="auto">${title}</h1>
<p id="lesson-place" class="muted">${sentence(t, 'lessonPlace', { place: where })}</p>
</div>
${v.notice ? activityNotice(t, v.notice, lessonHref(space, v.lesson.id)) : ''}
${introBlock}
<h2>${t('material')}</h2>
${list}
${lessonNav(t, lang, space, top, v.lesson, v.place)}`;
  return spacePage(t, lang, space, title, body);
}
