// AT-10d (contract product-contract-r2, R2-b): Save draft, close, reopen: the
// drafts are back in the same order. Drafts are excluded in the query layer:
// a forged request by a learner or a guardian for a draft row returns the
// same answer as a missing row (same status, same body bytes, same length).
import { describe, it, before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser } from 'playwright';
import { assertPage, phone, shot, signIn, submit } from '../support/browser.ts';
import { G1, G2 } from '../at9/world.ts';
import { A, B, C, D, HADEER, MATH_ORDER, as, createExam, marksForm, marksPath, marksWorld, shownRows, storedRows, type World } from './marks.ts';

const EVIDENCE = fileURLToPath(new URL('../../evidence/at-10/', import.meta.url));
const NO_SUCH = '00000000-0000-4000-8000-000000000000';

test('AT-10d drafts are excluded in the query layer: every statement a learner can reach reads published rows only', () => {
  const source = readFileSync(new URL('../../src/exams.ts', import.meta.url), 'utf8');
  for (const name of ['ownResults', 'ownResult']) {
    const body = source.match(new RegExp(`export function ${name}\\([\\s\\S]*?\\n}`))?.[0] ?? '';
    assert.ok(body, `${name} is in src/exams.ts`);
    assert.match(body, /r\.published_at IS NOT NULL/, `${name}: drafts excluded in its statement`);
    assert.match(body, /r\.learner_user_id = \?/, `${name}: the session's own rows only`);
  }
  const app = readFileSync(new URL('../../src/app.ts', import.meta.url), 'utf8');
  const learnerRoutes = app.match(/app\.get\('\/s\/:spaceId\/results[\s\S]*?\n}\);\n\napp\.get\('\/s\/:spaceId\/results\/:resultId'[\s\S]*?\n}\);/)?.[0] ?? '';
  assert.ok(learnerRoutes, 'the learner\'s results routes');
  assert.match(learnerRoutes, /ownResults\(c\.get\('db'\), view\.id, c\.get\('user'\)!\.id\)/, 'My results reads the session\'s person');
  assert.match(learnerRoutes, /ownResult\(c\.get\('db'\), view\.id, c\.get\('user'\)!\.id, c\.req\.param\('resultId'\)\)/, 'one result: the session\'s person and the id');
});

let w: World & { science: string };
let browser: Browser;
let exam = '';
const everyone = MATH_ORDER.map((p) => p.username);

describe('AT-10d the running product: a draft is kept, in order, and is seen by nobody else', { concurrency: false }, () => {
  before(async () => {
    mkdirSync(EVIDENCE, { recursive: true });
    w = await marksWorld({ links: true });
    browser = await chromium.launch();
    exam = await createExam(w, await as(w, HADEER), w.content.math, { title: 'Mid-term' });
  });
  after(async () => {
    await browser?.close();
    await w?.close();
  });

  it('in a real browser at phone width: Save draft, close, reopen in a new sign-in: the same rows, the same order, the same values', async () => {
    const ph = await phone(browser);
    await signIn(w.p.url, ph.page, HADEER.username, HADEER.password);
    await ph.page.goto(w.p.url + marksPath(w, exam));
    const row = (u: string) => ph.page.locator(`#rows > li[data-learner="${w.ids[u]}"]`);
    await row(C.username).locator('input.mark').fill('12');
    await row(D.username).locator('input.mark').fill('15,5');
    await row(A.username).locator('input.mark').fill('17');
    await row(B.username).locator('input[type=checkbox]').check();
    assert.equal(await submit(ph.page, 'form#marks', 'button[value=draft]'), 303, 'Save draft');
    await assertPage(ph.page, 'after Save draft (Arabic)', 'ar');
    assert.ok((await ph.page.locator('#done').innerText()).includes('المسودة'), 'the page says the draft is saved');
    await shot(ph.page, EVIDENCE, '10d-1-draft-saved-ar');
    await ph.ctx.close();

    // Reopened: another phone, another sign-in.
    const again = await phone(browser);
    await signIn(w.p.url, again.page, HADEER.username, HADEER.password);
    await again.page.goto(w.p.url + marksPath(w, exam));
    const ids = await again.page.locator('#rows > li').evaluateAll((els) => els.map((e) => e.getAttribute('data-learner')));
    assert.deepEqual(ids, MATH_ORDER.map((p) => w.ids[p.username]), 'the same order');
    const values = await again.page.locator('#rows > li').evaluateAll((els) => els.map((e) => [
      (e.querySelector('input.mark') as HTMLInputElement).value, (e.querySelector('input[type=checkbox]') as HTMLInputElement).checked,
    ]));
    assert.deepEqual(values, [['12', false], ['15.5', false], ['17', false], ['', true]], 'the same values');
    await shot(again.page, EVIDENCE, '10d-2-draft-reopened-ar');
    await again.ctx.close();
    const stored = await storedRows(w, exam);
    assert.ok(everyone.every((u) => stored[u].published_at === null), 'every row is still a draft');
  });

  it('a forged request by learner A for her own draft row answers exactly as a missing row; My results shows no draft', async () => {
    const draftId = (await storedRows(w, exam))[A.username].id;
    const a = await as(w, A);
    const answers = [];
    for (const [what, id] of [['A\'s own draft', draftId], ['B\'s draft', (await storedRows(w, exam))[B.username].id], ['no such row', NO_SUCH], ['not an id', 'x']] as const) {
      const res = await a.get(`/s/${w.spaceId}/results/${id}`);
      const body = await res.text();
      answers.push({ what, status: res.status, body, length: body.length });
    }
    for (const x of answers) {
      assert.equal(x.status, 403, `${x.what}: 403`);
      assert.equal(x.body, answers[0].body, `${x.what}: the same bytes`);
      assert.equal(x.length, answers[0].length, `${x.what}: the same length`);
    }
    const list = await (await a.get(`/s/${w.spaceId}/results`)).text();
    assert.match(list, /id="results-none"/, 'My results: nothing yet');
    assert.ok(!list.includes('Mid-term') && !list.includes(draftId) && !list.includes('>17<'), 'no draft, no mark');
  });

  it('a forged request by a guardian (G1, linked to A; G2) for a draft row answers exactly as a missing row', async () => {
    const draftId = (await storedRows(w, exam))[A.username].id;
    for (const g of [G1, G2]) {
      const c = await as(w, g);
      const answers = [];
      for (const path of [
        `/s/${w.spaceId}/results/${draftId}`, `/s/${w.spaceId}/results/${NO_SUCH}`,
        `/s/${w.spaceId}/linked/${w.ids[A.username]}/results/${draftId}`, `/s/${w.spaceId}/linked/${w.ids[A.username]}/results/${NO_SUCH}`,
      ]) {
        const res = await c.get(path);
        const body = await res.text();
        answers.push({ path, status: res.status, body });
        assert.ok(!body.includes('Mid-term') && !body.includes('>17<'), `${g.username} ${path}: nothing of the draft`);
      }
      for (const [draft, missing] of [[answers[0], answers[1]], [answers[2], answers[3]]]) {
        assert.equal(draft.status, missing.status, `${g.username}: the same status for ${draft.path}`);
        assert.equal(draft.body, missing.body, `${g.username}: the same bytes`);
        assert.equal(draft.body.length, missing.body.length, `${g.username}: the same length`);
      }
      const home = await (await c.get(`/s/${w.spaceId}/linked/${w.ids[A.username]}`)).text();
      assert.ok(!home.includes('Mid-term'), `${g.username}: A's page shows no draft`);
    }
  });
});
