// LMS wave 4, W4-1a (product-contract v2 on PIL-238, AT-4): only the learner
// sees a lock; the preview shows a new learner; a fixed number of reads. One
// describe per labelled expectation, each its own CI step (`W4 AT-4.<n> ...`,
// selected with --test-name-pattern), each on a fresh world. The privacy scans
// of AT-4.5 are test/at13/at13a.test.ts and at13b.test.ts (with A's locks
// present), run by the same CI step. Made-up data only.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Client } from '../support/http.ts';
import { OWNER, signedIn } from '../support/seed.ts';
import { crawl, type Reached } from '../at13/pages.ts';
import { UI } from '../../src/i18n/ui.ts';
import {
  ADMIN, HADEER, MONA, OMAR, SALMA, SHIMAA, T1, as, chapterHtml, editorPath, goToOf, home, inline, lessonPath, lockOf, markClock, markPath, press,
  previewLesson, previewSubject, setOrder, subjectPath, summaryOf, topicPath, wave2World, wave4World, withTwoRoles, type Wave1World,
} from './world.ts';

const L = (w: Wave1World, title: string) => w.school.lessons[title];
const CHAPTERS = ['Fractions', 'Empty chapter', 'Decimals', 'Percent', 'Review'];
const LOCKED = (reason: string) => ({ tag: 'Locked', reason });

/** Every sign of a lock a page could carry: its markers anywhere, its words in the text a person reads. */
function lockSigns(body: string): string[] {
  const hits: string[] = [];
  for (const marker of ['id="order-box"', 'data-locked', 'class="lock-tag"', 'id="go-to"', 'id="next-locked"', 'class="lock-item"', 'id="lock-reason"', 'id="open-change"']) {
    if (body.includes(marker)) hits.push(marker);
  }
  const text = inline(body, { hidden: true });
  for (const lang of ['en', 'ar'] as const) {
    // W4-1b: and the two status lines after a press.
    for (const key of ['orderLine', 'lockedTag', 'lockedReason', 'lockedLater', 'goTo', 'markedOpened', 'markedRelocked'] as const) {
      // The longest fixed part that the setting card's own words (explanation, change note) do not hold
      // (the Arabic «الوصول إلى ما بعد» of the relocked line is inside the explanation).
      const card = UI[lang].orderExplain + UI[lang].orderAddNote;
      const parts = UI[lang][key].split(/{[^}]*}/).map((x) => x.trim()).filter((x) => x.length > 2).sort((x, y) => y.length - x.length);
      const fixed = parts.find((x) => !card.includes(x)) ?? parts[0];
      // The order line's longest fixed part is also in the setting card's explanation; the line's own start is looked for instead.
      const probe = key === 'orderLine' ? UI[lang][key].split('{')[0].trim() + ' ' + UI[lang][key].split('}')[1].split('{')[0].trim() : fixed;
      if (text.includes(probe)) hits.push(`${lang} ${key}`);
    }
  }
  return hits;
}

/** A page without the setting card and the change note: what is left must be exactly the page with the setting off. */
const withoutSetting = (body: string) => body
  .replace(/<section id="order-state"[\s\S]*?<\/section>/g, '[setting card]')
  .replace(/<p class="order-note" data-order-note>[\s\S]*?<\/p>/g, '')
  // The owner's usage today counts the crawl's own requests, so it grows between the two crawls.
  .replace(/<div id="usage"[\s\S]*?(?=<h2|<\/main>)/g, '[usage today]');

/** Salma's Fractions done (Adding and Comparing fractions), and one lesson open recorded. */
async function salmaFractions(w: Wave1World): Promise<Client> {
  const salma = await as(w, SALMA, 'en');
  for (const title of ['Adding fractions', 'Comparing fractions']) assert.equal((await press(salma, w.school, L(w, title), 'done')).status, 303);
  assert.equal((await salma.get(lessonPath(w.school, L(w, 'Adding fractions')))).status, 200);
  return salma;
}

