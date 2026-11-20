// LMS wave 5 (product-contract v2 on PIL-246, AT-5): stored data rules.
// AT-5.1 and AT-5.2 apply the migrations with Wrangler on a fresh local D1 of
// the production configuration (no account), as wave 4's AT-5.1 and AT-5.2;
// AT-5.3 (code rollback) is test/rollback/old-code.test.ts in the rollback job,
// with its README line checked here; AT-5.4 deletion; AT-5.5 export, backup
// and erasure. Made-up data only.
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
import {
  ADMIN, HADEER, MONA, OMAR, SALMA, SHIMAA, annRows, as, cardOf, cardSides, editorPath, post, publisherAnn, topicPath, wave4World, withNile5,
  type Wave1World,
} from './world.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));
const NEW_MIGRATION = '0014_announcements.sql';
const DOWN = join('migrations-down', '0014_announcements.down.sql');
type Row = Record<string, unknown>;
const readme = () => readFileSync(join(root, 'README.md'), 'utf8');
const flat = (s: unknown) => String(s).replace(/\s+/g, ' ').replace(/\( /g, '(').replace(/ \)/g, ')').trim();

/** The table and index of section 6.1, as the migration writes them (the subject by (id, space_id), the content tables' style). */
const TABLE_SQL = `CREATE TABLE announcement (
  id          TEXT PRIMARY KEY,
  space_id    TEXT NOT NULL REFERENCES space (id),
  subject_id  TEXT NOT NULL,
  body        TEXT NOT NULL CHECK (removed_at IS NOT NULL OR length(body) >= 1),
  author_role TEXT NOT NULL CHECK (author_role IN ('publisher', 'admin')),
  created_at  TEXT NOT NULL,
  edited_at   TEXT,
  removed_at  TEXT,
  FOREIGN KEY (subject_id, space_id) REFERENCES subject (id, space_id)
)`;
const INDEX_SQL = 'CREATE INDEX announcement_by_subject ON announcement (space_id, subject_id, removed_at, created_at)';

// ------------------------------------------------------- AT-5.1 and AT-5.2 ----
const isWindows = process.platform === 'win32';
const wranglerBin = join(root, 'node_modules', '.bin', isWindows ? 'wrangler.cmd' : 'wrangler');
function wrangler(args: string[]): string {
  return execFileSync(wranglerBin, args, {
    cwd: root, encoding: 'utf8', env: { ...process.env, WRANGLER_SEND_METRICS: 'false', NO_COLOR: '1', CI: 'true' },
    stdio: ['ignore', 'pipe', 'pipe'], shell: isWindows, maxBuffer: 64 * 1024 * 1024,
  });
}

