// AT-4 guard: a space never reads another space's rows.
//
// Three layers, each a test:
// 1. Every query in the code that touches a space's table names that table's
//    space_id (a static scan of every SQL statement under src/).
// 2. The database itself: every space table carries space_id, and a child row
//    cannot point at a parent in another space.
// 3. The running product: a learner and an admin of space A get nothing of
//    space B by direct address, with B's real ids, whether they ask under B's
//    address or slip B's ids into A's address. Positive controls first, so a
//    refusal means isolation and not a missing page.
import { describe, it, before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startWorker, type RunningWorker } from '../support/worker.ts';
import { tinyPng, utcDatePlusDays } from '../support/http.ts';
import { appointAdmin, b64, createSpace, seed, setUpOwner, signedIn, tinyPdf, type SeedResult } from '../support/seed.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));

// Tables whose rows belong to one space. A query on any of them must say which.
const SPACE_TABLES = ['membership', 'group', 'group_member', 'subject', 'subject_access', 'chapter', 'lesson', 'material'];
// Product-level tables (docs/02-LEGO-MODEL.md and migrations/0001_init.sql),
// and from task 4: reset_link (keyed by the person, like session; it records
// the space whose name and language its page shows) and attempt_limit (failed
// sign-in counts per username and per client; see src/auth/limits.ts).
const PRODUCT_TABLES = ['user', 'kit', 'session', 'usage_day', 'space', 'reset_link', 'attempt_limit'];

// ------------------------------------------------------------ 1. static ----
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? sourceFiles(p) : p.endsWith('.ts') ? [p] : [];
  });
}

/** Every SQL statement written as a string literal in a source text. */
export function sqlStatements(source: string): string[] {
  const out: string[] = [];
  const literal = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;
  for (const m of source.matchAll(literal)) {
    const s = m[1] ?? m[2] ?? m[3] ?? '';
    if (/^\s*(SELECT|INSERT|UPDATE|DELETE|WITH)\s/.test(s)) out.push(s.replace(/\s+/g, ' ').trim());
  }
  return out;
}

const KEYWORDS = new Set(['where', 'on', 'join', 'left', 'inner', 'cross', 'order', 'group', 'limit', 'set', 'using', 'values', 'as']);

/** Reasons a statement may read or write across spaces (empty when it is scoped). */
export function unscoped(sql: string): string[] {
  const problems: string[] = [];
  if (sql.includes('${')) problems.push('SQL assembled from pieces cannot be checked; write the whole statement');
  const tables = SPACE_TABLES.join('|');
  const ref = new RegExp(`\\b(FROM|JOIN|INTO|UPDATE)\\s+"?(${tables})"?(?![\\w"])(?:\\s+(?:AS\\s+)?([a-z_][a-z0-9_]*))?`, 'gi');
  for (const m of sql.matchAll(ref)) {
    const [, verb, table, maybeAlias] = m;
    const alias = maybeAlias && !KEYWORDS.has(maybeAlias.toLowerCase()) ? maybeAlias : null;
    if (/^into$/i.test(verb)) {
      const cols = sql.slice((m.index ?? 0) + m[0].length).match(/^\s*\(([^)]*)\)/)?.[1] ?? '';
      if (!/\bspace_id\b/.test(cols)) problems.push(`INSERT INTO ${table} without space_id`);
      continue;
    }
    const needle = alias ? new RegExp(`\\b${alias}\\.space_id\\b`) : /\bspace_id\b/;
    if (!needle.test(sql)) problems.push(`${table}${alias ? ` ${alias}` : ''} is used without ${alias ? `${alias}.` : ''}space_id`);
  }
  return problems;
}

