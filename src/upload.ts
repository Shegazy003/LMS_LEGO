// LMS wave 3b, task W3b-1: add a class from a spreadsheet (product-contract v2
// on PIL-232, sections 4 to 7). Everything the upload does lives here: reading
// the file, the rules of section 5, the fingerprint and the repeat rule of
// section 4 step 4, and every statement on class_upload.
//
// Rules kept by every function here:
// - Nothing is kept on the server between the check and the add: the check
//   page carries the file's text and a fingerprint, and the add reads the text
//   again, runs every rule again and compares the fingerprint.
// - A check reads, and never writes: one statement (the username lookup, which
//   also gives this space's country code). The add reads the same statement once
//   and writes in one batch (all or nothing).
// - Space: the space is the address's, never the form's; every statement names
//   the space_id of every space table it touches.
// - No password is made or hashed: a new person gets the no-password value
//   (src/admin.ts) and sets a password through today's reset link.
// - Nothing from the file reaches a log line, and the file is never stored.
import { hasNoPassword, isAppointable, noPasswordValue, type Appointable } from './admin.ts';
import { sha256Hex } from './auth/encoding.ts';
import type { Db, Param } from './db.ts';
import { UI } from './i18n/ui.ts';
import { makeLabel, type KitJson, type Lang } from './labels.ts';
import { cleanDisplayName, isUsername } from './names.ts';
import { normaliseMobile } from './phone.ts';

/** At most this many people per file (contract A5: one constant). */
export const UPLOAD_MAX_ROWS = 100;
/** At most this many bytes per file, and of carried text in the add. */
export const UPLOAD_MAX_BYTES = 64 * 1024;
/** A request body beyond this is refused before it is read. */
export const UPLOAD_MAX_BODY = 1024 * 1024;

/** The five columns, by their ui.ts word (the header, the page and the empty sheet always agree). */
export const COLUMNS = ['displayName', 'username', 'roleField', 'mobile', 'endDate'] as const;
export type Column = (typeof COLUMNS)[number];

// ------------------------------------------------------------ the file ----

/** Why a whole file is refused (nothing is listed). */
export type FileRefusal =
  | { kind: 'notCsv' }
  | { kind: 'notUtf8' }
  | { kind: 'tooBig'; people: string }
  | { kind: 'empty' }
  | { kind: 'password' }
  | { kind: 'columns'; missing: Column[]; unknown: string[]; twice: Column[] };

const startsWith = (b: Uint8Array, sig: number[]) => sig.every((x, i) => b[i] === x);

/** The file's bytes as text (UTF-8, the byte-order mark dropped), or why it is not a CSV file. */
export function fileText(bytes: Uint8Array): { text: string } | FileRefusal {
  // A spreadsheet (.xlsx is a zip) or a PDF; any NUL byte means it is not text.
  if (startsWith(bytes, [0x50, 0x4b]) || startsWith(bytes, [0x25, 0x50, 0x44, 0x46]) || bytes.includes(0)) return { kind: 'notCsv' };
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return { kind: 'notUtf8' };
  }
  return { text: text.startsWith('﻿') ? text.slice(1) : text };
}

/** One record of the file: its row number as a spreadsheet shows it (the header is row 1) and its fields. */
interface Rec {
  row: number;
  fields: string[];
}

/** RFC 4180 records. A quoted field may hold the separator, quotes ("") and line breaks; a blank line is a record too. */
function records(text: string, sep: string): Rec[] {
  const out: Rec[] = [];
  let fields: string[] = [];
  let field = '';
  let quoted = false;
  let row = 1;
  const n = text.length;
  for (let i = 0; i < n; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === sep) {
      fields.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      fields.push(field);
      out.push({ row: row++, fields });
      fields = [];
      field = '';
      if (ch === '\r' && text[i + 1] === '\n') i++;
    } else field += ch;
  }
  if (field !== '' || fields.length || quoted) {
    fields.push(field);
    out.push({ row, fields });
  }
  return out;
}

const blank = (r: Rec) => r.fields.every((f) => f.trim() === '');

