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
import { TODO_AHEAD_DAYS, TODO_MAX_PER_GROUP, type TodoGroup, type TodoItem } from '../due.ts';
import type { Label, Lang, LabelKey } from '../labels.ts';
import type { CardProgress, ChapterLocks, ContinueArea, LearnerCard, LessonRow, LockReason, MaterialKind, MaterialRow, OutlineChapter, SequenceStep, WaitingFor } from '../learning.ts';
import { externalUrl } from '../links.ts';
import type { NoticeForm } from '../notice.ts';
import { cutText } from '../announcements.ts';
import { dayLabel } from '../format.ts';
import { icon, ring } from '../icons.ts';
import { subjectVars } from '../look.ts';
import { activityNotice } from './activity.ts';
import { dateText, layout, marked, sentence, type Html } from './layout.ts';
import { INERT, learnerUrl, spaceHeader, spaceNav, type NavCurrent, type SpaceView } from './space.ts';

/** A page inside a space. LMS redesign R1a (S2, S8, S9): every one in the school colour; `bar` for the learner and
 * guardian pages, whose navigation is a bottom bar below 960 px (staff pages keep it in the header). */
export function spacePage(t: Label, lang: Lang, space: SpaceView, title: string, body: Html, opts: { current?: NavCurrent; wide?: boolean; bar?: boolean; mainClass?: string } = {}): Html {
  // LMS wave 3a (section 7.2): a preview's title starts with "Preview · ", and its banner and bottom line frame the page.
  const shown = space.preview ? `${t('previewTitlePrefix')} · ${title}` : title;
  const preview = space.preview ? { banner: space.preview.banner, end: space.preview.end } : undefined;
  const bar = Boolean(opts.bar);
  return layout({
    t, lang, title: shown, signedIn: true, wide: opts.wide, header: html`${spaceHeader(space)}${spaceNav(t, space, opts.current, bar)}`, body, preview,
    school: space.primaryColor, bar, mainClass: opts.mainClass,
  });
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

/** A card's latest announcement (LMS redesign R1a, UX-55 row): the first item its subject page shows this learner. */
export interface CardAnnouncement {
  id: string;
  body: string;
}

/** The colour pairs of a subject surface (S2, S7: the automatic colour until a teacher chooses one in wave R1b). */
const subjStyle = (subjectId: string) => subjectVars(subjectId);
/** The school colour as a subject surface (the hero with no subject: first time, all done). */
const SCHOOL_AS_SUBJECT = '--subj:var(--brand);--on-subj:var(--on-brand);--subj-strong:var(--brand-strong);--subj-tint:var(--brand-tint)';

/** One subject card (section 4.1, UX-1; LMS redesign R1a, UX-99): the subject's colour band and icon tile, its
 * title linking to the outline, the teacher line only with a publisher, a decorative ring beside the progress
 * text (UX-29) and one action («ابدأ» / «تابع», named with the lesson), then the latest-announcement line.
 * LMS wave 2, W2-2 (section 8.3, UX-34): once the learner marked one of its lessons, "Done: N of M <lessons>" (or
 * "All done: M <lessons>") in place of the count, and Continue (or Read again) in place of Start. No ring or
 * progress in a preview (UX-31). */
function subjectCard(t: Label, lang: Lang, space: SpaceView, card: LearnerCard, p?: CardProgress, ann?: CardAnnouncement): Html {
  const teacher = card.publisherName ? html`<p class="teacher by">${sentence(t, 'teacherLine', { publisher: t('publisher'), name: card.publisherName })}</p>` : '';
  // LMS wave 8 (L2, UX-90): when what is left waits for an opening date, the card says so as plain text, never as a link.
  const waiting = p ? (p.target ? null : p.waiting ?? null) : null;
  const go = waiting ? null : p?.target ?? card.first;
  const action = (kind: 'start' | 'continue' | 'read-again', lesson: { id: string; title: string }) => {
    const word = t(kind === 'start' ? 'cardStart' : kind === 'continue' ? 'cardContinue' : 'cardReadAgain');
    const name = t(kind === 'start' ? 'startLesson' : kind === 'continue' ? 'cardContinueName' : 'readAgain', { title: lesson.title });
    return html`<a class="button start go-card"${kind === 'start' ? '' : html` data-action="${kind}"`} href="${lessonHref(space, lesson.id)}" aria-label="${name}">${word}</a>`;
  };
  const progress = p ? html`<p class="count done-count" data-done="card">${doneLine(t, lang, p.done, card.count)}</p>` : html`<p class="count muted">${lessonCount(t, lang, card.count)}</p>`;
  const ringed = (done: number) => (space.preview ? '' : ring(done, card.count));
  const side = p && waiting
    ? html`${ringed(p.done)}${progress}${openNextLine(t, lang, waiting, undefined, 'wait')}`
    : p && go
    ? html`${ringed(p.done)}${progress}${action(p.target ? 'continue' : 'read-again', go)}`
    : p
    ? html`${ringed(p.done)}${progress}`
    : card.first
    ? html`${ringed(0)}${progress}${action('start', card.first)}`
    : card.next
    ? html`${progress}${openNextLine(t, lang, card.next, undefined, 'wait')}`
    : html`<p class="none muted">${t('noLessonsYet')}</p>`;
  const line = ann ? annLine(t, space, card.id, ann) : '';
  return html`<li class="card subj" data-subject="${card.id}" style="${subjStyle(card.id)}">
  <span class="band" aria-hidden="true"></span>
  <div class="body"><span class="sicon">${icon('book')}</span><h2 class="title"><a href="${subjectHref(space, card.id)}"><bdi>${card.title}</bdi></a></h2>
  ${teacher}</div>
  <div class="side">${side}</div>${line}
</li>`;
}

/** The announcement line of a card (UX-55 row, UX-99): bell icon, the text cut at 100 code points by the rule of the subject block, one link to the announcements of the subject page. */
function annLine(t: Label, space: SpaceView, subjectId: string, ann: CardAnnouncement): Html {
  const cut = cutText(ann.body);
  return html`
  <p class="ann" data-ann="${ann.id}">${icon('bell')}<span class="sr-only">${t('latestAnnouncement')}: </span><a href="${subjectHref(space, subjectId)}#announcements" dir="auto">${cut.text}${cut.cut ? '…' : ''}</a></p>`;
}

/** "Continue where you stopped" (LMS wave 2, W2-2, section 8, UX-34; LMS redesign R1a, UX-97): the hero on the
 * target subject's colour, after the greeting and the notice, before the due strip. First time (and in every
 * preview): how it works, no link; with a target: the subject · chapter kicker, the lesson, its progress and one
 * link to the lesson; waiting (L2, UX-90): what it waits for as plain text beside a calendar icon, no link;
 * everything started done: one line, no link. A plain link: opening it is a normal open. */
function continueArea(t: Label, lang: Lang, space: SpaceView, area: ContinueArea): Html {
  let inner: Html;
  let style = SCHOOL_AS_SUBJECT;
  const kick = (card: LearnerCard, chapterTitle: string) =>
    html`<p id="continue-subject" class="kick">${icon('book')}<span>${sentence(t, 'heroLesson', { subjectTitle: card.title, chapterTitle })}</span></p>`;
  if (area.kind === 'target') {
    style = subjStyle(area.card.id);
    inner = html`${kick(area.card, area.target.chapterTitle)}
<p class="hero-title"><bdi>${area.target.title}</bdi></p>
<p id="continue-progress" data-done="area">${doneLine(t, lang, area.done, area.card.count)}</p>
${ring(area.done, area.card.count, 62)}
<a id="continue-link" class="hero-btn" href="${lessonHref(space, area.target.id)}"><span>${sentence(t, 'continueLink', { title: area.target.title })}</span>${icon('chev', 'flip')}</a>`;
  } else if (area.kind === 'waiting') {
    // LMS wave 8 (L2, UX-90): the subject and its progress, then what it waits for, with no link.
    style = subjStyle(area.card.id);
    inner = html`<p id="continue-subject" class="kick">${icon('book')}<span><bdi>${area.card.title}</bdi></span></p>
<p id="continue-progress" data-done="area">${doneLine(t, lang, area.done, area.card.count)}</p>
${ring(area.done, area.card.count, 62)}
${openNextLine(t, lang, area.next, 'continue-state', 'hero-state')}`;
  } else if (area.kind === 'all-done') {
    inner = html`<p id="continue-state" class="hero-title hero-state" data-done="area">${icon('check')}<span>${t('everythingDone')}</span></p>`;
  } else {
    inner = html`<p id="continue-state" class="hero-state">${sentence(t, 'continueFirst', { lesson: t('lesson').toLocaleLowerCase(lang) })}</p>`;
  }
  return html`<section id="continue" class="hero" style="${style}" aria-labelledby="continue-heading">
<h2 id="continue-heading" class="sr-only">${t('continueHeading')}</h2>
${inner}
</section>`;
}

/** A learner’s home (LMS redesign R1a, P2, UX-34/UX-54/UX-62 rows, UX-97 to UX-99, UX-103, UX-105): the greeting,
 * the activity notice while lesson activity is on (R2-d, AT-15f: in full once, then folded), the "continue" hero,
 * the due-soon strip (the to-do list's first three items), then exactly the published subjects assigned to them
 * as cards, each with its latest announcement (no announcements block on the home). */
export function learnerHome(
  t: Label, lang: Lang, space: SpaceView, displayName: string, cards: LearnerCard[], notice: NoticeForm | null = null,
  where: { area: ContinueArea; progress: Map<string, CardProgress> } | null = { area: { kind: 'first' }, progress: new Map() },
  /** The latest announcement of each card's subject, by subject id. */
  latest: Map<string, CardAnnouncement> = new Map(),
  /** The request's UTC day (S4: the tags' today / tomorrow / yesterday). */
  today = '',
  /** LMS wave 6: the learner's to-do groups (null: no strip, for a person without the learner role). */
  groups: TodoGroup[] | null = null,
): Html {
  // The continue area (W2-2, section 8.1) is on every learner home and every
  // preview home, also with nothing assigned (the first-time state, AT-5.4);
  // `null` only for a signed-in person without the learner role.
  // The heading carries the kit's subject word, as before (release 1 AT-5.6;
  // contract section 10 keeps kit-word assertions unchanged).
  const list = html`<section class="home-cards">
<h2>${t('assignedToYou')} <span class="muted">· ${t('subject')}</span></h2>
${cards.length
    ? subjectList(t, lang, space, cards, where?.progress, latest)
    : html`<div id="nothing-yet" class="card empty"><span class="disc">${icon('books')}</span><h2>${t('nothingAssigned')}</h2><p>${t('emptyHomeLine')}</p></div>`}
</section>`;
  const body = html`<div class="home-grid">
<p id="greeting">${t('welcome', { name: displayName })}</p>
${notice ? activityNotice(t, notice, learnerUrl(space), Boolean(space.preview)) : ''}
${where ? html`${continueArea(t, lang, space, where.area)}
` : ''}${groups && cards.length ? dueStrip(t, lang, space, groups, today) : ''}${list}
</div>`;
  return spacePage(t, lang, space, space.name, body, { current: 'home', bar: true, mainClass: 'home' });
}

/** The cards of the home and of My subjects (the same markup on both). */
function subjectList(t: Label, lang: Lang, space: SpaceView, cards: LearnerCard[], progress: Map<string, CardProgress> | undefined, latest: Map<string, CardAnnouncement>): Html {
  return html`<ul id="my-list" class="cards">${cards.map((card) => subjectCard(t, lang, space, card, progress?.get(card.id), latest.get(card.id)))}</ul>`;
}

/** LMS redesign R1a (S9, UX-102): My subjects, the home's subject cards and nothing else. */
export function mySubjectsPage(t: Label, lang: Lang, space: SpaceView, cards: LearnerCard[], progress: Map<string, CardProgress>, latest: Map<string, CardAnnouncement>): Html {
  const body = html`<h1 class="page-title">${t('mySubjects')}</h1>
${cards.length
    ? subjectList(t, lang, space, cards, progress, latest)
    : html`<div id="nothing-yet" class="card empty"><span class="disc">${icon('books')}</span><h2>${t('nothingAssigned')}</h2><p>${t('emptyHomeLine')}</p></div>`}`;
  return spacePage(t, lang, space, t('mySubjects'), body, { current: 'mySubjects', bar: true, mainClass: 'home' });
}

// ------------------------------------------------------------ to-do list ----
// LMS wave 6, W6-1b (product-contract v2 on PIL-257, sections 5.3 and 5.5;
// ux-plan UX-62, UX-64): the learner's own to-do list. LMS redesign R1a
// (product-contract v2 on PIL-322, UX-34/UX-54/UX-62 rows, UX-98, UX-102): the
// home shows its first three items as the due-soon strip; the full block moved,
// unchanged in content, to /s/<space>/todo; every row carries its group's S6 tag
// (colour + icon + words). The CSS is in layout.ts.

/** How many items of a group show before its fold (section 5.3), and how many the home's strip shows. */
const TODO_SHOWN = 3;
const STRIP_SHOWN = 3;

/** A UTC day as the product shows it (S4): day and month name, the year when it is not this year; the ISO day stays in `datetime`. */
const dueDate = (iso: string, lang: Lang) => html`<bdi dir="${lang === 'ar' ? 'rtl' : 'ltr'}" class="due-date">${dateText(iso, lang)}</bdi>`;

/** "Due <date>" (dueOn), the outline's line (UX-63). */
const dueLine = (t: Label, lang: Lang, iso: string) => withMarkup(t, 'dueOn', { date: dueDate(iso, lang) });

const TODO_HEADING = { overdue: 'todoOverdue', today: 'todoToday', next: 'todoNext7' } as const;
const TODO_ICON = { overdue: 'alert', today: 'clock', next: 'cal' } as const;
const TODO_TAG = { overdue: 'late', today: 'today', next: 'due' } as const;

/** The S6 tag of a to-do item: words + icon + colour pair; the words alone say the state. */
function dueTag(t: Label, lang: Lang, group: TodoGroup['key'], iso: string, today: string): Html {
  const state = TODO_TAG[group];
  const day = html`<time datetime="${iso}">${dayLabel(iso, lang, today || iso)}</time>`;
  const words = state === 'late' ? withMarkup(t, 'tagLate', { date: day }) : state === 'today' ? t('tagToday') : withMarkup(t, 'tagDue', { date: day });
  return html`<span class="tag ${state}">${icon(TODO_ICON[group])}<span>${words}</span></span>`;
}

/** One item (UX-62, UX-102): the subject icon, the title link (a lesson to its page, a chapter to the outline with that chapter open), then its
 * line with the tag, and for a chapter wave 2's done count on wave 2's rule: drawn from the first mark on, so never with no marks and never in the preview. */
function todoItem(t: Label, lang: Lang, space: SpaceView, item: TodoItem, group: TodoGroup['key'], today: string): Html {
  const href = item.kind === 'lesson' ? lessonHref(space, item.id) : subjectHref(space, item.subjectId, item.id);
  const progress = item.progress && item.progress.done > 0 ? html`
<p class="todo-progress">${doneLine(t, lang, item.progress.done, item.progress.total)}</p>` : '';
  return html`<li class="todo-item" data-kind="${item.kind}" data-item="${item.id}" data-subject="${item.subjectId}" style="${subjStyle(item.subjectId)}"><span class="sicon">${icon('book')}</span><div class="todo-main"><a class="todo-link" href="${href}"><bdi>${item.title}</bdi></a>
<p class="todo-line">${t(item.kind)} · <bdi>${item.subjectTitle}</bdi> ${dueTag(t, lang, group, item.dueOn, today)}</p>${progress}</div></li>`;
}

/** One group (UX-62): its icon and heading with the full count, the first three items, then up to seven more in a closed native fold that ends with todoCapped when the group has more than it draws. */
function todoGroup(t: Label, lang: Lang, space: SpaceView, g: TodoGroup, today: string): Html {
  const heading = t(TODO_HEADING[g.key], { n: String(g.count), days: String(TODO_AHEAD_DAYS) });
  const shown = g.items.slice(0, TODO_SHOWN);
  const rest = g.items.slice(TODO_SHOWN);
  const capped = g.count > TODO_MAX_PER_GROUP
    ? html`
<p class="todo-capped">${t('todoCapped', { n: String(g.count - TODO_MAX_PER_GROUP), subject: t('subject').toLocaleLowerCase(lang) })}</p>`
    : '';
  const fold = rest.length
    ? html`
<details class="todo-more"><summary>${t('todoMore', { n: String(rest.length) })}</summary>
<ul class="todo-list">${rest.map((i) => todoItem(t, lang, space, i, g.key, today))}</ul>${capped}
</details>`
    : '';
  return html`<div class="todo-group" data-group="${g.key}">
<h3 id="todo-${g.key}">${icon(TODO_ICON[g.key])}<span>${heading}</span></h3>
<ul class="todo-list">${shown.map((i) => todoItem(t, lang, space, i, g.key, today))}</ul>${fold}
</div>`;
}

/** The to-do block (section 5.3, UX-62), now the to-do page's content; with nothing due, «لا شيء مطلوب الآن». */
export function todoBlock(t: Label, lang: Lang, space: SpaceView, groups: TodoGroup[], today = ''): Html {
  return html`<section id="todo" class="card todo-block" aria-labelledby="todo-heading">
<h1 id="todo-heading">${t('todoTitle')}</h1>
${groups.length ? groups.map((g) => todoGroup(t, lang, space, g, today)) : html`<p id="todo-none" class="strip-none">${t('nothingDue')}</p>`}
</section>
`;
}

/** LMS redesign R1a (S9, UX-102): the to-do page. */
export function todoPage(t: Label, lang: Lang, space: SpaceView, groups: TodoGroup[], today: string): Html {
  return spacePage(t, lang, space, t('todoTitle'), todoBlock(t, lang, space, groups, today), { current: 'todo', bar: true });
}

/** The home's due-soon strip (UX-98): the heading and "see all", then the first three items of the list (overdue, then today, then the
 * next days), each one link with the subject icon, title, subject name and tag; with nothing due, «لا شيء مطلوب الآن». In a preview,
 * "see all" keeps its text and place and leads nowhere (the to-do page is not previewable, S9). */
function dueStrip(t: Label, lang: Lang, space: SpaceView, groups: TodoGroup[], today: string): Html {
  const items = groups.flatMap((g) => g.items.map((item) => ({ item, group: g.key }))).slice(0, STRIP_SHOWN);
  const all = space.preview
    ? html`<a id="todo-all" tabindex="0"${INERT}>${t('seeAll')}${icon('chev', 'flip')}</a>`
    : html`<a id="todo-all" href="${learnerUrl(space, '/todo')}">${t('seeAll')}${icon('chev', 'flip')}</a>`;
  const row = ({ item, group }: (typeof items)[number]) => {
    const href = item.kind === 'lesson' ? lessonHref(space, item.id) : subjectHref(space, item.subjectId, item.id);
    return html`<li class="strip-row" data-group="${group}" data-kind="${item.kind}" data-item="${item.id}" data-subject="${item.subjectId}"><a class="row-link" href="${href}" style="${subjStyle(item.subjectId)}"><span class="sicon">${icon('book')}</span><span class="t"><bdi>${item.title}</bdi></span><span class="s"><bdi>${item.subjectTitle}</bdi>${dueTag(t, lang, group, item.dueOn, today)}</span></a></li>`;
  };
  return html`<section id="todo" class="strip" aria-labelledby="todo-heading">
<div class="sec-h"><h2 id="todo-heading">${t('dueSoonHeading')}</h2>${all}</div>
${items.length ? html`<ul class="strip-rows">${items.map(row)}</ul>` : html`<p id="todo-none" class="strip-none">${t('nothingDue')}</p>`}
</section>
`;
}

/** A tick (LMS wave 2, UX-28): a sign, never a control, with its words for screen readers; `data-done` marks it for the privacy scans. */
function tick(t: Label, kind: 'lesson' | 'chapter'): Html {
  return html`<span class="tick" data-done="${kind}"><span aria-hidden="true">✓</span><span class="sr-only">${t(kind === 'lesson' ? 'doneTag' : 'chapterAllDone')}</span></span>`;
}

/** One chapter as a native disclosure (section 6.1, UX-6): the summary holds the title, the count and a decorative marker.
 * LMS wave 2 (section 5): a lesson the learner marked done has a tick before its title, and a chapter whose lessons are all done a tick after its title. */
function chapterBlock(t: Label, lang: Lang, space: SpaceView, ch: OutlineChapter, open: boolean, done: Set<string>, lock?: LockReason): Html {
  const entries = ch.lessons;
  const rows = entries.map((l) => {
    // LMS wave 4 (section 5.4, UX-45): a locked chapter lists its lessons as plain text (no link, not focusable), each with the hidden tag.
    const link = lock
      ? html`<span class="lock-item" data-lesson="${l.id}"><span class="sr-only">${t('lockedTag')}</span><bdi>${l.title}</bdi></span>`
      : html`<a data-lesson="${l.id}" href="${lessonHref(space, l.id)}"><bdi>${l.title}</bdi></a>`;
    // LMS wave 6 (section 5.5, UX-63): a dated lesson's line after its title, for any date and also when locked; an undated row is today's.
    if (l.due_on) {
      const due = html`<span class="due-line">${dueLine(t, lang, l.due_on)}</span>`;
      return done.has(l.id) ? html`<li class="is-done due-dated">${tick(t, 'lesson')}${link}${due}</li>` : html`<li class="due-dated">${link}${due}</li>`;
    }
    return done.has(l.id) ? html`<li class="is-done">${tick(t, 'lesson')}${link}</li>` : html`<li>${link}</li>`;
  });
  const list = entries.length
    ? html`<ol class="list">${rows}</ol>`
    : html`<p class="none muted">${t('noLessonsYet')}</p>`;
  const allDone = entries.length > 0 && entries.every((l) => done.has(l.id)) ? html` ${tick(t, 'chapter')}` : '';
  // Inside the summary, so it shows while folded: the tag and the reason with its count. No control inside a summary.
  const lockLine = lock ? html`<span class="lock-line">${lockTag(t)} ${reasonSpans(t, lang, lock)}</span>` : '';
  return html`<details class="card fold${lock ? ' locked' : ''}" id="chapter-${ch.id}" data-chapter="${ch.id}"${lock ? html` data-locked` : ''}${open ? html` open` : ''}>
  <summary><span class="mark" aria-hidden="true"></span><span class="head"><span class="muted">${t('chapter')}</span> <bdi class="title">${ch.title}</bdi>${allDone}${ch.due_on ? html`<span class="due-line">${dueLine(t, lang, ch.due_on)}</span>` : ''}</span> <span class="count muted">${lessonCount(t, lang, ch.lessons.length)}</span>${lockLine}</summary>
  ${list}
</details>`;
}

// ------------------------------------------------------ chapters in order ----
// LMS wave 4, W4-1a (product-contract v2 on PIL-238, section 5.4; ux-plan
// UX-45 to UX-47). Drawn only for a person reading a subject in order as a
// learner (or a preview's made-up learner): with the setting off, or for
// anyone else, every page is exactly today's, style included.

/** The style of the order box, the tag, the reasons, the locked lessons, the locked page and the locked Next (UX-45 to UX-47, UX-50). */
const ORDER_CSS = `.order-box{display:flex;flex-direction:column;gap:8px;margin:8px 0 12px}
.order-box p{margin:0}
a.button.go-to{display:flex;align-items:center;justify-content:center;width:100%;min-height:48px;min-width:44px;box-sizing:border-box;text-align:center;background:var(--brand-strong);overflow-wrap:anywhere}
@media (min-width:700px){a.button.go-to{width:auto;align-self:flex-start;max-width:100%}}
.lock-tag{display:inline-flex;align-items:center;gap:6px;padding:2px 10px;border:1px solid #57606a;border-radius:999px;background:#f6f8fa;color:#24292f;font-weight:600;font-size:.9rem}
.lock-reason{color:#424a53;font-size:.9rem;font-weight:400;overflow-wrap:anywhere;min-width:0}
details.fold.locked>summary{flex-wrap:wrap}
details.fold .lock-line{flex:1 0 100%;display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;min-width:0}
details.fold .list .lock-item{display:flex;align-items:center;min-height:44px;color:#424a53;overflow-wrap:anywhere;min-width:0}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.locked-page{display:flex;flex-direction:column;gap:12px;margin:12px 0}
.locked-page>*{margin:0}
.locked-page .lock-tag{align-self:flex-start}
.next-locked{display:flex;flex-direction:column;gap:4px;padding:12px 0;border:0;background:none;color:#24292f;overflow-wrap:anywhere;min-width:0}
.next-locked .lock-tag{align-self:flex-start}
@media (min-width:700px){.pager>.next-locked{flex:1 1 0}}`;
const orderStyle = html`<style>${raw(ORDER_CSS)}</style>`;

/** The tag "Locked": text, with a decorative lock glyph. */
const lockTag = (t: Label) => html`<span class="lock-tag"><span aria-hidden="true">&#x1F512;</span><span>${t('lockedTag')}</span></span>`;

/** A product sentence whose values are ready markup (each already isolated). */
function withMarkup(t: Label, key: LabelKey, values: Record<string, Html | (Html | string)[]>): (Html | string | (Html | string)[])[] {
  const names = Object.keys(values);
  const markers = Object.fromEntries(names.map((n, i) => [n, `\u0001${i}\u0002`]));
  return t(key, markers).split(/\u0001(\d+)\u0002/).map((part, i) => (i % 2 === 1 ? values[names[Number(part)]] : part));
}

// ------------------------------------------------------- opening dates ----
// LMS wave 8, W8-1b (product-contract v2 on PIL-299, sections 3.3 and 3.5;
// ux-plan UX-88 to UX-91): a chapter not open yet by its date carries wave 4's
// tag and reason classes, with the date line first (openedOn) and wave 4's
// line after it when both apply (C4). Dates are drawn as wave 6's due dates.
// A page with no date reason carries none of this.

/** Each reason on its own line in the outline's summary and on the locked page. */
const DATE_CSS = `details.fold .lock-line .lock-reason[data-reason=date]{flex:1 0 100%}
#lock-reason>.lock-reason{display:block}
#lock-reason>.lock-reason+.lock-reason{margin-top:4px}
.open-next{margin:0;overflow-wrap:anywhere}
.open-next .due-date,.lock-reason[data-reason=date] .due-date{white-space:nowrap}`;
const dateStyle = html`<style>${raw(DATE_CSS)}</style>`;

/** Whether a reason carries an opening date. */
const dateOf = (r: LockReason): string | null => (r.kind === 'date' ? r.opensOn : r.opensOn ?? null);

/** A reason in wave 4's markup: by order alone, exactly wave 4's span; with a date, the date line first, then wave 4's line if it applies (C4). */
function reasonSpans(t: Label, lang: Lang, r: LockReason): Html {
  const date = dateOf(r);
  const order = r.kind === 'date' ? null : html`<span class="lock-reason">${lockReasonText(t, lang, r)}</span>`;
  if (!date) return order!;
  return html`<span class="lock-reason" data-reason="date">${withMarkup(t, 'openedOn', { date: dueDate(date, lang) })}</span>${order ? html` ${order}` : ''}`;
}

/** "Next: <chapter>: <title>, opens on <date>." (openNext, L2, UX-90): plain text, never a link. */
function openNextLine(t: Label, lang: Lang, next: WaitingFor, id?: string, cls?: string): Html {
  // LMS redesign R1a (UX-97, UX-90): beside a calendar icon, still plain text.
  return html`${dateStyle}<p${id ? html` id="${id}"` : ''} class="open-next${cls ? ` ${cls}` : ''}">${icon('cal')}<span>${withMarkup(t, 'openNext', { title: html`<bdi>${next.title}</bdi>`, date: dueDate(next.date, lang) })}</span></p>`;
}

/** A chapter's reason (section 5.4): the first locked chapter names the blocking chapter, every later one says "everything before it"; each with the count left. */
function lockReasonText(t: Label, lang: Lang, r: Exclude<LockReason, { kind: 'date' }>): (Html | string | (Html | string)[])[] {
  const count = r.left === 1
    ? sentence(t, 'lockedCountOne', { lesson: t('lesson').toLocaleLowerCase(lang) })
    : sentence(t, 'lockedCount', { n: String(r.left) });
  return r.kind === 'first'
    ? withMarkup(t, 'lockedReason', { title: html`<bdi>${r.blocking.title}</bdi>`, count: [...count] })
    : withMarkup(t, 'lockedLater', { count: [...count] });
}

/** "Go to: <title>": the one lesson to do now, a button-styled link (UX-45, UX-46). */
const goToLink = (t: Label, space: SpaceView, target: { id: string; title: string }) =>
  html`<a id="go-to" class="button go-to" href="${lessonHref(space, target.id)}"><span>${sentence(t, 'goTo', { title: target.title })}</span></a>`;

/** The order box under the title (section 5.4, UX-45), outside the folds: the order line and, while any chapter is locked, "Go to". */
function orderBox(t: Label, lang: Lang, space: SpaceView, locks: ChapterLocks): Html {
  const line = t('orderLine', { chapter: t('chapter').toLocaleLowerCase(lang), lesson: t('lesson').toLocaleLowerCase(lang) });
  return html`
<section id="order-box" class="order-box">${orderStyle}<p id="order-line">${line}</p>${locks.goTo ? goToLink(t, space, locks.goTo) : ''}</section>`;
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
  locks: ChapterLocks | null = null,
  announcements: Html | string = '',
  /** LMS wave 7 (section 5.1, UX-72): the quiz section, after the announcements and before the outline; '' draws today's page. */
  quizzes: Html | string = '',
): Html {
  const opened = openChapters(parts, open);
  const ids = parts.flatMap((ch) => ch.lessons.map((l) => l.id));
  const done = new Set(ids.filter((id) => marks.has(id)));
  // LMS wave 4: `locks` only for a subject in order read as a learner (or a preview's made-up learner); null draws today's outline.
  const blocks = parts.length ? parts.map((ch) => chapterBlock(t, lang, space, ch, opened.has(ch.id), done, locks?.locked.get(ch.id))) : html`<p class="card muted">${t('nothingHere')}</p>`;
  const fold = parts.length > 3
    ? html`<p id="fold-all" class="fold-all"><a id="expand-all" class="button plain" href="${learnerUrl(space, `/learn/${head.id}?open=all`)}">${t('expandAll')}</a><a id="collapse-all" class="button plain" href="${learnerUrl(space, `/learn/${head.id}?open=none`)}">${t('collapseAll')}</a></p>`
    : '';
  // LMS wave 8: the order box only where the order rule applies (dates alone lock no order); the date style only with a date reason.
  const dated = locks && [...locks.locked.values()].some((r) => dateOf(r)) ? dateStyle : '';
  const body = html`<p class="muted">${t('subject')}</p>
<h1 id="subject-title" dir="auto">${head.title}</h1>${progressLine(t, lang, done.size, ids.length)}${locks?.inOrder ? orderBox(t, lang, space, locks) : ''}${dated}${announcements}${quizzes}
${fold}
<div id="outline">${blocks}</div>`;
  return spacePage(t, lang, space, head.title, body, { bar: true });
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
function lessonNav(t: Label, lang: Lang, space: SpaceView, subject: { id: string; title: string }, lesson: LessonRow, place: LessonPlace, locks: ChapterLocks | null = null): Html {
  const next = place.steps[place.index + 1];
  // LMS wave 4 (section 5.4, UX-47): when Next leads into a locked chapter, a plain block in its place (not a link, not focusable).
  const nextLock = next && locks?.locked.get(next.chapterId);
  const previous = place.steps[place.index - 1];
  const forward = lang === 'ar' ? '←' : '→';
  const backward = lang === 'ar' ? '→' : '←';
  const outline = html`<a id="back-to-outline" class="go back" href="${subjectHref(space, subject.id, lesson.chapter_id)}">${t('backToOutline')}</a>`;
  // When Next crosses into another chapter, that chapter goes on a second line of the same link.
  const crossing = next && next.chapterId !== lesson.chapter_id ? html`<span class="line2">${sentence(t, 'chapterLine', { title: next.chapterTitle })}</span>` : '';
  const nextLink = nextLock
    ? html`<div id="next-locked" class="next-locked">${orderStyle}<span class="line1">${sentence(t, 'nextLesson', { title: next.title })}</span>${lockTag(t)}${reasonSpans(t, lang, nextLock)}</div>`
    : next
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
  | { kind: 'learner'; done: boolean; status: 'done' | 'not-done' | 'failed' | null; change?: OpenChange | null }
  | { kind: 'inert' };

/** LMS wave 4, W4-1b (section 5.4): what a press changed in a subject in order,
 * shown after wave 2's sentence only when it changed what is open: the first
 * chapter a mark opened, or the lesson's own chapter after an undo locked what follows. */
export type OpenChange = { kind: 'opened' | 'relocked'; title: string };

const CHANGE_KEY = { opened: 'markedOpened', relocked: 'markedRelocked' } as const;

const STATUS_KEY = { done: 'markedDone', 'not-done': 'markedNotDone', failed: 'markFailed' } as const;

/** The block's and the "Done" tag's style, drawn with the block (as the
 * preview banner does), so pages without a done block carry none of it. */
const DONE_CSS = `.done-block{display:flex;flex-direction:column;gap:12px;margin:24px 0 0;border-radius:12px}
.done-block:focus{outline:3px solid #1b1f24;outline-offset:4px}
.done-block>*{margin:0}
.done-block form{display:flex}
.done-block button{flex:1 1 auto;display:flex;align-items:center;justify-content:center;min-height:48px;min-width:44px;background:var(--brand-strong);font-size:1.05rem}
.done-block button.undo{min-height:44px;background:#fff;color:var(--brand-strong);border:2px solid var(--brand-strong);font-size:1rem}
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
    ? html`<p id="done-status" class="${d.status === 'failed' ? 'error' : 'done'}" role="status">${t(STATUS_KEY[d.status])}${d.change ? html` <span id="open-change" data-change="${d.change.kind}">${sentence(t, CHANGE_KEY[d.change.kind], { title: d.change.title })}</span>` : ''}</p>`
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
  v: { subject: { id: string; title: string }; lesson: LessonRow; materials: MaterialRow[]; place: LessonPlace; notice?: NoticeForm | null; done?: DoneBlock | null; locks?: ChapterLocks | null },
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
${lessonNav(t, lang, space, top, v.lesson, v.place, v.locks)}`;
  return spacePage(t, lang, space, title, body, { bar: true });
}

/** A locked lesson opened by its address (LMS wave 4, section 5.4, UX-46): in
 * DOM order the trail, the title, the tag, the reason of the lesson's own
 * chapter (exactly as on the outline), "Go to" and "Back to the outline"
 * (which opens the blocking chapter). Nothing of the lesson's content: no
 * intro, materials, done block, Next or Previous. Nothing is recorded. */
export function lockedLessonPage(
  t: Label,
  lang: Lang,
  space: SpaceView,
  v: { subject: { id: string; title: string }; lesson: LessonRow; reason: LockReason; locks: ChapterLocks },
): Html {
  const top = { id: v.subject.id, title: v.subject.title };
  const back = subjectHref(space, top.id, v.locks.blocking ?? v.lesson.chapter_id);
  // LMS wave 8 (UX-89, J2.3): not open yet by its date: the title, the tag, the date line (then wave 4's line), and
  // "Back to <subject>" as the first focusable item after the heading, then "Go to" when the order rule offers one.
  if (dateOf(v.reason)) {
    const toSubject = subjectHref(space, top.id, v.lesson.chapter_id);
    const dated = html`<nav id="trail" class="trail muted">
  <span>${t('subject')}: <a href="${subjectHref(space, top.id, v.lesson.chapter_id)}"><bdi>${top.title}</bdi></a></span> ·
  <span>${t('chapter')}: <bdi>${v.lesson.chapter_title}</bdi></span> ·
  <span>${t('lesson')}</span>
</nav>
<section id="locked-lesson" class="locked-page" data-locked>${orderStyle}${dateStyle}
<h1 id="lesson-title" dir="auto">${v.lesson.title}</h1>
<p id="lock-tag">${lockTag(t)}</p>
<p id="lock-reason" class="lock-reason">${reasonSpans(t, lang, v.reason)}</p>
<p><a id="back-to-subject" class="go back" href="${toSubject}"><span>${withMarkup(t, 'quizBackToSubject', { subjectTitle: html`<bdi>${top.title}</bdi>` })}</span></a></p>
${v.locks.goTo ? html`<p>${goToLink(t, space, v.locks.goTo)}</p>` : ''}
</section>`;
    return spacePage(t, lang, space, v.lesson.title, dated, { bar: true });
  }
  const body = html`<nav id="trail" class="trail muted">
  <span>${t('subject')}: <a href="${subjectHref(space, top.id, v.lesson.chapter_id)}"><bdi>${top.title}</bdi></a></span> ·
  <span>${t('chapter')}: <bdi>${v.lesson.chapter_title}</bdi></span> ·
  <span>${t('lesson')}</span>
</nav>
<section id="locked-lesson" class="locked-page" data-locked>${orderStyle}
<h1 id="lesson-title" dir="auto">${v.lesson.title}</h1>
<p id="lock-tag">${lockTag(t)}</p>
<p id="lock-reason" class="lock-reason">${lockReasonText(t, lang, v.reason as Exclude<LockReason, { kind: 'date' }>)}</p>
${v.locks.goTo ? html`<p>${goToLink(t, space, v.locks.goTo)}</p>` : ''}
<p><a id="back-to-outline" class="go back" href="${back}">${t('backToOutline')}</a></p>
</section>`;
  return spacePage(t, lang, space, v.lesson.title, body, { bar: true });
}
