// LMS wave 7, W7-1 (product-contract v2 on PIL-261, AT-2): the teacher sees
// results; nobody else does. With W7-b (attempts written directly, scored by
// the product's buildAttempt). Each labelled expectation is its own CI step
// (`W7 AT-2.n …`, job wave-7). Strings are asserted by ui.ts key. Made-up data only.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { UI } from '../../src/i18n/ui.ts';
import { makeLabel } from '../../src/labels.ts';
import { seedKit } from '../../src/kits/seed.ts';
import type { Client } from '../support/http.ts';
import {
  ADMIN, AT, HADEER, MONA, OMAR, QA_QUESTIONS, RANA5, SALMA, SHIMAA, W7A, QS, adminQuizzes, as, closeWave6, editorPath, located, publisherQuizzes, quizRowsOf, resultsOf, textOf,
  topicPath, wave7World, withW7b, withW7d, withW7e, withW7f, LAILA7, type Wave1World,
} from './world.ts';

const en = makeLabel('en', seedKit('school'));

const html = async (c: Client, path: string, status = 200) => {
  const res = await c.get(path);
  assert.equal(res.status, status, `GET ${path}`);
  return res.text();
};

/** A results page as a reader gets it. */
function resultsOf_(page: string) {
  const table = /<table id="quiz-results" class="quiz-table">([\s\S]*?)<\/table>/.exec(page)?.[1] ?? null;
  return {
    caption: table ? textOf(/<caption>([\s\S]*?)<\/caption>/.exec(table)![1]) : null,
    rows: table ? [...table.matchAll(/<tr><td data-label="[^"]+"><a class="quiz-name" href="([^"]+)"><bdi>([\s\S]*?)<\/bdi><\/a> <span class="muted second-id">([\s\S]*?)<\/span><\/td>\s*<td data-label="[^"]+">([\s\S]*?)<\/td><td data-label="[^"]+">([\s\S]*?)<\/td><\/tr>/g)].map((m) => ({ href: m[1], name: textOf(m[2]), tail: textOf(m[3]), score: textOf(m[4]), date: textOf(m[5]), dateLtr: /dir="ltr"/.test(m[5]) })) : [],
    stats: [...(/<ul id="quiz-stats" class="quiz-stats">([\s\S]*?)<\/ul>/.exec(page)?.[1] ?? '').matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => textOf(m[1])),
    none: /<p id="quiz-results-none" class="quiz-help">/.test(page),
    pager: /<nav class="quiz-pager"[^>]*>([\s\S]*?)<\/nav>/.exec(page) ? {
      prev: /rel="prev" href="([^"]+)">([\s\S]*?)<\/a>/.exec(page)?.slice(1).map(textOf) ?? null,
      next: /rel="next" href="([^"]+)">([\s\S]*?)<\/a>/.exec(page)?.slice(1).map(textOf) ?? null,
      of: textOf(/<span class="quiz-page-of">([\s\S]*?)<\/span>/.exec(page)![1]),
    } : null,
  };
}

