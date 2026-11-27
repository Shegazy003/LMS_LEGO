// LMS redesign wave R1a (product-contract v2 on PIL-322, S12, S13): what the
// budgets measure, the same way on d1a5ae3 (the recorded baseline) and on the
// candidate: in the seeded world, signed in as سلمى, the D1 statements one GET
// runs (the in-process statement spy around the D1 binding) and the bytes of
// its HTML, for the learner home, the subject page (الرياضيات) and a lesson page.
//
// Record the baseline (once, on d1a5ae3's code in LMS_BASE_ROOT):
//   node --test test/redesign/budget-record.test.ts
import type { R1aWorld } from './world.ts';
import { HOME, KINDS_LESSON, MATH, SALMA, lessonPage, subjectPage } from './world.ts';

export interface Measure { queries: number; htmlBytes: number }
export interface Budget { home: Measure; subject: Measure; lesson: Measure }

export const PAGES = { home: HOME, subject: subjectPage(MATH), lesson: lessonPage(KINDS_LESSON) } as const;

/** One GET as سلمى: statements run and HTML bytes (the page is loaded once before, so a first-visit cookie does not count). */
export async function measure(w: R1aWorld, path: string): Promise<Measure> {
  const c = await w.as(SALMA);
  await (await c.get(path)).arrayBuffer();
  w.p.spy!.start();
  const res = await c.get(path);
  const bytes = (await res.arrayBuffer()).byteLength;
  const statements = await w.p.spy!.stop();
  if (res.status !== 200) throw new Error(`${path} answers ${res.status}`);
  return { queries: statements.length, htmlBytes: bytes };
}

export async function measureAll(w: R1aWorld): Promise<Budget> {
  return { home: await measure(w, PAGES.home), subject: await measure(w, PAGES.subject), lesson: await measure(w, PAGES.lesson) };
}
