// AT-9g (contract product-contract-r2, R2-a): a guardian cannot appoint,
// edit, or open a lesson or material, by screen or by forged request, each
// refused identically (same status, same body bytes and length, for a target
// that exists and one that does not). The guardian's pages offer no form but
// signing out; every refused request changes no row.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { A, G1, as, buildWorld, personPath, type World } from './world.ts';

let w: World;
const NONE = '00000000-0000-4000-8000-000000000000';

/** Every row of every product table (the usage counter, which every request moves, aside). */
async function rows(): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  const tables = (await w.p.sql("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT IN ('d1_migrations', 'usage_day', 'session')"))
    .map((r) => String(r.name));
  for (const t of tables) out[t] = (await w.p.sql(`SELECT * FROM "${t}"`)).map((r) => JSON.stringify(r)).sort();
  return out;
}

describe('AT-9g a guardian cannot appoint, edit, or open a lesson or material, by screen or forged request', { concurrency: false }, () => {
  before(async () => {
    w = await buildWorld({ links: true });
  });
  after(async () => {
    await w?.close();
  });

  it('the guardian\'s screens offer no form and no way into a lesson, a material, an editor or the admin\'s pages', async () => {
    const g1 = await as(w, G1);
    for (const path of [`/s/${w.spaceId}`, `/s/${w.spaceId}/linked`, `/s/${w.spaceId}/linked/${w.ids[A.username]}`]) {
      const html = await (await g1.get(path)).text();
      const forms = [...html.matchAll(/<form\b[^>]*>/g)].map((m) => m[0]);
      assert.deepEqual(forms, ['<form id="signout" method="post" action="/signout">'], `${path}: only the sign-out form`);
      for (const href of [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1])) {
        assert.ok(!/\/(learn|read|file|admin|publish)(\/|$)/.test(href), `${path}: no link to ${href}`);
      }
    }
  });

  it('every forged request to appoint, edit or open is refused identically, for existing and missing targets, and changes nothing', async () => {
    const g1 = await as(w, G1);
    const before = await rows();
    const s = `/s/${w.spaceId}`;
    // Each pair: [an address with a real target, the same address with a target that does not exist].
    const pairs: [string, 'GET' | 'POST', string, string, Record<string, string>?][] = [
      ['open the subject', 'GET', `${s}/learn/${w.content.math}`, `${s}/learn/${NONE}`],
      ['open the lesson', 'GET', `${s}/read/${w.content.lesson}`, `${s}/read/${NONE}`],
      ['open the PDF', 'GET', `${s}/file/${w.content.pdf}`, `${s}/file/${NONE}`],
      ['open a lesson of another space', 'GET', `/s/${w.otherSpaceId}/read/${w.content.otherLesson}`, `/s/${w.otherSpaceId}/read/${NONE}`],
      ['the people page', 'GET', `${s}/admin/people`, `${s}/admin/nothing-here`],
      ['appoint a person', 'POST', `${s}/admin/people`, `${s}/admin/people-${NONE}`, { display_name: 'X', username: 'forged.x', password: 'forged-pass-1', role: 'learner', mobile: '01099990000', valid_until: '2099-01-01' }],
      ['correct a learner', 'POST', `${personPath(w, w.ids[A.username])}/correct`, `${personPath(w, NONE)}/correct`, { display_name: 'Forged', mobile: '', valid_until: '' }],
      ['link a learner', 'POST', `${personPath(w, w.ids[G1.username])}/links`, `${personPath(w, NONE)}/links`, { learner: w.ids['omar.c'] }],
      ['edit the subject', 'GET', `${s}/publish/edit/${w.content.math}`, `${s}/publish/edit/${NONE}`],
      ['add a chapter', 'POST', `${s}/publish/edit/${w.content.math}/add`, `${s}/publish/edit/${NONE}/add`, { title: 'Forged' }],
      ['add a material', 'POST', `${s}/publish/compose/${w.content.lesson}/add`, `${s}/publish/compose/${NONE}/add`, { kind: 'note', title: 'Forged', text: 'x' }],
      ['rename the lesson', 'POST', `${s}/publish/compose/${w.content.lesson}/name`, `${s}/publish/compose/${NONE}/name`, { title: 'Forged' }],
      ['remove the material', 'POST', `${s}/publish/item/${w.content.note}/remove`, `${s}/publish/item/${NONE}/remove`, {}],
    ];
    const bodies = new Set<string>();
    for (const [what, method, real, missing, form] of pairs) {
      const send = (path: string) => (method === 'GET' ? g1.get(path) : g1.post(path, form ?? {}));
      const a = await send(real);
      const b = await send(missing);
      const [ta, tb] = [await a.text(), await b.text()];
      assert.equal(a.status, 403, `${what}: refused`);
      assert.equal(b.status, a.status, `${what}: the same status for a missing target`);
      assert.equal(ta, tb, `${what}: the same body bytes`);
      assert.equal(ta.length, tb.length, `${what}: the same length`);
      assert.ok(!ta.startsWith('%PDF') && !ta.includes('Adding fractions') && !ta.includes('Pizza slices'), `${what}: nothing of the content`);
      if (real.startsWith(s)) bodies.add(ta);
    }
    assert.equal(bodies.size, 1, 'every refusal inside the guardian\'s space is the same page');
    assert.deepEqual(await rows(), before, 'no row changed by any refused request');
  });
});
