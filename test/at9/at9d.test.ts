// AT-9d (contract product-contract-r2, R2-a): G1 signs in and sees only A and
// B, each with their assigned subject titles and each subject's publisher name.
// No lesson contents, files or other learners. G2 sees only A. A page address
// for a learner not linked to the viewer is refused identically (same status,
// same body bytes, same length, for an existing and a non-existing target).
// The guardian home is driven in Chromium at phone width, Arabic first, then
// English; screenshots go to evidence/at-9/.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser } from 'playwright';
import { assertPage, phone, readable, shot, signIn } from '../support/browser.ts';
import { A, B, C, CONTENT_WORDS, D, G1, G2, HADEER, KARIM, SHIMAA, SPACE, as, buildWorld, type World } from './world.ts';

const EVIDENCE = fileURLToPath(new URL('../../evidence/at-9/', import.meta.url));

let w: World;
let browser: Browser;

/** The learners on a guardian page, and each one's subject lines, as the page shows them. */
function cards(html: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const m of html.matchAll(/<section class="card" data-learner="([^"]+)">([\s\S]*?)<\/section>/g)) {
    out[m[1]] = [...m[2].matchAll(/<li><bdi class="title">([^<]*)<\/bdi> <span class="muted">· [^:]*: (?:<bdi>([^<]*)<\/bdi>|([^<]*))<\/span><\/li>/g)].map((x) => `${x[1]} (${x[2] ?? x[3]})`);
  }
  return out;
}

describe('AT-9d a guardian sees only their linked learners, their subjects and each subject\'s publisher', { concurrency: false }, () => {
  before(async () => {
    mkdirSync(EVIDENCE, { recursive: true });
    w = await buildWorld({ links: true });
    browser = await chromium.launch();
  });
  after(async () => {
    await browser?.close();
    await w?.close();
  });

  it('G1 sees A (Mathematics by Hadeer, Arabic by Shimaa) and B (Mathematics by Hadeer), and nothing else', async () => {
    const g1 = await as(w, G1);
    const home = await g1.get(`/s/${w.spaceId}`);
    assert.equal(home.status, 200, 'the space home of a guardian');
    assert.equal(home.headers.get('cache-control'), 'no-store');
    const html = await home.text();
    assert.deepEqual(cards(html), {
      [w.ids[A.username]]: [`Arabic (${SHIMAA.display_name})`, `Mathematics (${HADEER.display_name})`],
      [w.ids[B.username]]: [`Mathematics (${HADEER.display_name})`],
    });
    for (const word of [...CONTENT_WORDS, C.display_name, KARIM.display_name, '/learn/', '/read/', '/file/']) {
      assert.ok(!html.includes(word), `the guardian home shows no ${word}`);
    }
    // The guardian home is also its own address, reached from the nav.
    const linked = await g1.get(`/s/${w.spaceId}/linked`);
    assert.equal(linked.status, 200);
    assert.deepEqual(cards(await linked.text()), cards(html));
  });

  it('each learner\'s own page shows that learner only, the same subjects and publishers', async () => {
    const g1 = await as(w, G1);
    for (const [learner, lines] of [[A, ['Arabic (Shimaa)', 'Mathematics (Hadeer)']], [B, ['Mathematics (Hadeer)']]] as const) {
      const res = await g1.get(`/s/${w.spaceId}/linked/${w.ids[learner.username]}`);
      assert.equal(res.status, 200, `${learner.username}'s page`);
      assert.equal(res.headers.get('cache-control'), 'no-store');
      const html = await res.text();
      assert.deepEqual(cards(html), { [w.ids[learner.username]]: [...lines] });
      for (const word of CONTENT_WORDS) assert.ok(!html.includes(word), `${learner.username}'s page shows no ${word}`);
    }
  });

  it('G2 sees only A', async () => {
    const g2 = await as(w, G2);
    const html = await (await g2.get(`/s/${w.spaceId}`)).text();
    assert.deepEqual(Object.keys(cards(html)), [w.ids[A.username]]);
    assert.ok(!html.includes(B.display_name), 'not B');
  });

  it('a learner page for anyone not linked to the viewer is refused identically, existing or not', async () => {
    const g2 = await as(w, G2);
    const targets = {
      'B (linked to G1, not to G2)': w.ids[B.username],
      'C (a learner of the space, linked to nobody)': w.ids[C.username],
      'D (same name as C)': w.ids[D.username],
      'Hadeer (a publisher)': w.ids[HADEER.username],
      'G1 (another guardian)': w.ids[G1.username],
      'a learner of another space': w.ids[KARIM.username],
      'no such person': '00000000-0000-4000-8000-000000000000',
      'not an id at all': 'x',
    };
    const answers = [];
    for (const [what, id] of Object.entries(targets)) {
      const res = await g2.get(`/s/${w.spaceId}/linked/${id}`);
      const body = await res.text();
      answers.push({ what, status: res.status, body, length: body.length });
    }
    for (const a of answers) {
      assert.equal(a.status, 403, `${a.what}: 403`);
      assert.equal(a.body, answers[0].body, `${a.what}: the same bytes`);
      assert.equal(a.length, answers[0].length, `${a.what}: the same length`);
    }
  });

  it('in a real browser at phone width: the guardian home in Arabic, then in English', async () => {
    const ph = await phone(browser);
    await signIn(w.p.url, ph.page, G1.username, G1.password);
    assert.ok(ph.page.url().endsWith(`/s/${w.spaceId}`), 'signed in, at the space home');
    await assertPage(ph.page, 'guardian home (Arabic)', 'ar');
    assert.equal((await ph.page.locator('#space-name').innerText()).trim(), SPACE);
    const ar = await readable(ph.page);
    assert.ok(ar.includes('صفحة ولي أمر'), 'the heading names the kit word (School kit: ولي أمر)');
    for (const name of [A.display_name, B.display_name, 'Mathematics', 'Arabic', HADEER.display_name, SHIMAA.display_name]) assert.ok(ar.includes(name), `shows ${name}`);
    for (const word of [...CONTENT_WORDS, C.display_name]) assert.ok(!ar.includes(word), `shows no ${word}`);
    await shot(ph.page, EVIDENCE, '9d-1-guardian-home-ar');
    await ph.page.click(`[data-learner="${w.ids[A.username]}"] a.learner`);
    await ph.page.waitForLoadState('load');
    assert.ok(ph.page.url().endsWith(`/linked/${w.ids[A.username]}`), 'A\'s page');
    await assertPage(ph.page, 'A\'s page (Arabic)', 'ar');
    await shot(ph.page, EVIDENCE, '9d-2-learner-page-ar');

    // English: the guardian's own language choice (My account).
    await ph.page.goto(w.p.url + '/account/language');
    await ph.page.selectOption('form#language select[name=lang]', 'en');
    await Promise.all([ph.page.waitForEvent('load'), ph.page.locator('form#language button[type=submit]').click()]);
    await ph.page.goto(w.p.url + `/s/${w.spaceId}`);
    await assertPage(ph.page, 'guardian home (English)', 'en');
    const en = await readable(ph.page);
    assert.ok(en.includes('Parent home'), 'the heading names the kit word (School kit: Parent)');
    assert.ok(en.includes('Teacher: Hadeer'), 'each subject with its publisher, in the kit\'s word');
    await shot(ph.page, EVIDENCE, '9d-3-guardian-home-en');
    await ph.ctx.close();
  });
});
