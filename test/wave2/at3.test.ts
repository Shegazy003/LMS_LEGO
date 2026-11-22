// LMS wave 2, W2-1a, AT-3 (product-contract v2 on PIL-225, section 6): stored
// data rules. One describe per labelled expectation, each its own CI step
// (`W2 AT-3.<n> ...`). AT-3.1 and AT-3.2 apply the migrations with the same
// Wrangler command the deploy uses, on a fresh local D1 (as
// test/deploy/migrations.test.ts does), loaded with the wave 1 world; the
// others run on the in-process product. AT-3.3 is a step of the `rollback` job
// (test/rollback/old-code.test.ts).
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { retryD1Sync } from '../support/busy.ts';
import { Client, utcDatePlusDays } from '../support/http.ts';
import { seed } from '../support/seed.ts';
import { SEGMENT } from '../../src/views/publish.ts';
import {
  ADMIN, HADEER, LINA, MATH_ORDER, OMAR, SALMA, activity, as, lessonPath, marks, markPath, plain, press, subjectPath, wave2World, withNile, type Wave1World,
} from './world.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));
const NEW_MIGRATION = '0011_done_marks.sql';
const DOWN = join('migrations-down', '0011_done_marks.down.sql');

type Row = Record<string, unknown>;

/** Every row of every table of the in-process database, by table (rowid order). */
async function everyRow(w: Wave1World): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  const tables = await w.p.sql("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  for (const { name } of tables) {
    const rows = await w.p.sql(`SELECT * FROM "${String(name)}"`);
    out.set(String(name), rows.map((r) => JSON.stringify(r)).sort());
  }
  return out;
}

/** The changes between two snapshots: table -> rows gone and rows new. */
function changes(a: Map<string, string[]>, b: Map<string, string[]>): Record<string, { gone: string[]; added: string[] }> {
  const out: Record<string, { gone: string[]; added: string[] }> = {};
  for (const t of new Set([...a.keys(), ...b.keys()])) {
    const x = a.get(t) ?? [];
    const y = b.get(t) ?? [];
    const gone = x.filter((r) => !y.includes(r));
    const added = y.filter((r) => !x.includes(r));
    if (gone.length || added.length) out[t] = { gone, added };
  }
  return out;
}

// ------------------------------------------------------- AT-3.1 and AT-3.2 ----
// Wrangler on a fresh local D1 of the production configuration (no account).

const isWindows = process.platform === 'win32';
const wranglerBin = join(root, 'node_modules', '.bin', isWindows ? 'wrangler.cmd' : 'wrangler');

function wrangler(args: string[]): string {
  return execFileSync(wranglerBin, args, {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false', NO_COLOR: '1', CI: 'true' },
    stdio: ['ignore', 'pipe', 'pipe'],
    // A .cmd file only starts through the shell (Windows only; no argument here holds a space or a quote).
    shell: isWindows,
    maxBuffer: 64 * 1024 * 1024,
  });
}

