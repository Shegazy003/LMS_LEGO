// LMS wave 2, W2-2 (product-contract v2 on PIL-225, AT-5 and section 8): on the
// learner home, "Continue where you stopped" and each started subject's card
// come from the learner's own done marks only, and nobody else sees any of it.
// One describe per labelled expectation, each its own CI step (`W2 AT-5.<n> ...`,
// selected with --test-name-pattern), each on a fresh world. Pages are read as
// the server sends them (no browser): the UX checks are in ux-home.test.ts.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Client } from '../support/http.ts';
import { doneHits, doneWords } from '../at13/pages.ts';
import { countText } from '../wave1/home.ts';
import {
  ADMIN, HADEER, MATH_ORDER, MONA, OMAR, SALMA, YOUSSEF, T1, T2, T3, activity, as, element, home, lessonPath, markClock, marks, ownerPreview,
  plain, press, previewHome, subjectPath, timeForms, wave2World, withTwoRoles, word, words, type SpaceIds, type Wave1World,
} from './world.ts';

type Lang = 'ar' | 'en';
type Kit = SpaceIds['kit'];
const LANGS = ['ar', 'en'] as const;
const T0 = Date.UTC(2031, 2, 1, 8, 0, 0, 0);
const T4 = Date.UTC(2031, 2, 6, 10, 0, 0, 0);
const T5 = Date.UTC(2031, 2, 7, 11, 0, 0, 0);
/** Arabic grammar in reading order (chapters Nouns, Verbs, Particles). */
const ARABIC_ORDER = ['The noun', 'The dual', 'Past tense', 'Prepositions'];
const CHAPTER_OF: Record<string, string> = {
  'Adding fractions': 'Fractions', 'Comparing fractions': 'Fractions', 'Reading decimals': 'Decimals', 'What is a percent': 'Percent', 'Review sheet': 'Review',
  'The noun': 'Nouns', 'The dual': 'Nouns', 'Past tense': 'Verbs', Prepositions: 'Particles',
};

// ------------------------------------------------------------- the page ----

interface Area {
  html: string;
  text: string;
  links: { href: string; text: string }[];
}

interface Card {
  subject: string;
  html: string;
  count: string;
  action: { text: string; href: string } | null;
}

/** The words a person hears: the text without the decorative arrow, icons and ring (aria-hidden; LMS redesign R1a, UX-97). */
const read = (fragment: string) => plain(fragment
  .replace(/<span class="ring" aria-hidden="true">[\s\S]*?<\/span>/g, ' ')
  .replace(/<svg\b[^>]*aria-hidden="true"[\s\S]*?<\/svg>/g, ' ')
  .replace(/<span\b[^>]*aria-hidden="true"[^>]*>[^<]*<\/span>/g, ' '));

/** The continue area of a home as the server sent it, or null when the page has none. */
function areaOf(doc: string): Area | null {
  const e = element(doc, /<section\b[^>]*\bid="continue"[^>]*>/);
  if (!e) return null;
  const links = [...e.html.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => ({ href: m[1].replace(/&amp;/g, '&'), text: read(m[2]) }));
  return { html: e.html, text: read(e.html), links };
}

/** The cards of a home, in order. */
function cardsOf(doc: string): Card[] {
  const list = element(doc, /<ul\b[^>]*\bid="my-list"[^>]*>/);
  if (!list) return [];
  return [...list.html.matchAll(/<li class="card subj" data-subject="([^"]+)"[^>]*>([\s\S]*?)<\/li>/g)].map((m) => {
    // LMS redesign R1a (UX-1 row, UX-99): the action shows «ابدأ» / «تابع» and is named "Start: <lesson>" (its accessible name, read here).
    const start = /<a class="button start[^"]*"[^>]*href="([^"]*)"[^>]*aria-label="([^"]*)"[^>]*>/.exec(m[2]);
    const count = /<p class="count[^"]*"[^>]*>([\s\S]*?)<\/p>/.exec(m[2]);
    return { subject: m[1], html: m[0], count: count ? plain(count[1]) : '', action: start ? { href: start[1], text: plain(start[2]) } : null };
  });
}

