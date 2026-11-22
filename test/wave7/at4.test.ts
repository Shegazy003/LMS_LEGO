// LMS wave 7, W7-1 (product-contract v2 on PIL-261, AT-4.2 for the staff pages
// and AT-4.3 with W7-b): teacher text is shown only as text, and scores stay
// private. AT-4.3's byte-identical guardian and owner pages are in
// test/wave7/base.test.ts (against W6-main); the AT-13a and AT-13b scans gain
// the quiz words (test/at13/pages.ts). Each labelled expectation is its own CI
// step (`W7 AT-4.n …`, job wave-7). Made-up data only.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { UI } from '../../src/i18n/ui.ts';
import type { Client } from '../support/http.ts';
import { quizHits } from '../at13/pages.ts';
import {
  ADMIN, HADEER, KARIM5, MONA, NOUR6, OMAR, QX, QX_QUESTIONS, QX_TITLE, RANA5, SALMA, SHIMAA, AT, adminQuizzes, as, closeWave6, publisherQuizzes, resultsOf, wave7World, withW7b, withW7c,
  type Wave1World,
} from './world.ts';
import { writeAttempt, answersFor } from './attempts.ts';

const escaped = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Every page a client reaches from its home (GET links only), as HTML. */
async function crawl(c: Client, url: string, limit = 900): Promise<{ path: string; status: number; body: string }[]> {
  const keep = (path: string) => !path.startsWith('/__test') && !/\/signout\b/.test(path);
  const seen = new Set<string>();
  const out: { path: string; status: number; body: string }[] = [];
  const queue = ['/'];
  while (queue.length && seen.size < limit) {
    const path = queue.shift()!;
    if (seen.has(path)) continue;
    seen.add(path);
    const res = await c.get(path);
    if (res.status >= 300 && res.status < 400) {
      await res.arrayBuffer();
      const to = (res.headers.get('location') ?? '').replace(url, '');
      if (to.startsWith('/') && keep(to)) queue.push(to);
      continue;
    }
    if (!(res.headers.get('content-type') ?? '').startsWith('text/html')) {
      await res.arrayBuffer();
      continue;
    }
    const body = await res.text();
    out.push({ path, status: res.status, body });
    for (const m of body.matchAll(/(?:href|src)="(\/[^"#]*)/g)) {
      const next = m[1].replace(/&amp;/g, '&');
      if (!seen.has(next) && keep(next)) queue.push(next);
    }
  }
  assert.ok(seen.size < limit, `the crawl ends before ${limit} pages`);
  return out;
}

describe('W7 AT-4.2 safe text on the staff pages (W7-c: QX on the quiz list, the editor and the results)', { concurrency: false }, () => {
  let w: Wave1World;
  before(async () => {
    ({ w } = await wave7World());
    await withW7c(w);
  });
  after(() => closeWave6(w));

  it('W7 AT-4.2 (staff pages) every text shown literally; no element, attribute or link from it; markdown not rendered; a line break kept by CSS pre-line; titles in <bdi>, question and answer texts in dir="auto"', async () => {
    const s = w.school;
    const hadeer = await as(w, HADEER, 'en');
    const amal = await as(w, ADMIN, 'en');
    const pages: [string, string][] = [];
    const lists = [[hadeer, publisherQuizzes(s, s.math)], [amal, adminQuizzes(s, s.math)]] as const;
    // The editable editor first (no attempt yet), then, with Salma's attempt, the locked editor and the results pages.
    for (const [c, list] of lists) for (const path of [list, `${list}/${QX}`]) pages.push([path, await (await c.get(path)).text()]);
    await writeAttempt((q) => w.p.sql(q), { space: s.id, quiz: QX, learner: w.ids[SALMA.username], questions: QX_QUESTIONS, posted: answersFor(QX_QUESTIONS, (i) => (i === 0 ? 'right' : 'wrong')), sentAt: AT.noon - 1000 });
    const locked: [string, string][] = [];
    for (const [c, list] of lists) locked.push([`${list}/${QX} (locked)`, await (await c.get(`${list}/${QX}`)).text()]);
    pages.push(...locked);
    const results = resultsOf(publisherQuizzes(s, s.math), QX);
    for (const path of [results, `${results}/${w.ids[SALMA.username]}`]) {
      const res = await hadeer.get(path);
      assert.equal(res.status, 200, path);
      pages.push([path, await res.text()]);
    }
    const texts = [QX_TITLE, ...QX_QUESTIONS.flatMap((q) => [q.text, ...q.answers.map((a) => a.text)])];
    for (const [path, body] of pages) {
      const main = body.slice(body.indexOf('<main'));
      // No element, attribute or link built from the text: the only scripts are the product's own focus script.
      assert.ok(!/<img\b/i.test(main), `${path}: no img`);
      assert.ok(!/javascript:/i.test(main.replace(/&[a-z#0-9]+;/gi, '')) || !/href="javascript:/i.test(main), `${path}: no javascript: link`);
      assert.ok(!/href="javascript:/i.test(main), `${path}: no javascript: address`);
      assert.ok(!/<script>alert/i.test(main) && [...main.matchAll(/<script\b/gi)].length <= 1, `${path}: no script from the text`);
      assert.ok(!/onerror=/i.test(main.replace(/&lt;img src=x onerror=alert\(1\)&gt;/g, '')), `${path}: no event attribute`);
      assert.ok(!/<(b|strong|em)>/i.test(main), `${path}: no markup from the text (markdown or &lt;b&gt; not rendered)`);
      assert.ok(!/<br\b/i.test(main), `${path}: no <br> built from the text`);
      // Every text literally: the title in <bdi>, escaped.
      assert.ok(main.includes(`<bdi>${escaped(QX_TITLE)}</bdi>`), `${path}: the title, escaped, in <bdi>`);
      assert.ok(main.includes('**bold**') && main.includes('&amp;lt;b&amp;gt;'), `${path}: markdown and entities shown literally`);
    }
    // The editor (both): question texts in a textarea with dir="auto", answers in inputs with dir="auto", all escaped.
    for (const [path, body] of pages.filter(([p]) => p.endsWith(`/${QX}`))) {
      for (const q of QX_QUESTIONS) {
        assert.ok(body.includes(`dir="auto">${escaped(q.text)}</textarea>`), `${path}: question text, escaped, in a dir="auto" textarea (the line break kept)`);
        for (const a of q.answers) assert.ok(body.includes(`dir="auto" value="${escaped(a.text)}"`), `${path}: answer ${JSON.stringify(a.text)} escaped in a dir="auto" field`);
      }
    }
    // The answers page and the locked editors: question and answer texts as text in dir="auto" elements, the line break shown by CSS pre-line.
    for (const [path, body] of [...locked, pages.at(-1)!]) {
      for (const q of QX_QUESTIONS) {
        assert.ok(body.includes(`<p class="quiz-text" dir="auto">${escaped(q.text)}</p>`), `${path}: question text in a dir="auto" paragraph, its line break as is`);
        for (const a of q.answers) assert.ok(body.includes(`<span class="quiz-answer-text" dir="auto">${escaped(a.text)}</span>`), `${path}: answer text in a dir="auto" element`);
      }
    }
    const answers = pages.at(-1)![1];
    assert.ok(/\.quiz-text\{white-space:pre-line/.test(answers), 'the line break shows through CSS pre-line');
    assert.ok(QX_QUESTIONS[0].text.includes('\n') && texts.some((x) => x.includes('‮')), 'the hostile texts hold a line break and U+202E');
  });
});

describe('W7 AT-4.3 scores stay private (W7-b): the crawl of every staff, guardian, owner and learner page', { concurrency: false }, () => {
  let w: Wave1World;
  before(async () => {
    ({ w } = await wave7World());
    await withW7b(w);
  });
  after(() => closeWave6(w));

  it('W7 AT-4.3 (crawl) Salma\'s score appears only on Hadeer\'s QA results pages; no guardian, owner, learner or other-space page shows a quiz string; Arabic and English', async (t) => {
    const s = w.school;
    // A score is shown where the results table, a score line or the summary is (their markers), or where Salma's name is
    // followed by her score "1 of 3" (quizScoreCell). Word matching alone is not used: «إجابات» and "<n> of <m>" are
    // ordinary words of other lines (the lock note, wave 2's progress lines).
    const visible = (body: string) => body.replace(/<style>[\s\S]*?<\/style>/g, ' ').replace(/<script>[\s\S]*?<\/script>/g, ' ').replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
    const salmaScore = (['en', 'ar'] as const).map((lang) => new RegExp(`${SALMA.display_name}.{0,80}?${UI[lang].quizScoreCell.replace('{score}', '1').replace('{total}', '3')}`));
    const shown = (body: string) => /id="quiz-results"|id="quiz-score"|id="quiz-stats"/.test(body) || salmaScore.some((re) => re.test(visible(body)));
    const people = [
      { who: 'Hadeer', p: HADEER, kind: 'publisher' }, { who: 'Amal', p: ADMIN, kind: 'staff' }, { who: 'Shimaa', p: SHIMAA, kind: 'staff' },
      { who: 'Mona', p: MONA, kind: 'guardian' }, { who: 'Karim Test', p: KARIM5, kind: 'learner' }, { who: 'Salma', p: SALMA, kind: 'learner' },
      { who: 'Omar C', p: OMAR, kind: 'learner' }, { who: 'Rana Test', p: RANA5, kind: 'learner' }, { who: 'Nour Test', p: NOUR6, kind: 'learner' },
    ] as const;
    const counts: Record<string, number> = {};
    let hadeerScores = 0;
    for (const lang of ['ar', 'en'] as const) {
      for (const person of [...people, { who: 'owner', p: null, kind: 'owner' } as const]) {
        const c = person.p ? await as(w, person.p, lang) : w.owner;
        if (!person.p) await c.post('/account/language', { lang });
        const pages = await crawl(c, w.p.url);
        counts[`${person.who} ${lang}`] = pages.length;
        for (const page of pages) {
          const otherSpace = /^\/s\//.test(page.path) && !page.path.startsWith(`/s/${s.id}`);
          if (shown(page.body)) {
            assert.ok(person.who === 'Hadeer' && page.path.includes(`/quizzes/`) && page.path.includes('/results'), `${person.who} ${lang} ${page.path}: a score only on Hadeer's results pages`);
            hadeerScores++;
          }
          if (person.kind === 'guardian' || person.kind === 'owner' || person.kind === 'learner' || otherSpace) {
            // After W7-1 no learner page changes: no quiz string at all on a learner's, guardian's or owner's page, nor in another space.
            assert.deepEqual(quizHits(page.body), [], `${person.who} ${lang} ${page.path}: no quiz string`);
            assert.ok(!page.body.includes('Fractions check'), `${person.who} ${lang} ${page.path}: no quiz title`);
          }
          if (person.kind !== 'publisher') assert.ok(!page.body.includes('/results/'), `${person.who} ${lang} ${page.path}: no answers link`);
        }
      }
    }
    t.diagnostic(`AT-4.3 crawl with W7-b: pages per person and language ${JSON.stringify(counts)}; ${hadeerScores} of Hadeer's results pages show scores`);
    assert.ok(hadeerScores >= 4, 'positive control: Hadeer\'s results pages show the scores');
    assert.ok((counts['Amal en'] ?? 0) > 20 && (counts['Mona en'] ?? 0) > 3 && (counts['owner en'] ?? 0) > 3, 'the crawls reached their pages');
  });
});
