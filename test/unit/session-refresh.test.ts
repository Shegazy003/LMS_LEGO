// The session refresh race (AT-6 follow-up, build task 11).
//
// The session check reads a session row, decides it is due for a refresh
// (src/auth/session.ts, at most one write a day), and then writes the new
// expiry. "End access now" (src/admin.ts endAccess) sets the expiry of every
// session of the person to 0. If End access lands between that read and that
// write, an unconditional refresh would write a fresh expiry over the 0 and
// bring the stopped sign-in back to life. The refresh must therefore never
// rewrite a session whose expiry is 0.
//
// Proven here at unit level, with the product's own functions (refreshSession
// and endAccess) on the product's own schema (every migration in migrations/),
// on SQLite (the engine D1 runs), driving the interleaving step by step. A
// source check then makes sure the session check uses refreshSession and that
// no other statement in src/ rewrites a session's expiry without the guard.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { Db, type Param } from '../../src/db.ts';
import { ADMIN_MANAGES, endAccess } from '../../src/admin.ts';
import { SESSION_IDLE_MS, refreshSession, sessionDecision } from '../../src/auth/session.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));
const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 2, 12, 0, 0);

/** The smallest D1 the product's Db class needs, over an in-memory SQLite. */
function d1Over(sqlite: DatabaseSync): D1Database {
  const statement = (sql: string, params: Param[] = []) => ({
    bind: (...p: Param[]) => statement(sql, p),
    async all() {
      const s = sqlite.prepare(sql);
      if (/^\s*(SELECT|WITH)\b/i.test(sql)) return { results: s.all(...params), meta: { rows_written: 0, changes: 0 } };
      const r = s.run(...params);
      return { results: [], meta: { rows_written: Number(r.changes), changes: Number(r.changes) } };
    },
    async run() {
      const r = sqlite.prepare(sql).run(...params);
      return { results: [], meta: { rows_written: Number(r.changes), changes: Number(r.changes) } };
    },
  });
  return {
    prepare: (sql: string) => statement(sql),
    async batch(statements: ReturnType<typeof statement>[]) {
      sqlite.exec('BEGIN');
      try {
        const out = [];
        for (const s of statements) out.push(await s.run());
        sqlite.exec('COMMIT');
        return out;
      } catch (err) {
        sqlite.exec('ROLLBACK');
        throw err;
      }
    },
  } as unknown as D1Database;
}

function freshDb(): { db: Db; sqlite: DatabaseSync } {
  const sqlite = new DatabaseSync(':memory:');
  const dir = join(root, 'migrations');
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) sqlite.exec(readFileSync(join(dir, f), 'utf8'));
  sqlite.prepare(
    "INSERT INTO user (id, username, password_hash, display_name, mobile, is_owner, created_at) VALUES ('u1', 'omar.learner', 'x', 'Omar', '+201055556666', 0, 0)",
  ).run();
  return { db: new Db(d1Over(sqlite), () => undefined), sqlite };
}

const expiryOf = (sqlite: DatabaseSync, id: string) => Number((sqlite.prepare('SELECT expires_at FROM session WHERE id = ?').get(id) as { expires_at: number }).expires_at);

test('session refresh race: End access lands between the read and the refresh; the stopped sign-in stays stopped', async () => {
  const { db, sqlite } = freshDb();
  // A sign-in two days old: due for its once-a-day refresh.
  sqlite.prepare('INSERT INTO session (id, user_id, expires_at) VALUES (?, ?, ?)').run('s1', 'u1', NOW - 2 * DAY + SESSION_IDLE_MS);

  // 1. The session check reads the row and decides to refresh it.
  const read = await db.first<{ expires_at: number }>('SELECT expires_at FROM session WHERE id = ?', 's1');
  assert.equal(sessionDecision(Number(read?.expires_at), NOW), 'refresh', 'the request decided to refresh');
  // 2. The admin's "End access now" lands now.
  await endAccess(db, { spaceId: 'mesk', userId: 'u1', roles: ADMIN_MANAGES, today: '2026-11-02', now: NOW });
  assert.equal(expiryOf(sqlite, 's1'), 0, 'End access stopped the sign-in');
  // 3. The request's refresh is written after it.
  const changed = await refreshSession(db, 's1', NOW + SESSION_IDLE_MS);
  assert.equal(changed, 0, 'the refresh changes nothing');
  assert.equal(expiryOf(sqlite, 's1'), 0, 'the sign-in stays stopped: its expiry is still 0');
  assert.equal(sessionDecision(expiryOf(sqlite, 's1'), NOW), 'expired', 'so its next request is the ended sign-in\'s');
});

test('session refresh: a live sign-in is still extended (control)', async () => {
  const { db, sqlite } = freshDb();
  sqlite.prepare('INSERT INTO session (id, user_id, expires_at) VALUES (?, ?, ?)').run('s2', 'u1', NOW - 2 * DAY + SESSION_IDLE_MS);
  assert.equal(await refreshSession(db, 's2', NOW + SESSION_IDLE_MS), 1, 'one row extended');
  assert.equal(expiryOf(sqlite, 's2'), NOW + SESSION_IDLE_MS);
});

/** Every string literal in src/ that is an UPDATE of the session table. */
function sessionUpdates(): { file: string; sql: string }[] {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
    });
  const out: { file: string; sql: string }[] = [];
  for (const file of files(join(root, 'src'))) {
    for (const m of readFileSync(file, 'utf8').matchAll(/(['"`])(\s*UPDATE\s+session\b(?:(?!\1)[\s\S])*)\1/gi)) out.push({ file, sql: m[2] });
  }
  return out;
}

test('session refresh: the session check uses refreshSession, and every statement that extends a session keeps a stopped one stopped', () => {
  const app = readFileSync(join(root, 'src', 'app.ts'), 'utf8');
  assert.match(app, /refreshSession\(/, 'the session check refreshes through refreshSession');
  const updates = sessionUpdates();
  assert.ok(updates.length >= 2, 'the scan finds the session updates (refresh and End access)');
  for (const { file, sql } of updates) {
    if (/SET\s+expires_at\s*=\s*0\b/i.test(sql)) continue; // End access: setting the stop itself
    assert.match(sql, /expires_at\s*>\s*0/i, `${file}: "${sql.trim()}" must not rewrite a stopped session (expires_at > 0)`);
  }
});
