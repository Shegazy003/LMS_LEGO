// LMS wave 4, W4-1a (product-contract v2 on PIL-238, AT-2): the lock, for the
// learner, with Mathematics in order (Hadeer's editor form) and lesson
// activity on throughout. One describe per labelled expectation, each its own
// CI step (`W4 AT-2.<n> ...`, selected with --test-name-pattern), each on a
// fresh world. AT-2.4's status sentence ("... is open now.") came with W4-1b:
// after "Mark as done", wave 2's sentence, then it, and today's Next. Made-up data only.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Client } from '../support/http.ts';
import type { Lang } from '../../src/labels.ts';
import {
  MATH_ORDER, SALMA, as, chapterHtml, goToOf, home, inline, lessonPath, lockOf, markPath, marks, press, setOrder, subjectPath, summaryOf,
  wave4World, withW4c, words, type SpaceIds, type Wave1World,
} from './world.ts';

const L = (s: SpaceIds, title: string) => s.lessons[title];

/** The order box of an outline: where it sits, its order line and its "Go to". */
function orderBox(html: string) {
  const at = html.indexOf('id="order-box"');
  if (at < 0) return null;
  const box = html.slice(at, html.indexOf('</section>', at));
  return { at, line: inline(/<p id="order-line">([\s\S]*?)<\/p>/.exec(box)?.[1] ?? ''), goTo: goToOf(box) };
}

/** Each chapter's lock on an outline, by title (null for an open chapter). */
function locksOn(html: string, s: SpaceIds, titles: string[]): Record<string, { tag: string; reason: string } | null> {
  return Object.fromEntries(titles.map((title) => {
    const block = chapterHtml(html, s.chapters[title]);
    const lock = lockOf(summaryOf(block));
    assert.equal(/\bdata-locked\b/.test(block.slice(0, block.indexOf('>'))), lock !== null, `${title}: data-locked exactly when locked`);
    return [title, lock];
  }));
}

const CHAPTERS = ['Fractions', 'Empty chapter', 'Decimals', 'Percent', 'Review'];
const LOCKED = (reason: string) => ({ tag: 'Locked', reason });

// ------------------------------------------------------------------ AT-2.1 ----
describe('W4 AT-2.1 first look: the order box with "Go to: Adding fractions", Fractions open, Empty chapter as today, Decimals, Percent and Review locked with their reasons', { concurrency: false }, () => {
  let w: Wave1World;
  before(async () => (w = await wave4World({ activity: true })));
  after(() => w?.close());

  it('W4 AT-2.1 default fold and ?open=all, with no marks', async () => {
    const s = w.school;
    const salma = await as(w, SALMA, 'en');
    const offFolded = await (await salma.get(subjectPath(s, s.math))).text();
    const offAll = await (await salma.get(subjectPath(s, s.math, 'all'))).text();
    assert.equal(orderBox(offFolded), null, 'with the setting off, no order box');
    await setOrder(w, true);
    for (const [open, off] of [[undefined, offFolded], ['all', offAll]] as const) {
      const res = await salma.get(subjectPath(s, s.math, open));
      assert.equal(res.status, 200);
      const html = await res.text();
      const box = orderBox(html)!;
      assert.ok(box, 'the order box');
      assert.equal(box.line, 'Open in order: each chapter opens when every lesson before it is marked done.');
      assert.deepEqual(box.goTo, { text: 'Go to: Adding fractions', href: lessonPath(s, L(s, 'Adding fractions')) }, 'Go to the first not-done lesson');
      assert.ok(box.at > html.indexOf('id="subject-title"') && box.at < html.indexOf('<details'), 'under the title, before (outside) every chapter');
      assert.deepEqual(locksOn(html, s, CHAPTERS), {
        Fractions: null,
        'Empty chapter': null,
        Decimals: LOCKED('Opens when Chapter: Fractions is done (2 lessons left).'),
        Percent: LOCKED('Opens when everything before it is done (3 lessons left).'),
        Review: LOCKED('Opens when everything before it is done (4 lessons left).'),
      });
      // Fractions and Empty chapter are exactly today's blocks; folding is today's rule.
      for (const title of ['Fractions', 'Empty chapter']) assert.equal(chapterHtml(html, s.chapters[title]), chapterHtml(off, s.chapters[title]), `${title}: today's block`);
      assert.ok(chapterHtml(html, s.chapters['Empty chapter']).includes('No lessons here yet.'), 'Empty chapter: "no lessons yet"');
      const openOf = (h: string) => CHAPTERS.map((title) => /<details[^>]*\bopen\b/.test(chapterHtml(h, s.chapters[title]).slice(0, 400)));
      assert.deepEqual(openOf(html), openOf(off), `folding with ${open ?? 'no'} ?open= is today's`);
      assert.deepEqual(openOf(html), CHAPTERS.map(() => open === 'all'), 'five chapters: folded, or all open');
      // Opened, a locked chapter lists its lessons as plain text with the hidden "Locked", never as links.
      for (const [title, lessons] of [['Decimals', ['Reading decimals']], ['Percent', ['What is a percent']], ['Review', ['Review sheet']]] as const) {
        const block = chapterHtml(html, s.chapters[title]);
        const list = block.slice(block.indexOf('</summary>'));
        assert.ok(!/<a\b/.test(list) && !/tabindex/.test(list), `${title}: no link and nothing focusable`);
        for (const lesson of lessons) {
          assert.ok(!html.includes(`href="${lessonPath(s, L(s, lesson))}"`), `${lesson}: no link to it anywhere on the outline`);
          assert.match(list, new RegExp(`<span class="lock-item" data-lesson="${L(s, lesson)}"><span class="sr-only">Locked</span><bdi>${lesson}</bdi></span>`), `${lesson}: plain text with the hidden "Locked"`);
        }
      }
    }
  });
});

