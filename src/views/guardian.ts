// The guardian's pages (release 2, R2-a; wireframe-guardian-home on PIL-120):
// the guardian home, with one card per linked learner, and one learner's page.
// Read-only: each card shows the learner's name and their assigned subject
// titles, each with its publisher's name. No lesson, material, file, link,
// lesson date or other learner is ever on these pages (AT-9d, AT-13a); from
// R2-c the learner's page also shows that learner's published results; from
// R2-d these pages lead to the lesson-activity page (src/views/activity.ts),
// the only guardian page with lesson titles and open dates. Addresses use
// the neutral word "linked" so that no address names a concept. Every word
// comes from the label function and the space's kit.
import { html } from 'hono/html';
import { TODO_AHEAD_DAYS, TODO_MAX_PER_GROUP, type TodoGroup, type TodoItem } from '../due.ts';
import type { OwnResult } from '../exams.ts';
import type { GuardianSubject, LinkedLearner } from '../guardians.ts';
import type { Label, Lang } from '../labels.ts';
import { GUARDIAN_QUIZ_DRAWN, GUARDIAN_QUIZ_SHOWN, type GuardianQuizRow } from '../quiz.ts';
import { activityLink, activityOff } from './activity.ts';
import { resultCard, scoreText } from './exams.ts';
import { marked, sentence, type Html } from './layout.ts';
import { spacePage } from './learn.ts';
import type { SpaceView } from './space.ts';

export interface LearnerCard {
  learner: LinkedLearner;
  subjects: GuardianSubject[];
}

/** A card of the guardian home (LMS wave 1, L2, section 8.1): also the learner's
 * first result row, and while activity is on the newest row of their activity
 * page (null for "No open recorded"). */
export interface GlanceCard extends LearnerCard {
  latest: OwnResult | null;
  lastOpened?: { title: string; date: string } | null;
}

const home = (space: SpaceView) => `/s/${space.id}/linked`;

// ------------------------------------------------------- the to-do list ----
// LMS wave 6, W6-1c (product-contract v3 addendum on PIL-265, G4; ux-plan
// UX-80): on the linked learner's page, after the learner card and before the
// results, only while lesson activity is on, that learner's own to-do groups
// (the learner's statement, worked out at this page load), read-only. Drawn
// apart from the learner's block, so that one stays byte for byte (AT-7.4):
// plain text only (no link, no done count, no other date), and only the
// elements and attributes of AT-7.2's allow-list. The classes are the
// learner block's and the due pages' (no new style).

/** How many items of a group show before its fold (the learner's block: 3). */
const TODO_SHOWN = 3;
const TODO_HEADING = { overdue: 'todoOverdue', today: 'todoToday', next: 'todoNext7' } as const;

/** One item: the title as plain text, then todoItemLine with its date in Latin digits, left to right. */
function guardianTodoItem(t: Label, item: TodoItem): Html {
  const line = marked(t, 'todoItemLine', {
    kind: html`${t(item.kind)}`, subjectTitle: html`<bdi>${item.subjectTitle}</bdi>`, date: html`<bdi dir="ltr" class="due-date">${item.dueOn}</bdi>`,
  });
  return html`<li class="todo-item"><span class="due-title"><bdi>${item.title}</bdi></span>
<p class="todo-line">${line}</p></li>`;
}

/** One group: the heading with the full count, 3 items, then up to 7 in a closed native fold that ends with guardianTodoCapped past 10. */
function guardianTodoGroup(t: Label, g: TodoGroup): Html {
  const shown = g.items.slice(0, TODO_SHOWN);
  const rest = g.items.slice(TODO_SHOWN);
  const capped = g.count > TODO_MAX_PER_GROUP ? html`
<p class="todo-capped">${t('guardianTodoCapped', { n: String(g.count - TODO_MAX_PER_GROUP) })}</p>` : '';
  const fold = rest.length ? html`
<details class="todo-more"><summary>${t('todoMore', { n: String(rest.length) })}</summary>
<ul class="todo-list">${rest.map((i) => guardianTodoItem(t, i))}</ul>${capped}
</details>` : '';
  return html`<section class="todo-group" id="guardian-todo-${g.key}">
<h3>${t(TODO_HEADING[g.key], { n: String(g.count), days: String(TODO_AHEAD_DAYS) })}</h3>
<ul class="todo-list">${shown.map((i) => guardianTodoItem(t, i))}</ul>${fold}
</section>`;
}

