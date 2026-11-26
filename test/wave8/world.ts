// LMS wave 8 (product-contract v2 on PIL-299, section 7): the test world W8-a,
// written straight into a freshly migrated database with FIXED ids, so that
// the same world on two builds (a41f7d8 and the candidate) gives the same
// responses (N1, section 6): every id, title and date is a constant here.
// Password hashes are made at load time (never shown on any page).
// - W8-a: School kit (or Company / University: W8-b / W8-c), Arabic first,
//   lesson activity on; Mathematics (publisher Amal Test, admin Hadeer Test),
//   learners Salma Test and Omar Test, guardian Mona Test linked to Salma,
//   Rana Test admin and learner, one open quiz; Ch1 to Ch5 as section 7.
//   Before Ch3 was dated, Salma marked its lesson done and opened it (D6).
// - W8-0 (`dates: false`): the same world with no date stored.
// Also, for refusals (AT-1.2, AT-1.3): Science, another subject of the space
// (publisher Karim Test), and another space with its own subject and chapter.
// The product is the in-process router (test/support/product.ts inProcess) of
// this checkout, or of another one (`root`, e.g. a41f7d8 in LMS_BASE_ROOT).
// Made-up data only.
import { inProcess, type Product } from '../support/product.ts';
import type { InProcessWorker } from '../support/in-process.ts';
import { Client } from '../support/http.ts';
import { seedKit } from '../../src/kits/seed.ts';
import { hashPassword } from '../../src/auth/password.ts';
import { makeLabel, type Label, type Lang } from '../../src/labels.ts';

/** The product's words for a kit and a language (as the pages draw them). */
export const words8 = (kit: Kit, lang: Lang): Label => makeLabel(lang, seedKit(kit));

export type Kit = 'school' | 'company' | 'university';
export type Twin = Product & { worker: InProcessWorker };

export interface Person { key: string; id: string; username: string; password: string; display_name: string; mobile: string }
const person = (key: string, name: string, n: number): Person => ({
  key, id: `w8-user-${key}`, username: `${key}.w8`, password: `${key}-wave8-pass`, display_name: `${name} Test`, mobile: `+2010${String(80800000 + n)}`,
});
export const OWNER8 = person('owner', 'Owner', 0);
export const AMAL = person('amal', 'Amal', 1);
export const HADEER = person('hadeer', 'Hadeer', 2);
export const SALMA = person('salma', 'Salma', 3);
export const OMAR = person('omar', 'Omar', 4);
export const MONA = person('mona', 'Mona', 5);
export const RANA = person('rana', 'Rana', 6);
export const KARIM = person('karim', 'Karim', 7);
export const PEOPLE = [OWNER8, AMAL, HADEER, SALMA, OMAR, MONA, RANA, KARIM];

/** The long unique marker in Ch3's lesson title (AT-4.4, W8-1b). */
export const MARKER = 'Revision-W8-marker-7f3c9e2a51d84b06';

/** Fixed ids (N1). */
export const ID = {
  space: 'w8-space-0000-0000-0000-000000000001',
  kit: 'w8-kit-00000-0000-0000-000000000001',
  otherSpace: 'w8-space-0000-0000-0000-000000000002',
  otherKit: 'w8-kit-00000-0000-0000-000000000002',
  math: 'w8-subj-0000-0000-0000-000000000001',
  science: 'w8-subj-0000-0000-0000-000000000002',
  otherSubject: 'w8-subj-0000-0000-0000-000000000003',
  ch1: 'w8-chap-0000-0000-0000-000000000001',
  ch2: 'w8-chap-0000-0000-0000-000000000002',
  ch3: 'w8-chap-0000-0000-0000-000000000003',
  ch4: 'w8-chap-0000-0000-0000-000000000004',
  ch5: 'w8-chap-0000-0000-0000-000000000005',
  sciCh: 'w8-chap-0000-0000-0000-000000000006',
  otherCh: 'w8-chap-0000-0000-0000-000000000007',
  l11: 'w8-less-0000-0000-0000-000000000011',
  l12: 'w8-less-0000-0000-0000-000000000012',
  l21: 'w8-less-0000-0000-0000-000000000021',
  l22: 'w8-less-0000-0000-0000-000000000022',
  l31: 'w8-less-0000-0000-0000-000000000031',
  l41: 'w8-less-0000-0000-0000-000000000041',
  l42: 'w8-less-0000-0000-0000-000000000042',
  sciL: 'w8-less-0000-0000-0000-000000000061',
  otherL: 'w8-less-0000-0000-0000-000000000071',
  pdf: 'w8-file-0000-0000-0000-000000000001',
  quiz: 'w8-quiz-0000-0000-0000-000000000001',
};