// ------------------------------------------------------------------ AT-2.2 ----
describe('W4 AT-2.2 what "done" means: every shown lesson of every earlier chapter, the learner\'s own marks, removed items count for nothing (and world W4-c)', { concurrency: false }, () => {
  it('W4 AT-2.2 marking in order opens chapter after chapter; with every lesson done nothing is locked and the box shows the order line only', async () => {
    const w = await wave4World({ activity: true });
    try {
      const s = w.school;
      await setOrder(w, true);
      const salma = await as(w, SALMA, 'en');
      const outlineNow = async () => (await (await salma.get(subjectPath(s, s.math))).text());
      const steps: [string | null, Record<string, string | null>, string | null][] = [
        [null, { Decimals: 'Opens when Chapter: Fractions is done (2 lessons left).' }, 'Adding fractions'],
        ['Adding fractions', { Decimals: 'Opens when Chapter: Fractions is done (1 lesson left).' }, 'Comparing fractions'],
        ['Comparing fractions', { Decimals: null, Percent: 'Opens when Chapter: Decimals is done (1 lesson left).', Review: 'Opens when everything before it is done (2 lessons left).' }, 'Reading decimals'],
        ['Reading decimals', { Percent: null, Review: 'Opens when Chapter: Percent is done (1 lesson left).' }, 'What is a percent'],
        ['What is a percent', { Review: null }, null],
        ['Review sheet', { Review: null }, null],
      ];
      for (const [mark, want, goTo] of steps) {
        if (mark) assert.equal((await press(salma, s, L(s, mark), 'done')).status, 303, `${mark} marked`);
        const html = await outlineNow();
        const got = locksOn(html, s, CHAPTERS);
        for (const [title, reason] of Object.entries(want)) assert.deepEqual(got[title], reason ? LOCKED(reason) : null, `after ${mark ?? 'no mark'}: ${title}`);
        assert.equal(got['Empty chapter'], null, 'Empty chapter is never locked (done by definition)');
        const box = orderBox(html)!;
        assert.equal(box.line, 'Open in order: each chapter opens when every lesson before it is marked done.', 'the order line stays');
        assert.deepEqual(box.goTo?.text ?? null, goTo ? `Go to: ${goTo}` : null, `after ${mark ?? 'no mark'}: Go to`);
      }
      // The removed Old decimals and the removed Draft chapter count for nothing: Decimals opened with Fractions done alone.
      assert.ok(!(await outlineNow()).includes('Old decimals') && !(await outlineNow()).includes('Draft chapter'), 'removed items are not on the outline');
    } finally {
      await w.close();
    }
  });

  it('W4 AT-2.2 world W4-c: marks on Old decimals (removed) and on Reading decimals (locked chapter) open nothing; the tick stays and counts in "Done: 2 of 5 lessons"', async () => {
    const w = await wave4World({ activity: true });
    try {
      const s = w.school;
      await withW4c(w);
      assert.equal((await marks(w)).length, 3, 'three stored marks (one on a removed lesson)');
      await setOrder(w, true);
      const salma = await as(w, SALMA, 'en');
      const html = await (await salma.get(subjectPath(s, s.math, 'all'))).text();
      assert.deepEqual(locksOn(html, s, CHAPTERS), {
        Fractions: null,
        'Empty chapter': null,
        Decimals: LOCKED('Opens when Chapter: Fractions is done (1 lesson left).'),
        Percent: LOCKED('Opens when everything before it is done (1 lesson left).'),
        Review: LOCKED('Opens when everything before it is done (2 lessons left).'),
      });
      const decimals = chapterHtml(html, s.chapters.Decimals);
      assert.match(decimals, new RegExp(`<li class="is-done"><span class="tick" data-done="lesson">[\\s\\S]*?<span class="lock-item" data-lesson="${L(s, 'Reading decimals')}">`), 'Reading decimals keeps its tick, as plain text');
      assert.equal(inline(/<p id="done-progress"[^>]*>([\s\S]*?)<\/p>/.exec(html)![1]), 'Done: 2 of 5 lessons', 'the mark counts');
      assert.equal(orderBox(html)!.goTo!.text, 'Go to: Comparing fractions');
    } finally {
      await w.close();
    }
  });
});