describe('W2 AT-3.1 the new migration adds exactly the done_mark table and its key; every other table, column, index, trigger and row is unchanged; a second apply is a no-op', { concurrency: false }, () => {
  // Shared with AT-3.2 (the same database, in order), so both run in this file's one process.
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
  /** Several SELECTs in one Wrangler call (one file), each statement's rows. */
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
  const rows = () => {
    const names = tables();
    const all = queries(names.map((t) => `SELECT * FROM "${t}"`));
    return new Map(names.map((t, i) => [t, all[i].map((r) => JSON.stringify(r)).sort()]));
  };

  /** The wave 1 world's rows (built by the in-process product), as INSERT statements in creation order. */
  async function worldSql(): Promise<string> {
    const lines = ['PRAGMA defer_foreign_keys = true;'];
    const names = await w.p.sql("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> 'done_mark' ORDER BY rowid");
    const lit = (v: unknown) => (v === null ? 'NULL' : typeof v === 'number' || typeof v === 'bigint' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
    for (const { name } of names) {
      for (const r of await w.p.sql(`SELECT * FROM "${String(name)}" ORDER BY rowid`)) {
        const cols = Object.keys(r);
        lines.push(`INSERT INTO "${String(name)}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${cols.map((c) => lit(r[c])).join(', ')});`);
      }
    }
    return lines.join('\n') + '\n';
  }

  /** Main's migrations, the wave 1 world, its snapshot, then the forward apply: done once per process, so the
   * AT-3.2 step (run alone in CI) starts from the same database AT-3.1 judges. */
  let done: { mainOut: string; mainApplied: string[]; mainSchema: Row[]; mainRows: Map<string, string[]>; forward: string } | undefined;
  async function forwardOnce() {
    if (done) return done;
    const mainOut = apply(mainConfig);
    const mainApplied = applied();
    const file = join(dir, 'world.sql');
    writeFileSync(file, await worldSql());
    run(file, mainConfig);
    const mainSchema = schema();
    const mainRows = rows();
    const forward = apply();
    return (done = { mainOut, mainApplied, mainSchema, mainRows, forward });
  }

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), 'lms-w2-at3-'));
    persist = join(dir, 'd1');
    // Main's migrations only: a copy of the production configuration whose migrations folder holds every file but the new one.
    const mainDir = join(dir, 'main-migrations');
    mkdirSync(mainDir);
    for (const f of mainFiles) copyFileSync(join(root, 'migrations', f), join(mainDir, f));
    mainConfig = join(dir, 'wrangler.json');
    writeFileSync(mainConfig, JSON.stringify({
      name: 'lms-lego', main: join(root, 'src', 'index.ts'), compatibility_date: '2026-10-01',
      d1_databases: [{ binding: 'DB', database_name: 'lms-lego', migrations_dir: mainDir }],
    }));
    w = await wave2World();
  });
  after(async () => {
    await w?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('W2 AT-3.1 forward migration on the wave 1 world', async () => {
    assert.match(NEW_MIGRATION, /^0011_/, 'the next number after 0010');
    const { mainOut, mainApplied, mainSchema, mainRows, forward } = await forwardOnce();
    for (const f of mainFiles) assert.ok(mainOut.includes(f), `main's apply lists ${f}`);
    assert.ok(!mainOut.includes(NEW_MIGRATION), 'main has no done marks');
    assert.deepEqual(mainApplied, mainFiles);
    assert.ok((mainRows.get('lesson') ?? []).length >= 10 && (mainRows.get('membership') ?? []).length >= 8, 'the wave 1 world is loaded');

    assert.ok(forward.includes(NEW_MIGRATION), `the forward apply runs the new migration:\n${forward}`);
    assert.deepEqual(applied(), allFiles, 'recorded, in order');
    const waveSchema = schema();
    const added = waveSchema.filter((r) => !mainSchema.some((m) => JSON.stringify(m) === JSON.stringify(r)));
    const gone = mainSchema.filter((m) => !waveSchema.some((r) => JSON.stringify(m) === JSON.stringify(r)));
    assert.deepEqual(gone, [], 'every other table, column, index and trigger is unchanged');
    assert.deepEqual(added.map((r) => `${r.type} ${r.name}`), ['table done_mark'], 'exactly one new table (its key is the table\'s own primary key)');
    const create = readFileSync(join(root, 'migrations', NEW_MIGRATION), 'utf8').replace(/--.*$/gm, '').trim().replace(/;$/, '');
    const flat = (s: unknown) => String(s).replace(/\s+/g, ' ').trim();
    assert.equal(flat(added[0].sql), flat(create), 'the table of section 6.1');
    for (const part of [
      'space_id TEXT NOT NULL REFERENCES space (id) ON DELETE CASCADE', 'lesson_id TEXT NOT NULL', 'learner_user_id TEXT NOT NULL REFERENCES user (id) ON DELETE CASCADE',
      'marked_at INTEGER NOT NULL', 'PRIMARY KEY (space_id, learner_user_id, lesson_id)', 'FOREIGN KEY (lesson_id, space_id) REFERENCES lesson (id, space_id) ON DELETE CASCADE',
    ]) assert.ok(flat(create).includes(part), `section 6.1: ${part}`);
    const now = rows();
    assert.deepEqual(now.get('done_mark'), [], 'the new table is empty');
    now.delete('done_mark');
    assert.deepEqual(now, mainRows, 'every existing row is identical');

    // The additive guard (test/deploy/migrations.test.ts) on the new file, and a second apply.
    const sql = readFileSync(join(root, 'migrations', NEW_MIGRATION), 'utf8').replace(/--.*$/gm, '');
    for (const p of [/\bDROP\b/i, /\bRENAME\b/i, /\bDELETE\s+FROM\b/i, /\bUPDATE\s+\w+\s+SET\b/i]) assert.ok(!p.test(sql), `additive: no ${p}`);
    assert.match(apply(), /No migrations to apply/, 'a second apply is a no-op');
    assert.deepEqual(schema(), waveSchema, 'the schema is the same after it');
  });

  it('W2 AT-3.2 the down script brings the schema and the applied-migrations record back to main\'s; a new apply gives the wave 2 schema again', async () => {
    const { mainSchema, mainRows } = await forwardOnce();
    const waveSchema = schema();
    assert.ok(waveSchema.some((r) => r.name === 'done_mark'), 'the wave 2 schema, to start from');
    // The down script lives outside migrations/, and nothing the deploy reads refers to it.
    assert.ok(existsSync(join(root, DOWN)) && !existsSync(join(root, 'migrations', '0011_done_marks.down.sql')), 'outside migrations/');
    for (const f of ['.github/workflows/deploy.yml', 'wrangler.jsonc']) {
      assert.ok(!/migrations-down|\.down\.sql/.test(readFileSync(join(root, f), 'utf8')), `${f} does not refer to the down script`);
    }
    // A mark, so "every done mark is deleted" means something.
    const one = query("SELECT l.id AS lesson, l.space_id AS space, m.user_id AS user FROM lesson l JOIN membership m ON m.space_id = l.space_id AND m.role = 'learner' LIMIT 1")[0];
    const markFile = join(dir, 'mark.sql');
    writeFileSync(markFile, `INSERT INTO done_mark (space_id, lesson_id, learner_user_id, marked_at) VALUES ('${one.space}', '${one.lesson}', '${one.user}', 1);\n`);
    run(markFile);
    run(join(root, DOWN));
    assert.deepEqual(schema(), mainSchema, 'the schema is exactly main\'s');
    assert.deepEqual(applied(), mainFiles, 'Wrangler\'s record is exactly main\'s');
    assert.deepEqual(rows(), mainRows, 'every other row is unchanged');
    const again = apply();
    assert.ok(again.includes(NEW_MIGRATION), 'a later forward apply runs the migration again');
    assert.deepEqual(schema(), waveSchema, 'exactly the wave 2 schema');
    assert.deepEqual(applied(), allFiles);
    assert.deepEqual(query('SELECT COUNT(*) AS n FROM done_mark')[0].n, 0, 'empty');
  });
});

