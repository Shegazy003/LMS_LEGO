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
import { html, raw } from 'hono/html';
import type { Label, Lang, LabelKey } from '../labels.ts';
import type { CardProgress, ContinueArea, LearnerCard, LessonRow, MaterialKind, MaterialRow, OutlineChapter, SequenceStep } from '../learning.ts';
import { externalUrl } from '../links.ts';
import type { NoticeForm } from '../notice.ts';
import { activityNotice } from './activity.ts';
import { layout, marked, sentence, type Html } from './layout.ts';
import { INERT, learnerUrl, spaceHeader, spaceNav, type NavCurrent, type SpaceView } from './space.ts';

export function spacePage(t: Label, lang: Lang, space: SpaceView, title: string, body: Html, opts: { current?: NavCurrent; wide?: boolean } = {}): Html {
  // LMS wave 3a (section 7.2): a preview's title starts with "Preview · ", and its banner and bottom line frame the page.
  const shown = space.preview ? `${t('previewTitlePrefix')} · ${title}` : title;
  const preview = space.preview ? { banner: space.preview.banner, end: space.preview.end } : undefined;
  return layout({ t, lang, title: shown, signedIn: true, wide: opts.wide, header: html`${spaceHeader(space)}${spaceNav(t, space, opts.current)}`, body, preview });
}

// Every learner link goes through learnerUrl, so in a preview it leads to the matching preview address (wave 3a, section 8.2).
const subjectHref = (space: SpaceView, subjectId: string, chapterId?: string) =>
  learnerUrl(space, chapterId ? `/learn/${subjectId}?open=${chapterId}#${anchor(chapterId)}` : `/learn/${subjectId}`);
/** The id of a chapter on the outline, which the way back scrolls to (section 6.3). */
const anchor = (chapterId: string) => ['chapter', chapterId].join('-');
const lessonHref = (space: SpaceView, lessonId: string) => learnerUrl(space, `/read/${lessonId}`);

/** "<n> <lessons>", or "1 <lesson>" in lower case for one (section 4.2), the number isolated. */
function lessonCount(t: Label, lang: Lang, n: number): Html[] | string[] {
  return n === 1
    ? sentence(t, 'lessonCountOne', { lesson: t('lesson').toLocaleLowerCase(lang) })
    : sentence(t, 'lessonCount', { n: String(n) });
}

/** One subject card (section 4.1, UX-1): its title links to the outline, the teacher line only with a publisher, the count, and Start, its one action.
 * LMS wave 2, W2-2 (section 8.3, UX-34): once the learner marked one of its lessons, "Done: N of M <lessons>" (or "All done: M <lessons>")
 * in place of the count, and "Continue: <its target>" (or "Read again: <first lesson>") in place of Start; an unstarted card is exactly today's. */
function subjectCard(t: Label, lang: Lang, space: SpaceView, card: LearnerCard, p?: CardProgress): Html {
  const teacher = card.publisherName ? html`<p class="teacher">${sentence(t, 'teacherLine', { publisher: t('publisher'), name: card.publisherName })}</p>` : '';
  const go = p?.target ?? card.first;
  const work = p && go
    ? html`<p class="count done-count" data-done="card">${doneLine(t, lang, p.done, card.count)}</p>
  <a class="button start" data-action="${p.target ? 'continue' : 'read-again'}" href="${lessonHref(space, go.id)}"><span>${sentence(t, p.target ? 'continueLink' : 'readAgain', { title: go.title })}</span></a>`
    : card.first
    ? html`<p class="count muted">${lessonCount(t, lang, card.count)}</p>
  <a class="button start" href="${lessonHref(space, card.first.id)}"><span>${sentence(t, 'startLesson', { title: card.first.title })}</span></a>`
    : html`<p class="none muted">${t('noLessonsYet')}</p>`;
  return html`<li class="card" data-subject="${card.id}">
  <h2 class="title"><a href="${subjectHref(space, card.id)}"><bdi>${card.title}</bdi></a></h2>
  ${teacher}
  ${work}
</li>`;
}

