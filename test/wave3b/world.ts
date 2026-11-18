// The made-up world of LMS wave 3b, task W3b-1 (product-contract v2 on PIL-232,
// section 3, "Test-world additions"): the wave 3a world (test/wave3a/world.ts:
// the wave 1 world with Mona, a guardian, and Rami) plus
// - W3b-a: a second space, "Nile Test Space" (School kit), with its admin Nour
//   Test and one learner, Lina Test (lina.t), made only by the tests that need it;
// - W3b-b: class-mixed.csv, and W3b-d: class-tricky.csv, built here (every
//   other fixture too, including the Windows-1256 and .xlsx bytes);
// - W3b-c: Amal's own end date in Mesk School is 2027-08-31 in every copy.
// Every step name starts with "W3b " and its label (or the UX id). The wave-3b
// CI job runs the product in this process (LMS_TEST_RUNTIME=in-process), so the
// statement spy and the forced faults are available. Made-up names and
// numbers only (mobile numbers in the 0104 range the earlier tests use).
import assert from 'node:assert/strict';
import { Client, utcDatePlusDays } from '../support/http.ts';
import { appointAdmin, createSpace, seed, signedIn } from '../support/seed.ts';
import { ADMIN, wave3aWorld, type Wave3aWorld } from '../wave3a/world.ts';

export * from '../wave3a/world.ts';

/** W3b-c: Amal's own end date in Mesk School. */
export const AMAL_END = '2027-08-31';
/** The end date most fixture rows carry (before AMAL_END). */
export const END = '2027-06-30';

export async function wave3bWorld(): Promise<Wave3aWorld> {
  const w = await wave3aWorld();
  try {
    if (w.p.runtime !== 'in-process') assert.fail('wave 3b tests run in-process: set LMS_TEST_RUNTIME=in-process');
    await w.p.sql(`UPDATE membership SET valid_until = '${AMAL_END}' WHERE space_id = '${w.school.id}' AND role = 'admin'
      AND user_id = (SELECT id FROM user WHERE username = '${ADMIN.username}')`);
    return w;
  } catch (err) {
    await w.close();
    throw err;
  }
}

/** W3b-a: Nile Test Space, its admin Nour Test and the learner Lina Test (lina.t). */
export const NOUR = { display_name: 'Nour Test', username: 'nour.w3b', password: 'nour-wave3b-pass', mobile: '01046460000' };
export const LINA = { display_name: 'Lina Test', username: 'lina.t', password: 'lina-wave3b-pass', role: 'learner' as const, mobile: '01046460001' };

const niles = new WeakMap<Wave3aWorld, Promise<{ id: string; nour: Client }>>();
/** Made once per world (several tests of one file may ask for it). */
export function withNile(w: Wave3aWorld): Promise<{ id: string; nour: Client }> {
  let nile = niles.get(w);
  if (!nile) {
    nile = (async () => {
      const id = await createSpace(w.owner, { name: 'Nile Test Space', kit: 'school' });
      await appointAdmin(w.owner, id, { ...NOUR, valid_until: utcDatePlusDays(60) });
      await seed(w.p.url, { spaceId: id, grantedBy: NOUR.username, people: [{ ...LINA, valid_until: utcDatePlusDays(30) }] });
      return { id, nour: await signedIn(w.p.url, NOUR.username, NOUR.password) };
    })();
    niles.set(w, nile);
  }
  return nile;
}

// ------------------------------------------------------------- fixtures ----

