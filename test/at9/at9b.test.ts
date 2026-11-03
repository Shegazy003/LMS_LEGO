// AT-9b (contract product-contract-r2, R2-a): the admin links G1 to A and B,
// and G2 to A. Linking a guardian to a person who is not a learner of the same
// space is refused. The links are made on the guardian's person page in
// Chromium at phone width, Arabic first; the refusals at request level, where
// a forged form can name any id. Screenshots go to evidence/at-9/.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser } from 'playwright';
import { assertPage, phone, readable, shot, signIn, submit } from '../support/browser.ts';
import { A, ADMIN, B, G1, G2, HADEER, KARIM, OTHER_ADMIN, as, buildWorld, linkThrough, personPath, type World } from './world.ts';

const EVIDENCE = fileURLToPath(new URL('../../evidence/at-9/', import.meta.url));
let w: World;
let browser: Browser;
const links = async () => (await w.p.sql('SELECT space_id, guardian_user_id, learner_user_id, created_by, ended_at FROM guardian_link ORDER BY created_at, id'))
  .map((r) => ({ ...r }));

describe('AT-9b the admin links G1 to A and B and G2 to A; anyone but a learner of the space is refused', { concurrency: false }, () => {
  before(async () => {
    mkdirSync(EVIDENCE, { recursive: true });
    w = await buildWorld({ guardians: true });
    browser = await chromium.launch();
  });
  after(async () => {
    await browser?.close();
    await w?.close();
  });

  it('on the guardian\'s page, the admin links G1 to A and B, and G2 to A', async () => {
    const ph = await phone(browser);
    await signIn(w.p.url, ph.page, ADMIN.username, ADMIN.password);
    for (const [g, learners] of [[G1, [A, B]], [G2, [A]]] as const) {
      await ph.page.goto(w.p.url + personPath(w, w.ids[g.username]));
      await assertPage(ph.page, `${g.username}'s page`, 'ar');
      for (const l of learners) {
        await ph.page.selectOption('form#link-learner select[name=learner]', w.ids[l.username]);
        assert.equal(await submit(ph.page, 'form#link-learner'), 303, `${g.username} linked to ${l.username}`);
        assert.ok((await readable(ph.page)).includes('تم الربط.'), 'the page says it is done');
      }
      const shown = await ph.page.locator('#links [data-linked]').evaluateAll((els) => els.map((e) => e.getAttribute('data-linked')));
      assert.deepEqual(shown.sort(), learners.map((l) => w.ids[l.username]).sort(), 'the page lists exactly the linked learners');
      const offered = await ph.page.locator('form#link-learner select[name=learner] option').evaluateAll((els) => els.map((e) => e.getAttribute('value')));
      for (const l of learners) assert.ok(!offered.includes(w.ids[l.username]), 'a linked learner is not offered again');
      assert.ok(!offered.includes(w.ids[HADEER.username]) && !offered.includes(w.ids[g.username]), 'only learners are offered, never the guardian');
      await shot(ph.page, EVIDENCE, `9b-${g === G1 ? 1 : 2}-links-of-${g.username}-ar`);
    }
    await ph.ctx.close();
    const rows = await links();
    assert.deepEqual(rows.map((r) => [r.guardian_user_id, r.learner_user_id]), [
      [w.ids[G1.username], w.ids[A.username]], [w.ids[G1.username], w.ids[B.username]], [w.ids[G2.username], w.ids[A.username]],
    ]);
    for (const r of rows) {
      assert.equal(r.space_id, w.spaceId);
      assert.equal(r.created_by, w.ids[ADMIN.username]);
      assert.equal(r.ended_at, null);
    }
    // Linking again changes nothing.
    assert.equal((await linkThrough(w, w.ids[G1.username], w.ids[A.username])).status, 303);
    assert.deepEqual(await links(), rows);
  });

  it('linking a guardian to anyone who is not a learner of this space is refused, with the plain message, and stores nothing', async () => {
    const before = await links();
    const targets = {
      'a publisher of the space': w.ids[HADEER.username],
      'another guardian': w.ids[G2.username],
      'the admin': w.ids[ADMIN.username],
      'a learner of another space': w.ids[KARIM.username],
      'no such person': '00000000-0000-4000-8000-000000000000',
      'nothing chosen': '',
    };
    for (const [what, id] of Object.entries(targets)) {
      const res = await linkThrough(w, w.ids[G1.username], id);
      assert.equal(res.status, 400, `${what}: refused`);
      assert.ok((await res.text()).includes('لا يمكن الربط إلا بحساب طالب في هذه المساحة. لم يتغيّر شيء.'), `${what}: the plain message`);
    }
    assert.deepEqual(await links(), before, 'no link stored or changed');
  });

  it('only this space\'s admin links, and only a guardian has links', async () => {
    const before = await links();
    // A person who is not a guardian has no links to make.
    assert.equal((await linkThrough(w, w.ids[A.username], w.ids[B.username])).status, 403, 'on a learner\'s page');
    // Another space's admin, under either address.
    const other = await as(w, OTHER_ADMIN);
    assert.equal((await other.post(`/s/${w.spaceId}/admin/people/${w.ids[G1.username]}/links`, { learner: w.ids[B.username] })).status, 403);
    assert.equal((await other.post(`/s/${w.otherSpaceId}/admin/people/${w.ids[G1.username]}/links`, { learner: w.ids[KARIM.username] })).status, 403);
    // The guardian, a learner and a publisher of the space.
    for (const person of [G1, A, HADEER]) {
      const c = await as(w, person);
      assert.equal((await c.post(`/s/${w.spaceId}/admin/people/${w.ids[G1.username]}/links`, { learner: w.ids[B.username] })).status, 403, `${person.username} refused`);
    }
    // A forged form from another site.
    assert.equal((await w.admin.postWith(`${personPath(w, w.ids[G2.username])}/links`, { learner: w.ids[B.username] }, { origin: 'https://evil.example' })).status, 403);
    assert.deepEqual(await links(), before, 'nothing changed');
  });
});