describe('W5 AT-5 the migration and its down path', { concurrency: false }, () => {
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
  /** Every row of every table of main's schema. */
  const rows = (names = tables().filter((t) => t !== 'announcement')) => {
    const all = queries(names.map((t) => `SELECT * FROM "${t}"`));
    return new Map(names.map((t, i) => [t, all[i].map((r) => JSON.stringify(r)).sort()]));
  };

  /** The world's rows (in-process), as INSERT statements of main's schema (no announcement). */
  async function worldSql(): Promise<string> {
    const lines = ['PRAGMA defer_foreign_keys = true;'];
    const names = await w.p.sql("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT IN ('d1_migrations', 'announcement') ORDER BY rowid");
    const lit = (v: unknown) => (v === null ? 'NULL' : typeof v === 'number' || typeof v === 'bigint' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
    for (const { name } of names) {
      for (const r of await w.p.sql(`SELECT * FROM "${String(name)}" ORDER BY rowid`)) {
        const cols = Object.keys(r);
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
    dir = mkdtempSync(join(tmpdir(), 'lms-w5-at5-'));
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

  it('W5 AT-5.1 the forward migration creates exactly the table and index of section 6.1; everything else is identical; a second apply is a no-op', async () => {
    assert.match(NEW_MIGRATION, /^0014_/, 'the next number after 0013');
    const { mainOut, mainApplied, mainSchema, mainRows, mainPragmas, forward } = await forwardOnce();
    for (const f of mainFiles) assert.ok(mainOut.includes(f), `main's apply lists ${f}`);
    assert.deepEqual(mainApplied, mainFiles);
    assert.ok((mainRows.get('subject') ?? []).length >= 4, 'the world is loaded');
    assert.ok(forward.includes(NEW_MIGRATION), `the forward apply runs the new migration:\n${forward}`);
    assert.deepEqual(applied(), allFiles, 'recorded, in order');
    const newSchema = schema();
    const added = newSchema.filter((r) => !mainSchema.some((m) => JSON.stringify(m) === JSON.stringify(r)));
    const gone = mainSchema.filter((m) => !newSchema.some((r) => JSON.stringify(m) === JSON.stringify(r)));
    assert.deepEqual(gone, [], 'no earlier table, index or trigger changes');
    assert.deepEqual(added.map((r) => `${r.type} ${r.name}`), ['index announcement_by_subject', 'table announcement'], 'exactly one table and one index');
    assert.equal(flat(added.find((r) => r.type === 'table')!.sql), flat(TABLE_SQL), 'the table of section 6.1');
    assert.equal(flat(added.find((r) => r.type === 'index')!.sql), flat(INDEX_SQL), 'the index of section 6.1');
    const newPragmas = pragmas(tables());
    for (const [t, p] of mainPragmas) assert.deepEqual(newPragmas.get(t), p, `${t}: the same columns, indexes and foreign keys`);
    assert.deepEqual(rows(), mainRows, 'every existing row is identical');
    assert.deepEqual(query('SELECT COUNT(*) AS n FROM announcement'), [{ n: 0 }], 'no announcement yet');
    const sql = readFileSync(join(root, 'migrations', NEW_MIGRATION), 'utf8').replace(/--.*$/gm, '');
    for (const p of [/\bDROP\b/i, /\bRENAME\b/i, /\bDELETE\s+FROM\b/i, /\bUPDATE\s+\w+\s+SET\b/i, /\bALTER\b/i]) assert.ok(!p.test(sql), `additive: no ${p}`);
    assert.equal(flat(sql), `${flat(TABLE_SQL)}; ${flat(INDEX_SQL)};`, 'the two statements, nothing else');
    assert.match(apply(), /No migrations to apply/, 'a second apply is a no-op');
    assert.deepEqual(schema(), newSchema, 'the schema is the same after it');
  });

  it('W5 AT-5.2 the down script drops the index and the table and its applied-migrations line; schema and record equal main\'s; applying again gives the wave 5 schema', async () => {
    const { mainSchema, mainRows, mainPragmas } = await forwardOnce();
    assert.ok(tables().includes('announcement'), 'the wave 5 schema, to start from');
    assert.ok(existsSync(join(root, DOWN)) && !existsSync(join(root, 'migrations', '0014_announcements.down.sql')), 'outside migrations/');
    for (const f of ['.github/workflows/deploy.yml', 'wrangler.jsonc']) {
      assert.ok(!/migrations-down|\.down\.sql/.test(readFileSync(join(root, f), 'utf8')), `${f} does not refer to the down script`);
    }
    // An announcement, so the down path has something to delete.
    const subject = query('SELECT id, space_id FROM subject LIMIT 1')[0];
    const file = join(dir, 'ann.sql');
    writeFileSync(file, `INSERT INTO announcement (id, space_id, subject_id, body, author_role, created_at) VALUES ('down-1', '${String(subject.space_id)}', '${String(subject.id)}', 'Down path.', 'admin', '2026-11-20T08:00:00.000Z');\n`);
    run(file);
    run(join(root, DOWN));
    assert.deepEqual(pragmas(tables()), mainPragmas, 'per table: columns, indexes and foreign keys are main\'s');
    assert.deepEqual(schema(), mainSchema, 'the schema (with each stored SQL text) is main\'s');
    assert.deepEqual(applied(), mainFiles, 'Wrangler\'s record is exactly main\'s');
    assert.deepEqual(rows(), mainRows, 'every row is unchanged');
    const again = apply();
    assert.ok(again.includes(NEW_MIGRATION), 'a later forward apply runs the migration again');
    assert.ok(tables().includes('announcement'), 'the wave 5 table again');
    assert.deepEqual(applied(), allFiles);
    assert.deepEqual(query('SELECT COUNT(*) AS n FROM announcement'), [{ n: 0 }], 'empty again');
    const text = readme();
    for (const phrase of ['migrations-down/0014_announcements.down.sql', "owner's RED decision", 'first redeploy the earlier code, then run the down script']) {
      assert.ok(text.includes(phrase), `the README says: ${phrase}`);
    }
  });
});

// ------------------------------------------------------- AT-5.3 README line ----
describe('W5 AT-5.3 the README\'s rollback text', () => {
  it('W5 AT-5.3 the README says that while earlier code runs announcements are not shown, and they return when wave 5 is redeployed', () => {
    const text = readme();
    const rollback = text.slice(text.indexOf('\n## Rollback'));
    assert.ok(rollback.includes('while earlier code runs, announcements are not shown and none can be posted, and every stored announcement returns when wave 5 is redeployed'), 'in "Rollback"');
    const old = readFileSync(join(root, 'test/rollback/old-code.test.ts'), 'utf8');
    assert.match(old, /it\('W5 AT-5\.3 /, 'the rollback job\'s case');
    const ci = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8');
    assert.match(ci, /--test-name-pattern='\^W5 AT-5\\\.3 ' test\/rollback\/old-code\.test\.ts/, 'its own step in the rollback job');
  });
});

// -------------------------------------------------- the W5-1a deploy note ----
// Contract section 12: W5-1a must not be deployed alone. While the learner's
// views have no announcement block, the README says so (W5-1b removes this step).
describe('W5 deploy note', () => {
  it('W5 deploy note while src/views/learn.ts has no announcement block, the README says part 1 is not deployed on its own', () => {
    const learn = readFileSync(join(root, 'src/views/learn.ts'), 'utf8');
    assert.ok(!/announcements|annTitle|annHomeTitle/.test(learn), 'the learner views have no announcement block (W5-1a)');
    assert.ok(readme().includes('Wave 5 part 1 (W5-1a) is not deployed on its own; deploy only after W5-1b is merged.'), 'the README\'s deploy note');
  });
});

// ------------------------------------------------------------ AT-5.4 -----------
/** Deletes a table's rows matching a condition, every row referring to them first (child-first, by the foreign keys).
 * A foreign key of two columns (as announcement's (subject_id, space_id)) is matched on both together. */
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

describe('W5 AT-5.4 announcements go with their subject and their space; ending the writer\'s access changes none; no row names a person', { concurrency: false }, () => {
  it('W5 AT-5.4 child-first deletion of a subject and of space W5-b; Hadeer\'s access ended: items stay, the next publisher manages the publisher items, the admin removes any', async () => {
    const w = await wave4World();
    try {
      const s = w.school;
      const nile = await withNile5(w);
      const [hadeer, amal] = await cardSides(w, 'en');
      await post(hadeer.c, hadeer.post, 'Teacher on Mathematics.');
      await post(amal.c, amal.post, 'Admin on Mathematics.');
      await post(amal.c, `${topicPath(s, s.arabic)}/announcements`, 'Admin on Arabic grammar.');
      // No column names a person, and no row holds a person's id, name, username or mobile.
      const cols = (await w.p.sql("SELECT name FROM pragma_table_info('announcement')")).map((r) => String(r.name));
      assert.deepEqual(cols, ['id', 'space_id', 'subject_id', 'body', 'author_role', 'created_at', 'edited_at', 'removed_at'], 'no column names a person');
      const people = await w.p.sql('SELECT id, username, display_name, mobile FROM user');
      const stored = JSON.stringify(await annRows(w));
      for (const p of people) for (const v of Object.values(p)) if (v) assert.ok(!stored.includes(`"${String(v)}"`), `no row names ${String(v)}`);
      assert.deepEqual(await w.p.sql("SELECT \"table\" AS t FROM pragma_foreign_key_list('announcement') WHERE \"table\" = 'user'"), [], 'no reference to a person');
      // The README's child-first list gains announcement.
      const text = readme();
      assert.ok(text.includes('child-first: `announcement` rows of the subject before the `subject` row'), 'the README\'s child-first list names announcement');
      // Deleting Arabic grammar child-first leaves none of its announcements; Mathematics' stay.
      await deleteChildFirst(w, 'subject', `id = '${s.arabic}'`);
      assert.deepEqual(await w.p.sql(`SELECT * FROM announcement WHERE subject_id = '${s.arabic}'`), [], 'none of the deleted subject\'s');
      assert.equal((await w.p.sql(`SELECT * FROM announcement WHERE subject_id = '${s.math}'`)).length, 2, 'Mathematics\' stay');
      // Space W5-b child-first: none of its announcements; no Mesk School row changes.
      const meskBefore = JSON.stringify(await w.p.sql(`SELECT * FROM announcement WHERE space_id = '${s.id}' ORDER BY id`));
      const subjectsBefore = JSON.stringify(await w.p.sql(`SELECT * FROM subject WHERE space_id = '${s.id}' ORDER BY id`));
      await deleteChildFirst(w, 'space', `id = '${nile.id}'`);
      assert.deepEqual(await w.p.sql(`SELECT * FROM announcement WHERE space_id = '${nile.id}'`), [], 'none of W5-b\'s');
      assert.equal(JSON.stringify(await w.p.sql(`SELECT * FROM announcement WHERE space_id = '${s.id}' ORDER BY id`)), meskBefore, 'Mesk School\'s announcements unchanged');
      assert.equal(JSON.stringify(await w.p.sql(`SELECT * FROM subject WHERE space_id = '${s.id}' ORDER BY id`)), subjectsBefore, 'Mesk School\'s subjects unchanged');
      // Ending Hadeer's access changes no announcement; it still shows with the role word.
      const before = JSON.stringify(await annRows(w));
      assert.equal((await amal.c.post(`/s/${s.id}/admin/people/${w.ids[HADEER.username]}/end`, {})).status, 303, 'Amal ends Hadeer\'s access');
      assert.equal(JSON.stringify(await annRows(w)), before, 'no announcement changed');
      const card = cardOf(await (await amal.c.get(amal.page)).text())!;
      const teacher = card.items.find((i) => i.text === 'Teacher on Mathematics.')!;
      assert.ok(teacher.by.startsWith('Teacher · '), 'shown with the role word');
      // The admin gives Mathematics a new publisher (Shimaa): she manages the publisher items; the admin can remove any.
      const shimaaId = w.ids[SHIMAA.username];
      const assigned = (await w.p.sql(`SELECT user_id, group_id FROM subject_access WHERE subject_id = '${s.math}'`));
      const fields = new URLSearchParams({ publisher: shimaaId });
      for (const r of assigned) fields.append(r.group_id ? 'set' : 'learner', String(r.group_id ?? r.user_id));
      const saved = await amal.c.post(topicPath(s, s.math), fields as unknown as Record<string, string>);
      assert.equal(saved.status, 303, 'Shimaa is Mathematics\' publisher now');
      const shimaa = await as(w, SHIMAA, 'en');
      const shimaaCard = cardOf(await (await shimaa.get(editorPath(s, s.math))).text())!;
      const item = shimaaCard.items.find((i) => i.id === teacher.id)!;
      assert.ok(item.edit && item.remove, 'the next publisher has Edit and Remove on the publisher item');
      assert.equal(shimaaCard.items.find((i) => i.role === 'admin')!.edit, null, 'not on the admin item');
      assert.equal((await shimaa.post(`${publisherAnn(s, s.math)}/${teacher.id}`, { body: 'Edited by the next teacher.' })).status, 303, 'she edits it');
      const rows = await annRows(w);
      assert.equal(rows.find((r) => r.id === teacher.id)!.author_role, 'publisher', 'still a publisher item');
      const adminItem = rows.find((r) => r.author_role === 'admin' && r.subject_id === s.math)!;
      assert.equal((await amal.c.post(`${amal.post}/${teacher.id}/remove`, {})).status, 303, 'the admin removes the publisher item');
      assert.equal((await amal.c.post(`${amal.post}/${adminItem.id}/remove`, {})).status, 303, 'and the admin item');
      assert.deepEqual((await annRows(w)).filter((r) => r.space_id === s.id).map((r) => [r.body, Boolean(r.removed_at)]), [['', true], ['', true]], 'both removed, their text erased');
    } finally {
      await w.close();
    }
  });
});

// ------------------------------------------------------------ AT-5.5 -----------
describe('W5 AT-5.5 no route returns announcement text but the pages of section 7; the README and Later on export, backup and erasure; a removed row\'s body is empty', { concurrency: false }, () => {
  it('W5 AT-5.5 a crawl of every page of every person finds announcement text only on the card\'s pages', async (t) => {
    const w = await wave4World({ activity: true });
    try {
      const s = w.school;
      const [hadeer, amal] = await cardSides(w, 'en');
      const texts = ['Crawl teacher text.', 'Crawl admin text.'];
      await post(hadeer.c, hadeer.post, texts[0]);
      await post(amal.c, amal.post, texts[1]);
      // Section 7: the card on the editor and the subject admin page, and their edit and remove pages.
      const allowed = (who: string, path: string) => {
        const p = path.split('?')[0];
        if (who === 'Hadeer' && p.startsWith(editorPath(s, s.math))) return true;
        if (who === 'Amal' && p.startsWith(topicPath(s, s.math))) return true;
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
        const pages = await crawl(c, start, [], 150, (p) => !p.includes('signout') && !p.startsWith('/r/') && !p.endsWith('/remove'));
        for (const p of pages) {
          seen++;
          if (!texts.some((x) => p.body.includes(x))) continue;
          assert.ok(allowed(who, p.path), `${who} ${p.path}: shows announcement text`);
          where.add(`${who} ${p.path.split('?')[0].replace(s.id, '<space>').replace(s.math, '<math>')}`);
        }
      }
      t.diagnostic(`AT-5.5 ${seen} responses crawled; announcement text on ${where.size}: ${[...where].sort().join('; ')}`);
      assert.ok([...where].some((x) => x.startsWith('Hadeer ')) && [...where].some((x) => x.startsWith('Amal ')), 'seen on both cards');
      // A removed row's body is empty.
      const [first] = await annRows(w);
      assert.equal((await hadeer.c.post(`${hadeer.post}/${first.id}/remove`, {})).status, 303);
      assert.equal((await annRows(w)).find((r) => r.id === first.id)!.body, '', 'a removed row\'s body is empty');
    } finally {
      await w.close();
    }
  });

  it('W5 AT-5.5 the README states sections 6.4 and 6.5 in plain words and Later\'s export row carries announcements with their subject', () => {
    const text = readme();
    for (const phrase of [
      'there is no per-space export, so announcements are in none',
      'announcements travel with their subject (content written for learners, not personal data)',
      'Like every table, `announcement` is in D1\'s 30-day history',
      'Removing an announcement erases its text from the table at once',
      'earlier texts (before an edit or a removal) remain only in D1\'s 30-day history and expire with it; the owner can recover one from there within 30 days (RED, manual)',
    ]) assert.ok(text.includes(phrase), `the README says: ${phrase}`);
    const later = readFileSync(join(root, 'docs/04-LATER.md'), 'utf8');
    const row = later.split('\n').find((l) => l.includes('Per-space data export'))!;
    assert.ok(row.includes('would carry announcements (LMS wave 5) with their subject'), 'Later\'s export row');
  });
});