const doneCount = (lang: Lang, total: number, kit: Kit) => (total === 1 ? countText(words(kit, lang), 1, lang) : word(lang, 'doneCount', { n: String(total) }, kit));

/** "Done: N of M <lessons>", or "All done: M <lessons>" (the outline's line, section 5). */
function doneText(lang: Lang, n: number, total: number, kit: Kit = 'school'): string {
  const count = doneCount(lang, total, kit);
  return n >= total
    ? word(lang, 'allDone', { count, total: String(total) }, kit)
    : word(lang, 'doneProgress', { n: String(n), count, total: String(total) }, kit);
}

/** The first-time area: the heading and the one line, no link (AT-5.1). */
function assertFirstTime(area: Area | null, lang: Lang, what: string, kit: Kit = 'school'): void {
  assert.ok(area, `${what}: the home has the continue area`);
  const t = words(kit, lang);
  const line = word(lang, 'continueFirst', { lesson: t('lesson').toLocaleLowerCase(lang) }, kit);
  assert.equal(area.text, `${word(lang, 'continueHeading', {}, kit)} ${line}`, `${what}: the area holds only the heading and "${line}"`);
  assert.deepEqual(area.links, [], `${what}: no link`);
  assert.doesNotMatch(area.html, /data-done/, `${what}: no done marker`);
}

/** The area with a target (AT-5.2): the subject, its progress and one link "Continue: <lesson>" with its chapter. */
function assertTarget(
  w: Wave1World, doc: string, lang: Lang, want: { subject: string; n: number; total: number; lesson: string; lessonId: string },
  what: string, s: SpaceIds = w.school,
): void {
  const area = areaOf(doc);
  assert.ok(area, `${what}: the home has the continue area`);
  // LMS redesign R1a (UX-34 row, UX-97): the hero's «subject · chapter» kicker, the lesson title, its progress, then one link.
  const kicker = word(lang, 'heroLesson', { subjectTitle: want.subject, chapterTitle: CHAPTER_OF[want.lesson] }, s.kit);
  const link = word(lang, 'continueLink', { title: want.lesson }, s.kit);
  assert.equal(area.text, `${word(lang, 'continueHeading', {}, s.kit)} ${kicker} ${want.lesson} ${doneText(lang, want.n, want.total, s.kit)} ${link}`, `${what}: kicker, lesson, progress and link`);
  assert.deepEqual(area.links, [{ href: lessonPath(s, want.lessonId), text: link }], `${what}: one link, to ${want.lesson}`);
}

function assertAllDone(doc: string, lang: Lang, what: string): void {
  const area = areaOf(doc);
  assert.ok(area, `${what}: the home has the continue area`);
  assert.equal(area.text, `${word(lang, 'continueHeading')} ${word(lang, 'everythingDone')}`, `${what}: "Everything you started is done."`);
  assert.deepEqual(area.links, [], `${what}: no link`);
}

/** A card exactly as today (wave 1): its count and "Start: <first lesson>". */
function assertTodayCard(card: Card, lang: Lang, want: { total: number; first: string; firstId: string }, s: SpaceIds, what: string): void {
  assert.equal(card.count, countText(words(s.kit, lang), want.total, lang), `${what}: today's count`);
  assert.deepEqual(card.action, { text: word(lang, 'startLesson', { title: want.first }, s.kit), href: lessonPath(s, want.firstId) }, `${what}: Start: ${want.first}`);
  assert.doesNotMatch(card.html, /data-done|data-action/, `${what}: no done line`);
}

