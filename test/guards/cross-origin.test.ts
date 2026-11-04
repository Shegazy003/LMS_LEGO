// AT-5 guard: every form refuses a cross-origin post.
//
// Every POST route of the product (read from the router's own route table, so
// a form added later is swept too) is posted by the person who may use it,
// with that person's session, but from another site, from an origin that is
// only close to the product's own (Origin: null, another port, a subdomain),
// or with no Origin at all: as an ordinary form, as a multipart form carrying files, as plain text
// and as JSON. Every one must answer 403, start no session, and change
// nothing: every row of every product table and the stored files are the same
// afterwards. A positive control then shows the same sessions, from the
// product's own pages, do change things through the same forms.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startWorker, type RunningWorker } from '../support/worker.ts';
import { Client, tinyPng, utcDatePlusDays } from '../support/http.ts';
import { issueLink, userIdOf } from '../support/admin.ts';
import { OWNER, appointAdmin, b64, createSpace, seed, setUpOwner, signedIn, tinyPdf } from '../support/seed.ts';
import { changes, snapshot, type Snapshot } from '../support/state.ts';

interface RouteEntry { method: string; path: string; handler: unknown }

const SPACE = 'مدرسة مسك';
const ADMIN = { display_name: 'Amal Hassan', username: 'amal.admin', password: 'admin-first-pass', mobile: '01012345678' };
const HADEER = { username: 'hadeer', password: 'hadeer-first-pass', display_name: 'Hadeer', mobile: '01022223333', role: 'publisher' as const };
const SALMA = { username: 'salma.learner', password: 'salma-first-pass', display_name: 'Salma', mobile: '01033334444', role: 'learner' as const };
const CONCEPTS = ['space', 'admin', 'publisher', 'learner', 'group', 'subject', 'chapter', 'lesson', 'material'];
const EVIL = 'https://evil.example';

let worker: RunningWorker;
let owner: Client;
let admin: Client;
let publisher: Client;
let learner: Client;
let anonymous: Client;
const ids: Record<string, string> = {};

async function productPosts(): Promise<string[]> {
  (globalThis as { __TEST_HOOKS__?: boolean }).__TEST_HOOKS__ = true;
  const { app, MIDDLEWARE } = await import('../../src/app.ts');
  const routes = (app.routes as RouteEntry[]).filter((r) => !(r.method === 'ALL' && MIDDLEWARE.has(r.handler)));
  return [...new Set(routes.filter((r) => r.method === 'POST' || r.method === 'ALL').map((r) => r.path))];
}

/** Who may use a form, and the address with real ids. */
function placeOf(path: string): { client: Client; address: string } | null {
  if (path.startsWith('/__test/')) return null; // test builds only: the production guard proves they are absent
  const userId = path.startsWith('/owner/') ? ids.adminId : ids.hadeerId;
  const address = path
    .replace(':spaceId', ids.space)
    .replace(':id', ids.space)
    .replace(':userId', userId)
    .replace(/:([A-Za-z]+)/g, (_, name: string) => ids[name] ?? 'no-such-id');
  const client =
    path === '/owner' || path.startsWith('/owner/') ? owner
      : path.startsWith('/s/:spaceId/admin') ? admin
        : path.startsWith('/s/:spaceId/publish') ? publisher
          : path.startsWith('/account') || path === '/signout' ? learner
            : ['/setup', '/signin', '/recover', '/r/:token'].includes(path) ? anonymous
              : null;
  assert.ok(client, `the sweep does not know who uses POST ${path}: add it here`);
  return { client, address };
}

/** Every field any form reads, filled so that the form would succeed if it were accepted. */
function fields(path: string): Record<string, string> {
  const labels = Object.fromEntries(['ar', 'en'].flatMap((l) => CONCEPTS.map((c) => [`${l}.${c}`, `Forged ${c}`])));
  return {
    username: path === '/r/:token' ? HADEER.username : OWNER.username,
    password: OWNER.password,
    current_password: SALMA.password,
    new_password: 'forged-password-1',
    code: 'AAAA-BBBB-CCCC-DDDD',
    mobile: '01099998888',
    display_name: 'Forged Person',
    role: 'learner',
    valid_until: utcDatePlusDays(10),
    name: 'Forged',
    title: 'Forged',
    kit: 'company',
    confirm: 'yes',
    languages: 'ar,en',
    primary_color: '#ff0000',
    country_code: '+20',
    direction: 'down',
    kind: 'note',
    text: 'forged',
    url: 'https://example.org/forged',
    lang: 'en',
    member: ids.salmaId,
    set: ids.groupId,
    learner: ids.salmaId,
    publisher: ids.hadeerId,
    ...labels,
  };
}

