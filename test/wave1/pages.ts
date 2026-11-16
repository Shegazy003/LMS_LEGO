// The learner pages task L1 changes (LMS wave 1), for the sweeps of UX-14a to
// UX-17a: the home, the outline (folded, all open, back from a chapter), the
// first, a middle and the last lesson, a one-lesson subject, My results and
// one result.
import type { Wave1World, SpaceIds } from './world.ts';
import { home, lessonPath, subjectPath } from './world.ts';

export function learnerPages(w: Wave1World, s: SpaceIds, result?: string): [string, string][] {
  return [
    ['home', home(s)],
    ['outline folded', subjectPath(s, s.math)],
    ['outline all open', subjectPath(s, s.math, 'all')],
    ['outline back from Decimals', subjectPath(s, s.math, s.chapters.Decimals)],
    ['first lesson', lessonPath(s, s.lessons['Adding fractions'])],
    ['middle lesson', lessonPath(s, s.lessons['Comparing fractions'])],
    ['last lesson', lessonPath(s, s.lessons['Review sheet'])],
    ['one-lesson subject', lessonPath(s, s.lessons['First book'])],
    ['My results', `/s/${s.id}/results`],
    ...(result ? [['one result', `/s/${s.id}/results/${result}`] as [string, string]] : []),
  ];
}

/** The longest made-up titles (ux-plan, UX-14a): a 120-character lesson title and an Arabic title with Latin words. */
export const LONG_LESSON = 'Comparing fractions with unlike denominators by finding the least common multiple first, then reading the larger one'.padEnd(120, '!');
export const MIXED_TITLE = 'قراءة الأعداد العشرية Decimal numbers (part 2): تمارين PDF و Excel';

/** Gives "Comparing fractions" the 120-character title and the Decimals chapter and "Reading decimals" the mixed one. */
export async function longTitles(w: Wave1World, s: SpaceIds): Promise<void> {
  await w.p.sql(`UPDATE lesson SET title = '${LONG_LESSON}' WHERE id = '${s.lessons['Comparing fractions']}'`);
  await w.p.sql(`UPDATE lesson SET title = '${MIXED_TITLE}' WHERE id = '${s.lessons['Reading decimals']}'`);
  await w.p.sql(`UPDATE chapter SET title = '${MIXED_TITLE}' WHERE id = '${s.chapters.Decimals}'`);
}
