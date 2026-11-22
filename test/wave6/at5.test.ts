// LMS wave 6, W6-1a (product-contract v2 on PIL-257, AT-5): stored data rules.
// AT-5.1 and AT-5.2 apply the migrations with Wrangler on a fresh local D1 of
// the production configuration (no account), as wave 4's and wave 5's;
// AT-5.3 (code rollback) is test/rollback/old-code.test.ts in the rollback job,
// with its README line checked here; AT-5.4 deletion; AT-5.5 export and
// backup. Also `W6 deploy note` (contract section 12): the README sentence
// that W6-1a is not deployed on its own (W6-1b removes both). Made-up data only.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { retryD1Sync } from '../support/busy.ts';
import {
  ADMIN, HADEER, SALMA, SHIMAA, adminDue, as, closeWave6, dPlus, dueOf, dueSnapshot, markPath, publisherDue, saveDue, topicPath, wave4World, wave6World,
  withW6b, type Wave1World,
} from './world.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));
const NEW_MIGRATION = '0015_due_dates.sql';
const DOWN = join('migrations-down', '0015_due_dates.down.sql');
type Row = Record<string, unknown>;
const readme = () => readFileSync(join(root, 'README.md'), 'utf8').replace(/\r\n/g, '\n');
const flat = (s: unknown) => String(s).replace(/\s+/g, ' ').replace(/\( /g, '(').replace(/ \)/g, ')').trim();

/** The two columns and two indexes of section 6.1. */
const COLUMN = "due_on TEXT CHECK (due_on IS NULL OR due_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')";
const STATEMENTS = [
  `ALTER TABLE chapter ADD COLUMN ${COLUMN}`,
  `ALTER TABLE lesson ADD COLUMN ${COLUMN}`,
  'CREATE INDEX chapter_due ON chapter (space_id, due_on) WHERE due_on IS NOT NULL',
  'CREATE INDEX lesson_due ON lesson (space_id, due_on) WHERE due_on IS NOT NULL',
];

// ------------------------------------------------------- AT-5.1 and AT-5.2 ----
const isWindows = process.platform === 'win32';
const wranglerBin = join(root, 'node_modules', '.bin', isWindows ? 'wrangler.cmd' : 'wrangler');
function wrangler(args: string[]): string {
  return execFileSync(wranglerBin, args, {
    cwd: root, encoding: 'utf8', env: { ...process.env, WRANGLER_SEND_METRICS: 'false', NO_COLOR: '1', CI: 'true' },
    stdio: ['ignore', 'pipe', 'pipe'], shell: isWindows, maxBuffer: 64 * 1024 * 1024,
  });
}

