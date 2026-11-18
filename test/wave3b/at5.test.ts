// LMS wave 3b, W3b-1 (product-contract v2 on PIL-232, AT-5.1 to AT-5.4 and
// AT-5.6): the upload is recorded with no more personal data than today;
// Earlier uploads (AT-5.2, W3b-1b); the migration, its down path, isolation
// and deletion. AT-5.5 is in test/rollback/old-code.test.ts (the rollback job).
// Made-up data only.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ADMIN, END, HEADER_EN, NOUR, as, carriedForm, checkFile, csv, pressAdd, snapshot, uploadIdOf, wave3bWorld, withNile, type Wave3aWorld,
} from './world.ts';
import { UI } from '../../src/i18n/ui.ts';
import { utcDatePlusDays } from '../support/http.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));
const NEW_MIGRATION = '0012_class_upload.sql';
const DOWN = join('migrations-down', '0012_class_upload.down.sql');
type Row = Record<string, unknown>;

/** Adds these rows to a space as its admin; returns the upload id. */
async function add(w: Wave3aWorld, c: Awaited<ReturnType<typeof as>>, space: { id: string }, rows: string[][]): Promise<string> {
  const html = await (await checkFile(c, space, csv([HEADER_EN, ...rows]))).text();
  const res = await pressAdd(c, space, carriedForm(html)!);
  assert.equal(res.status, 303, 'added');
  return uploadIdOf(res.headers.get('location'));
}

