// Lesson activity pages (release 2, R2-d; contract product-contract-r2, AT-15;
// wireframes wireframe-admin-lesson-activity, wireframe-guardian-activity and
// wireframe-guardian-activity-ar on PIL-120, read with the contract’s v6
// retention: no automatic disposal).
//
// These, and the pieces below, are the only places a lesson-activity phrase or
// an open date is shown (the exempt places of section 3): the admin’s switch
// page, the guardian’s lesson-activity page in every state (also the "not
// switched on" line on the guardian’s learner page), the learner’s notice
// line, and the links that lead to the first two. Each piece outside those
// pages carries data-activity, so the privacy scan (test/at13) can tell it
// from the page around it. Every word comes from the label function and the
// space’s kit.
import { html, raw } from 'hono/html';
import type { ActivityLesson, ActivitySubject } from '../activity.ts';
import type { NoticeForm } from '../notice.ts';
import type { LinkedLearner } from '../guardians.ts';
import type { Label, Lang } from '../labels.ts';
import { datedSentence, errorBox, sentence, type Html } from './layout.ts';
import { spacePage } from './learn.ts';
import type { SpaceView } from './space.ts';

const adminPath = (space: SpaceView) => `/s/${space.id}/admin/activity`;
export const activityPath = (space: SpaceView, learnerId: string) => `/s/${space.id}/linked/${learnerId}/activity`;

// Got it folds the card in place: the sentence and the detail move into the
// folded line’s disclosure, and focus goes to its summary. Without script the
// button reloads the same page, which then shows the folded line (the cookie
// was set with the card).
const FOLD_SCRIPT = `(function(){var f=document.getElementById('notice-fold');if(!f)return;f.addEventListener('submit',function(e){e.preventDefault();
var card=document.getElementById('notice-card'),s=document.getElementById('activity-notice'),d=document.getElementById('activity-detail'),b=document.getElementById('notice-got-it');
var line=document.createElement('div');line.id='notice-line';line.className='notice-line';var more=document.createElement('details');more.id='notice-more';
var sum=document.createElement('summary');sum.textContent=b.getAttribute('data-what');more.appendChild(sum);more.appendChild(d);line.appendChild(s);line.appendChild(more);
card.replaceWith(line);sum.focus();});})();`;

/** The learner’s notice (AT-15f; wave 1, section 7) while the setting is on: the
 * full card the first time ("Got it" folds it), then the folded line. Both
 * hold the one activityNotice sentence (id activity-notice, data-activity, as
 * the privacy scans read it) and the detail of what is recorded. `here` is the
 * page’s own address, for Got it without script. */
export function activityNotice(t: Label, form: NoticeForm, here: string, inert = false): Html {
  const sentence = html`<p id="activity-notice" data-activity>${t('activityNotice')}</p>`;
  const detail = html`<p id="activity-detail" data-activity>${t('activityDetail')}</p>`;
  if (form === 'folded') {
    return html`<div id="notice-line" class="notice-line">${sentence}<details id="notice-more"><summary>${t('activityWhatTitle')}</summary>${detail}</details></div>`;
  }
  // LMS wave 3a (section 6.3): in the admin's preview, Got it keeps its text and
  // place, is not a form and does nothing (the script finds no form to fold).
  const fold = inert
    ? html`<div id="notice-fold"><button type="button" id="notice-got-it" data-what="${t('activityWhatTitle')}" aria-disabled="true" aria-describedby="preview-reason">${t('activityGotIt')}</button></div>`
    : html`<form id="notice-fold" method="get" action="${here}"><button type="submit" id="notice-got-it" data-what="${t('activityWhatTitle')}">${t('activityGotIt')}</button></form>`;
  return html`<div id="notice-card" class="card notice-card">${sentence}${detail}
${fold}
<script>${raw(FOLD_SCRIPT)}</script></div>`;
}

/** The guardian’s learner page while the setting is off (AT-15a). */
export function activityOff(t: Label, space: SpaceView): Html {
  return html`<p id="activity-off" class="card message" data-activity>${sentence(t, 'activityOff', { name: space.name })}</p>`;
}

/** The way to a learner’s lesson-activity page, shown only while the setting is on. */
export function activityLink(t: Label, space: SpaceView, learnerId: string): Html {
  return html`<p data-activity><a class="activity-link" href="${activityPath(space, learnerId)}">${t('lessonActivity')}</a></p>`;
}

/** The way to the admin’s switch page, on the admin home. */
export function adminActivityLink(t: Label, space: SpaceView): Html {
  return html`<p data-activity><a id="admin-activity" class="button plain" href="${adminPath(space)}">${t('lessonActivity')}</a></p>`;
}

export interface AdminActivityView {
  enabled: boolean;
  since: string | null;
  error?: string;
  done?: 'on' | 'off';
}

/** The admin’s switch page (AT-15b): what is recorded, who sees it, how long it
 * is kept, the learner’s notice, and the switch with its required tick; while
 * on, the switch-off step that says it deletes every record. */