const CONTINUE_CSS = `.continue h2{margin:0 0 8px;font-size:1.25rem}
.continue p{margin:0 0 8px}
.continue a.go{margin-top:8px}
.continue .line1,.continue .line2{overflow-wrap:anywhere}`;

/** "Continue where you stopped" (LMS wave 2, W2-2, section 8, UX-34): after the
 * greeting and the notice, before the cards, on a home with at least one card (with
 * nothing assigned, the home stays wave 1's empty home: greeting, heading and the
 * "nothing assigned" line only, as is the owner's preview). First time (and in every preview):
 * how it works, no link; with a target: the subject, its progress and one link
 * to the lesson (its chapter on a second line); everything started done: one
 * line, no link. A plain link: opening it is a normal open. */
function continueArea(t: Label, lang: Lang, space: SpaceView, area: ContinueArea): Html {
  let inner: Html;
  if (area.kind === 'target') {
    const forward = lang === 'ar' ? '←' : '→';
    inner = html`<p id="continue-subject"><span class="muted">${t('subject')}:</span> <bdi>${area.card.title}</bdi></p>
<p id="continue-progress" data-done="area">${doneLine(t, lang, area.done, area.card.count)}</p>
<a id="continue-link" class="go next" href="${lessonHref(space, area.target.id)}"><span class="line1">${sentence(t, 'continueLink', { title: area.target.title })}</span><span class="line2">${sentence(t, 'chapterLine', { title: area.target.chapterTitle })}</span><span class="arrow" aria-hidden="true">${forward}</span></a>`;
  } else if (area.kind === 'all-done') {
    inner = html`<p id="continue-state" data-done="area">${t('everythingDone')}</p>`;
  } else {
    inner = html`<p id="continue-state" class="muted">${sentence(t, 'continueFirst', { lesson: t('lesson').toLocaleLowerCase(lang) })}</p>`;
  }
  return html`<section id="continue" class="card continue" aria-labelledby="continue-heading"><style>${raw(CONTINUE_CSS)}</style>
<h2 id="continue-heading">${t('continueHeading')}</h2>
${inner}
</section>`;
}

/** A learner’s home: exactly the published subjects assigned to them, as cards;
 * My results is in the top navigation; from R2-d, while lesson activity is on,
 * the learner’s notice (AT-15f), in full once, then folded (wave 1, section 7). */
export function learnerHome(
  t: Label, lang: Lang, space: SpaceView, displayName: string, cards: LearnerCard[], notice: NoticeForm | null = null,
  where: { area: ContinueArea; progress: Map<string, CardProgress> } | null = { area: { kind: 'first' }, progress: new Map() },
): Html {
  // The continue area (W2-2, section 8.1) is on every learner home and every
  // preview home, also with nothing assigned (the first-time state, AT-5.4);
  // `null` only for a signed-in person without the learner role.
  // The heading shows also with nothing assigned, as today: it carries the
  // kit's subject word (release 1 AT-5.6; contract section 10 keeps kit-word
  // assertions unchanged).
  const list = html`<h2>${t('assignedToYou')} <span class="muted">· ${t('subject')}</span></h2>
${cards.length
    ? html`<ul id="my-list" class="cards">${cards.map((card) => subjectCard(t, lang, space, card, where?.progress.get(card.id)))}</ul>`
    : html`<p id="nothing-yet" class="card message">${t('nothingAssigned')}</p>`}`;
  const body = html`<p id="greeting">${t('welcome', { name: displayName })}</p>
${notice ? activityNotice(t, notice, learnerUrl(space), Boolean(space.preview)) : ''}
${where ? html`${continueArea(t, lang, space, where.area)}
` : ''}${list}`;
  return spacePage(t, lang, space, space.name, body, { current: 'home', wide: true });
}