// ------------------------------------------------------------------ AT-4.1 ----
describe('W4 AT-4.1 no page of Amal, Hadeer, Mona or the owner shows a lock; the only new things are the setting card and the change note', { concurrency: false }, () => {
  it('W4 AT-4.1 every page they reach, in Arabic and English, equals the page with the setting off but for the setting card', async (t) => {
    const w = await wave4World({ activity: true });
    try {
      const s = w.school;
      await setOrder(w, true);
      await salmaFractions(w);
      const people: [string, { username: string; password: string }][] = [['Amal', ADMIN], ['Hadeer', HADEER], ['Mona', MONA], ['the owner', OWNER]];
      const typed = (who: string) => (who === 'Amal' || who === 'Hadeer'
        ? [subjectPath(s, s.math), subjectPath(s, s.math, 'all'), ...['Adding fractions', 'Comparing fractions', 'Reading decimals', 'What is a percent', 'Review sheet'].map((x) => lessonPath(s, L(w, x)))]
        : []);
      const keep = (p: string) => !p.includes('/preview') && !p.includes('signout') && !p.startsWith('/r/');
      const crawlAll = async (state: string) => {
        const out = new Map<string, Reached[]>();
        for (const [who, person] of people) {
          const c = who === 'the owner' ? await signedIn(w.p.url, OWNER.username, OWNER.password) : await as(w, person, 'en');
          for (const lang of ['ar', 'en'] as const) {
            assert.equal((await c.post('/account/language', { lang })).status, 303);
            const start = who === 'the owner' ? ['/owner', '/home'] : ['/home', `/s/${s.id}`];
            out.set(`${who} ${lang}`, await crawl(c, start, typed(who), 120, keep));
          }
        }
        t.diagnostic(`AT-4.1 ${state}: ${[...out].map(([k, v]) => `${k} ${v.length}`).join(', ')}`);
        return out;
      };
      const on = await crawlAll('setting on');
      // Opens and marks stay as they are; only the setting changes.
      await setOrder(w, false);
      const off = await crawlAll('setting off');
      let cards = 0;
      for (const [key, pages] of on) {
        const offPages = new Map(off.get(key)!.map((p) => [p.path, p]));
        assert.deepEqual(pages.map((p) => p.path).sort(), [...offPages.keys()].sort(), `${key}: the same pages are reachable`);
        for (const p of pages) {
          if (!p.contentType.startsWith('text/')) continue;
          assert.deepEqual(lockSigns(p.body), [], `${key} ${p.path}: no lock, reason, order box or marker`);
          const hasCard = p.body.includes('id="order-state"');
          const settingPage = p.path.split('?')[0] === editorPath(s, s.math) || p.path.split('?')[0] === topicPath(s, s.math);
          if (hasCard) {
            cards++;
            assert.ok(/^\/s\/[^/]+\/(publish\/edit|admin\/topics)\/[^/?]+$/.test(p.path.split('?')[0]), `${key} ${p.path}: the card only on a setting page`);
            const block = /<section id="order-state"[\s\S]*?<\/section>/.exec(p.body)![0];
            for (const name of [SALMA.display_name, OMAR.display_name]) assert.ok(!block.includes(name), `${key}: the card names no learner`);
            assert.ok(!/\d/.test(inline(block)), `${key}: the card has no count or total`);
          }
          if (settingPage) assert.ok(hasCard, `${key} ${p.path}: the setting card`);
          const before = offPages.get(p.path)!;
          assert.equal(p.status, before.status, `${key} ${p.path}: the same status`);
          assert.equal(withoutSetting(p.body), withoutSetting(before.body), `${key} ${p.path}: exactly the page with the setting off, but for the setting card and the change note`);
        }
      }
      assert.ok(cards >= 4, `the setting card was seen (${cards})`);
      // Hadeer's change note shows only with the setting on.
      const hadeer = await as(w, HADEER, 'en');
      assert.ok(!(await (await hadeer.get(editorPath(s, s.math))).text()).includes('data-order-note'), 'off: no change note');
      await setOrder(w, true);
      const note = await (await hadeer.get(editorPath(s, s.math))).text();
      assert.equal((note.match(/data-order-note/g) ?? []).length, CHAPTERS.length, 'on: the change note at each add-lesson form');
      // Mona's activity page for Salma and Amal's activity page: the same with the setting on and off, for the same stored opens (A12).
      const mona = await as(w, MONA, 'en');
      const amal = await as(w, ADMIN, 'en');
      const activity = async () => [await (await mona.get(`/s/${s.id}/linked/${w.ids[SALMA.username]}/activity`)).text(), await (await amal.get(`/s/${s.id}/admin/activity`)).text()];
      const withOn = await activity();
      await setOrder(w, false);
      assert.deepEqual(await activity(), withOn, 'the activity pages do not change with the setting');
      assert.ok(withOn[0].includes('Adding fractions'), 'the recorded open is listed');
    } finally {
      await w.close();
    }
  });
});

