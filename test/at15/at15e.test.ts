// AT-15e (contract product-contract-r2, R2-d): minimum data. The schema test
// fails if the lesson_view table has any column beyond space_id, lesson_id,
// learner_user_id and last_opened_on, where last_opened_on is a date
// (space-local, section 3), not a timestamp: no address, no device, no
// duration, no count, no time of day, anywhere in the database.
//
// The schema is read twice: from the product's own database (the running
// product with every migration applied), and on SQLite in this process, where
// the table's own rule is tried with values that are not a calendar day.
import { describe, it, before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startInProcess, type InProcessWorker } from '../support/in-process.ts';
import { startProduct, type Product } from '../support/product.ts';

/** A table's statement as stored, without its SQL comments. */
const noComments = (sql: unknown) => String(sql).replace(/--[^\n]*/g, '');
const COLUMNS = ['space_id', 'lesson_id', 'learner_user_id', 'last_opened_on'];
const SETTING_COLUMNS = ['space_id', 'enabled', 'enabled_since', 'told_confirmed', 'changed_by', 'changed_at'];
// Column names that would hold more than a lesson and a day, anywhere in the database.
const NEVER = /^(ip|ip_address|address|user_agent|agent|device|duration|seconds|minutes|count|view_count|views|opened_at|opened_time|time_of_day|last_opened_at|first_opened_on|first_opened_at)$/i;

test('AT-15e the migration is additive: two new tables, no earlier table changed', () => {
  const sql = readFileSync(new URL('../../migrations/0010_lesson_views.sql', import.meta.url), 'utf8').replace(/--.*$/gm, '');
  const statements = sql.split(';').map((s) => s.trim()).filter(Boolean);
  assert.deepEqual(statements.map((s) => s.match(/^CREATE TABLE (\w+)/)?.[1] ?? s.slice(0, 40)), ['lesson_view_setting', 'lesson_view']);
});

describe('AT-15e the product\'s database: lesson_view holds exactly a space, a lesson, a learner and a calendar day', { concurrency: false }, () => {
  let p: Product;
  before(async () => {
    p = await startProduct();
  });
  after(async () => {
    await p?.stop();
  });

  it('lesson_view has exactly the four columns, and a unique key on (space_id, lesson_id, learner_user_id)', async () => {
    const ddl = noComments((await p.sql("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'lesson_view'"))[0].sql);
    const body = ddl.slice(ddl.indexOf('(') + 1, ddl.lastIndexOf(')'));
    const parts = body.split(/,\s*\n/).map((s) => s.trim());
    const columns = parts.filter((s) => !/^(UNIQUE|PRIMARY|CHECK|FOREIGN|CONSTRAINT)\b/i.test(s)).map((s) => s.split(/\s+/)[0]);
    assert.deepEqual(columns, COLUMNS, 'no column beyond the four');
    assert.ok(parts.some((s) => /^UNIQUE \(space_id, lesson_id, learner_user_id\)$/.test(s)), 'one row per learner and lesson');
    assert.match(ddl, /last_opened_on\s+TEXT NOT NULL CHECK \(length\(last_opened_on\) = 10 AND last_opened_on GLOB '\[0-9\]\[0-9\]\[0-9\]\[0-9\]-\[0-9\]\[0-9\]-\[0-9\]\[0-9\]'\)/, 'a calendar day, YYYY-MM-DD');
  });

  it('no table anywhere in the database has a column for an address, a device, a duration, a count or a time of an open', async () => {
    const tables = (await p.sql("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'"));
    assert.ok(tables.length >= 15);
    const offences: string[] = [];
    for (const t of tables) {
      const ddl = noComments(t.sql);
      const body = ddl.slice(ddl.indexOf('(') + 1, ddl.lastIndexOf(')'));
      for (const col of body.split(/,\s*\n/).map((s) => s.trim().split(/\s+/)[0].replace(/"/g, ''))) if (NEVER.test(col)) offences.push(`${t.name}.${col}`);
    }
    assert.deepEqual(offences, []);
    const setting = noComments(tables.find((t) => t.name === 'lesson_view_setting')!.sql);
    const cols = setting.slice(setting.indexOf('(') + 1, setting.lastIndexOf(')')).split(/,\s*\n/).map((s) => s.trim().split(/\s+/)[0]);
    assert.deepEqual(cols, SETTING_COLUMNS, 'the switch holds who, when, the tick and the start day, nothing about any open');
  });
});

describe('AT-15e the table refuses a timestamp, a time of day or a number in place of a day (SQLite, every migration)', { concurrency: false }, () => {
  let w: InProcessWorker;
  before(async () => {
    w = await startInProcess();
    w.sqlite.exec("INSERT INTO user (id, username, password_hash, display_name, mobile, is_owner, created_at) VALUES ('u1', 'x', 'h', 'X', '+201000000000', 0, 0)");
    w.sqlite.exec("INSERT INTO kit (id, name, json) VALUES ('k1', 'K', '{}')");
    w.sqlite.exec("INSERT INTO space (id, name, kit_id, default_country_code, created_by, created_at) VALUES ('s1', 'S', 'k1', '+20', 'u1', 0)");
    w.sqlite.exec("INSERT INTO subject (id, space_id, title, is_published) VALUES ('sub', 's1', 'T', 1)");
    w.sqlite.exec("INSERT INTO chapter (id, space_id, subject_id, title, position) VALUES ('ch', 's1', 'sub', 'C', 1)");
    w.sqlite.exec("INSERT INTO lesson (id, space_id, chapter_id, title, body_text, position) VALUES ('l1', 's1', 'ch', 'L', '', 1)");
  });
  after(() => w?.stop());

  const insert = (day: unknown) => w.sqlite.prepare("INSERT INTO lesson_view (space_id, lesson_id, learner_user_id, last_opened_on) VALUES ('s1', 'l1', 'u1', ?)").run(day as string);

  it('a timestamp, a date with a time, a time alone and a number are refused; a calendar day is stored', () => {
    for (const bad of ['2026-11-03T10:15:00Z', '2026-11-03 10:15', '2026-11-03T10:15', '10:15', 1762164900000, '1762164900', '03/11/2026', '2026-1-3']) {
      assert.throws(() => insert(bad), /CHECK constraint failed/, `refused: ${bad}`);
    }
    insert('2026-11-03');
    assert.throws(() => insert('2026-11-04'), /UNIQUE constraint failed/, 'one row per learner and lesson');
    assert.deepEqual(w.sqlite.prepare('SELECT * FROM lesson_view').all().map((r) => ({ ...r })), [{ space_id: 's1', lesson_id: 'l1', learner_user_id: 'u1', last_opened_on: '2026-11-03' }]);
  });
});