// ---------------------------------------------------------------- AT-3.4 ----

describe('W2 AT-3.4 done marks are isolated per space: a lesson of another space is refused through either address, and the database refuses a mixed row', { concurrency: false }, () => {
  let w: Wave1World;
  before(async () => (w = await wave2World()));
  after(() => w?.close());

  it('W2 AT-3.4 Lina and Salma across Nile Test Space and Mesk School; the composite key; the space-isolation guard lists done_mark', async () => {
    const nile = await withNile(w);
    const lina = await as(w, LINA, 'en');
    const salma = await as(w, SALMA, 'en');
    const mesk = w.school.lessons['Adding fractions'];
    const river = nile.lessons['River words'];
    assert.equal((await press(lina, { id: nile.id }, river, 'done')).status, 303, 'Lina marks her own lesson');
    const stored = await marks(w);
    assert.equal(stored.length, 1);
    for (const [who, c, space, lesson] of [
      ['Lina, Mesk lesson through her own space', lina, nile.id, mesk],
      ['Lina, Mesk lesson through Mesk School', lina, w.school.id, mesk],
      ['Salma, Lina\'s lesson through Mesk School', salma, w.school.id, river],
      ['Salma, Lina\'s lesson through Nile Test Space', salma, nile.id, river],
    ] as const) {
      const res = await (c as Client).post(markPath({ id: space }, lesson), { state: 'done' });
      assert.equal(res.status, 403, `${who}: 403`);
      assert.deepEqual(await marks(w), stored, `${who}: nothing stored`);
    }
    // A row naming Mesk School's lesson with Nile's id: refused by the composite key.
    const linaId = String((await w.p.sql(`SELECT id FROM user WHERE username = '${LINA.username}'`))[0].id);
    await assert.rejects(w.p.sql(`INSERT INTO done_mark (space_id, lesson_id, learner_user_id, marked_at) VALUES ('${nile.id}', '${mesk}', '${linaId}', 1)`), /FOREIGN KEY/i, 'the database refuses it');
    assert.deepEqual(await marks(w), stored);
    const guard = readFileSync(join(root, 'test', 'guards', 'space-isolation.test.ts'), 'utf8');
    assert.match(guard, /SPACE_TABLES[\s\S]*'done_mark'/, 'the space-isolation guard lists done_mark (its own step runs it)');
  });
});

