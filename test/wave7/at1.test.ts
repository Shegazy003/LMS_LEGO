// LMS wave 7, W7-1 (product-contract v2 on PIL-261, AT-1): the teacher and the
// admin build and manage a quiz. Each labelled expectation is its own CI step
// (`W7 AT-1.n …`, job wave-7). Hadeer works from the Mathematics editor, Amal
// from the Mathematics admin page; strings are asserted by ui.ts key. HTTP
// forms here are the page without script (the browser steps, with script, are
// the UX steps). Made-up data only.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { UI } from '../../src/i18n/ui.ts';
import { QUIZ_OPTION_MAX, QUIZ_OPTIONS_MAX, QUIZ_OPTIONS_MIN, QUIZ_PER_SUBJECT_MAX, QUIZ_QUESTIONS_MAX, QUIZ_TEXT_MAX, QUIZ_TITLE_MAX } from '../../src/quiz.ts';
import { makeLabel } from '../../src/labels.ts';
import { seedKit } from '../../src/kits/seed.ts';
import type { Client } from '../support/http.ts';
import {
  ADMIN, HADEER, MONA, OMAR, SALMA, SHIMAA, W7A, QA_QUESTIONS, QB_QUESTIONS, TITLES, adminQuizzes, as, closeWave6, editorPath, editorQuestionsOf, fieldErrorsOf, insertQuiz,
  located, messageOf, publisherQuizzes, questionForm, quizCardOf, quizRow, quizRowsOf, quizSnapshot, removedFoldOf, resultsOf, statusOf, textOf, topicPath, wave7World, withW7b, AT,
  type Wave1World,
} from './world.ts';

const en = makeLabel('en', seedKit('school'));
const sql = (w: Wave1World) => (q: string) => w.p.sql(q);

interface Side { who: string; c: Client; list: string; page: string }

async function sides(w: Wave1World): Promise<Side[]> {
  const s = w.school;
  return [
    { who: 'Hadeer', c: await as(w, HADEER, 'en'), list: publisherQuizzes(s, s.math), page: editorPath(s, s.math) },
    { who: 'Amal', c: await as(w, ADMIN, 'en'), list: adminQuizzes(s, s.math), page: topicPath(s, s.math) },
  ];
}

const html = async (c: Client, path: string, status = 200) => {
  const res = await c.get(path);
  assert.equal(res.status, status, `GET ${path}`);
  return res.text();
};

/** Creates a quiz through the list; returns its id. */
async function create(w: Wave1World, side: Side, title: string): Promise<string> {
  const res = await side.c.post(side.list, { title });
  assert.equal(res.status, 303, `${side.who} creates ${title}`);
  const to = located(res, w.p.url);
  const m = new RegExp(`^${side.list.replace(/[/]/g, '\\/')}\\/([a-z]+)\\?quiz=created$`).exec(to);
  assert.ok(m, `303 to the new draft's editor with quiz=created (${to})`);
  return m[1];
}

