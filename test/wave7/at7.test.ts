// LMS wave 7, W7-3 (product-contract v3 addendum on PIL-285, AT-7, unchanged
// by the v4 amendment on PIL-295): the guardian sees the linked learner's quiz
// scores, exactly, read-only, on that learner's page. Each labelled expectation
// is its own CI step (`W7 AT-7.n …`, job wave-7). Attempts are sent through the
// learner's take page. Made-up data only.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import type { Client } from '../support/http.ts';
import type { InProcessWorker } from '../support/in-process.ts';
import { UI } from '../../src/i18n/ui.ts';
import { QUIZ_SCORES_OF_LINKED_SQL } from '../../src/quiz.ts';
import { LEARNER_RULE, SUBJECTS_FOR_LEARNER_SQL } from '../../src/learning.ts';
import { onLocalD1 } from '../wave6/todo.ts';
import { visible } from '../at13/pages.ts';
import {
  HALA7, NABIL7, QZ_TITLE, SAMI7, byId, clockTo, domOf, drawnOf, guardianAllowed, guardianQuizOf, nodesOf, quizAllowListProblems, send, textIn, withW7g, withW7h, withoutElement, type DomElement, type W7g,
} from './guardian.ts';
import { writeAttempt } from './attempts.ts';
import { htmlOf, sectionOf } from './learner.ts';
import {
  AT, LAILA6, MONA, QA_QUESTIONS, SALMA, TITLES, W7A, as, browserAs, closeWave6, fixed, go, insertQuiz, linkedPath, subjectPath, wave7World, withKitGuardians, withW6f, withW7d, withW7e, words, type Wave1World,
} from './world.ts';

const MATH = 'Mathematics';
const GRAMMAR = 'Arabic grammar';
type Item = [quiz: string, subject: string, score: number, total: number];

