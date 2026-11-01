// Deploy rails: the database migrations are safe to apply before the new code
// goes live, and safe to apply again.
//
// The deploy workflow applies the migrations to the live database before it
// switches traffic to the new Worker. That order is safe only because every
// migration is additive (old code keeps working on the new schema), and a
// re-run must change nothing. Both are proven here against a fresh local D1 of
// the production configuration (no Cloudflare account).
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const wrangler = join(root, 'node_modules', '.bin', 'wrangler');
const migrationFiles = readdirSync(join(root, 'migrations')).filter((f) => f.endsWith('.sql')).sort();
let persist: string;

function wranglerOut(args: string[]): string {
  return execFileSync(wrangler, args, {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false', NO_COLOR: '1', CI: 'true' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

const apply = () => wranglerOut(['d1', 'migrations', 'apply', 'lms-lego', '--local', '--persist-to', persist]);

function query(sql: string): Record<string, unknown>[] {
  const out = wranglerOut(['d1', 'execute', 'lms-lego', '--local', '--persist-to', persist, '--json', '--command', sql]);
  return JSON.parse(out.slice(out.search(/^\[/m)))[0].results;
}

/** Everything that describes the schema, and which migrations are recorded as applied. */
const schema = () => query("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name");
const applied = () => query('SELECT name FROM d1_migrations ORDER BY id').map((r) => r.name);

describe('Deploy rails: migrations are additive and a second apply is a no-op', { concurrency: false }, () => {
  before(() => {
    persist = mkdtempSync(join(tmpdir(), 'lms-lego-migrations-'));
  });
  after(() => {
    rmSync(persist, { recursive: true, force: true });
  });

  it('every migration is additive: no table or column is dropped or renamed, and no stored row is rewritten', () => {
    assert.ok(migrationFiles.length >= 4, `migrations found: ${migrationFiles.join(', ')}`);
    for (const file of migrationFiles) {
      const sql = readFileSync(join(root, 'migrations', file), 'utf8').replace(/--.*$/gm, '');
      for (const [pattern, what] of [
        [/\bDROP\b/i, 'DROP'], [/\bRENAME\b/i, 'RENAME'], [/\bDELETE\s+FROM\b/i, 'DELETE FROM'], [/\bUPDATE\s+\w+\s+SET\b/i, 'UPDATE … SET'],
      ] as const) assert.ok(!pattern.test(sql), `${file} must not use ${what}`);
    }
  });

  it('a fresh local database takes every migration in order; applying them again changes nothing', () => {
    const first = apply();
    for (const file of migrationFiles) assert.ok(first.includes(file), `the first apply lists ${file}`);
    assert.deepEqual(applied(), migrationFiles, 'every migration is recorded, in order');
    const schemaAfterFirst = schema();
    assert.ok(schemaAfterFirst.some((r) => r.name === 'user') && schemaAfterFirst.some((r) => r.name === 'material'), 'the tables exist');

    const second = apply();
    assert.match(second, /No migrations to apply/, `the second apply is a no-op:\n${second}`);
    assert.deepEqual(applied(), migrationFiles, 'no migration is recorded twice');
    assert.deepEqual(schema(), schemaAfterFirst, 'the schema is exactly the same');
  });
});
