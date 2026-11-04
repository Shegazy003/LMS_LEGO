// AT-15c-2 (contract product-contract-r2, R2-d): "Recording since" is true. It
// is the later of the last switch-on and the day the guardian's link to that
// learner was made. A guardian sees no open dated before that day, and the
// page claims nothing about earlier days. Tests: (1) a lesson opened the day
// before switch-on never appears, and the page shows "No open recorded" with
// the switch-on date; (2) a link made today shows no open dated before today
// although rows exist from earlier, and a lesson opened again after the link
// day shows that new date; (3) off then on again: the rows of the first period
// are gone and "Recording since" is the new switch-on date. The test clock
// moves the day (section 3).
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setClockOffsetDays } from '../support/http.ts';
import { A, G1, G2, appointGuardian, linkThrough } from '../at9/world.ts';
import { activityWorld, adminNow, guardianSees, moveToDay, open, switchOff, switchOn, viewRows, type ActivityWorld } from './activity.ts';

const G3 = { display_name: 'Rasha Guardian', username: 'rasha.g3', password: 'rasha-first-pass', role: 'guardian', mobile: '01043434343' } as const;

describe('AT-15c-2 Recording since is the later of the switch-on day and the link day, and nothing earlier is shown', { concurrency: false }, () => {
  let w: ActivityWorld;
  before(async () => {
    w = await activityWorld();
  });
  after(async () => {
    await setClockOffsetDays(w.p.url, 0);
    await w?.close();
  });

  it('(1) a lesson opened the day before the switch-on never appears: "No open recorded", with the switch-on date', async () => {
    await moveToDay(w, 0);
    assert.equal((await open(w, A)).status, 200, 'A opens the lesson while it is off');
    const on = await moveToDay(w, 1);
    await switchOn(w);
    assert.deepEqual(await viewRows(w), [], 'nothing was recorded before');
    const seen = await guardianSees(w, G1, w.ids[A.username]);
    assert.equal(seen.shown.since, on, 'Recording since the switch-on day (later than G1\'s link day)');
    assert.deepEqual(seen.shown.subjects.Mathematics, { 'Adding fractions': null }, 'No open recorded');
  });

  it('(2) a link made later shows no open dated before it, though the row exists; an open after the link day shows the new date, also to the guardian linked earlier', async () => {
    const opened = await moveToDay(w, 2);
    assert.equal((await open(w, A)).status, 200);
    assert.deepEqual((await viewRows(w)).map((r) => r.last_opened_on), [opened]);
    const linkDay = await moveToDay(w, 4);
    const admin = await adminNow(w);
    w.admin = admin;
    await appointGuardian(w, G3);
    assert.equal((await linkThrough(w, w.ids[G3.username], w.ids[A.username], admin)).status, 303, 'G3 linked to A on a later day');
    const g3 = await guardianSees(w, G3, w.ids[A.username]);
    assert.equal(g3.status, 200);
    assert.equal(g3.shown.since, linkDay, 'Recording since G3\'s link day');
    assert.deepEqual(g3.shown.subjects.Mathematics, { 'Adding fractions': null }, 'the earlier open is not shown to G3');
    assert.ok(!g3.html.includes(opened), 'no date before the link day appears anywhere on the page');
    const g1 = await guardianSees(w, G1, w.ids[A.username]);
    assert.deepEqual(g1.shown.subjects.Mathematics, { 'Adding fractions': opened }, 'G1, linked before, sees it');
    const again = await moveToDay(w, 5);
    assert.equal((await open(w, A)).status, 200, 'A opens it again after G3\'s link day');
    assert.deepEqual((await guardianSees(w, G3, w.ids[A.username])).shown.subjects.Mathematics, { 'Adding fractions': again }, 'G3 sees recent activity');
    assert.deepEqual((await guardianSees(w, G2, w.ids[A.username])).shown.subjects.Mathematics, { 'Adding fractions': again });
  });

  it('(3) off, then on again: the first period\'s rows are gone, and Recording since is the new switch-on day', async () => {
    await moveToDay(w, 6);
    await switchOff(w);
    assert.deepEqual(await viewRows(w), [], 'switching off deleted the rows');
    const second = await moveToDay(w, 8);
    await switchOn(w);
    for (const g of [G1, G2, G3]) {
      const seen = await guardianSees(w, g, w.ids[A.username]);
      assert.equal(seen.shown.since, second, `${g.username}: Recording since the new switch-on day`);
      assert.deepEqual(seen.shown.subjects.Mathematics, { 'Adding fractions': null }, `${g.username}: starts empty`);
    }
  });
});