// ------------------------------------------------------------------ AT-2.3 ----
describe('W4 AT-2.3 a locked lesson by its address: the locked page (200, no-store, nothing recorded), HEAD the same, its file and its mark POST 403', { concurrency: false }, () => {
  let w: Wave1World;
  before(async () => (w = await wave4World({ activity: true })));
  after(() => w?.close());

  it('W4 AT-2.3 Reading decimals, What is a percent and Review sheet give the locked page with their own chapter\'s reason; files and presses are refused', async () => {
    const s = w.school;
    const salma = await as(w, SALMA, 'en');
    // A PDF in Reading decimals (the same stored file as Comparing fractions' worksheet), readable while the setting is off.
    const worksheet = (await w.p.sql(`SELECT storage_key FROM material WHERE space_id = '${s.id}' AND kind = 'pdf' AND title = 'Worksheet'`))[0];
    await w.p.sql(`INSERT INTO material (id, space_id, lesson_id, kind, title, storage_key, position) VALUES ('w4-decimals-pdf', '${s.id}', '${L(s, 'Reading decimals')}', 'pdf', 'Decimals sheet', '${worksheet.storage_key}', 50)`);
    const filePath = `/s/${s.id}/file/w4-decimals-pdf`;
    const offFile = await salma.get(filePath);
    assert.equal(offFile.status, 200, 'with the setting off the file is read');
    assert.ok((await offFile.arrayBuffer()).byteLength > 0);
    await setOrder(w, true);
    const views = async () => Number((await w.p.sql(`SELECT COUNT(*) AS n FROM lesson_view WHERE space_id = '${s.id}'`))[0].n);
    const before = await views();
    const cases: [string, string][] = [
      ['Reading decimals', 'Opens when Chapter: Fractions is done (2 lessons left).'],
      ['What is a percent', 'Opens when everything before it is done (3 lessons left).'],
      ['Review sheet', 'Opens when everything before it is done (4 lessons left).'],
    ];
    const outline = await (await salma.get(subjectPath(s, s.math))).text();
    for (const [title, reason] of cases) {
      const res = await salma.get(lessonPath(s, L(s, title)));
      assert.equal(res.status, 200, `${title}: 200`);
      assert.equal(res.headers.get('cache-control'), 'no-store', `${title}: no-store`);
      const html = await res.text();
      const main = html.slice(html.indexOf('<main'));
      // In DOM order: trail, title, tag, reason, Go to, Back to the outline.
      const order = ['id="trail"', 'id="lesson-title"', 'id="lock-tag"', 'id="lock-reason"', 'id="go-to"', 'id="back-to-outline"'].map((m) => main.indexOf(m));
      assert.ok(order.every((x, i) => x > 0 && (i === 0 || x > order[i - 1])), `${title}: trail, title, tag, reason, Go to, back, in this order (${order})`);
      assert.equal(inline(/<h1 id="lesson-title"[^>]*>([\s\S]*?)<\/h1>/.exec(main)![1]), title);
      assert.deepEqual(lockOf(main), LOCKED(reason), `${title}: the tag and its own chapter's reason`);
      const chapter = Object.entries(s.chapters).find(([, id]) => outline.includes(`data-chapter="${id}"`) && chapterHtml(outline, id).includes(`data-lesson="${L(s, title)}"`))![0];
      assert.equal(lockOf(summaryOf(chapterHtml(outline, s.chapters[chapter])))!.reason, reason, `${title}: exactly the reason on the outline`);
      assert.deepEqual(goToOf(main), { text: 'Go to: Adding fractions', href: lessonPath(s, L(s, 'Adding fractions')) });
      assert.equal(inline(/<a id="back-to-outline"[^>]*>([\s\S]*?)<\/a>/.exec(main)![1]), 'Back to the outline');
      for (const absent of ['id="items"', 'class="body"', 'id="done-state"', 'id="done-control"', 'id="next-lesson"', 'id="previous-lesson"', 'id="next-locked"', '/file/', 'Note', 'Tenths and hundredths', 'Decimals sheet', 'Out of a hundred', 'All of it once more']) {
        assert.ok(!main.includes(absent), `${title}: no ${absent} (no intro, material, material title, done block, Next or Previous)`);
      }
      // HEAD answers the same and writes nothing.
      const head = await fetch(w.p.url + lessonPath(s, L(s, title)), { method: 'HEAD', redirect: 'manual', headers: { cookie: `lms_session=${salma.cookie('lms_session')}` } });
      assert.equal(head.status, 200, `${title}: HEAD 200`);
      assert.equal(head.headers.get('cache-control'), 'no-store');
    }
    assert.equal(await views(), before, 'no lesson_view row is written');
    // A file of a locked lesson: 403, no bytes.
    const file = await salma.get(filePath);
    assert.equal(file.status, 403, 'the file of a locked lesson: 403');
    assert.ok(!(await file.text()).startsWith('%PDF'), 'no bytes of the file');
    // A mark POST on it, done or not-done: 403, nothing stored.
    const stored = await marks(w);
    for (const state of ['done', 'not-done']) {
      assert.equal((await press(salma, s, L(s, 'Reading decimals'), state)).status, 403, `${state} on a locked lesson: 403`);
      assert.deepEqual(await marks(w), stored, `${state}: nothing stored`);
    }
  });
});

