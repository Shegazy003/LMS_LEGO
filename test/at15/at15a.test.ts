// AT-15a (contract product-contract-r2, R2-d): off by default. With the
// setting off (the state after deploy), a learner opens lessons and no row is
// written (database check). The guardian's learner page shows "Lesson activity
// is not switched on in <space>." and nothing else about lessons.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { useLanguage, visible } from '../at13/pages.ts';
import { A, B, C, D, G1, G2, HADEER, as } from '../at9/world.ts';
import { activityPath, activityWorld, open, settingRow, switchPath, viewRows, type ActivityWorld } from './activity.ts';

const OFF = { en: 'Lesson activity is not switched on in مدرسة مسك.', ar: 'نشاط الدروس غير مفعّل في مدرسة مسك.' };

describe('AT-15a lesson activity is off by default: nothing is recorded, and the guardian is told it is not switched on', { concurrency: false }, () => {
  let w: ActivityWorld;
  before(async () => {
    w = await activityWorld();
  });
  after(async () => {
    await w?.close();
  });

  it('after deploy the space has no switch row (off), and the admin page says off', async () => {
    assert.equal(await settingRow(w), null, 'no setting row: off');
    const page = await (await w.admin.get(switchPath(w))).text();
    assert.match(page, /id="activity-status" class="message" data-state="off"/);
  });

  it('learners open their lessons, files and subjects, twice: no lesson-view row is written', async () => {
    for (let i = 0; i < 2; i++) {
      for (const who of [A, B, C, D]) assert.equal((await open(w, who)).status, 200, `${who.username} opens the lesson`);
      assert.equal((await open(w, A, (await w.p.sql(`SELECT id FROM lesson WHERE title = 'Nahw basics'`))[0].id as string)).status, 200);
      const a = await as(w, A);
      for (const path of [`/learn/${w.content.math}`, `/file/${w.content.pdf}`, '']) assert.equal((await a.get(`/s/${w.spaceId}${path}`)).status, 200);
      await (await as(w, HADEER)).get(`/s/${w.spaceId}/read/${w.content.lesson}`);
      await w.admin.get(`/s/${w.spaceId}/read/${w.content.lesson}`);
    }
    assert.deepEqual(await viewRows(w), [], 'no row in lesson_view');
    assert.equal(await settingRow(w), null, 'still off');
  });

  it('the guardian\'s learner page and the lesson-activity address show only "not switched on", in Arabic and English, and nothing else about lessons', async () => {
    for (const [g, learners] of [[G1, [A, B]], [G2, [A]]] as const) {
      const c = await as(w, g);
      for (const lang of ['ar', 'en'] as const) {
        await useLanguage(c, lang);
        for (const l of learners) {
          for (const path of [`/s/${w.spaceId}/linked/${w.ids[l.username]}`, activityPath(w, w.ids[l.username])]) {
            const res = await c.get(path);
            assert.equal(res.status, 200, `${g.username} ${path}`);
            assert.equal(res.headers.get('cache-control'), 'no-store');
            const html = await res.text();
            const text = visible(html);
            const line = html.match(/<p id="activity-off"[^>]*>([\s\S]*?)<\/p>/)?.[1].replace(/<[^>]+>/g, '');
            assert.equal(line, OFF[lang], `${lang} ${path}: the line`);
            for (const word of ['Adding fractions', 'Nahw basics', 'Last opened', 'No open recorded', 'Recording since', 'آخر فتح', 'التسجيل منذ']) {
              assert.ok(!text.includes(word), `${lang} ${path}: nothing else about lessons (${word})`);
            }
            assert.ok(!html.includes('class="activity-link"'), `${lang} ${path}: no way to an activity page`);
          }
        }
        const home = await (await c.get(`/s/${w.spaceId}/linked`)).text();
        assert.ok(!home.includes('data-activity'), `${lang}: the guardian home says nothing about lesson activity while it is off`);
      }
    }
  });

  it('the learner is not told anything while it is off: no notice on the home page or the lesson page', async () => {
    const a = await as(w, A);
    for (const path of [`/s/${w.spaceId}`, `/s/${w.spaceId}/read/${w.content.lesson}`]) {
      assert.ok(!(await (await a.get(path)).text()).includes('id="activity-notice"'), path);
    }
  });
});
