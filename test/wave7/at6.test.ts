// LMS wave 7, W7-1 (product-contract v2 on PIL-261, AT-6): stored data rules.
// AT-6.1 and AT-6.2 apply the migrations with Wrangler on a fresh local D1 of
// the production configuration (no account), as waves 4 to 6; AT-6.3 (code
// rollback) is test/rollback/old-code.test.ts in the rollback job, with its
// README line checked here; AT-6.4 deletion lists; AT-6.5 the README and Later;
// `W7 deploy note` the README's "not deployed alone" line (removed by W7-2,
// contract section 11 item 8). Made-up data only.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { retryD1Sync } from '../support/busy.ts';
import { ADMIN, OMAR, SALMA, W7A, as, closeWave6, wave4World, wave7World, withW7b, quizSnapshot, type Wave1World } from './world.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));
const NEW_MIGRATION = '0016_quizzes.sql';
const DOWN = join('migrations-down', '0016_quizzes.down.sql');
type Row = Record<string, unknown>;
const readme = () => readFileSync(join(root, 'README.md'), 'utf8').replace(/\r\n/g, '\n');
const flat = (s: unknown) => String(s).replace(/--.*$/gm, '').replace(/\s+/g, ' ').replace(/\( /g, '(').replace(/ \)/g, ')').replace(/ ,/g, ',').trim();

/** The two tables and two indexes of section 6.1, as the contract writes them. */
const TABLES = {
  quiz: `CREATE TABLE quiz (id TEXT PRIMARY KEY, space_id TEXT NOT NULL REFERENCES space (id), subject_id TEXT NOT NULL, title TEXT NOT NULL, questions_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(questions_json)), rev INTEGER NOT NULL DEFAULT 0, state TEXT NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'open', 'closed')), created_at INTEGER NOT NULL, removed_at INTEGER, UNIQUE (id, space_id), FOREIGN KEY (subject_id, space_id) REFERENCES subject (id, space_id))`,
  quiz_attempt: `CREATE TABLE quiz_attempt (id TEXT PRIMARY KEY, space_id TEXT NOT NULL, quiz_id TEXT NOT NULL, learner_user_id TEXT NOT NULL REFERENCES user (id), rev INTEGER NOT NULL, answers_json TEXT NOT NULL CHECK (json_valid(answers_json)), right_flags TEXT NOT NULL, score INTEGER NOT NULL CHECK (score >= 0), question_count INTEGER NOT NULL CHECK (question_count BETWEEN 1 AND 20), sent_at INTEGER NOT NULL, UNIQUE (quiz_id, learner_user_id), FOREIGN KEY (quiz_id, space_id) REFERENCES quiz (id, space_id))`,
};
const INDEXES = {
  quiz_subject: 'CREATE INDEX quiz_subject ON quiz (space_id, subject_id)',
  quiz_attempt_learner: 'CREATE INDEX quiz_attempt_learner ON quiz_attempt (space_id, learner_user_id)',
};

const isWindows = process.platform === 'win32';
const wranglerBin = join(root, 'node_modules', '.bin', isWindows ? 'wrangler.cmd' : 'wrangler');
function wrangler(args: string[]): string {
  return execFileSync(wranglerBin, args, {
    cwd: root, encoding: 'utf8', env: { ...process.env, WRANGLER_SEND_METRICS: 'false', NO_COLOR: '1', CI: 'true' },
    stdio: ['ignore', 'pipe', 'pipe'], shell: isWindows, maxBuffer: 64 * 1024 * 1024,
  });
}

