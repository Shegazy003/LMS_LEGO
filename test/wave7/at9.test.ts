// LMS wave 7, W7-3 Part B (product-contract v4 amendment on PIL-295, AT-9 as
// replaced by R6): every active admin sees every learner's score on one scores
// page per quiz under the admin address; no admin results address returns a
// question, an answer, a chosen or right answer, a verdict or a per-question
// count. Each labelled expectation is its own CI step (`W7 AT-9.n …`, job
// wave-7). Made-up data only.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Client, utcDatePlusDays } from '../support/http.ts';
import { seed, signedIn } from '../support/seed.ts';
import { inProcess, type Product } from '../support/product.ts';
import type { InProcessWorker } from '../support/in-process.ts';
import { UI } from '../../src/i18n/ui.ts';
import type { QuizQuestion } from '../../src/quiz.ts';
import { onLocalD1 } from '../wave6/todo.ts';
import { attrOf, domOf, elementById, nodesOf, textIn, withW7g, withW7h, type DomElement, type W7g } from './guardian.ts';
import { htmlOf, sectionOf } from './learner.ts';
import {
  ADMIN, AT, HADEER, LAILA7, MONA, OMAR, RANA5, SALMA, SHIMAA, TITLES, W7A, adminQuizzes, as, clockAt, closeWave6, insertQuiz, pinnable, publisherQuizzes, quizRowsOf, resultsOf, subjectPath,
  wave7World, withW7d, withW7e, words, type Wave1World,
} from './world.ts';

/** AT-9.1's compared region: the outer HTML of h1#quiz-results-title, then of div.quiz-page. */
function regionOf(page: string): string {
  const h1 = elementById(page, 'quiz-results-title');
  const div = /<div class="quiz-page">/.exec(page);
  assert.ok(h1 && div, 'the title and the page body are there');
  const start = div.index;
  let depth = 0;
  const re = /<div\b|<\/div>/g;
  re.lastIndex = start;
  for (let m = re.exec(page); m; m = re.exec(page)) {
    depth += m[0] === '</div>' ? -1 : 1;
    if (depth === 0) return h1.html + page.slice(start, m.index + m[0].length);
  }
  throw new Error('div.quiz-page is not closed');
}