/** A word as compared: trimmed, spaces folded, Latin letters small, Arabic diacritics and tatweel left out. */
export const fold = (s: string) => s.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase().replace(/[ً-ْٰـ]/g, '');

const HEADER_WORDS = new Map<string, Column>();
for (const lang of ['ar', 'en'] as const) for (const col of COLUMNS) HEADER_WORDS.set(fold(UI[lang][col]), col);
const PASSWORD_WORDS = (['ar', 'en'] as const).flatMap((l) => [fold(UI[l].newPassword), fold(UI[l].firstPassword)]);
const isPasswordHeader = (h: string) => h.includes('password') || h.includes(fold('كلمة المرور')) || PASSWORD_WORDS.includes(h);

/** The header and the data rows, or why the whole file is refused. */
export function readFile(text: string): { columns: Column[]; rows: Rec[] } | FileRefusal {
  const firstLine = text.slice(0, text.search(/[\r\n]|$/));
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const all = records(text, sep);
  const rows = all.slice(1).filter((r) => !blank(r));
  const tooBig = rows.length > UPLOAD_MAX_ROWS || new TextEncoder().encode(text).length > UPLOAD_MAX_BYTES;
  if (tooBig) return { kind: 'tooBig', people: String(rows.length) };
  const header = (all[0]?.fields ?? []).map(fold);
  if (header.some(isPasswordHeader)) return { kind: 'password' };
  if (!rows.length) return { kind: 'empty' };
  const columns: Column[] = [];
  const unknown: string[] = [];
  const twice: Column[] = [];
  header.forEach((h, i) => {
    const col = HEADER_WORDS.get(h);
    if (!col) unknown.push((all[0].fields[i] ?? '').trim());
    else if (columns.includes(col)) {
      if (!twice.includes(col)) twice.push(col);
    } else columns.push(col);
  });
  const missing = COLUMNS.filter((c) => !columns.includes(c));
  if (missing.length || unknown.length || twice.length) return { kind: 'columns', missing, unknown, twice };
  return { columns: header.map((h) => HEADER_WORDS.get(h)!), rows };
}

// ------------------------------------------------------------- the rows ----

/** Why one row is refused (every reason of the row is listed). */
export type Reason =
  | { key: 'rowName' }
  | { key: 'rowUsername' }
  | { key: 'rowUsernameTwice'; rows: number[] }
  | { key: 'rowUsernameTaken' }
  | { key: 'rowRole' }
  | { key: 'rowRoleUnclear' }
  | { key: 'rowMobile' }
  | { key: 'rowEndDate' }
  | { key: 'rowEndDateOwn' }
  | { key: 'rowFields'; n: number };

/** What a row that passes becomes: exactly what today's appoint form makes, but the password. */
export interface NewPerson {
  displayName: string;
  username: string;
  role: Appointable;
  mobile: string;
  validUntil: string;
}

export interface CheckedRow {
  row: number;
  /** As typed in the file (shown escaped, in its own <bdi>). */
  name: string;
  username: string;
  reasons: Reason[];
  /** Set when the row passes. */
  person: NewPerson | null;
}

/** What the rules need to know about the space and the admin. */
export interface Place {
  spaceId: string;
  adminId: string;
  kit: KitJson;
  today: string;
  /** The admin's own end date. */
  ownEnd: string;
}

/** Arabic-Indic and Eastern Arabic-Indic digits read as digits. */
const digits = (s: string) => s.replace(/[٠-٩۰-۹]/g, (d) => String((d.charCodeAt(0) - 0x0660) % 0x90 % 10));

