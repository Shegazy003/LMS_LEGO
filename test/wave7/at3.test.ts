// LMS wave 7, W7-2 (product-contract v2 on PIL-261, AT-3): the learner takes
// a quiz and sees the result. W7-a without W7-b; Arabic and English. Each
// labelled expectation is its own CI step (`W7 AT-3.n …`, job wave-7) and runs
// alone, so each test starts from W7-a with no attempt (resetQuizzes). Strings
// are asserted by ui.ts key. AT-3.10 joins the two tasks: the real lock, the
// results page on rows the page stored, and the race between a question save
// and a sending. Made-up data only.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '../support/http.ts';
import { makeLabel, type Label } from '../../src/labels.ts';
import { seedKit } from '../../src/kits/seed.ts';
import { attemptRow } from './attempts.ts';
import {
  ADMIN, AT, HADEER, KARIM5, NOUR6, OMAR, QA_QUESTIONS, RANA5, SALMA, W7A, as, closeWave6, fixed, insertQuiz, messageOf, publisherQuizzes, questionForm, quizSnapshot,
  resultsOf, subjectPath, textOf, wave7World, withW7d, withW7e, words, type Wave1World,
} from './world.ts';
import { attemptsOf, htmlOf, resetQuizzes, resultOf, resultPath, sectionOf, sending, takeOf, takePath } from './learner.ts';

const en = makeLabel('en', seedKit('school'));
const ar = makeLabel('ar', seedKit('school'));
const sql = (w: Wave1World) => (q: string) => w.p.sql(q);

/** Salma's sending on QA as W7-b has it: A1 right, A2 wrong, A3 no answer (1 of 3). */
const SALMA_PICKS = { 'qa-one': 'qa-one-b', 'qa-two': 'qa-two-a' };
/** Omar C's: all right (3 of 3). */
const OMAR_PICKS = { 'qa-one': 'qa-one-b', 'qa-two': 'qa-two-d', 'qa-three': 'qa-three-a' };

/** Every quiz string a learner page of this task draws, in one language. */
function expectText(t: Label) {
  return {
    notTaken: (n: number) => t('quizNotTaken', { n: String(n) }),
    taken: (score: number, total: number) => t('quizTakenScore', { score: String(score), total: String(total) }),
    score: (score: number, total: number) => t('quizScoreLine', { score: String(score), total: String(total) }),
  };
}