// ------------------------------------------------------------------ AT-4.2 ----
describe('W4 AT-4.2 each learner\'s locks come from their own marks only', { concurrency: false }, () => {
  it('W4 AT-4.2 Omar C has Decimals locked while Salma has it open, and the reverse after Omar C finishes Fractions and Salma undoes one mark', async () => {
    const w = await wave4World({ activity: true });
    try {
      const s = w.school;
      await setOrder(w, true);
      const salma = await salmaFractions(w);
      const omar = await as(w, OMAR, 'en');
      const decimals = async (c: Client) => lockOf(summaryOf(chapterHtml(await (await c.get(subjectPath(s, s.math))).text(), s.chapters.Decimals)));
      assert.equal(await decimals(salma), null, 'Salma: Decimals open');
      assert.deepEqual(await decimals(omar), LOCKED('Opens when Chapter: Fractions is done (2 lessons left).'), 'Omar C: Decimals locked');
      for (const title of ['Adding fractions', 'Comparing fractions']) assert.equal((await press(omar, s, L(w, title), 'done')).status, 303);
      assert.equal((await press(salma, s, L(w, 'Comparing fractions'), 'not-done')).status, 303);
      assert.equal(await decimals(omar), null, 'Omar C: Decimals open');
      assert.deepEqual(await decimals(salma), LOCKED('Opens when Chapter: Fractions is done (1 lesson left).'), 'Salma: Decimals locked again');
      assert.equal((await salma.get(lessonPath(s, L(w, 'Reading decimals')))).text !== undefined, true);
      assert.ok((await (await salma.get(lessonPath(s, L(w, 'Reading decimals')))).text()).includes('id="lock-reason"'), 'Salma: the locked page');
      assert.ok(!(await (await omar.get(lessonPath(s, L(w, 'Reading decimals')))).text()).includes('id="lock-reason"'), 'Omar C: the lesson');
    } finally {
      await w.close();
    }
  });
});

