// Shared by the R2-d tests (contract product-contract-r2, AT-15 and the
// lesson-activity parts of AT-13): the R2-b world (test/at10/marks.ts: G1
// linked to A and B, G2 to A; Mathematics for the group Science (A, B, C) and
// D directly, with its lesson "Adding fractions"; Arabic for A only, with its
// lesson "Nahw basics"). The admin's switch is used through its real form; the
// test clock (src/test-hooks.ts) moves the day, never a wait (section 3).
import assert from 'node:assert/strict';
import { Client, setClockOffsetDays, workerNow } from '../support/http.ts';
import { signedIn } from '../support/seed.ts';
import { ADMIN, OTHER_ADMIN, as } from '../at9/world.ts';
import { marksWorld, type World } from '../at10/marks.ts';

export type ActivityWorld = World & { science: string };

/** The world for AT-15: the R2-b world with the guardians linked. */
export function activityWorld(): Promise<ActivityWorld> {
  return marksWorld({ links: true });
}

export const switchPath = (w: World, spaceId = w.spaceId) => `/s/${spaceId}/admin/activity`;
export const activityPath = (w: World, learnerId: string) => `/s/${w.spaceId}/linked/${learnerId}/activity`;
export const lessonPath = (w: World, lessonId = w.content.lesson) => `/s/${w.spaceId}/read/${lessonId}`;

/** A fresh sign-in of the space's admin (a session survives a move of the clock, but not a long one). */
export const adminNow = (w: World) => signedIn(w.p.url, ADMIN.username, ADMIN.password);

/** Switches lesson activity on through the admin's form, with the tick. */
export async function switchOn(w: World, opts: { client?: Client; spaceId?: string } = {}): Promise<void> {
  const client = opts.client ?? (opts.spaceId ? await signedIn(w.p.url, OTHER_ADMIN.username, OTHER_ADMIN.password) : await adminNow(w));
  const res = await client.post(switchPath(w, opts.spaceId), { told: '1' });
  assert.equal(res.status, 303, `lesson activity switched on (got ${res.status})`);
}

/** Switches lesson activity off through the admin's switch-off step. */
export async function switchOff(w: World, client?: Client): Promise<void> {
  const res = await (client ?? (await adminNow(w))).post(`${switchPath(w)}/off`, {});
  assert.equal(res.status, 303, `lesson activity switched off (got ${res.status})`);
}

/** Every lesson-view row of the database, in a fixed order. */
export async function viewRows(w: World): Promise<{ space_id: string; lesson_id: string; learner_user_id: string; last_opened_on: string }[]> {
  const rows = await w.p.sql('SELECT space_id, lesson_id, learner_user_id, last_opened_on FROM lesson_view ORDER BY space_id, lesson_id, learner_user_id');
  return rows.map((r) => ({ space_id: String(r.space_id), lesson_id: String(r.lesson_id), learner_user_id: String(r.learner_user_id), last_opened_on: String(r.last_opened_on) }));
}

/** The space's switch as stored, or null when it has never been used. */
export async function settingRow(w: World, spaceId = w.spaceId): Promise<Record<string, unknown> | null> {
  return (await w.p.sql(`SELECT * FROM lesson_view_setting WHERE space_id = '${spaceId}'`))[0] ?? null;
}

/** Moves the product's day (test clock) and returns the product's date then (YYYY-MM-DD). */
export async function moveToDay(w: World, days: number): Promise<string> {
  const res = await setClockOffsetDays(w.p.url, days);
  assert.equal(res.status, 200, 'the test clock moved');
  return productToday(w);
}

/** The product's own date now (YYYY-MM-DD). */
export async function productToday(w: World): Promise<string> {
  return new Date(await workerNow(w.p.url)).toISOString().slice(0, 10);
}

/** A learner opens a lesson page; returns the response's status and body. */
export async function open(w: World, who: { username: string; password: string }, lessonId = w.content.lesson): Promise<{ status: number; html: string }> {
  const res = await (await as(w, who)).get(lessonPath(w, lessonId));
  return { status: res.status, html: await res.text() };
}

export interface ShownActivity {
  /** The "not switched on" line is shown in place of the activity. */
  off: boolean;
  since: string | null;
  /** Per subject title, per lesson title: the date shown, or null for "No open recorded". */
  subjects: Record<string, Record<string, string | null>>;
  /** The learners in the switcher, by name, with the one shown marked. */
  switcher: { name: string; current: boolean; href: string }[];
}

const text = (s: string) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

/** Reads the guardian's lesson-activity page the way a person reads it. */
export function shownActivity(html: string): ShownActivity {
  const since = html.match(/id="recording-since"[^>]*>([\s\S]*?)<\/p>/)?.[1];
  const subjects: ShownActivity['subjects'] = {};
  for (const m of html.matchAll(/<section class="card">\s*<h2><bdi class="title">([^<]*)<\/bdi><\/h2>([\s\S]*?)<\/section>/g)) {
    const lessons: Record<string, string | null> = {};
    for (const l of m[2].matchAll(/<li class="row"><bdi class="title">([^<]*)<\/bdi> (<span class="opened">[\s\S]*?<\/span>|<span class="muted none">[^<]*<\/span>)<\/li>/g)) {
      lessons[l[1]] = l[2].startsWith('<span class="opened">') ? (text(l[2]).match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? `unreadable: ${text(l[2])}`) : null;
    }
    subjects[m[1]] = lessons;
  }
  const nav = html.match(/<nav id="activity-learners"[^>]*>([\s\S]*?)<\/nav>/)?.[1] ?? '';
  const switcher = [...nav.matchAll(/<a class="[^"]*"( aria-current="page")? href="([^"]*)">([\s\S]*?)<\/a>/g)].map((a) => ({ name: text(a[3]), current: Boolean(a[1]), href: a[2] }));
  return {
    off: /id="activity-off"/.test(html),
    since: since ? (text(since).match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null) : null,
    subjects,
    switcher,
  };
}

/** A guardian's lesson-activity page for a learner: status, no-store, and what it shows. */
export async function guardianSees(w: World, guardian: { username: string; password: string }, learnerId: string): Promise<{ status: number; cacheControl: string | null; html: string; shown: ShownActivity }> {
  const res = await (await as(w, guardian)).get(activityPath(w, learnerId));
  const html = await res.text();
  return { status: res.status, cacheControl: res.headers.get('cache-control'), html, shown: shownActivity(html) };
}

export const NOTICE = {
  school: {
    en: 'Your parent can see which lessons you opened and the date you last opened them.',
    ar: 'يستطيع ولي أمرك أن يرى أي الدروس فتحتها وتاريخ آخر فتح لها.',
  },
  company: {
    en: 'Your supervisor can see which lessons you opened and the date you last opened them.',
    ar: 'يستطيع مشرفك أن يرى أي الدروس فتحتها وتاريخ آخر فتح لها.',
  },
};