describe('W7 AT-2 the teacher sees results; nobody else does (W7-b)', { concurrency: false }, () => {
  let w: Wave1World;
  let hadeer: Client;
  let amal: Client;
  before(async () => {
    ({ w } = await wave7World());
    await withW7b(w);
    hadeer = await as(w, HADEER, 'en');
    amal = await as(w, ADMIN, 'en');
  });
  after(() => closeWave6(w));

  it('W7 AT-2.1 results page: the link with the count, the table by name with scores and UTC dates, the per-question summary, each learner\'s answers; quizResultsNone without attempts', async () => {
    const s = w.school;
    const list = publisherQuizzes(s, s.math);
    const qa = quizRowsOf(await html(hadeer, list)).find((r) => r.id === W7A.QA)!;
    assert.deepEqual(qa.results, { href: resultsOf(list, W7A.QA), text: en('quizResultsLink', { n: '2' }) }, 'quizResultsLink (2)');
    const page = await html(hadeer, resultsOf(list, W7A.QA));
    assert.ok(page.includes(`<h1 id="quiz-results-title" dir="auto">${UI.en.quizResultsTitle.replace('{title}', '<bdi>Fractions check</bdi>')}</h1>`), 'quizResultsTitle');
    const r = resultsOf_(page);
    assert.equal(r.caption, en('quizResultsCount', { n: '2' }), 'quizResultsCount (2)');
    assert.deepEqual(r.rows.map((x) => [x.name, x.score, x.date, x.dateLtr]), [
      [OMAR.display_name, en('quizScoreCell', { score: '3', total: '3' }), '2026-12-10', true],
      [SALMA.display_name, en('quizScoreCell', { score: '1', total: '3' }), '2026-12-10', true],
    ], 'sorted by name: name, score, the UTC sent date');
    assert.ok(r.rows.every((x) => x.tail.length > 0), 'each name carries its second identifier (the exam pages\' rule)');
    assert.deepEqual(r.stats, [['1', '2'], ['2', '1'], ['3', '1']].map(([n, right]) => en('quizQuestionStat', { n, right, all: '2' })), 'the per-question summary');
    // Salma's answers: the chosen answer, the right one and the verdict per question, drawn by quizResultBody.
    const salmaRow = r.rows.find((x) => x.name === SALMA.display_name)!;
    assert.equal(salmaRow.href, `${resultsOf(list, W7A.QA)}/${w.ids[SALMA.username]}`);
    const answers = await html(hadeer, salmaRow.href);
    assert.equal(textOf(/<h1 id="quiz-answers-title" dir="auto">([\s\S]*?)<\/h1>/.exec(answers)![1]), en('quizAnswersOf', { name: SALMA.display_name }));
    assert.equal(textOf(/<p id="quiz-score" class="quiz-score">([\s\S]*?)<\/p>/.exec(answers)![1]), en('quizScoreLine', { score: '1', total: '3' }));
    const sections = [...answers.matchAll(/<section class="quiz-question card">([\s\S]*?)<\/section>/g)].map((m) => m[1]);
    assert.equal(sections.length, 3);
    const verdicts = sections.map((x) => textOf(/<p class="quiz-verdict [a-z-]+">([\s\S]*?)<\/p>/.exec(x)![1]));
    assert.deepEqual(verdicts, [en('quizRight'), en('quizWrong'), en('quizNoAnswer')], 'right, wrong, no answer');
    const tagsOf = (x: string) => [...x.matchAll(/<li class="quiz-answer[^"]*">([\s\S]*?)<\/li>/g)].map((m) => textOf(m[1]));
    assert.deepEqual(tagsOf(sections[0]), ['2/6', `✓ 3/4 ${en('quizChosen')} ${en('quizRightMark')}`, '1/8'], 'question 1: chosen and right');
    assert.deepEqual(tagsOf(sections[1]), [`✗ 1/5 ${en('quizChosen')}`, '1/4', '1/3', `✓ 1/2 ${en('quizRightMark')}`], 'question 2: the wrong choice and the right one');
    assert.deepEqual(tagsOf(sections[2]), [`✓ True ${en('quizRightMark')}`, 'False'], 'question 3: no choice, the right one');
    // No attempt: quizResultsNone.
    const none = resultsOf_(await html(hadeer, resultsOf(list, W7A.QB)));
    assert.ok(none.none && none.rows.length === 0 && none.stats.length === 0, 'quizResultsNone');
  });

  it('W7 AT-2.3a only the responsible publisher: Amal has no results link and gets 403 on every results address; so do another publisher, learners, Mona and the owner; a learner without an attempt or of another space 404', async () => {
    const s = w.school;
    const list = publisherQuizzes(s, s.math);
    const admin = adminQuizzes(s, s.math);
    assert.ok(quizRowsOf(await html(amal, admin)).every((r) => r.results === null), 'no results link on the admin\'s list');
    assert.ok(!(await html(amal, admin)).includes('/results'), 'no results address on the admin\'s list');
    const addresses = [resultsOf(list, W7A.QA), `${resultsOf(list, W7A.QA)}/${w.ids[SALMA.username]}`, resultsOf(admin, W7A.QA), `${resultsOf(admin, W7A.QA)}/${w.ids[SALMA.username]}`];
    const people = [
      { who: 'Amal', c: amal }, { who: 'Shimaa', c: await as(w, SHIMAA, 'en') }, { who: 'Salma', c: await as(w, SALMA, 'en') },
      { who: 'Omar C', c: await as(w, OMAR, 'en') }, { who: 'Rana Test', c: await as(w, RANA5, 'en') }, { who: 'Mona', c: await as(w, MONA, 'en') }, { who: 'the owner', c: w.owner },
    ];
    for (const p of people) for (const path of addresses) assert.equal((await p.c.get(path)).status, 403, `${p.who} GET ${path}`);
    // Hadeer on the admin address: the admin gate's 403 (she is not an admin).
    for (const path of addresses.slice(2)) assert.equal((await hadeer.get(path)).status, 403, `Hadeer GET ${path}`);
    // A learner id with no attempt on the quiz, or of another space: 404.
    const youssef = String((await w.p.sql("SELECT id FROM user WHERE username = 'youssef.w1'"))[0].id);
    for (const id of [w.ids[RANA5.username], youssef, 'nobody-at-all']) assert.equal((await hadeer.get(`${resultsOf(list, W7A.QA)}/${id}`)).status, 404, `learner ${id}`);
    const otherSpace = String((await w.p.sql(`SELECT u.id FROM user u JOIN membership m ON m.user_id = u.id WHERE m.space_id = '${w.company.id}' AND m.role = 'learner' AND u.id NOT IN (SELECT user_id FROM membership WHERE space_id = '${s.id}') LIMIT 1`))[0]?.id ?? 'none');
    assert.equal((await hadeer.get(`${resultsOf(list, W7A.QA)}/${otherSpace}`)).status, 404, 'a learner of another space');
  });

  it('W7 AT-2.4 access and removal: ended access leaves the list and summary until restored; an unassigned learner stays; a removed quiz 404 and back unchanged; a new responsible publisher sees the results', async () => {
    const s = w.school;
    const list = publisherQuizzes(s, s.math);
    const page = () => html(hadeer, resultsOf(list, W7A.QA));
    const omar = w.ids[OMAR.username];
    await w.p.sql(`UPDATE membership SET ended_on = '2026-12-10' WHERE user_id = '${omar}' AND space_id = '${s.id}'`);
    let r = resultsOf_(await page());
    assert.deepEqual([r.caption, r.rows.map((x) => x.name), r.stats[0]], [en('quizResultsCount', { n: '1' }), [SALMA.display_name], en('quizQuestionStat', { n: '1', right: '1', all: '1' })], 'Omar C leaves the list and the summary');
    assert.equal((await hadeer.get(`${resultsOf(list, W7A.QA)}/${omar}`)).status, 404, 'his answers page too');
    assert.equal(quizRowsOf(await html(hadeer, list)).find((x) => x.id === W7A.QA)!.results!.text, en('quizResultsLink', { n: '1' }), 'the link count follows');
    await w.p.sql(`UPDATE membership SET ended_on = NULL WHERE user_id = '${omar}' AND space_id = '${s.id}'`);
    const full = await page();
    assert.equal(resultsOf_(full).caption, en('quizResultsCount', { n: '2' }), 'restored access brings him back');
    // Salma unassigned from Mathematics (still in the space): her row stays.
    const salma = w.ids[SALMA.username];
    const kept = await w.p.sql(`SELECT * FROM group_member WHERE user_id = '${salma}' AND space_id = '${s.id}'`);
    const direct = await w.p.sql(`SELECT * FROM subject_access WHERE user_id = '${salma}' AND subject_id = '${s.math}'`);
    await w.p.sql(`DELETE FROM group_member WHERE user_id = '${salma}' AND space_id = '${s.id}'`);
    await w.p.sql(`DELETE FROM subject_access WHERE user_id = '${salma}' AND subject_id = '${s.math}'`);
    assert.equal(await page(), full, 'her row stays (her score was earned)');
    for (const g of kept) await w.p.sql(`INSERT INTO group_member (space_id, group_id, user_id) VALUES ('${g.space_id}', '${g.group_id}', '${g.user_id}')`);
    for (const a of direct) await w.p.sql(`INSERT INTO subject_access (id, space_id, subject_id, user_id) VALUES ('${a.id}', '${a.space_id}', '${a.subject_id}', '${a.user_id}')`);
    // Removing QA: its results addresses 404 and its link hidden; Restore brings them back unchanged.
    await hadeer.post(`${list}/${W7A.QA}/remove`, { rev: '0' });
    for (const path of [resultsOf(list, W7A.QA), `${resultsOf(list, W7A.QA)}/${salma}`]) assert.equal((await hadeer.get(path)).status, 404, `removed: ${path}`);
    assert.ok(!quizRowsOf(await html(hadeer, list)).some((x) => x.id === W7A.QA), 'no row, no link');
    await hadeer.post(`${list}/${W7A.QA}/restore`, { rev: '0' });
    assert.equal(await page(), full, 'restored: unchanged');
    // Hadeer's access ends; Amal makes Shimaa responsible (the subject admin form): Shimaa sees QA's results, Hadeer gets today's access-ended answer.
    const hadeerId = w.ids[HADEER.username];
    await w.p.sql(`UPDATE membership SET ended_on = '2026-12-10' WHERE user_id = '${hadeerId}' AND space_id = '${s.id}'`);
    const form = new FormData();
    form.set('publisher', w.ids[SHIMAA.username]);
    for (const a of await w.p.sql(`SELECT group_id, user_id FROM subject_access WHERE subject_id = '${s.math}'`)) {
      if (a.group_id) form.append('set', String(a.group_id));
      if (a.user_id) form.append('learner', String(a.user_id));
    }
    const saved = await amal.post(topicPath(s, s.math), form);
    assert.equal(saved.status, 303, 'Amal saves the subject with Shimaa responsible');
    const shimaa = await as(w, SHIMAA, 'en');
    const theirs = resultsOf_(await html(shimaa, resultsOf(list, W7A.QA)));
    assert.equal(theirs.caption, en('quizResultsCount', { n: '2' }), 'the new publisher sees QA\'s results');
    const ended = await hadeer.get(resultsOf(list, W7A.QA));
    const today = await hadeer.get(`${editorPath(s, s.math)}/due`);
    assert.equal(ended.status, today.status, 'Hadeer: today\'s access-ended answer');
    assert.equal(textOf(await ended.text()), textOf(await today.text()));
    // Back as the world was.
    await w.p.sql(`UPDATE membership SET ended_on = NULL WHERE user_id = '${hadeerId}' AND space_id = '${s.id}'`);
    await w.p.sql(`UPDATE subject SET publisher_user_id = '${hadeerId}' WHERE id = '${s.math}'`);
  });

  it('W7 AT-2.5 no score on other staff pages: the admin\'s list and editors and the publisher\'s editors show no name, score or count; byte-identical with and without W7-b but for the lock note, the open help and the read-only questions', async () => {
    const s = w.school;
    // The same world without W7-b: a fresh one, fetched before and after writing W7-b.
    const { w: w2 } = await wave7World();
    try {
      const h2 = await as(w2, HADEER, 'en');
      const a2 = await as(w2, ADMIN, 'en');
      const s2 = w2.school;
      const pages = (): [Client, string][] => [
        [a2, adminQuizzes(s2, s2.math)],
        ...[W7A.QA, W7A.QB, W7A.QC].flatMap((id): [Client, string][] => [[a2, `${adminQuizzes(s2, s2.math)}/${id}`], [h2, `${publisherQuizzes(s2, s2.math)}/${id}`]]),
      ];
      const fetchAll = async () => Promise.all(pages().map(async ([c, p]) => (await c.get(p)).text()));
      const before = await fetchAll();
      await withW7b(w2);
      const after = await fetchAll();
      const names = [SALMA.display_name, OMAR.display_name, RANA5.display_name];
      // The questions block runs from its opening tag to the copy form, which follows it.
      const cut = (page: string) => page
        .replace(/<div id="quiz-questions" class="quiz-questions">[\s\S]*?(?=<form id="quiz-copy")/, '[questions]')
        .replace(`<p class="quiz-help quiz-open-help">${UI.en.quizOpenHelp}</p>`, '');
      for (const [i, [, path]] of pages().entries()) {
        const locked = path.endsWith(W7A.QA) || path.endsWith(W7A.QC);
        for (const name of names) assert.ok(!after[i].includes(name), `${path}: no learner name (${name})`);
        assert.ok(!/\b\d+ of \d+\b/.test(textOf(after[i])), `${path}: no score`);
        assert.ok(!after[i].includes('/results'), `${path}: no results link or count`);
        if (locked) {
          assert.ok(after[i].includes('id="quiz-locked"') && !before[i].includes('id="quiz-locked"'), `${path}: the lock note is the difference`);
          assert.equal(cut(after[i]), cut(before[i]), `${path}: otherwise byte-identical`);
        } else {
          assert.equal(after[i], before[i], `${path}: byte-identical`);
        }
      }
    } finally {
      await closeWave6(w2);
    }
    void s;
  });
});

describe('W7 AT-2.2 pages of 50 (W7-e: 300 attempts on QL)', { concurrency: false }, () => {
  let w: Wave1World;
  let hadeer: Client;
  before(async () => {
    ({ w } = await wave7World());
    await withW7d(w);
    await withW7e(w);
    hadeer = await as(w, HADEER, 'en');
  });
  after(() => closeWave6(w));

  it('W7 AT-2.2 pages of 50: 50 names per page in name order with previous, next and page of; page 7 404; the count and the summary cover all 300', async () => {
    const s = w.school;
    const path = resultsOf(publisherQuizzes(s, s.math), 'w7d-ql');
    const names: string[] = [];
    for (let n = 1; n <= 6; n++) {
      const r = resultsOf_(await html(hadeer, n === 1 ? path : `${path}?page=${n}`));
      assert.equal(r.rows.length, 50, `page ${n}: 50 names`);
      assert.equal(r.caption, en('quizResultsCount', { n: '300' }), `page ${n}: the count covers all 300`);
      assert.equal(r.pager?.of, en('quizPageOf', { n: String(n), m: '6' }));
      assert.deepEqual(r.pager?.prev?.[1] ?? null, n > 1 ? en('quizPagePrev') : null, `page ${n}: previous`);
      assert.deepEqual(r.pager?.next?.[1] ?? null, n < 6 ? en('quizPageNext') : null, `page ${n}: next`);
      assert.equal(r.stats.length, 20, 'one summary line per question');
      names.push(...r.rows.map((x) => x.name));
    }
    assert.deepEqual(names, [...names].sort(), 'name order');
    assert.equal(new Set(names).size, 300, 'every one of the 300, once');
    assert.equal((await hadeer.get(`${path}?page=7`)).status, 404, 'page 7 shows none: 404');
    // The summary covers all 300: question 1's right answers as stored.
    const flags = await w.p.sql("SELECT right_flags FROM quiz_attempt WHERE quiz_id = 'w7d-ql'");
    const right1 = flags.filter((f) => String(f.right_flags)[0] === '1').length;
    const first = resultsOf_(await html(hadeer, path));
    assert.equal(first.stats[0], en('quizQuestionStat', { n: '1', right: String(right1), all: '300' }), 'the summary covers all 300');
    void AT;
    void QA_QUESTIONS;
  });
});

describe('W7 AT-2.3b an admin who is also the responsible publisher (W7-f)', { concurrency: false }, () => {
  let w: Wave1World;
  before(async () => {
    ({ w } = await wave7World());
    await withW7b(w);
  });
  after(() => closeWave6(w));

  it('W7 AT-2.3b Laila Test sees QS\'s results through the publisher address; on Mathematics no results link and 403 on QA\'s results addresses', async () => {
    const { science } = await withW7f(w);
    const s = w.school;
    const laila = await as(w, LAILA7, 'en');
    const list = publisherQuizzes(s, science);
    const qs = quizRowsOf(await html(laila, list)).find((r) => r.id === QS)!;
    assert.equal(qs.results?.text, en('quizResultsLink', { n: '1' }), 'her results link on Science Test');
    const r = resultsOf_(await html(laila, resultsOf(list, QS)));
    assert.deepEqual(r.rows.map((x) => [x.name, x.score]), [[SALMA.display_name, en('quizScoreCell', { score: '1', total: '1' })]], 'QS\'s results');
    assert.ok(quizRowsOf(await html(laila, adminQuizzes(s, s.math))).every((x) => x.results === null), 'no results link on Mathematics');
    for (const path of [resultsOf(publisherQuizzes(s, s.math), W7A.QA), `${resultsOf(publisherQuizzes(s, s.math), W7A.QA)}/${w.ids[SALMA.username]}`, resultsOf(adminQuizzes(s, s.math), W7A.QA)]) {
      assert.equal((await laila.get(path)).status, 403, `Laila GET ${path}`);
    }
    void located;
  });
});
