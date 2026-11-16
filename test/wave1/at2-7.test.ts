// AT-2.7 (product-contract v2, LMS wave 1, L1, section 5.1): lesson and
// subject addresses outside Salma's assignments are refused exactly as today
// (403, the same text); Next and Previous never point outside the subject.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MATH_ORDER, OMAR, SALMA, YOUSSEF, as, lessonPath, plain, subjectPath, wave1World, words, type Wave1World } from './world.ts';

describe('AT-2.7 addresses outside the assignments are refused as today; Next and Previous stay inside the subject', { concurrency: false }, () => {
  let w: Wave1World;
  before(async () => {
    w = await wave1World();
  });
  after(async () => {
    await w?.close();
  });

  it('refused with 403 and today\'s one sentence: another space\'s subject and lesson, the unpublished subject, and Youssef on Salma\'s subjects', async () => {
    const s = w.school;
    const physicsLesson = String((await w.p.sql(`SELECT id FROM lesson WHERE title = 'Speed'`))[0].id);
    const cases: [typeof SALMA, string][] = [
      [SALMA, subjectPath(s, w.company.forklift)], [SALMA, lessonPath(s, w.company.forkliftLesson)],
      [SALMA, subjectPath(w.company, w.company.forklift)], [SALMA, lessonPath(w.company, w.company.forkliftLesson)],
      [SALMA, subjectPath(s, s.physics)], [SALMA, lessonPath(s, physicsLesson)],
      [YOUSSEF, subjectPath(s, s.math)], [YOUSSEF, lessonPath(s, s.lessons['Adding fractions'])],
      [OMAR, subjectPath(s, s.arabic)], [OMAR, lessonPath(s, s.arabicLessons['The noun'])],
    ];
    for (const lang of ['ar', 'en'] as const) {
      const sentence = words('school', lang)('noAccess');
      for (const [who, path] of cases) {
        const c = await as(w, who, lang);
        const res = await c.get(path);
        assert.equal(res.status, 403, `${who.username} ${path}`);
        const body = await res.text();
        assert.ok(/<main><p class="message">[^<]*<\/p><\/main>/.test(body) && plain(body).includes(sentence), `${who.username} ${path}: today's refusal`);
        assert.ok(!/next-lesson|previous-lesson|lesson-nav/.test(body), 'no navigation block on a refusal');
      }
    }
  });

  it('every Next and Previous of every lesson Salma can open points to a lesson of the same subject', async () => {
    const s = w.school;
    const c = await as(w, SALMA, 'en');
    const own = new Set([...MATH_ORDER.map((t) => s.lessons[t])]);
    const grammar = new Set(Object.values(s.arabicLessons));
    for (const [set, ids] of [[own, [...own]], [grammar, [...grammar]], [new Set([s.lessons['First book']]), [s.lessons['First book']]]] as const) {
      for (const id of ids) {
        const body = await (await c.get(lessonPath(s, id))).text();
        const block = body.match(/<nav id="lesson-nav"[\s\S]*?<\/nav>/)?.[0] ?? '';
        assert.ok(block, `${id}: the block is there`);
        for (const m of block.matchAll(/href="\/s\/[^/]+\/read\/([^"?#]+)"/g)) assert.ok(set.has(m[1]), `${id}: points to ${m[1]}, a lesson of its subject`);
      }
    }
  });
});