for (const activityOn of [true, false]) {
  describe(`W7 AT-7 guardian quiz scores (W7-g, lesson activity ${activityOn ? 'on' : 'off'})`, { concurrency: false }, () => {
    let w: Wave1World;
    let g: W7g;
    let mona: Client;
    const t = words('school', 'en');
    before(async () => {
      ({ w } = await wave7World({ activity: activityOn }));
      g = await withW7g(w);
      mona = await as(w, MONA, 'en');
    });
    after(() => closeWave6(w));

    const sql = (q: string) => w.p.sql(q);
    /** The block's items on a linked learner's page, as (quiz, subject, score, total) lines, or [] with no block. */
    async function itemsOn(c: Client, learner: string): Promise<{ items: string[]; page: string }> {
      const page = await htmlOf(c, linkedPath(w.school, learner));
      const b = guardianQuizOf(page);
      return { items: b ? drawnOf(b).map((i) => `${i.title} | ${i.line}`) : [], page };
    }
    const expected = (list: Item[]) => list.map(([q, s, n, m]) => `${q} | ${t('guardianQuizLine', { subjectTitle: s, score: String(n), total: String(m) })}`);

    it(`W7 AT-7.1 place and content: #quiz-guardian right after #results, the last block; heading with the name, the note, one item; no link, form, input or button; no question or answer text (activity ${activityOn ? 'on' : 'off'})`, async () => {
      const page = await htmlOf(mona, linkedPath(w.school, g.salma));
      const b = guardianQuizOf(page);
      assert.ok(b, 'the block is shown');
      const results = page.indexOf('<section id="results"');
      const resultsEnd = page.indexOf('</section>', results) + '</section>'.length;
      assert.equal(b.at, resultsEnd, 'the block comes right after #results, with nothing between');
      const mainEnd = page.indexOf('</main>');
      assert.ok(mainEnd > 0 && page.slice(b.at + b.html.length, mainEnd).trim() === '', 'the block is the last block of the page');
      assert.equal(b.heading, t('guardianQuizTitle', { name: SALMA.display_name }));
      assert.equal(b.note, t('guardianQuizNote'));
      assert.deepEqual(drawnOf(b).map((i) => `${i.title} | ${i.line}`), expected([[TITLES.QA, MATH, 1, 3]]));
      assert.equal(b.fold, null, 'no fold with one item');
      assert.ok(!/<(a|form|input|button)\b/.test(b.html), 'no link, form, input or button');
      for (const text of ['What is 1/2 + 1/4?', 'Which fraction is the largest?', 'Two quarters make one half.', '2/6', '3/4', '1/8', 'True', 'False']) {
        assert.ok(!b.html.includes(text), `no question or answer text (${text})`);
      }
    });

    it(`W7 AT-7.2 exactly the expected scores, in every state; Salma's own subject page shows each with the same score (activity ${activityOn ? 'on' : 'off'})`, async () => {
      const s = w.school;
      const salma = await as(w, SALMA, 'en');
      const QA: Item = [TITLES.QA, MATH, 1, 3];
      const QC: Item = [TITLES.QC, MATH, 1, 1];
      const check = async (state: string, list: Item[]) => {
        const { items, page } = await itemsOn(mona, g.salma);
        assert.deepEqual(items, expected(list), `${state}: the block equals the expected list`);
        assert.equal(guardianQuizOf(page) === null, list.length === 0, `${state}: the block is absent exactly when the list is empty`);
        assert.ok(!page.includes(QZ_TITLE), `${state}: the second space's quiz is never listed`);
        // For Salma (only a learner): each listed item shows the same score on her own subject page now.
        if (list.length) {
          const own = sectionOf(await htmlOf(salma, subjectPath(s, s.math)));
          for (const [quiz, , n, m] of list) {
            const row = own?.items.find((i) => i.title === quiz) ?? own?.fold?.items.find((i: { title: string }) => i.title === quiz);
            assert.ok(row && row.meta.includes(t('quizScoreCell', { score: String(n), total: String(m) })), `${state}: ${quiz} with ${n} of ${m} on Salma's own page`);
          }
        }
      };
      await check('W7-g', [QA]);
      await sql(`UPDATE quiz SET state = 'closed' WHERE id = '${W7A.QA}'`);
      await check('QA closed', [QA]);
      await sql(`UPDATE quiz SET state = 'open' WHERE id = '${W7A.QA}'`);
      await check('QA reopened', [QA]);
      await sql(`UPDATE quiz SET removed_at = ${AT.noon - 1000} WHERE id = '${W7A.QA}'`);
      await check('QA removed', []);
      await sql(`UPDATE quiz SET removed_at = NULL WHERE id = '${W7A.QA}'`);
      await check('QA restored', [QA]);
      // QC opened and taken by Salma a minute later (most recent first), then closed.
      await sql(`UPDATE quiz SET state = 'open' WHERE id = '${W7A.QC}'`);
      await clockTo(w, AT.noon + 60_000);
      await send(salma, s, W7A.QC, { 'qc-one': 'qc-one-b' });
      await sql(`UPDATE quiz SET state = 'closed' WHERE id = '${W7A.QC}'`);
      await check('QC taken then closed', [QC, QA]);
      await sql(`DELETE FROM quiz_attempt WHERE quiz_id = '${W7A.QC}' AND learner_user_id = '${g.salma}'`);
      await clockTo(w, AT.noon);
      await sql(`UPDATE subject SET is_published = 0 WHERE id = '${s.math}'`);
      await sql(`UPDATE quiz SET state = 'closed' WHERE id = '${W7A.QA}'`);
      const { items } = await itemsOn(mona, g.salma);
      assert.deepEqual(items, [], 'Mathematics unpublished with QA closed: no block');
      await sql(`UPDATE subject SET is_published = 1 WHERE id = '${s.math}'`);
      await sql(`UPDATE quiz SET state = 'open' WHERE id = '${W7A.QA}'`);
      await check('Mathematics republished', [QA]);
      // Mathematics reaches Salma through her group Science: unassigned, then assigned directly, then through the group again.
      await sql(`DELETE FROM group_member WHERE space_id = '${s.id}' AND group_id = '${g.group}' AND user_id = '${g.salma}'`);
      assert.deepEqual((await itemsOn(mona, g.salma)).items, [], 'Salma unassigned: no block');
      await sql(`INSERT INTO subject_access (id, space_id, subject_id, user_id) VALUES ('w7g-salma-direct', '${s.id}', '${s.math}', '${g.salma}')`);
      await check('Salma assigned directly', [QA]);
      await sql(`DELETE FROM subject_access WHERE id = 'w7g-salma-direct'`);
      await sql(`INSERT INTO group_member (space_id, group_id, user_id) VALUES ('${s.id}', '${g.group}', '${g.salma}')`);
      await check('Salma assigned through her group', [QA]);
      // Sami Test: Salma's list on Salma's page, Omar C's on Omar C's; Nabil Test: Karim Test's QG.
      const sami = await as(w, SAMI7, 'en');
      assert.deepEqual((await itemsOn(sami, g.salma)).items, expected([QA]), 'Sami Test on Salma\'s page');
      assert.deepEqual((await itemsOn(sami, g.omar)).items, expected([[TITLES.QA, MATH, 3, 3]]), 'Sami Test on Omar C\'s page');
      const nabil = await as(w, NABIL7, 'en');
      assert.deepEqual((await itemsOn(nabil, g.karim)).items, expected([[TITLES.QG, GRAMMAR, 1, 1]]), 'Nabil Test on Karim Test\'s page');
    });

    it(`W7 AT-7.7 one person, two roles, never mixed: Hala Test's own page shows her 3 of 3; Salma's page by Hala equals Mona's; Hala's own linked address is today's 403 (activity ${activityOn ? 'on' : 'off'})`, async () => {
      const s = w.school;
      const hala = await as(w, HALA7, 'en');
      const own = sectionOf(await htmlOf(hala, subjectPath(s, s.math)));
      const row = own?.items.find((i) => i.title === TITLES.QA);
      assert.ok(row && row.meta.includes(t('quizScoreCell', { score: '3', total: '3' })), 'Hala Test\'s own Mathematics page shows her QA score, 3 of 3');
      const byHala = await itemsOn(hala, g.salma);
      const byMona = await itemsOn(mona, g.salma);
      assert.deepEqual(byHala.items, byMona.items, 'Salma\'s page opened by Hala equals Mona\'s');
      assert.deepEqual(byHala.items, expected([[TITLES.QA, MATH, 1, 3]]), 'Salma\'s 1 of 3');
      assert.ok(!(own?.items ?? []).some((i) => i.meta.includes(t('quizScoreCell', { score: '1', total: '3' }))), 'Hala\'s own page does not show Salma\'s score');
      const self = await hala.get(linkedPath(s, g.hala));
      assert.equal(self.status, 403, 'Hala Test at her own linked address: 403');
      const other = await hala.get(linkedPath(s, 'no-such-person'));
      assert.equal(await self.text(), await other.text(), 'byte for byte today\'s 403 page');
    });
  });
}

