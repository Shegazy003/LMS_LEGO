// AT-3.3 (product-contract v2, LMS wave 1, L1, section 7.1 "Where"): while
// lesson activity is off, no notice in either form appears (as today), and no
// notice cookie is set.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { SALMA, YOUSSEF, activity, as, home, lessonPath, subjectPath, wave1World, type Wave1World } from './world.ts';
import { noticeCookies, noticeForm, sentencesOf } from './notice.ts';

describe('AT-3.3 while activity is off, no notice in either form', { concurrency: false }, () => {
  let w: Wave1World;
  before(async () => {
    w = await wave1World();
  });
  after(async () => {
    await w?.close();
  });

  for (const state of ['never switched on', 'switched off again'] as const) {
    it(`${state}: home and every lesson page, Arabic and English`, async () => {
      if (state === 'switched off again') {
        await activity(w, true);
        await activity(w, false);
      }
      const s = w.school;
      for (const lang of ['ar', 'en'] as const) {
        for (const who of [SALMA, YOUSSEF]) {
          const c = await as(w, who, lang);
          for (const path of [home(s), subjectPath(s, s.math), ...Object.values(s.lessons).map((id) => lessonPath(s, id))]) {
            const res = await c.get(path);
            const html = await res.text();
            if (res.status !== 200) continue; // Youssef's refusals, and the removed lessons
            assert.equal(noticeForm(html), null, `${who.username} ${lang} ${path}: no notice`);
            assert.deepEqual(sentencesOf(html), []);
            assert.ok(!html.includes('data-activity'), `${path}: nothing about lesson activity`);
            assert.deepEqual(noticeCookies(res), [], `${path}: no notice cookie`);
          }
        }
      }
    });
  }
});