/** YYYY-MM-DD or DD/MM/YYYY (day first) as a real date, in YYYY-MM-DD; otherwise null. */
export function readDate(raw: string): string | null {
  const s = digits(raw).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const [y, m, d] = iso ? [iso[1], iso[2], iso[3]] : dmy ? [dmy[3], dmy[2], dmy[1]] : [];
  if (!y) return null;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  const text = `${y}-${m!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
  return date.toISOString().slice(0, 10) === text ? text : null;
}

/** The role words of this space: its kit's words in its languages and the codes; a word naming two roles is unclear. */
function roleWords(kit: KitJson): Map<string, Appointable | 'unclear'> {
  const words = new Map<string, Appointable | 'unclear'>();
  const add = (w: string, role: Appointable) => {
    const k = fold(w);
    const had = words.get(k);
    words.set(k, had && had !== role ? 'unclear' : role);
  };
  for (const lang of kit.languages) {
    const t = makeLabel(lang, kit);
    for (const role of ['publisher', 'learner', 'guardian'] as const) add(t(role), role);
  }
  for (const role of ['publisher', 'learner', 'guardian'] as const) if (!words.has(role)) words.set(role, role);
  return words;
}

/** Every row checked against the rules of section 5, given which usernames are in use anywhere in the product. */
export function checkRows(place: Place, countryCode: string, columns: Column[], rows: Rec[], taken: ReadonlySet<string>): CheckedRow[] {
  const roles = roleWords(place.kit);
  const at = (r: Rec, col: Column) => r.fields[columns.indexOf(col)] ?? '';
  const typedName = (r: Rec) => at(r, 'username').trim().toLowerCase();
  const seen = new Map<string, number[]>();
  for (const r of rows) {
    const u = typedName(r);
    if (u && r.fields.length === COLUMNS.length) seen.set(u, [...(seen.get(u) ?? []), r.row]);
  }
  return rows.map((r) => {
    const out: CheckedRow = { row: r.row, name: at(r, 'displayName'), username: at(r, 'username'), reasons: [], person: null };
    if (r.fields.length !== COLUMNS.length) {
      out.reasons.push({ key: 'rowFields', n: r.fields.length });
      return out;
    }
    const displayName = cleanDisplayName(at(r, 'displayName'));
    if (!displayName) out.reasons.push({ key: 'rowName' });
    const username = typedName(r);
    if (!isUsername(username)) out.reasons.push({ key: 'rowUsername' });
    const same = seen.get(username) ?? [];
    if (username && same.length > 1) out.reasons.push({ key: 'rowUsernameTwice', rows: same });
    if (isUsername(username) && taken.has(username)) out.reasons.push({ key: 'rowUsernameTaken' });
    const role = roles.get(fold(at(r, 'roleField')));
    if (role === 'unclear') out.reasons.push({ key: 'rowRoleUnclear' });
    else if (!role) out.reasons.push({ key: 'rowRole' });
    const mobile = normaliseMobile(digits(at(r, 'mobile')), countryCode);
    if (!mobile) out.reasons.push({ key: 'rowMobile' });
    const end = readDate(at(r, 'endDate'));
    if (!end || end < place.today) out.reasons.push({ key: 'rowEndDate' });
    else if (end > place.ownEnd) out.reasons.push({ key: 'rowEndDateOwn' });
    if (!out.reasons.length && displayName && mobile && end && role && role !== 'unclear' && isAppointable(role)) {
      out.person = { displayName, username, role, mobile, validUntil: end };
    }
    return out;
  });
}

/** The fingerprint the check page carries: SHA-256 of the space, the admin, today and the exact rows to add. */
export function fingerprint(place: Place, add: readonly CheckedRow[]): Promise<string> {
  const rows = add.map((r) => [r.row, r.person!.displayName, r.person!.username, r.person!.role, r.person!.mobile, r.person!.validUntil]);
  return sha256Hex(JSON.stringify([place.spaceId, place.adminId, place.today, rows]));
}

// ----------------------------------------------------------- the reads ----

/** What the one lookup says about a username: held by an account anywhere, and (in this space) by which upload and uploader. */
export interface Holder {
  username: string;
  class_upload_id: string | null;
  uploaded_by: string | null;
}

/** The one read of a check or an add: this space's country code, and every account (in any space) holding one of
 * the file's usernames, with, for this space, the upload that added the holder and who made it. One statement,
 * three bound values whatever the number of usernames (they go in as one JSON list). */
export async function lookup(db: Db, spaceId: string, usernames: readonly string[]): Promise<{ countryCode: string; holders: Holder[] }> {
  const rows = await db.all<Holder & { cc: string }>(
    `SELECT s.default_country_code AS cc, u.username, m.class_upload_id, cu.uploaded_by
       FROM space s
       LEFT JOIN user u ON u.username IN (SELECT value FROM json_each(?))
       LEFT JOIN membership m ON m.user_id = u.id AND m.space_id = s.id
       LEFT JOIN class_upload cu ON cu.id = m.class_upload_id AND cu.space_id = s.id
      WHERE s.id = ?`,
    JSON.stringify(usernames), spaceId,
  );
  return { countryCode: rows[0]?.cc ?? '', holders: rows.filter((r) => r.username !== null) };
}

/** The usernames of a file's rows worth looking up (valid ones, once each). */
export function usernamesOf(columns: Column[], rows: readonly Rec[]): string[] {
  const i = columns.indexOf('username');
  return [...new Set(rows.map((r) => (r.fields[i] ?? '').trim().toLowerCase()).filter(isUsername))];
}

// ------------------------------------------------------- check and add ----

export interface Checked {
  /** The non-blank data rows (the count of the summary). */
  rows: number;
  refused: CheckedRow[];
  add: CheckedRow[];
  fingerprint: string;
}

/** The check of a file's text: whole-file refusal, or every row with its reasons and the fingerprint. One read. */
export async function check(db: Db, place: Place, text: string): Promise<{ refusal: FileRefusal } | ({ text: string; holders: Holder[]; columns: Column[]; recs: Rec[]; countryCode: string } & Checked)> {
  const file = readFile(text);
  if ('kind' in file) return { refusal: file };
  const { countryCode, holders } = await lookup(db, place.spaceId, usernamesOf(file.columns, file.rows));
  const checked = checkRows(place, countryCode, file.columns, file.rows, new Set(holders.map((h) => h.username)));
  const add = checked.filter((r) => r.person);
  return {
    text, holders, columns: file.columns, recs: file.rows, countryCode,
    rows: checked.length, refused: checked.filter((r) => !r.person), add, fingerprint: await fingerprint(place, add),
  };
}

/** The repeat rule (section 4 step 4): the upload of this space by this admin that already added this very form, or null.
 * The rows refused only as "already in use" must all be held by people of one earlier upload of this space made by
 * this admin, and the fingerprint computed as if those usernames were free must equal the carried one. */
export async function repeatOf(
  place: Place, c: { holders: Holder[]; columns: Column[]; recs: Rec[]; countryCode: string; refused: CheckedRow[] }, carried: string,
): Promise<string | null> {
  const takenOnly = c.refused.filter((r) => r.reasons.length === 1 && r.reasons[0].key === 'rowUsernameTaken');
  if (!takenOnly.length) return null;
  const names = new Set(takenOnly.map((r) => r.username.trim().toLowerCase()));
  const held = c.holders.filter((h) => names.has(h.username));
  const upload = held[0]?.class_upload_id ?? null;
  if (!upload || !held.every((h) => h.class_upload_id === upload && h.uploaded_by === place.adminId)) return null;
  if (![...names].every((n) => held.some((h) => h.username === n))) return null;
  const free = new Set([...c.holders.map((h) => h.username)].filter((n) => !names.has(n)));
  const again = checkRows(place, c.countryCode, c.columns, c.recs, free).filter((r) => r.person);
  return (await fingerprint(place, again)) === carried ? upload : null;
}

/** The add's one batch (all or nothing): the upload row, then each person's account and membership. Returns the upload's id. */
export async function addPeople(db: Db, place: Place, v: { add: readonly CheckedRow[]; refused: number; iterations: number; now: number }): Promise<string> {
  const uploadId = crypto.randomUUID();
  const statements: [string, ...Param[]][] = [[
    'INSERT INTO class_upload (id, space_id, uploaded_by, uploaded_at, lines_added, lines_refused) VALUES (?, ?, ?, ?, ?, ?)',
    uploadId, place.spaceId, place.adminId, v.now, v.add.length, v.refused,
  ]];
  for (const r of v.add) {
    const p = r.person!;
    const userId = crypto.randomUUID();
    statements.push(
      [
        'INSERT INTO user (id, username, password_hash, display_name, mobile, is_owner, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)',
        userId, p.username, noPasswordValue(v.iterations), p.displayName, p.mobile, v.now,
      ],
      // The upload is taken from this space's own row in the same statement, so a membership never names another space's upload.
      [
        `INSERT INTO membership (id, space_id, user_id, role, valid_from, valid_until, granted_by, class_upload_id)
         SELECT ?, cu.space_id, ?, ?, ?, ?, cu.uploaded_by, cu.id FROM class_upload cu WHERE cu.id = ? AND cu.space_id = ?`,
        crypto.randomUUID(), userId, p.role, place.today, p.validUntil, uploadId, place.spaceId,
      ],
    );
  }
  await db.batch(statements);
  return uploadId;
}

// ------------------------------------------------------------ done page ----

export interface UploadRow {
  id: string;
  uploaded_at: number;
  lines_added: number;
  lines_refused: number;
  uploader: string;
}

export interface AddedPerson {
  id: string;
  display_name: string;
  username: string;
  role: string;
  no_password: boolean;
}

/** One upload of this space (another space's or an unknown id finds nothing), and the people it added. Two reads. */
export async function uploadOf(db: Db, spaceId: string, uploadId: string): Promise<{ upload: UploadRow; people: AddedPerson[] } | null> {
  const upload = await db.first<UploadRow>(
    `SELECT cu.id, cu.uploaded_at, cu.lines_added, cu.lines_refused, u.display_name AS uploader
       FROM class_upload cu JOIN user u ON u.id = cu.uploaded_by
      WHERE cu.id = ? AND cu.space_id = ?`,
    uploadId, spaceId,
  );
  if (!upload) return null;
  const rows = await db.all<Omit<AddedPerson, 'no_password'> & { password_hash: string }>(
    `SELECT u.id, u.display_name, u.username, m.role, u.password_hash
       FROM membership m JOIN user u ON u.id = m.user_id
      WHERE m.space_id = ? AND m.class_upload_id = ?
      ORDER BY u.display_name, u.username`,
    spaceId, upload.id,
  );
  return { upload, people: rows.map(({ password_hash, ...p }) => ({ ...p, no_password: hasNoPassword(password_hash) })) };
}

// ------------------------------------------- the follow-up (W3b-1b) ----

/** How many earlier uploads the upload page lists (ux-plan UX-40). */
export const UPLOADS_LISTED = 10;

/** This space's latest uploads, newest first, at most UPLOADS_LISTED (UX-40, AT-5.2). One read. */
export function uploadsOf(db: Db, spaceId: string): Promise<UploadRow[]> {
  return db.all<UploadRow>(
    `SELECT cu.id, cu.uploaded_at, cu.lines_added, cu.lines_refused, u.display_name AS uploader
       FROM class_upload cu JOIN user u ON u.id = cu.uploaded_by
      WHERE cu.space_id = ?
      ORDER BY cu.uploaded_at DESC, cu.id DESC
      LIMIT ?`,
    spaceId, UPLOADS_LISTED,
  );
}

/** Whether `back` names an upload of this space that added this person (section 4 step 5): only then do
 * the reset-link pages show "Back to the upload". One read; anything else is ignored. */
export async function isBackFor(db: Db, spaceId: string, uploadId: string, userId: string): Promise<boolean> {
  const row = await db.first<{ ok: number }>(
    `SELECT 1 AS ok FROM membership m JOIN class_upload cu ON cu.id = m.class_upload_id AND cu.space_id = m.space_id
      WHERE m.space_id = ? AND m.user_id = ? AND cu.id = ?`,
    spaceId, userId, uploadId,
  );
  return !!row;
}

/** The columns' words in a language, for the how-to, the messages and the empty sheet. */
export const columnWords = (lang: Lang) => COLUMNS.map((c) => UI[lang][c]);