test('space guard: the scanner catches a query that forgets the space (self-check)', () => {
  assert.deepEqual(unscoped('SELECT id, title FROM subject WHERE id = ?'), ['subject is used without space_id']);
  assert.deepEqual(unscoped('SELECT l.title FROM lesson l WHERE l.id = ?'), ['lesson l is used without l.space_id']);
  assert.equal(unscoped('SELECT m.id FROM material m JOIN lesson l ON l.id = m.lesson_id WHERE m.id = ? AND m.space_id = ?').length, 1, 'the joined lesson needs its own space_id');
  assert.deepEqual(unscoped('SELECT g.id FROM "group" g WHERE g.name = ?'), ['group g is used without g.space_id']);
  assert.deepEqual(unscoped('INSERT INTO chapter (id, subject_id, title, position) VALUES (?, ?, ?, ?)'), ['INSERT INTO chapter without space_id']);
  assert.deepEqual(unscoped('DELETE FROM subject_access WHERE subject_id = ?'), ['subject_access is used without space_id']);
  assert.ok(unscoped('SELECT s.id FROM subject s WHERE s.id = ? AND ${clause}').some((p) => p.startsWith('SQL assembled')));
  // Scoped statements pass.
  assert.deepEqual(unscoped('SELECT l.title FROM lesson l JOIN chapter c ON c.id = l.chapter_id AND c.space_id = l.space_id WHERE l.id = ? AND l.space_id = ?'), []);
  assert.deepEqual(unscoped('INSERT INTO material (id, space_id, lesson_id) VALUES (?, ?, ?)'), []);
  assert.deepEqual(unscoped('SELECT id FROM session WHERE id = ?'), [], 'product tables are not space tables');
  assert.deepEqual(unscoped('SELECT 1 FROM subject_access a WHERE a.space_id = ? AND a.subject_id = ?'), []);
  assert.deepEqual(sqlStatements("db.first('SELECT 1 AS one FROM user WHERE is_owner = 1'); const x = 'Select a file';"), ['SELECT 1 AS one FROM user WHERE is_owner = 1']);
});

test('space guard: every query under src/ that touches a space table names its space_id', () => {
  const offences: string[] = [];
  let checked = 0;
  for (const file of sourceFiles(join(root, 'src'))) {
    for (const sql of sqlStatements(readFileSync(file, 'utf8'))) {
      checked++;
      for (const p of unscoped(sql)) offences.push(`${relative(root, file)}: ${p}\n    ${sql.slice(0, 160)}`);
    }
  }
  assert.ok(checked >= 20, `expected the product's queries to be found, found ${checked}`);
  assert.deepEqual(offences, [], 'scope every query on a space table by space_id');
});

// --------------------------------------------- 2 and 3. database, product ----
const SPACE_A = 'مدرسة مسك';
const SPACE_B = 'Delta Logistics';
const ADMIN_A = { display_name: 'Amal Hassan', username: 'amal.admin', password: 'admin-a-pass', mobile: '01012345678' };
const ADMIN_B = { display_name: 'Basem Fawzy', username: 'basem.admin', password: 'admin-b-pass', mobile: '01087654321' };
const LEARNER_A = { username: 'salma.learner', password: 'learner-a-pass', display_name: 'Salma Adel', mobile: '01033334444', role: 'learner' as const };
const LEARNER_B = { username: 'karim.employee', password: 'learner-b-pass', display_name: 'Karim Said', mobile: '01055556666', role: 'learner' as const };
const PDF_B = tinyPdf('Forklift safety');
const SECRET = ['Forklift safety', 'Loading dock', 'Pallet rules', 'Safety sheet', 'Dock photo', 'B-only note text'];

let worker: RunningWorker;
let spaceA = '';
let spaceB = '';
let a: SeedResult;
let b: SeedResult;

function contentIds(r: SeedResult, subject: string, chapter: string, lesson: string) {
  const s = r.subjects[subject];
  const l = s.chapters[chapter].lessons[lesson];
  return { subject: s.id, chapter: s.chapters[chapter].id, lesson: l.id, materials: Object.values(l.materials) };
}

