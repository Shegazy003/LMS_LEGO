// Test-only routes. Registered only when the build-time constant __TEST_HOOKS__
// is true (wrangler.jsonc env "test"), and even then only when the runtime flag
// TEST_HOOKS is "1". The production bundle does not contain this module; see
// test/guards/production-guard.test.ts.
//
// /__test/clock reads (GET) or moves (POST) the product's clock.
// /__test/seed creates people, groups, subjects and their content in an
// existing space, for tests that need them before the admin and publisher
// screens exist (AT-2, AT-3). It writes the same rows those screens will write.
import type { Hono } from 'hono';
import { isIsoDate, utcDate } from './access.ts';
import type { AppEnv } from './app-env.ts';
import { hashPassword } from './auth/password.ts';
import { now, setClockOffset } from './clock.ts';
import type { Db, Param } from './db.ts';
import { normaliseMobile } from './phone.ts';

export function registerTestHooks(app: Hono<AppEnv>): void {
  app.get('/__test/clock', (c) => {
    if (c.env.TEST_HOOKS !== '1') return c.notFound();
    return c.json({ now: new Date(now()).toISOString() });
  });

  app.post('/__test/clock', async (c) => {
    if (c.env.TEST_HOOKS !== '1') return c.notFound();
    const body = await c.req.json<{ offsetMs?: unknown }>();
    const offset = Number(body.offsetMs);
    if (!Number.isFinite(offset)) return c.json({ error: 'offsetMs must be a number' }, 400);
    setClockOffset(offset);
    return c.json({ now: new Date(now()).toISOString() });
  });

  app.post('/__test/seed', async (c) => {
    if (c.env.TEST_HOOKS !== '1') return c.notFound();
    try {
      return c.json(await seed(c.get('db'), c.env.FILES, await c.req.json<SeedBody>()));
    } catch (err) {
      if (err instanceof SeedRefused) return c.json({ error: err.message }, 400);
      throw err;
    }
  });
}

// ------------------------------------------------------------------ seed ----
type Kind = 'pdf' | 'image' | 'video_link' | 'link' | 'note';

interface SeedItem {
  kind: Kind;
  title: string;
  position?: number;
  base64?: string;
  contentType?: string;
  url?: string;
  text?: string;
}

interface SeedBody {
  spaceId: string;
  grantedBy: string;
  people?: { username: string; password: string; display_name: string; mobile: string; role: string; valid_until: string }[];
  groups?: { name: string; members: string[] }[];
  subjects?: {
    title: string;
    publisher?: string;
    published?: boolean;
    groups?: string[];
    users?: string[];
    chapters?: {
      title: string;
      position?: number;
      lessons?: { title: string; body?: string; position?: number; materials?: SeedItem[] }[];
    }[];
  }[];
}

interface SeededLesson {
  id: string;
  materials: Record<string, string>;
}
type SeededChapters = Record<string, { id: string; lessons: Record<string, SeededLesson> }>;
interface SeedOut {
  users: Record<string, string>;
  groups: Record<string, string>;
  subjects: Record<string, { id: string; chapters: SeededChapters }>;
}

class SeedRefused extends Error {}

function refused(reason: string): never {
  throw new SeedRefused(`test seeding refused: ${reason}`);
}

function bytesOf(base64: string): Uint8Array {
  try {
    return Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0));
  } catch {
    return refused('base64 cannot be read');
  }
}

