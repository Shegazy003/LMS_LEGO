// The made-up world of LMS wave 7, quizzes (product-contract v2 on PIL-261,
// section 3, "Test-world additions"): the wave 6 world (test/wave6/world.ts:
// waves 1 to 6, the clock pinned at 2026-12-10 12:00:00 UTC, W6-a with Nour
// Test), plus
// - W7-a: quizzes QA (open, 3 questions), QB (draft, 2), QC (closed, 1) and
//   QD (removed, 1) in Mathematics, QG (open, 1) in Arabic grammar, inserted
//   with fixed question and answer ids;
// - W7-b: attempts written directly (test/wave7/attempts.ts, scored by the
//   product's buildAttempt): Salma on QA (1 of 3), Omar C on QA (3 of 3), Rana
//   Test on QC (1 of 1), Salma on QD;
// - W7-c: QX, hostile and mixed text; W7-d: QL, the largest quiz;
// - W7-e: the load (30 quizzes not removed and 10 removed in Mathematics; a
//   class of 300 made-up learners each with an attempt on QL; Salma with an
//   attempt on each of the 29 others);
// - W7-f: Laila Test, admin and publisher, responsible for Science Test (QS).
// Every step name starts with "W7 " and its label, or with the UX id. The
// wave-7 CI job runs the product in this process (LMS_TEST_RUNTIME=in-process),
// so the statement spy is available. Made-up data only.
import assert from 'node:assert/strict';
import { utcDatePlusDays, type Client } from '../support/http.ts';
import { seed, signedIn } from '../support/seed.ts';
import type { QuizQuestion, QuizState } from '../../src/quiz.ts';
import { ADMIN, AT, HADEER, OMAR, RANA5, SALMA, SHIMAA, editorPath, pinnable, topicPath, wave6World, withW5a, type W6a, type Wave1World } from '../wave6/world.ts';
import { answersFor, writeAttempt, writeAttempts } from './attempts.ts';

export * from '../wave6/world.ts';