describe('space guard: the database and the running product keep spaces apart', { concurrency: false }, () => {
  before(async () => {
    worker = await startWorker();
    const owner = await setUpOwner(worker.url);
    spaceA = await createSpace(owner, { name: SPACE_A, kit: 'school' });
    spaceB = await createSpace(owner, { name: SPACE_B, kit: 'company', languages: 'en,ar' });
    await appointAdmin(owner, spaceA, { ...ADMIN_A, valid_until: utcDatePlusDays(60) });
    await appointAdmin(owner, spaceB, { ...ADMIN_B, valid_until: utcDatePlusDays(60) });
    const lessonWith = (title: string, prefix: string) => ({
      title,
      materials: [
        { kind: 'pdf' as const, title: `${prefix} sheet`, base64: b64(prefix === 'Safety' ? PDF_B : tinyPdf('Fractions')), contentType: 'application/pdf' },
        { kind: 'image' as const, title: `${prefix} photo`, base64: b64(tinyPng()), contentType: 'image/png' },
        { kind: 'link' as const, title: `${prefix} link`, url: 'https://example.org/' + prefix.toLowerCase() },
        { kind: 'note' as const, title: `${prefix} note`, text: prefix === 'Safety' ? 'B-only note text' : 'A note' },
      ],
    });
    a = await seed(worker.url, {
      spaceId: spaceA,
      grantedBy: ADMIN_A.username,
      people: [{ ...LEARNER_A, valid_until: utcDatePlusDays(30) }],
      subjects: [{ title: 'Mathematics', published: true, users: [LEARNER_A.username], chapters: [{ title: 'Fractions', lessons: [lessonWith('Adding fractions', 'Fractions')] }] }],
    });
    b = await seed(worker.url, {
      spaceId: spaceB,
      grantedBy: ADMIN_B.username,
      people: [{ ...LEARNER_B, valid_until: utcDatePlusDays(30) }],
      // B's subject is also "assigned" to A's learner by user id: only the
      // space boundary can keep it out of A.
      subjects: [{ title: 'Forklift safety', published: true, users: [LEARNER_B.username, LEARNER_A.username], chapters: [{ title: 'Loading dock', lessons: [lessonWith('Pallet rules', 'Safety')] }] }],
    });
  });

  after(async () => {
    await worker?.stop();
  });

  it('every space table carries space_id and every child refers to its parent together with space_id', async () => {
    const tables = (await worker.sql("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations'")).map((r) => String(r.name));
    for (const t of SPACE_TABLES) assert.ok(tables.includes(t), `table ${t} exists`);
    const unknown = tables.filter((t) => !SPACE_TABLES.includes(t) && !PRODUCT_TABLES.includes(t));
    assert.deepEqual(unknown, [], 'every table is listed here as a space table or a product table');
    // D1 allows the pragma functions with a table name (not joined to
    // sqlite_master) and only a few terms per compound SELECT: ask in fours.
    const union = async (each: (t: string) => string) => {
      const rows: Record<string, unknown>[] = [];
      for (let i = 0; i < SPACE_TABLES.length; i += 4) rows.push(...(await worker.sql(SPACE_TABLES.slice(i, i + 4).map(each).join(' UNION ALL '))));
      return rows;
    };
    const columns = await union((t) => `SELECT '${t}' AS tbl, name AS col, "notnull" AS nn FROM pragma_table_info('${t}')`);
    const keys = await union((t) => `SELECT '${t}' AS tbl, "id" AS id, "table" AS parent, "from" AS col FROM pragma_foreign_key_list('${t}')`);
    for (const t of SPACE_TABLES) {
      assert.ok(columns.some((r) => r.tbl === t && r.col === 'space_id' && Number(r.nn) === 1), `${t}.space_id is required`);
      const fks = keys.filter((k) => k.tbl === t);
      const parents = fks.filter((f) => SPACE_TABLES.includes(String(f.parent)));
      for (const fk of parents) {
        const cols = fks.filter((f) => f.id === fk.id).map((f) => String(f.col));
        assert.ok(cols.includes('space_id'), `${t} → ${fk.parent} includes space_id (has ${cols.join(', ')})`);
      }
    }
    for (const t of ['group_member', 'subject_access', 'chapter', 'lesson', 'material']) {
      assert.ok(keys.some((k) => k.tbl === t && SPACE_TABLES.includes(String(k.parent))), `${t} refers to its parent (the check above is meaningful)`);
    }
  });

  it('the database refuses a row that points into another space', async () => {
    const aSubject = a.subjects.Mathematics.id;
    await assert.rejects(
      worker.sql(`INSERT INTO chapter (id, space_id, subject_id, title, position) VALUES ('x-chapter', '${spaceB}', '${aSubject}', 'Smuggled', 1)`),
      /FOREIGN KEY/i,
      'a chapter of B under a subject of A',
    );
    const aLesson = contentIds(a, 'Mathematics', 'Fractions', 'Adding fractions').lesson;
    await assert.rejects(
      worker.sql(`INSERT INTO material (id, space_id, lesson_id, kind, title, note_text, position) VALUES ('x-mat', '${spaceB}', '${aLesson}', 'note', 'Smuggled', 'x', 1)`),
      /FOREIGN KEY/i,
      'a material of B in a lesson of A',
    );
  });

  it('a learner of space A reaches A\'s content (positive control) and nothing of space B, under either address', async () => {
    const learner = await signedIn(worker.url, LEARNER_A.username, LEARNER_A.password);
    const own = contentIds(a, 'Mathematics', 'Fractions', 'Adding fractions');
    assert.equal((await learner.get(`/s/${spaceA}/learn/${own.subject}`)).status, 200, 'own subject');
    assert.equal((await learner.get(`/s/${spaceA}/read/${own.lesson}`)).status, 200, 'own lesson');
    const ownPdf = await learner.get(`/s/${spaceA}/file/${own.materials[0]}`);
    assert.equal(ownPdf.status, 200, 'own PDF');
    assert.equal(ownPdf.headers.get('content-type'), 'application/pdf');

    const home = await (await learner.get(`/s/${spaceA}`)).text();
    assert.ok(home.includes('Mathematics'), 'own subject listed');
    for (const word of SECRET) assert.ok(!home.includes(word), `home does not list B's ${word}`);

    const theirs = contentIds(b, 'Forklift safety', 'Loading dock', 'Pallet rules');
    const paths = [
      `/s/${spaceB}`,
      `/s/${spaceB}/logo`,
      `/s/${spaceB}/learn/${theirs.subject}`,
      `/s/${spaceB}/read/${theirs.lesson}`,
      ...theirs.materials.map((m) => `/s/${spaceB}/file/${m}`),
      `/s/${spaceA}/learn/${theirs.subject}`,
      `/s/${spaceA}/read/${theirs.lesson}`,
      ...theirs.materials.map((m) => `/s/${spaceA}/file/${m}`),
    ];
    for (const path of paths) {
      const res = await learner.get(path);
      assert.equal(res.status, 403, `${path} refused with 403`);
      const body = await res.text();
      assert.ok(!body.startsWith('%PDF') && !body.includes('PNG'), `${path}: no file bytes`);
      for (const word of SECRET) assert.ok(!body.includes(word), `${path}: does not show B's ${word}`);
    }
  });

  it('an admin of space A, who sees all of A, gets nothing of space B with B\'s real ids', async () => {
    const admin = await signedIn(worker.url, ADMIN_A.username, ADMIN_A.password);
    const own = contentIds(a, 'Mathematics', 'Fractions', 'Adding fractions');
    assert.equal((await admin.get(`/s/${spaceA}/read/${own.lesson}`)).status, 200, 'positive control: the admin reads A\'s lesson');
    assert.equal((await admin.get(`/s/${spaceA}/file/${own.materials[1]}`)).status, 200, 'positive control: the admin opens A\'s image');
    const theirs = contentIds(b, 'Forklift safety', 'Loading dock', 'Pallet rules');
    for (const path of [
      `/s/${spaceB}`,
      `/s/${spaceB}/admin`,
      `/s/${spaceA}/learn/${theirs.subject}`,
      `/s/${spaceA}/read/${theirs.lesson}`,
      ...theirs.materials.map((m) => `/s/${spaceA}/file/${m}`),
    ]) {
      const res = await admin.get(path);
      assert.equal(res.status, 403, `${path} refused with 403`);
      const body = await res.text();
      for (const word of SECRET) assert.ok(!body.includes(word), `${path}: does not show B's ${word}`);
    }
  });

  it('the learner of space B still reaches B\'s content (the refusals above are about the space, not a broken page)', async () => {
    const learner = await signedIn(worker.url, LEARNER_B.username, LEARNER_B.password);
    const theirs = contentIds(b, 'Forklift safety', 'Loading dock', 'Pallet rules');
    assert.equal((await learner.get(`/s/${spaceB}/read/${theirs.lesson}`)).status, 200);
    const pdf = await learner.get(`/s/${spaceB}/file/${theirs.materials[0]}`);
    assert.equal(pdf.status, 200);
    assert.deepEqual(new Uint8Array(await pdf.arrayBuffer()), PDF_B);
    assert.equal((await learner.get(`/s/${spaceA}`)).status, 403, 'and nothing of A');
  });
});
