// Reading the upload pages of LMS wave 3b in the tests (W3b-1): the rows of
// the check page's tables, a block's text, and the fixtures of AT-1.3 to AT-1.5.
// Made-up names and numbers only.
import { csv, END, HEADER_AR, HEADER_EN, cp1256Bytes, pdfBytes, xlsxBytes } from './world.ts';

/** HTML text as a person reads it: tags left out (inline, so "12</bdi>." stays "12."), entities read, spaces folded. */
export function textOf(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim();
}

/** The inner HTML of the first element with this id. */
export function byId(html: string, id: string): string | null {
  const open = new RegExp(`<([a-z0-9]+)\\b[^>]*\\bid="${id}"[^>]*>`).exec(html);
  if (!open) return null;
  const tag = open[1];
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'g');
  re.lastIndex = open.index + open[0].length;
  let depth = 1;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return html.slice(open.index + open[0].length, m.index);
  }
  return null;
}

export interface TableRow {
  row: number;
  /** Each cell's inner HTML. */
  cells: string[];
  /** Each listed reason's text (the refused table). */
  reasons: string[];
}

/** The rows of the check page's table (refused-rows or add-rows), in page order. */
export function tableRows(html: string, id: 'refused-rows' | 'add-rows'): TableRow[] {
  const table = byId(html, id);
  if (table === null) return [];
  return [...table.matchAll(/<tr data-row="(\d+)">([\s\S]*?)<\/tr>/g)].map((m) => ({
    row: Number(m[1]),
    cells: [...m[2].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map((c) => c[1]),
    reasons: [...m[2].matchAll(/<li data-reason="[^"]*">([\s\S]*?)<\/li>/g)].map((r) => textOf(r[1])),
  }));
}

// ---------------------------------------------------------- AT-1.3 files ----
const valid = (n: number) => [`Whole Test ${n}`, `whole${n}.t`, 'Student', `010464640${String(n).padStart(2, '0')}`, END];
const rowsOf = (n: number) => Array.from({ length: n }, (_, i) => valid(i % 100));

/** Each file refused as a whole (AT-1.3), with the English message it gets. */
export const WHOLE_FILES: { name: string; content: string | Uint8Array; message: string }[] = [
  { name: 'a real .xlsx', content: xlsxBytes(), message: 'Only CSV files can be checked. In Excel or Google Sheets, save or download the sheet as "CSV UTF-8".' },
  { name: 'a .pdf', content: pdfBytes(), message: 'Only CSV files can be checked. In Excel or Google Sheets, save or download the sheet as "CSV UTF-8".' },
  { name: 'Arabic names in Windows-1256', content: cp1256Bytes(), message: 'The file is not saved as UTF-8, so Arabic names would be garbled. Save it again as "CSV UTF-8".' },
  { name: '101 data rows', content: csv([HEADER_EN, ...rowsOf(101)]), message: 'The file has 101 people (or is over 64 KB); at most 100 per file. Split it into smaller files.' },
  {
    name: 'more than 64 KB', content: csv([HEADER_EN, ...rowsOf(70).map((r) => [r[0] + ' ' + 'x'.repeat(1000), ...r.slice(1)])]),
    message: 'The file has 70 people (or is over 64 KB); at most 100 per file. Split it into smaller files.',
  },
  { name: 'the header only', content: csv([HEADER_EN]), message: 'The file has no people under the first row.' },
  { name: 'an empty file', content: '', message: 'The file has no people under the first row.' },
  {
    name: 'a missing column', content: csv([HEADER_EN.slice(0, 4), valid(1).slice(0, 4)]),
    message: 'The first row must name exactly these five columns: Name, Username, Role, Mobile number, End date. Missing: End date. Not known: —.',
  },
  {
    name: 'an unknown column (a "space" column)', content: csv([[...HEADER_EN, 'Space'], [...valid(1), 'Nile Test Space']]),
    message: 'The first row must name exactly these five columns: Name, Username, Role, Mobile number, End date. Missing: —. Not known: "Space".',
  },
  {
    name: 'the same column twice', content: csv([['Name', ...HEADER_EN], ['Extra', ...valid(1)]]),
    message: 'The first row must name exactly these five columns: Name, Username, Role, Mobile number, End date. Missing: —. Not known: —. Named more than once: Name.',
  },
  {
    name: 'a password column (Password, in the middle)', content: csv([['Name', 'Username', 'Password', 'Role', 'Mobile number', 'End date'], ['A', 'a.t', 'x', 'Student', '01046464001', END]]),
    message: 'The file has a password column. Remove it: each new person sets their own password through a reset link.',
  },
  {
    name: 'a password column (كلمة المرور, at the end)', content: csv([[...HEADER_AR, 'كلمة المرور'], [...valid(2), 'x']]),
    message: 'The file has a password column. Remove it: each new person sets their own password through a reset link.',
  },
];

// ----------------------------------------------------------- AT-1.4 rows ----
/** One row per rule (AT-1.4): the fields, and the one reason (English) it must get; the last row passes. */
export function ruleRows(): { fields: string[]; reason: string | null }[] {
  const ok = (u: string): string[] => [`Rule ${u}`, u, 'Student', '01046465001', END];
  const set = (u: string, i: number, v: string) => Object.assign(ok(u), { [i]: v });
  const name = 'Name: 1 to 100 characters, on one line.';
  const user = 'Username: 3 to 32 characters: small letters a–z, digits, dot, dash or underscore.';
  const role = 'Role: only Teacher, Student or Parent.';
  const mobile = 'Mobile number cannot be read.';
  const end = 'End date: a real date from today, as 2027-06-30 or 30/06/2027.';
  return [
    { fields: set('r2.t', 0, ''), reason: name },
    { fields: set('r3.t', 0, 'N'.repeat(101)), reason: name },
    { fields: set('r4.t', 0, 'Two\nlines'), reason: name },
    { fields: set('', 1, 'Bad Name!'), reason: user },
    { fields: set('', 1, 'ab'), reason: user },
    { fields: set('', 1, ''), reason: user },
    { fields: ok('dup.t'), reason: 'This username is on more than one row: 8, 9.' },
    { fields: ok('DUP.T'), reason: 'This username is on more than one row: 8, 9.' },
    { fields: ok('salma.a'), reason: 'This username is already in use.' },
    { fields: ok('lina.t'), reason: 'This username is already in use.' },
    { fields: set('r12.t', 2, 'Administrator'), reason: role },
    { fields: set('r13.t', 2, 'owner'), reason: role },
    { fields: set('r14.t', 2, 'Pilot'), reason: role },
    { fields: set('r15.t', 2, ''), reason: role },
    { fields: set('r16.t', 3, 'abcdefghij'), reason: mobile },
    { fields: set('r17.t', 3, '0104'), reason: mobile },
    { fields: set('r18.t', 3, '2.01E+11'), reason: mobile },
    { fields: set('r19.t', 4, '2027-02-30'), reason: end },
    { fields: set('r20.t', 4, '2026-01-01'), reason: end },
    { fields: set('r21.t', 4, '06-30-2027'), reason: end },
    { fields: set('r22.t', 4, '2027-09-30'), reason: 'End date: not later than 2027-08-31.' },
    { fields: ok('r23.t').slice(0, 4), reason: 'This row has 4 fields; 5 are needed.' },
    { fields: [...ok('r24.t'), 'extra'], reason: 'This row has 6 fields; 5 are needed.' },
    { fields: ok('r25.t'), reason: null },
  ];
}
