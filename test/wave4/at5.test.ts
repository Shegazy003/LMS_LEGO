// LMS wave 4, W4-1a (product-contract v2 on PIL-238, AT-5): stored data rules.
// AT-5.1 and AT-5.2 apply the migrations with Wrangler on a fresh local D1 of
// the production configuration (no account), as wave 3b's AT-5.3 and AT-5.4;
// AT-5.3 (code rollback) is test/rollback/old-code.test.ts in the rollback job,
// with its README line checked here; AT-5.4 deletion; AT-5.5 export and backup.
// Made-up data only.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { retryD1Sync } from '../support/busy.ts';
import { OWNER, signedIn } from '../support/seed.ts';
import { crawl } from '../at13/pages.ts';
import { ADMIN, HADEER, MONA, OMAR, SALMA, as, setOrder, stored, wave4World, withNile4, type Wave1World } from './world.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));
const NEW_MIGRATION = '0013_chapters_in_order.sql';
const DOWN = join('migrations-down', '0013_chapters_in_order.down.sql');
const COLUMN = 'chapters_in_order INTEGER NOT NULL DEFAULT 0 CHECK (chapters_in_order IN (0, 1))';
type Row = Record<string, unknown>;
const readme = () => readFileSync(join(root, 'README.md'), 'utf8');
const flat = (s: unknown) => String(s).replace(/\s+/g, ' ').trim();

// ------------------------------------------------------- AT-5.1 and AT-5.2 ----
const isWindows = process.platform === 'win32';
const wranglerBin = join(root, 'node_modules', '.bin', isWindows ? 'wrangler.cmd' : 'wrangler');
function wrangler(args: string[]): string {
  return execFileSync(wranglerBin, args, {
    cwd: root, encoding: 'utf8', env: { ...process.env, WRANGLER_SEND_METRICS: 'false', NO_COLOR: '1', CI: 'true' },
    stdio: ['ignore', 'pipe', 'pipe'], shell: isWindows, maxBuffer: 64 * 1024 * 1024,
  });
}

