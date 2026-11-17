// The made-up world of LMS wave 2, task W2-1 (product-contract v2 on PIL-225,
// section 3): the wave 1 world (test/wave1/world.ts) with the wave 3a people
// (test/wave3a/world.ts: Mona, a guardian linked to Salma, and Rami), plus the additions
// W2-a to W2-e, each made only by the tests that need it. Every step name
// starts with "W2 " and its label (or the UX id), so CI shows one step per
// labelled expectation.
//
// The wave-2 CI job runs the product in this process (LMS_TEST_RUNTIME=in-process,
// as wave-3a), so the statement spy and the forced faults are available.
import assert from 'node:assert/strict';
import type { Client } from '../support/http.ts';
import { appointAdmin, createSpace, seed } from '../support/seed.ts';
import { utcDatePlusDays } from '../support/http.ts';
import { ADMIN, MATH_ORDER, type Wave1World } from '../wave1/world.ts';
import { MONA, wave3aWorld } from '../wave3a/world.ts';

export * from '../wave3a/world.ts';

/** The fixed instants the test clock gives presses (milliseconds since 1970, UTC). */
// Years ahead, so no date a page shows today can equal one of them (the AT-2.7 scan).
export const T1 = Date.UTC(2031, 2, 3, 9, 15, 42, 123);
export const T2 = Date.UTC(2031, 2, 4, 18, 2, 7, 456);
export const T3 = Date.UTC(2031, 2, 5, 7, 41, 33, 789);

export async function wave2World(): Promise<Wave1World> {
  const w = await wave3aWorld();
  if (w.p.runtime !== 'in-process') {
    // The spy and the forced faults need the router in this process (the job sets LMS_TEST_RUNTIME=in-process).
    await w.close();
    assert.fail('wave 2 tests run in-process: set LMS_TEST_RUNTIME=in-process');
  }
  return w;
}

/** The mark address of a lesson in a space. */
export const markPath = (s: { id: string }, lessonId: string) => `/s/${s.id}/read/${lessonId}/done`;

/** Fixes the time the next presses store (test builds only), or gives it back to the real time with null. */
export async function markClock(w: Wave1World, atMs: number | null): Promise<void> {
  const res = await fetch(w.p.url + '/__test/mark-clock', {
    method: 'POST', headers: { 'content-type': 'application/json', origin: w.p.url }, body: JSON.stringify({ atMs }),
  });
  assert.equal(res.status, 200, 'the mark clock answers');
}

export interface MarkRow {
  space_id: string;
  learner_user_id: string;
  lesson_id: string;
  marked_at: number;
}

/** Every done mark, in a fixed order (plain objects, so they compare by value). */
export async function marks(w: Wave1World): Promise<MarkRow[]> {
  const rows = await w.p.sql('SELECT space_id, learner_user_id, lesson_id, marked_at FROM done_mark ORDER BY space_id, learner_user_id, lesson_id');
  return rows.map((r) => ({ space_id: String(r.space_id), learner_user_id: String(r.learner_user_id), lesson_id: String(r.lesson_id), marked_at: Number(r.marked_at) }));
}

/** Presses the done block's button as a form post does: state "done" or "not-done", plus any extra fields. */
export function press(c: Client, s: { id: string }, lessonId: string, state: string, extra: Record<string, string> = {}): Promise<Response> {
  return c.post(markPath(s, lessonId), { state, ...extra });
}

/** Salma's three marks of AT-1.3 (Adding fractions, Comparing fractions, Reading decimals), at T1, T2 and T3. */
export async function salmaThreeMarks(w: Wave1World, salma: Client): Promise<void> {
  for (const [i, title] of MATH_ORDER.slice(0, 3).entries()) {
    await markClock(w, [T1, T2, T3][i]);
    assert.equal((await press(salma, w.school, w.school.lessons[title], 'done')).status, 303, `${title} marked`);
  }
  await markClock(w, null);
}

/** Every value a stored time could take on a page, a header or a log line (AT-2.7): its digits, its seconds, and its dates and times as text. */
export function timeForms(ms: number): string[] {
  const d = new Date(ms);
  const iso = d.toISOString();
  return [String(ms), String(Math.floor(ms / 1000)), iso, iso.slice(0, 10), iso.slice(11, 19), d.toUTCString()];
}

// ------------------------------------------------------- world additions ----

/** W2-a: a second space, "Nile Test Space" (School kit), with the made-up learner Lina Test and one published subject of two lessons assigned to her. */
export const LINA = { display_name: 'Lina Test', username: 'lina.w2', password: 'lina-wave2-pass', role: 'learner' as const, mobile: '01045454545' };
export const NILE_ADMIN = { display_name: 'Nour Test', username: 'nour.w2', password: 'nour-wave2-pass', mobile: '01045450000' };

export async function withNile(w: Wave1World): Promise<{ id: string; subject: string; lessons: Record<string, string> }> {
  const id = await createSpace(w.owner, { name: 'Nile Test Space', kit: 'school' });
  await appointAdmin(w.owner, id, { ...NILE_ADMIN, valid_until: utcDatePlusDays(60) });
  const s = await seed(w.p.url, {
    spaceId: id, grantedBy: NILE_ADMIN.username,
    people: [{ ...LINA, valid_until: utcDatePlusDays(30) }],
    subjects: [{ title: 'Nile reading', published: true, users: [LINA.username], chapters: [{ title: 'River', lessons: [{ title: 'River words' }, { title: 'River stories' }] }] }],
  });
  const ch = s.subjects['Nile reading'].chapters.River.lessons;
  return { id, subject: s.subjects['Nile reading'].id, lessons: { 'River words': ch['River words'].id, 'River stories': ch['River stories'].id } };
}

/** W2-e: Amal (admin) and Mona (guardian linked to Salma) each also hold the learner role in Mesk School, with Mathematics assigned to them directly. */
export async function withTwoRoles(w: Wave1World): Promise<void> {
  await seed(w.p.url, {
    spaceId: w.school.id, grantedBy: ADMIN.username,
    memberships: [ADMIN, MONA].map((p) => ({ username: p.username, role: 'learner' as const, valid_until: utcDatePlusDays(30) })),
  });
  for (const p of [ADMIN, MONA]) {
    const id = (await w.p.sql(`SELECT id FROM user WHERE username = '${p.username}'`))[0].id;
    await w.p.sql(`INSERT INTO subject_access (id, space_id, subject_id, user_id) VALUES ('w2e-${p.username}', '${w.school.id}', '${w.school.math}', '${id}')`);
    w.ids[p.username] = String(id);
  }
}