// ------------------------------------------------------------- helpers ----

type Twin = { worker: InProcessWorker };
type Stmt = { sql: string; params: unknown[] };
const SCORE = /FROM quiz_attempt att\b/;

/** One GET under the statement spy: status, body and every statement with its parameters. */
export async function spied(w: Wave1World, c: Client, path: string): Promise<{ status: number; body: string; cache: string | null; log: Stmt[] }> {
  const worker = (w.p as unknown as Twin).worker;
  assert.ok(worker, 'the in-process product (statement spy)');
  const log: Stmt[] = [];
  worker.setHooks({ seen: (sql, params) => void log.push({ sql, params }) });
  try {
    const res = await c.get(path);
    const body = await res.text();
    await worker.settle();
    return { status: res.status, body, cache: res.headers.get('cache-control'), log };
  } finally {
    worker.setHooks({});
  }
}

/** Rows returned and D1's own rows_read of one statement (local D1 on a copy of the database). */
export async function figuresOf(w: Wave1World, st: Stmt): Promise<{ rows: number; read: number }> {
  const sqlite = (w.p as unknown as Twin).worker.sqlite;
  const rows = sqlite.prepare(st.sql).all(...(st.params as (string | number | null)[])).length;
  const meta = (await onLocalD1(sqlite, st)).meta;
  assert.ok(typeof meta.rows_read === 'number', `local D1 reports rows_read (meta: ${JSON.stringify(meta)}); without it the step fails`);
  return { rows, read: Number(meta.rows_read) };
}

const BASE_W73 = () => process.env.LMS_BASE_ROOT ?? join(fileURLToPath(new URL('../..', import.meta.url)), '.base-w73');

// ------------------------------------------------------------ AT-7.3 / 7.5 at W7-e ----