// ------------------------------------------------------------------ AT-4.3 ----
describe('W4 AT-4.3 two roles (W4-b): Amal and Mona get locks from their own marks only, none where they do not read as a learner', { concurrency: false }, () => {
  it('W4 AT-4.3 Amal (admin and learner) and Mona (guardian and learner); Arabic grammar in order shows Amal no lock; their admin and guardian pages show no lock state', async () => {
    const w = await wave4World({ activity: true });
    try {
      const s = w.school;
      await withTwoRoles(w);
      await setOrder(w, true);
      const amal = await as(w, ADMIN, 'en');
      const mona = await as(w, MONA, 'en');
      const salma = await salmaFractions(w);
      const decimals = async (c: Client) => lockOf(summaryOf(chapterHtml(await (await c.get(subjectPath(s, s.math))).text(), s.chapters.Decimals)));
      const locked = LOCKED('Opens when Chapter: Fractions is done (2 lessons left).');
      assert.deepEqual(await decimals(amal), locked, 'Amal, with no mark of her own: locked (Salma\'s marks do not count)');
      assert.deepEqual(await decimals(mona), locked, 'Mona, with no mark of her own: locked');
      assert.equal(await decimals(salma), null);
      for (const title of ['Adding fractions', 'Comparing fractions']) assert.equal((await press(amal, s, L(w, title), 'done')).status, 303);
      assert.equal(await decimals(amal), null, 'Amal after her own marks: open');
      assert.deepEqual(await decimals(mona), locked, 'Mona: still locked');
      // Arabic grammar: Amal reads it as admin only (not assigned to her as a learner); in order, she meets no lock.
      const shimaa = await as(w, SHIMAA, 'en');
      assert.equal((await shimaa.post(`/s/${s.id}/publish/edit/${s.arabic}/order`, { state: 'on' })).status, 303, 'Arabic grammar in order');
      const arabic = await (await amal.get(subjectPath(s, s.arabic))).text();
      assert.deepEqual(lockSigns(arabic), [], 'Amal on Arabic grammar: no lock');
      const arabicLesson = await (await amal.get(lessonPath(s, s.arabicLessons['Past tense']))).text();
      assert.deepEqual(lockSigns(arabicLesson), [], 'Amal on a later Arabic grammar lesson: the lesson, no lock');
      // Amal's admin pages and Mona's guardian pages show no lock state.
      for (const [c, path] of [
        [amal, `/s/${s.id}/admin`], [amal, topicPath(s, s.math)], [amal, `/s/${s.id}/admin/people/${w.ids[SALMA.username]}`], [amal, `/s/${s.id}/admin/activity`],
        [mona, `/s/${s.id}/linked`], [mona, `/s/${s.id}/linked/${w.ids[SALMA.username]}`], [mona, `/s/${s.id}/linked/${w.ids[SALMA.username]}/activity`],
      ] as const) {
        const res = await c.get(path);
        assert.equal(res.status, 200, path);
        assert.deepEqual(lockSigns(await res.text()), [], `${path}: no lock state`);
      }
    } finally {
      await w.close();
    }
  });
});

// ------------------------------------------------------------------ AT-4.4 ----
describe('W4 AT-4.4 the preview shows a new learner\'s locks with preview addresses, reads no done mark and writes nothing', { concurrency: false }, () => {
  it('W4 AT-4.4 Amal\'s and Hadeer\'s preview outline and a locked lesson\'s preview, under the statement spy', async () => {
    const w = await wave4World({ activity: true });
    try {
      const s = w.school;
      await setOrder(w, true);
      await salmaFractions(w); // a learner's marks exist; the preview never reads them
      for (const person of [ADMIN, HADEER]) {
        const c = await as(w, person, 'en');
        await c.get(home(s));
        w.p.spy!.start();
        const outline = await c.get(previewSubject(s, s.math));
        const html = await outline.text();
        const locked = await c.get(previewLesson(s, L(w, 'Reading decimals')));
        const page = await locked.text();
        const open = await (await c.get(previewLesson(s, L(w, 'Comparing fractions')))).text();
        const statements = await w.p.spy!.stop();
        assert.equal(outline.status, 200);
        assert.equal(locked.status, 200);
        const base = `/s/${s.id}/preview`;
        const got = Object.fromEntries(CHAPTERS.map((title) => [title, lockOf(summaryOf(chapterHtml(html, s.chapters[title])))]));
        assert.deepEqual(got, {
          Fractions: null, 'Empty chapter': null,
          Decimals: LOCKED('Opens when Chapter: Fractions is done (2 lessons left).'),
          Percent: LOCKED('Opens when everything before it is done (3 lessons left).'),
          Review: LOCKED('Opens when everything before it is done (4 lessons left).'),
        }, `${person.username}: a new learner's state`);
        const goTo = goToOf(html)!;
        assert.equal(goTo.text, 'Go to: Adding fractions');
        assert.ok(goTo.href.startsWith(`${base}/read/${L(w, 'Adding fractions')}`), `${person.username}: Go to is a preview address (${goTo.href})`);
        // The locked lesson's preview: the locked page, with preview addresses and no material.
        assert.deepEqual(lockOf(page.slice(page.indexOf('<main'))), LOCKED('Opens when Chapter: Fractions is done (2 lessons left).'));
        assert.ok(goToOf(page)!.href.startsWith(`${base}/read/${L(w, 'Adding fractions')}`), 'the locked page\'s Go to is a preview address');
        assert.ok(/<a id="back-to-outline"[^>]*href="\/s\/[^"]+\/preview\/learn\//.test(page), 'Back to the outline is a preview address');
        for (const absent of ['id="items"', 'Tenths and hundredths', '/file/', 'id="done-state"']) assert.ok(!page.includes(absent), `no ${absent}`);
        assert.ok(page.includes('id="preview-banner"'), 'with the preview banner');
        // An open lesson's done block stays inert; the Next into the locked chapter is the plain line.
        assert.match(open, /<button type="button" id="done-control" aria-disabled="true"/, 'the done block stays inert');
        assert.ok(open.includes('id="next-locked"'), 'Next into Decimals is the plain locked line');
        assert.deepEqual(statements.filter((x) => /\bdone_mark\b/.test(x)), [], 'no preview request names done_mark');
        const writes = statements.filter((x) => /^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(x) && !/^\s*(INSERT|UPDATE|DELETE)\s+(INTO\s+|FROM\s+)?(session|usage\w*)\b/i.test(x));
        assert.deepEqual(writes, [], 'the preview writes nothing (only session upkeep and the usage count, as every page)');
      }
    } finally {
      await w.close();
    }
  });
});