/** One CSV field, quoted when it holds the separator, a quote or a line break (RFC 4180). */
const cell = (v: string, sep: string) => (v.includes(sep) || v.includes('"') || /[\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** A CSV text from rows of fields (the first row is the header). */
export function csv(rows: readonly (readonly string[])[], sep = ',', eol = '\r\n'): string {
  return rows.map((r) => r.map((v) => cell(v, sep)).join(sep)).join(eol) + eol;
}

export const HEADER_EN = ['Name', 'Username', 'Role', 'Mobile number', 'End date'];
export const HEADER_AR = ['الاسم', 'اسم المستخدم', 'الدور', 'رقم الهاتف المحمول', 'تاريخ الانتهاء'];

/** W3b-b: 12 data rows (rows 2 to 13): 8 pass, 4 are refused (rows 4, 9, 11 and 12). */
export const MIXED: string[][] = [
  HEADER_EN,
  ['Huda Test', 'huda.t', 'Student', '01046461001', END], // 2 learner
  ['ليلى اختبار', 'layla.t', 'طالب', '01046461002', '30/06/2027'], // 3 learner
  ['Omar Copy', 'omar.c', 'Student', '0104x', END], // 4 refused: in use, and the mobile cannot be read
  ['Test, Karim', 'karim.t', 'Student', '01046461003', END], // 5 learner, a comma inside quotes
  ['سامي اختبار', 'sami.t', 'Student', '01046461004', END], // 6 learner
  ['Mariam Test', 'mariam.t', 'Student', '01046461005', END], // 7 learner
  ['Fatma Test', 'fatma.t', 'Parent', '01046461006', END], // 8 guardian
  ['Adel Test', 'adel.t', 'Administrator', '01046461007', END], // 9 refused: role
  ['هالة اختبار', 'hala.t', 'ولي أمر', '01046461008', END], // 10 guardian
  ['Rana Test', 'rana.t', 'Student', '01046461009', END], // 11 refused: twice
  ['Rana Other', 'RANA.T', 'Student', '01046461010', END], // 12 refused: twice
  ['Tarek Test', 'tarek.t', 'Teacher', '01046461011', END], // 13 publisher
];
/** The usernames class-mixed.csv adds, and their full numbers in international form. */
export const MIXED_ADDED = ['huda.t', 'layla.t', 'karim.t', 'sami.t', 'mariam.t', 'fatma.t', 'hala.t', 'tarek.t'];
export const MIXED_NUMBERS = [1, 2, 3, 4, 5, 6, 8, 11].map((n) => `+2010464610${String(n).padStart(2, '0')}`);
export const classMixed = () => csv(MIXED);

/** W3b-d: names that must stay text. */
export const TRICKY_NAMES = ['Test "><script>alert(1)</script>', 'Test </textarea><b>x</b>', 'Test ‮abc', '=1+1 Test'];
export const classTricky = () => csv([
  HEADER_EN,
  ...TRICKY_NAMES.map((n, i) => [n, `tricky${i + 1}.t`, 'Student', `0104646200${i + 1}`, END]),
]);

/** A minimal real .xlsx (a zip with its first entry), a PDF, and Arabic names in Windows-1256: whole-file refusals. */
export function xlsxBytes(): Uint8Array {
  // A local file header of "[Content_Types].xml" (stored, empty), then the end of the central directory.
  const name = Buffer.from('[Content_Types].xml');
  const local = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, name.length, 0, 0, 0]), name]);
  const end = Buffer.from([0x50, 0x4b, 0x05, 0x06, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  return new Uint8Array(Buffer.concat([local, end]));
}
export const pdfBytes = () => new TextEncoder().encode('%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n');
/** "الاسم" and a learner name in Windows-1256 (bytes that are not valid UTF-8). */
export function cp1256Bytes(): Uint8Array {
  const map: Record<string, number> = { 'ا': 0xc7, 'ل': 0xe1, 'س': 0xd3, 'م': 0xe3, 'ي': 0xed, 'ى': 0xec, 'ه': 0xe5, 'ة': 0xc9 };
  const enc = (s: string) => [...s].map((ch) => map[ch] ?? ch.charCodeAt(0));
  const text = ['Name,Username,Role,Mobile number,End date', 'ليلى,layla.w,Student,01046461099,2027-06-30', ''].join('\r\n');
  return new Uint8Array(enc(text));
}

/** A multipart form with one file, as the upload page's form sends it. */
export function fileForm(content: string | Uint8Array, name = 'class.csv', type = 'text/csv'): FormData {
  const f = new FormData();
  f.set('file', new Blob([typeof content === 'string' ? new TextEncoder().encode(content) : content], { type }), name);
  return f;
}

// ---------------------------------------------------------------- pages ----

export const uploadPath = (s: { id: string }) => `/s/${s.id}/admin/upload`;
export const checkPath = (s: { id: string }) => `/s/${s.id}/admin/upload/check`;
export const addPath = (s: { id: string }) => `/s/${s.id}/admin/upload/add`;
export const sheetPath = (s: { id: string }) => `/s/${s.id}/admin/upload/sheet.csv`;
export const donePath = (s: { id: string }, uploadId: string) => `/s/${s.id}/admin/upload/${uploadId}`;

/** The check of a file's text (or bytes) by a client. */
export const checkFile = (c: Client, s: { id: string }, content: string | Uint8Array, name?: string, type?: string) => c.post(checkPath(s), fileForm(content, name, type));

const attr = (html: string, name: string) => {
  const m = new RegExp(`<input type="hidden" name="${name}" value="([^"]*)">`).exec(html);
  return m ? m[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&') : null;
};

/** The carried form of a check page: the file's text and the fingerprint (null when there is no Add form). */
export function carriedForm(html: string): { text: string; fp: string } | null {
  const text = attr(html, 'text');
  const fp = attr(html, 'fp');
  return text === null || fp === null ? null : { text, fp };
}

/** Presses Add with a carried form (or an edited one). */
export const pressAdd = (c: Client, s: { id: string }, form: { text: string; fp: string }, extra: Record<string, string> = {}) =>
  c.post(addPath(s), { text: form.text, fp: form.fp, ...extra });

/** The upload id of a done-page address. */
export function uploadIdOf(location: string | null): string {
  const m = /\/admin\/upload\/([0-9a-f-]{36})(?:\?|$)/.exec(location ?? '');
  assert.ok(m, `a done-page address: ${location}`);
  return m[1];
}

// ------------------------------------------------------------- database ----

/** Every row of every table, as plain objects in a fixed order (the snapshot), with or without usage_day. */
export async function snapshot(w: Wave3aWorld, opts: { usage?: boolean } = {}): Promise<Record<string, unknown[]>> {
  const tables = (await w.p.sql("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")).map((r) => String(r.name));
  const out: Record<string, unknown[]> = {};
  for (const t of tables) {
    if (t === 'usage_day' && !opts.usage) continue;
    const rows = await w.p.sql(`SELECT * FROM "${t}"`);
    out[t] = rows.map((r) => JSON.stringify(Object.fromEntries(Object.entries(r)))).sort();
  }
  return out;
}

/** Runs a request under the statement spy: every statement it ran (and after the response, the usage flush). */
export async function spied<T>(w: Wave3aWorld, run: () => Promise<T>): Promise<{ result: T; statements: string[] }> {
  w.p.spy!.start();
  const result = await run();
  return { result, statements: await w.p.spy!.stop() };
}

/** Statements that write (anything but a read). */
export const writes = (statements: string[]) => statements.filter((s) => !/^\s*(SELECT|WITH)\b/i.test(s));

/** The no-password marker in a stored value (src/admin.ts). */
export const NO_PASSWORD = /^pbkdf2-sha256\$\d+\$AAAAAAAAAAAAAAAAAAAAAA\$[A-Za-z0-9_-]{43}$/;