/** A tick (LMS wave 2, UX-28): a sign, never a control, with its words for screen readers; `data-done` marks it for the privacy scans. */
function tick(t: Label, kind: 'lesson' | 'chapter'): Html {
  return html`<span class="tick" data-done="${kind}"><span aria-hidden="true">✓</span><span class="sr-only">${t(kind === 'lesson' ? 'doneTag' : 'chapterAllDone')}</span></span>`;
}

/** One chapter as a native disclosure (section 6.1, UX-6): the summary holds the title, the count and a decorative marker.
 * LMS wave 2 (section 5): a lesson the learner marked done has a tick before its title, and a chapter whose lessons are all done a tick after its title. */
function chapterBlock(t: Label, lang: Lang, space: SpaceView, ch: OutlineChapter, open: boolean, done: Set<string>): Html {
  const entries = ch.lessons;
  const rows = entries.map((l) => {
    const link = html`<a data-lesson="${l.id}" href="${lessonHref(space, l.id)}"><bdi>${l.title}</bdi></a>`;
    return done.has(l.id) ? html`<li class="is-done">${tick(t, 'lesson')}${link}</li>` : html`<li>${link}</li>`;
  });
  const list = entries.length
    ? html`<ol class="list">${rows}</ol>`
    : html`<p class="none muted">${t('noLessonsYet')}</p>`;
  const allDone = entries.length > 0 && entries.every((l) => done.has(l.id)) ? html` ${tick(t, 'chapter')}` : '';
  return html`<details class="card fold" id="chapter-${ch.id}" data-chapter="${ch.id}"${open ? html` open` : ''}>
  <summary><span class="mark" aria-hidden="true"></span><span class="head"><span class="muted">${t('chapter')}</span> <bdi class="title">${ch.title}</bdi>${allDone}</span> <span class="count muted">${lessonCount(t, lang, ch.lessons.length)}</span></summary>
  ${list}
</details>`;
}

/** The outline's done-mark style, drawn with the progress line (as the done
 * block does), so an outline with no done lesson is exactly today's. */
const OUTLINE_DONE_CSS = `.done-progress{margin:4px 0 12px;font-weight:600;color:#0f5132}
.tick{flex:0 0 auto;color:#1a7f37;font-weight:700}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
details.fold .list li.is-done{display:flex;align-items:center;gap:8px}
details.fold .list li.is-done>a{flex:1 1 auto;min-width:0}`;

/** The progress line under a subject's title (LMS wave 2, section 5, UX-29): "Done: N of M <lessons>", or "All done: M <lessons>"; nothing while N = 0. Numbers in the digits of the place line. */
function progressLine(t: Label, lang: Lang, n: number, total: number): Html | string {
  if (n === 0) return '';
  return html`
<style>${raw(OUTLINE_DONE_CSS)}</style><p id="done-progress" class="done-progress">${doneLine(t, lang, n, total)}</p>`;
}

/** "Done: N of M <lessons>", or "All done: M <lessons>" when N = M (section 5): the outline's progress line, and from W2-2 the home's. */
function doneLine(t: Label, lang: Lang, n: number, total: number): (Html | string)[] {
  const digits = (v: number) => html`<bdi dir="ltr" class="nowrap">${String(v)}</bdi>`;
  // The total with the plural kit word (AT-1.6); for one, the count line of today.
  const count = html`${total === 1 ? lessonCount(t, lang, 1) : sentence(t, 'doneCount', { n: String(total) })}`;
  return n >= total
    ? marked(t, 'allDone', { count, total: digits(total) })
    : marked(t, 'doneProgress', { n: digits(n), count, total: digits(total) });
}

/** Which chapters open (sections 6.1 to 6.3): three or fewer, all; more, none,
 * or all with ?open=all, or the one chapter of this subject ?open= names
 * (any other value is ignored). */