/** A started card: "Done: N of M <lessons>" and "Continue: <target>", or "All done" and "Read again: <first lesson>". */
function assertStartedCard(card: Card, lang: Lang, want: { n: number; total: number; go: string; goId: string; again?: boolean }, s: SpaceIds, what: string): void {
  assert.equal(card.count, doneText(lang, want.n, want.total, s.kit), `${what}: the done line`);
  // LMS redesign R1a (UX-99): the card's action is named by its visible word first («تابع: …»; English unchanged).
  const key = want.again ? 'readAgain' : 'cardContinueName';
  assert.deepEqual(card.action, { text: word(lang, key, { title: want.go }, s.kit), href: lessonPath(s, want.goId) }, `${what}: ${want.again ? 'Read again' : 'Continue'}: ${want.go}`);
}

async function homeOf(c: Client, s: { id: string }): Promise<string> {
  const res = await c.get(home(s));
  assert.equal(res.status, 200, 'the home answers 200');
  return res.text();
}

const cardFor = (doc: string, subjectId: string): Card => {
  const card = cardsOf(doc).find((c) => c.subject === subjectId);
  assert.ok(card, `the card of ${subjectId}`);
  return card;
};

async function markAt(w: Wave1World, c: Client, s: { id: string }, lessonId: string, at: number | null, state: 'done' | 'not-done' = 'done'): Promise<void> {
  await markClock(w, at);
  assert.equal((await press(c, s, lessonId, state)).status, 303, `${lessonId} ${state}`);
  await markClock(w, null);
}

const math = (w: Wave1World, title: string, s: SpaceIds = w.school) => s.lessons[title];
const arabic = (w: Wave1World, title: string) => w.school.arabicLessons[title];

// ------------------------------------------------------------------ AT-5.1 ----

describe('W2 AT-5.1 first time: the continue area says how it works with no link, and every card is exactly today\'s', { concurrency: false }, () => {
  let w: Wave1World;
  before(async () => (w = await wave2World()));
  after(() => w?.close());

  it('W2 AT-5.1 Omar C and Salma with no mark, and Salma after undoing her only mark', async () => {
    const s = w.school;
    for (const lang of LANGS) {
      const omar = await as(w, OMAR, lang);
      const doc = await homeOf(omar, s);
      assertFirstTime(areaOf(doc), lang, `Omar C ${lang}`);
      const cards = cardsOf(doc);
      assert.equal(cards.length, 1, 'Omar C has Mathematics only');
      assertTodayCard(cards[0], lang, { total: 5, first: 'Adding fractions', firstId: math(w, 'Adding fractions') }, s, `Omar C ${lang} Mathematics`);
      // The area sits after the greeting and the notice, before "Assigned to you".
      const at = (re: RegExp) => doc.search(re);
      assert.ok(at(/id="greeting"/) < at(/id="continue"/) && at(/id="continue"/) < at(/id="my-list"/), 'greeting, then the area, then the cards');
    }
    // With nothing assigned (Youssef) there is no countable mark either: the first-time state (8.2 step 1), then "nothing assigned".
    for (const lang of LANGS) {
      const youssef = await homeOf(await as(w, YOUSSEF, lang), s);
      assertFirstTime(areaOf(youssef), lang, `Youssef (nothing assigned) ${lang}`);
      assert.ok(youssef.search(/id="continue"/) < youssef.search(/id="nothing-yet"/), `Youssef ${lang}: the area, then "nothing assigned"`);
    }
    const salma = await as(w, SALMA, 'en');
    const first = await homeOf(salma, s);
    assertFirstTime(areaOf(first), 'en', 'Salma en');
    for (const card of cardsOf(first)) assert.doesNotMatch(card.html, /data-done|data-action|Continue:|Read again:/, `Salma's card ${card.subject} is today's`);
    // A mark, then its undo: no countable mark is left, so the home is again exactly the first-time home.
    await markAt(w, salma, s, math(w, 'Adding fractions'), T1);
    assert.notEqual(await homeOf(salma, s), first, 'with a mark the home changes');
    await markAt(w, salma, s, math(w, 'Adding fractions'), null, 'not-done');
    assert.equal(await homeOf(salma, s), first, 'after the undo the home is exactly the first-time home, byte for byte');
  });
});

// ------------------------------------------------------------------ AT-5.2 ----

