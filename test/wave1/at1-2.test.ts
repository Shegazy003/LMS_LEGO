// AT-1.2 (product-contract v2, LMS wave 1, L1, section 4.1 and 4.2): each card
// shows the subject title as a link to the subject page; the teacher line
// "<publisher word>: <display name>" (never a username), left out without a
// publisher; the lesson count; and "Start: <first lesson title>" to the
// outline's first lesson. No other lesson link and no word "new" on a card.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser } from 'playwright';
import { HADEER, SALMA, SHIMAA, browserAs, go, home, lessonPath, subjectPath, wave1World, words, type Wave1World } from './world.ts';
import { cardsOn, countText } from './home.ts';

describe('AT-1.2 each card: title link, teacher line, lesson count, and Start to the first lesson only', { concurrency: false }, () => {
  let w: Wave1World;
  let browser: Browser;
  before(async () => {
    w = await wave1World();
    browser = await chromium.launch();
  });
  after(async () => {
    await browser?.close();
    await w?.close();
  });

  it('the English sentences are exactly the contract\'s', () => {
    const t = words('school', 'en');
    assert.equal(t('teacherLine', { publisher: t('publisher'), name: 'Hadeer' }), 'Teacher: Hadeer');
    assert.equal(countText(t, 5, 'en'), '5 lessons');
    assert.equal(countText(t, 1, 'en'), '1 lesson');
    assert.equal(t('startLesson', { title: 'Adding fractions' }), 'Start: Adding fractions');
  });

  for (const lang of ['ar', 'en'] as const) {
    it(`${lang}: Mathematics, Arabic grammar and Reading club cards`, async () => {
      const t = words('school', lang);
      const s = w.school;
      const tab = await browserAs(browser, w, SALMA, { lang });
      await go(tab.page, w, home(s));
      const cards = Object.fromEntries((await cardsOn(tab.page)).map((c) => [c.title, c]));
      const expected = [
        { title: 'Mathematics', subject: s.math, teacher: 'Hadeer', count: 5, first: 'Adding fractions', lesson: s.lessons['Adding fractions'] },
        { title: 'Arabic grammar', subject: s.arabic, teacher: 'Shimaa', count: 4, first: 'The noun', lesson: s.arabicLessons['The noun'] },
        { title: 'Reading club', subject: s.reading, teacher: null, count: 1, first: 'First book', lesson: s.lessons['First book'] },
      ];
      for (const e of expected) {
        const card = cards[e.title];
        assert.ok(card, `${e.title} has a card`);
        assert.equal(card.titleHref, subjectPath(s, e.subject), `${e.title}: the title links to the subject page`);
        assert.equal(card.teacher, e.teacher ? t('teacherLine', { publisher: t('publisher'), name: e.teacher }) : null, `${e.title}: teacher line`);
        assert.equal(card.count, countText(t, e.count, lang), `${e.title}: lesson count`);
        assert.deepEqual(card.start, { text: t('startLesson', { title: e.first }), href: lessonPath(s, e.lesson) }, `${e.title}: Start`);
        assert.deepEqual(card.links.filter((h) => h.includes('/read/')), [lessonPath(s, e.lesson)], `${e.title}: no other lesson link`);
        assert.deepEqual(card.links, [subjectPath(s, e.subject), lessonPath(s, e.lesson)], `${e.title}: exactly the title and Start links`);
        assert.ok(!/(?<!\p{L})new(?!\p{L})/iu.test(card.text) && !card.text.includes('جديد'), `${e.title}: no word "new"`);
        for (const username of [HADEER.username, SHIMAA.username]) assert.ok(!card.text.includes(username), `${e.title}: never a username`);
      }
      await tab.ctx.close();
    });
  }
});