/** The block, or nothing at all when no group has an item (the page is then W6-1b-main's). */
function guardianTodo(t: Label, learner: LinkedLearner, groups: TodoGroup[]): Html | string {
  if (!groups.length) return '';
  // No white space around it: the page differs from W6-1b-main's by this element only (AT-7.4).
  return html`<section id="guardian-todo" class="card todo-block">
<h2 id="guardian-todo-heading">${sentence(t, 'guardianTodoTitle', { name: learner.display_name })}</h2>
<p class="muted">${t('guardianTodoNote')}</p>
${groups.map((g) => guardianTodoGroup(t, g))}
</section>`;
}

// ------------------------------------------------------ the quiz scores ----
// LMS wave 7, W7-3 (product-contract v3 addendum on PIL-285, G4; ux-plan
// UX-83): on the linked learner's page, right after the results and whatever
// the lesson activity setting, that learner's quiz titles and scores, read-only:
// 5 items, up to 20 more in a closed native fold, the capped line past 25. No
// link, date, question, answer or verdict. No listed quiz: nothing at all.

/** The block's input: the drawn items (at most GUARDIAN_QUIZ_DRAWN) and the full count. */
export interface GuardianQuizzes { rows: GuardianQuizRow[]; count: number }

function guardianQuizItem(t: Label, r: GuardianQuizRow): Html {
  return html`<li><bdi>${r.title}</bdi> <span class="muted quiz-guardian-line">${sentence(t, 'guardianQuizLine', { subjectTitle: r.subject_title, score: String(r.score), total: String(r.total) })}</span></li>`;
}

function guardianQuizzes(t: Label, learner: LinkedLearner, q: GuardianQuizzes): Html | string {
  if (!q.rows.length) return '';
  const shown = q.rows.slice(0, GUARDIAN_QUIZ_SHOWN);
  const rest = q.rows.slice(GUARDIAN_QUIZ_SHOWN);
  const capped = q.count > GUARDIAN_QUIZ_DRAWN ? html`
<p class="quiz-guardian-capped">${sentence(t, 'guardianQuizCapped', { n: String(q.count - GUARDIAN_QUIZ_DRAWN) })}</p>` : '';
  const fold = rest.length ? html`
<details class="quiz-guardian-more"><summary>${sentence(t, 'guardianQuizMore', { n: String(rest.length) })}</summary>
<ul class="quiz-guardian-list">${rest.map((r) => guardianQuizItem(t, r))}</ul>${capped}
</details>` : '';
  // No white space around it: the page differs from W7-2-main's by this element only (AT-8.4).
  return html`<section id="quiz-guardian" class="card">
<h2 id="quiz-guardian-title">${sentence(t, 'guardianQuizTitle', { name: learner.display_name })}</h2>
<p class="muted">${t('guardianQuizNote')}</p>
<ul class="quiz-guardian-list">${shown.map((r) => guardianQuizItem(t, r))}</ul>${fold}
</section>`;
}

function itemList(t: Label, items: GuardianSubject[]): Html {
  if (!items.length) return html`<p class="muted">${t('nothingAssigned')}</p>`;
  return html`<ul class="list" data-assigned>${items.map(
    (s) => html`<li><bdi class="title">${s.title}</bdi> <span class="muted">· ${t('publisher')}: ${s.publisher_name ? html`<bdi>${s.publisher_name}</bdi>` : t('noOne')}</span></li>`,
  )}</ul>`;
}

function card(t: Label, space: SpaceView, c: LearnerCard, heading: 'link' | 'plain', activity = false): Html {
  const name = heading === 'link'
    ? html`<a class="learner" href="${home(space)}/${c.learner.id}"><bdi>${c.learner.display_name}</bdi></a>`
    : html`<bdi>${c.learner.display_name}</bdi>`;
  return html`<section class="card" data-learner="${c.learner.id}">
  <h2 class="learner-name">${name}</h2>
  <h3 class="muted">${t('subject')}</h3>
  ${itemList(t, c.subjects)}
  ${activity ? activityLink(t, space, c.learner.id) : ''}
</section>`;
}

/** "Latest result": exactly the first result row of the learner page (the same
 * exam, subject, date, "mark / maximum" or Absent, and Corrected once
 * corrected), the whole line one link to that page; "No results yet." when
 * there is none. The date and the mark keep the learner page's own markup. */