/** Hadeer's region normalised as AT-9.1 says, and only so: the summary removed, the name links replaced by their <bdi>, the pager's prefix. */
function normalised(region: string, publisherList: string, adminList: string, count: number): string {
  let out = region;
  const stats = [elementById(out, 'quiz-stats-title'), elementById(out, 'quiz-stats')];
  if (count > 0) assert.ok(stats[0] && stats[1], 'exactly one summary title and list when the count is above 0');
  for (const id of ['quiz-stats-title', 'quiz-stats']) {
    const e = elementById(out, id);
    if (e) out = out.slice(0, e.at) + out.slice(e.at + e.html.length);
    assert.equal(elementById(out, id), null, `one ${id} only`);
  }
  const links = [...out.matchAll(/<a class="quiz-name" href="[^"]+">([\s\S]*?)<\/a>/g)];
  const rows = [...out.matchAll(/<tr><td/g)].length;
  assert.equal(links.length, rows, 'one name link per table row');
  for (const l of links) assert.ok(/^<bdi>[^<]*<\/bdi>$/.test(l[1]), 'each name link has exactly one child, the <bdi> name');
  out = out.replace(/<a class="quiz-name" href="[^"]+">(<bdi>[^<]*<\/bdi>)<\/a>/g, '$1');
  out = out.replace(/(<nav class="quiz-pager"[\s\S]*?<\/nav>)/g, (nav) => nav.split(`href="${publisherList}/`).join(`href="${adminList}/`));
  return out;
}

describe('W7 AT-9 admin scores page (W7-g)', { concurrency: false }, () => {
  let w: Wave1World;
  let g: W7g;
  let amal: Client;
  let hadeer: Client;
  before(async () => {
    ({ w } = await wave7World());
    g = await withW7g(w);
    amal = await as(w, ADMIN, 'en');
    hadeer = await as(w, HADEER, 'en');
  });
  after(() => closeWave6(w));

  it('W7 AT-9.1 results link and scores page: quizResultsLink (4) on QA; the region equals Hadeer\'s after the three normalisations; the note right after the title; the back link to the quiz list; QB shows quizResultsNone and the note', async () => {
    const s = w.school;
    // Arabic first, English last: a person's language is stored on the person, and the later steps read English.
    for (const lang of ['ar', 'en'] as const) {
      const t = words('school', lang);
      const a = await as(w, ADMIN, lang);
      const h = await as(w, HADEER, lang);
      const list = adminQuizzes(s, s.math);
      const pub = publisherQuizzes(s, s.math);
      const rows = quizRowsOf(await htmlOf(a, list));
      const qa = rows.find((r) => r.id === W7A.QA);
      assert.ok(qa?.results, `${lang}: QA's row has the results link`);
      assert.equal(qa.results.href, resultsOf(list, W7A.QA), `${lang}: it leads to the admin scores page`);
      assert.equal(qa.results.text, t('quizResultsLink', { n: '4' }), `${lang}: quizResultsLink (4)`);
      const mine = await htmlOf(a, resultsOf(list, W7A.QA));
      const theirs = await htmlOf(h, resultsOf(pub, W7A.QA));
      assert.equal(regionOf(mine), normalised(regionOf(theirs), pub, list, 4), `${lang}: the compared region equals Hadeer's, normalised`);
      // Outside the region: the note, right after the title, and nothing else before the page body.
      const h1 = elementById(mine, 'quiz-results-title')!;
      const notes = [...mine.matchAll(/<p id="quiz-admin-note"/g)];
      assert.equal(notes.length, 1, `${lang}: exactly one note`);
      const between = mine.slice(h1.at + h1.html.length, mine.indexOf('<div class="quiz-page">'));
      assert.equal(between.trim(), `<p id="quiz-admin-note" class="muted">${t('quizAdminScoresNote')}</p>`, `${lang}: the note, and nothing else, between the title and the page body`);
      assert.ok(mine.includes(`<a id="quiz-back" href="${list}">`), `${lang}: the back link leads to Amal's quiz list`);
      const none = await htmlOf(a, resultsOf(list, W7A.QB));
      assert.ok(none.includes(`<p id="quiz-results-none" class="quiz-help">${t('quizResultsNone')}</p>`) && !none.includes('<table'), `${lang}: QB shows quizResultsNone, with no table`);
      assert.ok(none.includes('id="quiz-admin-note"'), `${lang}: QB shows the note`);
      assert.ok(!mine.includes(TITLES.QB), `${lang}: QA's page names QA only`);
    }
  });

  it('W7 AT-9.2 a subject with no responsible publisher: Amal sees its scores page, no publisher address shows it; with Mathematics unpublished and QA closed Amal\'s page still equals Hadeer\'s', async () => {
    const s = w.school;
    const t = words('school', 'en');
    // A made-up subject without a responsible publisher, published, Salma assigned, one quiz with her attempt (sent on its take page).
    await w.p.sql(`INSERT INTO subject (id, space_id, title, is_published) VALUES ('w7g-nopub', '${s.id}', 'Orphan Test', 1)`);
    await w.p.sql(`INSERT INTO subject_access (id, space_id, subject_id, user_id) VALUES ('w7g-nopub-salma', '${s.id}', 'w7g-nopub', '${g.salma}')`);
    await insertQuiz((q) => w.p.sql(q), { id: 'w7g-qo', space: s.id, subject: 'w7g-nopub', title: 'Orphan quiz', questions: [{ id: 'qo-one', text: 'Pick one.', answers: [{ id: 'qo-one-a', text: 'Yes' }, { id: 'qo-one-b', text: 'No' }], rightId: 'qo-one-a' }], state: 'open', created: AT.noon - 2_000_000 });
    const { send } = await import('./guardian.ts');
    await send(await as(w, SALMA, 'en'), s, 'w7g-qo', { 'qo-one': 'qo-one-a' });
    const list = adminQuizzes(s, 'w7g-nopub');
    const rows = adminRowsOf(await htmlOf(amal, resultsOf(list, 'w7g-qo')));
    assert.deepEqual(rows.map((r) => [r.name, r.score, r.link]), [[SALMA.display_name, t('quizScoreCell', { score: '1', total: '1' }), false]], 'Amal sees Salma\'s score');
    for (const c of [hadeer, await as(w, SHIMAA, 'en')]) {
      for (const path of [resultsOf(publisherQuizzes(s, 'w7g-nopub'), 'w7g-qo'), `${resultsOf(publisherQuizzes(s, 'w7g-nopub'), 'w7g-qo')}/${g.salma}`]) assert.equal((await c.get(path)).status, 403, `no publisher address shows it: ${path}`);
    }
    // Mathematics unpublished and QA closed.
    await w.p.sql(`UPDATE subject SET is_published = 0 WHERE id = '${s.math}'`);
    await w.p.sql(`UPDATE quiz SET state = 'closed' WHERE id = '${W7A.QA}'`);
    try {
      const pub = publisherQuizzes(s, s.math);
      const adm = adminQuizzes(s, s.math);
      assert.equal(regionOf(await htmlOf(amal, resultsOf(adm, W7A.QA))), normalised(regionOf(await htmlOf(hadeer, resultsOf(pub, W7A.QA))), pub, adm, 4), 'the region equals Hadeer\'s, normalised');
    } finally {
      await w.p.sql(`UPDATE subject SET is_published = 1 WHERE id = '${s.math}'`);
      await w.p.sql(`UPDATE quiz SET state = 'open' WHERE id = '${W7A.QA}'`);
    }
  });

  it('W7 AT-9.3 refused, nothing changed: Hadeer gets the admin gate\'s answer; learners, guardians and the owner 403; an ended admin today\'s answer; 404 for removed, other-subject, other-space and made-up quizzes and a page past the end; the admin answers address is the 403 page for Amal and Rana Test, with no attempt read; Amal 403 on the publisher addresses', async () => {
    const s = w.school;
    const adm = adminQuizzes(s, s.math);
    const pub = publisherQuizzes(s, s.math);
    const scores = resultsOf(adm, W7A.QA);
    // Hadeer (publisher, not admin): exactly the admin gate's answer on an existing admin address.
    const gate = await hadeer.get(adm);
    const gateBody = await gate.text();
    const h = await hadeer.get(scores);
    assert.deepEqual([h.status, await h.text()], [gate.status, gateBody], 'Hadeer: the admin gate\'s answer, byte for byte');
    assert.equal(gate.status, 403);
    for (const [who, c] of [['Salma', await as(w, SALMA, 'en')], ['Omar C', await as(w, OMAR, 'en')], ['Mona', await as(w, MONA, 'en')], ['the owner', w.owner]] as const) {
      assert.equal((await c.get(scores)).status, 403, `${who}: 403`);
    }
    // 404s.
    const company = String((await w.p.sql(`SELECT id FROM quiz WHERE space_id = '${w.company.id}' LIMIT 1`))[0].id);
    for (const [what, path] of [['removed QD', resultsOf(adm, W7A.QD)], ['QG of another subject', resultsOf(adm, W7A.QG)], ['a quiz of another space', resultsOf(adm, company)], ['a made-up id', resultsOf(adm, 'no-such-quiz')], ['a page past the end', `${scores}?page=2`], ['page 0', `${scores}?page=0`]] as const) {
      assert.equal((await amal.get(path)).status, 404, `${what}: 404`);
    }
    // The admin answers address: the same 403 page as the publisher answers address gives Amal (W7-2-main's 403 noAccess;
    // the base comparison AT-8.4 compares it with W7-2-main byte for byte), and no statement reads an attempt.
    const refusal = await (await amal.get(`${resultsOf(pub, W7A.QA)}/${g.salma}`)).text();
    const rana = await as(w, RANA5, 'en');
    const youssef = String((await w.p.sql("SELECT id FROM user WHERE username = 'youssef.w1'"))[0].id);
    for (const [who, c] of [['Amal', amal], ['Rana Test', rana]] as const) {
      const theirs = await (await c.get(`${resultsOf(pub, W7A.QA)}/${g.salma}`)).text();
      for (const id of [g.salma, g.rana, youssef, 'made-up-id']) {
        const m = await spiedGet(w, c, `${scores}/${id}`);
        assert.equal(m.status, 403, `${who} ${id}: 403`);
        assert.equal(m.body, theirs, `${who} ${id}: the 403 noAccess page, byte for byte`);
        assert.deepEqual(m.log.filter((x) => /quiz_attempt|answers_json/.test(x.sql)).map((x) => x.sql), [], `${who} ${id}: no statement names quiz_attempt or answers_json`);
      }
    }
    void refusal;
    // Amal on the publisher addresses (v2 AT-2.3a): 403.
    for (const path of [resultsOf(pub, W7A.QA), `${resultsOf(pub, W7A.QA)}/${g.salma}`]) assert.equal((await amal.get(path)).status, 403, `Amal ${path}`);
    // An admin whose access ended: the same answer as on another admin address.
    const ranaA = await as(w, RANA5, 'en');
    const ranaB = await signedIn(w.p.url, RANA5.username, RANA5.password);
    await w.p.sql(`UPDATE membership SET ended_on = '2026-12-10' WHERE user_id = '${g.rana}' AND space_id = '${s.id}' AND role = 'admin'`);
    try {
      const a = await ranaA.get(adm);
      const b = await ranaB.get(scores);
      assert.deepEqual([b.status, await b.text()], [a.status, await a.text()], 'an ended admin: today\'s answer, as on the admin quiz list');
      assert.notEqual(b.status, 200);
    } finally {
      await w.p.sql(`UPDATE membership SET ended_on = NULL WHERE user_id = '${g.rana}' AND space_id = '${s.id}' AND role = 'admin'`);
    }
  });

  it('W7 AT-9.4 access and removal on the scores page: Omar C\'s ended access leaves it until restored; Salma unassigned stays; QA removed 404, restored unchanged', async () => {
    const s = w.school;
    const t = words('school', 'en');
    const scores = resultsOf(adminQuizzes(s, s.math), W7A.QA);
    const full = await htmlOf(amal, scores);
    const names = (p: string) => adminRowsOf(p).map((r) => r.name);
    assert.ok(names(full).includes(OMAR.display_name));
    await w.p.sql(`UPDATE membership SET ended_on = '2026-12-10' WHERE user_id = '${g.omar}' AND space_id = '${s.id}'`);
    const ended = await htmlOf(amal, scores);
    const caption = (p: string) => (/<caption>([\s\S]*?)<\/caption>/.exec(p)?.[1] ?? '').replace(/<[^>]*>/g, '').trim();
    assert.deepEqual([names(ended).includes(OMAR.display_name), caption(ended)], [false, t('quizResultsCount', { n: '3' })], 'Omar C leaves the page and the count');
    assert.equal(quizRowsOf(await htmlOf(amal, adminQuizzes(s, s.math))).find((r) => r.id === W7A.QA)!.results!.text, t('quizResultsLink', { n: '3' }), 'the list count follows');
    await w.p.sql(`UPDATE membership SET ended_on = NULL WHERE user_id = '${g.omar}' AND space_id = '${s.id}'`);
    assert.equal(await htmlOf(amal, scores), full, 'restored access brings him back');
    const kept = await w.p.sql(`SELECT * FROM group_member WHERE user_id = '${g.salma}' AND space_id = '${s.id}'`);
    await w.p.sql(`DELETE FROM group_member WHERE user_id = '${g.salma}' AND space_id = '${s.id}'`);
    assert.equal(await htmlOf(amal, scores), full, 'Salma unassigned: her row stays');
    for (const r of kept) await w.p.sql(`INSERT INTO group_member (space_id, group_id, user_id) VALUES ('${r.space_id}', '${r.group_id}', '${r.user_id}')`);
    assert.equal((await hadeer.post(`${publisherQuizzes(s, s.math)}/${W7A.QA}/remove`, { rev: '0' })).status, 303);
    assert.equal((await amal.get(scores)).status, 404, 'removed: 404');
    assert.equal((await hadeer.post(`${publisherQuizzes(s, s.math)}/${W7A.QA}/restore`, { rev: '0' })).status, 303);
    assert.equal(await htmlOf(amal, scores), full, 'restored: unchanged');
  });

  it('W7 AT-9.6 still private on the editor: the admin\'s and the publisher\'s editors of QA show no learner name, score or count', async () => {
    const s = w.school;
    const t = words('school', 'en');
    for (const [who, c, list] of [['Amal', amal, adminQuizzes(s, s.math)], ['Hadeer', hadeer, publisherQuizzes(s, s.math)]] as const) {
      const page = await htmlOf(c, `${list}/${W7A.QA}`);
      for (const name of [SALMA.display_name, OMAR.display_name, 'Hala Test', RANA5.display_name]) assert.ok(!page.includes(name), `${who}'s editor: no ${name}`);
      for (const n of ['1', '2', '3']) assert.ok(!page.includes(t('quizScoreCell', { score: n, total: '3' })), `${who}'s editor: no score ${n} of 3`);
      assert.ok(!page.includes(t('quizResultsLink', { n: '4' })) && !page.includes(t('quizResultsCount', { n: '4' })), `${who}'s editor: no count`);
    }
  });

  it('W7 AT-9.7 admin who is also a learner: Rana Test\'s own Mathematics page shows her QA score; on the admin scores page her own row like any learner\'s, without a link', async () => {
    const s = w.school;
    const t = words('school', 'en');
    const rana = await as(w, RANA5, 'en');
    const own = sectionOf(await htmlOf(rana, subjectPath(s, s.math)));
    const row = own?.items.find((i) => i.title === TITLES.QA);
    assert.ok(row && row.meta.includes(t('quizScoreCell', { score: '2', total: '3' })), 'her own page: 2 of 3 (byte parity with W7-2-main\'s same page: AT-8.4)');
    const mine = adminRowsOf(await htmlOf(rana, resultsOf(adminQuizzes(s, s.math), W7A.QA)));
    const r = mine.find((x) => x.name === RANA5.display_name);
    assert.ok(r && r.score === t('quizScoreCell', { score: '2', total: '3' }) && !r.link && r.date === '2026-12-10', 'her own row: name, score, date, no link');
  });
});

// ------------------------------------------------------------ helpers ----

type Twin = Product & { worker: InProcessWorker };
type Stmt = { sql: string; params: unknown[] };

/** The admin scores page's rows: name, second id, score, date, and whether the name is a link. */
function adminRowsOf(page: string) {
  const strip = (s: string) => s.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  return [...page.matchAll(/<tr><td data-label="[^"]+">(<a [^>]*>)?<bdi>([\s\S]*?)<\/bdi>(?:<\/a>)? <span class="muted second-id">([\s\S]*?)<\/span><\/td>\s*<td data-label="[^"]+">([\s\S]*?)<\/td><td data-label="[^"]+">([\s\S]*?)<\/td><\/tr>/g)]
    .map((m) => ({ link: Boolean(m[1]), name: strip(m[2]), tail: strip(m[3]), score: strip(m[4]), date: strip(m[5]) }));
}

async function spiedGet(w: { p: unknown }, c: Client, path: string): Promise<{ status: number; body: string; headers: Headers; log: Stmt[] }> {
  const worker = (w.p as Twin).worker;
  assert.ok(worker, 'the in-process product (statement spy)');
  const log: Stmt[] = [];
  worker.setHooks({ seen: (sql, params) => void log.push({ sql, params }) });
  try {
    const res = await c.get(path);
    const body = Buffer.from(await res.arrayBuffer()).toString('utf8');
    await worker.settle();
    return { status: res.status, body, headers: res.headers, log };
  } finally {
    worker.setHooks({});
  }
}

/** G5.2's fixed allowlist of result columns (statements naming quiz or quiz_attempt), one line of meaning each. */
export const RESULT_COLUMNS: Record<string, string> = {
  id: 'an id: the quiz\'s on the list and the header read, the learner\'s on a scores row',
  title: 'the quiz\'s title',
  state: 'the quiz\'s state (draft, open, closed)',
  removed_at: 'the quiz\'s removed time',
  questions: 'the question count, json_array_length(quiz.questions_json)',
  attempts: 'a count: listed attempts of the quiz',
  n: 'a count: listed attempts of the quiz',
  display_name: 'a person\'s display name',
  username: 'a person\'s username (the second-id tail)',
  same_name: 'the usernames of people listed with the same display name (the second-id rule)',
  score: 'the attempt\'s stored score',
  question_count: 'the attempt\'s stored number of questions',
  sent_at: 'the attempt\'s sent time',
};

/** G5.2's four rules for one statement; the problems found (empty when it holds). */
function leakRules(sqlite: DatabaseSync, st: Stmt): string[] {
  const out: string[] = [];
  const sql = st.sql;
  if (/answers_json|right_flags/.test(sql)) out.push('names answers_json or right_flags');
  const named = (sql.match(/questions_json/g) ?? []).length;
  const counted = (sql.match(/json_array_length\(quiz\.questions_json\)/g) ?? []).length;
  if (named !== counted) out.push('names questions_json outside json_array_length(');
  if (/\b(FROM|JOIN)\s+(quiz|quiz_attempt)\b/i.test(sql)) {
    if (sql.replace(/count\(\*\)/gi, '').includes('*')) out.push('a * other than count(*)');
    if (/json_extract|json_each|json_tree|->/i.test(sql)) out.push('a JSON function or operator');
    const stmt = sqlite.prepare(sql);
    const cols = (stmt as unknown as { columns(): { name: string }[] }).columns().map((c) => c.name);
    for (const c of cols) if (!RESULT_COLUMNS[c]) out.push(`result column ${c} is not on the allowlist`);
  }
  return out.map((p) => `${p}: ${sql.replace(/\s+/g, ' ').slice(0, 160)}`);
}

// ------------------------------------------------------------ AT-9.5 ----

describe('W7 AT-9.5 reads at W7-e and W7-h (admin scores page and quiz list)', { concurrency: false }, () => {
  let w: Wave1World;
  before(async () => {
    ({ w } = await wave7World());
    await withW7d(w);
    await withW7e(w);
  });
  after(() => closeWave6(w));

  it('W7 AT-9.5 at W7-e QL\'s admin scores page at most 10 statements, 50 names, 5,000 rows read, 80 KB; the admin quiz list at most 10 statements, 40 quiz rows, 5,000 rows read at W7-e and at W7-h\'s H1; every statement follows G5.2\'s four rules; quizSummary does not run', async (t) => {
    const s = w.school;
    const amal = await as(w, ADMIN, 'en');
    const sqlite = (w.p as unknown as Twin).worker.sqlite;
    const rowsRead = async (log: Stmt[]) => {
      let n = 0;
      for (const st of log.filter((x) => /^\s*(SELECT|WITH)\b/i.test(x.sql))) {
        const meta = (await onLocalD1(sqlite, st)).meta;
        assert.ok(typeof meta.rows_read === 'number', `local D1 reports rows_read (meta: ${JSON.stringify(meta)}); without it the step fails`);
        n += Number(meta.rows_read);
      }
      return n;
    };
    const figures: string[] = [];
    const scores = await spiedGet(w, amal, resultsOf(adminQuizzes(s, s.math), 'w7d-ql'));
    assert.equal(scores.status, 200);
    const names = scores.log.find((x) => /^\s*WITH r AS/.test(x.sql))!;
    const nameRows = sqlite.prepare(names.sql).all(...(names.params as (string | number | null)[])).length;
    const read = await rowsRead(scores.log);
    const bytes = Buffer.byteLength(scores.body);
    figures.push(`QL admin scores page: ${scores.log.length} statements, names ${nameRows} rows, rows_read ${read}, ${(bytes / 1024).toFixed(1)} KB`);
    assert.ok(scores.log.length <= 10, `at most 10 statements (${scores.log.length})`);
    assert.ok(nameRows <= 50, `at most 50 names (${nameRows})`);
    assert.ok(read <= 5000, `rows_read at most 5,000 (${read})`);
    assert.ok(bytes <= 80 * 1024, `at most 80 KB (${bytes})`);
    assert.ok(!scores.log.some((x) => /TOTAL\(substr\(a\.right_flags/.test(x.sql)), 'quizSummary does not run');
    const problems = scores.log.flatMap((x) => leakRules(sqlite, x));
    for (const [what, subject] of [['W7-e Mathematics', s.math], ['W7-h H1', 'w7h-s01']] as const) {
      // W7-h (H1: 25 quizzes, 500 attempts) is added after the W7-e figures are taken.
      if (subject !== s.math) await withW7h(w);
      const list = await spiedGet(w, amal, adminQuizzes(s, subject));
      assert.equal(list.status, 200, what);
      const quizSt = list.log.filter((x) => /\bFROM quiz\b/.test(x.sql));
      const quizRows = quizSt.reduce((n, st) => n + sqlite.prepare(st.sql).all(...(st.params as (string | number | null)[])).length, 0);
      const r = await rowsRead(list.log);
      figures.push(`${what} admin quiz list: ${list.log.length} statements, quiz statements ${quizSt.length} returning ${quizRows} rows, rows_read ${r}`);
      assert.ok(list.log.length <= 10, `${what}: at most 10 statements (${list.log.length})`);
      assert.ok(quizRows <= 40, `${what}: at most 40 quiz rows (${quizRows})`);
      assert.ok(r <= 5000, `${what}: rows_read at most 5,000 (${r})`);
      problems.push(...list.log.flatMap((x) => leakRules(sqlite, x)));
    }
    t.diagnostic(`AT-9.5 figures: ${figures.join('; ')}`);
    t.diagnostic(`AT-9.5 result-column allowlist: ${Object.entries(RESULT_COLUMNS).map(([k, v]) => `${k} (${v})`).join('; ')}`);
    assert.deepEqual(problems, [], 'every statement follows G5.2\'s four rules');
  });
});

// ------------------------------------------------------------ AT-9.8 ----
// W7-k1 and W7-k2: one world built once (W7-a plus the Kappa subject), copied byte for byte into a second product (same rows,
// ids and sessions), then every row below the score rewritten in each: question and answer ids and texts, answer counts and
// order, rightId, answers_json and right_flags. Scores, totals, sent times, people and quiz ids, titles and states stay equal.

const KAPPA = 'w7k-kappa';
const K_QUIZZES = [{ id: 'w7k-q1', title: 'Kappa one', state: 'open', n: 3, attempters: 56 }, { id: 'w7k-q2', title: 'Kappa two', state: 'open', n: 2, attempters: 5 }, { id: 'w7k-q3', title: 'Kappa three', state: 'closed', n: 4, attempters: 3 }] as const;
const mark = (world: 1 | 2, what: string) => `w7k${world}-${what}-marker-${'z'.repeat(Math.max(0, 24 - what.length))}`;

/** One world's questions for a quiz: different ids, texts, answer counts and order per world. */
function kQuestions(world: 1 | 2, quiz: string, n: number): QuizQuestion[] {
  return Array.from({ length: n }, (_, i) => {
    const qi = world === 1 ? i : n - 1 - i;
    const answers = Array.from({ length: world === 1 ? 2 + (i % 2) : 4 - (i % 2) }, (_, j) => ({ id: mark(world, `${quiz}-q${qi}-a${j}`), text: mark(world, `${quiz}-q${qi}-text-a${j}`) }));
    return { id: mark(world, `${quiz}-q${qi}`), text: mark(world, `${quiz}-q${qi}-text`), answers, rightId: answers[world === 1 ? 0 : answers.length - 1].id };
  });
}

/** An attempt's below-the-score row in one world: a chosen id on every answered question, flags whose sum is never the score. */
function kBelow(world: 1 | 2, questions: QuizQuestion[], score: number, k: number): { answers_json: string; right_flags: string } {
  const n = questions.length;
  let sum1 = 0;
  while (sum1 === score || n - sum1 === score) sum1++;
  const flags1 = Array.from({ length: n }, (_, i) => (i < sum1 ? '1' : '0')).join('');
  const flags = world === 1 ? flags1 : [...flags1].map((f) => (f === '1' ? '0' : '1')).join('');
  const answers: Record<string, string> = {};
  questions.forEach((q, i) => {
    if ((i + k) % 4 !== 3) answers[q.id] = q.answers[(i + k + world) % q.answers.length].id;
  });
  return { answers_json: JSON.stringify(answers), right_flags: flags };
}

async function rewriteBelowScore(sql: (q: string) => Promise<Record<string, unknown>[]>, world: 1 | 2): Promise<void> {
  for (const q of K_QUIZZES) {
    const questions = kQuestions(world, q.id, q.n);
    await sql(`UPDATE quiz SET questions_json = '${JSON.stringify(questions).replace(/'/g, "''")}' WHERE id = '${q.id}'`);
    const attempts = await sql(`SELECT id, score FROM quiz_attempt WHERE quiz_id = '${q.id}' ORDER BY id`);
    for (const [k, a] of attempts.entries()) {
      const b = kBelow(world, questions, Number(a.score), k);
      await sql(`UPDATE quiz_attempt SET answers_json = '${b.answers_json.replace(/'/g, "''")}', right_flags = '${b.right_flags}' WHERE id = '${String(a.id)}'`);
    }
  }
}

function twinClient(c: Client, url: string): Client {
  const t = new Client(url, { lang: null });
  const jar = (x: Client) => (x as unknown as { cookies: Map<string, string> }).cookies;
  for (const [k, v] of jar(c)) jar(t).set(k, v);
  return t;
}

describe('W7 AT-9.8 no admin results address returns a question, an answer or a mark (twin worlds W7-k1 and W7-k2)', { concurrency: false }, () => {
  let w: Wave1World;
  let two: Twin;
  let file: string;
  const people: { who: string; one: Client; two: Client }[] = [];
  let attempters: Record<string, string[]> = {};
  before(async () => {
    ({ w } = await wave7World());
    const s = w.school;
    const until = utcDatePlusDays(60);
    const seeded = await seed(w.p.url, {
      spaceId: s.id, grantedBy: ADMIN.username,
      people: [{ ...LAILA7, valid_until: until }],
      memberships: [{ username: LAILA7.username, role: 'publisher', valid_until: until }],
    });
    const laila = seeded.users[LAILA7.username];
    const rana = String((await w.p.sql(`SELECT id FROM user WHERE username = '${RANA5.username}'`))[0].id);
    const admin = String((await w.p.sql(`SELECT id FROM user WHERE username = '${ADMIN.username}'`))[0].id);
    await w.p.sql(`INSERT INTO membership (id, space_id, user_id, role, valid_from, valid_until, granted_by) VALUES ('w7k-rana-admin', '${s.id}', '${rana}', 'admin', '2026-01-01', '${until}', '${admin}')`);
    await w.p.sql(`INSERT INTO subject (id, space_id, title, publisher_user_id, is_published) VALUES ('${KAPPA}', '${s.id}', 'Kappa Test', '${laila}', 1)`);
    const learners = Array.from({ length: 55 }, (_, i) => `w7k-learner-${String(i + 1).padStart(2, '0')}`);
    await w.p.sql(`INSERT INTO user (id, username, password_hash, display_name, mobile, created_at) VALUES ${learners.map((id, i) => `('${id}', '${id}', 'pbkdf2-sha256$1$none$none', 'Kappa Learner ${String(i + 1).padStart(2, '0')}', '+2010720${String(i).padStart(5, '0')}', 1)`).join(', ')}`);
    await w.p.sql(`INSERT INTO membership (id, space_id, user_id, role, valid_from, valid_until, granted_by) VALUES ${learners.map((id) => `('m-${id}', '${s.id}', '${id}', 'learner', '2026-01-01', '${utcDatePlusDays(400)}', '${admin}')`).join(', ')}`);
    await w.p.sql(`INSERT INTO subject_access (id, space_id, subject_id, user_id) VALUES ${[...learners, rana].map((id) => `('${id}-kappa', '${s.id}', '${KAPPA}', '${id}')`).join(', ')}`);
    const everyone = [rana, ...learners];
    for (const [qi, q] of K_QUIZZES.entries()) {
      await insertQuiz((x) => w.p.sql(x), { id: q.id, space: s.id, subject: KAPPA, title: q.title, questions: kQuestions(1, q.id, q.n), state: q.state, created: AT.noon - 4_000_000 + qi * 1000 });
      const who = everyone.slice(0, q.attempters);
      attempters[q.id] = who;
      await w.p.sql(`INSERT INTO quiz_attempt (id, space_id, quiz_id, learner_user_id, rev, answers_json, right_flags, score, question_count, sent_at) VALUES ${who.map((l, k) => `('w7k-${q.id}-${l}', '${s.id}', '${q.id}', '${l}', 0, '{}', '${'0'.repeat(q.n)}', ${(k * 7 + qi) % (q.n + 1)}, ${q.n}, ${AT.noon - 3_000_000 + k * 1000})`).join(', ')}`);
    }
    await rewriteBelowScore((x) => w.p.sql(x), 1);
    await pinnable(w);
    // Sessions before the copy, so both worlds hold the same ones.
    const sessions = [['Amal', await signedIn(w.p.url, ADMIN.username, ADMIN.password)], ['Rana Test', await signedIn(w.p.url, RANA5.username, RANA5.password)], ['Laila Test', await signedIn(w.p.url, LAILA7.username, LAILA7.password)]] as const;
    const one = (w.p as unknown as Twin).worker;
    await one.settle();
    file = join(tmpdir(), `lms-w7k-${process.pid}-${Date.now()}.sqlite`);
    one.sqlite.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    two = await inProcess({ sqlite: new DatabaseSync(file), files: one.files }) as Twin;
    const pin = await fetch(two.url + '/__test/clock-fixed', { method: 'POST', headers: { 'content-type': 'application/json', origin: two.url }, body: JSON.stringify({ atMs: AT.noon }) });
    assert.equal(pin.status, 200, 'world two\'s clock is pinned');
    await rewriteBelowScore((x) => two.sql(x), 2);
    for (const [who, c] of sessions) people.push({ who, one: c, two: twinClient(c, two.url) });
    void clockAt;
  });
  after(async () => {
    await two?.stop();
    await closeWave6(w);
    if (file) rmSync(file, { force: true });
  });

  it('W7 AT-9.8 Amal, Rana Test and Laila Test, Arabic and English: every admin results address byte-identical in the two worlds; the raw and DOM scans find no marker, verdict, summary or answers word, class or id, and no link ending in a learner id; G5.2\'s four rules hold; controls: Laila Test\'s publisher answers page differs and its scan finds the markers', async (t) => {
    const s = w.school;
    const adm = adminQuizzes(s, KAPPA);
    const pub = publisherQuizzes(s, KAPPA);
    const allIds = Object.values(attempters).flat();
    const markers = (world: 1 | 2) => K_QUIZZES.flatMap((q) => kQuestions(world, q.id, q.n).flatMap((x) => [x.id, x.text, x.rightId, ...x.answers.flatMap((a) => [a.id, a.text])]));
    const allMarkers = [...new Set([...markers(1), ...markers(2)])];
    assert.ok(allMarkers.every((m) => m.length >= 24), 'every marker has at least 24 characters');
    const sqliteOne = (w.p as unknown as Twin).worker.sqlite;
    const sqliteTwo = two.worker.sqlite;
    let fetched = 0;
    const problems: string[] = [];
    const headerLines: string[] = [];
    for (const lang of ['ar', 'en'] as const) {
      const tt = words('school', lang);
      const whole = ['quizChosen', 'quizRightMark', 'quizRight', 'quizWrong', 'quizNoAnswer', 'quizStatsTitle'].map((k) => tt(k as 'quizRight'));
      const patterns = (['quizAnswersOf', 'quizQuestionStat'] as const).map((k) => new RegExp(`^${UI[lang][k].replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{[a-zA-Z]+\}/g, '.+')}$`));
      const scan = (body: string, where: string) => {
        for (const m of allMarkers) if (body.includes(m)) problems.push(`${where}: raw marker ${m}`);
        const tree = domOf(body);
        for (const n of nodesOf(tree)) {
          const texts = n.kind === 'text' ? [n.text] : n.kind === 'comment' ? [n.text] : n.attrs.map(([, v]) => v);
          for (const x of texts) {
            const v = x.replace(/\s+/g, ' ').trim();
            if (allMarkers.some((m) => x.includes(m))) problems.push(`${where}: DOM marker in ${JSON.stringify(v.slice(0, 60))}`);
            if (whole.includes(v) || patterns.some((p) => p.test(v))) problems.push(`${where}: the value ${JSON.stringify(v)}`);
          }
          if (n.kind === 'element') {
            const cls = (attrOf(n, 'class') ?? '').split(/\s+/);
            for (const c of ['quiz-result-body', 'quiz-answer', 'quiz-is-right', 'quiz-is-chosen', 'quiz-verdict', 'quiz-stats']) if (cls.includes(c)) problems.push(`${where}: class ${c}`);
            if (['quiz-stats', 'quiz-stats-title'].includes(attrOf(n, 'id') ?? '')) problems.push(`${where}: id ${attrOf(n, 'id')}`);
            const href = attrOf(n, 'href') ?? '';
            if (allIds.some((id) => href.endsWith(`/${id}`))) problems.push(`${where}: a link ending in a learner id (${href})`);
          }
          // Element-level text (a verdict split over children) as whole values too.
          if (n.kind === 'element' && ['p', 'li', 'span', 'h1', 'h2', 'td', 'caption'].includes(n.tag)) {
            const v = textIn(n as DomElement).replace(/\s+/g, ' ').trim();
            if (whole.includes(v) || patterns.some((p) => p.test(v))) problems.push(`${where}: the value ${JSON.stringify(v)} in <${n.tag}>`);
          }
        }
      };
      for (const p of people) {
        for (const c of [p.one, p.two]) assert.equal((await c.post('/account/language', { lang })).status < 400, true);
        const paths = [adm];
        for (const q of K_QUIZZES) {
          const pages = Math.ceil(q.attempters / 50);
          for (let i = 1; i <= pages; i++) paths.push(i === 1 ? resultsOf(adm, q.id) : `${resultsOf(adm, q.id)}?page=${i}`);
          for (const id of [...attempters[q.id], 'w7k-made-up-id']) paths.push(`${resultsOf(adm, q.id)}/${id}`);
        }
        for (const path of paths) {
          const a = await spiedGet(w, p.one, path);
          const b = await spiedGet({ p: two }, p.two, path);
          fetched++;
          const where = `${p.who} ${lang} ${path}`;
          if (a.status !== b.status || a.headers.get('content-type') !== b.headers.get('content-type') || a.body !== b.body) problems.push(`${where}: differs between the worlds (${a.status}/${b.status})`);
          const hs = (h: Headers) => [...h.entries()].filter(([k]) => k !== 'date').map(([k, v]) => `${k}: ${v}`).sort().join(' | ');
          if (hs(a.headers) !== hs(b.headers)) problems.push(`${where}: other headers differ: ${hs(a.headers)} || ${hs(b.headers)}`);
          if (headerLines.length < 3) headerLines.push(`${where}: ${hs(a.headers)} || ${hs(b.headers)}`);
          if (path.split('/').length > adm.split('/').length + 2 && a.status !== 403) problems.push(`${where}: the admin answers address answered ${a.status}`);
          scan(a.body, `${where} (W7-k1)`);
          scan(b.body, `${where} (W7-k2)`);
          problems.push(...a.log.flatMap((x) => leakRules(sqliteOne, x).map((m) => `${where} W7-k1: ${m}`)), ...b.log.flatMap((x) => leakRules(sqliteTwo, x).map((m) => `${where} W7-k2: ${m}`)));
          if (path.split('/').length > adm.split('/').length + 2 && a.log.some((x) => /quiz_attempt|answers_json/.test(x.sql))) problems.push(`${where}: a statement names quiz_attempt or answers_json`);
        }
      }
      // Controls: Laila Test's publisher answers page for one attempt differs, and the scan finds that world's markers.
      const laila = people.find((x) => x.who === 'Laila Test')!;
      const control = `${resultsOf(pub, 'w7k-q1')}/${attempters['w7k-q1'][1]}`;
      const c1 = await (await laila.one.get(control)).text();
      const c2 = await (await laila.two.get(control)).text();
      assert.notEqual(c1, c2, `${lang}: the control page differs between the worlds`);
      assert.ok(markers(1).some((m) => c1.includes(m)) && markers(2).some((m) => c2.includes(m)), `${lang}: the scan finds each world's markers on the control page`);
      const before = problems.length;
      scan(c1, 'control');
      assert.ok(problems.length > before, `${lang}: the scan reports the control page`);
      problems.length = before;
    }
    t.diagnostic(`AT-9.8: ${fetched} admin addresses fetched in each world (Amal, Rana Test, Laila Test; Arabic and English); headers side by side (first 3): ${headerLines.join(' ;; ')}`);
    t.diagnostic(`AT-9.8 result-column allowlist: ${Object.keys(RESULT_COLUMNS).join(', ')}`);
    assert.deepEqual(problems.slice(0, 20), [], `no admin results address returns a question, an answer or a mark (${problems.length} problems)`);
    assert.ok(fetched >= 2 * 3 * 60, `every address fetched (${fetched})`);
  });
});