export function adminActivityPage(t: Label, lang: Lang, space: SpaceView, v: AdminActivityView): Html {
  const status = v.enabled && v.since
    ? html`<p id="activity-status" class="message" data-state="on">${sentence(t, 'activityStatusOn', { date: v.since })}</p>`
    : html`<p id="activity-status" class="message" data-state="off">${t('activityStatusOff')}</p>`;
  const done = v.done ? html`<p id="activity-done" class="done" role="status">${t(v.done === 'on' ? 'activityOnDone' : 'activityOffDone')}</p>` : '';
  const action = v.enabled
    ? html`<section id="activity-switch-off" class="card">
  <p>${t('activityOffNote')}</p>
  <a id="activity-off-step" class="button plain" href="${adminPath(space)}/off">${t('activitySwitchOff')}</a>
</section>`
    : html`<form id="activity-switch-on" class="stack card" method="post" action="${adminPath(space)}">
  ${errorBox(v.error)}
  <p class="muted">${t('activityStartNote')}</p>
  <label class="check"><input type="checkbox" name="told" value="1" required> ${t('activityTold')}</label>
  <p class="hint">${t('activityToldNote')}</p>
  <button type="submit">${t('activitySwitchOn')}</button>
</form>`;
  const body = html`<p><a id="back" href="/s/${space.id}/admin">${t('back')}</a></p>
<h1 id="activity-title">${t('lessonActivity')}</h1>
${done}
${status}
<section class="card" id="activity-facts">
  <h2>${t('activityWhatTitle')}</h2>
  <p>${t('activityWhat')}</p>
  <h2>${t('activityWhoTitle')}</h2>
  <p>${t('activityWho')}</p>
  <h2>${t('activityKeptTitle')}</h2>
  <p>${t('activityKept')}</p>
  <p>${t('activityOffNote')}</p>
  <h2>${t('activityNoticeTitle')}</h2>
  <p id="activity-notice-text" class="note">${t('activityNotice')}</p>
</section>
${action}`;
  return spacePage(t, lang, space, t('lessonActivity'), body);
}

/** The switch-off step (AT-15b): names the effect before anything is deleted. */
export function adminActivityOffPage(t: Label, lang: Lang, space: SpaceView): Html {
  const body = html`<h1 id="activity-off-title">${t('activityOffConfirmTitle')}</h1>
<div id="activity-off-confirm" class="card">
  <p>${t('activityOffNote')}</p>
  <div class="share">
    <form id="confirm-activity-off" method="post" action="${adminPath(space)}/off"><button type="submit" class="secondary">${t('activityOffYes')}</button></form>
    <a id="cancel-activity-off" class="button" href="${adminPath(space)}">${t('cancel')}</a>
  </div>
</div>`;
  return spacePage(t, lang, space, t('activityOffConfirmTitle'), body);
}

export interface GuardianActivityView {
  learners: LinkedLearner[];
  learner: LinkedLearner;
  /** Null while the setting is off. */
  on: { since: string; blocks: ActivitySubject[] } | null;
}

function learnerButton(space: SpaceView, l: LinkedLearner, current: boolean): Html {
  return current
    ? html`<a class="button" aria-current="page" href="${activityPath(space, l.id)}"><bdi>${l.display_name}</bdi></a>`
    : html`<a class="button plain" href="${activityPath(space, l.id)}"><bdi>${l.display_name}</bdi></a>`;
}

/** One lesson title with its date, or "No open recorded". */
function activityRow(t: Label, lang: Lang, row: ActivityLesson): Html {
  const shown = row.lastOpenedOn
    ? html`<span class="opened">${datedSentence(t, 'lastOpenedOn', { date: row.lastOpenedOn }, ['date'], lang)}</span>`
    : html`<span class="muted none">${t('noOpenRecorded')}</span>`;
  return html`<li class="row"><bdi class="title">${row.title}</bdi> ${shown}</li>`;
}

/** One assigned subject with its lesson titles in order. */
function activityBlock(t: Label, lang: Lang, block: ActivitySubject): Html {
  const list = block.rows.length ? html`<ul class="list">${block.rows.map((row) => activityRow(t, lang, row))}</ul>` : html`<p class="muted">${t('nothingHere')}</p>`;
  return html`<section class="card">
  <h2><bdi class="title">${block.title}</bdi></h2>
  ${list}
</section>`;
}

function activityOn(t: Label, lang: Lang, on: { since: string; blocks: ActivitySubject[] }): Html {
  const blocks = on.blocks.length ? on.blocks.map((block) => activityBlock(t, lang, block)) : html`<p class="card muted">${t('nothingAssigned')}</p>`;
  return html`<p id="recording-since" class="message">${datedSentence(t, 'recordingSince', { date: on.since }, ['date'], lang)}</p>
<div id="activity">${blocks}</div>
<p id="activity-explain" class="muted">${t('activityExplain')}</p>`;
}

/** The guardian’s lesson-activity page for one linked learner (AT-15c): the
 * switcher between the guardian’s learners, the way back to the guardian home,
 * "Recording since <date>", and per assigned subject each lesson title with
 * "Last opened on <date>" or "No open recorded". Only titles and dates: no
 * lesson address, content, file or link. While off, the "not switched on" line only. */
export function guardianActivityPage(t: Label, lang: Lang, space: SpaceView, v: GuardianActivityView): Html {
  const buttons = v.learners.map((l) => learnerButton(space, l, l.id === v.learner.id));
  const body = html`<p><a id="back" href="/s/${space.id}/linked">${t('guardianHome')}</a></p>
<h1 id="activity-title">${t('lessonActivity')}</h1>
<nav id="activity-learners" class="share" aria-label="${t('activityWhose')}">${buttons}</nav>
<h2 id="activity-learner"><bdi>${v.learner.display_name}</bdi></h2>
${v.on ? activityOn(t, lang, v.on) : activityOff(t, space)}`;
  return spacePage(t, lang, space, t('lessonActivity'), body, { bar: true });
}
