// AT-15h (contract product-contract-r2, R2-d): rules that hide at once.
// Removing the link G1-B, ending B's access, ending G1's access, and B leaving
// the subject each hide the corresponding activity from G1 on the next
// request; restore brings back what is stored. Switching the setting off
// deletes the rows (AT-15b), so switching it on later starts empty. "At once"
// (section 3): visible on the next request after the action returns, also in
// a sign-in already open.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Client, utcDatePlusDays } from '../support/http.ts';
import { A, B, C, G1, as, personPath } from '../at9/world.ts';
import { setScience } from '../at10/marks.ts';
import { activityPath, activityWorld, guardianSees, open, productToday, shownActivity, switchOff, switchOn, type ActivityWorld } from './activity.ts';

describe('AT-15h a removed link, ended access and leaving the subject hide the activity at once; restore brings it back', { concurrency: false }, () => {
  let w: ActivityWorld;
  let g1: Client;
  let today = '';
  let refusal = '';
  const bPage = () => g1.get(activityPath(w, w.ids[B.username]));
  before(async () => {
    w = await activityWorld();
    await switchOn(w);
    assert.equal((await open(w, B)).status, 200, 'B opens the lesson');
    today = await productToday(w);
    // One sign-in kept open through every step.
    g1 = await as(w, G1);
    refusal = await (await g1.get(`/s/${w.spaceId}/linked/no-such-person/activity`)).text();
  });
  after(async () => {
    await w?.close();
  });

  const showsB = async () => {
    const res = await bPage();
    assert.equal(res.status, 200);
    assert.deepEqual(shownActivity(await res.text()).subjects.Mathematics, { 'Adding fractions': today }, 'G1 sees B\'s open');
  };
  const hidesB = async (why: string) => {
    const res = await bPage();
    assert.equal(res.status, 403, why);
    assert.equal(await res.text(), refusal, `${why}: refused identically`);
    const a = await g1.get(activityPath(w, w.ids[A.username]));
    if (a.status === 200) assert.ok(!shownActivity(await a.text()).switcher.some((s) => s.name === B.display_name), `${why}: B is gone from the switcher`);
  };

  it('removing the link G1-B hides B at once; restoring the link brings back what is stored', async () => {
    await showsB();
    const guardian = personPath(w, w.ids[G1.username]);
    assert.equal((await w.admin.post(`${guardian}/links/${w.ids[B.username]}/remove`, {})).status, 303);
    await hidesB('link removed');
    assert.equal((await w.admin.post(`${guardian}/links`, { learner: w.ids[B.username] })).status, 303, 'restored');
    await showsB();
  });

  it('ending B\'s access hides B at once; restoring B brings it back', async () => {
    assert.equal((await w.admin.post(`${personPath(w, w.ids[B.username])}/end`, {})).status, 303);
    await hidesB('B ended');
    assert.equal((await w.admin.post(`${personPath(w, w.ids[B.username])}/restore`, { valid_until: utcDatePlusDays(20) })).status, 303);
    await showsB();
  });

  it('ending G1\'s access shows G1 the access-ended message in place of every page; restoring G1 brings it back', async () => {
    assert.equal((await w.admin.post(`${personPath(w, w.ids[G1.username])}/end`, {})).status, 303);
    // The open sign-in is told once that access ended, then is signed out (release 1.1, AT-6); a new sign-in is told the same.
    const first = await g1.get(activityPath(w, w.ids[B.username]));
    assert.equal(first.status, 403, 'G1\'s open sign-in, at once');
    const html = await first.text();
    assert.ok(html.includes('id="access-ended"'), 'the access-ended message');
    assert.ok(!html.includes('Adding fractions') && !html.includes('class="opened"') && !html.includes('id="recording-since"'), 'no activity shown');
    assert.equal((await g1.get(activityPath(w, w.ids[A.username]))).status, 302, 'then signed out');
    const again = await as(w, G1);
    for (const learner of [A, B]) {
      const res = await again.get(activityPath(w, w.ids[learner.username]));
      assert.ok([302, 403].includes(res.status), `a new sign-in: G1's ${learner.username} page refused (${res.status})`);
      const body = await res.text();
      assert.ok(!body.includes('Adding fractions') && !body.includes('class="opened"'), 'no activity shown');
    }
    assert.equal((await w.admin.post(`${personPath(w, w.ids[G1.username])}/restore`, { valid_until: utcDatePlusDays(20) })).status, 303);
    g1 = await as(w, G1);
    await showsB();
  });

  it('B leaving the subject hides its lessons at once; joining again brings back the stored date', async () => {
    await setScience(w, [A.username, C.username]);
    const res = await bPage();
    assert.equal(res.status, 200, 'B is still linked');
    assert.deepEqual(shownActivity(await res.text()).subjects, {}, 'nothing of Mathematics: B no longer has it');
    await setScience(w, [A.username, B.username, C.username]);
    await showsB();
  });

  it('switching off deletes the rows, so switching on later starts empty', async () => {
    await switchOff(w);
    await switchOn(w);
    const seen = await guardianSees(w, G1, w.ids[B.username]);
    assert.deepEqual(seen.shown.subjects.Mathematics, { 'Adding fractions': null }, 'No open recorded');
  });
});