describe('W6 AT-5 the migration and its down path', { concurrency: false }, () => {
  let dir: string;
  let persist: string;
  let mainConfig: string;
  let w: Wave1World;
  const mainFiles = readdirSync(join(root, 'migrations')).filter((f) => f.endsWith('.sql') && f !== NEW_MIGRATION).sort();
  const allFiles = [...mainFiles, NEW_MIGRATION];
  const run = (sqlFile: string, config?: string) =>
    retryD1Sync(() => wrangler(['d1', 'execute', 'lms-lego', '--local', '--persist-to', persist, ...(config ? ['--config', config] : []), '--file', sqlFile, '--yes']), { label: sqlFile });
  const apply = (config?: string) => wrangler(['d1', 'migrations', 'apply', 'lms-lego', '--local', '--persist-to', persist, ...(config ? ['--config', config] : [])]);
  let n = 0;
  const queries = (sqls: string[]): Row[][] => {
    const file = join(dir, `q${++n}.sql`);
    writeFileSync(file, sqls.map((s) => s + ';').join('\n'));
    const out = retryD1Sync(() => wrangler(['d1', 'execute', 'lms-lego', '--local', '--persist-to', persist, '--json', '--file', file]), { label: file });
    const parsed = JSON.parse(out.slice(out.search(/^\[/m))) as { results: Row[] }[];
    assert.equal(parsed.length, sqls.length, 'one result per statement');
    return parsed.map((p) => p.results);
  };
  const query = (sql: string): Row[] => queries([sql])[0];
  const schema = () => query("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY type, name");
  const applied = () => query('SELECT name FROM d1_migrations ORDER BY id').map((r) => String(r.name));
  const tables = () => schema().filter((r) => r.type === 'table' && r.name !== 'd1_migrations').map((r) => String(r.name));
  const pragmas = (names: string[]) => {
    const out = queries(names.flatMap((t) => [`SELECT * FROM pragma_table_info('${t}')`, `SELECT * FROM pragma_index_list('${t}')`, `SELECT * FROM pragma_foreign_key_list('${t}')`]));
    return new Map(names.map((t, i) => [t, out.slice(i * 3, i * 3 + 3).map((rs) => rs.map((r) => JSON.stringify(r)))]));
  };
  /** Every row of every table, the due_on columns left out (so rows compare across the migration). */
  const rows = (names = tables()) => {
    const all = queries(names.map((t) => `SELECT * FROM "${t}"`));
    return new Map(names.map((t, i) => [t, all[i].map((r) => { const { due_on: _d, ...rest } = r; return JSON.stringify(rest); }).sort()]));
  };

  /** The world's rows (in-process), as INSERT statements of main's schema (no due_on column). */
  async function worldSql(): Promise<string> {
    const lines = ['PRAGMA defer_foreign_keys = true;'];
    const names = await w.p.sql("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT IN ('d1_migrations') ORDER BY rowid");
    const lit = (v: unknown) => (v === null ? 'NULL' : typeof v === 'number' || typeof v === 'bigint' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
    for (const { name } of names) {
      for (const r of await w.p.sql(`SELECT * FROM "${String(name)}" ORDER BY rowid`)) {
        const cols = Object.keys(r).filter((c) => c !== 'due_on');
        lines.push(`INSERT INTO "${String(name)}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${cols.map((c) => lit(r[c])).join(', ')});`);
      }
    }
    return lines.join('\n') + '\n';
  }

  let done: { mainOut: string; mainApplied: string[]; mainSchema: Row[]; mainRows: Map<string, string[]>; mainPragmas: Map<string, string[][]>; forward: string } | undefined;
  async function forwardOnce() {
    if (done) return done;
    const mainOut = apply(mainConfig);
    const mainApplied = applied();
    const file = join(dir, 'world.sql');
    writeFileSync(file, await worldSql());
    run(file, mainConfig);
    const mainSchema = schema();
    const mainRows = rows();
    const mainPragmas = pragmas(tables());
    const forward = apply();
    return (done = { mainOut, mainApplied, mainSchema, mainRows, mainPragmas, forward });
  }

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), 'lms-w6-at5-'));
    persist = join(dir, 'd1');
    const mainDir = join(dir, 'main-migrations');
    mkdirSync(mainDir);
    for (const f of mainFiles) copyFileSync(join(root, 'migrations', f), join(mainDir, f));
    mainConfig = join(dir, 'wrangler.json');
    writeFileSync(mainConfig, JSON.stringify({
      name: 'lms-lego', main: join(root, 'src', 'index.ts'), compatibility_date: '2026-10-01',
      d1_databases: [{ binding: 'DB', database_name: 'lms-lego', migrations_dir: mainDir }],
    }));
    w = await wave4World();
  });
  after(async () => {
    await w?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('W6 AT-5.1 the forward migration adds exactly the two columns and two indexes of section 6.1; everything else is identical; existing rows get NULL; a second apply is a no-op', async () => {
    assert.match(NEW_MIGRATION, /^0015_/, 'the next number after 0014');
    const { mainOut, mainApplied, mainSchema, mainRows, mainPragmas, forward } = await forwardOnce();
    for (const f of mainFiles) assert.ok(mainOut.includes(f), `main's apply lists ${f}`);
    assert.deepEqual(mainApplied, mainFiles);
    assert.ok((mainRows.get('lesson') ?? []).length >= 8, 'the world is loaded');
    assert.ok(forward.includes(NEW_MIGRATION), `the forward apply runs the new migration:\n${forward}`);
    assert.deepEqual(applied(), allFiles, 'recorded, in order');
    const newSchema = schema();
    const key = (r: Row) => `${String(r.type)} ${String(r.name)}`;
    const added = newSchema.filter((r) => !mainSchema.some((m) => key(m) === key(r)));
    assert.deepEqual(added.map(key), ['index chapter_due', 'index lesson_due'], 'exactly two new indexes');
    assert.equal(flat(added[0].sql), flat(STATEMENTS[2]));
    assert.equal(flat(added[1].sql), flat(STATEMENTS[3]));
    for (const m of mainSchema) {
      const now = newSchema.find((r) => key(r) === key(m))!;
      assert.ok(now, `${key(m)} still there`);
      if (m.type === 'table' && (m.name === 'chapter' || m.name === 'lesson')) {
        assert.equal(flat(now.sql).replace(`, ${flat(COLUMN)}`, ''), flat(m.sql), `${String(m.name)} gains exactly the one column`);
      } else {
        assert.deepEqual(now, m, `${key(m)}: unchanged`);
      }
    }
    const newPragmas = pragmas(tables());
    for (const [t, p] of mainPragmas) {
      if (t === 'chapter' || t === 'lesson') {
        const cols = newPragmas.get(t)![0].map((c) => JSON.parse(c) as { name: string });
        assert.deepEqual(cols.map((c) => c.name), [...p[0].map((c) => (JSON.parse(c) as { name: string }).name), 'due_on'], `${t}: one more column, due_on, last`);
        const idx = newPragmas.get(t)![1].map((c) => (JSON.parse(c) as { name: string }).name);
        assert.deepEqual(idx.filter((x) => !p[1].some((y) => (JSON.parse(y) as { name: string }).name === x)), [`${t}_due`], `${t}: one more index`);
        assert.deepEqual(newPragmas.get(t)![2], p[2], `${t}: the same foreign keys`);
      } else {
        assert.deepEqual(newPragmas.get(t), p, `${t}: the same columns, indexes and foreign keys`);
      }
    }
    assert.deepEqual(rows(), mainRows, 'every existing row is identical');
    assert.deepEqual(query("SELECT (SELECT COUNT(*) FROM chapter WHERE due_on IS NOT NULL) + (SELECT COUNT(*) FROM lesson WHERE due_on IS NOT NULL) AS n"), [{ n: 0 }], 'existing rows get NULL');
    const sql = readFileSync(join(root, 'migrations', NEW_MIGRATION), 'utf8').replace(/--.*$/gm, '');
    for (const p of [/\bDROP\b/i, /\bRENAME\b/i, /\bDELETE\s+FROM\b/i, /\bUPDATE\s+\w+\s+SET\b/i]) assert.ok(!p.test(sql), `additive: no ${p}`);
    assert.equal(flat(sql), STATEMENTS.map((s) => `${flat(s)};`).join(' '), 'the four statements, nothing else');
    assert.match(apply(), /No migrations to apply/, 'a second apply is a no-op');
    assert.deepEqual(schema(), newSchema, 'the schema is the same after it');
  });

  it('W6 AT-5.2 the down script drops the two indexes, the two columns and the applied-migrations line; schema and record equal main\'s; applying again gives the wave 6 schema', async () => {
    const { mainSchema, mainRows, mainPragmas } = await forwardOnce();
    assert.ok(flat(schema().find((r) => r.name === 'lesson')!.sql).includes('due_on'), 'the wave 6 schema, to start from');
    assert.ok(existsSync(join(root, DOWN)) && !existsSync(join(root, 'migrations', '0015_due_dates.down.sql')), 'outside migrations/');
    for (const f of ['.github/workflows/deploy.yml', 'wrangler.jsonc']) {
      assert.ok(!/migrations-down|\.down\.sql/.test(readFileSync(join(root, f), 'utf8')), `${f} does not refer to the down script`);
    }
    // A dated lesson and chapter, so the down path has dates to delete.
    const file = join(dir, 'dates.sql');
    writeFileSync(file, "UPDATE lesson SET due_on = '2026-12-12' WHERE id = (SELECT id FROM lesson LIMIT 1);\nUPDATE chapter SET due_on = '2026-12-13' WHERE id = (SELECT id FROM chapter LIMIT 1);\n");
    run(file);
    run(join(root, DOWN));
    assert.deepEqual(pragmas(tables()), mainPragmas, 'per table: columns, indexes and foreign keys are main\'s');
    const after = schema();
    for (const m of mainSchema.filter((r) => r.name !== 'chapter' && r.name !== 'lesson')) {
      assert.deepEqual(after.find((r) => r.type === m.type && r.name === m.name), m, `${String(m.type)} ${String(m.name)}: the stored SQL text is main's`);
    }
    for (const t of ['chapter', 'lesson']) {
      assert.equal(flat(after.find((r) => r.name === t)!.sql), flat(mainSchema.find((r) => r.name === t)!.sql), `${t}: main's table text`);
    }
    assert.deepEqual(after.map((r) => `${String(r.type)} ${String(r.name)}`), mainSchema.map((r) => `${String(r.type)} ${String(r.name)}`), 'the same tables, indexes and triggers');
    assert.deepEqual(applied(), mainFiles, 'Wrangler\'s record is exactly main\'s');
    assert.deepEqual(rows(), mainRows, 'every row is unchanged');
    const again = apply();
    assert.ok(again.includes(NEW_MIGRATION), 'a later forward apply runs the migration again');
    assert.ok(flat(schema().find((r) => r.name === 'chapter')!.sql).includes('due_on'), 'the wave 6 columns again');
    assert.deepEqual(applied(), allFiles);
    assert.deepEqual(query("SELECT (SELECT COUNT(*) FROM chapter WHERE due_on IS NOT NULL) + (SELECT COUNT(*) FROM lesson WHERE due_on IS NOT NULL) AS n"), [{ n: 0 }], 'empty again');
    const text = readme();
    for (const phrase of ['migrations-down/0015_due_dates.down.sql', "owner's RED decision", 'first redeploy the earlier code, then run the down script']) {
      assert.ok(text.slice(text.indexOf('**Due dates (LMS wave 6):**')).includes(phrase), `the README's wave 6 rollback text says: ${phrase}`);
    }
  });
});