function latestLine(t: Label, space: SpaceView, c: GlanceCard): Html {
  const href = `${home(space)}/${c.learner.id}`;
  const r = c.latest;
  if (!r) return html`<a class="latest-result none" href="${href}">${t('resultsNone')}</a>`;
  const line = marked(t, 'latestResultLine', {
    exam: html`<bdi class="exam">${r.exam_title}</bdi>`,
    subject: html`<bdi class="subject">${r.subject_title}</bdi>`,
    date: html`<span class="muted date" dir="ltr">${r.exam_date}</span>`,
    score: html`<span class="score" dir="auto">${scoreText(t, r)}</span>`,
  });
  return html`<a class="latest-result" href="${href}">${line}${r.corrected_at === null ? '' : html` <span class="tag">${t('correctedTag')}</span>`}</a>`;
}

/** While activity is on: "Last opened: <lesson> · <date>" (the activity page's newest row) or "No open recorded", beside the link to that page. */
function lastOpenedLine(t: Label, space: SpaceView, c: GlanceCard): Html {
  const shown = c.lastOpened
    ? sentence(t, 'lastOpenedLine', { title: c.lastOpened.title, date: c.lastOpened.date })
    : t('lastOpenedNone');
  return html`<div class="activity-row"><p class="last-opened" data-activity>${shown}</p>${activityLink(t, space, c.learner.id)}</div>`;
}

function glanceCard(t: Label, space: SpaceView, c: GlanceCard, activity: boolean): Html {
  return html`<section class="card" data-learner="${c.learner.id}">
  <h2 class="learner-name"><a class="learner" href="${home(space)}/${c.learner.id}"><bdi>${c.learner.display_name}</bdi></a></h2>
  ${latestLine(t, space, c)}
  ${activity ? lastOpenedLine(t, space, c) : ''}
  <h3 class="muted">${t('subject')}</h3>
  ${itemList(t, c.subjects)}
</section>`;
}

/** The guardian home: every learner linked to this guardian, each with their
 * latest published result (LMS wave 1, L2), while lesson activity is on their
 * last opened lesson and the way to their lesson-activity page (R2-d), then
 * their assigned subjects. */
export function guardianHome(t: Label, lang: Lang, space: SpaceView, displayName: string, cards: GlanceCard[], activity = false): Html {
  const body = html`<p>${t('welcome', { name: displayName })}</p>
<h1 id="guardian-title">${t('guardianHome')}</h1>
<p class="muted" id="guardian-note">${t('guardianNote')}</p>
<div id="linked">${cards.length ? cards.map((c) => glanceCard(t, space, c, activity)) : html`<p id="none-linked" class="card message">${t('guardianNone')}</p>`}</div>`;
  return spacePage(t, lang, space, t('guardianHome'), body);
}

/** One linked learner's page: the same card, the learner's published results
 * (R2-c, AT-11d), headed with the learner's name, and the way back to the
 * guardian home. A result shows its exam, subject, date, "mark / maximum" or
 * Absent, and "Corrected on <date>" once corrected: never a previous value, a
 * reason, a draft or a result id. From R2-d the card leads to the learner's
 * lesson-activity page while it is on; while off, the page says it is not
 * switched on (AT-15a) and nothing else about lessons. */
export function guardianLearnerPage(t: Label, lang: Lang, space: SpaceView, c: LearnerCard, results: OwnResult[], activity = false, todo: TodoGroup[] = [], quizzes: GuardianQuizzes = { rows: [], count: 0 }): Html {
  const body = html`<p><a id="back" href="${home(space)}">${t('guardianHome')}</a></p>
<div id="linked">${card(t, space, c, 'plain', activity)}</div>
${activity ? '' : activityOff(t, space)}${activity ? guardianTodo(t, c.learner, todo) : ''}
<section id="results" class="card" data-learner="${c.learner.id}">
  <h2 id="results-title">${sentence(t, 'resultsOf', { name: c.learner.display_name })}</h2>
  ${results.length
    ? html`<ol class="items">${results.map((r) => resultCard(t, space, r, 'guardian'))}</ol>`
    : html`<p id="results-none" class="message">${t('resultsNone')}</p>`}
</section>${guardianQuizzes(t, c.learner, quizzes)}`;
  return spacePage(t, lang, space, c.learner.display_name, body);
}