describe('W2 AT-5.2 with marks, the area and each started card lead to the target of section 8.2', { concurrency: false }, () => {
  let w: Wave1World;
  before(async () => (w = await wave2World()));
  after(() => w?.close());

  it('W2 AT-5.2 the newest mark decides: Reading decimals, Review sheet, Reading decimals again after the undo; with Mathematics all done, the Arabic grammar lesson after its mark', async () => {
    const s = w.school;
    const salma = await as(w, SALMA, 'en');
    const check = async (want: { lesson: string; n: number }, step: string) => {
      for (const lang of LANGS) {
        const c = await as(w, SALMA, lang);
        const doc = await homeOf(c, s);
        assertTarget(w, doc, lang, { subject: 'Mathematics', n: want.n, total: 5, lesson: want.lesson, lessonId: math(w, want.lesson) }, `${step} ${lang}`);
        assertStartedCard(cardFor(doc, s.math), lang, { n: want.n, total: 5, go: want.lesson, goId: math(w, want.lesson) }, s, `${step} ${lang} Mathematics card`);
        assertTodayCard(cardFor(doc, s.arabic), lang, { total: 4, first: 'The noun', firstId: arabic(w, 'The noun') }, s, `${step} ${lang} Arabic grammar card`);
      }
    };
    await markAt(w, salma, s, math(w, 'Adding fractions'), T1);
    await markAt(w, salma, s, math(w, 'Comparing fractions'), T2);
    await check({ lesson: 'Reading decimals', n: 2 }, 'after Adding fractions and Comparing fractions');
    await markAt(w, salma, s, math(w, 'What is a percent'), T3);
    await check({ lesson: 'Review sheet', n: 3 }, 'after What is a percent (the newest mark)');
    await markAt(w, salma, s, math(w, 'What is a percent'), null, 'not-done');
    await check({ lesson: 'Reading decimals', n: 2 }, 'after undoing What is a percent');

    // Every Mathematics lesson, then one Arabic grammar lesson marked earlier in time than all of them.
    await markAt(w, salma, s, math(w, 'Reading decimals'), T3);
    await markAt(w, salma, s, math(w, 'What is a percent'), T4);
    await markAt(w, salma, s, math(w, 'Review sheet'), T5);
    await markAt(w, salma, s, arabic(w, 'The dual'), T0);
    for (const lang of LANGS) {
      const doc = await homeOf(await as(w, SALMA, lang), s);
      assertTarget(w, doc, lang, { subject: 'Arabic grammar', n: 1, total: 4, lesson: 'Past tense', lessonId: arabic(w, 'Past tense') }, `Mathematics all done ${lang}`);
      assertStartedCard(cardFor(doc, s.math), lang, { n: 5, total: 5, go: 'Adding fractions', goId: math(w, 'Adding fractions'), again: true }, s, `${lang} Mathematics card all done`);
      assertStartedCard(cardFor(doc, s.arabic), lang, { n: 1, total: 4, go: 'Past tense', goId: arabic(w, 'Past tense') }, s, `${lang} Arabic grammar card`);
      const reading = cardFor(doc, s.reading);
      assertTodayCard(reading, lang, { total: 1, first: 'First book', firstId: s.lessons['First book'] }, s, `${lang} Reading club card`);
    }
  });

  it('W2 AT-5.2 out of order (Review sheet, then Adding fractions): Comparing fractions; two marks with the same time: after the later in reading order', async () => {
    // A fresh copy of the world.
    const fresh = await wave2World();
    try {
      const s = fresh.school;
      const salma = await as(fresh, SALMA, 'en');
      await markAt(fresh, salma, s, math(fresh, 'Review sheet'), T1);
      await markAt(fresh, salma, s, math(fresh, 'Adding fractions'), T2);
      for (const lang of LANGS) {
        const doc = await homeOf(await as(fresh, SALMA, lang), s);
        assertTarget(fresh, doc, lang, { subject: 'Mathematics', n: 2, total: 5, lesson: 'Comparing fractions', lessonId: math(fresh, 'Comparing fractions') }, `out of order ${lang}`);
        assertStartedCard(cardFor(doc, s.math), lang, { n: 2, total: 5, go: 'Comparing fractions', goId: math(fresh, 'Comparing fractions') }, s, `out of order ${lang} card`);
      }
      // Two Mathematics lessons with the same time, pressed later lesson first: the target follows the later of the two in reading order.
      for (const title of ['Review sheet', 'Adding fractions']) await markAt(fresh, salma, s, math(fresh, title), null, 'not-done');
      await markAt(fresh, salma, s, math(fresh, 'Reading decimals'), T3);
      await markAt(fresh, salma, s, math(fresh, 'Adding fractions'), T3);
      const doc = await homeOf(salma, s);
      assertTarget(fresh, doc, 'en', { subject: 'Mathematics', n: 2, total: 5, lesson: 'What is a percent', lessonId: math(fresh, 'What is a percent') }, 'same time');
      // Subjects with equal newest times keep the home's order: Arabic grammar comes before Mathematics.
      await markAt(fresh, salma, s, arabic(fresh, 'The noun'), T3);
      assertTarget(fresh, await homeOf(salma, s), 'en', { subject: 'Arabic grammar', n: 1, total: 4, lesson: 'The dual', lessonId: arabic(fresh, 'The dual') }, 'equal times across subjects');
    } finally {
      await fresh.close();
    }
  });

  it('W2 AT-5.2 in the Company and University kits, with the kit\'s lesson word', async () => {
    for (const s of [w.company, w.university]) {
      const salma = await as(w, SALMA, 'en');
      await markAt(w, salma, s, math(w, 'Adding fractions', s), T1);
      for (const lang of LANGS) {
        const doc = await homeOf(await as(w, SALMA, lang), s);
        assertTarget(w, doc, lang, { subject: 'Mathematics', n: 1, total: 5, lesson: 'Comparing fractions', lessonId: math(w, 'Comparing fractions', s) }, `${s.kit} ${lang}`, s);
        const card = cardFor(doc, s.math);
        assertStartedCard(card, lang, { n: 1, total: 5, go: 'Comparing fractions', goId: math(w, 'Comparing fractions', s) }, s, `${s.kit} ${lang} card`);
        const plural = words(s.kit, lang)('lessonPlural');
        assert.ok(card.count.includes(plural), `${s.kit} ${lang}: the card says "${plural}"`);
      }
    }
  });
});