// ------------------------------------------------------- AT-5.3 README line ----
describe('W6 AT-5.3 the README\'s rollback text', () => {
  it('W6 AT-5.3 the README says that while earlier code runs due dates and the to-do list are not shown, and they return when wave 6 is redeployed', () => {
    const text = readme();
    const rollback = text.slice(text.indexOf('\n## Rollback'));
    assert.ok(rollback.includes('while earlier code runs, due dates and the to-do list are not shown and none can be set, and every stored due date returns when wave 6 is redeployed'), 'in "Rollback"');
    const old = readFileSync(join(root, 'test/rollback/old-code.test.ts'), 'utf8');
    assert.match(old, /it\('W6 AT-5\.3 /, 'the rollback job\'s case');
    const ci = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8');
    assert.match(ci, /--test-name-pattern='\^W6 AT-5\\\.3 ' test\/rollback\/old-code\.test\.ts/, 'its own step in the rollback job');
  });
});

// ------------------------------------------------------------ AT-5.4 -----------
/** Deletes a table's rows matching a condition, every row referring to them first (child-first, by the foreign keys). */
async function deleteChildFirst(w: Wave1World, table: string, where: string, depth = 0): Promise<void> {
  assert.ok(depth < 12, 'no reference cycle');
  const refs = await w.p.sql(`SELECT m.name AS t, f.id AS fk, f."from" AS c, f."to" AS k FROM sqlite_master m, pragma_foreign_key_list(m.name) f WHERE m.type = 'table' AND f."table" = '${table}' ORDER BY m.name, f.id, f.seq`);
  const keys = new Map<string, { t: string; from: string[]; to: string[] }>();
  for (const r of refs) {
    if (String(r.t) === table) continue;
    const id = `${String(r.t)}#${String(r.fk)}`;
    const k = keys.get(id) ?? { t: String(r.t), from: [], to: [] };
    k.from.push(`"${String(r.c)}"`);
    k.to.push(`"${r.k === null ? 'id' : String(r.k)}"`);
    keys.set(id, k);
  }
  for (const k of keys.values()) {
    await deleteChildFirst(w, k.t, `(${k.from.join(', ')}) IN (SELECT ${k.to.join(', ')} FROM "${table}" WHERE ${where})`, depth + 1);
  }
  await w.p.sql(`DELETE FROM "${table}" WHERE ${where}`);
}

describe('W6 AT-5.4 due dates go with their content; ending a teacher\'s access changes none, the next publisher and the admin manage them; a learner\'s account touches none', { concurrency: false }, () => {
  let w: Wave1World;
  before(async () => ({ w } = await wave6World()));
  after(() => closeWave6(w));

  it('W6 AT-5.4 child-first deletion of a subject and of space W6-b leaves none of their dates; no column names a person', async () => {
    const s = w.school;
    const nile = await withW6b(w);
    for (const t of ['lesson', 'chapter']) {
      assert.deepEqual(await w.p.sql(`SELECT "table" AS t FROM pragma_foreign_key_list('${t}') WHERE "table" = 'user'`), [], `${t}: no reference to a person`);
    }
    const text = readme();
    assert.ok(text.includes('due dates live on the `lesson` and `chapter` rows, so a manual deletion (owner, RED) of a subject or a space child-first takes them with those rows; the child-first list is unchanged'), 'the README on deletion');
    const dated = async (where: string) => Number((await w.p.sql(`SELECT (SELECT COUNT(*) FROM chapter WHERE due_on IS NOT NULL AND ${where}) + (SELECT COUNT(*) FROM lesson WHERE due_on IS NOT NULL AND ${where}) AS n`))[0].n);
    assert.ok((await dated(`space_id = '${s.id}'`)) >= 9, 'Mesk School has dates (W6-a)');
    const arabicBefore = await dated(`space_id = '${s.id}' AND id IN (SELECT l.id FROM lesson l JOIN chapter c ON c.id = l.chapter_id WHERE c.subject_id = '${s.arabic}')`);
    assert.equal(arabicBefore, 1, 'Arabic grammar has G1');
    // Mathematics child-first: none of its dates remain; Arabic grammar's stays.
    await deleteChildFirst(w, 'subject', `id = '${s.math}'`);
    assert.equal(Number((await w.p.sql(`SELECT COUNT(*) AS n FROM chapter WHERE subject_id = '${s.math}'`))[0].n), 0, 'its chapters are gone, with their dates');
    assert.equal(await dated(`space_id = '${s.id}'`), 1, 'only G1 is left in Mesk School');
    // Space W6-b child-first: none of its dates.
    assert.ok((await dated(`space_id = '${nile.id}'`)) === 3, 'W6-b has N1, K2 and N3');
    await deleteChildFirst(w, 'space', `id = '${nile.id}'`);
    assert.equal(await dated(`space_id = '${nile.id}'`), 0, 'none of W6-b\'s');
    assert.equal(await dated(`space_id = '${s.id}'`), 1, 'Mesk School unchanged');
  });
});

describe('W6 AT-5.4 the teacher\'s and the learner\'s accounts', { concurrency: false }, () => {
  let w: Wave1World;
  before(async () => ({ w } = await wave6World()));
  after(() => closeWave6(w));

  it('W6 AT-5.4 ending Hadeer\'s access changes no due date; the next publisher (Shimaa) and the admin change and clear them; ending and deleting a learner touch none, her done marks go', async () => {
    const s = w.school;
    const amal = await as(w, ADMIN, 'en');
    const snap = await dueSnapshot(w);
    assert.equal((await amal.post(`/s/${s.id}/admin/people/${w.ids[HADEER.username]}/end`, {})).status, 303, 'Amal ends Hadeer\'s access');
    assert.equal(await dueSnapshot(w), snap, 'no due date changed');
    // The admin gives Mathematics a new publisher (Shimaa).
    const assigned = await w.p.sql(`SELECT user_id, group_id FROM subject_access WHERE subject_id = '${s.math}'`);
    const fields = new URLSearchParams({ publisher: w.ids[SHIMAA.username] });
    for (const r of assigned) fields.append(r.group_id ? 'set' : 'learner', String(r.group_id ?? r.user_id));
    assert.equal((await amal.post(topicPath(s, s.math), fields as unknown as Record<string, string>)).status, 303, 'Shimaa publishes Mathematics now');
    const shimaa = await as(w, SHIMAA, 'en');
    const lesson = String((await w.p.sql("SELECT id FROM lesson WHERE id = 'w6a-l3'"))[0].id);
    await saveDue(shimaa, publisherDue(s, s.math), 'lesson', lesson, dPlus(20));
    assert.equal(await dueOf(w, 'lesson', lesson), dPlus(20), 'the next publisher changes a date');
    await saveDue(shimaa, publisherDue(s, s.math), 'lesson', lesson, '');
    assert.equal(await dueOf(w, 'lesson', lesson), null, 'and clears it');
    await saveDue(amal, adminDue(s, s.math), 'chapter', s.chapters.Fractions, '');
    assert.equal(await dueOf(w, 'chapter', s.chapters.Fractions), null, 'the admin clears one');
    // A learner: her marks, then her access ended, then her account deleted child-first.
    const salma = await as(w, SALMA, 'en');
    assert.equal((await salma.post(markPath(s, 'w6a-l1'), { state: 'done' })).status, 303, 'Salma marks L1 done');
    const after = await dueSnapshot(w);
    const salmaId = w.ids[SALMA.username] ?? String((await w.p.sql(`SELECT id FROM user WHERE username = '${SALMA.username}'`))[0].id);
    assert.equal((await amal.post(`/s/${s.id}/admin/people/${salmaId}/end`, {})).status, 303, 'Amal ends Salma\'s access');
    assert.equal(await dueSnapshot(w), after, 'ending a learner touches no due date');
    await deleteChildFirst(w, 'user', `id = '${salmaId}'`);
    assert.equal(await dueSnapshot(w), after, 'deleting a learner touches no due date');
    assert.deepEqual(await w.p.sql(`SELECT * FROM done_mark WHERE learner_user_id = '${salmaId}'`), [], 'her done marks are gone');
  });
});

// ------------------------------------------------------------ AT-5.5 -----------
describe('W6 AT-5.5 export and backup in the README and Later', () => {
  it('W6 AT-5.5 the README states sections 6.4 and 6.5 in plain words and Later\'s export row carries each due date with its item', () => {
    const text = readme();
    for (const phrase of [
      'there is no per-space export, so due dates are in none',
      'each lesson\'s and chapter\'s due date travels with it (content data, not personal data)',
      'Like every table, `lesson` and `chapter` are in D1\'s 30-day history',
      'none new. The to-do list (task W6-1b) is worked out from the learner\'s own done marks and shown only to that learner',
    ]) assert.ok(text.includes(phrase), `the README says: ${phrase}`);
    const later = readFileSync(join(root, 'docs/04-LATER.md'), 'utf8');
    const row = later.split('\n').find((l) => l.includes('Per-space data export'))!;
    assert.ok(row.includes('would carry each lesson\'s and chapter\'s due date (LMS wave 6) with it'), 'Later\'s export row');
  });
});

// ------------------------------------------------------------ deploy note -----
describe('W6 deploy note', () => {
  it('W6 deploy note the README says W6-1a is not deployed on its own (contract section 12; W6-1b removes it)', () => {
    assert.ok(readme().includes('Wave 6 part 1 (W6-1a) is not deployed on its own; deploy only after W6-1b is merged.'), 'the deploy note');
  });
});
