// W3a AT-1 (product-contract v2 on PIL-216, sections 4 and 9): who may
// preview, and what each may see. Request level, in Arabic and English; the
// owner's reads under the statement spy. Each labelled expectation is its own
// CI step (--test-name-pattern "W3a AT-1.<n>").
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Client } from '../support/http.ts';
import { OWNER } from '../support/seed.ts';
import {
  ADMIN, HADEER, MONA, SALMA, YOUSSEF, as, home, lessonPath, ownerPreview, ownerPreviewResults, previewHome, previewLesson, previewResults,
  previewSubject, subjectPath, textOfHtml, wave3aWorld, word, type Wave3aWorld,
} from './world.ts';

/** The titles of the cards on a home, in order. */
const cardTitles = (doc: string) => [...doc.matchAll(/<li class="card" data-subject="[^"]+">\s*<h2 class="title"><a [^>]*><bdi>([^<]*)<\/bdi>/g)].map((m) => m[1]);

/** Asserts today's plain refusal (403, the noAccess sentence, no banner). */
async function refused(c: Client, path: string, lang: 'ar' | 'en', what: string): Promise<void> {
  const res = await c.get(path);
  const body = await res.text();
  assert.equal(res.status, 403, `${what}: ${path} answers 403`);
  assert.ok(body.includes(`<p class="message">${word(lang, 'noAccess')}</p>`), `${what}: today's plain refusal`);
  assert.ok(!body.includes('preview-banner'), `${what}: no banner on a refusal`);
}

const FAKE = '00000000-0000-4000-8000-000000000000';

describe('W3a AT-1 who may preview, and what each may see', { concurrency: false }, () => {
  let w: Wave3aWorld;
  before(async () => {
    w = await wave3aWorld();
  });
  after(async () => {
    await w?.close();
  });

  /** Every preview address of Mesk School, with real and made-up ids. */
  const addresses = () => [
    previewHome(w.school), previewHome(w.school, 'home'), previewResults(w.school),
    previewSubject(w.school, w.school.math), previewSubject(w.school, w.school.physics), previewSubject(w.school, FAKE),
    previewLesson(w.school, w.school.lessons['Adding fractions']), previewLesson(w.school, w.school.lessons['Old decimals']), previewLesson(w.school, FAKE),
    `/s/${w.school.id}/preview/anything`, `/s/${w.school.id}/preview/learn/${w.school.math}?open=all&from=home`,
  ];

  it('W3a AT-1.1 the admin\'s preview home lists exactly the space\'s published subjects; every subject can be previewed', async () => {
    for (const lang of ['ar', 'en'] as const) {
      const amal = await as(w, ADMIN, lang);
      const res = await amal.get(previewHome(w.school, 'home'));
      assert.equal(res.status, 200);
      assert.deepEqual(cardTitles(await res.text()), ['Arabic grammar', 'Mathematics', 'Reading club', 'Science club']);
      for (const id of [w.school.arabic, w.school.math, w.school.reading, w.school.science, w.school.physics, w.chemistry]) {
        assert.equal((await amal.get(previewSubject(w.school, id, undefined, 'home'))).status, 200, `subject ${id}`);
      }
      for (const id of [...Object.values(w.school.arabicLessons), w.school.lessons['Adding fractions'], w.school.lessons['Review sheet']]) {
        assert.equal((await amal.get(previewLesson(w.school, id, 'home'))).status, 200, `lesson ${id}`);
      }
    }
  });

  it('W3a AT-1.2 the publisher\'s preview home lists only her published subjects; another publisher\'s subject is refused', async () => {
    for (const lang of ['ar', 'en'] as const) {
      const hadeer = await as(w, HADEER, lang);
      const res = await hadeer.get(previewHome(w.school, 'home'));
      assert.equal(res.status, 200);
      assert.deepEqual(cardTitles(await res.text()), ['Mathematics']);
      assert.equal((await hadeer.get(previewSubject(w.school, w.school.math))).status, 200, 'Mathematics');
      assert.equal((await hadeer.get(previewSubject(w.school, w.school.physics))).status, 200, 'Physics (unpublished, hers)');
      assert.equal((await hadeer.get(previewLesson(w.school, w.school.lessons['Reading decimals']))).status, 200, 'a Mathematics lesson');
      await refused(hadeer, previewSubject(w.school, w.school.arabic), lang, 'Arabic grammar');
      await refused(hadeer, previewLesson(w.school, w.school.arabicLessons['The noun']), lang, 'an Arabic grammar lesson');
    }
  });

  it('W3a AT-1.3 the owner\'s preview is an empty learner home with the space\'s look, and reads nothing inside the space', async (t) => {
    const spy = w.p.spy;
    assert.ok(spy, 'the statement spy runs on the in-process product (LMS_TEST_RUNTIME=in-process)');
    for (const lang of ['ar', 'en'] as const) {
      // The owner's own language (My account), as a learner's decides theirs.
      const owner = await as(w, OWNER, lang);
      spy.start();
      const res = await owner.get(ownerPreview(w.school));
      const results = await owner.get(ownerPreviewResults(w.school));
      const statements = await spy.stop();
      assert.equal(res.status, 200);
      assert.equal(results.status, 200);
      const doc = await res.text();
      assert.ok(doc.includes(`id="space-name">مدرسة مسك<`), 'the space\'s name');
      assert.ok(doc.includes(`src="/s/${w.school.id}/logo"`), 'the space\'s logo');
      assert.ok(doc.includes('style="background:#0b6e4f"'), 'the space\'s colour');
      assert.ok(doc.includes(`id="nothing-yet"`) && doc.includes(word(lang, 'nothingAssigned')), 'nothing assigned');
      assert.ok(!/data-subject=|id="notice-|id="results"/.test(doc), 'no subject, notice or result');
      assert.ok((await results.text()).includes(`id="results-none"`), 'My results: the empty state');
      const forbidden = /\b(membership|group|group_member|subject|subject_access|chapter|lesson|material|guardian_link|exam|exam_result|exam_result_history|lesson_view_setting|lesson_view)\b/i;
      const named = statements.filter((s) => forbidden.test(s.replace(/'[^']*'/g, "''")));
      t.diagnostic(`owner preview statements (${lang}): ${statements.length}`);
      assert.deepEqual(named, [], 'no statement names a table inside the space');
      // The logo itself, which the owner already sees on the space page, from the learner's address.
      assert.equal((await owner.get(`/s/${w.school.id}/logo`)).status, 200, 'the logo loads for the owner');
      assert.ok(doc.startsWith(`<!doctype html>\n<html lang="${lang}"`), 'in the owner\'s language');
    }
    assert.equal((await w.owner.get(`${ownerPreview(w.school)}/learn/${w.school.math}`)).status, 404, 'no subject preview for the owner');
    assert.equal((await w.owner.get(`${ownerPreview(w.school)}/read/${w.school.lessons['Adding fractions']}`)).status, 404, 'no lesson preview for the owner');
    assert.equal((await w.owner.get(ownerPreview({ id: FAKE }))).status, 404, 'an unknown space: today\'s owner-page 404');
  });

  it('W3a AT-1.4 learners and guardians are refused every preview address, and see no preview link', async () => {
    for (const lang of ['ar', 'en'] as const) {
      for (const who of [SALMA, MONA, YOUSSEF]) {
        const c = await as(w, who, lang);
        for (const path of addresses()) await refused(c, path, lang, `${who.username} ${path}`);
        // The owner's preview address: today's owner gate.
        const o = await c.get(ownerPreview(w.school));
        assert.equal(o.status, 403, `${who.username}: the owner's preview is refused`);
        const pages = [home(w.school), subjectPath(w.school, w.school.math), lessonPath(w.school, w.school.lessons['Adding fractions']), `/s/${w.school.id}/results`, `/s/${w.school.id}/linked`];
        for (const path of pages) {
          const res = await c.get(path);
          if (res.status !== 200) continue;
          assert.ok(!/href="[^"]*\/preview/.test(await res.text()), `${who.username}: no preview link on ${path}`);
        }
      }
    }
    for (const who of [ADMIN, HADEER]) {
      const c = await as(w, who, 'en');
      assert.equal((await c.get(ownerPreview(w.school))).status, 403, `${who.username}: the owner's preview is refused`);
    }
  });

  it('W3a AT-1.5 the admin\'s preview of another space\'s subject or lesson is refused', async () => {
    for (const lang of ['ar', 'en'] as const) {
      const amal = await as(w, ADMIN, lang);
      for (const path of [
        previewSubject(w.school, w.company.math), previewSubject(w.school, w.company.forklift),
        previewLesson(w.school, w.company.forkliftLesson), previewLesson(w.school, w.company.lessons['Adding fractions']),
      ]) await refused(amal, path, lang, `Amal ${path}`);
      // And under the other space's own address, where Amal has no place.
      await refused(amal, previewHome(w.company), lang, 'Amal in Delta Logistics');
      void textOfHtml;
    }
  });
});