type Sql = (q: string) => Promise<Record<string, unknown>[]>;
const esc = (s: string) => s.replace(/'/g, "''");

// -------------------------------------------------------------- addresses ----

/** The quiz list of a subject: the publisher's (under the editor) and the admin's (under the subject admin page). */
export const publisherQuizzes = (s: { id: string }, subjectId: string) => `${editorPath(s, subjectId)}/quizzes`;
export const adminQuizzes = (s: { id: string }, subjectId: string) => `${topicPath(s, subjectId)}/quizzes`;
export const resultsOf = (list: string, quizId: string) => `${list}/${quizId}/results`;

// ------------------------------------------------------------------ W7-a ----

/** A question with fixed ids: `<qid>` and `<qid>-<letter>` per answer (letters, no digit, never the position's number). */
export function fixed(qid: string, text: string, answers: string[], right: number): QuizQuestion {
  const letters = 'abcdefgh';
  const out = answers.map((a, i) => ({ id: `${qid}-${letters[i]}`, text: a }));
  return { id: qid, text, answers: out, rightId: out[right - 1].id };
}

/** QA "Fractions check": A1 three answers (the 2nd), A2 four (the 4th), A3 "True" / "False" (the 1st). No text holds right, correct, answer or key. */
export const QA_QUESTIONS: QuizQuestion[] = [
  fixed('qa-one', 'What is 1/2 + 1/4?', ['2/6', '3/4', '1/8'], 2),
  fixed('qa-two', 'Which fraction is the largest?', ['1/5', '1/4', '1/3', '1/2'], 4),
  fixed('qa-three', 'Two quarters make one half.', ['True', 'False'], 1),
];
export const QB_QUESTIONS: QuizQuestion[] = [
  fixed('qb-one', 'What is 0.5 + 0.25?', ['0.75', '0.30'], 1),
  fixed('qb-two', 'Which is more, 0.4 or 0.35?', ['0.4', '0.35'], 1),
];
export const QC_QUESTIONS: QuizQuestion[] = [fixed('qc-one', 'How many degrees make a right angle?', ['45', '90', '180'], 2)];
export const QD_QUESTIONS: QuizQuestion[] = [fixed('qd-one', 'An old question.', ['Yes', 'No'], 1)];
export const QG_QUESTIONS: QuizQuestion[] = [fixed('qg-one', 'ما جمع كلمة كتاب؟', ['كتب', 'كاتب'], 1)];

export interface QuizSeed { id: string; space: string; subject: string; title: string; questions: QuizQuestion[]; state: QuizState; created: number; removed?: number | null; rev?: number }

/** One quiz row, written directly (as the pages would have stored it). */
export async function insertQuiz(sql: Sql, v: QuizSeed): Promise<string> {
  await sql(`INSERT INTO quiz (id, space_id, subject_id, title, questions_json, rev, state, created_at, removed_at)
    VALUES ('${esc(v.id)}', '${esc(v.space)}', '${esc(v.subject)}', '${esc(v.title)}', '${esc(JSON.stringify(v.questions))}', ${v.rev ?? 0}, '${v.state}', ${v.created}, ${v.removed ?? 'NULL'})`);
  return v.id;
}

export interface W7a { QA: string; QB: string; QC: string; QD: string; QG: string }
export const W7A: W7a = { QA: 'w7a-qa', QB: 'w7a-qb', QC: 'w7a-qc', QD: 'w7a-qd', QG: 'w7a-qg' };
export const QUESTIONS: Record<keyof W7a, QuizQuestion[]> = { QA: QA_QUESTIONS, QB: QB_QUESTIONS, QC: QC_QUESTIONS, QD: QD_QUESTIONS, QG: QG_QUESTIONS };
export const TITLES: Record<keyof W7a, string> = { QA: 'Fractions check', QB: 'Decimals', QC: 'Angles', QD: 'Old quiz', QG: 'جمع التكسير' };

/** W7-a: the five quizzes, created one second apart in that order (before the pinned instant). */
export async function withW7a(w: Wave1World, sql: Sql = (q) => w.p.sql(q)): Promise<W7a> {
  const s = w.school;
  const base = AT.noon - 3_600_000;
  const rows: [keyof W7a, string, QuizState, number | null][] = [['QA', s.math, 'open', null], ['QB', s.math, 'draft', null], ['QC', s.math, 'closed', null], ['QD', s.math, 'open', base + 60_000], ['QG', s.arabic, 'open', null]];
  for (const [i, [name, subject, state, removed]] of rows.entries()) {
    await insertQuiz(sql, { id: W7A[name], space: s.id, subject, title: TITLES[name], questions: QUESTIONS[name], state, created: base + i * 1000, removed });
  }
  return W7A;
}

// ------------------------------------------------------------------ W7-b ----

/** W7-b, written directly: Salma on QA (A1 right, A2 wrong, A3 none: 1 of 3), Omar C on QA (3 of 3), Rana Test on QC (1 of 1), Salma on QD. */
export async function withW7b(w: Wave1World, sql: Sql = (q) => w.p.sql(q)): Promise<void> {
  const s = w.school;
  const salma = w.ids[SALMA.username];
  const omar = w.ids[OMAR.username];
  const rana = w.ids[RANA5.username];
  assert.ok(salma && omar && rana, 'Salma, Omar C and Rana Test are known');
  const at = AT.noon - 600_000;
  assert.equal(await writeAttempt(sql, { space: s.id, quiz: W7A.QA, learner: salma, questions: QA_QUESTIONS, posted: answersFor(QA_QUESTIONS, (i) => (i === 0 ? 'right' : i === 1 ? 'wrong' : null)), sentAt: at }), 1);
  assert.equal(await writeAttempt(sql, { space: s.id, quiz: W7A.QA, learner: omar, questions: QA_QUESTIONS, posted: answersFor(QA_QUESTIONS, () => 'right'), sentAt: at + 1000 }), 3);
  assert.equal(await writeAttempt(sql, { space: s.id, quiz: W7A.QC, learner: rana, questions: QC_QUESTIONS, posted: answersFor(QC_QUESTIONS, () => 'right'), sentAt: at + 2000 }), 1);
  await writeAttempt(sql, { space: s.id, quiz: W7A.QD, learner: salma, questions: QD_QUESTIONS, posted: answersFor(QD_QUESTIONS, () => 'right'), sentAt: at + 3000 });
}

// ------------------------------------------------------------------ W7-c ----

export const HOSTILE = ['<script>alert(1)</script>', '<img src=x onerror=alert(1)>', '**bold**', '[a](javascript:alert(1))', '&lt;b&gt;', '‮', '«٣ + 4 = ؟»'];
/** QX: a 120-character title of Arabic and Latin with every hostile piece; questions and answers too, one with a line break. */
export const QX_TITLE = (() => {
  const t = `اختبار ${HOSTILE.join(' ')} Mixed عربي`;
  return [...t.padEnd(120, 'ع')].slice(0, 120).join('');
})();
export const QX_QUESTIONS: QuizQuestion[] = [
  fixed('qx-one', `${HOSTILE.slice(0, 4).join(' ')}\nسطر ثان «٣ + 4 = ؟»`, [HOSTILE[0], HOSTILE[1], HOSTILE[3]], 1),
  fixed('qx-two', `${HOSTILE[4]} ${HOSTILE[5]} ${HOSTILE[2]}`, [HOSTILE[2], HOSTILE[4], `${HOSTILE[5]}abc`], 2),
];
export const QX = 'w7c-qx';
export async function withW7c(w: Wave1World, sql: Sql = (q) => w.p.sql(q)): Promise<string> {
  assert.equal([...QX_TITLE].length, 120, 'QX title is 120 characters');
  return insertQuiz(sql, { id: QX, space: w.school.id, subject: w.school.math, title: QX_TITLE, questions: QX_QUESTIONS, state: 'draft', created: AT.noon - 1_800_000 });
}

// ------------------------------------------------------------------ W7-d ----

/** Arabic text of exactly n characters. */
export const arabicOf = (n: number, seedWord = 'سؤال') => [...`${seedWord} ${'ب'.repeat(n)}`].slice(0, n).join('');
/** QL: 20 questions of 5 answers, every text at its maximum length in Arabic; its title 120 characters. */
export const QL_TITLE = arabicOf(120, 'الاختبار الأكبر');
export const QL_QUESTIONS: QuizQuestion[] = Array.from({ length: 20 }, (_, i) => {
  const name = `ql-${'abcdefghijklmnopqrst'[i]}`;
  return fixed(name, arabicOf(500, `سؤال ${'أبتثجحخدذرزسشصضطظعغف'[i]}`), Array.from({ length: 5 }, (_, j) => arabicOf(200, `إجابة ${'أبتثج'[j]}${'أبتثجحخدذرزسشصضطظعغف'[i]}`)), 1 + (i % 5));
});
export const QL = 'w7d-ql';
export async function withW7d(w: Wave1World, sql: Sql = (q) => w.p.sql(q), state: QuizState = 'open'): Promise<string> {
  return insertQuiz(sql, { id: QL, space: w.school.id, subject: w.school.math, title: QL_TITLE, questions: QL_QUESTIONS, state, created: AT.noon - 1_700_000 });
}

// ------------------------------------------------------------------ W7-e ----

export interface W7e { ql: string; others: string[]; removed: string[]; learners: string[]; group: string }

/** W7-e (after W7-a and W7-d, without W7-b's QA / QC / QD rows): Mathematics holds exactly 30 quizzes not removed (QL and 29
 * others with 40-character Arabic titles, all open) and 10 removed; a class of 300 made-up learners assigned to Mathematics,
 * each with an attempt on QL; Salma with an attempt on each of the 29 others. QA, QB and QC are removed first, QX absent. */
export async function withW7e(w: Wave1World, sql: Sql = (q) => w.p.sql(q)): Promise<W7e> {
  const s = w.school;
  await sql(`UPDATE quiz SET removed_at = ${AT.noon - 7_200_000} WHERE space_id = '${s.id}' AND subject_id = '${s.math}' AND id <> '${QL}' AND removed_at IS NULL`);
  const removedNow = await sql(`SELECT id FROM quiz WHERE space_id = '${s.id}' AND subject_id = '${s.math}' AND removed_at IS NOT NULL`);
  const others: string[] = [];
  for (let i = 0; i < 29; i++) {
    const id = `w7e-q${'abcdefghijklmnopqrstuvwxyzABC'[i]}`;
    await insertQuiz(sql, { id, space: s.id, subject: s.math, title: arabicOf(40, `اختبار ${i + 1}`), questions: [fixed(`${id}-one`, 'سؤال قصير', ['نعم', 'لا'], 1)], state: 'open', created: AT.noon - 1_600_000 + i * 1000 });
    others.push(id);
  }
  const removed = removedNow.map((r) => String(r.id));
  for (let i = removed.length; i < 10; i++) {
    const id = `w7e-gone-${'abcdefghij'[i]}`;
    await insertQuiz(sql, { id, space: s.id, subject: s.math, title: arabicOf(40, 'محذوف'), questions: QD_QUESTIONS, state: 'closed', created: AT.noon - 9_000_000 + i, removed: AT.noon - 8_000_000 + i });
    removed.push(id);
  }
  const [{ n }] = await sql(`SELECT COUNT(*) AS n FROM quiz WHERE space_id = '${s.id}' AND subject_id = '${s.math}' AND removed_at IS NULL`);
  assert.equal(Number(n), 30, 'W7-e: 30 quizzes not removed in Mathematics');
  // The class of 300 (rows written directly: they never sign in), assigned Mathematics.
  const group = 'w7e-class';
  await sql(`INSERT INTO "group" (id, space_id, name) VALUES ('${group}', '${s.id}', 'Load class W7')`);
  await sql(`INSERT INTO subject_access (id, space_id, subject_id, group_id) VALUES ('w7e-access', '${s.id}', '${s.math}', '${group}')`);
  const admin = w.ids[ADMIN.username] ?? String((await sql(`SELECT id FROM user WHERE username = '${ADMIN.username}'`))[0].id);
  const learners = Array.from({ length: 300 }, (_, i) => `w7e-learner-${String(i).padStart(3, '0')}`);
  for (let i = 0; i < learners.length; i += 100) {
    const slice = learners.slice(i, i + 100);
    await sql(`INSERT INTO user (id, username, password_hash, display_name, mobile, created_at) VALUES ${slice.map((id, j) => `('${id}', '${id}', 'pbkdf2-sha256$1$none$none', 'Load Learner ${String(i + j).padStart(3, '0')}', '+2010700${String(i + j).padStart(5, '0')}', 1)`).join(', ')}`);
    await sql(`INSERT INTO membership (id, space_id, user_id, role, valid_from, valid_until, granted_by) VALUES ${slice.map((id) => `('m-${id}', '${s.id}', '${id}', 'learner', '2026-01-01', '${utcDatePlusDays(400)}', '${admin}')`).join(', ')}`);
    await sql(`INSERT INTO group_member (space_id, group_id, user_id) VALUES ${slice.map((id) => `('${s.id}', '${group}', '${id}')`).join(', ')}`);
  }
  await writeAttempts(sql, {
    space: s.id, quiz: QL, questions: QL_QUESTIONS, sentAt: AT.noon - 300_000,
    rows: learners.map((learner, i) => ({ learner, posted: answersFor(QL_QUESTIONS, (k) => ((i + k) % 3 === 0 ? 'wrong' : (i + k) % 7 === 0 ? null : 'right')) })),
  });
  const salma = w.ids[SALMA.username];
  for (const [i, id] of others.entries()) {
    await writeAttempt(sql, { space: s.id, quiz: id, learner: salma, questions: [fixed(`${id}-one`, 'سؤال قصير', ['نعم', 'لا'], 1)], posted: { [`${id}-one`]: `${id}-one-a` }, sentAt: AT.noon - 200_000 + i * 1000 });
  }
  return { ql: QL, others, removed, learners, group };
}

// ------------------------------------------------------------------ W7-f ----

export const LAILA7 = { display_name: 'Laila Test', username: 'laila.w7', password: 'laila-wave7-pass', role: 'admin' as const, mobile: '01071710001' };
export const QS = 'w7f-qs';
export const QS_QUESTIONS: QuizQuestion[] = [fixed('qs-one', 'Water boils at 100 degrees.', ['True', 'False'], 1)];

/** W7-f (AT-2.3b's own world): Laila Test, admin and publisher of Mesk School, responsible for Science Test (published, Salma
 * assigned), whose open quiz QS has Salma's attempt. */
export async function withW7f(w: Wave1World): Promise<{ laila: string; science: string }> {
  const s = w.school;
  const until = utcDatePlusDays(60);
  const seeded = await seed(w.p.url, {
    spaceId: s.id, grantedBy: ADMIN.username,
    people: [{ ...LAILA7, valid_until: until }],
    memberships: [{ username: LAILA7.username, role: 'publisher', valid_until: until }],
    subjects: [{ title: 'Science Test', publisher: LAILA7.username, published: true, users: [SALMA.username], chapters: [] }],
  });
  const laila = seeded.users[LAILA7.username];
  const science = seeded.subjects['Science Test'].id;
  w.ids[LAILA7.username] = laila;
  await insertQuiz((q) => w.p.sql(q), { id: QS, space: s.id, subject: science, title: 'Boiling check', questions: QS_QUESTIONS, state: 'open', created: AT.noon - 900_000 });
  await writeAttempt((q) => w.p.sql(q), { space: s.id, quiz: QS, learner: w.ids[SALMA.username], questions: QS_QUESTIONS, posted: answersFor(QS_QUESTIONS, () => 'right'), sentAt: AT.noon - 800_000 });
  await pinnable(w);
  return { laila, science };
}

// ------------------------------------------------------------- the world ----

/** The wave 7 world: wave 6's (the clock pinned at noon of D, W6-a), W5-a (Karim Test, Rana Test), then W7-a. Ids of
 * Salma, Omar C, Rana Test and the admin are filled in. Sign people in after this. */
export async function wave7World(opts: { activity?: boolean } = {}): Promise<{ w: Wave1World; a: W6a; q: W7a }> {
  const { w, a } = await wave6World({ activity: opts.activity });
  try {
    await withW5a(w);
    for (const p of [SALMA, OMAR, ADMIN, HADEER, SHIMAA]) {
      if (!w.ids[p.username]) w.ids[p.username] = String((await w.p.sql(`SELECT id FROM user WHERE username = '${p.username}'`))[0].id);
    }
    await pinnable(w);
    return { w, a, q: await withW7a(w) };
  } catch (err) {
    await w.close();
    throw err;
  }
}

// ------------------------------------------------- the style and the card ----
// Contract AT-5 and section 11 items 3 and 5: all wave 7 CSS is one block appended at the end of the inlined CSS, starting with
// `/* wave 7 quizzes */`, every selector (inside an @media rule too) starting with `#quizzes`, `#quiz-` or `.quiz-`, at most 4 KB.
// The earlier waves' base comparisons cut it off the candidate's <style> after checking it, and cut the quiz card on teacher pages.

export const W7_MARK = '/* wave 7 quizzes */';
export const W7_CSS_MAX = 4096;
/** The quiz card of a subject's editor and subject admin page. */
export const QUIZ_CARD = /<section id="quizzes" class="card"[\s\S]*?<\/section>/g;

/** The selectors of a CSS text, an @media rule's inner ones included. */
export function selectorsOf(css: string): string[] {
  const out: string[] = [];
  let rest = css.replace(/\/\*[\s\S]*?\*\//g, '');
  while (rest.trim()) {
    const open = rest.indexOf('{');
    if (open < 0) break;
    const head = rest.slice(0, open).trim();
    if (head.startsWith('@media')) {
      let depth = 1;
      let i = open + 1;
      while (i < rest.length && depth) depth += rest[i] === '{' ? 1 : rest[i] === '}' ? -1 : 0, i++;
      out.push(...selectorsOf(rest.slice(open + 1, i - 1)));
      rest = rest.slice(i);
      continue;
    }
    out.push(...head.split(',').map((s) => s.trim()));
    rest = rest.slice(rest.indexOf('}', open) + 1);
  }
  return out;
}

/** What is wrong with a wave 7 block (from its mark to the end), or null. */
export function wave7BlockProblem(block: string): string | null {
  if (!block.startsWith(W7_MARK)) return `the wave 7 style does not start with ${W7_MARK}`;
  if (Buffer.byteLength(block) > W7_CSS_MAX) return `the wave 7 block is ${Buffer.byteLength(block)} bytes (at most ${W7_CSS_MAX})`;
  for (const s of selectorsOf(block.slice(W7_MARK.length))) if (!/^(#quizzes|#quiz-|\.quiz-)/.test(s)) return `a wave 7 selector outside the rule: ${s}`;
  return null;
}

/** A candidate's <style> content with the wave 7 block cut off its end, after checking it; `problem` when the block breaks the rule or is missing. */
export function cutWave7Style(css: string): { rest: string; problem: string | null } {
  const at = css.lastIndexOf(W7_MARK);
  if (at < 0) return { rest: css, problem: `no ${W7_MARK} block at the end of the style` };
  return { rest: css.slice(0, at), problem: wave7BlockProblem(css.slice(at)) };
}

// ------------------------------------------------------------- page reads ----

const unescape = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
/** Visible text of a fragment, spaces collapsed. */
export const textOf = (fragment: string) => unescape(fragment.replace(/<script>[\s\S]*?<\/script>/g, '').replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();

/** The quiz card on a page (UX-68), or null. */
export function quizCardOf(html: string) {
  const m = /<section id="quizzes" class="card"[\s\S]*?<\/section>/.exec(html);
  if (!m) return null;
  const link = /<a class="quiz-link-button" href="([^"]+)">([\s\S]*?)<\/a>/.exec(m[0]);
  return {
    block: m[0], at: m.index,
    heading: textOf(/<h2 id="quizzes-title">([\s\S]*?)<\/h2>/.exec(m[0])?.[1] ?? ''),
    help: textOf(/<p class="quiz-help">([\s\S]*?)<\/p>/.exec(m[0])?.[1] ?? ''),
    link: link ? { href: unescape(link[1]), text: textOf(link[2]) } : null,
  };
}

/** The rows of a quiz list, in order (not the removed fold). */
export function quizRowsOf(html: string) {
  const list = /<ul id="quiz-list" class="quiz-list">([\s\S]*?)<\/ul>/.exec(html)?.[1] ?? '';
  return [...list.matchAll(/<li class="quiz-row" id="quiz-([^"]+)">([\s\S]*?)<\/li>/g)].map((m) => ({
    id: m[1], html: m[2],
    title: textOf(/<bdi>([\s\S]*?)<\/bdi>/.exec(m[2])?.[1] ?? ''),
    state: textOf(/<span class="quiz-state">([\s\S]*?)<\/span>/.exec(m[2])?.[1] ?? ''),
    count: textOf(/<span class="quiz-count">([\s\S]*?)<\/span>/.exec(m[2])?.[1] ?? ''),
    results: /<a class="quiz-results-link" href="([^"]+)">([\s\S]*?)<\/a>/.exec(m[2]) ? { href: unescape(/<a class="quiz-results-link" href="([^"]+)">/.exec(m[2])![1]), text: textOf(/<a class="quiz-results-link" href="[^"]+">([\s\S]*?)<\/a>/.exec(m[2])![1]) } : null,
  }));
}

