// LMS wave 8, W8-1b (product-contract v2 on PIL-299, sections 3.3 to 3.6):
// readers of the learner's pages, shared by AT-2, AT-3, AT-4 and the UX steps.
// Each reads the product's own markup (test/wave8/world.ts world W8-a), so a
// test says what a learner meets: which chapters the outline shows, locked or
// not and why, which lesson titles are links, the lesson counter, the home
// card's count, links and "Next" line, and the recorded opens and done marks.
// Made-up data only.
import assert from 'node:assert/strict';
import type { Client } from '../support/http.ts';
import { ID, textOf, type W8World } from './world.ts';
import { showDate } from '../../src/format.ts';
import type { Lang } from '../../src/labels.ts';

export const S = `/s/${ID.space}`;
export const subjectPath = (open = 'all') => `${S}/learn/${ID.math}?open=${open}`;
export const lessonPath = (id: string) => `${S}/read/${id}`;
export const filePath = (id = ID.pdf) => `${S}/file/${id}`;
export const donePath = (id: string) => `${S}/read/${id}/done`;

export async function got(c: Client, path: string): Promise<{ status: number; html: string; res: Response }> {
  const res = await c.get(path);
  return { status: res.status, html: await res.text(), res };
}

/** One chapter of a learner's outline. */
export interface OutlineView {
  id: string;
  locked: boolean;
  /** The reason lines in DOM order: 'date' (openedOn) and/or 'order' (wave 4's line). */
  reasons: { kind: 'date' | 'order'; text: string }[];
  tag: boolean;
  /** Lesson ids listed, with whether each is a link. */
  lessons: { id: string; link: boolean }[];
  html: string;
}