// ---------------------------------------------------------------- AT-3.5 ----

const KARIM = { display_name: 'Karim Test', username: 'karim.w2', password: 'karim-wave2-pass', role: 'learner' as const, mobile: '01046464646' };

describe('W2 AT-3.5 done marks are deleted with the learner and with the space, in the same statement; the README\'s two statements delete exactly those rows', { concurrency: false }, () => {
  let w: Wave1World;
  before(async () => (w = await wave2World()));
  after(() => w?.close());

  it('W2 AT-3.5 Karim Test (W2-b), space W2-a, and the README statements', async () => {
    const s = w.school;
    // W2-b: Karim Test with only a membership, a session and done marks.
    await seed(w.p.url, { spaceId: s.id, grantedBy: ADMIN.username, people: [{ ...KARIM, valid_until: utcDatePlusDays(30) }] });
    const karim = new Client(w.p.url);
    assert.equal((await karim.post('/signin', { username: KARIM.username, password: KARIM.password })).status, 302, 'his session');
    const karimId = String((await w.p.sql(`SELECT id FROM user WHERE username = '${KARIM.username}'`))[0].id);
    for (const [i, t] of MATH_ORDER.slice(0, 2).entries()) {
      await w.p.sql(`INSERT INTO done_mark (space_id, lesson_id, learner_user_id, marked_at) VALUES ('${s.id}', '${s.lessons[t]}', '${karimId}', ${i + 1})`);
    }
    const salma = await as(w, SALMA, 'en');
    for (const t of MATH_ORDER.slice(0, 3)) assert.equal((await press(salma, s, s.lessons[t], 'done')).status, 303);
    const nile = await withNile(w);
    assert.equal((await press(await as(w, LINA, 'en'), { id: nile.id }, nile.lessons['River words'], 'done')).status, 303);

    // Deleting Karim: his session, his membership, then his user row; his marks go with the user row.
    const snap0 = await everyRow(w);
    await w.p.sql(`DELETE FROM session WHERE user_id = '${karimId}'`);
    await w.p.sql(`DELETE FROM membership WHERE user_id = '${karimId}'`);
    const beforeUser = await everyRow(w);
    assert.equal((await w.p.sql(`SELECT COUNT(*) AS n FROM done_mark WHERE learner_user_id = '${karimId}'`))[0].n, 2, 'his marks are still there before the user row goes');
    await w.p.sql(`DELETE FROM user WHERE id = '${karimId}'`);
    const afterUser = changes(beforeUser, await everyRow(w));
    assert.deepEqual(Object.keys(afterUser).sort(), ['done_mark', 'user'], 'the user statement changed only user and done_mark');
    assert.equal(afterUser.done_mark.gone.length, 2, 'both his marks went with it');
    assert.ok(afterUser.done_mark.gone.every((r) => JSON.parse(r).learner_user_id === karimId) && !afterUser.done_mark.added.length);
    assert.deepEqual(Object.keys(changes(snap0, beforeUser)).sort(), ['membership', 'session'], 'his session and membership, nothing else');

    // The README's two statements for deletion on request.
    const readme = readFileSync(join(root, 'README.md'), 'utf8');
    const one = readme.match(/`(DELETE FROM done_mark WHERE space_id = '<space id>' AND learner_user_id = '<user id>';)`/)?.[1];
    const all = readme.match(/`(DELETE FROM done_mark WHERE space_id = '<space id>';)`/)?.[1];
    assert.ok(one && all, 'the README gives both statements');
    const omar = await as(w, OMAR, 'en');
    assert.equal((await press(omar, s, s.lessons['Review sheet'], 'done')).status, 303);
    const salmaId = w.ids[SALMA.username];
    const b1 = await marks(w);
    await w.p.sql(one!.replace('<space id>', s.id).replace('<user id>', salmaId));
    assert.deepEqual(await marks(w), b1.filter((r) => !(r.space_id === s.id && r.learner_user_id === salmaId)), 'one learner\'s marks in one space, exactly');
    assert.ok((await marks(w)).some((r) => r.learner_user_id === w.ids[OMAR.username]), 'Omar C\'s mark stays');
    const b2 = await marks(w);
    await w.p.sql(all!.replace('<space id>', s.id));
    assert.deepEqual(await marks(w), b2.filter((r) => r.space_id !== s.id), 'all marks of one space, exactly');
    assert.deepEqual((await marks(w)).map((r) => r.space_id), [nile.id], 'the other space\'s mark (Lina\'s) stays');

    // Deleting space W2-a: its rows child-first, then the space row. Mesk School gets marks again first.
    for (const t of MATH_ORDER.slice(0, 2)) assert.equal((await press(salma, s, s.lessons[t], 'done')).status, 303);
    const meskMarks = (await marks(w)).filter((r) => r.space_id === s.id);
    const before = await everyRow(w);
    const spaceTables = (await w.p.sql("SELECT m.name AS t FROM sqlite_master m WHERE m.type = 'table' AND m.name NOT IN ('space', 'done_mark') AND EXISTS (SELECT 1 FROM pragma_table_info(m.name) p WHERE p.name = 'space_id')")).map((r) => String(r.t));
    let left = [...spaceTables];
    for (let round = 0; left.length && round < 10; round++) {
      const still: string[] = [];
      for (const t of left) {
        try { await w.p.sql(`DELETE FROM "${t}" WHERE space_id = '${nile.id}'`); } catch { still.push(t); }
      }
      left = still;
    }
    assert.deepEqual(left, [], 'every child table emptied of the space');
    await w.p.sql(`DELETE FROM space WHERE id = '${nile.id}'`);
    assert.deepEqual((await marks(w)).filter((r) => r.space_id === nile.id), [], 'no done mark of that space');
    assert.deepEqual((await marks(w)).filter((r) => r.space_id === s.id), meskMarks, 'Mesk School\'s marks unchanged');
    const spaceChanges = changes(before, await everyRow(w));
    for (const [t, ch] of Object.entries(spaceChanges)) {
      assert.deepEqual(ch.added, [], `${t}: nothing added`);
      for (const r of ch.gone) {
        const row = JSON.parse(r);
        assert.ok(row.space_id === nile.id || (t === 'space' && row.id === nile.id), `${t}: only the space's rows go (${r.slice(0, 80)})`);
      }
    }
  });
});