/** The removed fold of a quiz list: its summary and the quizzes in it, or null. */
export function removedFoldOf(html: string) {
  const m = /<details id="quiz-removed" class="quiz-fold">([\s\S]*?)<\/details>/.exec(html);
  if (!m) return null;
  return { open: /<details id="quiz-removed" class="quiz-fold" open/.test(html), summary: textOf(/<summary>([\s\S]*?)<\/summary>/.exec(m[1])?.[1] ?? ''), ids: [...m[1].matchAll(/id="quiz-([^"]+)"/g)].map((x) => x[1]) };
}

/** The questions of an editor, in order: id, heading, whether editable (a form) or locked (text only). */
export function editorQuestionsOf(html: string) {
  return [...html.matchAll(/<section id="question-([^"]+)" class="quiz-question card" tabindex="-1">([\s\S]*?)<\/section>/g)]
    .filter((m) => m[1] !== 'new')
    .map((m) => ({
      id: m[1], html: m[2],
      heading: textOf(/<h2>([\s\S]*?)<\/h2>/.exec(m[2])?.[1] ?? ''),
      editable: /<form class="quiz-form quiz-question-form"/.test(m[2]),
      text: unescape(/<textarea[^>]*>([\s\S]*?)<\/textarea>/.exec(m[2])?.[1] ?? /<p class="quiz-text" dir="auto">([\s\S]*?)<\/p>/.exec(m[2])?.[1] ?? ''),
      answers: /<textarea/.test(m[2])
        ? [...m[2].matchAll(/name="answer(\d)" maxlength="\d+" dir="auto" value="([^"]*)"/g)].map((a) => unescape(a[2]))
        : [...m[2].matchAll(/<span class="quiz-answer-text" dir="auto">([\s\S]*?)<\/span>/g)].map((a) => unescape(a[1])),
      right: /<textarea/.test(m[2])
        ? Number(/name="right" value="(\d)"[^>]*? checked/.exec(m[2])?.[1] ?? 0)
        : [...m[2].matchAll(/<li class="quiz-answer( quiz-is-right)?">/g)].findIndex((a) => Boolean(a[1])) + 1,
    }));
}

/** The status line of a page (role="status"), its text, or null. */
export const statusOf = (html: string) => {
  const m = /<p class="quiz-status [a-z]+" role="status" tabindex="-1">([\s\S]*?)<\/p>/.exec(html);
  return m ? textOf(m[1]) : null;
};
/** The top message (role="alert"), or null. */
export const messageOf = (html: string) => {
  const m = /<p id="quiz-message" class="error" role="alert" tabindex="-1">([\s\S]*?)<\/p>/.exec(html);
  return m ? textOf(m[1]) : null;
};
/** Every field error on the page, with the field it is tied to (aria-describedby). */
export function fieldErrorsOf(html: string): { field: string; text: string }[] {
  return [...html.matchAll(/<p id="([^"]+)" class="error quiz-error">([\s\S]*?)<\/p>/g)].map((m) => {
    const tied = new RegExp(`<(?:input|textarea|button)[^>]*?name="([^"]+)"[^>]*?aria-describedby="${m[1]}"`).exec(html) ?? new RegExp(`<(?:input|textarea|button)[^>]*?aria-describedby="${m[1]}"`).exec(html);
    return { field: tied?.[1] ?? '', text: textOf(m[2]) };
  });
}

