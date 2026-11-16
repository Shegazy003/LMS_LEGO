// AT-1.6 (product-contract v2, LMS wave 1, L1): no other learner's name,
// username or result appears on the learner home, in Arabic or English. (The
// AT-13b crawl, in job release-2, starts from the same home for its learner.)
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { ADMIN, HADEER, KARIM, OMAR, SALMA, SHIMAA, YOUSSEF, as, home, wave1World, withResults, type Wave1World } from './world.ts';

describe('AT-1.6 the home shows no other learner\'s name, username or result', { concurrency: false }, () => {
  let w: Wave1World;
  before(async () => {
    w = await wave1World();
    await withResults(w);
  });
  after(async () => {
    await w?.close();
  });

  for (const lang of ['ar', 'en'] as const) {
    it(`${lang}: Salma's home, in each of her spaces`, async () => {
      const c = await as(w, SALMA, lang);
      for (const s of [w.school, w.company, w.university]) {
        const res = await c.get(home(s));
        assert.equal(res.status, 200);
        const body = (await res.text()).toLowerCase();
        assert.ok(body.includes('mathematics'), 'positive control: the home is the learner home');
        const forbidden = [
          OMAR.display_name, YOUSSEF.display_name, KARIM.display_name,
          ...[OMAR, YOUSSEF, KARIM, HADEER, SHIMAA, ADMIN].map((p) => p.username), 'hadeer.trainer', 'hadeer.lecturer',
          '11 / 20', 'quiz 1',
        ];
        const hits = forbidden.filter((f) => body.includes(f.toLowerCase()));
        assert.deepEqual(hits, [], `${s.kit} home`);
      }
    });
  }
});