describe('W7 AT-7.3 and AT-7.5 at W7-e: cap and fold; reads', { concurrency: false }, () => {
  let w: Wave1World;
  let mona: Client;
  let others: string[];
  before(async () => {
    ({ w } = await wave7World());
    await withW7d(w);
    others = (await withW7e(w)).others;
    mona = await as(w, MONA, 'en');
  });
  after(() => closeWave6(w));
  const t = words('school', 'en');

  it('W7 AT-7.3 cap and fold at W7-e: 5 shown, 20 in the closed fold guardianQuizMore (20), guardianQuizCapped with 4; the 25 drawn are the first 25 of the expected list', async () => {
    const b = guardianQuizOf(await htmlOf(mona, linkedPath(w.school, w.ids[SALMA.username])));
    assert.ok(b && b.fold, 'the block and its fold');
    // Hand-written from W7-e: Salma sent the 29 others one second apart in creation order (the i-th titled "اختبار i+1 ب…",
    // 40 characters), all 1 of 1 in Mathematics; most recently sent first.
    const title = (i: number) => [...`اختبار ${i + 1} ${'ب'.repeat(40)}`].slice(0, 40).join('');
    const expected = Array.from({ length: 29 }, (_, k) => 28 - k).map((i) => `${title(i)} | ${t('guardianQuizLine', { subjectTitle: 'Mathematics', score: '1', total: '1' })}`);
    assert.equal(others.length, 29);
    assert.equal(b.shown.length, 5, '5 shown');
    assert.equal(b.fold.items.length, 20, '20 folded');
    assert.equal(b.fold.open, false, 'the fold is closed');
    assert.equal(b.fold.summary, t('guardianQuizMore', { n: '20' }));
    assert.equal(b.fold.capped, t('guardianQuizCapped', { n: '4' }));
    assert.deepEqual(drawnOf(b).map((i) => `${i.title} | ${i.line}`), expected.slice(0, 25), 'the first 25 of the expected list, in order');
  });

  it('W7 AT-7.5 reads at W7-e: exactly one score statement on the linked page (with or without listed quizzes), at most 25 rows, rows_read at most 2,000, no statement over 20 bound parameters; the page at most W7-2-main\'s + 14 KB; no score statement on the guardian home or the activity page', async (tc) => {
    const s = w.school;
    const path = linkedPath(s, w.ids[SALMA.username]);
    const m = await spied(w, mona, path);
    assert.equal(m.status, 200);
    const score = m.log.filter((x) => SCORE.test(x.sql));
    assert.equal(score.length, 1, 'exactly one score statement');
    assert.equal(score[0].sql, QUIZ_SCORES_OF_LINKED_SQL, 'the score statement');
    const f = await figuresOf(w, score[0]);
    const maxParams = Math.max(...m.log.map((x) => x.params.length));
    // W7-2-main's same page: this page with #quiz-guardian taken out (AT-8.4 proves the rest is W7-2-main's byte for byte).
    const bytes = Buffer.byteLength(m.body);
    const base = Buffer.byteLength(withoutElement(m.body, 'quiz-guardian'));
    tc.diagnostic(`AT-7.5 W7-e: ${m.log.length} statements on the linked page, score statement ${f.rows} rows, rows_read ${f.read}, largest bound-parameter count ${maxParams}, page ${bytes} B = W7-2-main's ${base} B + ${bytes - base} B; SQL: ${score[0].sql.replace(/\s+/g, ' ')}`);
    assert.ok(f.rows <= 25, `at most 25 rows (${f.rows})`);
    assert.ok(f.read <= 2000, `rows_read at most 2,000 (${f.read})`);
    assert.ok(maxParams <= 20, `no statement over 20 bound parameters (${maxParams})`);
    assert.ok(bytes - base <= 14 * 1024, `at most W7-2-main's + 14 KB (+${bytes - base} B)`);
    // With no listed quiz the statement still runs, once (G4.4's accepted cost).
    const shown = (await w.p.sql(`SELECT id FROM quiz WHERE space_id = '${s.id}' AND removed_at IS NULL`)).map((r) => String(r.id));
    await w.p.sql(`UPDATE quiz SET removed_at = ${AT.noon - 1} WHERE space_id = '${s.id}' AND removed_at IS NULL`);
    const none = await spied(w, mona, path);
    assert.equal(none.log.filter((x) => SCORE.test(x.sql)).length, 1, 'with no listed quiz: still exactly one score statement');
    assert.equal(guardianQuizOf(none.body), null, 'and no block');
    assert.equal(none.log.length, m.log.length, 'the same number of statements with and without listed quizzes');
    await w.p.sql(`UPDATE quiz SET removed_at = NULL WHERE id IN (${shown.map((id) => `'${id}'`).join(', ')})`);
    for (const p of [`/s/${s.id}/linked`, `${path}/activity`]) {
      const h = await spied(w, mona, p);
      assert.equal(h.log.filter((x) => SCORE.test(x.sql)).length, 0, `${p}: no score statement`);
    }
  });

  it('W7 AT-7.5 unit: subjectsForLearner\'s SQL text is byte-identical to W7-2-main\'s; the score statement holds the shared learner-rule fragment and never names questions_json', () => {
    const root = BASE_W73();
    const src = readFileSync(join(root, 'src', 'learning.ts'), 'utf8').replace(/\r\n/g, '\n');
    const m = /export function subjectsForLearner\([^)]*\)[^{]*\{\s*return db\.all<SubjectItem>\(\s*`([\s\S]*?)`/.exec(src);
    assert.ok(m, `W7-2-main's subjectsForLearner found in ${root}`);
    assert.equal(SUBJECTS_FOR_LEARNER_SQL, m[1], 'byte-identical SQL text');
    assert.ok(SUBJECTS_FOR_LEARNER_SQL.includes(LEARNER_RULE) && QUIZ_SCORES_OF_LINKED_SQL.includes(LEARNER_RULE), 'both hold the one shared fragment');
    assert.ok(!/questions_json|answers_json|right_flags/.test(QUIZ_SCORES_OF_LINKED_SQL), 'the score statement names no questions, answers or flags column');
  });
});

// ------------------------------------------------------------ AT-7.3 / 7.5 at W7-h ----

describe('W7 AT-7.3 and AT-7.5 at W7-h (500 attempts)', { concurrency: false }, () => {
  let w: Wave1World;
  let mona: Client;
  before(async () => {
    ({ w } = await wave7World());
    await withW7h(w);
    mona = await as(w, MONA, 'en');
  });
  after(() => closeWave6(w));
  const t = words('school', 'en');

  it('W7 AT-7.3 cap at W7-h: 25 drawn, the first 25 of the expected list, guardianQuizCapped with 475', async () => {
    const b = guardianQuizOf(await htmlOf(mona, linkedPath(w.school, w.ids[SALMA.username])));
    assert.ok(b && b.fold, 'the block and its fold');
    assert.equal(b.fold.capped, t('guardianQuizCapped', { n: '475' }));
    // Hand-written: quiz n (1..500) "Heavy quiz nnn" of "Heavy subject ss" (ss = ceil(n / 25)), sent n seconds in; newest first.
    const expected = Array.from({ length: 25 }, (_, k) => 500 - k).map((n) => `Heavy quiz ${String(n).padStart(3, '0')} | ${t('guardianQuizLine', { subjectTitle: `Heavy subject ${String(Math.ceil(n / 25)).padStart(2, '0')}`, score: '1', total: '1' })}`);
    assert.deepEqual(drawnOf(b).map((i) => `${i.title} | ${i.line}`), expected);
  });

  it('W7 AT-7.5 reads at W7-h: one score statement, at most 25 rows, rows_read at most 10,000, no statement over 20 bound parameters', async (tc) => {
    const m = await spied(w, mona, linkedPath(w.school, w.ids[SALMA.username]));
    const score = m.log.filter((x) => SCORE.test(x.sql));
    assert.equal(score.length, 1, 'exactly one score statement');
    const f = await figuresOf(w, score[0]);
    const maxParams = Math.max(...m.log.map((x) => x.params.length));
    tc.diagnostic(`AT-7.5 W7-h: ${m.log.length} statements, score statement ${f.rows} rows, rows_read ${f.read}, largest bound-parameter count ${maxParams}, page ${(Buffer.byteLength(m.body) / 1024).toFixed(1)} KB`);
    assert.ok(f.rows <= 25, `at most 25 rows (${f.rows})`);
    assert.ok(f.read <= 10_000, `rows_read at most 10,000 (${f.read})`);
    assert.ok(maxParams <= 20, `no statement over 20 bound parameters (${maxParams})`);
  });
});

// ------------------------------------------------------------ AT-7.4 ----

describe('W7 AT-7.4 no key, no detail (twin worlds differing only in rightId)', { concurrency: false }, () => {
  let w: Wave1World;
  let mona: Client;
  before(async () => {
    ({ w } = await wave7World());
    // The same stored attempt in both worlds, written directly by test/wave7/attempts.ts.
    await writeAttempt((q) => w.p.sql(q), { space: w.school.id, quiz: W7A.QA, learner: w.ids[SALMA.username], questions: QA_QUESTIONS, posted: { 'qa-one': 'qa-one-b', 'qa-two': 'qa-two-a' }, sentAt: AT.noon - 60_000 });
    mona = await as(w, MONA, 'en');
  });
  after(() => closeWave6(w));

  it('W7 AT-7.4 Mona\'s page for Salma is byte-identical when only QA\'s rightIds differ; no rightId, correct, answer_key or answer id in its markup; the score statement never names questions_json', async () => {
    const path = linkedPath(w.school, w.ids[SALMA.username]);
    const one = await htmlOf(mona, path);
    const read = () => w.p.sql(`SELECT answers_json, right_flags, score, question_count, sent_at FROM quiz_attempt WHERE quiz_id = '${W7A.QA}'`);
    const stored = await read();
    // World two: the same quiz ids and texts, every rightId moved to another answer; the attempt rows untouched.
    const moved = QA_QUESTIONS.map((q) => ({ ...q, rightId: q.answers.find((a) => a.id !== q.rightId)!.id }));
    assert.ok(moved.every((q, i) => q.rightId !== QA_QUESTIONS[i].rightId));
    await w.p.sql(`UPDATE quiz SET questions_json = '${JSON.stringify(moved).replace(/'/g, "''")}' WHERE id = '${W7A.QA}'`);
    assert.deepEqual(await read(), stored, 'the same stored attempts');
    const two = await htmlOf(mona, path);
    assert.ok(guardianQuizOf(one), 'the block is shown');
    assert.equal(two, one, 'byte-identical in the two worlds');
    const markup = [...nodesOf(domOf(one))].flatMap((n) => (n.kind === 'element' ? [n.tag, ...n.attrs.flat()] : n.kind === 'comment' ? [n.text] : []));
    const ids = QA_QUESTIONS.flatMap((q) => [q.id, ...q.answers.map((a) => a.id)]);
    for (const word of ['rightId', 'correct', 'answer_key', ...ids]) assert.ok(!markup.some((x) => x.includes(word)), `no ${word} in tag or attribute names, values or comments`);
    assert.ok(!ids.some((id) => one.includes(id)), 'no question or answer id anywhere on the page');
    assert.ok(!QUIZ_SCORES_OF_LINKED_SQL.includes('questions_json'));
  });
});

// ------------------------------------------------------------ AT-7.6 ----

describe('W7 AT-7.6 kits and languages', { concurrency: false }, () => {
  let w: Wave1World;
  before(async () => {
    const made = await wave7World();
    w = made.w;
    await withW6f(w, made.a);
    await withKitGuardians(w);
    await withW7g(w);
    // The University space's Mathematics gains QU, which Salma sends (1 of 1); the Company space has W7-g's QZ.
    await insertQuiz((q) => w.p.sql(q), { id: 'w7g-qu', space: w.university.id, subject: w.university.math, title: 'Epsilon quiz W7', questions: [fixed('qu-one', 'Pick one.', ['Yes', 'No'], 1)], state: 'open', created: AT.noon - 3_000_000 });
    await send(await as(w, SALMA, 'en'), w.university, 'w7g-qu', { 'qu-one': 'qu-one-a' });
  });
  after(() => closeWave6(w));

  it('W7 AT-7.6 Laila Test on Salma\'s page in the Company and University kits, Arabic and English: every new string is the ui.ts value with its placeholders filled', async (tc) => {
    for (const [space, title] of [[w.company, QZ_TITLE], [w.university, 'Epsilon quiz W7']] as const) {
      for (const lang of ['ar', 'en'] as const) {
        const tt = words(space.kit, lang);
        const doc = await htmlOf(await as(w, LAILA6, lang), linkedPath(space, w.ids[SALMA.username]));
        const b = guardianQuizOf(doc);
        assert.ok(b, `${space.kit} ${lang}: the block`);
        assert.equal(b.heading, tt('guardianQuizTitle', { name: SALMA.display_name }), `${space.kit} ${lang}: guardianQuizTitle`);
        assert.equal(b.note, tt('guardianQuizNote'), `${space.kit} ${lang}: guardianQuizNote`);
        assert.equal(b.note, UI[lang].guardianQuizNote, `${space.kit} ${lang}: the note is the ui.ts value`);
        assert.deepEqual(drawnOf(b).map((i) => `${i.title} | ${i.line}`), [`${title} | ${tt('guardianQuizLine', { subjectTitle: 'Mathematics', score: '1', total: '1' })}`], `${space.kit} ${lang}: guardianQuizLine`);
        assert.match(doc, new RegExp(`<html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}"`), `${space.kit} ${lang}: the page's language and direction`);
        tc.diagnostic(`AT-7.6 ${space.kit} ${lang}: ${b.heading} / ${drawnOf(b)[0].line}`);
      }
    }
  });
});

// ------------------------------------------------------------ AT-7.8 ----

/** QX8 of AT-7.8: 120 characters with <script>, <b>, &amp;, &, a quote, another learner's name and a question text of QA. */
export const QX8_TITLE = (() => {
  const t = `<script>alert(1)</script> <b>bold</b> &amp; & "quoted" Omar C ${QA_QUESTIONS[0].text} `;
  return [...t.padEnd(120, 'x')].slice(0, 120).join('');
})();

describe('W7 AT-7.8 hostile quiz title', { concurrency: false }, () => {
  let w: Wave1World;
  before(async () => {
    ({ w } = await wave7World());
    await withW7g(w);
    await insertQuiz((q) => w.p.sql(q), { id: 'w7g-qx8', space: w.school.id, subject: w.school.math, title: QX8_TITLE, questions: [fixed('qx8-one', 'Pick one.', ['Yes', 'No'], 1)], state: 'open', created: AT.noon - 2_000_000 });
    await send(await as(w, SALMA, 'en'), w.school, 'w7g-qx8', { 'qx8-one': 'qx8-one-a' });
  });
  after(() => closeWave6(w));

  it('W7 AT-7.8 on Mona\'s page for Salma the <bdi> text equals the raw title; no script or b element in the block; the allow-list passes; at 390 px nothing scrolls sideways', async () => {
    assert.equal([...QX8_TITLE].length, 120);
    const t = words('school', 'en');
    const page = await htmlOf(await as(w, MONA, 'en'), linkedPath(w.school, w.ids[SALMA.username]));
    const block = byId(domOf(page), 'quiz-guardian');
    assert.ok(block, 'the block');
    const bdis = [...nodesOf(block)].filter((n): n is DomElement => n.kind === 'element' && n.tag === 'bdi');
    assert.ok(bdis.some((b) => b.children.length === 1 && b.children[0].kind === 'text' && b.children[0].text === QX8_TITLE), 'one <bdi> text node equals the raw title exactly');
    assert.ok(![...nodesOf(block)].some((n) => n.kind === 'element' && ['script', 'b'].includes(n.tag)), 'no script or b element in the block');
    assert.deepEqual(quizAllowListProblems(block, guardianAllowed('en', SALMA.display_name, [[QX8_TITLE, 'Mathematics', 1, 1], [TITLES.QA, 'Mathematics', 1, 3]])), [], 'the allow-list');
    const browser = await chromium.launch();
    try {
      for (const lang of ['ar', 'en'] as const) {
        const tab = await browserAs(browser, w, MONA, { width: 'phone', lang });
        await go(tab.page, w, linkedPath(w.school, w.ids[SALMA.username]));
        const wide = await tab.page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
        assert.ok(wide.sw <= wide.cw, `${lang}: at 390 px scrollWidth <= clientWidth (${wide.sw} / ${wide.cw})`);
        await tab.ctx.close();
      }
    } finally {
      await browser.close();
    }
    void t;
  });
});

// ------------------------------------------------------------ AT-7.9 ----

/** Release 2's AT-15a check of a guardian's learner page while activity is off (test/at15/at15a.test.ts, its third case), unchanged. */
function at15aProblems(html: string, lessonTitles: string[]): string[] {
  const out: string[] = [];
  const text = visible(html);
  if (!/<p id="activity-off"[^>]*>/.test(html)) out.push('no activity-off line');
  for (const word of [...lessonTitles, 'Last opened', 'No open recorded', 'Recording since', 'آخر فتح', 'التسجيل منذ']) if (text.includes(word)) out.push(`about lessons: ${word}`);
  if (html.includes('class="activity-link"')) out.push('a way to an activity page');
  return out;
}

describe('W7 AT-7.9 activity off stays true', { concurrency: false }, () => {
  let w: Wave1World;
  let g: W7g;
  before(async () => {
    ({ w } = await wave7World({ activity: false }));
    g = await withW7g(w);
  });
  after(() => closeWave6(w));

  it('W7 AT-7.9 with activity off: AT-15a unchanged on the whole page in W7-g; in the collision world the lesson title is only the item\'s <bdi> in the block, with no date and no activity word, and AT-15a passes with the block removed; the setting\'s texts are W7-2-main\'s and hold no quiz word', async () => {
    const s = w.school;
    const lessons = (await w.p.sql(`SELECT title FROM lesson`)).map((r) => String(r.title));
    const quizTitles = (await w.p.sql(`SELECT title FROM quiz`)).map((r) => String(r.title));
    assert.deepEqual(quizTitles.filter((q) => lessons.includes(q)), [], 'W7-a\'s and W7-g\'s quiz titles all differ from every lesson title');
    for (const lang of ['ar', 'en'] as const) {
      const page = await htmlOf(await as(w, MONA, lang), linkedPath(s, g.salma));
      assert.ok(guardianQuizOf(page), `${lang}: the block shows while activity is off`);
      assert.deepEqual(at15aProblems(page, lessons), [], `${lang}: AT-15a on the whole page`);
    }
    // The collision world: a quiz titled exactly like a lesson of Mathematics, taken by Salma.
    const lesson = s.lessons['Adding fractions'] ? 'Adding fractions' : Object.keys(s.lessons)[0];
    await insertQuiz((q) => w.p.sql(q), { id: 'w7g-qcol', space: s.id, subject: s.math, title: lesson, questions: [fixed('qcol-one', 'Pick one.', ['Yes', 'No'], 1)], state: 'open', created: AT.noon - 2_500_000 });
    await send(await as(w, SALMA, 'en'), s, 'w7g-qcol', { 'qcol-one': 'qcol-one-a' });
    for (const lang of ['ar', 'en'] as const) {
      const page = await htmlOf(await as(w, MONA, lang), linkedPath(s, g.salma));
      const tree = domOf(page);
      const block = byId(tree, 'quiz-guardian');
      assert.ok(block, `${lang}: the block`);
      const holders = [...nodesOf(tree)].filter((n): n is DomElement => n.kind === 'element' && n.children.some((c) => c.kind === 'text' && c.text.includes(lesson)));
      assert.equal(holders.length, 1, `${lang}: the lesson title appears once`);
      assert.equal(holders[0].tag, 'bdi', `${lang}: as a <bdi>`);
      assert.ok([...nodesOf(block)].includes(holders[0]), `${lang}: inside #quiz-guardian`);
      assert.ok(!/\d{4}-\d{2}-\d{2}/.test(textIn(block)), `${lang}: no date in the block`);
      for (const word of ['Last opened', 'No open recorded', 'Recording since', 'آخر فتح', 'التسجيل منذ', UI[lang].lessonActivity]) assert.ok(!textIn(block).includes(word), `${lang}: no activity word in the block (${word})`);
      assert.deepEqual(at15aProblems(withoutElement(page, 'quiz-guardian'), lessons), [], `${lang}: AT-15a with #quiz-guardian removed`);
    }
    // The setting's texts: W7-2-main's values in both languages (the kits fill the same values), with no quiz word.
    const base = (await import(pathToFileURL(join(BASE_W73(), 'src', 'i18n', 'ui.ts')).href)) as { UI: typeof UI };
    const fill = { name: 'X', lesson: 'L', lessons: 'Ls', learner: 'P', guardian: 'G', child: 'C', publisher: 'U', admin: 'A', yourGuardian: 'Y', lessonActivity: 'LA' };
    for (const lang of ['ar', 'en'] as const) {
      for (const k of ['activityWhat', 'activityWho', 'activityNotice', 'activityOff', 'activityExplain', 'activityDetail'] as const) {
        assert.equal(UI[lang][k], base.UI[lang][k], `${lang} ${k}: W7-2-main's value`);
        for (const kit of ['school', 'company', 'university'] as const) {
          const v = words(kit, lang)(k, fill);
          for (const qw of ['quiz', 'Quiz', 'score', 'اختبار', 'درجة']) assert.ok(!v.includes(qw), `${kit} ${lang} ${k}: no quiz word (${qw})`);
        }
      }
    }
  });
});