/** The chapters of Mathematics, in order (section 7). */
export const CHAPTERS = [
  { id: ID.ch1, title: 'Numbers', lessons: [{ id: ID.l11, title: 'Counting' }, { id: ID.l12, title: 'Place value' }] },
  { id: ID.ch2, title: 'Fractions', lessons: [{ id: ID.l21, title: 'Halves and quarters', due: '2026-12-08' }, { id: ID.l22, title: 'Adding fractions' }] },
  { id: ID.ch3, title: 'Revision', lessons: [{ id: ID.l31, title: `Exam revision ${MARKER}` }] },
  { id: ID.ch4, title: 'Geometry', lessons: [{ id: ID.l41, title: 'Angles' }, { id: ID.l42, title: 'Triangles' }] },
  { id: ID.ch5, title: 'Extra', lessons: [] as { id: string; title: string; due?: string }[] },
] as const;

/** The stored dates of W8-a (section 7). */
export const OPENINGS: Record<string, { on: string; hidden: 0 | 1 }> = {
  [ID.ch2]: { on: '2026-12-10', hidden: 0 },
  [ID.ch3]: { on: '2026-12-17', hidden: 1 },
  [ID.ch5]: { on: '2026-12-10', hidden: 0 },
};

/** Instants used by the tests (W6-c pins the clock). */
export const AT8 = {
  d1: Date.parse('2026-12-01T09:00:00.000Z'),
  d9: Date.parse('2026-12-09T12:00:00.000Z'),
  d9end: Date.parse('2026-12-09T23:59:59.999Z'),
  d10: Date.parse('2026-12-10T00:00:00.000Z'),
  d11: Date.parse('2026-12-11T12:00:00.000Z'),
  d17: Date.parse('2026-12-17T00:00:00.000Z'),
  y2027: Date.parse('2027-01-01T12:00:00.000Z'),
};

