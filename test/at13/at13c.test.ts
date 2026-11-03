// AT-13c (contract product-contract-r2, R2-a pages): numbers stay masked as in
// release 1.1. The guardian's number appears on the admin's pages only as its
// last four digits (in full only in the WhatsApp button's address, as for every
// person since release 1), and no guardian page carries any number. The H-1
// no-secrets guard itself runs in the same CI step, with the guardian flows
// added (test/guards/log-redaction.test.ts).
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { A, B, G1, G2, as, crawl, guardianPaths, privacyWorld, useLanguage } from './pages.ts';
import { personPath, type World } from '../at9/world.ts';

const full = (typed: string) => {
  const national = typed.replace(/\D/g, '').replace(/^0/, '');
  return [national, `+20${national}`, `20${national}`, typed];
};

describe('AT-13c numbers stay masked on the new pages', { concurrency: false }, () => {
  let w: World;
  before(async () => {
    w = await privacyWorld();
  });
  after(async () => {
    await w?.close();
  });

  it('the admin\'s people list, the guardian\'s person page and the remove-link step show the number only as its last four digits', async () => {
    const pages = [
      `/s/${w.spaceId}/admin/people`,
      personPath(w, w.ids[G1.username]),
      `${personPath(w, w.ids[G1.username])}/links/${w.ids[A.username]}/remove`,
      `${personPath(w, w.ids[G1.username])}/link`,
    ];
    for (const path of pages) {
      const res = await w.admin.get(path);
      assert.equal(res.status, 200, path);
      const html = await res.text();
      for (const person of [G1, G2, A, B]) for (const form of full(person.mobile)) assert.ok(!html.includes(form), `${path}: no full number of ${person.username}`);
    }
    const page = await (await w.admin.get(personPath(w, w.ids[G1.username]))).text();
    assert.ok(page.includes('4141'), 'the last four digits are shown');
  });

  it('no guardian page, in Arabic or English, carries any person\'s number', async () => {
    for (const person of [G1, G2, B]) {
      const c = await as(w, person);
      for (const lang of ['ar', 'en'] as const) {
        await useLanguage(c, lang);
        for (const p of await crawl(c, guardianPaths(w))) {
          if (!p.contentType.startsWith('text/')) continue;
          for (const other of [G1, G2, A, B]) {
            for (const form of [...full(other.mobile), other.mobile.slice(-4)]) {
              assert.ok(!p.body.includes(form), `${person.username} ${lang} ${p.path}: no number of ${other.username}`);
            }
          }
        }
      }
    }
  });
});
