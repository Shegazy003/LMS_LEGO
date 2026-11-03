// AT-13d (contract product-contract-r2, R2-a pages): every new label and
// message exists in Arabic (right to left) and English (left to right),
// through the dictionary; `Cache-Control: no-store` is present on every
// guardian page.
//
// "Guardian page" here: every page a guardian is served under /s/<space>
// (their home, the guardian home, each linked learner's page, and every
// refusal there), and the admin's pages about a guardian's links.
import { describe, it, before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { UI } from '../../src/i18n/ui.ts';
import { makeLabel } from '../../src/labels.ts';
import { seedKit } from '../../src/kits/seed.ts';
import { A, B, G1, G2, as, crawl, guardianPaths, privacyWorld, useLanguage } from './pages.ts';
import { C, personPath, type World } from '../at9/world.ts';

/** The dictionary keys added by R2-a. */
export const R2A_KEYS = [
  'linksTitle', 'linksNote', 'linksNone', 'linkAdd', 'linkButton', 'linkRefused', 'linkSelfRefused', 'linkDone', 'unlink',
  'unlinkConfirmTitle', 'unlinkConfirmNote', 'unlinkYes', 'unlinkDone', 'linksEnded', 'linkRestore', 'linkRestored',
  'guardianHome', 'guardianNote', 'guardianNone',
] as const;

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test('AT-13d every new label and message is in the dictionary in Arabic and English, with the same placeholders', () => {
  for (const key of R2A_KEYS) {
    const en = (UI.en as Record<string, string>)[key];
    const ar = (UI.ar as Record<string, string>)[key];
    assert.ok(en && en.trim(), `en.${key}`);
    assert.ok(ar && /[؀-ۿ]/.test(ar), `ar.${key} is Arabic`);
    assert.ok(!/[؀-ۿ]/.test(en), `en.${key} is English`);
    assert.deepEqual(placeholders(ar), placeholders(en), `${key}: the same placeholders`);
  }
});

test('AT-13d the guardian word comes from the kit: Parent / ولي أمر (School), Supervisor / مشرف (Company), also for a kit stored before release 2', () => {
  const words = { school: ['Parent', 'ولي أمر'], company: ['Supervisor', 'مشرف'], university: ['Guardian', 'ولي أمر'] } as const;
  for (const [seed, [en, ar]] of Object.entries(words)) {
    const kit = seedKit(seed);
    assert.equal(makeLabel('en', kit)('guardian'), en);
    assert.equal(makeLabel('ar', kit)('guardian'), ar);
    assert.equal(makeLabel('en', kit)('guardianHome'), `${en} home`);
  }
  // A kit row stored before release 2 has only the nine concepts: the seed kit's word is used.
  const stored = seedKit('company');
  assert.equal(Object.hasOwn(stored.labels.en, 'guardian'), false, 'stored kits carry no guardian word');
  assert.equal(makeLabel('en', stored)('guardianHome'), 'Supervisor home');
  assert.equal(makeLabel('ar', stored)('linksTitle'), 'الحسابات المرتبطة: موظّف');
  // A kit that names its own guardian word uses it.
  const own = seedKit('school');
  (own.labels.en as Record<string, string>).guardian = 'Family';
  assert.equal(makeLabel('en', own)('guardianHome'), 'Family home');
});

describe('AT-13d the running product: language and direction, and no-store, on every guardian page', { concurrency: false }, () => {
  let w: World;
  before(async () => {
    w = await privacyWorld();
  });
  after(async () => {
    await w?.close();
  });

  it('every page a guardian is served in the space, 200 or refused, in Arabic (rtl) and English (ltr), is no-store', async () => {
    let checked = 0;
    for (const person of [G1, G2, B]) {
      const c = await as(w, person);
      for (const lang of ['ar', 'en'] as const) {
        await useLanguage(c, lang);
        const typed = [`/s/${w.spaceId}/linked/${w.ids[C.username]}`, `/s/${w.spaceId}/linked/no-such-id`, `/s/${w.spaceId}/learn/${w.content.math}`, `/s/${w.spaceId}/admin`];
        for (const p of await crawl(c, guardianPaths(w), typed)) {
          if (!p.path.startsWith(`/s/${w.spaceId}`) || !p.contentType.startsWith('text/html')) continue;
          checked++;
          assert.equal(p.cacheControl, 'no-store', `${person.username} ${lang} ${p.path} (${p.status})`);
          const html = p.body.match(/<html lang="(\w+)" dir="(\w+)">/);
          assert.deepEqual(html?.slice(1), [lang, lang === 'ar' ? 'rtl' : 'ltr'], `${person.username} ${lang} ${p.path}: language and direction`);
        }
      }
    }
    assert.ok(checked >= 30, `pages checked: ${checked}`);
  });

  it('the admin\'s pages about a guardian\'s links are no-store too', async () => {
    for (const path of [personPath(w, w.ids[G1.username]), `${personPath(w, w.ids[G1.username])}/links/${w.ids[A.username]}/remove`]) {
      const res = await w.admin.get(path);
      assert.equal(res.status, 200, path);
      assert.equal(res.headers.get('cache-control'), 'no-store', path);
    }
    const refused = await w.admin.post(`${personPath(w, w.ids[G2.username])}/links`, { learner: w.ids[G1.username] });
    assert.equal(refused.status, 400);
    assert.equal(refused.headers.get('cache-control'), 'no-store', 'a refused link');
  });
});
