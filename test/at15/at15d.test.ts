// AT-15d (contract product-contract-r2, R2-d): what counts as an open. A row is
// written or its date moved only when the learner themselves opens, with
// success, a lesson page assigned to them. Nothing is written for a guardian,
// admin or publisher viewing or previewing; a lesson not assigned to the
// learner; a refused or "access ended" attempt. The write is a server effect of
// opening that page: a reload or a prefetch the same day changes nothing, and
// no endpoint exists that writes a view (every non-GET, and every other route,
// is refused and writes nothing).
import { describe, it, before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '../support/http.ts';
import { A, B, C, G1, HADEER, SHIMAA, as, personPath } from '../at9/world.ts';
import { activityPath, activityWorld, lessonPath, open, switchOn, viewRows, type ActivityWorld } from './activity.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));
/** The session cookie a signed-in client sends, for a raw request with another method. */
const cookieOf = (c: Client) => c.lastSetCookie.map((l) => l.split(';')[0]).find((p) => p.startsWith('lms_session=')) ?? '';
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? sourceFiles(p) : p.endsWith('.ts') ? [p] : [];
  });
}

test('AT-15d the code: one statement writes a lesson view, and only the lesson page (GET) calls it', () => {
  const writers: string[] = [];
  const callers: string[] = [];
  for (const f of sourceFiles(join(root, 'src'))) {
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(/(INSERT\s+(OR\s+\w+\s+)?INTO|REPLACE\s+INTO|UPDATE)\s+"?lesson_view"?(?![\w"])/gi)) writers.push(`${relative(root, f)}: ${m[0]}`);
    for (const _ of text.matchAll(/\brecordOpen\(/g)) callers.push(relative(root, f).replace(/\\/g, '/'));
  }
  assert.deepEqual(writers, [`${join('src', 'activity.ts')}: INSERT INTO lesson_view`], 'the only write is recordOpen');
  assert.deepEqual(callers.sort(), ['src/activity.ts', 'src/app.ts'], 'defined once, called once');
  const app = readFileSync(join(root, 'src', 'app.ts'), 'utf8');
  const route = app.slice(app.indexOf("app.get('/s/:spaceId/read/:lessonId'"));
  const handler = route.slice(0, route.indexOf('\n});') + 4);
  assert.ok(handler.includes('recordOpen('), 'it is called from the lesson page');
  assert.ok(/c\.req\.method === 'GET'/.test(handler), 'and only for a GET (HEAD writes nothing)');
  assert.equal(app.split('recordOpen(').length - 1, 1, 'from nowhere else');
});

describe('AT-15d the running product: only the learner\'s own successful open of an assigned lesson writes', { concurrency: false }, () => {
  let w: ActivityWorld;
  let nahw = '';
  before(async () => {
    w = await activityWorld();
    nahw = String((await w.p.sql(`SELECT id FROM lesson WHERE title = 'Nahw basics'`))[0].id);
    await switchOn(w);
  });
  after(async () => {
    await w?.close();
  });

  it('a guardian, the admin and the publisher viewing or previewing write nothing', async () => {
    const g1 = await as(w, G1);
    assert.equal((await g1.get(lessonPath(w))).status, 403, 'the guardian is refused the lesson');
    await g1.get(activityPath(w, w.ids[A.username]));
    assert.equal((await w.admin.get(lessonPath(w))).status, 200, 'the admin reads it');
    const hadeer = await as(w, HADEER);
    assert.equal((await hadeer.get(lessonPath(w))).status, 200, 'the publisher reads it');
    assert.equal((await hadeer.get(`/s/${w.spaceId}/publish/compose/${w.content.lesson}`)).status, 200, 'the publisher previews it in the editor');
    assert.equal((await (await as(w, SHIMAA)).get(lessonPath(w))).status, 403);
    assert.deepEqual(await viewRows(w), []);
  });

  it('a lesson not assigned to the learner, and a refused or "access ended" attempt, write nothing', async () => {
    assert.equal((await open(w, B, nahw)).status, 403, 'Arabic is not assigned to B');
    assert.equal((await open(w, C, nahw)).status, 403);
    const b = await as(w, B);
    assert.equal((await w.admin.post(`${personPath(w, w.ids[B.username])}/end`, {})).status, 303, 'End access now for B');
    assert.equal((await b.get(lessonPath(w))).status, 403, 'B\'s open is refused: access ended');
    assert.equal((await new Client(w.p.url).get(lessonPath(w))).status, 302, 'signed out: to sign-in');
    assert.deepEqual(await viewRows(w), []);
  });

  it('the learner\'s own open writes one row; a reload and a prefetch the same day change nothing; HEAD writes nothing', async () => {
    const c = await as(w, C);
    const head = await fetch(w.p.url + lessonPath(w), { method: 'HEAD', redirect: 'manual', headers: { cookie: cookieOf(c) } });
    assert.equal(head.status, 200, 'HEAD answers');
    assert.deepEqual(await viewRows(w), [], 'HEAD wrote nothing');
    const a = await as(w, A);
    assert.equal((await a.get(lessonPath(w))).status, 200);
    const rows = await viewRows(w);
    assert.equal(rows.length, 1, 'one row');
    assert.equal(rows[0].learner_user_id, w.ids[A.username]);
    assert.equal(rows[0].lesson_id, w.content.lesson);
    assert.equal((await a.get(lessonPath(w))).status, 200, 'a reload');
    assert.equal((await a.getWith(lessonPath(w), { 'sec-purpose': 'prefetch', purpose: 'prefetch' })).status, 200, 'a prefetch');
    assert.deepEqual(await viewRows(w), rows, 'unchanged');
  });

  it('no endpoint writes a view: every non-GET to the lesson page, and every other page, is refused or writes nothing', async () => {
    const a = await as(w, A);
    const before = await viewRows(w);
    const cookie = cookieOf(a);
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      for (const path of [lessonPath(w, nahw), `${lessonPath(w, nahw)}/open`, `/s/${w.spaceId}/view/${nahw}`, `/s/${w.spaceId}/activity`]) {
        const res = await fetch(w.p.url + path, { method, redirect: 'manual', headers: { cookie, origin: w.p.url, 'content-type': 'application/x-www-form-urlencoded' }, body: 'lesson=' + nahw });
        assert.ok([403, 404].includes(res.status), `${method} ${path} refused (${res.status})`);
      }
    }
    for (const path of [`/s/${w.spaceId}`, `/s/${w.spaceId}/learn/${w.content.arabic}`, `/s/${w.spaceId}/file/${w.content.pdf}`, `/s/${w.spaceId}/results`, '/home', '/account']) {
      assert.ok([200, 302].includes((await a.get(path)).status), path);
    }
    assert.deepEqual(await viewRows(w), before, 'Nahw basics was never recorded: only its own page records it');
    assert.equal((await a.get(lessonPath(w, nahw))).status, 200);
    assert.equal((await viewRows(w)).length, 2, 'positive control: opening its page does');
  });
});