describe('W7 AT-3 the learner takes a quiz and sees the result (W7-a, no W7-b)', { concurrency: false }, () => {
  let w: Wave1World;
  const people: Record<string, Client> = {};
  before(async () => {
    ({ w } = await wave7World());
    for (const [name, p] of [['salma', SALMA], ['omar', OMAR], ['rana', RANA5], ['karim', KARIM5], ['nour', NOUR6], ['amal', ADMIN], ['hadeer', HADEER]] as const) people[name] = await as(w, p, 'en');
  });
  after(() => closeWave6(w));

  it('W7 AT-3.1 subject page: the section after the announcements and before the outline, QA not taken, no draft, closed-untaken or removed quiz; QG for Karim Test, who gets 403 on QA; no section without a quiz to list', async () => {
    await resetQuizzes(w);
    const s = w.school;
    for (const lang of ['en', 'ar'] as const) {
      const t = lang === 'en' ? en : ar;
      const salma = lang === 'en' ? people.salma : await as(w, SALMA, 'ar');
      const page = await htmlOf(salma, subjectPath(s, s.math));
      const sec = sectionOf(page);
      assert.ok(sec, `${lang}: the section id="quizzes"`);
      assert.equal(sec.heading, t('quizSectionTitle'), `${lang}: quizSectionTitle`);
      assert.deepEqual(sec.items, [{ href: takePath(s, W7A.QA), title: 'Fractions check', meta: expectText(t).notTaken(3) }], `${lang}: QA with quizNotTaken; not QB (draft), QC (closed, not taken), QD (removed)`);
      assert.equal(sec.fold, null, `${lang}: no fold with one item`);
      const outline = page.indexOf('<div id="outline">');
      assert.ok(sec.at < outline, `${lang}: before the outline`);
      const ann = page.indexOf('id="announcements"');
      if (ann >= 0) assert.ok(ann < sec.at, `${lang}: after wave 5's announcements`);
      if (lang === 'ar') await as(w, SALMA, 'en');
    }
    // Karim Test reads Arabic grammar only: QG there; QA's addresses give the subject's 403.
    const grammar = sectionOf(await htmlOf(people.karim, subjectPath(s, s.arabic)));
    assert.deepEqual(grammar?.items.map((i) => i.title), ['جمع التكسير'], 'Arabic grammar shows QG to Karim Test');
    const before = await quizSnapshot(sql(w));
    const refusal = await people.karim.get(subjectPath(s, s.math));
    assert.equal(refusal.status, 403);
    const refused = await refusal.text();
    for (const res of [await people.karim.get(takePath(s, W7A.QA)), await people.karim.get(resultPath(s, W7A.QA)), await people.karim.post(takePath(s, W7A.QA), sending(0, SALMA_PICKS))]) {
      assert.equal(res.status, 403, 'Karim Test: the subject\'s 403');
      assert.equal(await res.text(), refused, 'the same page as the subject\'s own refusal');
    }
    assert.equal(await quizSnapshot(sql(w)), before, 'nothing stored');
    // Only draft, closed-untaken or removed quizzes: no section at all.
    await w.p.sql(`UPDATE quiz SET state = 'closed' WHERE id = '${W7A.QG}'`);
    const none = await htmlOf(people.karim, subjectPath(s, s.arabic));
    assert.equal(sectionOf(none), null, 'no section');
    assert.ok(!none.includes('id="quizzes"') && !none.includes(en('quizSectionTitle')), 'no quiz markup or string');
    await w.p.sql(`UPDATE quiz SET state = 'open' WHERE id = '${W7A.QG}'`);
  });

  it('W7 AT-3.2 take and send: the take page (title, quizTakeHelp, one fieldset per question, required radios, quizSubmit); sending A1 right, A2 wrong, A3 none stores one attempt and answers 303 to the result', async () => {
    await resetQuizzes(w);
    const s = w.school;
    for (const lang of ['ar', 'en'] as const) {
      const t = lang === 'en' ? en : ar;
      const c = lang === 'en' ? people.salma : await as(w, SALMA, 'ar');
      const take = takeOf(await htmlOf(c, takePath(s, W7A.QA)));
      assert.ok(take, `${lang}: the take form`);
      assert.equal(take.title, 'Fractions check');
      assert.ok(take.titleInBdi, 'the title in <bdi>');
      assert.equal(take.help, t('quizTakeHelp', { n: '3' }), `${lang}: quizTakeHelp`);
      assert.equal(take.submit, t('quizSubmit'), `${lang}: quizSubmit`);
      assert.equal(take.action, takePath(s, W7A.QA), 'the form posts to the take address');
      assert.equal(take.rev, 0);
      assert.deepEqual(take.questions.map((q) => q.legend), QA_QUESTIONS.map((q, i) => `${t('quizQuestionHeading', { n: String(i + 1) })}: ${q.text}`), `${lang}: legend = heading: text`);
      assert.deepEqual(take.questions.map((q) => q.choices.map((c2) => [c2.name, c2.value, c2.text])), QA_QUESTIONS.map((q) => q.answers.map((a) => [`q-${q.id}`, a.id, a.text])), 'every answer a radio of its question, in the teacher\'s order');
      assert.deepEqual(take.checked, {}, 'nothing checked');
      if (lang === 'ar') await as(w, SALMA, 'en');
    }
    const before = await w.p.sql('SELECT COUNT(*) AS n FROM quiz_attempt');
    const res = await people.salma.post(takePath(s, W7A.QA), sending(0, SALMA_PICKS));
    assert.equal(res.status, 303);
    assert.equal((res.headers.get('location') ?? '').replace(w.p.url, ''), resultPath(s, W7A.QA), '303 to the result');
    const rows = await attemptsOf(w, W7A.QA);
    assert.equal(rows.length, Number(before[0].n) + 1, 'one attempt stored');
    const r = rows[0];
    assert.deepEqual([r.learner_user_id, Number(r.score), Number(r.question_count), Number(r.rev), JSON.parse(String(r.answers_json)), r.right_flags], [w.ids[SALMA.username], 1, 3, 0, SALMA_PICKS, '100'], 'answers, score 1 of 3, the quiz\'s rev');
    assert.equal(new Date(Number(r.sent_at)).toISOString().slice(0, 10), '2026-12-10', 'the sent time (the fixed clock)');
  });

  it('W7 AT-3.3 result: quizResultTitle, quizScoreLine 1 of 3, quizSentOn 2026-12-10, each question with every answer, chosen and right marked, the verdict in words; the subject page shows quizTakenScore linking to the result', async () => {
    await resetQuizzes(w);
    const s = w.school;
    assert.equal((await people.salma.post(takePath(s, W7A.QA), sending(0, SALMA_PICKS))).status, 303);
    for (const lang of ['ar', 'en'] as const) {
      const t = lang === 'en' ? en : ar;
      const c = lang === 'en' ? people.salma : await as(w, SALMA, 'ar');
      const r = resultOf(await htmlOf(c, resultPath(s, W7A.QA)));
      assert.equal(r.title, t('quizResultTitle', { title: 'Fractions check' }), `${lang}: quizResultTitle`);
      assert.equal(r.score, expectText(t).score(1, 3), `${lang}: quizScoreLine`);
      assert.equal(r.sent, t('quizSentOn', { date: '2026-12-10' }), `${lang}: quizSentOn`);
      assert.ok(r.dateLtr, 'the date in dir="ltr", Latin digits');
      assert.equal(r.status, null, 'no status line');
      assert.deepEqual(r.sections.map((x) => x.heading), ['1', '2', '3'].map((n) => t('quizQuestionHeading', { n })));
      assert.deepEqual(r.sections.map((x) => x.verdict), [t('quizRight'), t('quizWrong'), t('quizNoAnswer')], `${lang}: the verdicts in words`);
      assert.deepEqual(r.sections.map((x) => x.answers), [
        ['2/6', `✓ 3/4 · ${t('quizChosen')} · ${t('quizRightMark')}`, '1/8'],
        [`✗ 1/5 · ${t('quizChosen')}`, '1/4', '1/3', `✓ 1/2 · ${t('quizRightMark')}`],
        [`✓ True · ${t('quizRightMark')}`, 'False'],
      ], `${lang}: every answer, the chosen and the right marked`);
      assert.deepEqual(r.back, { href: subjectPath(s, s.math), text: t('quizBackToSubject', { subjectTitle: 'Mathematics' }) }, `${lang}: quizBackToSubject`);
      const sec = sectionOf(await htmlOf(c, subjectPath(s, s.math)));
      assert.deepEqual(sec?.items, [{ href: resultPath(s, W7A.QA), title: 'Fractions check', meta: expectText(t).taken(1, 3) }], `${lang}: quizTakenScore linking to the result`);
      if (lang === 'ar') await as(w, SALMA, 'en');
    }
  });

  it('W7 AT-3.4 once only: the take address answers 303 to the result; a second POST stores nothing and answers 303 with quizAlreadySent; the first score counts; the result before any sending answers 303 to the take page', async () => {
    await resetQuizzes(w);
    const s = w.school;
    // Before sending: the result address sends to the take page.
    const early = await people.salma.get(resultPath(s, W7A.QA));
    assert.equal(early.status, 303);
    assert.equal((early.headers.get('location') ?? '').replace(w.p.url, ''), takePath(s, W7A.QA));
    const stale = takeOf(await htmlOf(people.salma, takePath(s, W7A.QA)))!;
    assert.equal((await people.salma.post(takePath(s, W7A.QA), sending(stale.rev, SALMA_PICKS))).status, 303);
    const take = await people.salma.get(takePath(s, W7A.QA));
    assert.equal(take.status, 303);
    assert.equal((take.headers.get('location') ?? '').replace(w.p.url, ''), resultPath(s, W7A.QA), 'the take address now sends to the result');
    const stored = await quizSnapshot(sql(w));
    // A second sending, from the stale page, with every answer right.
    const again = await people.salma.post(takePath(s, W7A.QA), sending(stale.rev, OMAR_PICKS));
    assert.equal(again.status, 303);
    assert.equal((again.headers.get('location') ?? '').replace(w.p.url, ''), `${resultPath(s, W7A.QA)}?quiz=already`);
    assert.equal(await quizSnapshot(sql(w)), stored, 'nothing stored');
    const r = resultOf(await htmlOf(people.salma, `${resultPath(s, W7A.QA)}?quiz=already`));
    assert.equal(r.status, en('quizAlreadySent'), 'quizAlreadySent');
    assert.equal(r.score, expectText(en).score(1, 3), 'the first sending\'s score');
  });

  it('W7 AT-3.5 changes while taking: (a) closed meanwhile 409 quizNowClosed; (b) changed meanwhile 409 quizChanged, the new version, fitting answers kept, then stored; (c) a foreign or unknown id 400 quizAnswerInvalid; (d) closed after sending keeps the result; (e) a session ended meanwhile gets the signed-out answer', async () => {
    await resetQuizzes(w);
    const s = w.school;
    const list = publisherQuizzes(s, s.math);
    const editor = `${list}/${W7A.QA}`;
    // (a) Omar C loads QA; Hadeer closes it; his sending is refused.
    const loaded = takeOf(await htmlOf(people.omar, takePath(s, W7A.QA)))!;
    assert.equal((await people.hadeer.post(`${editor}/close`, { rev: '0' })).status, 303);
    let before = await quizSnapshot(sql(w));
    let res = await people.omar.post(takePath(s, W7A.QA), sending(loaded.rev, OMAR_PICKS));
    assert.equal(res.status, 409, '(a) 409');
    assert.equal(messageOf(await res.text()), en('quizNowClosed'), '(a) quizNowClosed');
    assert.equal(await quizSnapshot(sql(w)), before, '(a) nothing stored');
    assert.equal((await people.hadeer.post(`${editor}/reopen`, { rev: '0' })).status, 303);
    // (b) Salma loads QA; Hadeer changes question 2 to three answers (the 4th, Salma's choice there, is gone).
    const salmaLoaded = takeOf(await htmlOf(people.salma, takePath(s, W7A.QA)))!;
    assert.equal((await people.hadeer.post(`${editor}/question/qa-two`, questionForm('Which fraction is the smallest?', ['1/5', '1/4', '1/3'], 1, 0))).status, 303);
    before = await quizSnapshot(sql(w));
    res = await people.salma.post(takePath(s, W7A.QA), sending(salmaLoaded.rev, { 'qa-one': 'qa-one-b', 'qa-two': 'qa-two-d', 'qa-three': 'qa-three-a' }));
    assert.equal(res.status, 409, '(b) 409');
    const redraw = takeOf(await res.text())!;
    assert.equal(redraw.message, en('quizChanged'), '(b) quizChanged');
    assert.equal(redraw.rev, 1, '(b) the new version');
    assert.equal(redraw.questions[1].text, 'Which fraction is the smallest?', '(b) the new question 2');
    assert.equal(redraw.questions[1].choices.length, 3);
    assert.deepEqual(redraw.checked, { 'qa-one': 'qa-one-b', 'qa-three': 'qa-three-a' }, '(b) the answers that still fit stay checked');
    assert.equal(await quizSnapshot(sql(w)), before, '(b) nothing stored');
    // (c) An answer of another question, an unknown question: 400.
    for (const picks of [{ 'qa-one': 'qa-two-a' }, { 'qa-one': 'qa-one-b', 'no-such-question': 'x' }, { 'qa-one': 'qa-one-z' }]) {
      res = await people.salma.post(takePath(s, W7A.QA), sending(1, picks));
      assert.equal(res.status, 400, `(c) ${JSON.stringify(picks)}: 400`);
      assert.equal(messageOf(await res.text()), en('quizAnswerInvalid'), '(c) quizAnswerInvalid');
      assert.equal(await quizSnapshot(sql(w)), before, '(c) nothing stored');
    }
    // (b) Sending again at the new version stores normally.
    res = await people.salma.post(takePath(s, W7A.QA), sending(1, { 'qa-one': 'qa-one-b', 'qa-two': 'qa-two-a' }));
    assert.equal(res.status, 303, '(b) sending again stores');
    const stored = await attemptsOf(w, W7A.QA);
    assert.deepEqual(stored.map((r) => [Number(r.rev), Number(r.score)]), [[1, 2]], '(b) stored at rev 1: question 1 right, the new question 2 right (1/5)');
    // (d) Closing QA after Salma sent: her result and score stay, QA stays on her subject page; Nour Test no longer sees it.
    const result = await htmlOf(people.salma, resultPath(s, W7A.QA));
    assert.ok(sectionOf(await htmlOf(people.nour, subjectPath(s, s.math)))?.items.some((i) => i.title === 'Fractions check'), '(d) Nour Test sees QA while open');
    assert.equal((await people.hadeer.post(`${editor}/close`, { rev: '1' })).status, 303);
    assert.equal(await htmlOf(people.salma, resultPath(s, W7A.QA)), result, '(d) her result unchanged');
    assert.deepEqual(sectionOf(await htmlOf(people.salma, subjectPath(s, s.math)))?.items.map((i) => [i.title, i.meta]), [['Fractions check', expectText(en).taken(2, 3)]], '(d) QA stays with her score');
    assert.equal(sectionOf(await htmlOf(people.nour, subjectPath(s, s.math))), null, '(d) Nour Test no longer sees QA (no other quiz to list)');
    // (e) Omar C loads QG? No: Omar loads QA reopened; his session is gone when he sends.
    assert.equal((await people.hadeer.post(`${editor}/reopen`, { rev: '1' })).status, 303);
    const omarLoaded = takeOf(await htmlOf(people.omar, takePath(s, W7A.QA)))!;
    const signedOut = new Client(w.p.url);
    before = await quizSnapshot(sql(w));
    const lost = await signedOut.post(takePath(s, W7A.QA), sending(omarLoaded.rev, OMAR_PICKS));
    const today = await new Client(w.p.url).post(`/s/${s.id}/read/${s.lessons['Adding fractions']}/done`, { state: 'done' });
    assert.deepEqual([lost.status, lost.headers.get('location')], [today.status, today.headers.get('location')], '(e) today\'s signed-out answer');
    assert.equal(await quizSnapshot(sql(w)), before, '(e) nothing stored');
    const again = await as(w, OMAR, 'en');
    assert.deepEqual(takeOf(await htmlOf(again, takePath(s, W7A.QA)))!.checked, {}, '(e) after signing in no answer is checked');
  });

  it('W7 AT-3.6 everyone with their own result: Omar C and Rana Test (class only) each take QA and see only their own; Salma\'s result never shows another\'s answers; the address carries no learner id', async () => {
    await resetQuizzes(w);
    const s = w.school;
    assert.equal((await people.salma.post(takePath(s, W7A.QA), sending(0, SALMA_PICKS))).status, 303);
    const salmaResult = await htmlOf(people.salma, resultPath(s, W7A.QA));
    assert.equal((await people.omar.post(takePath(s, W7A.QA), sending(0, OMAR_PICKS))).status, 303);
    assert.equal((await people.rana.post(takePath(s, W7A.QA), sending(0, { 'qa-one': 'qa-one-a', 'qa-three': 'qa-three-a' }))).status, 303);
    assert.equal(resultOf(await htmlOf(people.omar, resultPath(s, W7A.QA))).score, expectText(en).score(3, 3), 'Omar C: his own 3 of 3');
    assert.equal(resultOf(await htmlOf(people.rana, resultPath(s, W7A.QA))).score, expectText(en).score(1, 3), 'Rana Test: her own 1 of 3');
    assert.equal(await htmlOf(people.salma, resultPath(s, W7A.QA)), salmaResult, 'Salma\'s result is unchanged by the others\' sendings');
    for (const [who, c] of [['Salma', people.salma], ['Omar C', people.omar], ['Rana Test', people.rana]] as const) {
      const page = await htmlOf(c, resultPath(s, W7A.QA));
      for (const name of [SALMA, OMAR, RANA5].map((p) => p.display_name).filter((n) => n !== { Salma: SALMA, 'Omar C': OMAR, 'Rana Test': RANA5 }[who].display_name)) {
        assert.ok(!page.includes(name), `${who}'s result: no other learner's name (${name})`);
      }
    }
    assert.ok(!resultPath(s, W7A.QA).includes(w.ids[SALMA.username]), 'the result address carries no learner id');
  });

  it('W7 AT-3.7 access and removal: a removed QA leaves the subject page, its addresses 404, Restore brings the result back unchanged; unpublished, unassigned or ended access gives the subject\'s answer, each returning with access', async () => {
    await resetQuizzes(w);
    const s = w.school;
    const editor = `${publisherQuizzes(s, s.math)}/${W7A.QA}`;
    assert.equal((await people.salma.post(takePath(s, W7A.QA), sending(0, SALMA_PICKS))).status, 303);
    const result = await htmlOf(people.salma, resultPath(s, W7A.QA));
    assert.equal((await people.hadeer.post(`${editor}/remove`, { rev: '0' })).status, 303);
    assert.equal(sectionOf(await htmlOf(people.salma, subjectPath(s, s.math))), null, 'QA leaves the subject page');
    for (const c of [people.salma, people.omar]) {
      assert.equal((await c.get(takePath(s, W7A.QA))).status, 404, 'take: 404');
      assert.equal((await c.get(resultPath(s, W7A.QA))).status, 404, 'result: 404');
      assert.equal((await c.post(takePath(s, W7A.QA), sending(0, OMAR_PICKS))).status, 404, 'send: 404');
    }
    assert.equal((await people.hadeer.post(`${publisherQuizzes(s, s.math)}/${W7A.QA}/restore`, { rev: '0' })).status, 303);
    assert.equal(await htmlOf(people.salma, resultPath(s, W7A.QA)), result, 'Restore: the result unchanged');
    const salma = w.ids[SALMA.username];
    const answerOf = async (path: string) => { const r = await people.salma.get(path); return [r.status, textOf(await r.text())]; };
    const check = async (what: string) => {
      const subject = await answerOf(subjectPath(s, s.math));
      assert.notEqual(subject[0], 200, `${what}: the subject is refused`);
      for (const path of [takePath(s, W7A.QA), resultPath(s, W7A.QA)]) assert.deepEqual(await answerOf(path), subject, `${what}: ${path} gives the subject's answer`);
      const r = await people.salma.post(takePath(s, W7A.QA), sending(0, OMAR_PICKS));
      assert.equal(r.status, subject[0], `${what}: the sending too`);
    };
    const back = async (what: string) => assert.equal(await htmlOf(people.salma, resultPath(s, W7A.QA)), result, `${what}: back with access`);
    await w.p.sql(`UPDATE subject SET is_published = 0 WHERE id = '${s.math}'`);
    await check('unpublished');
    await w.p.sql(`UPDATE subject SET is_published = 1 WHERE id = '${s.math}'`);
    await back('published again');
    const kept = await w.p.sql(`SELECT * FROM group_member WHERE user_id = '${salma}' AND space_id = '${s.id}'`);
    const direct = await w.p.sql(`SELECT * FROM subject_access WHERE user_id = '${salma}' AND subject_id = '${s.math}'`);
    await w.p.sql(`DELETE FROM group_member WHERE user_id = '${salma}' AND space_id = '${s.id}'`);
    await w.p.sql(`DELETE FROM subject_access WHERE user_id = '${salma}' AND subject_id = '${s.math}'`);
    await check('unassigned');
    for (const g of kept) await w.p.sql(`INSERT INTO group_member (space_id, group_id, user_id) VALUES ('${g.space_id}', '${g.group_id}', '${g.user_id}')`);
    for (const a of direct) await w.p.sql(`INSERT INTO subject_access (id, space_id, subject_id, user_id) VALUES ('${a.id}', '${a.space_id}', '${a.subject_id}', '${a.user_id}')`);
    await back('assigned again');
    await w.p.sql(`UPDATE membership SET ended_on = '2026-12-10' WHERE user_id = '${salma}' AND space_id = '${s.id}'`);
    await check('access ended');
    await w.p.sql(`UPDATE membership SET ended_on = NULL WHERE user_id = '${salma}' AND space_id = '${s.id}'`);
    await back('access restored');
  });

  it('W7 AT-3.8 staff on the learner address: Amal and Hadeer see the same section as Nour Test on their own /learn page; their GET of the take address answers 303 to the preview, their POST 403, nothing stored', async () => {
    await resetQuizzes(w);
    const s = w.school;
    const nour = sectionOf(await htmlOf(people.nour, subjectPath(s, s.math)));
    assert.ok(nour, 'Nour Test sees the section');
    for (const [who, c] of [['Amal', people.amal], ['Hadeer', people.hadeer]] as const) {
      assert.equal(sectionOf(await htmlOf(c, subjectPath(s, s.math)))?.html, nour.html, `${who}: the same section as Nour Test`);
      for (const quiz of [W7A.QA, W7A.QB]) {
        const res = await c.get(takePath(s, quiz));
        assert.equal(res.status, 303, `${who} GET ${quiz}`);
        assert.equal((res.headers.get('location') ?? '').replace(w.p.url, ''), `/s/${s.id}/preview/quiz/${quiz}`, `${who}: to the preview`);
      }
      const before = await quizSnapshot(sql(w));
      assert.equal((await c.post(takePath(s, W7A.QA), sending(0, OMAR_PICKS))).status, 403, `${who} POST: 403`);
      assert.equal(await quizSnapshot(sql(w)), before, `${who}: nothing stored`);
    }
  });

  it('W7 AT-3.9 kits and languages: in the Company and University kits every new string is the ui.ts value with the kit\'s words; in Arabic the Arabic value; dates YYYY-MM-DD in Latin digits inside dir="ltr"', async () => {
    await resetQuizzes(w);
    for (const space of [w.company, w.university]) {
      const id = `w7-kit-${space.kit}`;
      await w.p.sql(`DELETE FROM quiz_attempt WHERE quiz_id = '${id}'`);
      await w.p.sql(`DELETE FROM quiz WHERE id = '${id}'`);
      await insertQuiz(sql(w), { id, space: space.id, subject: space.math, title: 'Kit quiz', questions: QA_QUESTIONS, state: 'open', created: AT.noon - 60_000 });
      for (const lang of ['ar', 'en'] as const) {
        const t = words(space.kit, lang);
        const c = await as(w, SALMA, lang);
        await w.p.sql(`DELETE FROM quiz_attempt WHERE quiz_id = '${id}'`);
        const page = await htmlOf(c, subjectPath(space, space.math));
        assert.ok(/<html lang="(ar|en)" dir="(rtl|ltr)"/.test(page) && page.includes(`lang="${lang}"`), `${space.kit} ${lang}: lang`);
        const sec = sectionOf(page)!;
        assert.deepEqual([sec.heading, sec.items.map((i) => i.meta)], [t('quizSectionTitle'), [t('quizNotTaken', { n: '3' })]], `${space.kit} ${lang}: the section`);
        const take = takeOf(await htmlOf(c, takePath(space, id)))!;
        assert.deepEqual([take.help, take.submit, take.questions[0].legend.split(':')[0]], [t('quizTakeHelp', { n: '3' }), t('quizSubmit'), t('quizQuestionHeading', { n: '1' })], `${space.kit} ${lang}: the take page`);
        assert.equal((await c.post(takePath(space, id), sending(0, SALMA_PICKS))).status, 303);
        const r = resultOf(await htmlOf(c, resultPath(space, id)));
        assert.deepEqual([r.title, r.score, r.sent, r.dateLtr, r.sections.map((x) => x.verdict), r.back?.text], [
          t('quizResultTitle', { title: 'Kit quiz' }), t('quizScoreLine', { score: '1', total: '3' }), t('quizSentOn', { date: '2026-12-10' }), true,
          [t('quizRight'), t('quizWrong'), t('quizNoAnswer')], t('quizBackToSubject', { subjectTitle: 'Mathematics' }),
        ], `${space.kit} ${lang}: the result page`);
        assert.deepEqual(sectionOf(await htmlOf(c, subjectPath(space, space.math)))!.items.map((i) => i.meta), [t('quizTakenScore', { score: '1', total: '3' })], `${space.kit} ${lang}: quizTakenScore`);
      }
    }
    await as(w, SALMA, 'en');
  });

  it('W7 AT-3.10 the two tasks joined: (a) the real lock after a real send; (b) the results page on rows the page stored equals W7-b\'s; (c) the race between a question save and a sending, exactly one stored each way', async () => {
    await resetQuizzes(w);
    const s = w.school;
    const list = publisherQuizzes(s, s.math);
    const editor = `${list}/${W7A.QA}`;
    // (a) Before: QA editable with quizOpenHelp; after Salma's real send: locked.
    assert.ok((await htmlOf(people.hadeer, editor)).includes(`<p class="quiz-help quiz-open-help">${en('quizOpenHelp')}</p>`), '(a) quizOpenHelp before');
    assert.equal((await people.salma.post(takePath(s, W7A.QA), sending(0, SALMA_PICKS))).status, 303);
    const locked = await htmlOf(people.hadeer, editor);
    assert.ok(locked.includes('id="quiz-locked"') && locked.includes(en('quizLockedNote')), '(a) quizLockedNote');
    assert.ok(!locked.includes('quiz-open-help'), '(a) no quizOpenHelp');
    const before = await quizSnapshot(sql(w));
    for (const [what, path, fields] of [
      ['save', `${editor}/question/qa-one`, questionForm('Changed', ['a', 'b'], 1, 0)],
      ['add', `${editor}/question`, questionForm('New', ['a', 'b'], 1, 0)],
      ['remove', `${editor}/question/qa-one/remove`, { rev: '0' }],
    ] as const) {
      const res = await people.hadeer.post(path, fields);
      assert.equal(res.status, 409, `(a) ${what}: 409`);
      assert.equal(messageOf(await res.text()), en('quizLocked'), `(a) ${what}: quizLocked`);
    }
    assert.equal(await quizSnapshot(sql(w)), before, '(a) nothing stored');
    // (b) Omar C sends too; the results page passes AT-2.1's assertions; each stored row equals attempts.ts's but for id and sent_at.
    assert.equal((await people.omar.post(takePath(s, W7A.QA), sending(0, OMAR_PICKS))).status, 303);
    const results = await htmlOf(people.hadeer, resultsOf(list, W7A.QA));
    assert.equal(textOf(/<caption>([\s\S]*?)<\/caption>/.exec(results)![1]), en('quizResultsCount', { n: '2' }), '(b) quizResultsCount (2)');
    const rows = [...results.matchAll(/<tr><td data-label="[^"]+"><a class="quiz-name" href="[^"]+"><bdi>([\s\S]*?)<\/bdi><\/a>[\s\S]*?<\/td>\s*<td data-label="[^"]+">([\s\S]*?)<\/td><td data-label="[^"]+">([\s\S]*?)<\/td><\/tr>/g)].map((m) => [textOf(m[1]), textOf(m[2]), textOf(m[3])]);
    assert.deepEqual(rows, [[OMAR.display_name, en('quizScoreCell', { score: '3', total: '3' }), '2026-12-10'], [SALMA.display_name, en('quizScoreCell', { score: '1', total: '3' }), '2026-12-10']], '(b) the table by name');
    const stats = [...(/<ul id="quiz-stats" class="quiz-stats">([\s\S]*?)<\/ul>/.exec(results)?.[1] ?? '').matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => textOf(m[1]));
    assert.deepEqual(stats, [['1', '2'], ['2', '1'], ['3', '1']].map(([n, right]) => en('quizQuestionStat', { n, right, all: '2' })), '(b) the per-question summary');
    for (const [who, picks] of [[SALMA, SALMA_PICKS], [OMAR, OMAR_PICKS]] as const) {
      const row = (await attemptsOf(w, W7A.QA)).find((r) => r.learner_user_id === w.ids[who.username])!;
      const built = attemptRow(QA_QUESTIONS, picks);
      assert.deepEqual([row.space_id, row.quiz_id, Number(row.rev), row.answers_json, row.right_flags, Number(row.score), Number(row.question_count)], [s.id, W7A.QA, 0, built.answers_json, built.right_flags, built.score, built.question_count], `(b) ${who.display_name}: the row attempts.ts builds`);
    }
    // (c) The race on a fresh quiz with one question and no attempt, each run on its own copy.
    const one = (id: string) => [fixed(`${id}-q`, 'Is seven odd?', ['Yes', 'No'], 1)];
    const fresh = async (id: string) => insertQuiz(sql(w), { id, space: s.id, subject: s.math, title: `Race ${id}`, questions: one(id), state: 'open', created: AT.noon - 30_000 });
    const save = (id: string) => people.hadeer.post(`${list}/${id}/question/${id}-q`, questionForm('Is seven even?', ['Yes', 'No'], 2, 0));
    const send = (id: string) => people.salma.post(takePath(s, id), sending(0, { [`${id}-q`]: `${id}-q-a` }));
    const outcome = async (id: string, saved: Response, sent: Response) => {
      const stored = (await w.p.sql(`SELECT rev FROM quiz WHERE id = '${id}'`))[0];
      const attempts = (await w.p.sql(`SELECT COUNT(*) AS n FROM quiz_attempt WHERE quiz_id = '${id}'`))[0];
      const savedStored = Number(stored.rev) === 1;
      const sentStored = Number(attempts.n) === 1;
      assert.ok(savedStored !== sentStored, `(c) ${id}: exactly one of them is stored (save ${savedStored}, send ${sentStored})`);
      if (savedStored) {
        assert.equal(saved.status, 303, `(c) ${id}: the save stored`);
        assert.equal(sent.status, 409, `(c) ${id}: the send 409`);
        assert.equal(takeOf(await sent.text())!.message, en('quizChanged'), `(c) ${id}: quizChanged`);
      } else {
        assert.equal(sent.status, 303, `(c) ${id}: the send stored`);
        assert.equal(saved.status, 409, `(c) ${id}: the save 409`);
        assert.equal(messageOf(await saved.text()), en('quizLocked'), `(c) ${id}: quizLocked`);
      }
      return savedStored ? 'save' : 'send';
    };
    const r1 = await fresh('w7-race-a');
    const s1 = await save(r1);
    assert.equal(await outcome(r1, s1, await send(r1)), 'save', '(c) save-then-send: the save');
    const r2 = await fresh('w7-race-b');
    const t2 = await send(r2);
    assert.equal(await outcome(r2, await save(r2), t2), 'send', '(c) send-then-save: the send');
    const r3 = await fresh('w7-race-c');
    const [s3, t3] = await Promise.all([save(r3), send(r3)]);
    await outcome(r3, s3, t3);
  });
});