describe('W7 AT-6 the migration and its down path', { concurrency: false }, () => {
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
  const rows = (names: string[]) => {
    const all = queries(names.map((t) => `SELECT * FROM "${t}"`));
    return new Map(names.map((t, i) => [t, all[i].map((r) => JSON.stringify(r)).sort()]));
  };
  /** A statement that must be refused by the database itself. */
  const refused = (name: string, sql: string) => {
    const file = join(dir, `${name}.sql`);
    writeFileSync(file, `${sql};\n`);
    // Inside the retry helper (HQ-1): a busy database is retried, any other error (the refusal) is thrown at once, unchanged.
    assert.throws(() => retryD1Sync(() => wrangler(['d1', 'execute', 'lms-lego', '--local', '--persist-to', persist, '--file', file, '--yes']), { label: file }), `${name}: refused by the database`);
  };

  /** The world's rows (in-process), as INSERT statements (W6-main's schema: no quiz table yet). */
  async function worldSql(): Promise<string> {
    const lines = ['PRAGMA defer_foreign_keys = true;'];
    const names = await w.p.sql("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT IN ('d1_migrations', 'quiz', 'quiz_attempt') ORDER BY rowid");
    const lit = (v: unknown) => (v === null ? 'NULL' : typeof v === 'number' || typeof v === 'bigint' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
    for (const { name } of names) {
      for (const r of await w.p.sql(`SELECT * FROM "${String(name)}" ORDER BY rowid`)) {
        const cols = Object.keys(r);
        lines.push(`INSERT INTO "${String(name)}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${cols.map((c) => lit(r[c])).join(', ')});`);
      }
    }
    return lines.join('\n') + '\n';
  }

  let done: { mainOut: string; mainApplied: string[]; mainSchema: Row[]; mainRows: Map<string, string[]>; mainPragmas: Map<string, string[][]>; mainTables: string[]; forward: string } | undefined;
  async function forwardOnce() {
    if (done) return done;
    const mainOut = apply(mainConfig);
    const mainApplied = applied();
    const file = join(dir, 'world.sql');
    writeFileSync(file, await worldSql());
    run(file, mainConfig);
    const mainSchema = schema();
    const mainTables = tables();
    const mainRows = rows(mainTables);
    const mainPragmas = pragmas(mainTables);
    const forward = apply();
    return (done = { mainOut, mainApplied, mainSchema, mainRows, mainPragmas, mainTables, forward });
  }

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), 'lms-w7-at6-'));
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

  it('W7 AT-6.1 the forward migration adds exactly the two tables and two indexes of section 6.1; everything else is identical; a second apply is a no-op; the database refuses cross-space rows and a second attempt', async () => {
    assert.match(NEW_MIGRATION, /^0016_/, 'the next number after 0015');
    const { mainOut, mainApplied, mainSchema, mainRows, mainPragmas, mainTables, forward } = await forwardOnce();
    for (const f of mainFiles) assert.ok(mainOut.includes(f), `W6-main's apply lists ${f}`);
    assert.deepEqual(mainApplied, mainFiles);
    assert.ok((mainRows.get('lesson') ?? []).length >= 8, 'the world is loaded');
    assert.ok(forward.includes(NEW_MIGRATION), `the forward apply runs the new migration:\n${forward}`);
    assert.deepEqual(applied(), allFiles, 'recorded, in order');
    const newSchema = schema();
    const key = (r: Row) => `${String(r.type)} ${String(r.name)}`;
    const added = newSchema.filter((r) => !mainSchema.some((m) => key(m) === key(r)));
    assert.deepEqual(added.map(key).sort(), ['index quiz_attempt_learner', 'index quiz_subject', 'table quiz', 'table quiz_attempt'], 'exactly two new tables and two indexes (and their automatic unique indexes)');
    for (const r of added) {
      const expected = r.type === 'table' ? TABLES[String(r.name) as keyof typeof TABLES] : INDEXES[String(r.name) as keyof typeof INDEXES];
      assert.equal(flat(r.sql), flat(expected), `${key(r)} as section 6.1 writes it`);
    }
    for (const m of mainSchema) assert.deepEqual(newSchema.find((r) => key(r) === key(m)), m, `${key(m)}: unchanged`);
    assert.deepEqual(pragmas(mainTables), mainPragmas, 'every other table: the same columns, indexes and foreign keys');
    assert.deepEqual(rows(mainTables), mainRows, 'every existing row is identical');
    assert.deepEqual(query('SELECT (SELECT COUNT(*) FROM quiz) + (SELECT COUNT(*) FROM quiz_attempt) AS n'), [{ n: 0 }], 'the new tables are empty');
    const sql = readFileSync(join(root, 'migrations', NEW_MIGRATION), 'utf8').replace(/--.*$/gm, '');
    for (const p of [/\bDROP\b/i, /\bRENAME\b/i, /\bDELETE\s+FROM\b/i, /\bUPDATE\s+\w+\s+SET\b/i, /\bALTER\b/i]) assert.ok(!p.test(sql), `additive: no ${p}`);
    assert.equal(flat(sql), [TABLES.quiz, INDEXES.quiz_subject, TABLES.quiz_attempt, INDEXES.quiz_attempt_learner].map((s) => `${flat(s)};`).join(' '), 'the four statements, nothing else');
    assert.match(apply(), /No migrations to apply/, 'a second apply is a no-op');
    assert.deepEqual(schema(), newSchema, 'the schema is the same after it');
    // The database itself refuses rows that point into another space, and a second attempt.
    const [mesk, other] = query("SELECT id FROM space ORDER BY name").map((r) => String(r.id));
    const subject = String(query(`SELECT id FROM subject WHERE space_id = '${mesk}' LIMIT 1`)[0].id);
    const learner = String(query("SELECT id FROM user WHERE username = 'salma.a'")[0].id);
    const ok = join(dir, 'ok.sql');
    writeFileSync(ok, `INSERT INTO quiz (id, space_id, subject_id, title, created_at) VALUES ('at6-q', '${mesk}', '${subject}', 'AT-6 quiz', 1);
INSERT INTO quiz_attempt (id, space_id, quiz_id, learner_user_id, rev, answers_json, right_flags, score, question_count, sent_at) VALUES ('at6-a', '${mesk}', 'at6-q', '${learner}', 0, '{}', '0', 0, 1, 1);\n`);
    run(ok);
    refused('quiz-other-space', `INSERT INTO quiz (id, space_id, subject_id, title, created_at) VALUES ('at6-x', '${other}', '${subject}', 'Elsewhere', 1)`);
    refused('attempt-other-space', `INSERT INTO quiz_attempt (id, space_id, quiz_id, learner_user_id, rev, answers_json, right_flags, score, question_count, sent_at) VALUES ('at6-y', '${other}', 'at6-q', '${learner}', 0, '{}', '0', 0, 1, 1)`);
    refused('second-attempt', `INSERT INTO quiz_attempt (id, space_id, quiz_id, learner_user_id, rev, answers_json, right_flags, score, question_count, sent_at) VALUES ('at6-z', '${mesk}', 'at6-q', '${learner}', 0, '{}', '0', 0, 1, 2)`);
    assert.deepEqual(query('SELECT (SELECT COUNT(*) FROM quiz) AS q, (SELECT COUNT(*) FROM quiz_attempt) AS a'), [{ q: 1, a: 1 }], 'only the allowed rows are stored');
  });

  it('W7 AT-6.2 the down script drops the two tables and their indexes and the applied-migrations line; schema and record equal W6-main\'s; applying again gives the wave 7 schema', async () => {
    const { mainSchema, mainRows, mainPragmas, mainTables } = await forwardOnce();
    assert.ok(tables().includes('quiz'), 'the wave 7 schema, to start from');
    assert.ok(existsSync(join(root, DOWN)) && !existsSync(join(root, 'migrations', '0016_quizzes.down.sql')), 'outside migrations/');
    for (const f of ['.github/workflows/deploy.yml', 'wrangler.jsonc']) {
      assert.ok(!/migrations-down|\.down\.sql/.test(readFileSync(join(root, f), 'utf8')), `${f} does not refer to the down script`);
    }
    run(join(root, DOWN));
    assert.deepEqual(schema(), mainSchema, 'the schema is exactly W6-main\'s');
    assert.deepEqual(pragmas(mainTables), mainPragmas, 'per table: columns, indexes and foreign keys are W6-main\'s');
    assert.deepEqual(applied(), mainFiles, 'Wrangler\'s record is exactly W6-main\'s');
    assert.deepEqual(rows(mainTables), mainRows, 'every other row is unchanged');
    const again = apply();
    assert.ok(again.includes(NEW_MIGRATION), 'a later forward apply runs the migration again');
    assert.ok(tables().includes('quiz') && tables().includes('quiz_attempt'), 'the wave 7 tables again');
    assert.deepEqual(applied(), allFiles);
    assert.deepEqual(query('SELECT (SELECT COUNT(*) FROM quiz) + (SELECT COUNT(*) FROM quiz_attempt) AS n'), [{ n: 0 }], 'empty again');
    const text = readme();
    const part = text.slice(text.indexOf('**Quizzes (LMS wave 7):**'));
    for (const phrase of ['migrations-down/0016_quizzes.down.sql', "owner's RED decision", 'first redeploy the earlier code, then run the down script']) {
      assert.ok(part.includes(phrase), `the README's wave 7 rollback text says: ${phrase}`);
    }
  });
});

