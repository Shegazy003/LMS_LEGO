// LMS wave 8, W8-1a and W8-1b (product-contract v2 on PIL-299, AT-5.1 to AT-5.4; section 6, N1 and B1; section 5, R1 and R2).
// - AT-5.1: every 3.4 surface (test/wave8/n1.ts requestList) answers, by N1,
//   exactly as a41f7d8's stored captures (test/wave8/fixtures/): for W8-0, for
//   W8-a with every date passed (2027-01-01). (In W8-1a it also held for W8-a
//   at any clock; from W8-1b the learner reads use the dates, AT-2 to AT-4.)
//   First the fixtures are recaptured from a41f7d8 (LMS_BASE_ROOT, default .base-w8/) and must match.
// - AT-5.2: the Opening dates page makes at most 2 statements from the gate
//   on (the gate, then the outline with due and opening dates); each press
//   one gate read, one chapter read and at most one write.
// - AT-5.2 (W8-1b): every 3.4 request makes at most as many D1 statements as
//   a41f7d8 on the same database, and reads at most as many rows (D1 rows_read,
//   each read replayed on a local D1 copy).
// - AT-5.4 (W8-1b): no wave 8 action changes or deletes a done mark, due date,
//   quiz, attempt, announcement or activity row.
// - AT-5.3: migration 0017 is additive; a41f7d8's code runs on the migrated
//   database (W8-a's dates stored) with every chapter open; the down script
//   restores a41f7d8's schema and record.
// Made-up data only.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { inProcess } from '../support/product.ts';
import type { InProcessWorker } from '../support/in-process.ts';
import { BASE_ROOT, BASE_SHA, CLOCKS, capture, captureOn, differences, readFixture, requestList, type Captured, type ClockKey } from './n1.ts';
import { AMAL, AT8, HADEER, ID, MONA, OMAR, OPENINGS, OWNER8, RANA, SALMA, adminOf, editorOf, openPage, openPost, seedW8, w8World, type Twin, type W8World } from './world.ts';
import { learnerData, rowCounts } from './learner.ts';
import { Client } from '../support/http.ts';
import { r1aNormal } from '../redesign/base.ts';

const repo = fileURLToPath(new URL('../..', import.meta.url));
const MIGRATION = '0017_chapter_opening.sql';
const DOWN = join('migrations-down', '0017_chapter_opening.down.sql');

function baseIsThere(): void {
  assert.ok(existsSync(join(BASE_ROOT, 'src', 'app.ts')), `a41f7d8 ${BASE_SHA} is checked out at ${BASE_ROOT}`);
  assert.ok(existsSync(join(BASE_ROOT, 'migrations', '0016_quizzes.sql')) && !existsSync(join(BASE_ROOT, 'migrations', MIGRATION)), 'the base is main after wave 7 and before wave 8');
}

/** a41f7d8's live captures of this run, per clock (for the first-difference hint). */
const live = new Map<ClockKey, Captured[]>();

/** a41f7d8's capture at one clock, recaptured here if the recapture test did not run first, and checked against the stored fixture. */
async function baseAt(clock: ClockKey): Promise<Captured[]> {
  let got = live.get(clock);
  if (!got) {
    baseIsThere();
    got = await capture({ root: BASE_ROOT, dates: false, atMs: CLOCKS[clock] });
    live.set(clock, got);
  }
  assert.equal(differences(got, readFixture(clock)).join('\n'), '', `a41f7d8 at ${clock}: the recapture equals the stored fixture`);
  return got;
}

/** LMS redesign R1a (PIL-325; rule rows UX-3, UX-1 look, UX-34/UX-54/UX-62, UX-55, UX-62/UX-63, UX-16a): every page's
 * shell changed, so the candidate is compared with a41f7d8's live capture (itself equal to the stored fixture, byte for
 * byte, above), each response by N1 and then the R1a normaliser on both sides (test/redesign/base.ts): same request,
 * status and headers, and the same body after r1aNormal. */