// ------------------------------------------------------------------ AT-4.5 ----
describe('W4 AT-4.5 no new cookie, and every learner outline, lesson and home keeps Cache-Control: no-store', { concurrency: false }, () => {
  it('W4 AT-4.5 Salma\'s home, outline, an open lesson and a locked lesson, with the setting on and off: no-store and no cookie but today\'s', async () => {
    const w = await wave4World({ activity: true });
    try {
      const s = w.school;
      const salma = await as(w, SALMA, 'en');
      const cookies = new Set<string>();
      const look = async (state: string) => {
        for (const path of [home(s), subjectPath(s, s.math), subjectPath(s, s.math, 'all'), lessonPath(s, L(w, 'Adding fractions')), lessonPath(s, L(w, 'Reading decimals'))]) {
          const res = await salma.get(path);
          assert.equal(res.status, 200, `${state} ${path}`);
          assert.equal(res.headers.get('cache-control'), 'no-store', `${state} ${path}: no-store`);
          for (const c of res.headers.getSetCookie()) cookies.add(c.split('=')[0]);
        }
        const pressed = await press(salma, s, L(w, 'Adding fractions'), 'done');
        for (const c of pressed.headers.getSetCookie()) cookies.add(c.split('=')[0]);
      };
      await look('off');
      const before = new Set(cookies);
      await setOrder(w, true);
      await look('on');
      assert.ok((await (await salma.get(lessonPath(s, L(w, 'Reading decimals')))).text()).includes('id="lock-reason"'), 'the locked page was among them');
      assert.deepEqual([...cookies].sort(), [...before].sort(), `no new cookie (${[...cookies].join(', ') || 'none'})`);
      for (const name of cookies) assert.ok(/^lms_(session|notice)/.test(name), `only today's cookies: ${name}`);
    } finally {
      await w.close();
    }
  });
});

// ------------------------------------------------------------------ AT-4.6 ----
/** Main b4ad669's reads for Salma's requests (statement spy, the wave 1 world), recorded once from main's code. */
const MAIN_B4AD669 = { home: 5, outline: 6, lesson: 9, mark: 5, file: 5 } as const;
type Kind = keyof typeof MAIN_B4AD669;
// LMS wave 5 (W5-1b, product-contract v2 on PIL-246, AT-3.5): the learner home and the subject's /learn page read their
// announcements once, so main's count plus exactly one there; every other request keeps main's. Named in CANDIDATE READY
// (an assertion outside section 11's list; the Lead decides).
const WAVE5_READS: Record<Kind, number> = { home: 1, outline: 1, lesson: 0, mark: 0, file: 0 };
// LMS wave 6 (W6-1b, product-contract v2 on PIL-257, AT-3.4b): the learner home reads its to-do list once (W5-main's count
// plus exactly one); every other request keeps its count. Named in CANDIDATE READY (outside section 11; the Lead decides).
const WAVE6_READS: Record<Kind, number> = { home: 1, outline: 0, lesson: 0, mark: 0, file: 0 };
const MAIN = Object.fromEntries((Object.keys(MAIN_B4AD669) as Kind[]).map((k) => [k, MAIN_B4AD669[k] + WAVE5_READS[k] + WAVE6_READS[k]])) as Record<Kind, number>;

