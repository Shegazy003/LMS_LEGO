// LMS wave 6, W6-1b (product-contract v2 on PIL-257, sections 3 and 5): the
// learner side's test helpers. Reading the home's to-do block (UX-62) and the
// outline's due lines (UX-63) as a reader gets them, and the expected list
// worked out independently from the rows and the product's own chapterLocks
// (AT-2.6). Made-up data only.
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chapterLocks } from '../../src/learning.ts';
import { dayLabel, showDate } from '../../src/format.ts';
import type { Wave1World } from './world.ts';

const unescape = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
export const textOf = (fragment: string) => unescape(fragment.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();

/** One item of the to-do block, as a reader gets it. */
export interface TodoItemView {
  kind: 'lesson' | 'chapter';
  id: string;
  subject: string;
  title: string;
  href: string;
  line: string;
  /** A chapter item's done count (wave 2's words), or null. */
  progress: string | null;
  /** Inside the group's fold. */
  folded: boolean;
  raw: string;
}

export interface TodoGroupView {
  key: 'overdue' | 'today' | 'next';
  heading: string;
  items: TodoItemView[];
  /** The fold's summary text, or null without a fold. */
  more: string | null;
  /** Whether the fold is open by default (it must not be). */
  moreOpen: boolean;
  capped: string | null;
}

export interface TodoView {
  /** The whole block's markup. */
  block: string;
  at: number;
  heading: string;
  groups: TodoGroupView[];
}

function itemsOf(fragment: string, folded: boolean): TodoItemView[] {
  // LMS redesign R1a (UX-62/UX-63 rows, UX-102): each row carries its subject's colour and icon, and its line ends with the S6 tag.
  return [...fragment.matchAll(/<li class="todo-item" data-kind="(lesson|chapter)" data-item="([^"]+)" data-subject="([^"]+)" style="[^"]*"><span class="sicon">[\s\S]*?<\/span><div class="todo-main"><a class="todo-link" href="([^"]+)">([\s\S]*?)<\/a>\n<p class="todo-line">([\s\S]*?)<\/p>(?:\n<p class="todo-progress">([\s\S]*?)<\/p>)?<\/div><\/li>/g)].map((m) => ({
    kind: m[1] as 'lesson' | 'chapter', id: m[2], subject: m[3], href: unescape(m[4]), title: textOf(m[5]), line: textOf(m[6]), progress: m[7] === undefined ? null : textOf(m[7]), folded, raw: m[0],
  }));
}

/** The learner's to-do page (LMS redesign R1a, S9, UX-102): the full wave 6 block moved here from the home. */
export const todoPath = (s: { id: string }) => `/s/${s.id}/todo`;

/** The to-do block of a page (id="todo"), or null when the page has none. LMS redesign R1a (UX-34/UX-54/UX-62 rows): the block
 * is the to-do page's (read it from todoPath); the home's #todo is the due-soon strip, which this refuses to read. With nothing
 * due the page keeps its heading and says «لا شيء مطلوب الآن» with no group: read here as null, wave 6's "no block". */
export function todoOf(html: string): TodoView | null {
  const start = html.indexOf('<section id="todo"');
  if (start < 0) return null;
  assert.ok(!html.startsWith('<section id="todo" class="strip"', start), 'todoOf reads the to-do page (todoPath), not the home\'s due strip');
  const end = html.indexOf('</section>', start);
  const block = html.slice(start, end + '</section>'.length);
  const groups = [...block.matchAll(/<div class="todo-group" data-group="(overdue|today|next)">\n<h3 id="todo-[a-z]+">([\s\S]*?)<\/h3>([\s\S]*?)\n<\/div>/g)].map((m) => {
    const inner = m[3];
    const foldAt = inner.indexOf('<details class="todo-more"');
    const top = foldAt < 0 ? inner : inner.slice(0, foldAt);
    const fold = foldAt < 0 ? '' : inner.slice(foldAt);
    const summary = /<details class="todo-more"([^>]*)><summary>([\s\S]*?)<\/summary>/.exec(fold);
    const capped = /<p class="todo-capped">([\s\S]*?)<\/p>/.exec(fold);
    return {
      key: m[1] as TodoGroupView['key'], heading: textOf(m[2]),
      items: [...itemsOf(top, false), ...itemsOf(fold, true)],
      more: summary ? textOf(summary[2]) : null, moreOpen: summary ? /\bopen\b/.test(summary[1]) : false,
      capped: capped ? textOf(capped[1]) : null,
    };
  });
  if (groups.length === 0) return null;
  return { block, at: start, heading: textOf(/<h[12] id="todo-heading">([\s\S]*?)<\/h[12]>/.exec(block)?.[1] ?? ''), groups };
}

/** LMS redesign R1a (UX-98, UX-34/UX-54/UX-62 rows): the home's due-soon strip, the list's first three items. Its markup, with
 * "see all" taken out (a link on the learner's home, inert in a preview: the to-do page is not previewable), and its rows' ids. */
export function stripOf(html: string): { markup: string; ids: string[]; groups: string[] } | null {
  const m = /<section id="todo" class="strip"[\s\S]*?<\/section>/.exec(html);
  if (!m) return null;
  return {
    markup: m[0].replace(/<a id="todo-all"[^>]*>[\s\S]*?<\/a>/, '[see all]'),
    ids: [...m[0].matchAll(/<li class="strip-row" data-group="[a-z]+" data-kind="[a-z]+" data-item="([^"]+)"/g)].map((r) => r[1]),
    groups: [...m[0].matchAll(/<li class="strip-row" data-group="([a-z]+)"/g)].map((r) => r[1]),
  };
}

/** The subjects of a home's cards, in order (LMS redesign R1a, UX-99: `li.card.subj`). */
export const cardSubjectsOf = (doc: string) => [...doc.matchAll(/<li class="card subj" data-subject="([^"]+)"/g)].map((m) => m[1]);

/** A to-do row's line on the learner's page (LMS redesign R1a, UX-62/UX-63 rows): "<kind> · <subject>" then the group's S6
 * tag words (late · <day>, due today, due <day>; the day S4's, a relative word for yesterday/today/tomorrow). */
export function rowLine(t: (key: string, v?: Record<string, string>) => string, lang: 'ar' | 'en', kind: 'lesson' | 'chapter', subjectTitle: string, group: TodoGroupView['key'], iso: string, today: string): string {
  const day = dayLabel(iso, lang, today);
  const tag = group === 'overdue' ? t('tagLate', { date: day }) : group === 'today' ? t('tagToday') : t('tagDue', { date: day });
  return `${t(kind)} · ${subjectTitle} ${tag}`;
}

/** LMS redesign R1a (UX-62/UX-63, UX-16a rows): the guardian's line for a row of the learner's to-do page: wave 6's todoItemLine with
 * the row's kind, its subject title and its due day as S4 shows it (from the tag's `datetime`; a "due today" tag is today). */
export function guardianLineFor(t: (key: string, v?: Record<string, string>) => string, lang: 'ar' | 'en', item: TodoItemView, group: TodoGroupView['key'], today: string): string {
  const subjectTitle = textOf(/<p class="todo-line">[^<]*<bdi>([\s\S]*?)<\/bdi>/.exec(item.raw)![1]);
  const iso = group === 'today' ? today : /<time datetime="(\d{4}-\d{2}-\d{2})">/.exec(item.raw)![1];
  return t('todoItemLine', { kind: t(item.kind), subjectTitle, date: showDate(iso, lang, today) });
}

/** The group keys and item ids of a block, compactly (for assertions and messages). */
export const shape = (v: TodoView | null) => (v ? v.groups.map((g) => ({ key: g.key, count: g.heading, ids: g.items.map((i) => i.id) })) : null);
export const idsIn = (v: TodoView | null, key: TodoGroupView['key']) => v?.groups.find((g) => g.key === key)?.items.map((i) => i.id) ?? [];

/** The due lines of an outline page (UX-63): chapter id or lesson id → the line's text. */
export function dueLinesOf(html: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of html.matchAll(/<details class="card fold[^"]*" id="chapter-([^"]+)"[\s\S]*?<summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/g)) {
    const chapterLine = /<span class="due-line">([\s\S]*?)<\/span><\/span> <span class="count/.exec(m[2]);
    if (chapterLine) out.set(m[1], textOf(chapterLine[1]));
    for (const li of m[3].matchAll(/<li class="(?:is-done )?due-dated">[\s\S]*?data-lesson="([^"]+)"[\s\S]*?<span class="due-line">([\s\S]*?)<\/span><\/li>/g)) out.set(li[1], textOf(li[2]));
  }
  return out;
}

// ------------------------------------------------------- W6-d and W6-e ----

type Sql = (q: string) => Promise<Record<string, unknown>[]>;

/** W6-d (contract section 3): the W5-d load space with 2 due lessons per subject, D+1 and D+5 (300 items): each subject's lesson gets D+1, and a second lesson in its chapter gets D+5. */
export async function withW6d(sql: Sql, load: { id: string; subjects: string[] }, dPlus: (n: number) => string): Promise<void> {
  const rows = await sql(`SELECT l.id, l.chapter_id, c.subject_id FROM lesson l JOIN chapter c ON c.id = l.chapter_id WHERE l.space_id = '${load.id}' AND l.removed_at IS NULL ORDER BY c.subject_id`);
  assert.equal(rows.length, 150, 'W5-d: one lesson per subject');
  await sql(`UPDATE lesson SET due_on = '${dPlus(1)}' WHERE space_id = '${load.id}'`);
  const values = rows.map((r, i) => `('w6d-${i}', '${load.id}', '${r.chapter_id}', 'Second lesson ${i + 1}', 20, '${dPlus(5)}')`);
  for (let i = 0; i < values.length; i += 50) await sql(`INSERT INTO lesson (id, space_id, chapter_id, title, position, due_on) VALUES ${values.slice(i, i + 50).join(', ')}`);
}

/** W6-e: W6-d with all 300 lesson dates at D-3 (written directly), one dated chapter per subject (D-2, two lessons each, after the first chapter), and chapters in order on in 75 of the 150 subjects; the learner has no done marks. */
export async function withW6e(sql: Sql, load: { id: string; subjects: string[] }, dPlus: (n: number) => string): Promise<void> {
  await sql(`UPDATE lesson SET due_on = '${dPlus(-3)}' WHERE space_id = '${load.id}' AND due_on IS NOT NULL`);
  const chapters = load.subjects.map((s, i) => `('w6e-c${i}', '${load.id}', '${s}', 'Dated unit ${i + 1}', 100, '${dPlus(-2)}')`);
  for (let i = 0; i < chapters.length; i += 50) await sql(`INSERT INTO chapter (id, space_id, subject_id, title, position, due_on) VALUES ${chapters.slice(i, i + 50).join(', ')}`);
  const lessons = load.subjects.flatMap((_s, i) => [1, 2].map((k) => `('w6e-c${i}-l${k}', '${load.id}', 'w6e-c${i}', 'Dated unit lesson ${k}', ${k * 10})`));
  for (let i = 0; i < lessons.length; i += 50) await sql(`INSERT INTO lesson (id, space_id, chapter_id, title, position) VALUES ${lessons.slice(i, i + 50).join(', ')}`);
  const inOrder = load.subjects.slice(0, 75).map((s) => `'${s}'`).join(', ');
  await sql(`UPDATE subject SET chapters_in_order = 1 WHERE id IN (${inOrder})`);
  const marks = await sql(`SELECT COUNT(*) AS n FROM done_mark WHERE space_id = '${load.id}'`);
  assert.equal(Number(marks[0].n), 0, 'W6-e: the learner has no done marks');
}

// ------------------------------------------- rows read (a local D1 copy) ----
// The in-process SQLite reports no rows read; D1 does. AT-3.4b copies the
// candidate's database, as it is at the step, into a local Miniflare D1 (the
// D1 simulator Wrangler ships, no network, no account) and runs the captured
// to-do statement there with its own bound parameters, reading D1's own
// `meta.rows_read`. If D1 reports none, the step fails.
// The copy is the whole database file: SQLite's `VACUUM INTO` writes it where
// the local D1 keeps its file (copying row by row through D1 is about 180 ms
// a row and closes the local D1's socket after a few seconds on Windows).

type LocalD1 = { prepare(q: string): { bind(...p: unknown[]): { all(): Promise<{ results: unknown[]; meta: unknown }> }; all(): Promise<{ results: unknown[]; meta: unknown }> } };

/** Runs one statement with its parameters on a local D1 holding a copy of `source`; returns D1's result meta and rows. */
export async function onLocalD1(source: { exec(q: string): void }, statement: { sql: string; params: unknown[] }): Promise<{ meta: Record<string, unknown>; rows: unknown[] }> {
  const { Miniflare, convertV4MiniflareOptions } = (await import('miniflare')) as unknown as {
    Miniflare: new (o: unknown) => { getD1Database(n: string): Promise<LocalD1>; dispose(): Promise<void> };
    convertV4MiniflareOptions(o: unknown): unknown;
  };
  const dir = mkdtempSync(join(tmpdir(), 'lms-w6-d1-'));
  const options = () => convertV4MiniflareOptions({ modules: true, script: 'export default { fetch() { return new Response(null, { status: 404 }); } }', d1Databases: ['DB'], resourcePersistencePath: dir, compatibilityDate: '2026-10-01' });
  try {
    // 1. Start the local D1 once so it creates its database file; find it.
    let mf = new Miniflare(options());
    try {
      await (await mf.getD1Database('DB')).prepare('SELECT 1').all();
    } finally {
      await mf.dispose();
    }
    const all = readdirSync(dir, { recursive: true, withFileTypes: true });
    const files = all.filter((f) => f.isFile() && f.name.endsWith('.sqlite') && f.name !== 'metadata.sqlite');
    assert.equal(files.length, 1, `the local D1 keeps one database file (found: ${all.map((f) => f.name).join(', ') || 'nothing'} in ${dir})`);
    const file = join(files[0].parentPath, files[0].name);
    // 2. Replace it with a copy of the candidate's database.
    for (const f of [file, `${file}-wal`, `${file}-shm`]) rmSync(f, { force: true });
    source.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    // 3. Start it again on the copy and run the statement.
    mf = new Miniflare(options());
    try {
      const r = await (await mf.getD1Database('DB')).prepare(statement.sql).bind(...statement.params).all();
      return { meta: r.meta as Record<string, unknown>, rows: r.results };
    } finally {
      await mf.dispose();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ------------------------------------------------------- the expectation ----

/** Every dated item of a subject that the learner's list must hold, worked out from the rows with the product's own chapterLocks (AT-2.6): not removed, due by `last`, not done (a chapter: some shown lesson not done), and its chapter not locked for this learner. */
export async function expectedItems(w: Wave1World, spaceId: string, subjectId: string, learnerId: string | null, last: string): Promise<Set<string>> {
  const subject = (await w.p.sql(`SELECT chapters_in_order FROM subject WHERE id = '${subjectId}'`))[0];
  const rows = await w.p.sql(`SELECT c.id AS cid, c.title AS ct, c.due_on AS cdue, l.id AS lid, l.title AS lt, l.due_on AS ldue FROM chapter c
    LEFT JOIN lesson l ON l.chapter_id = c.id AND l.space_id = c.space_id AND l.removed_at IS NULL
    WHERE c.space_id = '${spaceId}' AND c.subject_id = '${subjectId}' AND c.removed_at IS NULL ORDER BY c.position, c.title, c.id, l.position, l.title, l.id`);
  const marks = learnerId
    ? new Set((await w.p.sql(`SELECT lesson_id FROM done_mark WHERE space_id = '${spaceId}' AND learner_user_id = '${learnerId}'`)).map((r) => String(r.lesson_id)))
    : new Set<string>();
  const chapters: { id: string; title: string; due: string | null; lessons: { id: string; title: string; due: string | null }[] }[] = [];
  for (const r of rows) {
    let ch = chapters.at(-1);
    if (!ch || ch.id !== r.cid) chapters.push((ch = { id: String(r.cid), title: String(r.ct), due: (r.cdue as string | null) ?? null, lessons: [] }));
    if (r.lid) ch.lessons.push({ id: String(r.lid), title: String(r.lt), due: (r.ldue as string | null) ?? null });
  }
  const locked = Number(subject.chapters_in_order) === 1 ? chapterLocks(chapters, marks).locked : new Map();
  const out = new Set<string>();
  for (const ch of chapters) {
    if (locked.has(ch.id)) continue;
    if (ch.due && ch.due <= last && ch.lessons.some((l) => !marks.has(l.id))) out.add(ch.id);
    for (const l of ch.lessons) if (l.due && l.due <= last && !marks.has(l.id)) out.add(l.id);
  }
  return out;
}

// ------------------------------------------- the guardian's block (W6-1c) ----
// Contract v3 addendum on PIL-265, G4 and AT-6/AT-7: `#guardian-todo` on the
// linked learner's page, read-only, plain text, no ids of items.

/** The end (exclusive) of the element starting at `start`, counting nested elements of the same tag. */
export function elementEnd(html: string, start: number): number {
  const tag = /^<([a-zA-Z0-9]+)/.exec(html.slice(start))![1];
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'g');
  re.lastIndex = start;
  let depth = 0;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return m.index + m[0].length;
  }
  throw new Error(`<${tag}> at ${start} is not closed`);
}

/** One item of the guardian's block, as a reader gets it. */
export interface GuardianItemView { title: string; line: string; folded: boolean; raw: string }
export interface GuardianGroupView { key: 'overdue' | 'today' | 'next'; heading: string; items: GuardianItemView[]; more: string | null; moreOpen: boolean; capped: string | null }
export interface GuardianTodoView { block: string; at: number; heading: string; note: string; groups: GuardianGroupView[] }

function guardianItems(fragment: string, folded: boolean): GuardianItemView[] {
  return [...fragment.matchAll(/<li class="todo-item"><span class="due-title">([\s\S]*?)<\/span>\n<p class="todo-line">([\s\S]*?)<\/p><\/li>/g)].map((m) => ({ title: textOf(m[1]), line: textOf(m[2]), folded, raw: m[0] }));
}

/** The guardian's to-do block of a page (id="guardian-todo"), or null when the page has none. */
export function guardianTodoOf(html: string): GuardianTodoView | null {
  const at = html.indexOf('<section id="guardian-todo"');
  if (at < 0) return null;
  const block = html.slice(at, elementEnd(html, at));
  const groups: GuardianGroupView[] = [];
  for (const m of block.matchAll(/<section class="todo-group" id="guardian-todo-(overdue|today|next)">/g)) {
    const inner = block.slice(m.index, elementEnd(block, m.index!));
    const foldAt = inner.indexOf('<details class="todo-more"');
    const top = foldAt < 0 ? inner : inner.slice(0, foldAt);
    const fold = foldAt < 0 ? '' : inner.slice(foldAt);
    const summary = /<details class="todo-more"([^>]*)><summary>([\s\S]*?)<\/summary>/.exec(fold);
    const capped = /<p class="todo-capped">([\s\S]*?)<\/p>/.exec(fold);
    groups.push({
      key: m[1] as GuardianGroupView['key'], heading: textOf(/<h3>([\s\S]*?)<\/h3>/.exec(inner)?.[1] ?? ''),
      items: [...guardianItems(top, false), ...guardianItems(fold, true)],
      more: summary ? textOf(summary[2]) : null, moreOpen: summary ? /\bopen\b/.test(summary[1]) : false,
      capped: capped ? textOf(capped[1]) : null,
    });
  }
  return {
    block, at, groups,
    heading: textOf(/<h2 id="guardian-todo-heading">([\s\S]*?)<\/h2>/.exec(block)?.[1] ?? ''),
    note: textOf(/<p class="muted">([\s\S]*?)<\/p>/.exec(block)?.[1] ?? ''),
  };
}

/** A page with the `#guardian-todo` element taken out (contract G9.1: the release 2 and v2 scans run on the rest, unchanged). */
export function withoutGuardianTodo(html: string): string {
  const at = html.indexOf('<section id="guardian-todo"');
  return at < 0 ? html : html.slice(0, at) + html.slice(elementEnd(html, at));
}

/** A block as the sequence AT-6.2 compares: (group key, group heading with its count, item title, todoItemLine text, shown or folded).
 * LMS redesign R1a (UX-62/UX-63 rows): `lines = false` leaves the line out, for comparing the guardian's block with the learner's to-do
 * page, whose row lines end with the S6 tag; the guardian keeps wave 6's todoItemLine (S4 date, UX-16a row), checked on its own. */
export function sequenceOf(v: { groups: { key: string; heading: string; items: { title: string; line: string; folded: boolean }[] }[] } | null, lines = true): string[] | null {
  return v ? v.groups.flatMap((g) => g.items.map((i) => [g.key, g.heading, i.title, ...(lines ? [i.line] : []), i.folded ? 'folded' : 'shown'].join(' | '))) : null;
}

/** The allow-list of AT-7.2 inside the block: elements, attributes, and text (each element's text is one expected value). Empty when it holds. */
export function allowListProblems(block: string, expected: { heading: string; note: string; groups: { heading: string; more: string | null; capped: string | null; items: { title: string; line: string }[] }[] }): string[] {
  const out: string[] = [];
  const ELEMENTS = new Set(['section', 'h2', 'h3', 'p', 'ul', 'li', 'details', 'summary', 'bdi', 'span']);
  for (const m of block.matchAll(/<(\/?)([a-zA-Z0-9-]+)([^>]*)>/g)) {
    if (!ELEMENTS.has(m[2].toLowerCase())) out.push(`element <${m[2]}>`);
    const attrs = m[3].replace(/="[^"]*"/g, '').trim();
    for (const a of attrs ? attrs.split(/\s+/) : []) if (!['id', 'class', 'dir'].includes(a)) out.push(`attribute ${a} on <${m[2]}>`);
  }
  // Each text-bearing element holds exactly one allowed value; once they are cut out, no text is left.
  const allowed: [RegExp, string, string][] = [
    [/<h2 id="guardian-todo-heading">[\s\S]*?<\/h2>/g, expected.heading, 'the heading'],
    [/<p class="muted">[\s\S]*?<\/p>/g, expected.note, 'the note'],
  ];
  let rest = block;
  for (const [re, value, what] of allowed) {
    const found = [...rest.matchAll(re)];
    if (found.length !== 1 || textOf(found[0][0]) !== value) out.push(`${what}: ${JSON.stringify(found.map((f) => textOf(f[0])))} is not ${JSON.stringify(value)}`);
    rest = rest.replace(re, '');
  }
  const pool = new Map<string, number>();
  const want = (text: string) => pool.set(text, (pool.get(text) ?? 0) + 1);
  for (const g of expected.groups) {
    want(g.heading);
    if (g.more) want(g.more);
    if (g.capped) want(g.capped);
    for (const i of g.items) want(`${i.title} ${i.line}`);
  }
  rest = rest.replace(/<(h3|summary|li|p)\b[^>]*>[\s\S]*?<\/\1>/g, (m) => {
    const text = textOf(m);
    const n = pool.get(text) ?? 0;
    if (n === 0) out.push(`unexpected text ${JSON.stringify(text)}`);
    else pool.set(text, n - 1);
    return '';
  });
  for (const [text, n] of pool) if (n > 0) out.push(`missing ${JSON.stringify(text)}`);
  const left = textOf(rest);
  if (left) out.push(`text outside the allowed elements: ${JSON.stringify(left)}`);
  return out;
}

/** Every item id a block lists (all groups, also folded). */
export const listed = (v: TodoView | null) => new Set(v ? v.groups.flatMap((g) => g.items.map((i) => i.id)) : []);

/** Asserts a block lists exactly the expected ids (as sets, with a readable message). */
export function sameItems(v: TodoView | null, expected: Set<string>, what: string): void {
  assert.deepEqual([...listed(v)].sort(), [...expected].sort(), what);
}
