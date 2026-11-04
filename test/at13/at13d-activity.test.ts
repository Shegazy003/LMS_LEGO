// AT-13d on the R2-d pages (contract product-contract-r2): every new label and
// message exists in Arabic (right to left) and English (left to right),
// through the dictionary and the kit; Cache-Control: no-store is on every
// lesson-activity page in every state (the admin's switch page, its step and
// its refusal; the guardian's page on, off and refused; the guardian's learner
// page and home; the learner's home and lesson pages with the notice).
import { describe, it, before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { UI } from '../../src/i18n/ui.ts';
import { makeLabel } from '../../src/labels.ts';
import { seedKit } from '../../src/kits/seed.ts';
import { activityPath, activityWorld, open, switchOn, type ActivityWorld } from '../at15/activity.ts';
import { C, as } from '../at9/world.ts';
import { A, B, G1, R2D_KEYS, useLanguage } from './pages.ts';

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test('AT-13d every R2-d label and message is in the dictionary in Arabic and English, with the same placeholders', () => {
  for (const key of R2D_KEYS) {
    const en = (UI.en as Record<string, string>)[key];
    const ar = (UI.ar as Record<string, string>)[key];
    assert.ok(en && en.trim(), `en.${key}`);
    assert.ok(ar && /[؀-ۿ]/.test(ar), `ar.${key} is Arabic`);
    assert.ok(!/[؀-ۿ]/.test(en), `en.${key} is English`);
    assert.deepEqual(placeholders(ar), placeholders(en), `${key}: the same placeholders`);
  }
});

test('AT-13d the feature\'s words come from the kit: its name, the lessons, and your guardian / the learner, School and Company', () => {
  const words = {
    school: { en: ['Lesson activity', 'lessons', 'Your parent', 'child'], ar: ['نشاط الدروس', 'الدروس', 'ولي أمرك', 'الطفل'] },
    company: { en: ['Lesson activity', 'lessons', 'Your supervisor', 'employee'], ar: ['نشاط الدروس', 'الدروس', 'مشرفك', 'الموظّف'] },
  } as const;
  for (const [seed, byLang] of Object.entries(words)) {
    for (const lang of ['en', 'ar'] as const) {
      const t = makeLabel(lang, seedKit(seed));
      assert.deepEqual(['lessonActivity', 'lessons', 'yourGuardian', 'child'].map((k) => t(k as 'lessons')), [...byLang[lang]], `${seed} ${lang}`);
    }
  }
  // A kit stored before release 2 carries none of these: its seed kit's words are used.
  const old = seedKit('school');
  assert.equal(makeLabel('ar', old)('activityNotice'), 'يستطيع ولي أمرك أن يرى أي الدروس فتحتها وتاريخ آخر فتح لها.');
});

describe('AT-13d no-store and the page direction on every lesson-activity page, in every state', { concurrency: false }, () => {
  let w: ActivityWorld;
  before(async () => {
    w = await activityWorld();
  });
  after(async () => {
    await w?.close();
  });

  it('off, on, refused: every page is no-store, right to left in Arabic and left to right in English', async () => {
    const g1 = await as(w, G1);
    const a = await as(w, A);
    const pages = (): [string, typeof g1, string, number][] => [
      ['admin', w.admin, `/s/${w.spaceId}/admin/activity`, 200], ['admin', w.admin, `/s/${w.spaceId}/admin/activity/off`, 200],
      ['admin', w.admin, `/s/${w.spaceId}`, 200],
      ['G1', g1, activityPath(w, w.ids[A.username]), 200], ['G1', g1, activityPath(w, w.ids[B.username]), 200], ['G1', g1, activityPath(w, w.ids[C.username]), 403],
      ['G1', g1, activityPath(w, 'no-such-person'), 403], ['G1', g1, `/s/${w.spaceId}/linked/${w.ids[A.username]}`, 200], ['G1', g1, `/s/${w.spaceId}/linked`, 200],
      ['A', a, `/s/${w.spaceId}`, 200], ['A', a, `/s/${w.spaceId}/read/${w.content.lesson}`, 200],
    ];
    let checked = 0;
    for (const state of ['off', 'on'] as const) {
      if (state === 'on') {
        await switchOn(w);
        assert.equal((await open(w, A)).status, 200);
      }
      for (const lang of ['ar', 'en'] as const) {
        for (const c of [w.admin, g1, a]) await useLanguage(c, lang);
        for (const [who, c, path, status] of pages()) {
          const res = await c.get(path);
          assert.equal(res.status, status, `${state} ${lang} ${who} ${path}`);
          assert.equal(res.headers.get('cache-control'), 'no-store', `${state} ${lang} ${who} ${path}: no-store`);
          const html = await res.text();
          assert.match(html, new RegExp(`<html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}">`), `${state} ${lang} ${who} ${path}: direction`);
          checked++;
        }
      }
    }
    // The refused switch-on (no tick) is no-store too.
    const refused = await w.admin.post(`/s/${w.spaceId}/admin/activity/off`, {});
    assert.equal(refused.status, 303);
    const noTick = await w.admin.post(`/s/${w.spaceId}/admin/activity`, {});
    assert.equal(noTick.status, 400);
    assert.equal(noTick.headers.get('cache-control'), 'no-store');
    assert.ok(checked >= 40);
  });
});