// ---------------------------------------------------------------- AT-3.6 ----

describe('W2 AT-3.6 a mark on hidden content stays stored and is not shown; it shows again after Restore, publishing or assigning again; the activity switch-off never deletes one', { concurrency: false }, () => {
  let w: Wave1World;
  before(async () => (w = await wave2World()));
  after(() => w?.close());

  it('W2 AT-3.6 removed lesson (W2-d), removed chapter, unpublished, unassigned, ended access, and the activity switch', async () => {
    const s = w.school;
    const salma = await as(w, SALMA, 'en');
    const hadeer = await as(w, HADEER, 'en');
    // W2-d: Mathematics gains a sixth lesson, "Extra practice", in its Review chapter (no material, so Remove takes it).
    const review = s.chapters['Review'];
    assert.equal((await hadeer.post(`/s/${s.id}/publish/part/${review}/add`, { title: 'Extra practice' })).status, 303, 'Extra practice added');
    const extra = String((await w.p.sql(`SELECT id FROM lesson WHERE title = 'Extra practice' AND space_id = '${s.id}'`))[0].id);
    const comparing = s.lessons['Comparing fractions'];
    for (const l of [extra, comparing]) assert.equal((await press(salma, s, l, 'done')).status, 303);
    const stored = await marks(w);
    assert.equal(stored.length, 2);

    /** Her lesson page: 'done' (her mark shows), or the refusal's status (nothing of it shows). */
    const shows = async (lesson: string) => {
      const res = await salma.get(lessonPath(s, lesson));
      const body = await res.text();
      if (res.status !== 200) {
        assert.ok(!/done-state|data-done|Mark as not done/.test(body), 'a refusal shows nothing of a mark');
        return res.status;
      }
      return /id="done-tag"/.test(body) && /Mark as not done/.test(body) ? 'done' : 'not done';
    };
    const kept = async (what: string) => assert.deepEqual(await marks(w), stored, `${what}: the marks stay stored, unchanged`);
    /** W2-1b: her Mathematics outline: the number of ticked lessons (each must be a shown lesson; the line must say N of M), or the refusal's status. */
    const counted = async (what: string) => {
      const res = await salma.get(subjectPath(s, s.math));
      const body = await res.text();
      if (res.status !== 200) {
        assert.ok(!/data-done|done-progress/.test(body), `${what}: a refusal shows nothing of a mark`);
        return res.status;
      }
      const shown = [...body.matchAll(/<a data-lesson="([^"]+)"/g)].map((m) => m[1]);
      const ticked = [...body.matchAll(/data-done="lesson"[\s\S]*?<a data-lesson="([^"]+)"/g)].map((m) => m[1]);
      assert.ok(ticked.every((id) => shown.includes(id)) && ticked.every((id) => stored.some((r) => r.lesson_id === id)), `${what}: only shown, marked lessons are ticked`);
      const line = body.match(/<p id="done-progress"[^>]*>([\s\S]*?)<\/p>/)?.[1];
      if (ticked.length === 0) assert.equal(line, undefined, `${what}: no line at N = 0`);
      else assert.equal(plain(line!), ticked.length === shown.length ? `All done: ${shown.length} lessons` : `Done: ${ticked.length} of ${shown.length} lessons`, `${what}: the line counts shown lessons only (N never above M)`);
      return ticked.length;
    };

    assert.equal(await shows(extra), 'done');
    assert.equal(await counted('both shown'), 2, 'the outline counts both marks');
    // Removed lesson, then Restore.
    assert.equal((await hadeer.post(`/s/${s.id}/publish/${SEGMENT.lesson}/${extra}/remove`, {})).status, 303, 'Extra practice removed');
    assert.equal(await shows(extra), 404, 'removed lesson: not shown');
    assert.equal(await counted('removed lesson'), 1, 'removed lesson: not ticked, not counted on the outline');
    await kept('removed lesson');
    assert.equal((await hadeer.post(`/s/${s.id}/publish/${SEGMENT.lesson}/${extra}/restore`, {})).status, 303, 'restored');
    assert.equal(await shows(extra), 'done', 'after Restore it shows again');
    assert.equal(await counted('lesson restored'), 2, 'after Restore it counts again');

    // Removed chapter (as Remove leaves it, like the world's Draft chapter), then Restore.
    await w.p.sql(`UPDATE chapter SET removed_at = 1 WHERE id = '${s.chapters['Fractions']}'`);
    assert.equal(await shows(comparing), 404, 'removed chapter: not shown');
    assert.equal(await counted('removed chapter'), 1, 'removed chapter: its lesson not ticked, not counted');
    await kept('removed chapter');
    assert.equal((await hadeer.post(`/s/${s.id}/publish/${SEGMENT.chapter}/${s.chapters['Fractions']}/restore`, {})).status, 303, 'chapter restored');
    assert.equal(await shows(comparing), 'done', 'after Restore it shows again');
    assert.equal(await counted('chapter restored'), 2, 'after Restore it counts again');

    // Unpublished, then published again.
    assert.equal((await hadeer.post(`/s/${s.id}/publish/edit/${s.math}/unpublish`, {})).status, 303);
    assert.equal(await shows(comparing), 403, 'unpublished: not shown');
    assert.equal(await counted('unpublished'), 403, 'unpublished: no outline');
    await kept('unpublished');
    assert.equal((await hadeer.post(`/s/${s.id}/publish/edit/${s.math}/publish`, {})).status, 303);
    assert.equal(await shows(comparing), 'done', 'published again: shows again');
    assert.equal(await counted('published again'), 2, 'published again: counts again');

    // No longer assigned (the admin takes the group off the subject), then assigned again.
    const group = String((await w.p.sql(`SELECT group_id FROM subject_access WHERE subject_id = '${s.math}' AND group_id IS NOT NULL`))[0].group_id);
    const publisher = { publisher: w.ids[HADEER.username] };
    assert.equal((await w.admin.post(`/s/${s.id}/admin/topics/${s.math}`, publisher)).status, 303, 'unassigned');
    assert.equal(await shows(comparing), 403, 'not assigned: not shown');
    assert.equal(await counted('unassigned'), 403, 'not assigned: no outline');
    await kept('unassigned');
    assert.equal((await w.admin.post(`/s/${s.id}/admin/topics/${s.math}`, { ...publisher, set: group })).status, 303, 'assigned again');
    assert.equal(await shows(comparing), 'done', 'assigned again: shows again');
    assert.equal(await counted('assigned again'), 2, 'assigned again: counts again');

    // Ended access, then restored.
    const person = `/s/${s.id}/admin/people/${w.ids[SALMA.username]}`;
    assert.equal((await w.admin.post(`${person}/end`, {})).status, 303, 'access ended');
    const endedPage = await (await salma.get(lessonPath(s, comparing))).text();
    assert.ok(!/done-state|data-done|Mark as not done/.test(endedPage), 'ended access: nothing of the mark shows');
    await kept('ended access');
    assert.equal((await w.admin.post(`${person}/restore`, { valid_until: utcDatePlusDays(30) })).status, 303, 'access restored');
    const back = await as(w, SALMA, 'en');
    assert.match(await (await back.get(lessonPath(s, comparing))).text(), /Mark as not done/, 'restored access: shows again');

    // The admin's lesson-activity switch-off deletes lesson_view rows, never a done mark.
    await activity(w, true);
    for (const l of [extra, comparing]) assert.equal((await back.get(lessonPath(s, l))).status, 200);
    assert.ok(Number((await w.p.sql('SELECT COUNT(*) AS n FROM lesson_view'))[0].n) >= 1, 'opens recorded');
    await activity(w, false);
    assert.equal(Number((await w.p.sql('SELECT COUNT(*) AS n FROM lesson_view'))[0].n), 0, 'switch-off deletes lesson_view rows');
    await kept('activity switched off');
  });
});

