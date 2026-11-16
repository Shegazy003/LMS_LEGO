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
import type { OwnResult } from '../exams.ts';
import type { GuardianSubject, LinkedLearner } from '../guardians.ts';
import type { Label, Lang } from '../labels.ts';
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
export function guardianLearnerPage(t: Label, lang: Lang, space: SpaceView, c: LearnerCard, results: OwnResult[], activity = false): Html {
  const body = html`<p><a id="back" href="${home(space)}">${t('guardianHome')}</a></p>
<div id="linked">${card(t, space, c, 'plain', activity)}</div>
${activity ? '' : activityOff(t, space)}
<section id="results" class="card" data-learner="${c.learner.id}">
  <h2 id="results-title">${sentence(t, 'resultsOf', { name: c.learner.display_name })}</h2>
  ${results.length
    ? html`<ol class="items">${results.map((r) => resultCard(t, space, r, 'guardian'))}</ol>`
    : html`<p id="results-none" class="message">${t('resultsNone')}</p>`}
</section>`;
  return spacePage(t, lang, space, c.learner.display_name, body);
}