// ------------------------------------------------------- AT-5.1 and AT-5.6 ----
describe('W3b AT-5 the upload record, isolation and deletion', { concurrency: false }, () => {
  let w: Wave3aWorld;
  before(async () => (w = await wave3bWorld()));
  after(() => w?.close());

  it('W3b AT-5.1 each add makes exactly one class_upload row of six fields; a check makes none; each new membership carries its id', async () => {
    const cols = (await w.p.sql("SELECT name FROM pragma_table_info('class_upload') ORDER BY cid")).map((r) => String(r.name));
    assert.deepEqual(cols, ['id', 'space_id', 'uploaded_by', 'uploaded_at', 'lines_added', 'lines_refused'], 'only who, when and two counts');
    const amal = await as(w, ADMIN, 'en');
    const rows = [['Trail One', 'trail1.t', 'Student', '01046465101', END], ['Trail Two', 'trail2.t', 'Parent', '01046465102', END], ['Trail Bad', 'trail3.t', 'Administrator', '01046465103', END]];
    const before = Number((await w.p.sql('SELECT COUNT(*) AS n FROM class_upload'))[0].n);
    await checkFile(amal, w.school, csv([HEADER_EN, ...rows]));
    assert.equal(Number((await w.p.sql('SELECT COUNT(*) AS n FROM class_upload'))[0].n), before, 'a check makes no row');
    const t0 = Date.now();
    const id = await add(w, amal, w.school, rows);
    const all = await w.p.sql('SELECT * FROM class_upload');
    assert.equal(all.length, before + 1, 'exactly one row per add');
    const row = all.find((r) => r.id === id)!;
    assert.equal(row.space_id, w.school.id);
    assert.equal(row.uploaded_by, String((await w.p.sql(`SELECT id FROM user WHERE username = '${ADMIN.username}'`))[0].id));
    assert.ok(Number(row.uploaded_at) >= t0 - 1000 && Number(row.uploaded_at) <= Date.now(), 'the time of the add');
    assert.deepEqual([row.lines_added, row.lines_refused], [2, 1]);
    const stored = JSON.stringify(row);
    for (const v of ['Trail', 'trail', '010464651', '+2010464651', 'Student', 'learner', 'guardian', '.csv']) assert.ok(!stored.includes(v), `no ${v} in the row`);
    const members = await w.p.sql(`SELECT u.username, m.class_upload_id FROM membership m JOIN user u ON u.id = m.user_id WHERE u.username LIKE 'trail%' ORDER BY u.username`);
    assert.deepEqual(members.map((r) => [r.username, r.class_upload_id]), [['trail1.t', id], ['trail2.t', id]], 'each new membership carries the upload id');
    assert.equal(Number((await w.p.sql("SELECT COUNT(*) AS n FROM membership WHERE class_upload_id IS NOT NULL AND user_id NOT IN (SELECT id FROM user WHERE username LIKE '%.t')"))[0].n), 0, 'appointing by hand leaves it NULL');
  });

  it('W3b AT-5.2 the upload page lists Earlier uploads, newest first, at most 10, each linking to its done page; each admin sees only their space\'s; no owner page shows an upload', async () => {
    const amal = await as(w, ADMIN, 'en');
    const { id: nileId, nour } = await withNile(w);
    assert.equal((await nour.post('/account/language', { lang: 'en' })).status, 303);
    const nile = { id: nileId };
    const listOf = async (c: typeof amal, space: { id: string }) => {
      const html = await (await c.get(`/s/${space.id}/admin/upload`)).text();
      const at = html.indexOf('id="uploads"');
      assert.ok(at > 0, 'the Earlier uploads section');
      const section = html.slice(at, html.indexOf('</section>', at));
      return {
        section,
        heading: /<h2[^>]*>([^<]*)<\/h2>/.exec(section)?.[1] ?? '',
        rows: [...section.matchAll(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => ({ href: m[1], text: m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() })),
      };
    };
    // Nile before its first upload: the empty state.
    const empty = await listOf(nour, nile);
    assert.equal(empty.heading, 'Earlier uploads');
    assert.deepEqual(empty.rows, [], 'no rows');
    assert.ok(empty.section.includes('No uploads yet.'), 'the empty state');
    // Twelve Mesk uploads by Amal (one with a refused row), on twelve days, and one Nile upload by Nour.
    const mesk: string[] = [];
    for (let i = 0; i < 12; i++) {
      const rows = [[`List ${i} Test`, `list${i}.t`, 'Student', `010464652${String(i).padStart(2, '0')}`, END]];
      if (i === 11) rows.push([`List Bad Test`, 'listbad.t', 'Administrator', '01046465299', END]);
      mesk.push(await add(w, amal, w.school, rows));
    }
    const nileUpload = await add(w, nour, nile, [['Nile List Test', 'nilelist.t', 'Student', '01046465298', utcDatePlusDays(30)]]);
    // Fixed days, in the order made (12 to 23 October 2026), after every earlier upload of the file.
    const day = (i: number) => Date.UTC(2026, 9, 12 + i, 9, 0, 0);
    await w.p.sql(`UPDATE class_upload SET uploaded_at = ${Date.UTC(2026, 0, 1)} WHERE space_id = '${w.school.id}'`);
    for (const [i, id] of mesk.entries()) await w.p.sql(`UPDATE class_upload SET uploaded_at = ${day(i)} WHERE id = '${id}'`);
    const months = UI.en.monthWords.split(',');
    const date = (i: number) => `${12 + i} ${months[9]} 2026`;
    const amalList = await listOf(amal, w.school);
    assert.equal(amalList.heading, 'Earlier uploads');
    const expected = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2].map((i) => ({
      href: `/s/${w.school.id}/admin/upload/${mesk[i]}`, text: `${date(i)}, ${ADMIN.display_name}: added 1, refused ${i === 11 ? 1 : 0}`,
    }));
    assert.deepEqual(amalList.rows, expected, 'newest first, at most 10, each "<date>, <admin name>: added <n>, refused <n>" linking to its done page');
    assert.ok(!amalList.section.includes(nileUpload) && !amalList.section.includes('No uploads yet.'), 'Amal sees only Mesk\'s');
    for (const r of amalList.rows.slice(0, 2)) assert.equal((await amal.get(r.href)).status, 200, 'the link opens the done page');
    const nourList = await listOf(nour, nile);
    assert.equal(nourList.rows.length, 1, 'Nour sees only Nile\'s');
    assert.equal(nourList.rows[0].href, `/s/${nileId}/admin/upload/${nileUpload}`);
    assert.match(nourList.rows[0].text, new RegExp(`^\\d{1,2} [A-Z][a-z]+ \\d{4}, ${NOUR.display_name}: added 1, refused 0$`));
    for (const id of mesk) assert.ok(!nourList.section.includes(id), 'nothing of Mesk\'s');
    // The owner: a crawl of every page the owner reaches shows nothing of an upload.
    const forbidden = [...mesk, nileUpload, '/admin/upload', UI.en.uploadsHeading, UI.ar.uploadsHeading, UI.en.uploadsNone, UI.ar.uploadsNone, 'List 1 Test', 'Nile List Test'];
    const seen = new Set<string>();
    const queue = ['/', '/owner'];
    while (queue.length && seen.size < 80) {
      const path = queue.shift()!;
      if (seen.has(path)) continue;
      seen.add(path);
      const r = await w.owner.get(path);
      const loc = r.headers.get('location');
      if (loc && loc.startsWith('/')) queue.push(loc);
      if (!(r.headers.get('content-type') ?? '').includes('text/html')) continue;
      const body = await r.text();
      for (const f of forbidden) assert.ok(!body.includes(f), `owner ${path}: nothing of an upload (${f})`);
      for (const m of body.matchAll(/href="(\/[^"#?]*)"/g)) if (!/signout|\/r\//.test(m[1])) queue.push(m[1]);
    }
    assert.ok(seen.size > 3, `owner pages crawled (${seen.size})`);
  });

  it('W3b AT-5.6 class_upload is a space table; deleting space W3b-a child-first removes its upload rows and leaves Mesk School\'s; the README gives the statement', async () => {
    const guard = readFileSync(join(root, 'test/guards/space-isolation.test.ts'), 'utf8');
    assert.match(guard, /['"]class_upload['"]/, 'space-isolation lists class_upload');
    const amal = await as(w, ADMIN, 'en');
    const meskUpload = await add(w, amal, w.school, [['Keep One', 'keep1.t', 'Student', '01046465201', END]]);
    const { id: nileId, nour } = await withNile(w);
    const nileUpload = await add(w, nour, { id: nileId }, [['Nile Two', 'niletwo.t', 'Student', '01046465202', utcDatePlusDays(30)]]);
    const meskRows = (await w.p.sql(`SELECT * FROM class_upload WHERE space_id = '${w.school.id}'`)).map((r) => JSON.stringify(r)).sort();
    assert.ok(meskRows.some((r) => r.includes(meskUpload)));
    // The README's statement for one space's upload rows.
    const readme = readFileSync(join(root, 'README.md'), 'utf8');
    const one = readme.match(/`(DELETE FROM class_upload WHERE space_id = '<space id>';)`/)?.[1];
    assert.ok(one, 'the README gives the statement');
    // Deleting space W3b-a (Nile): child tables first (in rounds, as foreign keys allow), then the space row.
    const before = await snapshot(w, { usage: true });
    const spaceTables = (await w.p.sql("SELECT m.name AS t FROM sqlite_master m WHERE m.type = 'table' AND m.name NOT IN ('space', 'class_upload') AND EXISTS (SELECT 1 FROM pragma_table_info(m.name) p WHERE p.name = 'space_id')")).map((r) => String(r.t));
    await w.p.sql(one!.replace('<space id>', nileId));
    assert.equal(Number((await w.p.sql(`SELECT COUNT(*) AS n FROM class_upload WHERE space_id = '${nileId}'`))[0].n), 0, 'the statement removes the upload rows of that space');
    let left = [...spaceTables];
    for (let round = 0; left.length && round < 10; round++) {
      const still: string[] = [];
      for (const t of left) {
        try { await w.p.sql(`DELETE FROM "${t}" WHERE space_id = '${nileId}'`); } catch { still.push(t); }
      }
      left = still;
    }
    assert.deepEqual(left, [], 'every child table emptied of the space');
    await w.p.sql(`DELETE FROM space WHERE id = '${nileId}'`);
    assert.deepEqual((await w.p.sql(`SELECT * FROM class_upload WHERE space_id = '${w.school.id}'`)).map((r) => JSON.stringify(r)).sort(), meskRows, 'Mesk School\'s upload rows unchanged');
    assert.equal(Number((await w.p.sql(`SELECT COUNT(*) AS n FROM class_upload WHERE id = '${nileUpload}'`))[0].n), 0);
    const after = await snapshot(w, { usage: true });
    for (const t of Object.keys(before)) {
      const gone = before[t].filter((r) => !after[t].includes(r));
      const added = after[t].filter((r) => !before[t].includes(r));
      assert.deepEqual(added, [], `${t}: nothing added`);
      for (const r of gone) {
        const row = JSON.parse(String(r));
        assert.ok(row.space_id === nileId || (t === 'space' && row.id === nileId), `${t}: only the space's rows go (${String(r).slice(0, 80)})`);
      }
    }
  });
});

// ------------------------------------------------------- AT-5.3 and AT-5.4 ----
// Wrangler on a fresh local D1 of the production configuration (no account), as wave 2's AT-3.1 and AT-3.2.
const isWindows = process.platform === 'win32';
const wranglerBin = join(root, 'node_modules', '.bin', isWindows ? 'wrangler.cmd' : 'wrangler');
function wrangler(args: string[]): string {
  return execFileSync(wranglerBin, args, {
    cwd: root, encoding: 'utf8', env: { ...process.env, WRANGLER_SEND_METRICS: 'false', NO_COLOR: '1', CI: 'true' },
    stdio: ['ignore', 'pipe', 'pipe'], shell: isWindows, maxBuffer: 64 * 1024 * 1024,
  });
}

describe('W3b AT-5 the migration and its down path', { concurrency: false }, () => {
  let dir: string;
  let persist: string;
  let mainConfig: string;
  let w: Wave3aWorld;
  const mainFiles = readdirSync(join(root, 'migrations')).filter((f) => f.endsWith('.sql') && f !== NEW_MIGRATION).sort();
  const allFiles = [...mainFiles, NEW_MIGRATION];
  const run = (sqlFile: string, config?: string) =>
    wrangler(['d1', 'execute', 'lms-lego', '--local', '--persist-to', persist, ...(config ? ['--config', config] : []), '--file', sqlFile, '--yes']);
  const apply = (config?: string) => wrangler(['d1', 'migrations', 'apply', 'lms-lego', '--local', '--persist-to', persist, ...(config ? ['--config', config] : [])]);
  let n = 0;
  const queries = (sqls: string[]): Row[][] => {
    const file = join(dir, `q${++n}.sql`);
    writeFileSync(file, sqls.map((s) => s + ';').join('\n'));
    const out = wrangler(['d1', 'execute', 'lms-lego', '--local', '--persist-to', persist, '--json', '--file', file]);
    const parsed = JSON.parse(out.slice(out.search(/^\[/m))) as { results: Row[] }[];
    assert.equal(parsed.length, sqls.length, 'one result per statement');
    return parsed.map((p) => p.results);
  };
  const query = (sql: string): Row[] => queries([sql])[0];
  const schema = () => query("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY type, name");
  const applied = () => query('SELECT name FROM d1_migrations ORDER BY id').map((r) => String(r.name));
  const tables = () => schema().filter((r) => r.type === 'table' && r.name !== 'd1_migrations').map((r) => String(r.name));
  /** Every row of every table, without the new column (main has none), so main's rows can be compared. */
  const rows = () => {
    const names = tables();
    const all = queries(names.map((t) => `SELECT * FROM "${t}"`));
    return new Map(names.map((t, i) => [t, all[i].map((r) => {
      const { class_upload_id, ...rest } = r;
      void class_upload_id;
      return JSON.stringify(rest);
    }).sort()]));
  };

  /** The wave 3b world's rows (in-process), as INSERT statements of main's schema (no upload table, no new column). */
  async function worldSql(): Promise<string> {
    const lines = ['PRAGMA defer_foreign_keys = true;'];
    const names = await w.p.sql("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> 'class_upload' ORDER BY rowid");
    const lit = (v: unknown) => (v === null ? 'NULL' : typeof v === 'number' || typeof v === 'bigint' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
    for (const { name } of names) {
      for (const r of await w.p.sql(`SELECT * FROM "${String(name)}" ORDER BY rowid`)) {
        const cols = Object.keys(r).filter((c) => c !== 'class_upload_id');
        lines.push(`INSERT INTO "${String(name)}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${cols.map((c) => lit(r[c])).join(', ')});`);
      }
    }
    return lines.join('\n') + '\n';
  }

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
    dir = mkdtempSync(join(tmpdir(), 'lms-w3b-at5-'));
    persist = join(dir, 'd1');
    const mainDir = join(dir, 'main-migrations');
    mkdirSync(mainDir);
    for (const f of mainFiles) copyFileSync(join(root, 'migrations', f), join(mainDir, f));
    mainConfig = join(dir, 'wrangler.json');
    writeFileSync(mainConfig, JSON.stringify({
      name: 'lms-lego', main: join(root, 'src', 'index.ts'), compatibility_date: '2026-10-01',
      d1_databases: [{ binding: 'DB', database_name: 'lms-lego', migrations_dir: mainDir }],
    }));
    w = await wave3bWorld();
  });
  after(async () => {
    await w?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('W3b AT-5.3 the forward migration adds exactly class_upload, its index and membership.class_upload_id; everything else is identical; a second apply is a no-op', async () => {
    assert.match(NEW_MIGRATION, /^0012_/, 'the next number after 0011');
    const { mainOut, mainApplied, mainSchema, mainRows, forward } = await forwardOnce();
    for (const f of mainFiles) assert.ok(mainOut.includes(f), `main's apply lists ${f}`);
    assert.deepEqual(mainApplied, mainFiles);
    assert.ok((mainRows.get('membership') ?? []).length >= 8, 'the world is loaded');
    assert.ok(forward.includes(NEW_MIGRATION), `the forward apply runs the new migration:\n${forward}`);
    assert.deepEqual(applied(), allFiles, 'recorded, in order');
    const newSchema = schema();
    const added = newSchema.filter((r) => !mainSchema.some((m) => JSON.stringify(m) === JSON.stringify(r)));
    const gone = mainSchema.filter((m) => !newSchema.some((r) => JSON.stringify(m) === JSON.stringify(r)));
    assert.deepEqual(gone.map((r) => `${r.type} ${r.name}`), ['table membership'], 'only membership\'s definition changes (the new column)');
    assert.deepEqual(added.map((r) => `${r.type} ${r.name}`).sort(), ['index class_upload_space_time', 'table class_upload', 'table membership']);
    const flat = (s: unknown) => String(s).replace(/\s+/g, ' ').trim();
    const oldMembership = flat(gone[0].sql);
    const newMembership = flat(added.find((r) => r.name === 'membership')!.sql);
    assert.equal(newMembership.replace(', class_upload_id TEXT REFERENCES class_upload (id) ON DELETE SET NULL', ''), oldMembership, 'membership gains exactly the nullable column');
    const cols = query("SELECT name, \"notnull\" AS nn, dflt_value AS d FROM pragma_table_info('membership') WHERE name = 'class_upload_id'");
    assert.deepEqual(cols, [{ name: 'class_upload_id', nn: 0, d: null }], 'nullable, no default');
    for (const part of [
      'id TEXT PRIMARY KEY', 'space_id TEXT NOT NULL REFERENCES space (id) ON DELETE CASCADE', 'uploaded_by TEXT NOT NULL REFERENCES user (id)',
      'uploaded_at INTEGER NOT NULL', 'lines_added INTEGER NOT NULL', 'lines_refused INTEGER NOT NULL',
    ]) assert.ok(flat(added.find((r) => r.name === 'class_upload')!.sql).includes(part), `section 6.2: ${part}`);
    const now = rows();
    assert.deepEqual(now.get('class_upload'), [], 'the new table is empty');
    now.delete('class_upload');
    assert.deepEqual(now, mainRows, 'every existing row is identical');
    assert.equal(Number(query('SELECT COUNT(*) AS n FROM membership WHERE class_upload_id IS NOT NULL')[0].n), 0, 'every existing membership has no upload');
    const sql = readFileSync(join(root, 'migrations', NEW_MIGRATION), 'utf8').replace(/--.*$/gm, '');
    for (const p of [/\bDROP\b/i, /\bRENAME\b/i, /\bDELETE\s+FROM\b/i, /\bUPDATE\s+\w+\s+SET\b/i]) assert.ok(!p.test(sql), `additive: no ${p}`);
    assert.match(apply(), /No migrations to apply/, 'a second apply is a no-op');
    assert.deepEqual(schema(), newSchema, 'the schema is the same after it');
  });

  it('W3b AT-5.4 the down script brings the schema and the applied-migrations record back to main\'s; a new apply works again', async () => {
    const { mainSchema, mainRows } = await forwardOnce();
    const newSchema = schema();
    assert.ok(newSchema.some((r) => r.name === 'class_upload'), 'the wave 3b schema, to start from');
    assert.ok(existsSync(join(root, DOWN)) && !existsSync(join(root, 'migrations', '0012_class_upload.down.sql')), 'outside migrations/');
    for (const f of ['.github/workflows/deploy.yml', 'wrangler.jsonc']) {
      assert.ok(!/migrations-down|\.down\.sql/.test(readFileSync(join(root, f), 'utf8')), `${f} does not refer to the down script`);
    }
    // An upload row and a membership that names it, so the down path has something to forget.
    const m = query("SELECT m.id, m.space_id, m.granted_by FROM membership m WHERE m.role = 'learner' LIMIT 1")[0];
    const file = join(dir, 'upload.sql');
    writeFileSync(file, `INSERT INTO class_upload (id, space_id, uploaded_by, uploaded_at, lines_added, lines_refused) VALUES ('up-1', '${m.space_id}', '${m.granted_by}', 1, 1, 0);\nUPDATE membership SET class_upload_id = 'up-1' WHERE id = '${m.id}';\n`);
    run(file);
    run(join(root, DOWN));
    assert.deepEqual(schema(), mainSchema, 'the schema is exactly main\'s');
    assert.deepEqual(applied(), mainFiles, 'Wrangler\'s record is exactly main\'s');
    assert.deepEqual(rows(), mainRows, 'every other row is unchanged');
    const again = apply();
    assert.ok(again.includes(NEW_MIGRATION), 'a later forward apply runs the migration again');
    assert.deepEqual(schema(), newSchema, 'exactly the wave 3b schema');
    assert.deepEqual(applied(), allFiles);
    assert.equal(Number(query('SELECT COUNT(*) AS n FROM class_upload')[0].n), 0, 'empty');
    const readme = readFileSync(join(root, 'README.md'), 'utf8');
    for (const phrase of ['migrations-down/0012_class_upload.down.sql', "owner's RED decision", 'first redeploy the earlier code, then run the down script']) {
      assert.ok(readme.includes(phrase), `the README says: ${phrase}`);
    }
  });
});