function multipart(values: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  f.set('logo', new Blob([tinyPng()], { type: 'image/png' }), 'logo.png');
  f.set('file', new Blob([tinyPdf('forged')], { type: 'application/pdf' }), 'forged.pdf');
  return f;
}

/** Origins that are close to the product's own but are not it (the check is an exact match).
 * "Another scheme on the same host" is not sent here: `wrangler dev`'s local
 * proxy rewrites any Origin on the Worker's host to the Worker's own origin,
 * whatever its scheme, so local emulation cannot show that case. It is covered
 * by test/unit/origin.test.ts and, on the live https address, by the deploy
 * smoke check (scripts/smoke-check.mjs). */
function nearOrigins(base: string): [string, string][] {
  const u = new URL(base);
  const port = Number(u.port || (u.protocol === 'https:' ? 443 : 80));
  return [
    ['Origin: null (a sandboxed page or a file)', 'null'],
    ['a different port', `${u.protocol}//${u.hostname}:${port + 1}`],
    ['a subdomain', `${u.protocol}//evil.${u.host}`],
  ];
}

/** The forged requests: [what, send]. */
function forgeries(client: Client, address: string, values: Record<string, string>) {
  return [
    ...nearOrigins(client.base).map(([what, origin]) => [`form, ${what}`, () => client.postWith(address, values, { origin })] as const),
    ['form, another site', () => client.postWith(address, values, { origin: EVIL })],
    ['form, another site (sec-fetch-site)', () => client.postWith(address, values, { origin: EVIL, 'sec-fetch-site': 'cross-site' })],
    ['form, no origin', () => client.postWith(address, values, {})],
    ['multipart with files, another site', () => client.postWith(address, multipart(values), { origin: EVIL })],
    ['multipart with files, no origin', () => client.postWith(address, multipart(values), {})],
    ['plain text, no origin', () => client.postBody(address, new URLSearchParams(values).toString(), { 'content-type': 'text/plain' })],
    ['JSON, another site', () => client.postBody(address, JSON.stringify(values), { origin: EVIL, 'content-type': 'application/json' })],
  ] as const;
}

async function storedBytes(): Promise<number> {
  const html = await (await owner.get('/owner')).text();
  return Number(html.match(/data-usage="storage"[^>]*data-value="(\d+)"/)?.[1] ?? NaN);
}

