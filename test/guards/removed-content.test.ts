// AT-8 guard: removed content never reaches a learner (release 1.1, contract
// 0.2, AT-8 and section 6: every removal is reversible, nothing is deleted).
//
// Four layers, each a test:
// 1. Static: every SQL statement under src/ that reads a chapter, a lesson or
//    a material, outside the publisher's own editing modules, excludes removed
//    rows for every one of those tables it names (alias.removed_at IS NULL).
//    A self-check proves the scanner catches a statement that forgets.
// 2. One database change: removing and restoring a chapter, a lesson or a
//    material is exactly one statement (a soft removal: removed_at), so a
//    removal cannot be left half done; the refusal of a lesson or chapter that
//    still shows content is inside that same statement.
// 3. The running product, every learner read path: the router's own route
//    table lists every page a learner can open in a space (home, subject,
//    lesson, file, and any added later); each is opened by a learner, an admin
//    and the publisher, with the ids of removed items, and must answer "not
//    found" (404) for an id that was removed, and never show a removed title or
//    send a removed file, even to a cached copy's ETag. Items whose chapter or
//    lesson is removed (a state the screens never leave, made here directly in
//    the database) are hidden too, so no read path relies on the screens'
//    order of removal. Positive controls first.
// 4. A crawl: every page reachable from the learner's home (following every
//    link inside the space) shows no removed title and links to no removed id.
import { describe, it, before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startWorker, type RunningWorker } from '../support/worker.ts';
import { Client, tinyPng, utcDatePlusDays } from '../support/http.ts';
import { appointAdmin, b64, createSpace, seed, setUpOwner, signedIn, tinyPdf } from '../support/seed.ts';
import { sha256 } from '../support/state.ts';
import type { Db } from '../../src/db.ts';
import { removeChapter, removeLesson, removeMaterial, restoreChapter, restoreLesson, restoreMaterial } from '../../src/removal.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));
const CONTENT_TABLES = ['chapter', 'lesson', 'material'];
/** The publisher's own editing modules: they must see removed rows (Recently
 * removed, restore) and are reached only behind the publisher gate. */
const PUBLISHER_ONLY: Record<string, string> = {
  'src/publishing.ts': 'the publisher\'s editor (behind /s/:spaceId/publish/*)',
  'src/removal.ts': 'removing, Recently removed and restoring (behind /s/:spaceId/publish/*)',
  'src/test-hooks.ts': 'test builds only (production guard)',
};

// ------------------------------------------------------------ 1. static ----
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? sourceFiles(p) : p.endsWith('.ts') ? [p] : [];
  });
}

/** Every SQL statement written as a string literal in a source text (as the space guard reads them). */
function sqlStatements(source: string): string[] {
  const out: string[] = [];
  const literal = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;
  for (const m of source.matchAll(literal)) {
    const s = m[1] ?? m[2] ?? m[3] ?? '';
    if (/^\s*(SELECT|INSERT|UPDATE|DELETE|WITH)\s/.test(s)) out.push(s.replace(/\s+/g, ' ').trim());
  }
  return out;
}

const KEYWORDS = new Set(['where', 'on', 'join', 'left', 'inner', 'cross', 'order', 'group', 'limit', 'set', 'using', 'values', 'as']);

/** Reasons a reading statement may show a removed chapter, lesson or material (empty when it cannot). */
export function showsRemoved(sql: string): string[] {
  if (!/^\s*(SELECT|WITH)\s/i.test(sql)) return [];
  const problems: string[] = [];
  const ref = new RegExp(`\\b(FROM|JOIN)\\s+"?(${CONTENT_TABLES.join('|')})"?(?![\\w"])(?:\\s+(?:AS\\s+)?([a-z_][a-z0-9_]*))?`, 'gi');
  for (const m of sql.matchAll(ref)) {
    const [, , table, maybeAlias] = m;
    const alias = maybeAlias && !KEYWORDS.has(maybeAlias.toLowerCase()) ? maybeAlias : null;
    const needle = alias ? new RegExp(`\\b${alias}\\.removed_at\\s+IS\\s+NULL\\b`, 'i') : /\bremoved_at\s+IS\s+NULL\b/i;
    if (!needle.test(sql)) problems.push(`${table}${alias ? ` ${alias}` : ''} is read without ${alias ? `${alias}.` : ''}removed_at IS NULL`);
  }
  return problems;
}