describe('W4 AT-4.6 reads: off exactly main\'s; on at most 1 more on the outline, lesson and home, 2 more on a file and a mark POST, whatever the size', { concurrency: false }, () => {
  it('W4 AT-4.6 the counts with the setting off and on, in the wave 1 world and in a larger one, are printed', async (t) => {
    const lines: string[] = [];
    let first: Record<Kind, number> | null = null;
    for (const size of ['wave 1 world', 'larger world'] as const) {
      const w = size === 'wave 1 world' ? await wave4World() : await wave2World('more-subjects');
      try {
        const s = w.school;
        if (size === 'larger world') {
          // More chapters and lessons in Mathematics, and many marks: 12 more chapters of 3 lessons, marked done.
          for (let i = 1; i <= 12; i++) {
            await w.p.sql(`INSERT INTO chapter (id, space_id, subject_id, title, position) VALUES ('w4-big-c${i}', '${s.id}', '${s.math}', 'Extra chapter ${i}', ${100 + i})`);
            for (let j = 1; j <= 3; j++) await w.p.sql(`INSERT INTO lesson (id, space_id, chapter_id, title, body_text, position) VALUES ('w4-big-l${i}-${j}', '${s.id}', 'w4-big-c${i}', 'Extra lesson ${i}.${j}', '', ${j})`);
          }
        }
        const salma = await as(w, SALMA, 'en');
        if (size === 'larger world') {
          await markClock(w, T1);
          for (let i = 1; i <= 12; i++) for (let j = 1; j <= 3; j++) assert.equal((await press(salma, s, `w4-big-l${i}-${j}`, 'done')).status, 303);
          await markClock(w, null);
        }
        const pdf = String((await w.p.sql(`SELECT m.id FROM material m WHERE m.space_id = '${s.id}' AND m.kind = 'pdf' AND m.title = 'Worksheet'`))[0].id);
        const requests: Record<Kind, () => Promise<Response>> = {
          home: () => salma.get(home(s)),
          outline: () => salma.get(subjectPath(s, s.math)),
          lesson: () => salma.get(lessonPath(s, L(w, 'Comparing fractions'))),
          mark: () => salma.post(markPath(s, L(w, 'Adding fractions')), { state: 'done' }),
          file: () => salma.get(`/s/${s.id}/file/${pdf}`),
        };
        const measure = async (): Promise<Record<Kind, number>> => {
          const out = {} as Record<Kind, number>;
          for (const kind of Object.keys(requests) as Kind[]) {
            await salma.get(home(s)); // a first visit settles the session refresh
            w.p.spy!.start();
            const res = await requests[kind]();
            await res.arrayBuffer();
            out[kind] = (await w.p.spy!.stop()).filter((x) => /^\s*(SELECT|WITH)\b/i.test(x)).length;
            assert.ok(res.status === 200 || res.status === 303, `${kind}: ${res.status}`);
          }
          return out;
        };
        const off = await measure();
        await setOrder(w, true);
        const on = await measure();
        lines.push(`${size}, off: ${JSON.stringify(off)}; on: ${JSON.stringify(on)}`);
        assert.deepEqual(off, MAIN, `${size}: with the setting off, exactly main's reads`);
        for (const kind of ['home', 'outline', 'lesson'] as const) assert.ok(on[kind] <= MAIN[kind] + 1, `${size} ${kind}: at most 1 more (${on[kind]})`);
        for (const kind of ['mark', 'file'] as const) assert.ok(on[kind] <= MAIN[kind] + 2, `${size} ${kind}: at most 2 more (${on[kind]})`);
        first ??= on;
        assert.deepEqual(on, first, 'the same whatever the number of subjects, chapters, lessons and marks');
      } finally {
        await w.close();
      }
    }
    t.diagnostic(`AT-4.6 database reads (SELECT statements per request, Salma): ${lines.join(' | ')}`);
  });
});