export function openChapters(parts: OutlineChapter[], open: string | undefined): Set<string> {
  if (parts.length <= 3 || open === 'all') return new Set(parts.map((ch) => ch.id));
  const one = parts.find((ch) => ch.id === open);
  return new Set(one ? [one.id] : []);
}

/** A subject: its chapters in order, each with its lessons in order, folded when there are more than three.
 * LMS wave 2: `marks` holds the ids of the lessons the person reading as a learner marked done (empty for anyone else and in a preview); only lessons of this outline count (AT-3.6). */
export function subjectPage(
  t: Label, lang: Lang, space: SpaceView, head: { id: string; title: string }, parts: OutlineChapter[], open?: string, marks: Set<string> = new Set(),
): Html {
  const opened = openChapters(parts, open);
  const ids = parts.flatMap((ch) => ch.lessons.map((l) => l.id));
  const done = new Set(ids.filter((id) => marks.has(id)));
  const blocks = parts.length ? parts.map((ch) => chapterBlock(t, lang, space, ch, opened.has(ch.id), done)) : html`<p class="card muted">${t('nothingHere')}</p>`;
  const fold = parts.length > 3
    ? html`<p id="fold-all" class="fold-all"><a id="expand-all" class="button plain" href="${learnerUrl(space, `/learn/${head.id}?open=all`)}">${t('expandAll')}</a><a id="collapse-all" class="button plain" href="${learnerUrl(space, `/learn/${head.id}?open=none`)}">${t('collapseAll')}</a></p>`
    : '';
  const body = html`<p class="muted">${t('subject')}</p>
<h1 id="subject-title" dir="auto">${head.title}</h1>${progressLine(t, lang, done.size, ids.length)}
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
<div class="pager ends">${outline}<a id="end-home" class="go back" href="${learnerUrl(space)}">${t('home')}</a></div>`;
  } else if (!previous) {
    rows = html`<div class="pager">${nextLink}${outline}</div>`;
  } else {
    rows = html`<div class="pager">${nextLink}${previousLink}</div>
<div class="pager ends">${outline}</div>`;
  }
  return html`<nav id="lesson-nav" class="way-on" aria-label="${t('lessonNav')}">${rows}</nav>`;
}

/** The done block of a lesson page (LMS wave 2, section 4): for a person reading
 * as a learner, their own state, and the status line of a press only when it
 * matches the stored state (the router decides); in a preview, "Mark as done"
 * inert (UX-31). Nobody else gets one. */
export type DoneBlock =
  | { kind: 'learner'; done: boolean; status: 'done' | 'not-done' | 'failed' | null }
  | { kind: 'inert' };

const STATUS_KEY = { done: 'markedDone', 'not-done': 'markedNotDone', failed: 'markFailed' } as const;

/** The block's and the "Done" tag's style, drawn with the block (as the
 * preview banner does), so pages without a done block carry none of it. */
const DONE_CSS = `.done-block{display:flex;flex-direction:column;gap:12px;margin:24px 0 0;border-radius:12px}
.done-block:focus{outline:3px solid #1b1f24;outline-offset:4px}
.done-block>*{margin:0}
.done-block form{display:flex}
.done-block button{flex:1 1 auto;display:flex;align-items:center;justify-content:center;min-height:48px;min-width:44px;background:#1a5fd0;font-size:1.05rem}
.done-block button.undo{min-height:44px;background:#fff;color:#1a5fd0;border:2px solid #1a5fd0;font-size:1rem}
@media (min-width:700px){.done-block button{flex:0 1 auto;min-width:240px}}
.done-now{display:flex;align-items:center;gap:8px;font-weight:700;color:#0f5132}
.done-now .tick{flex:0 0 auto;color:#1a7f37;font-weight:700}
.done-tag{display:inline-flex;align-items:center;gap:6px;margin-top:8px!important;padding:2px 12px;border:1px solid #2f7d4a;border-radius:999px;background:#e8f5ec;color:#0f5132;font-weight:600;font-size:.9rem}`;
const doneStyle = html`<style>${raw(DONE_CSS)}</style>`;