// ---------------------------------------------------------------- AT-3.7 ----

describe('W2 AT-3.7 no route returns done marks but the learner\'s own pages; the README states the export and backup rule; docs/04-LATER.md excludes done marks from a future export', { concurrency: false }, () => {
  it('W2 AT-3.7 the guard, the README and the Later list', () => {
    const progress = readFileSync(join(root, 'src', 'progress.ts'), 'utf8');
    const exported = [...progress.matchAll(/export (?:async )?function (\w+)/g)].map((m) => m[1]).sort();
    // W2-1b adds doneLessonIds: the signed-in learner's own lesson ids, for their outline only (never a count, a time or another person's marks).
    // W2-2 adds markOrder: the same lesson ids, newest press first, for the learner's own home (never the time itself).
    // LMS wave 6 (W6-1b, AT-2.1 and AT-3.4b) adds learnerTodo: the signed-in learner's own to-do rows for their own home (W2 AT-2.5 keeps done_mark in this file), never the time.
    assert.deepEqual(exported, ['doneLessonIds', 'isDone', 'learnerTodo', 'markDone', 'markNotDone', 'markOrder', 'readsAsLearner', 'setMarkClock', 'signedInLearner'],'progress.ts gives out a yes/no per lesson, the learner\'s own done lesson ids (and whether a subject is read as a learner), never a count or time (AT-2.5 guards the rest)');
    assert.match(progress, /export async function doneLessonIds\(db: Db, who: Learner\)/, 'doneLessonIds takes only the signed-in learner (the branded Learner)');
    assert.doesNotMatch(progress.match(/export async function doneLessonIds[\s\S]*?\n\}/)?.[0] ?? '', /marked_at/, 'doneLessonIds never reads the time');
    assert.match(progress, /export async function markOrder\(db: Db, who: Learner\)/, 'markOrder takes only the signed-in learner (the branded Learner)');
    const order = progress.match(/export async function markOrder[\s\S]*?\n\}/)?.[0] ?? '';
    assert.match(order, /SELECT d\.lesson_id, DENSE_RANK\(\) OVER \(ORDER BY d\.marked_at DESC\) AS recency\s/, 'markOrder selects the lesson id and its rank only: the time orders the rows and never leaves the statement');
    assert.doesNotMatch(order.replace('ORDER BY d.marked_at DESC', ''), /marked_at/, 'markOrder names the time nowhere else');
    assert.match(progress, /export function learnerTodo\(db: Db, who: Learner,/, 'learnerTodo takes only the signed-in learner (the branded Learner)');
    assert.doesNotMatch(progress.match(/export function learnerTodo[\s\S]*?\n\}/)?.[0] ?? '', /marked_at/, 'learnerTodo never reads the time');
    const app = readFileSync(join(root, 'src', 'app.ts'), 'utf8');
    assert.deepEqual([...app.matchAll(/\bisDone\(/g)].length, 1, 'one reader: the lesson page');
    // LMS wave 4 (product-contract v2 on PIL-238, Code facts and section 5.2): the lock gate learnerLocks (lesson, mark and file) is the second reader.
    assert.deepEqual([...app.matchAll(/\bdoneLessonIds\(/g)].length, 2, 'two readers: the outline, and the lock gate of a subject in order');
    assert.equal([...app.matchAll(/\bdoneLessonIds\(/g)].filter((m) => /async function learnerLocks[\s\S]*$/.test(app.slice(Math.max(0, m.index! - 400), m.index!))).length, 1, 'the second is inside learnerLocks');
    assert.deepEqual([...app.matchAll(/\bmarkOrder\(/g)].length, 1, 'one reader: the learner home (W2-2)');
    const readme = readFileSync(join(root, 'README.md'), 'utf8');
    const section = readme.match(/\n### Done marks \(LMS wave 2[^\n]*\n([\s\S]*?)(?=\n### |\n## )/)?.[1] ?? '';
    assert.ok(section, 'README has the done-marks section');
    for (const phrase of [
      'no per-space export', 'done marks are in no export', 'stay out of it unless a new owner decision includes them',
      '30-day point-in-time history', 'a deleted or undone mark can remain there for up to 30 more days',
    ]) assert.ok(section.includes(phrase), `the README says: ${phrase}`);
    const rollback = readme.match(/\n## Rollback\n([\s\S]*?)(?=\n## )/)?.[1] ?? '';
    for (const phrase of ['migrations-down/0011_done_marks.down.sql', "owner's RED decision", 'first redeploy the earlier code, then run the down script', 'breaks every learner page']) {
      assert.ok(rollback.includes(phrase), `the Rollback section says: ${phrase}`);
    }
    const later = readFileSync(join(root, 'docs', '04-LATER.md'), 'utf8');
    const row = later.split('\n').find((l) => l.includes('Per-space data export')) ?? '';
    assert.match(row, /Done marks \(LMS wave 2\) are excluded from a future export unless a new owner decision includes them/, 'the export row');
  });
});
