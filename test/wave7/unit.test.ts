// LMS wave 7, W7-1 (product-contract v2 on PIL-261, sections 4.4 and 6.1;
// AT-4.1c): unit tests of the pure pieces in src/quiz.ts that both tasks share:
// the scorer buildAttempt, the random ids, the text rules, the stored shapes.
// No product runs. Made-up data only.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  QUIZ_OPTION_MAX, QUIZ_OPTIONS_MAX, QUIZ_OPTIONS_MIN, QUIZ_PER_SUBJECT_MAX, QUIZ_QUESTIONS_MAX, QUIZ_TEXT_MAX, QUIZ_TITLE_MAX,
  buildAttempt, cleanText, cleanTitle, newQuizId, parseAnswers, parseQuestions, questionFrom, readQuestion, withNewIds, type QuizQuestion,
} from '../../src/quiz.ts';
import { QA_QUESTIONS } from './world.ts';

describe('W7 buildAttempt the pure scorer (section 6.1)', () => {
  it('W7 buildAttempt scores one point per right answer; an unanswered question is wrong and has no entry', () => {
    const [a1, a2, a3] = QA_QUESTIONS;
    const built = buildAttempt(QA_QUESTIONS, { [a1.id]: a1.rightId, [a2.id]: a2.answers[0].id });
    assert.deepEqual(built, { answers_json: JSON.stringify({ [a1.id]: a1.rightId, [a2.id]: a2.answers[0].id }), right_flags: '100', score: 1, question_count: 3 });
    assert.equal(Object.hasOwn(JSON.parse(built!.answers_json), a3.id), false, 'no entry for the unanswered question');
    const all = buildAttempt(QA_QUESTIONS, Object.fromEntries(QA_QUESTIONS.map((q) => [q.id, q.rightId])));
    assert.deepEqual([all!.right_flags, all!.score], ['111', 3]);
    const none = buildAttempt(QA_QUESTIONS, {});
    assert.deepEqual([none!.right_flags, none!.score, none!.answers_json], ['000', 0, '{}']);
  });

  it('W7 buildAttempt refuses an answer id that is not that question\'s, and an unknown question id', () => {
    const [a1, a2] = QA_QUESTIONS;
    assert.equal(buildAttempt(QA_QUESTIONS, { [a1.id]: a2.rightId }), null, 'another question\'s answer');
    assert.equal(buildAttempt(QA_QUESTIONS, { 'no-such-question': a1.rightId }), null, 'an unknown question');
    assert.equal(buildAttempt(QA_QUESTIONS, { [a1.id]: 'made-up' }), null, 'a made-up answer id');
    assert.equal(buildAttempt([], {}), null, 'a quiz with no question');
  });

  it('W7 buildAttempt is pure: the same input gives the same row, and the input is not changed', () => {
    const copy = JSON.stringify(QA_QUESTIONS);
    const posted = { [QA_QUESTIONS[2].id]: QA_QUESTIONS[2].rightId };
    assert.deepEqual(buildAttempt(QA_QUESTIONS, posted), buildAttempt(QA_QUESTIONS, posted));
    assert.equal(JSON.stringify(QA_QUESTIONS), copy);
    assert.deepEqual(parseAnswers(buildAttempt(QA_QUESTIONS, posted)!.answers_json), posted, 'answers_json reads back');
  });
});

describe('W7 AT-4.1c random ids', () => {
  it('W7 AT-4.1c the same question created twice with the same right answer repeats no id, and no id equals or contains its position', () => {
    const body = { text: 'Same question', answer1: 'one', answer2: 'two', answer3: 'three', right: '2' };
    const first = readQuestion(body);
    const second = readQuestion(body);
    assert.ok(first.ok && second.ok);
    const a = questionFrom(first);
    const b = questionFrom(second);
    const ids = [a.id, b.id, ...a.answers.map((x) => x.id), ...b.answers.map((x) => x.id)];
    assert.equal(new Set(ids).size, ids.length, 'no id repeats');
    for (const q of [a, b]) {
      for (const [i, x] of q.answers.entries()) {
        for (const pos of [String(i), String(i + 1)]) assert.ok(x.id !== pos && !x.id.includes(pos), `answer ${i + 1}: id ${x.id} does not hold its position`);
      }
      assert.ok(!/\d/.test(q.id), `question id ${q.id} has no digit`);
    }
    assert.equal(a.rightId, a.answers[1].id);
    assert.notEqual(a.rightId, b.rightId, 'the right answer\'s id differs between the two');
    // At least 64 bits: 16 letters of 26 (about 75 bits); 2,000 ids never repeat.
    const many = new Set(Array.from({ length: 2000 }, newQuizId));
    assert.equal(many.size, 2000);
    assert.ok([...many].every((x) => /^[a-z]{16}$/.test(x)));
    assert.ok(16 * Math.log2(26) >= 64);
  });

  it('W7 AT-4.1c a copy keeps texts, order and right answers with every id new', () => {
    const copy = withNewIds(QA_QUESTIONS);
    assert.deepEqual(copy.map((q) => [q.text, q.answers.map((a) => a.text), q.answers.findIndex((a) => a.id === q.rightId)]), QA_QUESTIONS.map((q) => [q.text, q.answers.map((a) => a.text), q.answers.findIndex((a) => a.id === q.rightId)]));
    const old = new Set(QA_QUESTIONS.flatMap((q) => [q.id, ...q.answers.map((a) => a.id)]));
    assert.ok(copy.flatMap((q) => [q.id, ...q.answers.map((a) => a.id)]).every((x) => !old.has(x)));
  });
});

describe('W7 limits and text rules (section 4.4)', () => {
  it('W7 limits the constants of contract section 4.4', () => {
    assert.deepEqual([QUIZ_TITLE_MAX, QUIZ_TEXT_MAX, QUIZ_OPTION_MAX, QUIZ_OPTIONS_MIN, QUIZ_OPTIONS_MAX, QUIZ_QUESTIONS_MAX, QUIZ_PER_SUBJECT_MAX], [120, 500, 200, 2, 5, 20, 30]);
  });

  it('W7 limits characters are code points; control characters refused but the question\'s line break; text kept as typed after trimming', () => {
    assert.equal(cleanTitle('  ' + 'ع'.repeat(120) + ' '), 'ع'.repeat(120));
    assert.equal(cleanTitle('😀'.repeat(120)), '😀'.repeat(120), '120 code points, 240 UTF-16 units');
    assert.equal(cleanTitle('😀'.repeat(121)), null);
    assert.equal(cleanTitle('a\nb'), null, 'no line break in a title');
    assert.equal(cleanTitle('‮abc'), '‮abc', 'a format character is text, shown literally');
    assert.equal(cleanText('line one\r\nline two '), 'line one\nline two', 'a line break is stored as \\n');
    assert.equal(cleanText('tab\there'), null, 'another control character');
    assert.equal(cleanText(''), null);
    const r = readQuestion({ text: 'Q', answer1: 'a', answer2: 'a\u0007', right: '1' });
    assert.ok(!r.ok && r.error === 'quizOptionsInvalid');
  });

  it('W7 shapes questions_json reads back only items of the shape', () => {
    const q: QuizQuestion = QA_QUESTIONS[0];
    assert.deepEqual(parseQuestions(JSON.stringify([q, { nope: 1 }])), [q]);
    assert.deepEqual(parseQuestions('not json'), []);
    assert.deepEqual(parseAnswers('[1]'), {});
  });
});