/** The quiz rows of the database, as one comparable text (for "nothing stored or changed"). */
export async function quizSnapshot(sql: Sql): Promise<string> {
  const quizzes = await sql('SELECT id, space_id, subject_id, title, questions_json, rev, state, created_at, removed_at FROM quiz ORDER BY id');
  const attempts = await sql('SELECT id, quiz_id, learner_user_id, rev, answers_json, right_flags, score, question_count, sent_at FROM quiz_attempt ORDER BY id');
  return JSON.stringify([quizzes.map((r) => Object.values(r)), attempts.map((r) => Object.values(r))]);
}

/** A stored quiz row read back. */
export async function quizRow(sql: Sql, id: string) {
  const rows = await sql(`SELECT id, subject_id, title, questions_json, rev, state, created_at, removed_at FROM quiz WHERE id = '${esc(id)}'`);
  assert.equal(rows.length, 1, `quiz ${id} exists`);
  const r = rows[0];
  return { id: String(r.id), subject: String(r.subject_id), title: String(r.title), questions: JSON.parse(String(r.questions_json)) as QuizQuestion[], rev: Number(r.rev), state: String(r.state), removed: r.removed_at === null ? null : Number(r.removed_at) };
}

/** Posts a form and expects a 303; returns the Location without the product's origin. */
export async function press(c: Client, url: string, path: string, fields: Record<string, string>, status = 303): Promise<Response> {
  const res = await c.post(path, fields);
  assert.equal(res.status, status, `${path} ${JSON.stringify(fields).slice(0, 120)}: ${status}`);
  return res;
}
export const located = (res: Response, url: string) => (res.headers.get('location') ?? '').replace(url, '');

/** The fields of a question form: text, answer1 … answer5, right, rev. */
export const questionForm = (text: string, answers: string[], right: number | '', rev: number) => {
  const out: Record<string, string> = { text, right: String(right), rev: String(rev) };
  for (let i = 0; i < 5; i++) out[`answer${i + 1}`] = answers[i] ?? '';
  return out;
};

export { signedIn };