// ------------------------------------------------------------------ AT-5.3 ----

describe('W2 AT-5.3 when every subject with marks is all done, the area says so with no link', { concurrency: false }, () => {
  let w: Wave1World;
  before(async () => (w = await wave2World()));
  after(() => w?.close());

  it('W2 AT-5.3 Mathematics all done, then Arabic grammar all done too: "Everything you started is done."', async () => {
    const s = w.school;
    const salma = await as(w, SALMA, 'en');
    for (const [i, title] of MATH_ORDER.entries()) await markAt(w, salma, s, math(w, title), T1 + i);
    for (const lang of LANGS) {
      const doc = await homeOf(await as(w, SALMA, lang), s);
      assertAllDone(doc, lang, `Mathematics all done ${lang}`);
      assertStartedCard(cardFor(doc, s.math), lang, { n: 5, total: 5, go: 'Adding fractions', goId: math(w, 'Adding fractions'), again: true }, s, `${lang} Mathematics card`);
    }
    for (const [i, title] of ARABIC_ORDER.entries()) await markAt(w, salma, s, arabic(w, title), T0 + i);
    for (const lang of LANGS) {
      const doc = await homeOf(await as(w, SALMA, lang), s);
      assertAllDone(doc, lang, `both all done ${lang}`);
      assertStartedCard(cardFor(doc, s.arabic), lang, { n: 4, total: 4, go: 'The noun', goId: arabic(w, 'The noun'), again: true }, s, `${lang} Arabic grammar card`);
    }
  });
});

// ------------------------------------------------------------------ AT-5.4 ----