/** The block after the materials (UX-27): it takes focus when the page opens at #done-state, after a press. */
function doneBlock(t: Label, space: SpaceView, lessonId: string, d: DoneBlock): Html {
  if (d.kind === 'inert') {
    return html`
<section id="done-state" class="done-block" tabindex="-1">${doneStyle}<button type="button" id="done-control"${INERT}>${t('markDone')}</button></section>`;
  }
  const status = d.status
    ? html`<p id="done-status" class="${d.status === 'failed' ? 'error' : 'done'}" role="status">${t(STATUS_KEY[d.status])}</p>`
    : '';
  const now = d.done ? html`<p class="done-now" data-done="block"><span class="tick" aria-hidden="true">✓</span><span>${t('doneTag')}</span></p>` : '';
  const control = html`<form id="done-control" method="post" action="${`/s/${space.id}/read/${lessonId}/done`}"><input type="hidden" name="state" value="${d.done ? 'not-done' : 'done'}"><button type="submit"${d.done ? html` class="undo"` : ''}>${t(d.done ? 'markNotDone' : 'markDone')}</button></form>`;
  return html`
<section id="done-state" class="done-block" tabindex="-1">${doneStyle}${status}${now}${control}</section>`;
}

/** A lesson: where it sits (the trail, and its place "<lesson> N / M"), the
 * learner’s notice while lesson activity is on (R2-d, in the same response
 * that is recorded, AT-15f; wave 1: in full once, then folded), its materials
 * in order, and the way on (Next, Previous) in the subject’s order.
 * LMS wave 2: the "Done" tag under the place line, and the done block before the way on. */
export function lessonPage(
  t: Label,
  lang: Lang,
  space: SpaceView,
  v: { subject: { id: string; title: string }; lesson: LessonRow; materials: MaterialRow[]; place: LessonPlace; notice?: NoticeForm | null; done?: DoneBlock | null },
): Html {
  const { title, body_text: intro, chapter_title: part } = v.lesson;
  const top = { id: v.subject.id, title: v.subject.title };
  const files = v.materials;
  const introBlock = intro ? html`<p class="body" dir="auto">${intro}</p>` : '';
  const list = files.length
    ? html`<ol id="items" class="items">${files.map((m) => materialItem(t, space, m))}</ol>`
    : html`<p class="card muted">${t('nothingHere')}</p>`;
  const where = `${v.place.index + 1} / ${v.place.steps.length}`;
  const tag = v.done?.kind === 'learner' && v.done.done
    ? html`
<p id="done-tag" class="done-tag" data-done="tag"><span aria-hidden="true">✓</span><span>${t('doneTag')}</span></p>`
    : '';
  const body = html`<nav id="trail" class="trail muted">
  <span>${t('subject')}: <a href="${subjectHref(space, top.id, v.lesson.chapter_id)}"><bdi>${top.title}</bdi></a></span> ·
  <span>${t('chapter')}: <bdi>${part}</bdi></span> ·
  <span>${t('lesson')}</span>
</nav>
<div id="lesson-head" class="title-block">
<h1 id="lesson-title" dir="auto">${title}</h1>
<p id="lesson-place" class="muted">${sentence(t, 'lessonPlace', { place: where })}</p>${tag}
</div>
${v.notice ? activityNotice(t, v.notice, lessonHref(space, v.lesson.id), Boolean(space.preview)) : ''}
${introBlock}
<h2>${t('material')}</h2>
${list}${v.done ? doneBlock(t, space, v.lesson.id, v.done) : ''}
${lessonNav(t, lang, space, top, v.lesson, v.place)}`;
  return spacePage(t, lang, space, title, body);
}