test('removed guard: the scanner catches a read that forgets removed rows (self-check)', () => {
  assert.deepEqual(showsRemoved('SELECT m.id FROM material m WHERE m.space_id = ?'), ['material m is read without m.removed_at IS NULL']);
  assert.deepEqual(
    showsRemoved('SELECT l.id FROM lesson l JOIN chapter c ON c.id = l.chapter_id WHERE l.space_id = ? AND l.removed_at IS NULL'),
    ['chapter c is read without c.removed_at IS NULL'],
    'every table it names, not just the first',
  );
  assert.deepEqual(
    showsRemoved('SELECT c.id FROM chapter c LEFT JOIN lesson l ON l.chapter_id = c.id WHERE c.removed_at IS NULL'),
    ['lesson l is read without l.removed_at IS NULL'],
    'a left join too',
  );
  assert.equal(showsRemoved('SELECT m.id FROM material m WHERE m.removed_at IS NOT NULL').length, 1, 'IS NOT NULL is not the filter');
  assert.deepEqual(showsRemoved('SELECT id FROM lesson WHERE removed_at IS NULL'), [], 'an unaliased table');
  assert.deepEqual(
    showsRemoved('SELECT m.id FROM material m JOIN lesson l ON l.id = m.lesson_id AND l.removed_at IS NULL WHERE m.removed_at IS NULL'),
    [],
  );
  assert.deepEqual(showsRemoved('SELECT s.id FROM subject s WHERE s.space_id = ?'), [], 'subjects are never removed');
  assert.deepEqual(showsRemoved('UPDATE material SET title = ? WHERE id = ?'), [], 'only reads are checked here');
});

test('removed guard: every read of chapters, lessons and materials outside the publisher\'s modules excludes removed rows', () => {
  const offences: string[] = [];
  let checked = 0;
  for (const file of sourceFiles(join(root, 'src'))) {
    const name = relative(root, file).split('\\').join('/');
    if (PUBLISHER_ONLY[name]) continue;
    for (const sql of sqlStatements(readFileSync(file, 'utf8'))) {
      if (!new RegExp(`\\b(FROM|JOIN)\\s+"?(${CONTENT_TABLES.join('|')})\\b`, 'i').test(sql)) continue;
      checked++;
      for (const p of showsRemoved(sql)) offences.push(`${name}: ${p}\n    ${sql.slice(0, 160)}`);
    }
  }
  assert.ok(checked >= 4, `expected the learner's reads of content (src/learning.ts), found ${checked}`);
  assert.deepEqual(offences, [], 'exclude removed rows (removed_at IS NULL) on every read path');
});

// ------------------------------------------------ 2. one database change ----
/** A database that records every statement and answers that one row changed. */
function recordingDb(): { db: Db; calls: string[] } {
  const calls: string[] = [];
  const db = {
    async all() { calls.push('all'); return []; },
    async first() { calls.push('first'); return null; },
    async run(sql: string) { calls.push(`run ${sql.replace(/\s+/g, ' ').trim()}`); return 1; },
    async batch(statements: unknown[]) { calls.push(`batch of ${statements.length}`); },
  } as unknown as Db;
  return { db, calls };
}