// ------------------------------------------------------- AT-6.3 README line ----
describe('W7 AT-6.3 the README\'s rollback text', () => {
  it('W7 AT-6.3 the README says that while earlier code runs no quiz shows, and quizzes and results return when wave 7 is redeployed; the rollback job has the case', () => {
    const text = readme();
    const rollback = text.slice(text.indexOf('\n## Rollback'));
    assert.ok(rollback.includes('while earlier code runs, no quiz shows and none can be taken, and quizzes and results return when wave 7 is redeployed'), 'in "Rollback"');
    const old = readFileSync(join(root, 'test/rollback/old-code.test.ts'), 'utf8');
    assert.match(old, /it\('W7 AT-6\.3 /, 'the rollback job\'s case');
    const ci = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8');
    assert.match(ci, /--test-name-pattern='\^W7 AT-6\\\.3 ' test\/rollback\/old-code\.test\.ts/, 'its own step in the rollback job');
  });
});

// ------------------------------------------------------------ AT-6.4 -----------
/** Deletes a table's rows matching a condition, every row referring to them first (child-first, by the foreign keys). */
async function deleteChildFirst(w: Wave1World, table: string, where: string, depth = 0, order: string[] = []): Promise<string[]> {
  assert.ok(depth < 12, 'no reference cycle');
  const refs = await w.p.sql(`SELECT m.name AS t, f.id AS fk, f."from" AS c, f."to" AS k FROM sqlite_master m, pragma_foreign_key_list(m.name) f WHERE m.type = 'table' AND m.name NOT LIKE '_cf_%' AND f."table" = '${table}' ORDER BY m.name, f.id, f.seq`);
  const keys = new Map<string, { t: string; from: string[]; to: string[] }>();
  for (const r of refs) {
    if (String(r.t) === table) continue;
    const id = `${String(r.t)}#${String(r.fk)}`;
    const k = keys.get(id) ?? { t: String(r.t), from: [], to: [] };
    k.from.push(`"${String(r.c)}"`);
    k.to.push(`"${r.k === null ? 'id' : String(r.k)}"`);
    keys.set(id, k);
  }
  for (const k of keys.values()) await deleteChildFirst(w, k.t, `(${k.from.join(', ')}) IN (SELECT ${k.to.join(', ')} FROM "${table}" WHERE ${where})`, depth + 1, order);
  await w.p.sql(`DELETE FROM "${table}" WHERE ${where}`);
  order.push(table);
  return order;
}

describe('W7 AT-6.4 deletion lists: a subject and a learner deleted child-first with foreign keys on leave no orphan; ending an account deletes nothing', { concurrency: false }, () => {
  let w: Wave1World;
  before(async () => {
    ({ w } = await wave7World());
    await withW7b(w);
  });
  after(() => closeWave6(w));

  it('W7 AT-6.4 the README\'s child-first lists hold quiz_attempt before quiz before subject, and a learner\'s quiz_attempt rows before user; following them leaves no orphan; ending an account deletes nothing', async () => {
    const s = w.school;
    const text = readme();
    for (const phrase of [
      "the subject's `quiz_attempt` rows before its `quiz` rows before the `subject` row",
      "For a learner's account, the learner's `quiz_attempt` rows go before the `user` row",
      'Ending an account deletes nothing.',
    ]) assert.ok(text.includes(phrase), `the README says: ${phrase}`);
    await w.p.sql('PRAGMA foreign_keys = ON');
    assert.equal(Number((await w.p.sql('PRAGMA foreign_keys'))[0].foreign_keys), 1, 'foreign keys are on');
    // Ending Omar C's account (the admin's End access now) deletes nothing.
    const amal = await as(w, ADMIN, 'en');
    const before = await quizSnapshot((q) => w.p.sql(q));
    assert.equal((await amal.post(`/s/${s.id}/admin/people/${w.ids[OMAR.username]}/end`, {})).status, 303, 'Amal ends Omar C\'s access');
    assert.equal(await quizSnapshot((q) => w.p.sql(q)), before, 'ending an account deletes nothing');
    // The subject Mathematics, child-first: quiz_attempt, then quiz, before subject.
    const order = await deleteChildFirst(w, 'subject', `id = '${s.math}'`);
    assert.ok(order.indexOf('quiz_attempt') < order.indexOf('quiz') && order.indexOf('quiz') < order.indexOf('subject'), `child-first order: ${order.join(', ')}`);
    assert.deepEqual(await w.p.sql(`SELECT id FROM quiz WHERE subject_id = '${s.math}'`), [], 'its quizzes are gone');
    assert.deepEqual(await w.p.sql(`SELECT id FROM quiz_attempt WHERE quiz_id IN ('${W7A.QA}', '${W7A.QC}', '${W7A.QD}')`), [], 'their attempts are gone');
    assert.ok((await w.p.sql(`SELECT id FROM quiz WHERE id = '${W7A.QG}'`)).length === 1, 'Arabic grammar\'s quiz stays');
    // A learner's account, child-first: her quiz_attempt rows before the user row.
    const salma = w.ids[SALMA.username];
    await w.p.sql(`INSERT INTO quiz_attempt (id, space_id, quiz_id, learner_user_id, rev, answers_json, right_flags, score, question_count, sent_at) VALUES ('at64-salma', '${s.id}', '${W7A.QG}', '${salma}', 0, '{}', '0', 0, 1, 1)`);
    const learnerOrder = await deleteChildFirst(w, 'user', `id = '${salma}'`);
    assert.ok(learnerOrder.indexOf('quiz_attempt') >= 0 && learnerOrder.indexOf('quiz_attempt') < learnerOrder.indexOf('user'), `the learner's quiz_attempt rows before user: ${learnerOrder.join(', ')}`);
    assert.deepEqual(await w.p.sql(`SELECT id FROM quiz_attempt WHERE learner_user_id = '${salma}'`), [], 'her attempts are gone');
    assert.deepEqual(await w.p.sql('PRAGMA foreign_key_check'), [], 'no orphan row anywhere');
    assert.ok((await w.p.sql(`SELECT id FROM quiz WHERE id = '${W7A.QG}'`)).length === 1, 'the quiz itself stays (its count drops)');
  });
});

// ------------------------------------------------------------ AT-6.5 -----------
describe('W7 AT-6.5 the README on export, backup and personal data; Later\'s export row', () => {
  it('W7 AT-6.5 the README states sections 6.4 and 6.5 in plain words and Later\'s export row carries quizzes, and attempts only to the people allowed', () => {
    const text = readme();
    for (const phrase of [
      'there is no per-space export, so quizzes and attempts are in none',
      "quizzes travel with their subject as content, and a learner's attempts only to the people below who may read them",
      'Like every table, `quiz` and `quiz_attempt` are in D1\'s 30-day history',
      "new: a learner's attempt (the chosen answers, the score, the time sent)",
      "the subject's responsible publisher, every attempt on the subject's quizzes, whatever other roles they hold",
      'nobody else: not the admin',
      'not guardians, not the owner',
      "Nothing is logged with a person's id; no score leaves the product.",
    ]) assert.ok(text.includes(phrase), `the README says: ${phrase}`);
    const later = readFileSync(join(root, 'docs/04-LATER.md'), 'utf8');
    const row = later.split('\n').find((l) => l.includes('Per-space data export'))!;
    assert.ok(row.includes("would carry quizzes (LMS wave 7) with their subject as content, and a learner's quiz attempts only to the people who may read them"), 'Later\'s export row');
  });
});

describe('W7 deploy note', () => {
  it('W7 deploy note the README says wave 7 part 1 is not deployed on its own', () => {
    assert.ok(readme().includes('Wave 7 part 1 (W7-1) is not deployed on its own; deploy only after W7-2 is merged.'), 'the deploy note');
  });
});
