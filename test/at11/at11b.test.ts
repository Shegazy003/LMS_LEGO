// AT-11b (contract product-contract-r2, R2-b learner view): a direct address
// and a forged request for another learner's list or single result are refused
// identically for existing and non-existing targets (same status, same body
// bytes, same length).
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { G1, HADEER, KARIM, as as asPerson } from '../at9/world.ts';
import { A, B, C, as, resultsWorld } from '../at10/marks.ts';

const NO_SUCH = '00000000-0000-4000-8000-000000000000';
let w: Awaited<ReturnType<typeof resultsWorld>>;

async function answers(c: Awaited<ReturnType<typeof as>>, paths: [string, string][], method: 'GET' | 'POST' = 'GET') {
  const out = [];
  for (const [what, path] of paths) {
    const res = method === 'GET' ? await c.get(path) : await c.post(path, { learner: 'x' });
    const body = await res.text();
    out.push({ what, status: res.status, body, length: body.length });
  }
  return out;
}

function identical(list: { what: string; status: number; body: string; length: number }[], status: number | null, who: string) {
  for (const x of list) {
    if (status === null) assert.ok(x.status >= 400, `${who}, ${x.what}: refused (${x.status})`);
    else assert.equal(x.status, status, `${who}, ${x.what}: ${status}`);
    assert.equal(x.status, list[0].status, `${who}, ${x.what}: the same status`);
    assert.equal(x.body, list[0].body, `${who}, ${x.what}: the same bytes`);
    assert.equal(x.length, list[0].length, `${who}, ${x.what}: the same length`);
  }
}

describe('AT-11b another learner\'s list or result is refused identically, whether it exists or not', { concurrency: false }, () => {
  before(async () => {
    w = await resultsWorld({ links: true });
  });
  after(async () => {
    await w?.close();
  });

  it('A asks for B\'s and C\'s results, her own draft, a missing row and a non-id: the same 403, byte for byte', async () => {
    const a = await as(w, A);
    assert.equal((await a.get(`/s/${w.spaceId}/results/${w.published[A.username].id}`)).status, 200, 'positive control: her own result');
    const list = await answers(a, [
      ['B\'s result', `/s/${w.spaceId}/results/${w.published[B.username].id}`],
      ['C\'s result', `/s/${w.spaceId}/results/${w.published[C.username].id}`],
      ['her own draft', `/s/${w.spaceId}/results/${w.draft[A.username].id}`],
      ['B\'s person id', `/s/${w.spaceId}/results/${w.ids[B.username]}`],
      ['a missing row', `/s/${w.spaceId}/results/${NO_SUCH}`],
      ['not an id', `/s/${w.spaceId}/results/x`],
    ]);
    identical(list, 403, 'A');
    for (const x of list) assert.ok(!x.body.includes('Mid-term') && !x.body.includes('غائب') && !x.body.includes('12 /'), `${x.what}: nothing of it`);
  });

  it('another learner\'s list, by any address A could type: the same answer for an existing and a missing learner', async () => {
    const a = await as(w, A);
    const own = await (await a.get(`/s/${w.spaceId}/results`)).text();
    for (const q of [`?learner=${w.ids[B.username]}`, `?user=${w.ids[B.username]}`, `?id=${w.ids[B.username]}`]) {
      assert.equal(await (await a.get(`/s/${w.spaceId}/results${q}`)).text(), own, `${q}: still her own list only`);
    }
    identical(await answers(a, [
      ['B\'s list', `/s/${w.spaceId}/results/of/${w.ids[B.username]}`],
      ['a missing learner\'s list', `/s/${w.spaceId}/results/of/${NO_SUCH}`],
    ]), null, 'A');
    identical(await answers(a, [
      ['B\'s list under the guardian address', `/s/${w.spaceId}/linked/${w.ids[B.username]}/results`],
      ['a missing learner under the guardian address', `/s/${w.spaceId}/linked/${NO_SUCH}/results`],
    ]), 403, 'A');
  });

  it('forged posts to results addresses change nothing and answer the same for existing and missing targets', async () => {
    const a = await as(w, A);
    const before = await w.p.sql('SELECT id, status, mark, published_at FROM exam_result ORDER BY id');
    const list = await answers(a, [
      ['B\'s result', `/s/${w.spaceId}/results/${w.published[B.username].id}`],
      ['a missing row', `/s/${w.spaceId}/results/${NO_SUCH}`],
    ], 'POST');
    assert.equal(list[0].status, list[1].status);
    assert.equal(list[0].body, list[1].body);
    assert.deepEqual(await w.p.sql('SELECT id, status, mark, published_at FROM exam_result ORDER BY id'), before);
  });

  it('a guardian, the publisher and a person of another space get the same answer for an existing and a missing result', async () => {
    for (const [who, person] of [['G1 (guardian of A)', G1], ['Hadeer (the publisher)', HADEER], ['Karim (another space)', KARIM]] as const) {
      const c = await asPerson(w, person);
      identical(await answers(c, [
        ['A\'s result', `/s/${w.spaceId}/results/${w.published[A.username].id}`],
        ['a missing row', `/s/${w.spaceId}/results/${NO_SUCH}`],
        ['A\'s list', `/s/${w.spaceId}/results`],
      ]), 403, who);
    }
  });
});