test('removed guard: removing and restoring is one database statement each, a soft removal (removed_at), never a delete', async () => {
  const cases = [
    ['removeMaterial', removeMaterial, /^run UPDATE material SET removed_at = \?/],
    ['removeLesson', removeLesson, /^run UPDATE lesson SET removed_at = \?.*NOT EXISTS \(SELECT 1 FROM material m .*m\.removed_at IS NULL/],
    ['removeChapter', removeChapter, /^run UPDATE chapter SET removed_at = \?.*NOT EXISTS \(SELECT 1 FROM lesson l .*l\.removed_at IS NULL/],
    ['restoreMaterial', restoreMaterial, /^run UPDATE material SET removed_at = NULL/],
    ['restoreLesson', restoreLesson, /^run UPDATE lesson SET removed_at = NULL/],
    ['restoreChapter', restoreChapter, /^run UPDATE chapter SET removed_at = NULL/],
  ] as const;
  for (const [name, fn, shape] of cases) {
    const { db, calls } = recordingDb();
    const done = await (fn as (db: Db, spaceId: string, userId: string, id: string, at: number) => Promise<boolean>)(db, 'space-1', 'user-1', 'item-1', 1_700_000_000_000);
    assert.equal(done, true, `${name}: reports the change`);
    assert.equal(calls.length, 1, `${name}: exactly one database call, got ${calls.join(' | ')}`);
    assert.match(calls[0], shape, `${name}: one soft UPDATE`);
    assert.ok(!/\bDELETE\b/i.test(calls[0]), `${name}: nothing is deleted`);
    assert.match(calls[0], /publisher_user_id = \?/, `${name}: the ownership check is inside the same statement`);
    assert.match(calls[0], /space_id = \?/, `${name}: the space check is inside the same statement`);
  }
});

// --------------------------------------- 3 and 4. the running product ----
const SPACE = 'مدرسة مسك';
const ADMIN = { display_name: 'Amal Hassan', username: 'amal.admin', password: 'admin-first-pass', mobile: '01012345678' };
const HADEER = { username: 'hadeer', password: 'hadeer-first-pass', display_name: 'Hadeer', mobile: '01022223333', role: 'publisher' as const };
const SALMA = { username: 'salma.learner', password: 'salma-first-pass', display_name: 'Salma Adel', mobile: '01033334444', role: 'learner' as const };
const PDF = tinyPdf('Kept');
const GONE_PDF = tinyPdf('Removed worksheet');
const GONE_PDF_2 = tinyPdf('Removed with its lesson');
const GONE_PDF_3 = tinyPdf('Removed with its chapter');
const PNG = tinyPng();

// Every title of something that will be removed (directly, or with its lesson or chapter).
const GONE = [
  'Gone worksheet', 'Gone picture', 'Gone link', 'Gone note',
  'Gone lesson', 'Gone lesson sheet', 'Gone chapter', 'Gone chapter lesson', 'Gone chapter sheet',
  'Hidden lesson', 'Hidden lesson sheet', 'Hidden chapter', 'Hidden chapter lesson', 'Hidden chapter note',
];

let worker: RunningWorker;
let spaceId = '';
let hadeer: Client;
let salma: Client;
let admin: Client;
const ids: Record<string, string> = {};
const goneIds: { kind: 'chapter' | 'lesson' | 'material'; id: string }[] = [];
const etags: Record<string, string> = {};

interface RouteEntry { method: string; path: string; handler: unknown }

async function learnerRoutes(): Promise<string[]> {
  (globalThis as { __TEST_HOOKS__?: boolean }).__TEST_HOOKS__ = true;
  const { app, MIDDLEWARE } = await import('../../src/app.ts');
  const routes = (app.routes as RouteEntry[]).filter((r) => !(r.method === 'ALL' && MIDDLEWARE.has(r.handler)));
  // The guardian pages (release 2) are role-gated like admin and publish, and show no lesson content.
  const gated = (p: string) => /^\/s\/:spaceId\/(admin|publish|linked)(\/|$)/.test(p);
  return [...new Set(routes.filter((r) => r.method === 'GET' && (r.path === '/s/:spaceId' || r.path.startsWith('/s/:spaceId/')) && !gated(r.path)).map((r) => r.path))];
}

/** Every address of a learner route: a removed id for each parameter that names a removable item, the live subject otherwise. */
function addresses(path: string): { address: string; gone: boolean }[] {
  const params = [...path.matchAll(/:([A-Za-z]+)/g)].map((m) => m[1]).filter((n) => n !== 'spaceId');
  const base = path.replace(':spaceId', spaceId);
  if (!params.length) return [{ address: base, gone: false }];
  assert.equal(params.length, 1, `GET ${path}: the sweep knows routes with one item id; add this one here`);
  const [name] = params;
  const kind = ({ subjectId: 'subject', lessonId: 'lesson', materialId: 'material', chapterId: 'chapter' } as Record<string, string>)[name];
  assert.ok(kind, `GET ${path}: the sweep does not know the parameter :${name}; add it here`);
  if (kind === 'subject') return [{ address: base.replace(`:${name}`, ids.subject), gone: false }];
  const gone = goneIds.filter((g) => g.kind === kind);
  assert.ok(gone.length, `GET ${path}: removed ${kind}s exist to try`);
  return gone.map((g) => ({ address: base.replace(`:${name}`, g.id), gone: true }));
}

/** The text and links of a page, as a reader gets them. */
async function read(c: Client, path: string, etag?: string) {
  const res = etag ? await c.getWith(path, { 'if-none-match': etag }) : await c.get(path);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const type = res.headers.get('content-type') ?? '';
  const body = type.includes('text/html') ? new TextDecoder().decode(bytes) : '';
  return { status: res.status, type, bytes, body, links: [...body.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&')) };
}

function assertNothingRemoved(page: { body: string; bytes: Uint8Array }, where: string): void {
  for (const title of GONE) assert.ok(!page.body.includes(title), `${where}: shows no removed title ("${title}")`);
  for (const g of goneIds) assert.ok(!page.body.includes(g.id), `${where}: links to no removed ${g.kind} (${g.id})`);
  for (const pdf of [GONE_PDF, GONE_PDF_2, GONE_PDF_3]) assert.notEqual(sha256(page.bytes), sha256(pdf), `${where}: sends no removed file`);
}

describe('removed guard: no learner read path shows removed content', { concurrency: false }, () => {
  before(async () => {
    worker = await startWorker();
    const owner = await setUpOwner(worker.url);
    spaceId = await createSpace(owner, { name: SPACE, kit: 'school' });
    await appointAdmin(owner, spaceId, { ...ADMIN, valid_until: utcDatePlusDays(60) });
    const s = await seed(worker.url, {
      spaceId,
      grantedBy: ADMIN.username,
      people: [{ ...HADEER, valid_until: utcDatePlusDays(30) }, { ...SALMA, valid_until: utcDatePlusDays(30) }],
      groups: [{ name: 'Science', members: [SALMA.username] }],
      subjects: [{
        title: 'Mathematics', publisher: HADEER.username, published: true, groups: ['Science'],
        chapters: [
          { title: 'Fractions', lessons: [
            { title: 'Adding fractions', materials: [
              { kind: 'pdf', title: 'Kept worksheet', base64: b64(PDF), contentType: 'application/pdf' },
              { kind: 'pdf', title: 'Gone worksheet', base64: b64(GONE_PDF), contentType: 'application/pdf' },
              { kind: 'image', title: 'Gone picture', base64: b64(PNG), contentType: 'image/png' },
              { kind: 'link', title: 'Gone link', url: 'https://example.org/gone' },
              { kind: 'note', title: 'Gone note', text: 'gone' },
            ] },
            { title: 'Gone lesson', materials: [{ kind: 'pdf', title: 'Gone lesson sheet', base64: b64(GONE_PDF_2), contentType: 'application/pdf' }] },
            { title: 'Hidden lesson', materials: [{ kind: 'pdf', title: 'Hidden lesson sheet', base64: b64(GONE_PDF_2), contentType: 'application/pdf' }] },
          ] },
          { title: 'Gone chapter', lessons: [
            { title: 'Gone chapter lesson', materials: [{ kind: 'pdf', title: 'Gone chapter sheet', base64: b64(GONE_PDF_3), contentType: 'application/pdf' }] },
          ] },
          { title: 'Hidden chapter', lessons: [
            { title: 'Hidden chapter lesson', materials: [{ kind: 'note', title: 'Hidden chapter note', text: 'hidden' }] },
          ] },
        ],
      }],
    });
    const m = s.subjects.Mathematics;
    const fr = m.chapters.Fractions.lessons;
    Object.assign(ids, {
      subject: m.id, adding: fr['Adding fractions'].id, kept: fr['Adding fractions'].materials['Kept worksheet'],
      goneWorksheet: fr['Adding fractions'].materials['Gone worksheet'], gonePicture: fr['Adding fractions'].materials['Gone picture'],
      goneLink: fr['Adding fractions'].materials['Gone link'], goneNote: fr['Adding fractions'].materials['Gone note'],
      goneLesson: fr['Gone lesson'].id, goneLessonSheet: fr['Gone lesson'].materials['Gone lesson sheet'],
      hiddenLesson: fr['Hidden lesson'].id, hiddenLessonSheet: fr['Hidden lesson'].materials['Hidden lesson sheet'],
      goneChapter: m.chapters['Gone chapter'].id, goneChapterLesson: m.chapters['Gone chapter'].lessons['Gone chapter lesson'].id,
      goneChapterSheet: m.chapters['Gone chapter'].lessons['Gone chapter lesson'].materials['Gone chapter sheet'],
      hiddenChapter: m.chapters['Hidden chapter'].id, hiddenChapterLesson: m.chapters['Hidden chapter'].lessons['Hidden chapter lesson'].id,
      hiddenChapterNote: m.chapters['Hidden chapter'].lessons['Hidden chapter lesson'].materials['Hidden chapter note'],
    });
    hadeer = await signedIn(worker.url, HADEER.username, HADEER.password);
    salma = await signedIn(worker.url, SALMA.username, SALMA.password);
    admin = await signedIn(worker.url, ADMIN.username, ADMIN.password);
  });

  after(async () => {
    await worker?.stop();
  });

  it('positive control: before any removal, the learner sees every item and opens every file', async () => {
    const subject = await read(salma, `/s/${spaceId}/learn/${ids.subject}`);
    assert.equal(subject.status, 200);
    for (const t of ['Gone lesson', 'Gone chapter', 'Gone chapter lesson', 'Hidden lesson', 'Hidden chapter']) assert.ok(subject.body.includes(t), `the subject shows "${t}"`);
    const lesson = await read(salma, `/s/${spaceId}/read/${ids.adding}`);
    for (const t of ['Gone worksheet', 'Gone picture', 'Gone link', 'Gone note']) assert.ok(lesson.body.includes(t), `the lesson shows "${t}"`);
    for (const id of [ids.goneWorksheet, ids.gonePicture, ids.goneLessonSheet, ids.goneChapterSheet, ids.hiddenLessonSheet]) {
      const f = await salma.get(`/s/${spaceId}/file/${id}`);
      assert.equal(f.status, 200, `file ${id} opens`);
      etags[id] = f.headers.get('etag') ?? '';
      assert.ok(etags[id], 'with an ETag');
      await f.arrayBuffer();
    }
    for (const id of [ids.goneLesson, ids.goneChapterLesson, ids.hiddenLesson, ids.hiddenChapterLesson]) {
      assert.equal((await salma.get(`/s/${spaceId}/read/${id}`)).status, 200, `lesson ${id} opens`);
    }
  });

  it('the publisher removes through her real forms; then a chapter and a lesson are marked removed directly in the database with their content still showing', async () => {
    const remove = async (path: string) => assert.equal((await hadeer.post(`/s/${spaceId}/publish/${path}/remove`, {})).status, 303, `removed ${path}`);
    for (const id of [ids.goneWorksheet, ids.gonePicture, ids.goneLink, ids.goneNote]) {
      await remove(`item/${id}`);
      goneIds.push({ kind: 'material', id });
    }
    await remove(`item/${ids.goneLessonSheet}`);
    await remove(`compose/${ids.goneLesson}`);
    goneIds.push({ kind: 'material', id: ids.goneLessonSheet }, { kind: 'lesson', id: ids.goneLesson });
    await remove(`item/${ids.goneChapterSheet}`);
    await remove(`compose/${ids.goneChapterLesson}`);
    await remove(`part/${ids.goneChapter}`);
    goneIds.push({ kind: 'material', id: ids.goneChapterSheet }, { kind: 'lesson', id: ids.goneChapterLesson }, { kind: 'chapter', id: ids.goneChapter });
    // A state the screens never leave: a removed lesson and a removed chapter
    // whose children still show. Every read path must hide the children too.
    await worker.sql(`UPDATE lesson SET removed_at = 1 WHERE id = '${ids.hiddenLesson}'`);
    await worker.sql(`UPDATE chapter SET removed_at = 1 WHERE id = '${ids.hiddenChapter}'`);
    goneIds.push(
      { kind: 'lesson', id: ids.hiddenLesson }, { kind: 'material', id: ids.hiddenLessonSheet },
      { kind: 'chapter', id: ids.hiddenChapter }, { kind: 'lesson', id: ids.hiddenChapterLesson }, { kind: 'material', id: ids.hiddenChapterNote },
    );
    const stored = await worker.sql(`SELECT COUNT(*) AS n FROM material WHERE lesson_id IN ('${ids.adding}', '${ids.goneLesson}', '${ids.hiddenLesson}')`);
    assert.equal(Number(stored[0].n), 7, 'nothing was deleted: every material row is still stored');
  });

  it('every learner read path in the route table answers "not found" for a removed id and never shows or sends removed content, for a learner, an admin and the publisher', async () => {
    const routes = await learnerRoutes();
    for (const must of ['/s/:spaceId', '/s/:spaceId/learn/:subjectId', '/s/:spaceId/read/:lessonId', '/s/:spaceId/file/:materialId']) {
      assert.ok(routes.includes(must), `GET ${must} is a learner read path in the sweep`);
    }
    let sent = 0;
    for (const path of routes) {
      for (const { address, gone } of addresses(path)) {
        for (const [who, c] of [['the learner', salma], ['the admin', admin], ['the publisher', hadeer]] as const) {
          const page = await read(c, address);
          sent++;
          if (gone) {
            assert.equal(page.status, 404, `${who}: GET ${address} (${path}) answers not found, got ${page.status}`);
            assert.ok(!page.type.includes('pdf') && !page.type.startsWith('image/'), `${who}: ${address} sends no file`);
          } else {
            assert.ok([200, 404].includes(page.status), `${who}: GET ${address} opens (${page.status})`);
          }
          assertNothingRemoved(page, `${who}: GET ${address}`);
        }
      }
    }
    assert.ok(sent >= 3 * 15, `the sweep opened ${sent} addresses`);
    // A cached copy's ETag never brings a removed file back (no 304).
    for (const [id, etag] of Object.entries(etags)) {
      if (!goneIds.some((g) => g.id === id)) continue;
      const res = await read(salma, `/s/${spaceId}/file/${id}`, etag);
      assert.equal(res.status, 404, `file ${id} with its old ETag answers not found, not 304`);
    }
    // The kept file still opens (so the 404s above are about removal, not a broken file route).
    const kept = await read(salma, `/s/${spaceId}/file/${ids.kept}`);
    assert.equal(kept.status, 200);
    assert.equal(sha256(kept.bytes), sha256(PDF));
  });

  it('a crawl of every page reachable from the learner\'s home (and the publisher\'s preview) shows no removed title and links to no removed id', async () => {
    for (const [who, c, start] of [
      ['the learner', salma, `/s/${spaceId}`],
      ['the publisher (preview)', hadeer, `/s/${spaceId}/learn/${ids.subject}`],
      ['the admin', admin, `/s/${spaceId}/learn/${ids.subject}`],
    ] as const) {
      const seen = new Set<string>();
      const queue = [start];
      while (queue.length) {
        const path = queue.shift()!;
        if (seen.has(path)) continue;
        seen.add(path);
        const page = await read(c, path);
        assert.equal(page.status, 200, `${who}: ${path} opens`);
        assertNothingRemoved(page, `${who}: ${path}`);
        for (const link of page.links) {
          if (!link.startsWith(`/s/${spaceId}`) || /\/(publish|admin)(\/|$)/.test(link)) continue;
          if (!seen.has(link)) queue.push(link);
        }
      }
      assert.ok(seen.has(`/s/${spaceId}/read/${ids.adding}`) && seen.has(`/s/${spaceId}/file/${ids.kept}`), `${who}: the crawl reached the lesson and its kept file (${seen.size} pages)`);
    }
  });
});