function r1aDifferences(got: Captured[], base: Captured[], clock: ClockKey): string[] {
  const today = new Date(CLOCKS[clock]).toISOString().slice(0, 10);
  const out: string[] = [];
  if (got.length !== base.length) out.push(`${got.length} responses, a41f7d8 ${base.length}`);
  for (let i = 0; i < Math.min(got.length, base.length) && out.length < 8; i++) {
    const a = got[i];
    const b = base[i];
    const what = `#${a.n} ${a.who} ${a.method} ${a.path}`;
    if (a.path !== b.path || a.who !== b.who) out.push(`${what}: the request list differs (${b.who} ${b.path})`);
    else if (a.status !== b.status) out.push(`${what}: status ${a.status}, a41f7d8 ${b.status}`);
    else if (JSON.stringify(a.headers) !== JSON.stringify(b.headers)) out.push(`${what}: headers ${JSON.stringify(a.headers)}, a41f7d8 ${JSON.stringify(b.headers)}`);
    else {
      const x = r1aNormal(b.body.toString('utf8'), today);
      const y = r1aNormal(a.body.toString('utf8'), today);
      if (x !== y) {
        let k = 0;
        while (k < x.length && x[k] === y[k]) k++;
        out.push(`${what}: body at ${k}:\n a41f7d8:   ${JSON.stringify(x.slice(Math.max(0, k - 100), k + 140))}\n candidate: ${JSON.stringify(y.slice(Math.max(0, k - 100), k + 140))}`);
      }
    }
  }
  return out;
}

async function same(what: string, got: Captured[], clock: ClockKey): Promise<void> {
  const diff = r1aDifferences(got, await baseAt(clock), clock);
  assert.equal(diff.join('\n'), '', `${what}: identical (N1, then the R1a normaliser on both sides) to a41f7d8's responses at ${clock}`);
}

// ------------------------------------------------------------------ AT-5.1 ----
describe('W8 AT-5.1 every 3.4 response is identical (N1) to the stored a41f7d8 fixtures: W8-0, and W8-a with every date passed', { concurrency: false }, () => {
  it('W8 AT-5.1 recapture: a41f7d8\'s responses at each clock equal the stored fixtures', async (t) => {
    baseIsThere();
    for (const clock of Object.keys(CLOCKS) as ClockKey[]) {
      const got = await capture({ root: BASE_ROOT, dates: false, atMs: CLOCKS[clock] });
      live.set(clock, got);
      assert.equal(differences(got, readFixture(clock)).join('\n'), '', `a41f7d8 at ${clock}: the recapture equals the stored fixture`);
    }
    const one = live.get('d9')!;
    t.diagnostic(`AT-5.1 ${Object.keys(CLOCKS).length} clocks x ${one.length} responses recaptured from a41f7d8 ${BASE_SHA.slice(0, 7)}; statuses at d9: ${[...new Set(one.map((r) => r.status))].join(', ')}; people: ${[...new Set(one.map((r) => r.who))].join(', ')}`);
  });

  it('W8 AT-5.1 W8-0 (no date stored) on the candidate, at 2026-12-09 and 2027-01-01', async () => {
    for (const clock of ['d9', 'y2027'] as const) await same(`W8-0 at ${clock}`, await capture({ dates: false, atMs: CLOCKS[clock] }), clock);
  });

  it('W8 AT-5.1 W8-a with every date passed (2027-01-01) on the candidate', async () => {
    await same('W8-a at 2027-01-01', await capture({ dates: true, atMs: CLOCKS.y2027 }), 'y2027');
  });

  it('W8 AT-5.1 self-check: one changed byte, status or header is found', () => {
    const stored = readFixture('d9');
    const base = stored.map((r) => ({ ...r, body: Buffer.alloc(0) }));
    assert.deepEqual(differences(base, stored), [], 'identical to itself');
    assert.equal(differences(base.map((r, i) => (i === 3 ? { ...r, sha256: '0'.repeat(64) } : r)), stored).length, 1, 'a body');
    assert.equal(differences(base.map((r, i) => (i === 5 ? { ...r, status: 500 } : r)), stored).length, 1, 'a status');
    assert.equal(differences(base.map((r, i) => (i === 7 ? { ...r, headers: [...r.headers, ['x-extra', '1']] as [string, string][] } : r)), stored).length, 1, 'a header');
  });
});