// ------------------------------------------------------------------ AT-2.7 ----
/** The learner routes keyed by a lesson, material or chapter id (contract Code facts), each with its locked case in AT-2.3. */
const LESSON_KEYED = [
  'GET /s/:spaceId/read/:lessonId',
  'POST /s/:spaceId/read/:lessonId/done',
  'GET /s/:spaceId/file/:materialId',
];

// LMS wave 8 (W8-1a, product-contract v2 on PIL-299, S1): the admin's Opening dates POST takes a :chapterId under
// /admin/, an admin-only address (role-gates covers it), not a learner route; /admin/ is skipped like /publish/.
// Named in CANDIDATE READY (outside section 8; the Lead decides).
describe('W4 AT-2.7 every lesson-keyed learner route is gated: the route table has exactly the three of Code facts', () => {
  it('W4 AT-2.7 the routes taking :lessonId, :materialId or :chapterId outside /publish/ and /preview/ are exactly the listed three', async (t) => {
    (globalThis as { __TEST_HOOKS__?: boolean }).__TEST_HOOKS__ = true;
    const { app, MIDDLEWARE } = await import('../../src/app.ts');
    const keyed = [...new Set((app.routes as { method: string; path: string; handler: unknown }[])
      .filter((r) => /:(lessonId|materialId|chapterId)\b/.test(r.path) && !/\/(publish|preview|admin)\//.test(r.path) && !(r.method === 'ALL' && MIDDLEWARE.has(r.handler)))
      .map((r) => `${r.method} ${r.path}`))].sort();
    t.diagnostic(`AT-2.7 lesson-keyed learner routes: ${keyed.join(', ')}`);
    assert.deepEqual(keyed, [...LESSON_KEYED].sort(), 'a new such route must be added here with its own locked case');
  });
});

// ------------------------------------------------------------------ AT-2.4 ----
describe('W4 AT-2.4 the lesson end around a lock: Next into a locked chapter is a plain line with the tag and the reason; after "Mark as done", today\'s Next', { concurrency: false }, () => {
  let w: Wave1World;
  before(async () => (w = await wave4World({ activity: true })));
  after(() => w?.close());

  it('W4 AT-2.4 Comparing fractions with Adding fractions done; Previous and Back to the outline are today\'s', async () => {
    const s = w.school;
    const salma = await as(w, SALMA, 'en');
    assert.equal((await press(salma, s, L(s, 'Adding fractions'), 'done')).status, 303);
    const page = async () => (await (await salma.get(lessonPath(s, L(s, 'Comparing fractions')))).text());
    const pick = (html: string, id: string) => /<a id="[^"]+"[^>]*>/.test(html) ? (new RegExp(`<a id="${id}"[\\s\\S]*?</a>`).exec(html)?.[0] ?? null) : null;
    const off = await page();
    await setOrder(w, true);
    const on = await page();
    assert.equal(pick(on, 'next-lesson'), null, 'no Next link');
    const block = /<div id="next-locked" class="next-locked">([\s\S]*?)<\/div>/.exec(on)?.[1] ?? '';
    assert.ok(block, 'the plain Next line');
    assert.equal(inline(/<span class="line1">([\s\S]*?)<\/span>/.exec(block)![1]), 'Next: Reading decimals');
    assert.deepEqual(lockOf(block), LOCKED('Opens when Chapter: Fractions is done (1 lesson left).'), 'the tag and the reason of the chapter it leads into');
    assert.ok(!/<a\b|<button\b|tabindex/.test(block), 'not a link, not a control, not focusable');
    for (const id of ['previous-lesson', 'back-to-outline']) assert.equal(pick(on, id), pick(off, id), `${id}: today's`);
    // "Mark as done": wave 2's status sentence, and Next is today's link with the chapter on its second line.
    const res = await press(salma, s, L(s, 'Comparing fractions'), 'done');
    assert.equal(res.status, 303);
    const after = await (await salma.get(res.headers.get('location')!.split('#')[0])).text();
    // W4-1b (section 5.4): the press opened Decimals, so its sentence follows wave 2's in the same status element.
    assert.match(res.headers.get('location')!, /[?&]opened=1(&|#|$)/, 'the 303 address says the press opened a chapter');
    assert.equal(inline(/<p id="done-status"[^>]*>([\s\S]*?)<\/p>/.exec(after)![1]), 'Marked as done. Chapter: Decimals is open now.', 'wave 2\'s sentence, then W4-1b\'s');
    const next = pick(after, 'next-lesson')!;
    assert.ok(next && next.includes(`href="${lessonPath(s, L(s, 'Reading decimals'))}"`), 'today\'s Next link');
    assert.equal(inline(/<span class="line2">([\s\S]*?)<\/span>/.exec(next)![1]), 'Chapter: Decimals', 'with the chapter on its second line');
    assert.ok(!after.includes('id="next-locked"'));
    for (const id of ['previous-lesson', 'back-to-outline']) assert.equal(pick(after, id), pick(off, id), `${id}: today's`);
  });
});

// ------------------------------------------------------------------ AT-2.5 ----
describe('W4 AT-2.5 home never leads into a lock: world W4-c offers "Continue: Comparing fractions" in order, wave 2\'s "Continue: What is a percent" off', { concurrency: false }, () => {
  it('W4 AT-2.5 the continue area and Mathematics\' card, with the setting off and on', async () => {
    const w = await wave4World({ activity: true });
    try {
      const s = w.school;
      await withW4c(w);
      const salma = await as(w, SALMA, 'en');
      const read = async () => {
        const html = await (await salma.get(home(s))).text();
        // LMS redesign R1a (UX-34 row, UX-97, UX-99): the hero link holds one line; the card action shows its word
        // and carries «<word>: <title>» as its accessible name.
        const area = /<a id="continue-link"[^>]*href="([^"]+)"[^>]*><span>([\s\S]*?)<\/span>/.exec(html)!;
        const at = html.indexOf(`data-subject="${s.math}"`);
        const card = html.slice(at, html.indexOf('</li>', at));
        const action = /<a class="button start go-card" data-action="([^"]+)" href="([^"]+)" aria-label="([^"]*)">/.exec(card)!;
        return { area: [inline(area[2]), area[1]], card: [action[1], inline(action[3]), action[2]], locked: /class="lock-tag"|data-locked|id="order-box"/.test(html) };
      };
      const toPercent = lessonPath(s, L(s, 'What is a percent'));
      const toComparing = lessonPath(s, L(s, 'Comparing fractions'));
      assert.deepEqual(await read(), { area: ['Continue: What is a percent', toPercent], card: ['continue', 'Continue: What is a percent', toPercent], locked: false }, 'off: wave 2\'s target');
      await setOrder(w, true);
      assert.deepEqual(await read(), { area: ['Continue: Comparing fractions', toComparing], card: ['continue', 'Continue: Comparing fractions', toComparing], locked: false }, 'in order: the first not-done lesson, no lock tag');
      await setOrder(w, false);
      assert.deepEqual((await read()).area, ['Continue: What is a percent', toPercent], 'off again: wave 2\'s');
    } finally {
      await w.close();
    }
  });
});

