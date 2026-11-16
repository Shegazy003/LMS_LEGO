// UX-17a (ux-plan v2, LMS wave 1, L1): every new label that names a role or a
// thing (teacher, lesson, chapter, subject, admin) comes from the space's kit,
// checked in all three kits in both languages: the teacher line, the counts,
// the empty sentences, the place, the lesson navigation's name, the chapter
// line of Next, the end sentence and the notice's detail. The label guard
// (test/guards/no-hardcoded-labels.test.ts) runs in this step too.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { SEED_KITS } from '../../src/kits/seed.ts';
import { ADMIN, COMPANY_ADMIN, SALMA, UNIVERSITY_ADMIN, activity, as, home, lessonPath, plain, subjectPath, wave1World, words, type SpaceIds, type Wave1World } from './world.ts';
import { countText } from './home.ts';
import '../guards/no-hardcoded-labels.test.ts';

const KITS = ['school', 'company', 'university'] as const;

/** Whether a page's text holds a sentence; spaces left where <bdi> isolates an inserted word do not count. */
const has = (text: string, s: string) => text.replace(/\s+/g, '').includes(s.replace(/\s+/g, ''));

/** Kit words of the other two kits that this kit does not share. */
function othersOnly(kit: (typeof KITS)[number], lang: 'ar' | 'en'): string[] {
  const own = new Set(Object.values(SEED_KITS.find((k) => k.seed === kit)!.labels[lang]));
  return SEED_KITS.filter((k) => k.seed !== kit).flatMap((k) => Object.values(k.labels[lang])).filter((x) => !own.has(x));
}

describe('UX-17a kit words on learner pages (three kits)', { concurrency: false }, () => {
  let w: Wave1World;
  before(async () => {
    w = await wave1World();
    for (const s of [w.school, w.company, w.university]) {
      const admin = await as(w, s === w.school ? ADMIN : s === w.company ? COMPANY_ADMIN : UNIVERSITY_ADMIN);
      await activity(w, true, admin, s.id);
    }
  });
  after(async () => {
    await w?.close();
  });

  for (const kit of KITS) {
    for (const lang of ['ar', 'en'] as const) {
      it(`${kit} ${lang}: each new label names the kit's own word`, async () => {
        const t = words(kit, lang);
        const s: SpaceIds = w[kit];
        const c = await as(w, SALMA, lang);
        const get = async (path: string) => {
          const res = await c.get(path);
          assert.equal(res.status, 200, path);
          return res.text();
        };
        const homeHtml = await get(home(s));
        const homeText = plain(homeHtml);
        assert.ok(has(homeText, t('teacherLine', { publisher: t('publisher'), name: 'Hadeer' })), 'the teacher line: the kit\'s publisher word');
        assert.ok(has(homeText, countText(t, 5, lang)) && has(homeText, countText(t, 1, lang)), 'the counts: the kit\'s lesson words');
        assert.ok(has(homeText, t('activityDetail')), 'the notice detail: the kit\'s lesson and admin words');
        assert.ok(t('activityDetail').includes(t('admin')) && t('activityDetail').includes(t('lesson')));

        const outline = plain(await get(subjectPath(s, s.math, 'all')));
        assert.ok(has(outline, t('noLessonsYet')) && t('noLessonsYet').includes(t('lessons')), 'the empty chapter: the kit\'s lessons word');
        assert.ok(has(outline, `${t('chapter')} `), 'the chapter word in each summary');

        const middle = await get(lessonPath(s, s.lessons['Comparing fractions']));
        const middleText = plain(middle);
        assert.ok(has(middleText, t('lessonPlace', { place: '2 / 5' })) && t('lessonPlace', { place: '2 / 5' }).startsWith(t('lesson')), 'the place: the kit\'s lesson word');
        assert.ok(has(middleText, t('chapterLine', { title: 'Decimals' })) && t('chapterLine', { title: 'Decimals' }).startsWith(t('chapter')), 'the chapter line: the kit\'s chapter word');
        assert.ok(middle.includes(`aria-label="${t('lessonNav')}"`), 'the block\'s name: the kit\'s word');
        const last = plain(await get(lessonPath(s, s.lessons['Review sheet'])));
        assert.ok(has(last, t('lastLesson', { title: 'Mathematics' })) && t('lastLesson', { title: 'Mathematics' }).includes(t('lesson')), 'the end sentence: the kit\'s lesson word');

        for (const [name, text] of [['home', homeText], ['outline', outline], ['lesson', middleText], ['last lesson', last]] as const) {
          const strays = othersOnly(kit, lang).filter((word) => new RegExp(`(?<![\\p{L}\\p{M}])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{M}])`, 'u').test(text));
          assert.deepEqual(strays, [], `${kit} ${lang} ${name}: no other kit's word`);
        }
      });
    }
  }
});