// ------------------------------------------------------------------ AT-5.2 ----
const READ = /^\s*(SELECT|WITH)\b/i;
const PUBLISHER_GATE = /FROM subject s WHERE s\.id = \? AND s\.space_id = \? AND s\.publisher_user_id = \?/;
const ADMIN_GATE = /FROM subject s LEFT JOIN user u ON u\.id = s\.publisher_user_id\s+WHERE s\.id = \? AND s\.space_id = \?/;

/** The statements one request makes from the gate on (the session and membership reads before it are every page's). */
async function fromGate(w: W8World, c: Awaited<ReturnType<W8World['as']>>, method: 'GET' | 'POST', path: string, gate: RegExp, fields: Record<string, string> = {}) {
  w.p.spy!.start();
  const res = method === 'GET' ? await c.get(path) : await c.post(path, fields);
  await res.arrayBuffer();
  const all = await w.p.spy!.stop();
  const at = all.findIndex((s) => gate.test(s));
  assert.ok(at >= 0, `${path}: the gate's statement was seen`);
  const own = all.slice(at);
  return { status: res.status, total: all.length, own, reads: own.filter((s) => READ.test(s)), writes: own.filter((s) => !READ.test(s)) };
}

describe('W8 AT-5.2 (W8-1a part) the Opening dates page makes at most 2 statements: the gate, then the outline with due and opening dates', { concurrency: false }, () => {
  let w: W8World;
  before(async () => {
    w = await w8World({ inOrder: true });
  });
  after(async () => w?.close());

  it('W8 AT-5.2 the page: 2 statements from the gate on, no write; each press: gate, chapter, at most one write', async (t) => {
    const figures: string[] = [];
    for (const [who, person, from, gate] of [['Amal', AMAL, editorOf(), PUBLISHER_GATE], ['Hadeer', HADEER, adminOf(), ADMIN_GATE]] as const) {
      const c = await w.as(person, 'en');
      const page = await fromGate(w, c, 'GET', openPage(from), gate);
      assert.equal(page.status, 200);
      figures.push(`${who} page: ${page.own.length} statements from the gate on (${page.total} with the session and membership reads)`);
      assert.ok(page.own.length <= 2, `${who}: at most 2 statements (${page.own.length}):\n${page.own.join('\n')}`);
      assert.equal(page.writes.length, 0, 'no write');
      assert.match(page.own[1] ?? '', /FROM chapter c LEFT JOIN lesson l/, 'the second is the outline');
      for (const [label, fields] of [['save', { action: 'save', opens_on: '2026-12-20', before: 'locked' }], ['clear', { action: 'clear', opens_on: '', before: 'locked' }]] as const) {
        const press = await fromGate(w, c, 'POST', openPost(from, ID.ch4), gate, fields);
        assert.equal(press.status, 303, `${who} ${label}`);
        figures.push(`${who} ${label}: ${press.reads.length} reads and ${press.writes.length} write from the gate on`);
        assert.equal(press.reads.length, 2, `${who} ${label}: one gate read and one chapter read`);
        assert.equal(press.writes.length, 1, `${who} ${label}: one write`);
        assert.match(press.writes[0], /^\s*UPDATE chapter SET opens_on = \?, opens_hidden = \?/, 'the chapter\'s opening');
      }
      const nothing = await fromGate(w, c, 'POST', openPost(from, ID.ch1), gate, { action: 'clear', opens_on: '', before: 'locked' });
      assert.equal(nothing.writes.length, 0, `${who}: Clear on a row without a date writes nothing`);
    }
    t.diagnostic(`AT-5.2 ${figures.join('; ')}`);
  });
});

// ------------------------------------------------------------------ AT-5.3 ----
type Row = Record<string, unknown>;
const schemaOf = (db: DatabaseSync) =>
  db.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT IN ('d1_migrations', 'sqlite_sequence') AND name NOT LIKE 'sqlite_autoindex%' ORDER BY type, name").all() as Row[];