/** A tiny real PDF, fixed bytes (no binary fixture). */
function pdfBytes(): Uint8Array {
  const stream = 'BT /F1 24 Tf 72 720 Td (Fractions) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

const CREATED = Date.parse('2026-11-01T08:00:00.000Z');
const QUESTIONS = [{ id: 'w8q-one', text: 'What is 1/2 + 1/2?', answers: [{ id: 'w8q-one-a', text: '1' }, { id: 'w8q-one-b', text: '2/4' }], rightId: 'w8q-one-a' }];

export interface WorldOptions {
  /** Another checkout's code (a41f7d8 for the N1 capture). */
  root?: string;
  kit?: Kit;
  /** W8-a's dates stored (default true); false = W8-0. Needs migration 0017 (the candidate). */
  dates?: boolean;
  inOrder?: boolean;
  /** The pinned instant (W6-c); default AT8.d9. */
  atMs?: number;
}

export interface W8World {
  p: Twin;
  url: string;
  kit: Kit;
  sql(query: string, ...params: (string | number | null)[]): Record<string, unknown>[];
  run(query: string, ...params: (string | number | null)[]): void;
  /** A signed-in client of a person (Arabic first: no language sent). */
  as(who: Person, lang?: 'ar' | 'en'): Promise<Client>;
  clock(atMs: number | null): Promise<void>;
  close(): Promise<void>;
}

/** Writes W8-a into the product's database (one transaction) and its PDF into the file store. */
export async function seedW8(w: InProcessWorker, opts: { kit?: Kit; dates?: boolean; inOrder?: boolean } = {}): Promise<void> {
  const kitName = opts.kit ?? 'school';
  const rows: [string, ...(string | number | null)[]][] = [];
  const hashes = new Map<string, string>();
  for (const p of PEOPLE) hashes.set(p.key, await hashPassword(p.password));
  for (const p of PEOPLE) {
    rows.push(['INSERT INTO user (id, username, password_hash, display_name, mobile, is_owner, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      p.id, p.username, hashes.get(p.key)!, p.key === 'owner' ? p.username : p.display_name, p.mobile, p.key === 'owner' ? 1 : 0, CREATED]);
  }
  for (const [kitId, spaceId, name] of [[ID.kit, ID.space, 'W8 Space'], [ID.otherKit, ID.otherSpace, 'W8 Other Space']]) {
    const kit = seedKit(kitName);
    kit.languages = ['ar', 'en'];
    rows.push(['INSERT INTO kit (id, name, json) VALUES (?, ?, ?)', kitId, kit.name.en, JSON.stringify(kit)]);
    rows.push(['INSERT INTO space (id, name, kit_id, default_country_code, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)', spaceId, name, kitId, '+20', OWNER8.id, CREATED]);
  }
  const member = (n: number, who: Person, role: string) => rows.push([
    'INSERT INTO membership (id, space_id, user_id, role, valid_from, valid_until, granted_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
    `w8-memb-${String(n).padStart(4, '0')}`, ID.space, who.id, role, '2026-11-01', '2027-12-31', OWNER8.id,
  ]);
  member(1, HADEER, 'admin');
  member(2, AMAL, 'publisher');
  member(3, SALMA, 'learner');
  member(4, OMAR, 'learner');
  member(5, MONA, 'guardian');
  member(6, RANA, 'admin');
  member(7, RANA, 'learner');
  member(8, KARIM, 'publisher');
  rows.push(['INSERT INTO guardian_link (id, space_id, guardian_user_id, learner_user_id, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    'w8-link-0001', ID.space, MONA.id, SALMA.id, HADEER.id, CREATED]);
  rows.push(['INSERT INTO lesson_view_setting (space_id, enabled, enabled_since, told_confirmed, changed_by, changed_at) VALUES (?, 1, ?, 1, ?, ?)',
    ID.space, '2026-11-01', HADEER.id, CREATED]);
  const subject = (id: string, space: string, title: string, publisher: string | null) =>
    rows.push(['INSERT INTO subject (id, space_id, title, publisher_user_id, is_published) VALUES (?, ?, ?, ?, 1)', id, space, title, publisher]);
  subject(ID.math, ID.space, 'Mathematics', AMAL.id);
  subject(ID.science, ID.space, 'Science', KARIM.id);
  subject(ID.otherSubject, ID.otherSpace, 'Other Mathematics', null);
  if (opts.inOrder) rows.push(['UPDATE subject SET chapters_in_order = 1 WHERE id = ?', ID.math]);
  [SALMA, OMAR, RANA].forEach((who, i) => rows.push(['INSERT INTO subject_access (id, space_id, subject_id, group_id, user_id) VALUES (?, ?, ?, NULL, ?)', `w8-acc-${i + 1}`, ID.space, ID.math, who.id]));
  rows.push(['INSERT INTO subject_access (id, space_id, subject_id, group_id, user_id) VALUES (?, ?, ?, NULL, ?)', 'w8-acc-4', ID.space, ID.science, SALMA.id]);
  CHAPTERS.forEach((ch, ci) => {
    rows.push(['INSERT INTO chapter (id, space_id, subject_id, title, position) VALUES (?, ?, ?, ?, ?)', ch.id, ID.space, ID.math, ch.title, ci + 1]);
    ch.lessons.forEach((l, li) => {
      rows.push(['INSERT INTO lesson (id, space_id, chapter_id, title, body_text, position) VALUES (?, ?, ?, ?, ?, ?)', l.id, ID.space, ch.id, l.title, `${l.title}: notes.`, li + 1]);
      if ('due' in l && l.due) rows.push(['UPDATE lesson SET due_on = ? WHERE id = ?', l.due, l.id]);
    });
  });
  rows.push(['INSERT INTO chapter (id, space_id, subject_id, title, position) VALUES (?, ?, ?, ?, 1)', ID.sciCh, ID.space, ID.science, 'Plants']);
  rows.push(['INSERT INTO lesson (id, space_id, chapter_id, title, body_text, position) VALUES (?, ?, ?, ?, ?, 1)', ID.sciL, ID.space, ID.sciCh, 'Leaves', '']);
  rows.push(['INSERT INTO chapter (id, space_id, subject_id, title, position) VALUES (?, ?, ?, ?, 1)', ID.otherCh, ID.otherSpace, ID.otherSubject, 'Elsewhere']);
  rows.push(['INSERT INTO lesson (id, space_id, chapter_id, title, body_text, position) VALUES (?, ?, ?, ?, ?, 1)', ID.otherL, ID.otherSpace, ID.otherCh, 'Far away', '']);
  const key = `spaces/${ID.space}/files/${ID.pdf}`;
  rows.push(['INSERT INTO material (id, space_id, lesson_id, kind, title, storage_key, url, note_text, position) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, 1)', ID.pdf, ID.space, ID.l21, 'pdf', 'Fractions sheet', key]);
  rows.push(['INSERT INTO quiz (id, space_id, subject_id, title, questions_json, rev, state, created_at, removed_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?, NULL)',
    ID.quiz, ID.space, ID.math, 'Fractions check', JSON.stringify(QUESTIONS), 'open', CREATED]);
  // D6: before Ch3 was dated, Salma marked its lesson done and opened it (one activity record).
  rows.push(['INSERT INTO done_mark (space_id, learner_user_id, lesson_id, marked_at) VALUES (?, ?, ?, ?)', ID.space, SALMA.id, ID.l31, Date.parse('2026-11-30T10:00:00.000Z')]);
  rows.push(['INSERT INTO lesson_view (space_id, lesson_id, learner_user_id, last_opened_on) VALUES (?, ?, ?, ?)', ID.space, ID.l31, SALMA.id, '2026-11-30']);
  if (opts.dates ?? true) {
    for (const [id, o] of Object.entries(OPENINGS)) rows.push(['UPDATE chapter SET opens_on = ?, opens_hidden = ? WHERE id = ?', o.on, o.hidden, id]);
  }
  await w.files.put(key, pdfBytes(), { httpMetadata: { contentType: 'application/pdf' } });
  w.sqlite.exec('BEGIN');
  try {
    for (const [q, ...params] of rows) w.sqlite.prepare(q).run(...params);
    w.sqlite.exec('COMMIT');
  } catch (err) {
    w.sqlite.exec('ROLLBACK');
    throw err;
  }
}

async function pin(url: string, atMs: number | null): Promise<void> {
  const res = await fetch(url + '/__test/clock-fixed', { method: 'POST', headers: { 'content-type': 'application/json', origin: url }, body: JSON.stringify({ atMs }) });
  if (res.status !== 200) throw new Error(`the fixed clock answers ${res.status}`);
}

/** W8-a (or W8-0, W8-b, W8-c) on a fresh in-process product, the clock pinned. */
export async function w8World(opts: WorldOptions = {}): Promise<W8World> {
  const p = (await inProcess(opts.root ? { root: opts.root } : {})) as Twin;
  try {
    await seedW8(p.worker, opts);
    await pin(p.url, opts.atMs ?? AT8.d9);
  } catch (err) {
    await p.stop();
    throw err;
  }
  return {
    p,
    url: p.url,
    kit: opts.kit ?? 'school',
    sql: (q, ...params) => p.worker.sqlite.prepare(q).all(...params) as Record<string, unknown>[],
    run: (q, ...params) => void p.worker.sqlite.prepare(q).run(...params),
    async as(who, lang) {
      const c = new Client(p.url, { lang: lang ?? null });
      const res = await c.post('/signin', { username: who.username, password: who.password });
      if (res.status !== 302) throw new Error(`${who.username} signs in (${res.status})`);
      if (lang) {
        const set = await c.post('/account/language', { lang });
        if (set.status >= 400) throw new Error(`${who.username}: language ${lang} (${set.status})`);
      }
      return c;
    },
    clock: (atMs) => pin(p.url, atMs),
    async close() {
      await pin(p.url, null).catch(() => undefined);
      await p.stop();
    },
  };
}

// ------------------------------------------------------------- addresses ----
export const editorOf = (subjectId = ID.math) => `/s/${ID.space}/publish/edit/${subjectId}`;
export const adminOf = (subjectId = ID.math) => `/s/${ID.space}/admin/topics/${subjectId}`;
export const openPage = (from: string) => `${from}/opening`;
export const openPost = (from: string, chapterId: string) => `${from}/opening/${chapterId}`;

/** One chapter's stored opening. */
export function openingOf(w: W8World, chapterId: string): { opens_on: string | null; opens_hidden: number } {
  const [r] = w.sql('SELECT opens_on, opens_hidden FROM chapter WHERE id = ?', chapterId);
  return { opens_on: (r.opens_on as string | null) ?? null, opens_hidden: Number(r.opens_hidden) };
}

/** Every chapter's opening, as one text (nothing stored = the same text before and after). */
export function openingSnapshot(w: W8World): string {
  return JSON.stringify(w.sql('SELECT id, opens_on, opens_hidden, removed_at FROM chapter ORDER BY id'));
}

// ------------------------------------------------------------ the page ----
export interface OpenRowView {
  id: string;
  title: string;
  state: string;
  stateText: string;
  lines: string[];
  field: { id: string; value: string; min: string; max: string; invalid: boolean; describedBy: string | null; autofocus: boolean };
  radios: { value: string; checked: boolean }[];
  buttons: { value: string; label: string; text: string }[];
  action: string;
  status: { text: string; role: string } | null;
  error: string | null;
  html: string;
}

const attr = (tag: string, name: string) => {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return m ? m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, '\'') : null;
};
export const textOf = (fragment: string) => fragment.replace(/<script>[\s\S]*?<\/script>/g, '').replace(/<[^>]*>/g, '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, '\'').replace(/\s+/g, ' ').trim();

/** The rows of the Opening dates page, in order. */
export function openRowsOf(page: string): OpenRowView[] {
  return [...page.matchAll(/<li id="chapter-([^"]+)" class="due-item"[^>]*>([\s\S]*?)<\/li>/g)].map(([, id, html]) => {
    const input = /<input type="date"[^>]*>/.exec(html)?.[0] ?? '';
    const state = /<p class="due-value" data-state="([^"]+)">([\s\S]*?)<\/p>/.exec(html);
    const status = /<p class="due-status[^"]*" role="([^"]+)"[^>]*>([\s\S]*?)<\/p>/.exec(html);
    const error = /<p id="[^"]+-error" class="error due-error">([\s\S]*?)<\/p>/.exec(html);
    return {
      id, html,
      title: textOf(/<legend class="due-title">([\s\S]*?)<\/legend>/.exec(html)?.[1] ?? ''),
      state: state?.[1] ?? '',
      stateText: textOf(state?.[2] ?? ''),
      lines: [...html.matchAll(/data-line="([^"]+)"/g)].map((m) => m[1]),
      field: {
        id: attr(input, 'id') ?? '', value: attr(input, 'value') ?? '', min: attr(input, 'min') ?? '', max: attr(input, 'max') ?? '',
        invalid: attr(input, 'aria-invalid') === 'true', describedBy: attr(input, 'aria-describedby'), autofocus: /\sautofocus\b/.test(input),
      },
      radios: [...html.matchAll(/<input type="radio"[^>]*>/g)].map((m) => ({ value: attr(m[0], 'value') ?? '', checked: /\schecked\b/.test(m[0]) })),
      buttons: [...html.matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g)].map((m) => ({ value: attr(m[1], 'value') ?? '', label: attr(m[1], 'aria-label') ?? '', text: textOf(m[2]) })),
      action: attr(/<form[^>]*>/.exec(html)?.[0] ?? '', 'action') ?? '',
      status: status ? { role: status[1], text: textOf(status[2]) } : null,
      error: error ? textOf(error[1]) : null,
    };
  });
}

/** The Opening dates card of an editor or admin page. */
export function openCardOf(page: string): { at: number; heading: string; href: string; text: string } | null {
  const m = /<section id="opening-dates" class="card"[\s\S]*?<\/section>/.exec(page);
  if (!m) return null;
  const a = /<a class="due-link" href="([^"]+)">([\s\S]*?)<\/a>/.exec(m[0]);
  return { at: m.index, heading: textOf(/<h2[^>]*>([\s\S]*?)<\/h2>/.exec(m[0])?.[1] ?? ''), href: a?.[1].replace(/&amp;/g, '&') ?? '', text: textOf(a?.[2] ?? '') };
}

/** The Opening dates card, cut from a page (the base comparisons of waves 4 to 7: an allowed difference on teacher pages, B1). */
export const OPENING_CARD = /<section id="opening-dates" class="card"[\s\S]*?<\/section>/g;
