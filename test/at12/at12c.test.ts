// AT-12c (contract product-contract-r2, R2-c): refused and changing nothing:
// an empty reason, a mark outside 0 to maximum, a correction by anyone but
// the subject's current publisher.
//
// The empty reason and the mark out of range are the publisher's own mistakes:
// the correction page comes back (400) naming the problem, and nothing is
// stored. Anyone else (another publisher, the admin, a learner, a guardian,
// and Hadeer once Mathematics is given to Shimaa) is refused identically
// (section 3: the same status and the same bytes as for a target that does
// not exist), and nothing is stored either. "Nothing" is every result row,
// every history row and every exam, compared before and after.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  A, B, C, D, G1, HADEER, SHIMAA, as, correct, correctPath, correctionForm, correctionWorld, everything, openCorrection, quiz1, stored, type CorrectionWorld,
} from './corrections.ts';

let w: CorrectionWorld;
let exam = '';
let rows: Awaited<ReturnType<typeof quiz1>>['rows'];

const unchanged = async (what: string, act: () => Promise<void>) => {
  const before = await everything(w);
  await act();
  assert.deepEqual(await everything(w), before, `${what}: nothing changed`);
};

describe('AT-12c an empty reason, a mark outside 0 to the maximum, and anyone but the current publisher are refused, changing nothing', { concurrency: false }, () => {
  before(async () => {
    w = await correctionWorld();
    ({ exam, rows } = await quiz1(w));
  });
  after(async () => {
    await w?.close();
  });

  it('an empty reason (or only spaces) is refused with its message beside the form, and nothing is stored', async () => {
    for (const reason of ['', '   ']) {
      await unchanged(`reason "${reason}"`, async () => {
        const res = await correct(w, w.hadeer, exam, w.ids[A.username], { mark: '16', reason });
        assert.equal(res.status, 400);
        assert.equal(res.headers.get('cache-control'), 'no-store');
        const html = await res.text();
        assert.ok(html.includes('اكتب سبب التصحيح.'), 'the reason is required');
        assert.ok(/<form id="correct"/.test(html), 'the form is back');
      });
    }
  });

  it('a mark above the maximum or below 0 is refused with its message, and nothing is stored; so are a mark that is not a number and a mark with Absent', async () => {
    for (const [mark, absent, message] of [
      ['21', false, 'يجب أن تكون الدرجة من 0 إلى 20.'], ['20.5', false, 'يجب أن تكون الدرجة من 0 إلى 20.'], ['-1', false, 'يجب أن تكون الدرجة من 0 إلى 20.'],
      ['abc', false, 'اكتب رقماً مثل 17 أو 17.5 (رقم عشري واحد على الأكثر).'], ['16', true, 'اكتب الدرجة أو اختر «غائب»، لا الاثنين معاً.'],
      ['', false, 'اكتب الدرجة أو اختر «غائب».'],
    ] as const) {
      await unchanged(`mark "${mark}"${absent ? ' and Absent' : ''}`, async () => {
        const res = await correct(w, w.hadeer, exam, w.ids[A.username], { mark, absent, reason: 'A real reason' });
        assert.equal(res.status, 400, `mark "${mark}"`);
        assert.ok((await res.text()).includes(message), `mark "${mark}": ${message}`);
      });
    }
    // The bounds themselves are accepted: 0 and the maximum.
    for (const mark of ['0', '20']) {
      // Tried on C's row, so that A's stays at 14 for the other checks.
      const res = await correct(w, w.hadeer, exam, w.ids[C.username], { mark, reason: `Bound ${mark}` });
      assert.equal(res.status, 303, `mark ${mark} is within 0 to the maximum`);
    }
  });

  it('a value equal to the current one is refused: a correction must change the value', async () => {
    await unchanged('the same value', async () => {
      const res = await correct(w, w.hadeer, exam, w.ids[A.username], { mark: '14', reason: 'No change' });
      assert.equal(res.status, 400);
    });
  });

  it('another publisher, the admin, a learner and a guardian are refused identically, for an existing row and for none, by page and by forged post', async () => {
    const { version } = await openCorrection(w, w.hadeer, exam, w.ids[A.username]);
    for (const person of [SHIMAA, A, G1]) {
      const c = await as(w, person);
      await unchanged(person.username, async () => {
        const noneGet = await c.get(`${correctPath(w, 'no-such-exam')}?learner=${w.ids[A.username]}`);
        const noneBody = await noneGet.text();
        assert.equal(noneGet.status, 403);
        const page = await c.get(`${correctPath(w, exam)}?learner=${w.ids[A.username]}`);
        assert.deepEqual([page.status, await page.text()], [noneGet.status, noneBody], `${person.username}: the page`);
        for (const target of [exam, 'no-such-exam']) {
          const res = await c.post(correctPath(w, target), correctionForm(w.ids[A.username], { mark: '19', reason: 'Forged', version }));
          assert.deepEqual([res.status, await res.text()], [noneGet.status, noneBody], `${person.username}: a forged post to ${target}`);
        }
      });
    }
    await unchanged('the admin', async () => {
      const none = await w.admin.post(correctPath(w, 'no-such-exam'), correctionForm(w.ids[A.username], { mark: '19', reason: 'Forged', version }));
      const res = await w.admin.post(correctPath(w, exam), correctionForm(w.ids[A.username], { mark: '19', reason: 'Forged', version }));
      assert.equal(res.status, 403);
      assert.equal(await res.text(), await none.text(), 'the admin: refused identically');
    });
    // Hadeer herself: a learner of the exam without a published row (none here) or not on it at all answers like no row.
    await unchanged('a person who is not a learner of the exam', async () => {
      const none = await w.hadeer.post(correctPath(w, exam), correctionForm('no-such-learner', { mark: '19', reason: 'Forged', version }));
      const g1 = await w.hadeer.post(correctPath(w, exam), correctionForm(w.ids[G1.username], { mark: '19', reason: 'Forged', version }));
      assert.equal(none.status, 403);
      assert.deepEqual([g1.status, await g1.text()], [none.status, await none.text()]);
    });
  });

  it('the subject\'s current publisher only: once Mathematics is given to Shimaa, Hadeer is refused identically and Shimaa can correct', async () => {
    const f = new FormData();
    f.set('publisher', w.ids[SHIMAA.username]);
    f.append('set', w.science);
    f.append('learner', w.ids[D.username]);
    assert.equal((await w.admin.post(`/s/${w.spaceId}/admin/topics/${w.content.math}`, f)).status, 303, 'the admin gives Mathematics to Shimaa');
    const hadeer = await as(w, HADEER);
    const { version } = await openCorrection(w, await as(w, SHIMAA), exam, w.ids[B.username]);
    await unchanged('Hadeer, no longer the publisher', async () => {
      const none = await hadeer.post(correctPath(w, 'no-such-exam'), correctionForm(w.ids[B.username], { mark: '12', reason: 'Old publisher', version }));
      const res = await hadeer.post(correctPath(w, exam), correctionForm(w.ids[B.username], { mark: '12', reason: 'Old publisher', version }));
      assert.equal(res.status, 403);
      assert.equal(await res.text(), await none.text(), 'identically');
    });
    const res = await correct(w, await as(w, SHIMAA), exam, w.ids[B.username], { mark: '12', reason: 'Re-checked by the new teacher' });
    assert.equal(res.status, 303, 'the current publisher corrects');
    const { history } = await stored(w, rows[B.username].id);
    assert.equal(history.at(-1)?.changed_by, w.ids[SHIMAA.username], 'recorded as Shimaa');
  });
});