describe('W2 AT-5.4 only the learner\'s own marks decide it, and nobody else sees it', { concurrency: false }, () => {
  let w: Wave1World;
  before(async () => (w = await wave2World()));
  after(() => w?.close());

  it('W2 AT-5.4 opening lessons (activity on or off) never changes the area; a removed, unpublished or unassigned target is never offered', async (t) => {
    const s = w.school;
    const salma = await as(w, SALMA, 'en');
    await markAt(w, salma, s, math(w, 'Adding fractions'), T1);
    await markAt(w, salma, s, math(w, 'Comparing fractions'), T2);
    const before = areaOf(await homeOf(salma, s))!.html;
    const lessons = [...MATH_ORDER.map((x) => math(w, x)), ...ARABIC_ORDER.map((x) => arabic(w, x)), s.lessons['First book']];
    for (const on of [true, false]) {
      await activity(w, on);
      // Review sheet last: the newest open, which must not become "where I stopped".
      for (const id of [...lessons.filter((x) => x !== math(w, 'Review sheet')), math(w, 'Review sheet')]) {
        assert.equal((await salma.get(lessonPath(s, id))).status, 200);
      }
      await salma.get(subjectPath(s, s.math, 'all'));
      if (on) {
        const opened = Number((await w.p.sql(`SELECT COUNT(*) AS n FROM lesson_view WHERE space_id = '${s.id}'`))[0].n);
        assert.equal(opened, lessons.length, 'with activity on, every open is recorded as today');
        t.diagnostic(`AT-5.4 lesson opens recorded while activity was on: ${opened}`);
      }
      assert.equal(areaOf(await homeOf(salma, s))!.html, before, `activity ${on ? 'on' : 'off'}: opening every lesson leaves the area unchanged`);
    }

    // The target removed: the next countable lesson is offered, and the count leaves it out.
    await w.p.sql(`UPDATE lesson SET removed_at = 1 WHERE id = '${math(w, 'Reading decimals')}'`);
    assertTarget(w, await homeOf(salma, s), 'en', { subject: 'Mathematics', n: 2, total: 4, lesson: 'What is a percent', lessonId: math(w, 'What is a percent') }, 'Reading decimals removed');
    // A removed marked lesson is not counted either; after Restore it is again.
    await w.p.sql(`UPDATE lesson SET removed_at = 1 WHERE id = '${math(w, 'Comparing fractions')}'`);
    assertTarget(w, await homeOf(salma, s), 'en', { subject: 'Mathematics', n: 1, total: 3, lesson: 'What is a percent', lessonId: math(w, 'What is a percent') }, 'the newest mark removed');
    await w.p.sql(`UPDATE lesson SET removed_at = NULL WHERE id IN ('${math(w, 'Reading decimals')}', '${math(w, 'Comparing fractions')}')`);
    assertTarget(w, await homeOf(salma, s), 'en', { subject: 'Mathematics', n: 2, total: 5, lesson: 'Reading decimals', lessonId: math(w, 'Reading decimals') }, 'after Restore');

    // An older Arabic grammar mark, so an unpublished Mathematics hands over to it.
    await markAt(w, salma, s, arabic(w, 'The noun'), T0);
    await w.p.sql(`UPDATE subject SET is_published = 0 WHERE id = '${s.math}'`);
    let doc = await homeOf(salma, s);
    assertTarget(w, doc, 'en', { subject: 'Arabic grammar', n: 1, total: 4, lesson: 'The dual', lessonId: arabic(w, 'The dual') }, 'Mathematics unpublished');
    assert.ok(!doc.includes(s.math), 'nothing of Mathematics is on the home');
    await w.p.sql(`UPDATE subject SET is_published = 1 WHERE id = '${s.math}'`);
    assertTarget(w, await homeOf(salma, s), 'en', { subject: 'Mathematics', n: 2, total: 5, lesson: 'Reading decimals', lessonId: math(w, 'Reading decimals') }, 'published again');
    // Unassigned (Mathematics reaches Salma through the group Science): leave the group, then come back.
    const salmaId = w.ids[SALMA.username];
    const member = await w.p.sql(`SELECT group_id FROM group_member WHERE space_id = '${s.id}' AND user_id = '${salmaId}'`);
    assert.equal(member.length, 1, 'Salma is in one group');
    await w.p.sql(`DELETE FROM group_member WHERE space_id = '${s.id}' AND user_id = '${salmaId}'`);
    doc = await homeOf(salma, s);
    assertTarget(w, doc, 'en', { subject: 'Arabic grammar', n: 1, total: 4, lesson: 'The dual', lessonId: arabic(w, 'The dual') }, 'Mathematics no longer assigned');
    await w.p.sql(`INSERT INTO group_member (space_id, group_id, user_id) VALUES ('${s.id}', '${member[0].group_id}', '${salmaId}')`);
    assertTarget(w, await homeOf(salma, s), 'en', { subject: 'Mathematics', n: 2, total: 5, lesson: 'Reading decimals', lessonId: math(w, 'Reading decimals') }, 'assigned again');
    assert.equal((await marks(w)).length, 3, 'every mark stayed stored throughout');
  });

  it('W2 AT-5.4 the area and the done lines never appear on a home of Amal, Hadeer, Mona or the owner; every preview home shows the first-time state and reads no done mark', async () => {
    const s = w.school;
    const spy = w.p.spy!;
    const owner = w.owner;
    const people: [string, Client, string[]][] = [
      ['Amal', await as(w, ADMIN, 'en'), [home(s), `/s/${s.id}/admin`]],
      ['Hadeer', await as(w, HADEER, 'en'), [home(s), `/s/${s.id}/publish`]],
      ['Mona', await as(w, MONA, 'en'), [home(s), `/s/${s.id}/linked`, `/s/${s.id}/linked/${w.ids[SALMA.username]}`]],
      ['owner', owner, ['/owner', `/owner/spaces/${s.id}`]],
    ];
    const previews: [string, Client, string][] = [
      ['Amal', people[0][1], previewHome(s)], ['Amal', people[0][1], previewHome(s, 'home')], ['Hadeer', people[1][1], previewHome(s)], ['owner', owner, ownerPreview(s)],
    ];
    for (const lang of LANGS) {
      for (const [, c] of people) await c.post('/account/language', { lang });
      for (const [who, c, paths] of people) {
        for (const path of paths) {
          const res = await c.get(path);
          assert.equal(res.status, 200, `${who} ${path}`);
          const doc = await res.text();
          assert.equal(areaOf(doc), null, `${who} ${lang} ${path}: no continue area`);
          assert.deepEqual(doneHits(doc, doneWords(false)), [], `${who} ${lang} ${path}: no done word, line or marker`);
        }
      }
      for (const [who, c, path] of previews) {
        spy.start();
        const res = await c.get(path);
        const doc = await res.text();
        const statements = await spy.stop();
        assert.equal(res.status, 200, `${who} ${path}`);
        // Every preview home shows the first-time state, the owner's too (a learner with nothing assigned, as Youssef's home).
        assertFirstTime(areaOf(doc), lang, `${who} preview ${lang} ${path}`);
        if (path === ownerPreview(s)) assert.ok(plain(doc).includes(word(lang, 'nothingAssigned')), `owner preview ${lang}: "nothing assigned"`);
        assert.deepEqual(doneHits(doc, doneWords(true)), [], `${who} preview ${lang}: no done line or marker`);
        assert.deepEqual(statements.filter((x) => /\bdone_mark\b/.test(x)), [], `${who} preview ${lang} ${path}: no statement names done_mark`);
      }
    }
    // W2-e: Amal also a learner with a mark of her own: her home is still the admin home, with nothing of it.
    await withTwoRoles(w);
    const amal = await as(w, ADMIN, 'en');
    await markAt(w, amal, s, math(w, 'Adding fractions'), T3);
    const doc = await homeOf(amal, s);
    assert.equal(areaOf(doc), null, 'Amal (admin and learner): no continue area on her home');
    assert.deepEqual(doneHits(doc, doneWords(false)), [], 'Amal (admin and learner): no done word on her home');
    // Mona, now also a learner without marks, gets the learner home: the first-time state, nothing of Salma's.
    assertFirstTime(areaOf(await homeOf(await as(w, MONA, 'en'), s)), 'en', 'Mona (guardian and learner)');
  });
});