async function seed(db: Db, files: R2Bucket, body: SeedBody): Promise<SeedOut> {
  const space = await db.first<{ id: string; default_country_code: string }>(
    'SELECT id, default_country_code FROM space WHERE id = ?',
    String(body.spaceId),
  );
  if (!space) refused('no such space');
  const granter = await db.first<{ id: string }>('SELECT id FROM user WHERE username = ?', String(body.grantedBy));
  if (!granter) refused('grantedBy is not a user');

  const out: SeedOut = { users: {}, groups: {}, subjects: {} };
  const statements: [string, ...Param[]][] = [];
  const uploads: { key: string; bytes: Uint8Array; type: string }[] = [];
  const today = utcDate(now());

  for (const p of body.people ?? []) {
    const mobile = normaliseMobile(p.mobile, space.default_country_code);
    if (!mobile) refused(`mobile of ${p.username} cannot be read`);
    if (!isIsoDate(p.valid_until)) refused(`valid_until of ${p.username} is not a date`);
    if (!['admin', 'publisher', 'learner'].includes(p.role)) refused(`role of ${p.username}`);
    const id = crypto.randomUUID();
    out.users[p.username] = id;
    statements.push(
      [
        'INSERT INTO user (id, username, password_hash, display_name, mobile, is_owner, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)',
        id, p.username, await hashPassword(p.password), p.display_name, mobile, now(),
      ],
      [
        'INSERT INTO membership (id, space_id, user_id, role, valid_from, valid_until, granted_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
        crypto.randomUUID(), space.id, id, p.role, today, p.valid_until, granter.id,
      ],
    );
  }

  const userId = async (username: string): Promise<string> => {
    if (out.users[username]) return out.users[username];
    const row = await db.first<{ id: string }>('SELECT id FROM user WHERE username = ?', username);
    if (!row) refused(`no user ${username}`);
    return (out.users[username] = row.id);
  };

  for (const g of body.groups ?? []) {
    const id = crypto.randomUUID();
    out.groups[g.name] = id;
    statements.push(['INSERT INTO "group" (id, space_id, name) VALUES (?, ?, ?)', id, space.id, g.name]);
    for (const member of g.members) {
      statements.push(['INSERT INTO group_member (space_id, group_id, user_id) VALUES (?, ?, ?)', space.id, id, await userId(member)]);
    }
  }

  const groupId = async (name: string): Promise<string> => {
    if (out.groups[name]) return out.groups[name];
    const row = await db.first<{ id: string }>('SELECT g.id FROM "group" g WHERE g.space_id = ? AND g.name = ?', space.id, name);
    if (!row) refused(`no group ${name} in this space`);
    return row.id;
  };

  for (const s of body.subjects ?? []) {
    const subjectId = crypto.randomUUID();
    const chapters: SeededChapters = {};
    out.subjects[s.title] = { id: subjectId, chapters };
    statements.push([
      'INSERT INTO subject (id, space_id, title, publisher_user_id, is_published) VALUES (?, ?, ?, ?, ?)',
      subjectId, space.id, s.title, s.publisher ? await userId(s.publisher) : null, s.published ? 1 : 0,
    ]);
    for (const name of s.groups ?? []) {
      statements.push([
        'INSERT INTO subject_access (id, space_id, subject_id, group_id, user_id) VALUES (?, ?, ?, ?, NULL)',
        crypto.randomUUID(), space.id, subjectId, await groupId(name),
      ]);
    }
    for (const username of s.users ?? []) {
      statements.push([
        'INSERT INTO subject_access (id, space_id, subject_id, group_id, user_id) VALUES (?, ?, ?, NULL, ?)',
        crypto.randomUUID(), space.id, subjectId, await userId(username),
      ]);
    }
    for (const [ci, ch] of (s.chapters ?? []).entries()) {
      const chapterId = crypto.randomUUID();
      const lessons: Record<string, SeededLesson> = {};
      chapters[ch.title] = { id: chapterId, lessons };
      statements.push([
        'INSERT INTO chapter (id, space_id, subject_id, title, position) VALUES (?, ?, ?, ?, ?)',
        chapterId, space.id, subjectId, ch.title, ch.position ?? ci + 1,
      ]);
      for (const [li, l] of (ch.lessons ?? []).entries()) {
        const lessonId = crypto.randomUUID();
        const items: Record<string, string> = {};
        lessons[l.title] = { id: lessonId, materials: items };
        statements.push([
          'INSERT INTO lesson (id, space_id, chapter_id, title, body_text, position) VALUES (?, ?, ?, ?, ?, ?)',
          lessonId, space.id, chapterId, l.title, l.body ?? '', l.position ?? li + 1,
        ]);
        for (const [mi, m] of (l.materials ?? []).entries()) {
          const id = crypto.randomUUID();
          items[m.title] = id;
          let key: string | null = null;
          if (m.kind === 'pdf' || m.kind === 'image') {
            key = `spaces/${space.id}/files/${id}`;
            uploads.push({ key, bytes: bytesOf(m.base64 ?? ''), type: m.contentType ?? 'application/octet-stream' });
          } else if (m.kind !== 'video_link' && m.kind !== 'link' && m.kind !== 'note') {
            refused(`unknown kind ${String(m.kind)}`);
          }
          statements.push([
            'INSERT INTO material (id, space_id, lesson_id, kind, title, storage_key, url, note_text, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            id, space.id, lessonId, m.kind, m.title, key,
            m.kind === 'video_link' || m.kind === 'link' ? (m.url ?? null) : null,
            m.kind === 'note' ? (m.text ?? null) : null,
            m.position ?? mi + 1,
          ]);
        }
      }
    }
  }

  for (const u of uploads) await files.put(u.key, u.bytes, { httpMetadata: { contentType: u.type } });
  try {
    if (statements.length) await db.batch(statements);
  } catch (err) {
    for (const u of uploads) await files.delete(u.key);
    refused(String((err as Error).message ?? err));
  }
  return out;
}
