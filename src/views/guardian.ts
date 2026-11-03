// The guardian's pages (release 2, R2-a; wireframe-guardian-home on PIL-120):
// the guardian home, with one card per linked learner, and one learner's page.
// Read-only: each card shows the learner's name and their assigned subject
// titles, each with its publisher's name. No lesson, material, file, link,
// lesson date or other learner is ever on these pages (AT-9d, AT-13a); from
// R2-c the learner's page also shows that learner's published results. Addresses use
// the neutral word "linked" so that no address names a concept. Every word
// comes from the label function and the space's kit.
import { html } from 'hono/html';
import type { OwnResult } from '../exams.ts';
import type { GuardianSubject, LinkedLearner } from '../guardians.ts';
import type { Label, Lang } from '../labels.ts';
import { resultCard } from './exams.ts';
import { sentence, type Html } from './layout.ts';
import { spacePage } from './learn.ts';
import type { SpaceView } from './space.ts';

export interface LearnerCard {
  learner: LinkedLearner;
  subjects: GuardianSubject[];
}

const home = (space: SpaceView) => `/s/${space.id}/linked`;

function itemList(t: Label, items: GuardianSubject[]): Html {
  if (!items.length) return html`<p class="muted">${t('nothingAssigned')}</p>`;
  return html`<ul class="list" data-assigned>${items.map(
    (s) => html`<li><bdi class="title">${s.title}</bdi> <span class="muted">· ${t('publisher')}: ${s.publisher_name ? html`<bdi>${s.publisher_name}</bdi>` : t('noOne')}</span></li>`,
  )}</ul>`;
}

function card(t: Label, space: SpaceView, c: LearnerCard, heading: 'link' | 'plain'): Html {
  const name = heading === 'link'
    ? html`<a class="learner" href="${home(space)}/${c.learner.id}"><bdi>${c.learner.display_name}</bdi></a>`
    : html`<bdi>${c.learner.display_name}</bdi>`;
  return html`<section class="card" data-learner="${c.learner.id}">
  <h2 class="learner-name">${name}</h2>
  <h3 class="muted">${t('subject')}</h3>
  ${itemList(t, c.subjects)}
</section>`;
}

/** The guardian home: every learner linked to this guardian, each with their assigned subjects. */
export function guardianHome(t: Label, lang: Lang, space: SpaceView, displayName: string, cards: LearnerCard[]): Html {
  const body = html`<p>${t('welcome', { name: displayName })}</p>
<h1 id="guardian-title">${t('guardianHome')}</h1>
<p class="muted" id="guardian-note">${t('guardianNote')}</p>
<div id="linked">${cards.length ? cards.map((c) => card(t, space, c, 'link')) : html`<p id="none-linked" class="card message">${t('guardianNone')}</p>`}</div>`;
  return spacePage(t, lang, space, t('guardianHome'), body);
}

/** One linked learner's page: the same card, the learner's published results
 * (R2-c, AT-11d), headed with the learner's name, and the way back to the
 * guardian home. A result shows its exam, subject, date, "mark / maximum" or
 * Absent, and "Corrected on <date>" once corrected: never a previous value, a
 * reason, a draft or a result id. */
export function guardianLearnerPage(t: Label, lang: Lang, space: SpaceView, c: LearnerCard, results: OwnResult[]): Html {
  const body = html`<p><a id="back" href="${home(space)}">${t('guardianHome')}</a></p>
<div id="linked">${card(t, space, c, 'plain')}</div>
<section id="results" class="card" data-learner="${c.learner.id}">
  <h2 id="results-title">${sentence(t, 'resultsOf', { name: c.learner.display_name })}</h2>
  ${results.length
    ? html`<ol class="items">${results.map((r) => resultCard(t, space, r, 'guardian'))}</ol>`
    : html`<p id="results-none" class="message">${t('resultsNone')}</p>`}
</section>`;
  return spacePage(t, lang, space, c.learner.display_name, body);
}