/** Every chapter of an outline (subject page), in order. */
export function outlineOf(page: string): OutlineView[] {
  return [...page.matchAll(/<details class="card fold[^"]*" id="chapter-([^"]+)"[^>]*>([\s\S]*?)<\/details>/g)].map(([whole, id, inner]) => {
    const line = /<span class="lock-line">([\s\S]*?)<\/span><\/summary>/.exec(inner)?.[1] ?? '';
    const reasons = [...line.matchAll(/<span class="lock-reason"( data-reason="date")?>([\s\S]*?)<\/span>(?=\s*(<span class="lock-reason"|$))/g)]
      .map((m) => ({ kind: (m[1] ? 'date' : 'order') as 'date' | 'order', text: textOf(m[2]) }));
    return {
      id,
      locked: /\sdata-locked\b/.test(/<details[^>]*>/.exec(whole)![0]),
      reasons,
      tag: /class="lock-tag"/.test(line),
      lessons: [...inner.matchAll(/<(a|span class="lock-item") data-lesson="([^"]+)"/g)].map((m) => ({ id: m[2], link: m[1] === 'a' })),
      html: whole,
    };
  });
}

/** The lesson page's counter "k / n" (lessonPlace), as numbers. */
export function counterOf(page: string): { k: number; n: number } | null {
  const m = /<p id="lesson-place" class="muted">[\s\S]*?(\d+) \/ (\d+)[\s\S]*?<\/p>/.exec(page);
  return m ? { k: Number(m[1]), n: Number(m[2]) } : null;
}

/** Every lesson address a page links to (href to /read/<id>, in a learner's or a preview's form). */
export function lessonLinks(page: string): string[] {
  return [...page.matchAll(/href="[^"]*\/read\/([^"?#/]+)[^"]*"/g)].map((m) => m[1]);
}

/** LMS redesign R1a (UX-34/UX-54/UX-62 and UX-62/UX-63 rows): the full to-do list is the to-do page's. */
export const todoPath = `${S}/todo`;

/** LMS redesign R1a (UX-16a row, S4): a UTC day as the learner's pages show it, for the test's clock (2026 by default). */
export const shown = (iso: string, lang: Lang = 'en', today = '2026-12-09') => showDate(iso, lang, today);

/** The home card of Mathematics (R1a UX-99: `card subj` with the subject's colour in a style attribute). */
export function cardOf(page: string): { count: string; links: string[]; next: string | null; html: string } {
  const m = new RegExp(`<li class="card subj" data-subject="${ID.math}"[^>]*>([\\s\\S]*?)</li>`).exec(page);
  assert.ok(m, 'the Mathematics card');
  return {
    count: textOf(/<p class="count[^"]*"[^>]*>([\s\S]*?)<\/p>/.exec(m[1])?.[1] ?? ''),
    links: lessonLinks(m[1]),
    next: (() => {
      const n = /<p class="open-next[^"]*"[^>]*>([\s\S]*?)<\/p>/.exec(m[1]); // R1a UX-97/UX-99: `open-next wait`, with the calendar icon
      return n ? textOf(n[1]) : null;
    })(),
    html: m[1],
  };
}

/** The "Continue where you stopped" area. */
export function continueOf(page: string): { links: string[]; text: string; html: string } {
  const m = /<section id="continue"[\s\S]*?<\/section>/.exec(page);
  assert.ok(m, 'the continue area');
  return { links: lessonLinks(m[0]), text: textOf(m[0].replace(/<style>[\s\S]*?<\/style>/g, '')), html: m[0] };
}

/** The lesson ids listed in the to-do block, by group. */
export function todoIds(page: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  // R1a: a row holds its own <div class="todo-main">, so a group runs to the next group or the block's end.
  for (const g of page.matchAll(/<div class="todo-group" data-group="([^"]+)">([\s\S]*?)(?=<div class="todo-group"|<\/section>)/g)) {
    out[g[1]] = [...g[2].matchAll(/data-item="([^"]+)"/g)].map((m) => m[1]);
  }
  return out;
}

/** The recorded opens (lesson_view) and done marks (done_mark) of a person, as text. */
export const opensOf = (w: W8World, userId: string) =>
  w.sql('SELECT lesson_id, last_opened_on FROM lesson_view WHERE learner_user_id = ? ORDER BY lesson_id', userId).map((r) => `${String(r.lesson_id)}@${String(r.last_opened_on)}`);
export const marksOf = (w: W8World, userId: string) =>
  w.sql('SELECT lesson_id FROM done_mark WHERE learner_user_id = ? ORDER BY lesson_id', userId).map((r) => String(r.lesson_id));

/** Row counts of every learner-data table (AT-5.4). */
export function rowCounts(w: W8World): Record<string, number> {
  const tables = ['done_mark', 'lesson', 'chapter', 'quiz', 'quiz_attempt', 'announcement', 'lesson_view'];
  const out: Record<string, number> = {};
  for (const t of tables) {
    const exists = w.sql("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", t).length > 0;
    if (exists) out[t] = Number(w.sql(`SELECT COUNT(*) AS n FROM "${t}"`)[0].n);
  }
  return out;
}

/** A snapshot of every due date, done mark, quiz, attempt, announcement and activity row (AT-5.4: nothing changed or deleted). */
export function learnerData(w: W8World): string {
  const q = (sql: string) => {
    try {
      return w.sql(sql);
    } catch {
      return [];
    }
  };
  return JSON.stringify({
    marks: q('SELECT * FROM done_mark ORDER BY space_id, learner_user_id, lesson_id'),
    dueLessons: q('SELECT id, due_on FROM lesson ORDER BY id'),
    dueChapters: q('SELECT id, due_on FROM chapter ORDER BY id'),
    quizzes: q('SELECT * FROM quiz ORDER BY id'),
    attempts: q('SELECT * FROM quiz_attempt ORDER BY rowid'),
    announcements: q('SELECT * FROM announcement ORDER BY id'),
    views: q('SELECT * FROM lesson_view ORDER BY space_id, lesson_id, learner_user_id'),
  });
}