const columnsOf = (db: DatabaseSync, table: string) => (db.prepare(`SELECT name, type, "notnull", dflt_value, pk FROM pragma_table_info('${table}')`).all() as Row[]).map((r) => ({ ...r }));
const plain = (rows: Row[]) => rows.map((r) => ({ ...r }));

/** A file's text as the repository stores it (LF; a Windows checkout may give CRLF, which SQLite keeps in the schema text). */
const lf = (file: string) => readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

/** A database with these migration files applied as Wrangler records them (`d1_migrations`), up to `upTo` when given
 * (LMS redesign R1b, PIL-332: the candidate's later migrations, 0018 onwards, are not wave 8's and are tested by their own wave). */
function migrated(dir: string, upTo?: string): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)');
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql') && (!upTo || n <= upTo)).sort()) {
    db.exec(lf(join(dir, f)));
    db.prepare('INSERT INTO d1_migrations (name) VALUES (?)').run(f);
  }
  return db;
}

describe('W8 AT-5.3 migration 0017 is additive; a41f7d8\'s code runs on the migrated database with every chapter open; the down script restores a41f7d8\'s schema', { concurrency: false }, () => {
  it('W8 AT-5.3 0017 adds exactly the two columns of R1 and nothing else; the other tables and every existing row are unchanged', () => {
    baseIsThere();
    const sql = readFileSync(join(repo, 'migrations', MIGRATION), 'utf8').replace(/--.*$/gm, '');
    for (const p of [/\bDROP\b/i, /\bRENAME\b/i, /\bDELETE\s+FROM\b/i, /\bUPDATE\s+\w+\s+SET\b/i, /\bCREATE\b/i]) assert.ok(!p.test(sql), `additive: no ${p}`);
    assert.equal((sql.match(/ALTER TABLE chapter ADD COLUMN/g) ?? []).length, 2, 'two ADD COLUMN on chapter');
    const base = migrated(join(BASE_ROOT, 'migrations'));
    const cand = migrated(join(repo, 'migrations'), MIGRATION);
    const added = columnsOf(cand, 'chapter').filter((c) => !columnsOf(base, 'chapter').some((b) => b.name === c.name));
    assert.deepEqual(added, [
      { name: 'opens_on', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
      { name: 'opens_hidden', type: 'INTEGER', notnull: 1, dflt_value: '0', pk: 0 },
    ], 'chapter gains opens_on TEXT NULL and opens_hidden INTEGER NOT NULL DEFAULT 0');
    assert.throws(() => cand.exec("INSERT INTO chapter (id, space_id, subject_id, title, position, opens_hidden) VALUES ('x', 's', 'u', 't', 1, 2)"), /CHECK/, 'opens_hidden is 0 or 1');
    const b = schemaOf(base);
    const c = schemaOf(cand);
    for (const r of b) if (r.name !== 'chapter') assert.deepEqual(c.find((x) => x.name === r.name), r, `${String(r.name)}: unchanged`);
    assert.equal(c.length, b.length, 'no new table or index');
    // Existing rows: W8-0 on a41f7d8's schema, then 0017 on it: every row is the same, every chapter without a date.
    const fake = { sqlite: base, files: { put: async () => undefined } } as unknown as InProcessWorker;
    return seedW8(fake, { dates: false }).then(() => {
      const before = plain(base.prepare('SELECT * FROM chapter ORDER BY id').all() as Row[]);
      base.exec(lf(join(repo, 'migrations', MIGRATION)));
      const after = plain(base.prepare('SELECT * FROM chapter ORDER BY id').all() as Row[]);
      assert.deepEqual(after.map(({ opens_on: _a, opens_hidden: _b, ...r }) => r), before, 'every existing chapter row is unchanged');
      assert.ok(after.every((r) => r.opens_on === null && Number(r.opens_hidden) === 0), 'every chapter starts without a date, shown locked');
    });
  });

  it('W8 AT-5.3 a41f7d8\'s code on the migrated database with W8-a\'s dates stored answers every 3.4 request as a41f7d8 on W8-0 (every chapter open)', async () => {
    baseIsThere();
    for (const clock of ['d9', 'd17'] as const) {
      const w = await w8World({ dates: true, atMs: CLOCKS[clock] });
      const file = join(tmpdir(), `lms-w8-at53-${process.pid}-${clock}.sqlite`);
      let old: Twin | null = null;
      try {
        const dated = w.sql('SELECT id, opens_on, opens_hidden FROM chapter WHERE opens_on IS NOT NULL ORDER BY id');
        assert.deepEqual(dated.map((r) => [r.id, r.opens_on, Number(r.opens_hidden)]), Object.entries(OPENINGS).map(([id, o]) => [id, o.on, o.hidden]), 'W8-a\'s three dates are stored');
        w.p.worker.sqlite.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
        old = (await inProcess({ root: BASE_ROOT, sqlite: new DatabaseSync(file), files: w.p.worker.files })) as Twin;
        const pin = await fetch(old.worker.url + '/__test/clock-fixed', { method: 'POST', headers: { 'content-type': 'application/json', origin: old.worker.url }, body: JSON.stringify({ atMs: CLOCKS[clock] }) });
        assert.equal(pin.status, 200);
        const o = old;
        // a41f7d8's own code: the stored fixture, byte for byte by N1 (no R1a normalising: no R1a code runs here).
        const got = await captureOn(o.worker.url, () => o.worker.settle());
        assert.equal(differences(got, readFixture(clock), live.get(clock)).join('\n'), '', `a41f7d8 on the migrated database at ${clock}: identical (N1) to a41f7d8's stored responses`);
      } finally {
        await old?.stop();
        await w.close();
        rmSync(file, { force: true });
      }
    }
  });

  it('W8 AT-5.3 the down script drops the two columns and the record line: schema and record equal a41f7d8\'s, other rows unchanged; applying again gives wave 8\'s schema', async () => {
    baseIsThere();
    assert.ok(existsSync(join(repo, DOWN)) && !existsSync(join(repo, 'migrations', '0017_chapter_opening.down.sql')), 'outside migrations/');
    for (const f of ['.github/workflows/deploy.yml', 'wrangler.jsonc']) {
      assert.ok(!/migrations-down|\.down\.sql/.test(readFileSync(join(repo, f), 'utf8')), `${f} does not refer to the down script`);
    }
    const base = migrated(join(BASE_ROOT, 'migrations'));
    const cand = migrated(join(repo, 'migrations'), MIGRATION);
    const fake = { sqlite: cand, files: { put: async () => undefined } } as unknown as InProcessWorker;
    await seedW8(fake, { dates: true });
    const tables = (schemaOf(base).filter((r) => r.type === 'table').map((r) => String(r.name)));
    const snapshot = () => Object.fromEntries(tables.map((t) => [t, plain(cand.prepare(`SELECT * FROM "${t}" ORDER BY rowid`).all() as Row[]).map((r) => {
      const { opens_on: _a, opens_hidden: _b, ...rest } = r;
      return t === 'chapter' ? rest : r;
    })]));
    const rowsBefore = snapshot();
    cand.exec(lf(join(repo, DOWN)));
    assert.deepEqual(schemaOf(cand), schemaOf(base), 'the schema is exactly a41f7d8\'s');
    for (const t of tables) assert.deepEqual(columnsOf(cand, t), columnsOf(base, t), `${t}: a41f7d8's columns`);
    assert.deepEqual(cand.prepare('SELECT name FROM d1_migrations ORDER BY id').all().map((r) => (r as Row).name), base.prepare('SELECT name FROM d1_migrations ORDER BY id').all().map((r) => (r as Row).name), 'Wrangler\'s record is exactly a41f7d8\'s');
    assert.deepEqual(snapshot(), rowsBefore, 'every row is unchanged (but the two dropped columns)');
    cand.exec(lf(join(repo, 'migrations', MIGRATION)));
    assert.deepEqual(schemaOf(cand), schemaOf(migrated(join(repo, 'migrations'), MIGRATION)), 'a later forward apply gives wave 8\'s schema again');
    assert.equal(Number((cand.prepare('SELECT COUNT(*) AS n FROM chapter WHERE opens_on IS NOT NULL').get() as Row).n), 0, 'with no date');
  });

  it('W8 AT-5.3 the README says how to roll back, in that order', () => {
    const text = readFileSync(join(repo, 'README.md'), 'utf8').replace(/\r\n/g, '\n');
    const rollback = text.slice(text.indexOf('\n## Rollback'));
    const part = rollback.slice(rollback.indexOf('**Opening dates (LMS wave 8):**'));
    assert.ok(part.startsWith('**Opening dates (LMS wave 8):**'), 'a wave 8 entry in "Rollback"');
    for (const phrase of ['migrations-down/0017_chapter_opening.down.sql', "owner's RED decision", 'first redeploy the earlier code, then run the down script', 'every chapter is open']) {
      assert.ok(part.includes(phrase), `the README's wave 8 rollback text says: ${phrase}`);
    }
  });
});

// --------------------------------------------------- AT-5.2 (W8-1b part) ----
type Stmt = { sql: string; params: (string | number | null)[] };

/** Every statement each 3.4 request makes (session reads included), on one product holding the world. */
async function statementsOf(p: Twin): Promise<{ label: string; stmts: Stmt[] }[]> {
  const clients = new Map<string, Client>();
  for (const who of [SALMA, OMAR, MONA, RANA, AMAL, HADEER, OWNER8]) {
    const c = new Client(p.worker.url, { lang: null });
    assert.equal((await c.post('/signin', { username: who.username, password: who.password })).status, 302);
    clients.set(who.key, c);
  }
  const out: { label: string; stmts: Stmt[] }[] = [];
  for (const r of requestList()) {
    const c = clients.get(r.who.key)!;
    const stmts: Stmt[] = [];
    p.faults!.set({ seen: (sql, params) => void stmts.push({ sql, params: [...params] }) });
    const res = r.method === 'GET' ? await c.get(r.path) : await c.post(r.path, r.fields ?? {});
    await res.arrayBuffer();
    await p.worker.settle();
    p.faults!.set({});
    out.push({ label: `${r.who.key} ${r.method} ${r.path}`, stmts });
  }
  return out;
}

type LocalD1 = { prepare(q: string): { bind(...p: unknown[]): { all(): Promise<{ meta: unknown }> } } };

/** D1's own rows_read for each list of read statements, on one local D1 (Miniflare, no network) holding a copy of `file`. */
async function rowsReadOnLocalD1(file: string, lists: Stmt[][]): Promise<number[]> {
  const { Miniflare, convertV4MiniflareOptions } = (await import('miniflare')) as unknown as {
    Miniflare: new (o: unknown) => { getD1Database(n: string): Promise<LocalD1 & { prepare(q: string): { all(): Promise<unknown> } }>; dispose(): Promise<void> };
    convertV4MiniflareOptions(o: unknown): unknown;
  };
  const dir = mkdtempSync(join(tmpdir(), 'lms-w8-d1-'));
  const options = () => convertV4MiniflareOptions({ modules: true, script: 'export default { fetch() { return new Response(null, { status: 404 }); } }', d1Databases: ['DB'], resourcePersistencePath: dir, compatibilityDate: '2026-10-01' });
  try {
    let mf = new Miniflare(options());
    try {
      await (await mf.getD1Database('DB')).prepare('SELECT 1').all();
    } finally {
      await mf.dispose();
    }
    const found = readdirSync(dir, { recursive: true, withFileTypes: true }).filter((f) => f.isFile() && f.name.endsWith('.sqlite') && f.name !== 'metadata.sqlite');
    assert.equal(found.length, 1, 'the local D1 keeps one database file');
    const target = join(found[0].parentPath, found[0].name);
    for (const f of [target, `${target}-wal`, `${target}-shm`]) rmSync(f, { force: true });
    copyFileSync(file, target);
    mf = new Miniflare(options());
    try {
      const db = await mf.getD1Database('DB');
      const sums: number[] = [];
      for (const list of lists) {
        let sum = 0;
        for (const s of list) {
          const r = await db.prepare(s.sql).bind(...s.params).all();
          const meta = r.meta as Record<string, unknown>;
          assert.ok(typeof meta.rows_read === 'number', `local D1 reports rows_read (${JSON.stringify(meta)})`);
          sum += Number(meta.rows_read);
        }
        sums.push(sum);
      }
      return sums;
    } finally {
      await mf.dispose();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('W8 AT-5.2 (W8-1b) every 3.4 request makes at most a41f7d8\'s D1 statements and reads at most its rows, on the same database', { concurrency: false }, () => {
  for (const inOrder of [false, true]) {
    it(`W8 AT-5.2 W8-a, Open in order ${inOrder ? 'on' : 'off'}, at 2026-12-09: statements per request and rows read (local D1) of the candidate <= a41f7d8's`, async (t) => {
      baseIsThere();
      const w = await w8World({ dates: true, inOrder, atMs: AT8.d9 });
      const file = join(tmpdir(), `lms-w8-at52-${process.pid}-${inOrder ? 'on' : 'off'}.sqlite`);
      let old: Twin | null = null;
      try {
        // The same database for both builds: a copy before any request (a41f7d8 ignores the two new columns, AT-5.3).
        w.p.worker.sqlite.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
        old = (await inProcess({ root: BASE_ROOT, sqlite: new DatabaseSync(file), files: w.p.worker.files })) as Twin;
        const pin = await fetch(old.worker.url + '/__test/clock-fixed', { method: 'POST', headers: { 'content-type': 'application/json', origin: old.worker.url }, body: JSON.stringify({ atMs: AT8.d9 }) });
        assert.equal(pin.status, 200);
        const fresh = join(tmpdir(), `lms-w8-at52-${process.pid}-fresh.sqlite`);
        rmSync(fresh, { force: true });
        w.p.worker.sqlite.exec(`VACUUM INTO '${fresh.replace(/'/g, "''")}'`);
        const cand = await statementsOf(w.p);
        const base = await statementsOf(old);
        assert.equal(cand.length, base.length);
        const reads = (l: { stmts: Stmt[] }[]) => l.map((r) => r.stmts.filter((s) => READ.test(s.sql)));
        const rowsCand = await rowsReadOnLocalD1(fresh, reads(cand));
        const rowsBase = await rowsReadOnLocalD1(fresh, reads(base));
        // LMS redesign R1a (UX-55 row, S13): the cards' latest-announcement line is one read of every shown announcement of the
        // learner's subjects (any age, as the subject page shows them); its rows are allowed on top, nothing else (budget: AT-R1a.6a).
        const LATEST_ANN = /PARTITION BY n\.subject_id ORDER BY n\.created_at DESC/;
        const rowsAnn = await rowsReadOnLocalD1(fresh, reads(cand).map((l) => l.filter((s) => LATEST_ANN.test(s.sql))));
        rmSync(fresh, { force: true });
        const lines: string[] = [];
        for (let i = 0; i < cand.length; i++) {
          lines.push(`${cand[i].label}: ${cand[i].stmts.length}/${base[i].stmts.length} statements, ${rowsCand[i]}/${rowsBase[i]} rows read (${rowsAnn[i]} by the latest-announcement read)`);
          assert.ok(cand[i].stmts.length <= base[i].stmts.length, `${cand[i].label}: ${cand[i].stmts.length} statements, a41f7d8 ${base[i].stmts.length}`);
          assert.ok(rowsCand[i] <= rowsBase[i] + rowsAnn[i], `${cand[i].label}: ${rowsCand[i]} rows read, a41f7d8 ${rowsBase[i]} (+${rowsAnn[i]} latest-announcement rows allowed)`);
          for (const s of cand[i].stmts) assert.ok(s.params.length <= 100, `${cand[i].label}: at most 100 bound parameters (${s.params.length})`);
        }
        t.diagnostic(`AT-5.2 candidate/a41f7d8 per request:\n${lines.join('\n')}`);
      } finally {
        await old?.stop();
        await w.close();
        rmSync(file, { force: true });
      }
    });
  }
});

// ------------------------------------------------------------------ AT-5.4 ----
describe('W8 AT-5.4 no wave 8 action changes or deletes a done mark, due date, quiz, attempt, announcement or activity row', { concurrency: false }, () => {
  it('W8 AT-5.4 Amal and Hadeer set, change, hide and clear dates on every chapter (Salma has marks and opens on them); learners meet the locks; every such row is unchanged (row counts and contents)', async (t) => {
    const w = await w8World({ dates: false, inOrder: true, atMs: AT8.d9 });
    try {
      for (const id of [ID.l11, ID.l21, ID.l41]) w.run('INSERT INTO done_mark (space_id, learner_user_id, lesson_id, marked_at) VALUES (?, ?, ?, ?)', ID.space, SALMA.id, id, Date.parse('2026-12-02T10:00:00.000Z'));
      w.run('INSERT INTO lesson_view (space_id, lesson_id, learner_user_id, last_opened_on) VALUES (?, ?, ?, ?)', ID.space, ID.l21, SALMA.id, '2026-12-03');
      const before = { counts: rowCounts(w), data: learnerData(w) };
      const amal = await w.as(AMAL, 'en');
      const hadeer = await w.as(HADEER, 'en');
      let presses = 0;
      for (const [c, from] of [[amal, editorOf()], [hadeer, adminOf()]] as const) {
        for (const ch of [ID.ch1, ID.ch2, ID.ch3, ID.ch4, ID.ch5]) {
          for (const fields of [
            { action: 'save', opens_on: '2026-12-20', before: 'locked' }, { action: 'save', opens_on: '2026-12-20', before: 'hidden' },
            { action: 'save', opens_on: '2026-12-24', before: 'hidden' }, { action: 'clear', opens_on: '', before: 'locked' },
          ]) {
            assert.equal((await c.post(openPost(from, ch), fields)).status, 303);
            presses++;
          }
        }
      }
      // Dated again, then the learners, Mona and the previews meet them (locked and hidden addresses only write nothing).
      for (const ch of [ID.ch1, ID.ch2]) assert.equal((await amal.post(openPost(editorOf(), ch), { action: 'save', opens_on: '2026-12-20', before: ch === ID.ch1 ? 'locked' : 'hidden' })).status, 303);
      const salma = await w.as(SALMA, 'en');
      for (const path of [`/s/${ID.space}`, `/s/${ID.space}/learn/${ID.math}`, `/s/${ID.space}/read/${ID.l11}`, `/s/${ID.space}/read/${ID.l21}`, `/s/${ID.space}/file/${ID.pdf}`]) await (await salma.get(path)).arrayBuffer();
      for (const [id, state] of [[ID.l11, 'not-done'], [ID.l21, 'not-done'], [ID.l12, 'done']]) assert.equal((await salma.post(`/s/${ID.space}/read/${id}/done`, { state })).status, 403, `Salma ${state} ${id}: refused`);
      for (const [who, path] of [[MONA, `/s/${ID.space}/linked/${SALMA.id}/activity`], [HADEER, `/s/${ID.space}/preview/read/${ID.l21}`]] as const) await (await (await w.as(who, 'en')).get(path)).arrayBuffer();
      for (const ch of [ID.ch1, ID.ch2]) assert.equal((await amal.post(openPost(editorOf(), ch), { action: 'clear', opens_on: '', before: 'locked' })).status, 303);
      const after = { counts: rowCounts(w), data: learnerData(w) };
      assert.deepEqual(after.counts, before.counts, 'row counts unchanged');
      assert.equal(after.data, before.data, 'every done mark, due date, quiz, attempt, announcement and activity row unchanged');
      t.diagnostic(`AT-5.4 ${presses + 4} Opening dates presses; row counts ${JSON.stringify(after.counts)}`);
    } finally {
      await w.close();
    }
  });
});

void AT8;