describe('W7 AT-1 build and manage a quiz (Hadeer from the editor, Amal from the admin page)', { concurrency: false }, () => {
  let w: Wave1World;
  let side: Side[];
  before(async () => {
    ({ w } = await wave7World());
    side = await sides(w);
  });
  after(() => closeWave6(w));

  it('W7 AT-1.1 create and add: the card on both pages, create stores a draft and answers 303 to its editor, a question with blanks dropped, each page shows the other\'s', async () => {
    const s = w.school;
    for (const x of side) {
      const card = quizCardOf(await html(x.c, x.page));
      assert.ok(card, `${x.who}: the quiz card on ${x.page}`);
      assert.equal(card.heading, en('quizCardTitle'));
      assert.deepEqual(card.link, { href: x.list, text: en('quizManageLink') }, `${x.who}: quizManageLink to the quiz list`);
    }
    const [hadeer, amal] = side;
    const id = await create(w, hadeer, 'Check 1');
    const row = await quizRow(sql(w), id);
    assert.deepEqual([row.state, row.title, row.subject, row.rev, row.questions.length, row.removed], ['draft', 'Check 1', s.math, 0, 0, null], 'a draft is stored');
    const editor = await html(hadeer.c, `${hadeer.list}/${id}?quiz=created`);
    assert.equal(statusOf(editor), en('quizCreated'), 'quizCreated on the editor');
    // A question: boxes 1, 2 and 4 filled, box 3 and 5 blank, the 2nd marked right.
    const res = await hadeer.c.post(`${hadeer.list}/${id}/question`, questionForm('What is 2 + 2?', ['3', '4', '', '5', ''], 2, 0));
    assert.equal(res.status, 303);
    const stored = await quizRow(sql(w), id);
    assert.equal(stored.questions.length, 1);
    const q1 = stored.questions[0];
    assert.deepEqual(q1.answers.map((a) => a.text), ['3', '4', '5'], 'blank boxes are dropped');
    assert.equal(q1.rightId, q1.answers[1].id, 'the 2nd answer is the right one');
    assert.equal(stored.rev, 1, 'the rev rises');
    assert.equal(located(res, w.p.url), `${hadeer.list}/${id}?quiz=question-saved&q=${q1.id}#question-${q1.id}`);
    const shown = editorQuestionsOf(await html(hadeer.c, located(res, w.p.url).split('#')[0]));
    assert.deepEqual(shown.map((q) => [q.heading, q.answers.slice(0, 3), q.right]), [[en('quizQuestionHeading', { n: '1' }), ['3', '4', '5'], 2]], 'question 1 with its right answer marked');
    // Each page shows what the other made.
    const other = await create(w, amal, 'Check 2');
    assert.ok(quizRowsOf(await html(amal.c, amal.list)).some((r) => r.id === id && r.title === 'Check 1'), 'Amal sees Hadeer\'s quiz');
    assert.ok(quizRowsOf(await html(hadeer.c, hadeer.list)).some((r) => r.id === other && r.title === 'Check 2'), 'Hadeer sees Amal\'s quiz');
    assert.equal(editorQuestionsOf(await html(amal.c, `${amal.list}/${id}`))[0].answers.slice(0, 3).join('|'), '3|4|5', 'Amal\'s editor shows Hadeer\'s question');
  });

  it('W7 AT-1.2 limits: each refused with its key, 400, the typed values kept, nothing stored; exactly at each limit stored', async () => {
    const [hadeer, amal] = side;
    for (const x of [hadeer, amal]) {
      const id = await create(w, x, `Limits ${x.who}`);
      const editor = `${x.list}/${id}`;
      const refused = async (path: string, fields: Record<string, string>, key: keyof typeof UI.en, vars: Record<string, string>, kept?: string) => {
        const before = await quizSnapshot(sql(w));
        const res = await x.c.post(path, fields);
        const body = await res.text();
        assert.equal(res.status, 400, `${x.who} ${path}: 400 for ${key}`);
        const message = en(key, vars);
        assert.ok(fieldErrorsOf(body).some((e) => e.text === message) || messageOf(body) === message, `${x.who}: ${key} shown (${JSON.stringify(fieldErrorsOf(body))} ${messageOf(body)})`);
        if (kept !== undefined) assert.ok(body.includes(kept), `${x.who}: the typed value is kept`);
        assert.equal(await quizSnapshot(sql(w)), before, `${x.who} ${key}: nothing stored`);
      };
      const rev = async () => (await quizRow(sql(w), id)).rev;
      const t = { max: String(QUIZ_TITLE_MAX) };
      await refused(x.list, { title: '' }, 'quizTitleInvalid', t);
      await refused(x.list, { title: 'x'.repeat(121) }, 'quizTitleInvalid', t, 'x'.repeat(121));
      await refused(`${editor}/title`, { title: 'y'.repeat(121), rev: '0' }, 'quizTitleInvalid', t, 'y'.repeat(121));
      const opt = { min: String(QUIZ_OPTIONS_MIN), max: String(QUIZ_OPTIONS_MAX), len: String(QUIZ_OPTION_MAX) };
      await refused(`${editor}/question`, questionForm('', ['a', 'b'], 1, await rev()), 'quizTextInvalid', { max: String(QUIZ_TEXT_MAX) });
      await refused(`${editor}/question`, questionForm('q'.repeat(501), ['a', 'b'], 1, await rev()), 'quizTextInvalid', { max: String(QUIZ_TEXT_MAX) }, 'q'.repeat(501));
      await refused(`${editor}/question`, questionForm('One filled', ['only'], 1, await rev()), 'quizOptionsInvalid', opt, 'One filled');
      await refused(`${editor}/question`, { ...questionForm('Six', ['a', 'b', 'c', 'd', 'e'], 1, await rev()), answer6: 'f' }, 'quizOptionsInvalid', opt);
      await refused(`${editor}/question`, questionForm('Equal', ['same', ' same '], 1, await rev()), 'quizOptionsInvalid', opt);
      await refused(`${editor}/question`, questionForm('Long', ['a', 'z'.repeat(201)], 1, await rev()), 'quizOptionsInvalid', opt, 'z'.repeat(201));
      await refused(`${editor}/question`, questionForm('No right', ['a', 'b'], '', await rev()), 'quizCorrectInvalid', {});
      await refused(`${editor}/question`, questionForm('Right on blank', ['a', 'b', ''], 3, await rev()), 'quizCorrectInvalid', {});
      // Exactly at each limit: stored.
      const ok = async (path: string, fields: Record<string, string>) => assert.equal((await x.c.post(path, fields)).status, 303, `${x.who} ${path}: stored at the limit`);
      await ok(`${editor}/title`, { title: 't'.repeat(120), rev: String(await rev()) });
      await ok(`${editor}/question`, questionForm('q'.repeat(500), ['a'.repeat(200), 'b'], 1, await rev()));
      await ok(`${editor}/question`, questionForm('Five', ['a', 'b', 'c', 'd', 'e'], 5, await rev()));
      const row = await quizRow(sql(w), id);
      assert.equal(row.title, 't'.repeat(120));
      assert.deepEqual(row.questions.map((q) => [[...q.text].length, q.answers.length]), [[500, 2], [4, 5]]);
      while ((await quizRow(sql(w), id)).questions.length < QUIZ_QUESTIONS_MAX) await ok(`${editor}/question`, questionForm(`Q ${(await quizRow(sql(w), id)).questions.length}`, ['a', 'b'], 1, await rev()));
      assert.equal((await quizRow(sql(w), id)).questions.length, 20, '20 questions stored');
      await refused(`${editor}/question`, questionForm('The 21st', ['a', 'b'], 1, await rev()), 'quizFull', { max: String(QUIZ_QUESTIONS_MAX) });
      assert.ok(!(await html(x.c, editor)).includes('id="question-new"'), 'no new-question form at 20 questions');
    }
    // 30 quizzes not removed in Mathematics: the 30th is stored, a 31st by create or by copy is refused.
    const count = async () => Number((await w.p.sql(`SELECT COUNT(*) AS n FROM quiz WHERE subject_id = '${w.school.math}' AND removed_at IS NULL`))[0].n);
    while ((await count()) < QUIZ_PER_SUBJECT_MAX) await create(w, hadeer, `Fill ${await count()}`);
    assert.equal(await count(), 30, 'the 30th quiz is stored');
    const limit = en('quizLimit', { subjectTitle: 'Mathematics', max: String(QUIZ_PER_SUBJECT_MAX) });
    for (const x of side) {
      const before = await quizSnapshot(sql(w));
      const res = await x.c.post(x.list, { title: 'One too many' });
      const body = await res.text();
      assert.equal(res.status, 400, `${x.who}: a 31st by create`);
      assert.ok(fieldErrorsOf(body).some((e) => e.text === limit), `${x.who}: quizLimit`);
      assert.ok(body.includes('One too many'), 'the title is kept');
      const copy = await x.c.post(`${x.list}/${W7A.QA}/copy`, { rev: '0' });
      assert.equal(copy.status, 400, `${x.who}: a 31st by copy`);
      assert.ok(fieldErrorsOf(await copy.text()).some((e) => e.text === limit), `${x.who}: quizLimit on copy`);
      assert.equal(await quizSnapshot(sql(w)), before, `${x.who}: nothing stored`);
    }
    // Back under the limit for the next steps: the fill quizzes removed directly, an hour before the pinned instant
    // (so a quiz removed later through the page is among the fold's most recent).
    await w.p.sql(`UPDATE quiz SET removed_at = ${AT.noon - 3_600_000} WHERE title LIKE 'Fill %' OR title LIKE 'Limits %'`);
  });

  it('W7 AT-1.3 states: open, the empty quiz refused, close, reopen, remove into the fold, restore in the earlier state; quizOpenHelp on every quiz without an attempt', async () => {
    const [hadeer, amal] = side;
    const editor = `${hadeer.list}/${W7A.QB}`;
    let res = await hadeer.c.post(`${editor}/open`, { rev: '0' });
    assert.equal(located(res, w.p.url), `${editor}?quiz=opened#quiz-state`);
    assert.equal((await quizRow(sql(w), W7A.QB)).state, 'open');
    assert.equal(statusOf(await html(hadeer.c, `${editor}?quiz=opened`)), en('quizOpened', { learner: 'student', subjectTitle: 'Mathematics' }), 'quizOpened');
    const empty = await create(w, amal, 'Empty one');
    const before = await quizSnapshot(sql(w));
    res = await amal.c.post(`${amal.list}/${empty}/open`, { rev: '0' });
    assert.equal(res.status, 400, 'opening a quiz with no question is refused');
    assert.equal(messageOf(await res.text()), en('quizNotReady'));
    assert.equal(await quizSnapshot(sql(w)), before, 'nothing stored');
    res = await amal.c.post(`${amal.list}/${W7A.QB}/close`, { rev: '0' });
    assert.equal((await quizRow(sql(w), W7A.QB)).state, 'closed');
    assert.equal(statusOf(await html(amal.c, located(res, w.p.url).split('#')[0])), en('quizClosed'));
    await hadeer.c.post(`${editor}/reopen`, { rev: '0' });
    assert.equal((await quizRow(sql(w), W7A.QB)).state, 'open', 'reopen stores open');
    // A stale status address shows no false status.
    assert.equal(statusOf(await html(hadeer.c, `${editor}?quiz=closed`)), null, 'no false status');
    // Remove: hidden from the list, in the fold; restore: back, in its earlier state.
    res = await hadeer.c.post(`${editor}/remove`, { rev: '0' });
    assert.equal(located(res, w.p.url), `${hadeer.list}?quiz=removed&id=${W7A.QB}`);
    const list = await html(hadeer.c, located(res, w.p.url));
    assert.equal(statusOf(list), en('quizRemoved'));
    assert.ok(!quizRowsOf(list).some((r) => r.id === W7A.QB), 'gone from the list');
    const fold = removedFoldOf(list);
    assert.ok(fold && fold.ids.includes(W7A.QB) && fold.summary === en('quizRemovedTitle', { n: String(fold.ids.length) }) && !fold.open, 'in the closed fold quizRemovedTitle');
    assert.equal((await hadeer.c.get(editor)).status, 404, 'the removed quiz\'s editor is 404');
    res = await amal.c.post(`${amal.list}/${W7A.QB}/restore`, { rev: '0' });
    assert.equal(statusOf(await html(amal.c, located(res, w.p.url))), en('quizRestored'));
    const back = await quizRow(sql(w), W7A.QB);
    assert.deepEqual([back.state, back.removed], ['open', null], 'restored in its earlier state');
    // quizOpenHelp on every quiz without an attempt (no attempt exists yet in this world).
    for (const id of [W7A.QA, W7A.QB, W7A.QC, empty]) {
      assert.ok((await html(hadeer.c, `${hadeer.list}/${id}`)).includes(`<p class="quiz-help quiz-open-help">${UI.en.quizOpenHelp}</p>`), `quizOpenHelp on ${id}`);
    }
  });

  it('W7 AT-1.4 lock after answers: with W7-b QA is read-only with its right answers, every question write 409 quizLocked; title, close, reopen, remove, restore and copy still work; QB stays editable', async () => {
    await withW7b(w);
    const [hadeer, amal] = side;
    // CI runs each step alone: QB is opened here when AT-1.3 (which opens it) has not run in this process.
    if ((await quizRow(sql(w), W7A.QB)).state === 'draft') assert.equal((await hadeer.c.post(`${hadeer.list}/${W7A.QB}/open`, { rev: '0' })).status, 303, 'QB opened');
    const editor = `${hadeer.list}/${W7A.QA}`;
    const page = await html(hadeer.c, editor);
    assert.ok(page.includes(`<p id="quiz-locked" class="quiz-locked">${UI.en.quizLockedNote}</p>`), 'quizLockedNote');
    assert.ok(!page.includes('quiz-open-help'), 'no quizOpenHelp on a locked quiz');
    const shown = editorQuestionsOf(page);
    assert.deepEqual(shown.map((q) => [q.editable, q.text, q.answers, q.right]), QA_QUESTIONS.map((q) => [false, q.text, q.answers.map((a) => a.text), q.answers.findIndex((a) => a.id === q.rightId) + 1]), 'read-only, right answers marked');
    const before = await quizSnapshot(sql(w));
    for (const [path, fields] of [
      [`${editor}/question`, questionForm('New', ['a', 'b'], 1, 0)],
      [`${editor}/question/${QA_QUESTIONS[0].id}`, questionForm('Changed', ['a', 'b'], 1, 0)],
      [`${editor}/question/${QA_QUESTIONS[0].id}/remove`, { rev: '0' }],
      [`${amal.list}/${W7A.QA}/question/${QA_QUESTIONS[1].id}`, questionForm('Changed', ['a', 'b'], 1, 0)],
    ] as const) {
      const c = path.startsWith(amal.list) ? amal.c : hadeer.c;
      const res = await c.post(path, fields);
      assert.equal(res.status, 409, `${path}: 409`);
      assert.equal(messageOf(await res.text()), en('quizLocked'));
    }
    assert.equal(await quizSnapshot(sql(w)), before, 'nothing stored');
    // What still works on a locked quiz.
    assert.equal((await hadeer.c.post(`${editor}/title`, { title: 'Fractions check (v1)', rev: '0' })).status, 303);
    assert.equal((await quizRow(sql(w), W7A.QA)).title, 'Fractions check (v1)', 'the title still changes');
    await hadeer.c.post(`${editor}/title`, { title: TITLES.QA, rev: '0' });
    for (const [action, state] of [['close', 'closed'], ['reopen', 'open']] as const) {
      await amal.c.post(`${amal.list}/${W7A.QA}/${action}`, { rev: '0' });
      assert.equal((await quizRow(sql(w), W7A.QA)).state, state, action);
    }
    await hadeer.c.post(`${editor}/remove`, { rev: '0' });
    assert.notEqual((await quizRow(sql(w), W7A.QA)).removed, null, 'remove');
    await hadeer.c.post(`${editor}/restore`, { rev: '0' });
    assert.equal((await quizRow(sql(w), W7A.QA)).removed, null, 'restore');
    const copy = await hadeer.c.post(`${editor}/copy`, { rev: '0' });
    assert.equal(copy.status, 303, 'copy');
    await w.p.sql(`UPDATE quiz SET removed_at = ${AT.noon - 3_600_000} WHERE id = '${located(copy, w.p.url).split('/').pop()!.split('?')[0]}'`);
    // QB (no attempt) stays editable while open.
    const qb = await quizRow(sql(w), W7A.QB);
    assert.equal(qb.state, 'open');
    const res = await amal.c.post(`${amal.list}/${W7A.QB}/question/${QB_QUESTIONS[0].id}`, questionForm('What is 0.5 + 0.5?', ['1', '0.10'], 1, qb.rev));
    assert.equal(res.status, 303, 'QB stays editable');
    assert.equal((await quizRow(sql(w), W7A.QB)).questions[0].text, 'What is 0.5 + 0.5?');
  });

  it('W7 AT-1.5 two windows: the second save with a stale rev answers 409 quizStale, stores nothing and shows the latest version', async () => {
    const [hadeer, amal] = side;
    const first = await html(hadeer.c, `${hadeer.list}/${W7A.QB}`);
    const second = await html(amal.c, `${amal.list}/${W7A.QB}`);
    const rev = (page: string) => Number(/name="rev" value="(\d+)"/.exec(page)![1]);
    assert.equal(rev(first), rev(second), 'both windows loaded the same version');
    const qid = QB_QUESTIONS[1].id;
    assert.equal((await hadeer.c.post(`${hadeer.list}/${W7A.QB}/question/${qid}`, questionForm('First window', ['0.4', '0.35'], 1, rev(first)))).status, 303);
    const before = await quizSnapshot(sql(w));
    const res = await amal.c.post(`${amal.list}/${W7A.QB}/question/${qid}`, questionForm('Second window', ['0.4', '0.35'], 2, rev(second)));
    assert.equal(res.status, 409);
    const body = await res.text();
    assert.equal(messageOf(body), en('quizStale'));
    assert.equal(await quizSnapshot(sql(w)), before, 'nothing stored');
    assert.equal(editorQuestionsOf(body).find((q) => q.id === qid)?.text, 'First window', 'the latest version is shown');
    assert.equal(rev(body), rev(first) + 1, 'with the latest rev');
  });

  it('W7 AT-1.6 refused, nothing stored: other publisher, learner, guardian, owner 403; access ended as today; another site 403; removed, other subject or space, made-up id 404; role-gates lists every address', async () => {
    const s = w.school;
    const [hadeer, amal] = side;
    // A quiz of another space (Delta Logistics' Mathematics), reached through Mesk's address.
    await insertQuiz(sql(w), { id: 'w7-other-space', space: w.company.id, subject: w.company.math, title: 'Elsewhere', questions: QA_QUESTIONS, state: 'open', created: AT.noon - 5000 });
    const addresses = (list: string, quiz: string, publisher: boolean) => [
      ['GET', list], ['POST', list], ['GET', `${list}/${quiz}`], ['POST', `${list}/${quiz}/title`], ['POST', `${list}/${quiz}/question`],
      ['POST', `${list}/${quiz}/question/${QB_QUESTIONS[0].id}`], ['POST', `${list}/${quiz}/question/${QB_QUESTIONS[0].id}/remove`],
      ...['open', 'close', 'reopen', 'remove', 'restore', 'copy'].map((a) => ['POST', `${list}/${quiz}/${a}`]),
      ...(publisher ? [['GET', `${list}/${quiz}/results`], ['GET', `${list}/${quiz}/results/${w.ids[SALMA.username]}`]] : []),
    ] as ['GET' | 'POST', string][];
    const fields = { title: 'Refused', rev: '0', ...questionForm('Refused', ['a', 'b'], 1, 0) };
    const others = [
      { who: 'Shimaa (another publisher)', c: await as(w, SHIMAA, 'en') },
      { who: 'Salma (a learner)', c: await as(w, SALMA, 'en') },
      { who: 'Mona (a guardian)', c: await as(w, MONA, 'en') },
      { who: 'the owner', c: w.owner },
    ];
    let checked = 0;
    const before = await quizSnapshot(sql(w));
    for (const [list, publisher] of [[publisherQuizzes(s, s.math), true], [adminQuizzes(s, s.math), false]] as const) {
      for (const o of others) {
        for (const [method, path] of addresses(list, W7A.QB, publisher)) {
          const res = method === 'GET' ? await o.c.get(path) : await o.c.post(path, fields);
          await res.arrayBuffer();
          assert.equal(res.status, 403, `${o.who} ${method} ${path}`);
          checked++;
        }
      }
      // Another site: the same-origin check (403) before anything.
      const c = publisher ? hadeer.c : amal.c;
      for (const [method, path] of addresses(list, W7A.QB, publisher).filter(([m]) => m === 'POST')) {
        const res = await c.postWith(path, fields, { origin: 'https://another-site.example' });
        await res.arrayBuffer();
        assert.equal(res.status, 403, `another site ${method} ${path}`);
        checked++;
      }
      // Allowed person: removed (but Restore and the list), another subject, another space, made-up id: 404.
      for (const quiz of [W7A.QD, W7A.QG, 'w7-other-space', 'nosuchquizatall']) {
        for (const [method, path] of addresses(list, quiz, publisher).slice(2)) {
          if (quiz === W7A.QD && path.endsWith('/restore')) continue;
          const res = method === 'GET' ? await c.get(path) : await c.post(path, fields);
          await res.arrayBuffer();
          assert.equal(res.status, 404, `${publisher ? 'Hadeer' : 'Amal'} ${method} ${path}`);
          checked++;
        }
      }
    }
    assert.equal(await quizSnapshot(sql(w)), before, 'nothing stored by any refused request');
    // Access ended: today's access-ended answer (the same as the due-dates page's for the same person).
    for (const [x, who, role] of [[hadeer, HADEER, 'publisher'], [amal, ADMIN, 'admin']] as const) {
      await w.p.sql(`UPDATE membership SET ended_on = '2026-12-10' WHERE user_id = '${w.ids[who.username]}' AND space_id = '${s.id}' AND role = '${role}'`);
      const today = await x.c.get(`${x.page}/due`);
      const todayBody = await today.text();
      for (const [method, path] of addresses(x.list, W7A.QB, role === 'publisher')) {
        const res = method === 'GET' ? await x.c.get(path) : await x.c.post(path, fields);
        const body = await res.text();
        assert.equal(res.status, today.status, `${who.username} ended: ${method} ${path} answers as today`);
        assert.equal(textOf(body), textOf(todayBody), `${who.username} ended: the same page`);
        checked++;
      }
      await w.p.sql(`UPDATE membership SET ended_on = NULL WHERE user_id = '${w.ids[who.username]}' AND space_id = '${s.id}' AND role = '${role}'`);
    }
    assert.equal(await quizSnapshot(sql(w)), before, 'nothing stored');
    console.log(`AT-1.6 ${checked} refused requests checked`);
  });

  it('W7 AT-1.7 copy as a new draft: one new quiz with the same questions and every id new; QA and its results unchanged; one gate read, one quiz read, one write; 30 refused; a removed quiz 404', async () => {
    const [hadeer] = side;
    const editor = `${hadeer.list}/${W7A.QA}`;
    const results = async () => html(hadeer.c, resultsOf(hadeer.list, W7A.QA));
    const resultsBefore = await results();
    const qaBefore = await quizRow(sql(w), W7A.QA);
    const attemptsBefore = JSON.stringify(await w.p.sql(`SELECT * FROM quiz_attempt WHERE quiz_id = '${W7A.QA}' ORDER BY id`));
    const countBefore = Number((await w.p.sql('SELECT COUNT(*) AS n FROM quiz'))[0].n);
    w.p.spy!.start();
    const res = await hadeer.c.post(`${editor}/copy`, { rev: String(qaBefore.rev) });
    const log = await w.p.spy!.stop();
    assert.equal(res.status, 303);
    const gate = log.findIndex((x) => /FROM subject s WHERE s\.id = \? AND s\.space_id = \? AND s\.publisher_user_id = \?/.test(x));
    assert.ok(gate >= 0, 'the gate read was seen');
    const own = log.slice(gate);
    const reads = own.filter((x) => /^\s*(SELECT|WITH)\b/i.test(x));
    const writes = own.filter((x) => !/^\s*(SELECT|WITH)\b/i.test(x));
    assert.equal(reads.length, 2, `one gate read and one quiz read (${reads.length})`);
    assert.equal(writes.length, 1, 'one write statement');
    assert.match(writes[0], /^\s*INSERT INTO quiz /);
    const to = located(res, w.p.url);
    const id = /\/quizzes\/([a-z]+)\?quiz=copied$/.exec(to)?.[1];
    assert.ok(id, `303 to the copy's editor with quiz=copied (${to})`);
    assert.equal(Number((await w.p.sql('SELECT COUNT(*) AS n FROM quiz'))[0].n), countBefore + 1, 'one new quiz');
    const copy = await quizRow(sql(w), id);
    assert.deepEqual([copy.state, copy.title, copy.subject, copy.rev, copy.removed], ['draft', qaBefore.title, w.school.math, 0, null]);
    assert.deepEqual(copy.questions.map((q) => [q.text, q.answers.map((a) => a.text), q.answers.findIndex((a) => a.id === q.rightId)]), qaBefore.questions.map((q) => [q.text, q.answers.map((a) => a.text), q.answers.findIndex((a) => a.id === q.rightId)]), 'the same questions, answers and right answers, in order');
    const oldIds = new Set([qaBefore.id, ...qaBefore.questions.flatMap((q) => [q.id, ...q.answers.map((a) => a.id)])]);
    const newIds = [copy.id, ...copy.questions.flatMap((q) => [q.id, ...q.answers.map((a) => a.id)])];
    assert.ok(newIds.every((x) => !oldIds.has(x)) && new Set(newIds).size === newIds.length, 'every quiz, question and answer id is new');
    assert.equal(Number((await w.p.sql(`SELECT COUNT(*) AS n FROM quiz_attempt WHERE quiz_id = '${id}'`))[0].n), 0, 'no attempt copied');
    const page = await html(hadeer.c, to);
    assert.equal(statusOf(page), en('quizCopied'));
    assert.ok(editorQuestionsOf(page).every((q) => q.editable) && editorQuestionsOf(page).length === 3, 'every question is editable');
    assert.deepEqual(await quizRow(sql(w), W7A.QA), qaBefore, 'QA unchanged');
    assert.equal(JSON.stringify(await w.p.sql(`SELECT * FROM quiz_attempt WHERE quiz_id = '${W7A.QA}' ORDER BY id`)), attemptsBefore, 'its attempts unchanged');
    assert.equal(await results(), resultsBefore, 'its results page byte-identical');
    // A removed quiz: 404.
    assert.equal((await hadeer.c.post(`${hadeer.list}/${W7A.QD}/copy`, { rev: '0' })).status, 404, 'copy of a removed quiz');
  });
});