describe('W7 AT-3.1 at W7-e: QL first, then 4 taken, the other 25 in the closed fold quizMoreTitle (25)', { concurrency: false }, () => {
  let w: Wave1World;
  before(async () => {
    ({ w } = await wave7World());
    await withW7d(w);
    await withW7e(w);
  });
  after(() => closeWave6(w));

  it('W7 AT-3.1 W7-e: Salma\'s section lists QL first (open, not taken), then 4 taken quizzes, and the other 25 inside the closed native fold', async () => {
    const s = w.school;
    const salma = await as(w, SALMA, 'en');
    const sec = sectionOf(await htmlOf(salma, subjectPath(s, s.math)))!;
    assert.equal(sec.items.length, 5, 'five items in the list');
    assert.equal(sec.items[0].href, takePath(s, 'w7d-ql'), 'QL first');
    assert.equal(sec.items[0].meta, en('quizNotTaken', { n: '20' }));
    assert.ok(sec.items.slice(1).every((i) => i.meta === en('quizTakenScore', { score: '1', total: '1' }) && i.href.endsWith('/result')), 'then 4 taken');
    assert.ok(sec.fold, 'the fold');
    assert.equal(sec.fold.open, false, 'closed by default');
    assert.equal(sec.fold.summary, en('quizMoreTitle', { n: '25' }), 'quizMoreTitle (25)');
    assert.equal(sec.fold.items.length, 25);
    const ids = (await w.p.sql(`SELECT id FROM quiz WHERE subject_id = '${s.math}' AND removed_at IS NULL AND id <> 'w7d-ql' ORDER BY created_at, id`)).map((r) => String(r.id));
    assert.deepEqual([...sec.items.slice(1), ...sec.fold.items].map((i) => i.href), ids.map((id) => resultPath(s, id)), 'taken quizzes in creation order');
  });
});