// ------------------------------------------------------------------ AT-2.6 ----
describe('W4 AT-2.6 kits and languages: the order line, the reasons and the counts use the kit\'s words in English and Arabic', { concurrency: false }, () => {
  let w: Wave1World;
  before(async () => (w = await wave4World({ activity: true })));
  after(() => w?.close());

  it('W4 AT-2.6 School, Company and University, in English and Arabic', async () => {
    const expected: Record<string, Record<Lang, { line: string; decimals: string; percent: string }>> = {};
    for (const kit of ['school', 'company', 'university'] as const) {
      expected[kit] = {} as Record<Lang, { line: string; decimals: string; percent: string }>;
      for (const lang of ['en', 'ar'] as const) {
        const t = words(kit, lang);
        const low = (k: 'chapter' | 'lesson') => t(k).toLocaleLowerCase(lang);
        expected[kit][lang] = {
          line: t('orderLine', { chapter: low('chapter'), lesson: low('lesson') }),
          decimals: t('lockedReason', { title: 'Fractions', count: t('lockedCount', { n: '2' }) }),
          percent: t('lockedLater', { count: t('lockedCount', { n: '3' }) }),
        };
      }
    }
    assert.equal(expected.company.en.decimals, 'Opens when Module: Fractions is done (2 sessions left).');
    assert.equal(expected.university.en.decimals, 'Opens when Unit: Fractions is done (2 lectures left).');
    assert.equal(expected.school.en.line, 'Open in order: each chapter opens when every lesson before it is marked done.');
    for (const space of [w.school, w.company, w.university]) {
      await setOrder(w, true, { space });
      for (const lang of ['ar', 'en'] as const) {
        const salma: Client = await as(w, SALMA, lang);
        const html = await (await salma.get(subjectPath(space, space.math))).text();
        const want = expected[space.kit][lang];
        assert.equal(orderBox(html)!.line, want.line, `${space.kit} ${lang}: the order line`);
        assert.equal(lockOf(summaryOf(chapterHtml(html, space.chapters.Decimals)))!.reason, want.decimals, `${space.kit} ${lang}: the first reason`);
        assert.equal(lockOf(summaryOf(chapterHtml(html, space.chapters.Percent)))!.reason, want.percent, `${space.kit} ${lang}: a later reason`);
        assert.equal(lockOf(summaryOf(chapterHtml(html, space.chapters.Decimals)))!.tag, words(space.kit, lang)('lockedTag'), `${space.kit} ${lang}: the tag`);
      }
    }
    void MATH_ORDER;
    void markPath;
  });
});
