// AT-12d (contract product-contract-r2, R2-c): exam title, date and maximum
// are locked once any mark is published (edit refused). Before publishing
// they are editable.
//
// The exam's fields are edited on its marks page (form #exam-edit, posted to
// /s/<space>/publish/marks/<exam>/exam). Before any row is published the edit
// is stored (a maximum below a mark already in the draft is refused, so no
// draft row is ever above the maximum); once one row is published the page
// shows the fields as locked, without the form, and a forged edit is refused
// (409) and changes nothing. Another publisher's edit is refused identically.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { marksForm } from '../at10/marks.ts';
import {
  A, B, C, D, SHIMAA, as, correctionWorld, createExam, everything, examEditPath, marksPath, publishAll, type CorrectionWorld,
} from './corrections.ts';

let w: CorrectionWorld;
let exam = '';

const examRow = async () => (await w.p.sql(`SELECT title, exam_date, max_mark FROM exam WHERE id = '${exam}'`))[0];

describe('AT-12d exam title, date and maximum are editable until a mark is published, then locked', { concurrency: false }, () => {
  before(async () => {
    w = await correctionWorld();
    exam = await createExam(w, w.hadeer, w.content.math, { title: 'Quiz 1', exam_date: '2026-11-05', max_mark: '20' });
  });
  after(async () => {
    await w?.close();
  });

  it('before publishing: the marks page offers the edit form, and title, date and maximum are changed', async () => {
    const page = await (await w.hadeer.get(marksPath(w, exam))).text();
    assert.ok(/<form id="exam-edit"[^>]*action="[^"]*\/exam"/.test(page), 'the edit form is on the marks page');
    assert.ok(!page.includes('id="exam-locked"'));
    const res = await w.hadeer.post(examEditPath(w, exam), { title: 'Quiz 1 (fractions)', exam_date: '2026-11-06', max_mark: '25' });
    assert.equal(res.status, 303, 'saved');
    const row = await examRow();
    assert.deepEqual([row.title, row.exam_date, Number(row.max_mark)], ['Quiz 1 (fractions)', '2026-11-06', 25]);
  });

  it('before publishing: refused edits store nothing (an empty title, a bad date, a bad maximum, a maximum below a draft mark)', async () => {
    const saved = await w.hadeer.post(marksPath(w, exam), marksForm(w, [A.username], { [A.username]: { mark: '22' } }, 'draft'));
    assert.equal(saved.status, 303, 'a draft with 22 out of 25');
    for (const [fields, why] of [
      [{ title: '', exam_date: '2026-11-06', max_mark: '25' }, 'an empty title'],
      [{ title: 'Quiz 1', exam_date: 'tomorrow', max_mark: '25' }, 'a date that is not a date'],
      [{ title: 'Quiz 1', exam_date: '2026-11-06', max_mark: '0' }, 'a maximum of 0'],
      [{ title: 'Quiz 1', exam_date: '2026-11-06', max_mark: '20' }, 'a maximum below the draft mark 22'],
    ] as const) {
      const before = await everything(w);
      const res = await w.hadeer.post(examEditPath(w, exam), fields);
      assert.equal(res.status, 400, why);
      assert.equal(res.headers.get('cache-control'), 'no-store');
      assert.deepEqual(await everything(w), before, `${why}: nothing changed`);
    }
  });

  it('another publisher\'s edit is refused identically, existing exam or not, and changes nothing', async () => {
    const shimaa = await as(w, SHIMAA);
    const before = await everything(w);
    const none = await shimaa.post(examEditPath(w, 'no-such-exam'), { title: 'Taken', exam_date: '2026-11-07', max_mark: '30' });
    const res = await shimaa.post(examEditPath(w, exam), { title: 'Taken', exam_date: '2026-11-07', max_mark: '30' });
    assert.equal(res.status, 403);
    assert.deepEqual([res.status, await res.text()], [none.status, await none.text()]);
    assert.deepEqual(await everything(w), before);
  });

  it('once a mark is published: the page shows the fields locked, without the form, and an edit of title, date or maximum is refused and changes nothing', async () => {
    await publishAll(w, w.hadeer, exam, [C, D, A, B].map((p) => p.username), {
      [A.username]: { mark: '22' }, [B.username]: { mark: '11' }, [C.username]: { mark: '12' }, [D.username]: { absent: true },
    });
    const page = await (await w.hadeer.get(marksPath(w, exam))).text();
    assert.ok(!page.includes('id="exam-edit"'), 'no edit form');
    assert.ok(page.includes('id="exam-locked"'), 'the fields are shown as locked');
    for (const fields of [
      { title: 'Renamed', exam_date: '2026-11-06', max_mark: '25' },
      { title: 'Quiz 1 (fractions)', exam_date: '2026-11-09', max_mark: '25' },
      { title: 'Quiz 1 (fractions)', exam_date: '2026-11-06', max_mark: '30' },
    ]) {
      const before = await everything(w);
      const res = await w.hadeer.post(examEditPath(w, exam), fields);
      assert.equal(res.status, 409, `refused: ${JSON.stringify(fields)}`);
      assert.ok((await res.text()).includes('لا يمكن تغيير'), 'the locked message');
      assert.deepEqual(await everything(w), before, 'nothing changed');
    }
    const row = await examRow();
    assert.deepEqual([row.title, row.exam_date, Number(row.max_mark)], ['Quiz 1 (fractions)', '2026-11-06', 25]);
  });

  it('a plain GET of the edit address changes nothing', async () => {
    const before = await everything(w);
    const res = await w.hadeer.get(examEditPath(w, exam));
    assert.ok(res.status === 404 || res.status === 405 || res.status === 403, `not a page (${res.status})`);
    assert.deepEqual(await everything(w), before);
  });
});