// ------------------------------------------------------------------ AT-5.5 ----

describe('W2 AT-5.5 the home reads the database a fixed number of times, sends no-store and no stored time', { concurrency: false }, () => {
  it('W2 AT-5.5 the same reads with 4 or 8 subjects and with 0 or 30 marks, at most 2 more than today\'s 4', async (t) => {
    const counts: string[] = [];
    let first: number | null = null;
    for (const variant of ['as-is', 'more-subjects'] as const) {
      const w = await wave2World(variant);
      try {
        const s = w.school;
        const salma = await as(w, SALMA, 'en');
        const reads = async (what: string) => {
          await salma.get(home(s)); // a first visit settles the session refresh
          const spy = w.p.spy!;
          spy.start();
          const res = await salma.get(home(s));
          const body = await res.text();
          const statements = await spy.stop();
          assert.equal(res.status, 200);
          assert.equal(res.headers.get('cache-control'), 'no-store', `${what}: Cache-Control: no-store`);
          const n = statements.filter((x) => /^\s*(SELECT|WITH)\b/i.test(x)).length;
          counts.push(`${what}: ${n}`);
          return { n, body, headers: [...res.headers].map(([k, v]) => `${k}: ${v}`).join('\n') };
        };
        const subjects = cardsOf((await reads(`${variant}, 0 marks`)).body).length;
        assert.equal(subjects, variant === 'as-is' ? 4 : 8, `${variant}: ${subjects} subjects`);
        // 30 marks: 29 more lessons in Reading club's chapter (so the count of subjects stays), each marked, and First book.
        const chapter = await w.p.sql(`SELECT id FROM chapter WHERE subject_id = '${s.reading}'`);
        for (let i = 1; i <= 29; i++) {
          await w.p.sql(`INSERT INTO lesson (id, space_id, chapter_id, title, position) VALUES ('w2c-l${i}', '${s.id}', '${chapter[0].id}', 'Extra reading ${i}', ${100 + i})`);
        }
        const ids = [s.lessons['First book'], ...Array.from({ length: 29 }, (_, i) => `w2c-l${i + 1}`)];
        for (const [i, id] of ids.entries()) await markAt(w, salma, s, id, T1 + i * 1000);
        assert.equal((await marks(w)).length, 30, '30 marks stored');
        const zero = counts.at(-1)!;
        const thirty = await reads(`${variant}, 30 marks`);
        assert.equal(thirty.n, Number(zero.split(': ')[1]), `${variant}: the same reads with 0 and 30 marks`);
        first ??= thirty.n;
        assert.equal(thirty.n, first, 'the same reads with 4 and 8 subjects');
        // LMS wave 6 (product-contract v2 on PIL-257, AT-3.4b): the home gains exactly one statement, the to-do list,
        // on top of wave 2's and wave 5's; named in W6-1b's CANDIDATE READY (section 11, last line). Fixed count unchanged.
        assert.ok(thirty.n <= 4 + 2 + 1, `at most 2 more than today's 4, plus wave 6's to-do statement (${thirty.n})`);
        // The 30 marks are on the page (Reading club all done), and none of their stored times is, in any form.
        assert.equal(cardFor(thirty.body, s.reading).count, doneText('en', 30, 30), 'the card counts the 30 marks');
        const leaks = (await marks(w)).flatMap((m) => timeForms(m.marked_at)).filter((f) => thirty.body.includes(f) || thirty.headers.includes(f));
        assert.deepEqual(leaks, [], 'no stored marked_at value in the response');
      } finally {
        await w.close();
      }
    }
    t.diagnostic(`AT-5.5 learner home database reads (SELECT statements per request): ${counts.join('; ')}`);
  });
});
