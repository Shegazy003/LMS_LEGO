// AT-11f (contract product-contract-r2, R2-c): an ended learner, guardian or
// publisher sees the "access ended" message instead of results. An ended
// publisher cannot correct; the admin restores the publisher's access with
// the existing release 1.1 screen (no new feature).
//
// Access is ended and restored through the admin's release 1.1 person page
// (End access now, Restore). Each ended person signs in again and opens the
// results address they had: the space answers with the access-ended message
// (403), and no mark is in the answer.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Client, utcDatePlusDays } from '../support/http.ts';
import { SPACE } from '../at9/world.ts';
import {
  A, G1, HADEER, as, correct, correctPath, correctionForm, correctionWorld, everything, historyPath, linkedPath, openCorrection, personPath, stored,
  type CorrectionWorld,
} from '../at12/corrections.ts';

let w: CorrectionWorld;

const ENDED = `Your access to ${SPACE} ended on`;
const ENDED_AR = `انتهى وصولك إلى ${SPACE}`;

/** Signs a person in afresh (their sessions ended with their access) and reads one address. */
async function readAsEnded(person: { username: string; password: string }, path: string) {
  const c = new Client(w.p.url);
  await c.post('/signin', { username: person.username, password: person.password });
  const res = await c.get(path);
  return { c, status: res.status, body: await res.text() };
}

describe('AT-11f an ended learner, guardian or publisher sees "access ended" instead of results; an ended publisher cannot correct', { concurrency: false }, () => {
  before(async () => {
    w = await correctionWorld();
  });
  after(async () => {
    await w?.close();
  });

  const end = async (username: string) => assert.equal((await w.admin.post(`${personPath(w, w.ids[username])}/end`, {})).status, 303, `End access now: ${username}`);
  const restore = async (username: string) =>
    assert.equal((await w.admin.post(`${personPath(w, w.ids[username])}/restore`, { valid_until: utcDatePlusDays(20) })).status, 303, `Restore: ${username}`);

  for (const [who, person, path, mark] of [
    ['the learner A', A, (x: CorrectionWorld) => `/s/${x.spaceId}/results`, '17 / 20'],
    ['the learner A, one result', A, (x: CorrectionWorld) => `/s/${x.spaceId}/results/${x.published[A.username].id}`, '17 / 20'],
    ['the guardian G1', G1, (x: CorrectionWorld) => linkedPath(x, A.username), '17 / 20'],
    ['the publisher Hadeer', HADEER, (x: CorrectionWorld) => historyPath(x, x.exam), '17 / 20'],
  ] as const) {
    it(`${who}: shown before; after End access the same address says access ended, with no mark; Restore brings it back`, async () => {
      const before = await as(w, person);
      const shown = await before.get(path(w));
      assert.equal(shown.status, 200, 'shown while access lasts');
      assert.ok((await shown.text()).includes(mark));
      await end(person.username);
      const ended = await readAsEnded(person, path(w));
      assert.equal(ended.status, 403, 'refused');
      assert.ok(ended.body.includes(ENDED) || ended.body.includes(ENDED_AR), `the access-ended message: ${ended.body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 200)}`);
      assert.ok(!ended.body.includes(mark) && !ended.body.includes('Mid-term'), 'no result in the answer');
      await restore(person.username);
      assert.equal((await (await as(w, person)).get(path(w))).status, 200, 'back after Restore');
    });
  }

  it('an ended publisher cannot correct (the form she still holds changes nothing); restored by the admin\'s release 1.1 screen, she can', async () => {
    const hadeer = await as(w, HADEER);
    const learner = w.ids[A.username];
    const page = await openCorrection(w, hadeer, w.exam, learner);
    assert.equal(page.status, 200, 'the correction page, while her access lasts');
    await end(HADEER.username);
    const before = await everything(w);
    const ended = await readAsEnded(HADEER, `${correctPath(w, w.exam)}?learner=${learner}`);
    assert.equal(ended.status, 403, 'the correction page says access ended');
    assert.ok(ended.body.includes(ENDED) || ended.body.includes(ENDED_AR));
    const tried = await ended.c.post(correctPath(w, w.exam), correctionForm(learner, { mark: '18', reason: 'Re-marked question 2', version: page.version }));
    assert.equal(tried.status, 403, 'the correction is refused');
    const old = await hadeer.post(correctPath(w, w.exam), correctionForm(learner, { mark: '18', reason: 'Re-marked question 2', version: page.version }));
    assert.ok(old.status === 403 || old.status === 302, `the sign-in she had is over (${old.status})`);
    assert.deepEqual(await everything(w), before, 'nothing changed');

    await restore(HADEER.username);
    const back = await as(w, HADEER);
    const res = await correct(w, back, w.exam, learner, { mark: '18', reason: 'Re-marked question 2' });
    assert.equal(res.status, 303, 'restored, she corrects');
    const { row, history } = await stored(w, w.published[A.username].id);
    assert.equal(Number(row.mark), 18);
    assert.equal(history.length, 2, 'the first publish and the correction');
  });
});