describe('AT-5 guard: every form refuses a cross-origin post', { concurrency: false }, () => {
  before(async () => {
    worker = await startWorker();
    owner = await setUpOwner(worker.url);
    ids.space = await createSpace(owner, { name: SPACE, kit: 'school' });
    await appointAdmin(owner, ids.space, { ...ADMIN, valid_until: utcDatePlusDays(60) });
    const s = await seed(worker.url, {
      spaceId: ids.space,
      grantedBy: ADMIN.username,
      people: [{ ...HADEER, valid_until: utcDatePlusDays(30) }, { ...SALMA, valid_until: utcDatePlusDays(30) }],
      groups: [{ name: 'Science', members: [SALMA.username] }],
      subjects: [{
        title: 'Mathematics', publisher: HADEER.username, published: true, groups: ['Science'],
        chapters: [{ title: 'Fractions', lessons: [{ title: 'Adding fractions', materials: [
          { kind: 'pdf', title: 'Worksheet', base64: b64(tinyPdf()), contentType: 'application/pdf' },
          { kind: 'note', title: 'Remember', text: 'Add the tops.' },
        ] }] }],
      }],
    });
    const subject = s.subjects.Mathematics;
    const lesson = subject.chapters.Fractions.lessons['Adding fractions'];
    Object.assign(ids, {
      subjectId: subject.id, chapterId: subject.chapters.Fractions.id, lessonId: lesson.id, materialId: lesson.materials.Remember,
      groupId: s.groups.Science, hadeerId: s.users[HADEER.username], salmaId: s.users[SALMA.username],
      adminId: await userIdOf(worker, ADMIN.username),
    });
    admin = await signedIn(worker.url, ADMIN.username, ADMIN.password);
    publisher = await signedIn(worker.url, HADEER.username, HADEER.password);
    learner = await signedIn(worker.url, SALMA.username, SALMA.password);
    anonymous = new Client(worker.url);
    const link = await issueLink(admin, `/s/${ids.space}/admin/people/${ids.hadeerId}`);
    assert.equal(link.status, 200);
    ids.token = link.token;
  });

  after(async () => {
    await worker?.stop();
  });

  it('every admin, publisher, owner (kit included), account, reset and sign-in form refuses a post from another site or with no origin, and nothing changes', async () => {
    const posts = await productPosts();
    for (const must of [
      '/owner/spaces/:id/kit', '/owner/spaces/:id/labels', '/owner/spaces/:id/theme', '/owner/spaces/:id/admins',
      '/owner/spaces/:id/people/:userId/link', '/owner/spaces/:id/people/:userId/password',
      '/s/:spaceId/admin/people', '/s/:spaceId/admin/people/:userId/link', '/s/:spaceId/admin/people/:userId/password',
      '/s/:spaceId/admin/sets', '/s/:spaceId/admin/sets/:groupId', '/s/:spaceId/admin/topics', '/s/:spaceId/admin/topics/:subjectId',
      '/s/:spaceId/publish/compose/:lessonId/add', '/account/password', '/account/language', '/r/:token', '/signin',
      // Release 2 (R2-a): a guardian's links.
      '/s/:spaceId/admin/people/:userId/links', '/s/:spaceId/admin/people/:userId/links/:learnerId/remove',
      // R2-d: the admin's lesson-activity switch, on and off.
      '/s/:spaceId/admin/activity', '/s/:spaceId/admin/activity/off',
    ]) assert.ok(posts.includes(must), `POST ${must} exists and is in the sweep`);

    const dataBefore: Snapshot = await snapshot(worker);
    const filesBefore = await storedBytes();
    let sent = 0;
    for (const path of posts) {
      const place = placeOf(path);
      if (!place) continue;
      for (const [what, send] of forgeries(place.client, place.address, fields(path))) {
        const res = await send();
        assert.equal(res.status, 403, `POST ${path} (${what}) is refused with 403, got ${res.status}`);
        assert.ok(!res.headers.getSetCookie().some((l) => l.startsWith('lms_session=') && !/max-age=0/i.test(l)), `POST ${path} (${what}) starts no session`);
        sent++;
      }
    }
    assert.ok(sent >= 10 * 30, `the sweep sent ${sent} forged posts`);
    assert.deepEqual(changes(dataBefore, await snapshot(worker)), {}, 'no row of any product table changed');
    assert.equal(await storedBytes(), filesBefore, 'no file was stored');
    // Everyone is still signed in: no forged sign-out went through.
    for (const c of [admin, publisher, learner]) assert.equal((await c.get('/account')).status, 200);
  });

  it('positive control: the same sessions, from the product\'s own pages, change things through the same forms', async () => {
    const before = await snapshot(worker);
    const labels = Object.fromEntries(['ar', 'en'].flatMap((l) => CONCEPTS.map((c) => [`${l}.${c}`, `${l} ${c}`])));
    assert.equal((await owner.post(`/owner/spaces/${ids.space}/labels`, labels)).status, 303, 'the owner saves the names');
    const theme = new FormData();
    theme.set('primary_color', '#123456');
    theme.set('logo', new Blob([tinyPng()], { type: 'image/png' }), 'logo.png');
    assert.equal((await owner.post(`/owner/spaces/${ids.space}/theme`, theme)).status, 303, 'the owner saves the theme (multipart)');
    assert.equal((await admin.post(`/s/${ids.space}/admin/sets`, { name: 'Control', member: ids.salmaId })).status, 303, 'the admin forms a group');
    assert.equal((await publisher.post(`/s/${ids.space}/publish/item/${ids.materialId}/move`, { direction: 'up' })).status, 303, 'the publisher moves a material');
    assert.equal((await learner.post('/account/language', { lang: 'en' })).status, 303, 'the learner chooses English');
    const reset = await anonymous.post(`/r/${ids.token}`, { username: HADEER.username, new_password: 'hadeer-new-pass' });
    assert.equal(reset.status, 200, 'the reset link sets the password');
    const diff = changes(before, await snapshot(worker));
    for (const t of ['kit', 'group', 'group_member', 'material', 'user', 'reset_link']) assert.ok(diff[t], `${t} changed`);
  });
});