describe('W4 AT-5 the migration and its down path', { concurrency: false }, () => {
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
  /** Per table: its columns, indexes and foreign keys by PRAGMA (AT-5.2's comparison). */
  const pragmas = (names: string[]) => {
    const out = queries(names.flatMap((t) => [`SELECT * FROM pragma_table_info('${t}')`, `SELECT * FROM pragma_index_list('${t}')`, `SELECT * FROM pragma_foreign_key_list('${t}')`]));
    return new Map(names.map((t, i) => [t, out.slice(i * 3, i * 3 + 3).map((rs) => rs.map((r) => JSON.stringify(r)))]));
  };
  /** Every row of every table, without the new column (main has none), so main's rows can be compared. */
  const rows = () => {
    const names = tables();
    const all = queries(names.map((t) => `SELECT * FROM "${t}"`));
    return new Map(names.map((t, i) => [t, all[i].map((r) => {
      const { chapters_in_order, ...rest } = r;
      void chapters_in_order;
      return JSON.stringify(rest);
    }).sort()]));
  };

  /** The wave 4 world's rows (in-process), as INSERT statements of main's schema (no new column). */
  async function worldSql(): Promise<string> {
    const lines = ['PRAGMA defer_foreign_keys = true;'];
    const names = await w.p.sql("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations' ORDER BY rowid");
    const lit = (v: unknown) => (v === null ? 'NULL' : typeof v === 'number' || typeof v === 'bigint' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
    for (const { name } of names) {
      for (const r of await w.p.sql(`SELECT * FROM "${String(name)}" ORDER BY rowid`)) {
        const cols = Object.keys(r).filter((c) => c !== 'chapters_in_order');
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
    dir = mkdtempSync(join(tmpdir(), 'lms-w4-at5-'));
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

  it('W4 AT-5.1 the forward migration adds exactly subject.chapters_in_order; everything else is identical; every existing subject reads 0; a second apply is a no-op', async () => {
    assert.match(NEW_MIGRATION, /^0013_/, 'the next number after 0012');
    const { mainOut, mainApplied, mainSchema, mainRows, mainPragmas, forward } = await forwardOnce();
    for (const f of mainFiles) assert.ok(mainOut.includes(f), `main's apply lists ${f}`);
    assert.deepEqual(mainApplied, mainFiles);
    assert.ok((mainRows.get('subject') ?? []).length >= 4, 'the world is loaded');
    assert.ok(forward.includes(NEW_MIGRATION), `the forward apply runs the new migration:\n${forward}`);
    assert.deepEqual(applied(), allFiles, 'recorded, in order');
    const newSchema = schema();
    const added = newSchema.filter((r) => !mainSchema.some((m) => JSON.stringify(m) === JSON.stringify(r)));
    const gone = mainSchema.filter((m) => !newSchema.some((r) => JSON.stringify(m) === JSON.stringify(r)));
    assert.deepEqual(gone.map((r) => `${r.type} ${r.name}`), ['table subject'], 'only subject\'s definition changes');
    assert.deepEqual(added.map((r) => `${r.type} ${r.name}`), ['table subject'], 'no new table, index or trigger');
    assert.equal(flat(added[0].sql).replace(`, ${COLUMN}`, ''), flat(gone[0].sql), 'subject gains exactly the one column');
    const newPragmas = pragmas(tables());
    for (const [t, p] of mainPragmas) {
      if (t === 'subject') {
        assert.deepEqual(newPragmas.get(t)![1], p[1], 'subject: the same indexes');
        assert.deepEqual(newPragmas.get(t)![2], p[2], 'subject: the same foreign keys');
      } else {
        assert.deepEqual(newPragmas.get(t), p, `${t}: the same columns, indexes and foreign keys`);
      }
    }
    const col = query("SELECT name, type, \"notnull\" AS nn, dflt_value AS d FROM pragma_table_info('subject') WHERE name = 'chapters_in_order'");
    assert.deepEqual(col, [{ name: 'chapters_in_order', type: 'INTEGER', nn: 1, d: '0' }], 'INTEGER NOT NULL DEFAULT 0');
    assert.deepEqual(rows(), mainRows, 'every existing row is identical');
    assert.deepEqual(query('SELECT DISTINCT chapters_in_order AS v FROM subject'), [{ v: 0 }], 'every existing subject reads 0');
    const sql = readFileSync(join(root, 'migrations', NEW_MIGRATION), 'utf8').replace(/--.*$/gm, '');
    for (const p of [/\bDROP\b/i, /\bRENAME\b/i, /\bDELETE\s+FROM\b/i, /\bUPDATE\s+\w+\s+SET\b/i, /\bCREATE\b/i]) assert.ok(!p.test(sql), `additive: no ${p}`);
    assert.equal(flat(sql), `ALTER TABLE subject ADD COLUMN ${COLUMN};`, 'one statement');
    assert.match(apply(), /No migrations to apply/, 'a second apply is a no-op');
    assert.deepEqual(schema(), newSchema, 'the schema is the same after it');
  });

  it('W4 AT-5.2 the down script brings the schema and the applied-migrations record back to main\'s; applying again gives the wave 4 schema', async () => {
    const { mainSchema, mainRows, mainPragmas } = await forwardOnce();
    const newSchema = schema();
    assert.ok(flat(newSchema.find((r) => r.name === 'subject')!.sql).includes('chapters_in_order'), 'the wave 4 schema, to start from');
    assert.ok(existsSync(join(root, DOWN)) && !existsSync(join(root, 'migrations', '0013_chapters_in_order.down.sql')), 'outside migrations/');
    for (const f of ['.github/workflows/deploy.yml', 'wrangler.jsonc']) {
      assert.ok(!/migrations-down|\.down\.sql/.test(readFileSync(join(root, f), 'utf8')), `${f} does not refer to the down script`);
    }
    // A subject in order, so the down path has a setting to lose.
    const subject = String(query('SELECT id FROM subject LIMIT 1')[0].id);
    const file = join(dir, 'on.sql');
    writeFileSync(file, `UPDATE subject SET chapters_in_order = 1 WHERE id = '${subject}';\n`);
    run(file);
    run(join(root, DOWN));
    assert.deepEqual(pragmas(tables()), mainPragmas, 'per table: columns, indexes and foreign keys are main\'s');
    const after = schema();
    for (const m of mainSchema.filter((r) => r.name !== 'subject')) {
      assert.deepEqual(after.find((r) => r.type === m.type && r.name === m.name), m, `${m.type} ${m.name}: the stored SQL text is main's`);
    }
    assert.deepEqual(after.map((r) => `${r.type} ${r.name}`), mainSchema.map((r) => `${r.type} ${r.name}`), 'the same tables, indexes and triggers');
    assert.deepEqual(applied(), mainFiles, 'Wrangler\'s record is exactly main\'s');
    assert.deepEqual(rows(), mainRows, 'every row is unchanged');
    const again = apply();
    assert.ok(again.includes(NEW_MIGRATION), 'a later forward apply runs the migration again');
    assert.ok(flat(schema().find((r) => r.name === 'subject')!.sql).includes(COLUMN), 'the wave 4 column again');
    assert.deepEqual(applied(), allFiles);
    assert.deepEqual(query('SELECT DISTINCT chapters_in_order AS v FROM subject'), [{ v: 0 }], 'every subject off again');
    const text = readme();
    for (const phrase of ['migrations-down/0013_chapters_in_order.down.sql', "owner's RED decision", 'first redeploy the earlier code, then run the down script']) {
      assert.ok(text.includes(phrase), `the README says: ${phrase}`);
    }
  });
});

// ------------------------------------------------------- AT-5.3 README line ----
describe('W4 AT-5.3 the README\'s rollback text', () => {
  it('W4 AT-5.3 the README says that while earlier code runs every subject opens as if the setting were off, and the setting returns when wave 4 is redeployed', () => {
    const text = readme();
    const rollback = text.slice(text.indexOf('\n## Rollback'));
    assert.ok(rollback.includes('while earlier code runs, every subject opens as if the setting were off, and the setting returns when wave 4 is redeployed'), 'in "Rollback"');
    const old = readFileSync(join(root, 'test/rollback/old-code.test.ts'), 'utf8');
    assert.match(old, /it\('W4 AT-5\.3 /, 'the rollback job\'s case');
    const ci = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8');
    assert.match(ci, /--test-name-pattern='\^W4 AT-5\\\.3 ' test\/rollback\/old-code\.test\.ts/, 'its own step in the rollback job');
  });
});

// ------------------------------------------------------------ AT-5.4 -----------
/** Deletes a table's rows matching a condition, every row referring to them first (child-first, by the foreign keys). */
async function deleteChildFirst(w: Wave1World, table: string, where: string, depth = 0): Promise<void> {
  assert.ok(depth < 12, 'no reference cycle');
  const refs = await w.p.sql(`SELECT m.name AS t, f."from" AS c, f."to" AS k, f."table" AS p FROM sqlite_master m, pragma_foreign_key_list(m.name) f WHERE m.type = 'table' AND f."table" = '${table}'`);
  for (const r of refs) {
    if (String(r.t) === table) continue;
    const key = r.k === null ? 'id' : String(r.k);
    await deleteChildFirst(w, String(r.t), `"${String(r.c)}" IN (SELECT "${key}" FROM "${table}" WHERE ${where})`, depth + 1);
  }
  await w.p.sql(`DELETE FROM "${table}" WHERE ${where}`);
}

/** Every row of every table (the space's usage counters aside), as text. */
async function allRows(w: Wave1World): Promise<Map<string, string[]>> {
  const names = await w.p.sql("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations' ORDER BY name");
  const out = new Map<string, string[]>();
  for (const { name } of names) out.set(String(name), (await w.p.sql(`SELECT * FROM "${String(name)}"`)).map((r) => JSON.stringify(r)).sort());
  return out;
}

describe('W4 AT-5.4 the setting is deleted with its subject and its space; no lock state is stored anywhere', { concurrency: false }, () => {
  it('W4 AT-5.4 deleting a subject child-first, then space W4-a child-first, leaves nothing of their settings and changes no other Mesk School row', async () => {
    const w = await wave4World();
    try {
      // No lock state anywhere: the only new column is this one, and no table or column names a lock.
      const cols = await w.p.sql("SELECT m.name AS t, p.name AS c FROM sqlite_master m, pragma_table_info(m.name) p WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%'");
      assert.deepEqual(cols.filter((r) => /order|lock/i.test(String(r.c)) || /order|lock/i.test(String(r.t))).map((r) => `${r.t}.${r.c}`), ['subject.chapters_in_order'], 'one column, nothing else stored');
      await setOrder(w, true);
      const nile = await withNile4(w);
      assert.equal(await stored(w, nile.subject), 1, 'Nile science in order');
      // A second Mesk subject in order (Arabic grammar, by its publisher), to delete; Mathematics stays.
      const arabic = String((await w.p.sql(`SELECT id FROM subject WHERE space_id = '${w.school.id}' AND id <> '${w.school.math}' ORDER BY title LIMIT 1`))[0].id);
      await w.p.sql(`UPDATE subject SET chapters_in_order = 1 WHERE id = '${arabic}'`);
      const before = await allRows(w);
      await deleteChildFirst(w, 'subject', `id = '${arabic}'`);
      assert.deepEqual(await w.p.sql(`SELECT * FROM subject WHERE id = '${arabic}'`), [], 'the subject row and its setting are gone');
      const afterSubject = await allRows(w);
      for (const [t, rows] of afterSubject) {
        const added = rows.filter((r) => !before.get(t)!.includes(r));
        assert.deepEqual(added, [], `${t}: nothing added`);
        for (const r of before.get(t)!.filter((x) => !rows.includes(x))) assert.ok(r.includes(arabic) || t !== 'subject', `${t}: only the subject's rows go`);
      }
      assert.ok(!JSON.stringify([...afterSubject.values()]).includes(`"${arabic}"`), 'nothing names the deleted subject');
      // Space W4-a, child-first.
      const meskBefore = await w.p.sql(`SELECT id, chapters_in_order FROM subject WHERE space_id = '${w.school.id}' ORDER BY id`);
      const spaceTables = (await w.p.sql("SELECT m.name AS t FROM sqlite_master m WHERE m.type = 'table' AND m.name <> 'space' AND EXISTS (SELECT 1 FROM pragma_table_info(m.name) p WHERE p.name = 'space_id')")).map((r) => String(r.t));
      const meskRows = async () => {
        const out: Record<string, string[]> = {};
        for (const t of spaceTables) out[t] = (await w.p.sql(`SELECT * FROM "${t}" WHERE space_id = '${w.school.id}'`)).map((r) => JSON.stringify(r)).sort();
        return out;
      };
      const meskBeforeRows = await meskRows();
      await deleteChildFirst(w, 'space', `id = '${nile.id}'`);
      assert.deepEqual(await w.p.sql(`SELECT * FROM subject WHERE space_id = '${nile.id}'`), [], 'nothing of Nile\'s settings');
      for (const t of spaceTables) assert.deepEqual(await w.p.sql(`SELECT 1 FROM "${t}" WHERE space_id = '${nile.id}'`), [], `${t}: nothing of the space`);
      assert.deepEqual(await meskRows(), meskBeforeRows, 'no Mesk School row changes');
      assert.deepEqual(await w.p.sql(`SELECT id, chapters_in_order FROM subject WHERE space_id = '${w.school.id}' ORDER BY id`), meskBefore, 'Mesk School\'s settings unchanged');
      assert.equal(await stored(w, w.school.math), 1, 'Mathematics still in order');
      // The README's deletion line.
      assert.ok(readme().includes('the setting is part of the subject row, so it goes in the same statement as the subject, and with the space when its rows are deleted child-first'), 'the README says so');
    } finally {
      await w.close();
    }
  });
});

// ------------------------------------------------------------ AT-5.5 -----------
const SETTING_SIGNS = ['id="order-state"', 'data-order-note', 'id="order-box"', 'data-locked', 'chapters_in_order', 'in_order'];

describe('W4 AT-5.5 no route returns the setting but the two setting pages, the change note and the learner\'s own pages; the README and Later say how export and backup treat it', { concurrency: false }, () => {
  it('W4 AT-5.5 a crawl of every page of every person finds the setting only where the contract allows it', async (t) => {
    const w = await wave4World({ activity: true });
    try {
      const s = w.school;
      await setOrder(w, true);
      const math = s.math;
      const mathLessons = new Set((await w.p.sql(`SELECT l.id FROM lesson l JOIN chapter c ON c.id = l.chapter_id WHERE c.subject_id = '${math}'`)).map((r) => String(r.id)));
      const allowed = (who: string, path: string) => {
        const p = path.split('?')[0];
        // Each subject's editor carries its card (and, in order, its add-lesson and removed pages the change note); each subject admin page its card.
        if (who === 'Hadeer' && p.startsWith(`/s/${s.id}/publish/edit/`)) return true;
        if (who === 'Amal' && /^\/s\/[^/]+\/admin\/topics\/[^/]+$/.test(p)) return true;
        if (who === 'Salma' || who === 'Omar C') { // the learner's own pages of Mathematics
          if (p === `/s/${s.id}/learn/${math}`) return true;
          const read = /^\/s\/[^/]+\/read\/([^/]+)$/.exec(p);
          if (read && mathLessons.has(read[1])) return true;
        }
        // The preview draws a new learner's own pages (section 5.5).
        if ((who === 'Amal' || who === 'Hadeer') && /\/preview\//.test(p) && (p.includes(math) || [...mathLessons].some((l) => p.includes(l)))) return true;
        return false;
      };
      const people: [string, { username: string; password: string }][] = [
        ['Salma', SALMA], ['Omar C', OMAR], ['Amal', ADMIN], ['Hadeer', HADEER], ['Mona', MONA], ['the owner', OWNER],
      ];
      let seen = 0;
      const where = new Set<string>();
      for (const [who, person] of people) {
        const c = who === 'the owner' ? await signedIn(w.p.url, OWNER.username, OWNER.password) : await as(w, person, 'en');
        const start = who === 'the owner' ? ['/owner', '/home'] : ['/home', `/s/${s.id}`];
        const pages = await crawl(c, start, [], 150, (p) => !p.includes('signout') && !p.startsWith('/r/'));
        for (const p of pages) {
          seen++;
          const hits = SETTING_SIGNS.filter((x) => p.body.includes(x));
          if (!hits.length) continue;
          assert.ok(allowed(who, p.path), `${who} ${p.path}: shows the setting (${hits.join(', ')})`);
          assert.ok(!p.body.includes('chapters_in_order') && !/"in_order"/.test(p.body), `${who} ${p.path}: no stored name`);
          where.add(`${who} ${p.path.split('?')[0].replace(s.id, '<space>').replace(math, '<math>')}`);
        }
      }
      t.diagnostic(`AT-5.5 ${seen} responses crawled; the setting shows on ${where.size}: ${[...where].sort().slice(0, 12).join('; ')}${where.size > 12 ? '; …' : ''}`);
      assert.ok([...where].some((x) => x.startsWith('Hadeer ')) && [...where].some((x) => x.startsWith('Amal ')) && [...where].some((x) => x.startsWith('Salma ')), 'seen on the setting pages and the learner\'s page');
    } finally {
      await w.close();
    }
  });

  it('W4 AT-5.5 the README states section 6.4 in plain words and Later\'s export row carries the setting with its subject, still without done marks', () => {
    const text = readme();
    for (const phrase of [
      'there is no per-space export, so the setting is in none',
      'the setting travels with its subject (content configuration, not personal data), and done marks stay out unless a new owner decision includes them',
      'Lock state is never stored, so it can never be exported',
      "`subject` is in D1's 30-day history: the owner can restore an earlier value of the setting from there",
    ]) assert.ok(text.includes(phrase), `the README says: ${phrase}`);
    const later = readFileSync(join(root, 'docs/04-LATER.md'), 'utf8');
    const row = later.split('\n').find((l) => l.includes('Per-space data export'))!;
    assert.ok(row.includes('would carry each subject\'s "open in order" setting (LMS wave 4) with its subject (content configuration, not personal data) and still exclude done marks'), 'Later\'s export row');
  });
});
