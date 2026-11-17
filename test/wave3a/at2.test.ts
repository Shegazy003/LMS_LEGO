// W3a AT-2 (product-contract v2 on PIL-216, sections 5, 7 and 8.2): a preview
// page is exactly the learner's page. Whole documents are compared after the
// closed list of edits N1 to N6 (section 7.3, test/wave3a/world.ts), in Arabic
// and English, with lesson activity off and on. Each labelled expectation is
// its own CI step (--test-name-pattern "W3a AT-2.<n>").
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Client } from '../support/http.ts';
import { OWNER } from '../support/seed.ts';
import {
  ADMIN, HADEER, MATH_ORDER, OMAR, SALMA, SALMA_SUBJECTS, YOUSSEF, activity, as, assertInert, assertSameDocument, element, fresh, home, lessonPath,
  normaliseLearner, normalisePreview, ownerPreview, ownerPreviewResults, physicsPublished, previewHome, previewLesson, previewResults, previewSubject,
  subjectPath, textOfHtml, wave3aWorld, withResults, word, type From, type Normalise, type Wave3aWorld,
} from './world.ts';

const LANGS = ['ar', 'en'] as const;
type Lang = (typeof LANGS)[number];

const cardTitles = (doc: string) => [...doc.matchAll(/<li class="card" data-subject="[^"]+">\s*<h2 class="title"><a [^>]*><bdi>([^<]*)<\/bdi>/g)].map((m) => m[1]);
const hrefs = (doc: string) => [...doc.matchAll(/\bhref="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));

async function ok(c: Client, path: string, what: string): Promise<string> {
  const res = await c.get(path);
  assert.equal(res.status, 200, `${what}: ${path} answers 200`);
  return res.text();
}

/** One AT-2.1 comparison: the normalised preview document equals the normalised learner document (fresh browser). */
async function same(previewer: Client, path: string, learner: Client, learnerPath: string, n: Normalise, what: string): Promise<void> {
  const preview = await ok(previewer, path, what);
  const res = await fresh(learner, learnerPath);
  assert.equal(res.status, 200, `${what}: the learner's ${learnerPath} answers 200`);
  assertSameDocument(normalisePreview(preview, n), normaliseLearner(await res.text(), n), what);
}

describe('W3a AT-2 exactly the learner\'s page', { concurrency: false }, () => {
  let w: Wave3aWorld;
  before(async () => {
    w = await wave3aWorld();
  });
  after(async () => {
    await w?.close();
  });

  const subjectWord = (lang: Lang) => word(lang, 'learner');
  const decimals = () => w.school.chapters.Decimals;

  it('W3a AT-2.0 the fixture still pins the comparisons', async () => {
    const published = (await w.p.sql(`SELECT title FROM subject WHERE space_id = '${w.school.id}' AND is_published = 1 ORDER BY title`)).map((r) => r.title);
    assert.deepEqual(published, SALMA_SUBJECTS, 'Mesk School\'s published subjects');
    const salma = await as(w, SALMA, 'en');
    assert.deepEqual(cardTitles(await ok(salma, home(w.school), 'Salma')), published, 'Salma is assigned exactly the published subjects');
    const hers = (await w.p.sql(`SELECT title FROM subject WHERE space_id = '${w.school.id}' AND is_published = 1 AND publisher_user_id = '${w.ids[HADEER.username]}' ORDER BY title`)).map((r) => r.title);
    assert.deepEqual(hers, ['Mathematics']);
    const omar = await as(w, OMAR, 'en');
    assert.deepEqual(cardTitles(await ok(omar, home(w.school), 'Omar C')), hers, 'Omar C is assigned exactly Hadeer\'s published subjects');
    const youssef = await as(w, YOUSSEF, 'en');
    assert.deepEqual(cardTitles(await ok(youssef, home(w.school), 'Youssef')), [], 'Youssef has none');
  });

  it('W3a AT-2.1 each normalised preview document equals the normalised learner document', async (t) => {
    let compared = 0;
    for (const on of [false, true]) {
      await activity(w, on);
      for (const lang of LANGS) {
        const learnerWord = subjectWord(lang);
        const amal = await as(w, ADMIN, lang);
        const hadeer = await as(w, HADEER, lang);
        const owner = await as(w, OWNER, lang);
        const salma = await as(w, SALMA, lang);
        const omar = await as(w, OMAR, lang);
        const youssef = await as(w, YOUSSEF, lang);
        const tag = `${lang}, activity ${on ? 'on' : 'off'}`;
        const pairs: [Client, Client, From, Normalise, string][] = [
          [amal, salma, 'home', { lang, learnerWord }, 'Amal / Salma'],
          [hadeer, omar, `subject:${w.school.math}`, { lang, learnerWord, noNotice: true }, 'Hadeer / Omar C'],
        ];
        for (const [p, l, from, n, who] of pairs) {
          await same(p, previewHome(w.school, from), l, home(w.school), n, `${who} home (${tag})`);
          for (const open of [undefined, decimals(), 'all']) {
            await same(p, previewSubject(w.school, w.school.math, open, from), l, subjectPath(w.school, w.school.math, open), n, `${who} Mathematics ?open=${open ?? ''} (${tag})`);
          }
          for (const title of MATH_ORDER) {
            await same(p, previewLesson(w.school, w.school.lessons[title], from), l, lessonPath(w.school, w.school.lessons[title]), n, `${who} ${title} (${tag})`);
          }
          compared += 1 + 3 + MATH_ORDER.length;
        }
        await same(owner, ownerPreview(w.school), youssef, home(w.school), { lang, learnerWord, noNotice: true, owner: true }, `owner / Youssef home (${tag})`);
        compared++;
      }
    }
    await activity(w, false);
    t.diagnostic(`AT-2.1 documents compared: ${compared}`);
  });

  it('W3a AT-2.2 every learner link in a preview page leads to its preview address with the same from; Next and Previous follow Salma\'s sequence', async () => {
    for (const lang of LANGS) {
      const amal = await as(w, ADMIN, lang);
      const from: From = `topic:${w.school.math}`;
      const fromParam = `from=${encodeURIComponent(from)}`;
      const pages = [
        previewHome(w.school, from), previewResults(w.school, from), previewSubject(w.school, w.school.math, 'all', from),
        ...MATH_ORDER.map((t) => previewLesson(w.school, w.school.lessons[t], from)), previewSubject(w.school, w.school.reading, undefined, from),
        previewLesson(w.school, w.school.lessons['First book'], from),
      ];
      for (const path of pages) {
        const doc = await ok(amal, path, `Amal ${lang}`);
        for (const href of hrefs(doc)) {
          if (/^https?:\/\//.test(href)) continue; // an outside link, as for the learner
          if (href.startsWith(`/s/${w.school.id}/file/`)) continue; // a material
          const back = href === `/s/${w.school.id}/admin/topics/${w.school.math}`;
          if (back) continue; // "Back to where I was"
          assert.ok(href.startsWith(`/s/${w.school.id}/preview`), `${path}: ${href} is a preview address`);
          const query = href.split('#')[0].split('?')[1] ?? '';
          assert.ok(query.split('&').includes(fromParam), `${path}: ${href} carries ${fromParam}`);
        }
      }
      // Next to the end, then Previous back to the start.
      const seen: string[] = [];
      let path: string | undefined = previewLesson(w.school, w.school.lessons[MATH_ORDER[0]], from);
      while (path) {
        const doc = await ok(amal, path, 'Next');
        seen.push(textOfHtml(element(doc, /<h1 id="lesson-title"[^>]*>/)!.html));
        path = /<a id="next-lesson" class="go next" href="([^"]+)"/.exec(doc)?.[1]?.replace(/&amp;/g, '&');
      }
      assert.deepEqual(seen, MATH_ORDER, 'Next follows Salma\'s sequence');
      const back: string[] = [];
      path = previewLesson(w.school, w.school.lessons[MATH_ORDER.at(-1)!], from);
      while (path) {
        const doc = await ok(amal, path, 'Previous');
        back.push(textOfHtml(element(doc, /<h1 id="lesson-title"[^>]*>/)!.html));
        path = /<a id="previous-lesson" class="go prev" href="([^"]+)"/.exec(doc)?.[1]?.replace(/&amp;/g, '&');
      }
      assert.deepEqual(back, [...MATH_ORDER].reverse(), 'Previous goes back to the start');
    }
  });

  it('W3a AT-2.3 removed items never appear in a preview page; their preview addresses answer 404 as Salma\'s do', async () => {
    const draft = (await w.p.sql(`SELECT l.id FROM lesson l JOIN chapter c ON c.id = l.chapter_id WHERE c.id = '${w.school.chapters['Draft chapter']}'`))[0].id as string;
    for (const lang of LANGS) {
      const salma = await as(w, SALMA, lang);
      for (const who of [ADMIN, HADEER]) {
        const c = await as(w, who, lang);
        const pages = [previewHome(w.school, 'home'), previewSubject(w.school, w.school.math, 'all', 'home'), ...MATH_ORDER.map((t) => previewLesson(w.school, w.school.lessons[t], 'home'))];
        for (const path of pages) {
          const doc = await ok(c, path, who.username);
          for (const removed of ['Old decimals', 'Draft lesson', 'Draft chapter']) assert.ok(!doc.includes(removed), `${who.username} ${path}: no "${removed}"`);
        }
        for (const id of [w.school.lessons['Old decimals'], draft]) {
          const res = await c.get(previewLesson(w.school, id, 'home'));
          const learner = await salma.get(lessonPath(w.school, id));
          assert.equal(learner.status, 404, 'Salma\'s address answers 404');
          assert.equal(res.status, 404, `${who.username}: the preview of a removed lesson answers 404`);
          const body = await res.text();
          assert.ok(body.includes(`<p class="message">${word(lang, 'notFound')}</p>`), 'today\'s "not found"');
          assert.ok(!body.includes('preview-banner'), 'no banner on a 404');
        }
      }
    }
  });

  it('W3a AT-2.5 the admin\'s preview shows the notice in full with Got it inert; the publisher\'s and the owner\'s never', async () => {
    for (const on of [true, false]) {
      await activity(w, on);
      for (const lang of LANGS) {
        const amal = await as(w, ADMIN, lang);
        const hadeer = await as(w, HADEER, lang);
        const owner = await as(w, OWNER, lang);
        const lessons = MATH_ORDER.map((t) => previewLesson(w.school, w.school.lessons[t], 'home'));
        for (const path of [previewHome(w.school, 'home'), ...lessons]) {
          const doc = await ok(amal, path, 'Amal');
          if (on) {
            assert.ok(doc.includes('id="notice-card"') && !doc.includes('id="notice-line"'), `${path}: the full notice`);
            assert.ok(doc.includes(word(lang, 'activityNotice')), `${path}: the notice sentence`);
            assertInert(element(doc, /<[a-z]+\b[^>]*\bid="notice-fold"[^>]*>/)!.html, 'got-it');
          } else {
            assert.ok(!/id="notice-(card|line)"/.test(doc), `${path}: no notice with activity off`);
          }
        }
        for (const [c, paths, who] of [[hadeer, [previewHome(w.school, 'home'), ...lessons], 'Hadeer'], [owner, [ownerPreview(w.school), ownerPreviewResults(w.school)], 'owner']] as const) {
          for (const path of paths) {
            const doc = await ok(c, path, who);
            assert.ok(!/id="notice-(card|line|fold)"|id="activity-notice"/.test(doc), `${who} ${path}: no notice (activity ${on ? 'on' : 'off'})`);
          }
        }
      }
    }
  });

  it('W3a AT-2.6 My results in preview is the learner\'s empty state; no preview address shows a result', async () => {
    await withResults(w);
    for (const lang of LANGS) {
      const amal = await as(w, ADMIN, lang);
      const results = await ok(amal, previewResults(w.school, 'home'), 'My results');
      assert.ok(results.includes(`<p id="results-none" class="card message">${word(lang, 'resultsNone')}</p>`), 'the empty state');
      const pages = [previewHome(w.school, 'home'), previewSubject(w.school, w.school.math, 'all', 'home'), ...MATH_ORDER.map((t) => previewLesson(w.school, w.school.lessons[t], 'home'))];
      for (const doc of [results, ...(await Promise.all(pages.map((p) => ok(amal, p, 'page'))))]) {
        assert.ok(!doc.includes('Quiz 1') && !/id="results"|data-result/.test(doc), 'no result');
      }
      for (const id of ['w1-result-salma', 'w1-result-omar']) {
        assert.equal((await amal.get(`${previewResults(w.school)}/${id}`)).status, 404, 'no preview address of one result');
      }
    }
  });

  it('W3a AT-2.4 Physics: never on a preview home; its preview equals Omar C\'s Physics pages in world W-b, with the unpublished line', async () => {
    const speed = (await w.p.sql(`SELECT l.id FROM lesson l JOIN chapter c ON c.id = l.chapter_id WHERE c.subject_id = '${w.school.physics}'`))[0].id as string;
    const from: From = `subject:${w.school.physics}`;
    const taken: { lang: Lang; outline: string; lesson: string }[] = [];
    for (const lang of LANGS) {
      for (const who of [ADMIN, HADEER]) {
        const c = await as(w, who, lang);
        assert.ok(!(await ok(c, previewHome(w.school, 'home'), who.username)).includes('Physics'), `${who.username}: no Physics on the preview home`);
      }
      const hadeer = await as(w, HADEER, lang);
      const outline = await ok(hadeer, previewSubject(w.school, w.school.physics, undefined, from), 'Physics outline');
      const lesson = await ok(hadeer, previewLesson(w.school, speed, from), 'Physics lesson');
      for (const doc of [outline, lesson]) {
        const line = element(doc, /<p\b[^>]*\bid="preview-unpublished"[^>]*>/);
        assert.ok(line, 'the unpublished line');
        // Inline tags (the kit words' <bdi>) add no space, as a browser reads them.
        assert.equal(line.html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(), word(lang, 'previewUnpublished'), 'its wording');
      }
      taken.push({ lang, outline, lesson });
    }
    await physicsPublished(w);
    for (const { lang, outline, lesson } of taken) {
      const omar = await as(w, OMAR, lang);
      const n: Normalise = { lang, learnerWord: subjectWord(lang), noNotice: true };
      for (const [doc, path, what] of [[outline, subjectPath(w.school, w.school.physics), 'outline'], [lesson, lessonPath(w.school, speed), 'lesson']] as const) {
        const res = await fresh(omar, path);
        assert.equal(res.status, 200, `Omar C's Physics ${what} in W-b`);
        assertSameDocument(normalisePreview(doc, n), normaliseLearner(await res.text(), n), `Physics ${what} (${lang})`);
      }
    }
  });
});
