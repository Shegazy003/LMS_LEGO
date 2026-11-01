// AT-3 guard: every admin and publisher route is role-gated.
//
// A route that changes data, or that serves an admin or publisher page, may be
// registered only:
// - under /s/:spaceId/admin/* or /s/:spaceId/publish/*, after the role gate for
//   that prefix (Hono runs handlers in registration order, so a gate
//   registered after a handler never runs for it); or
// - under /owner or /owner/*, after the owner gate; or
// - on the short, named list of routes that are not role pages by nature
//   (first setup, sign-in, sign-out, recovery, changing one's own password,
//   and the test-only hooks that the production guard proves are absent from
//   the production bundle).
//
// Two layers, each a test: a static check of the router's own route table
// (with a self-check that it catches planted violations), and a live sweep in
// which every gated route, with real ids, refuses people without the role.
import { describe, it, before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { Hono, type MiddlewareHandler } from 'hono';
import { startWorker, type RunningWorker } from '../support/worker.ts';
import { tinyPng, utcDatePlusDays } from '../support/http.ts';
import { appointAdmin, b64, createSpace, seed, setUpOwner, signedIn, tinyPdf } from '../support/seed.ts';

export interface RouteEntry {
  method: string;
  path: string;
  handler: (...args: never[]) => unknown;
}

const GATES = [
  { prefix: '/s/:spaceId/admin', gate: '/s/:spaceId/admin/*' },
  { prefix: '/s/:spaceId/publish', gate: '/s/:spaceId/publish/*' },
  { prefix: '/owner', gate: '/owner/*', alsoGate: '/owner' },
];

/** Data-changing routes that are not role pages, each for a stated reason. */
export const OPEN_WRITES: Record<string, string> = {
  'POST /setup': 'first owner setup; refused once the owner exists',
  'POST /signin': 'signing in',
  'POST /signout': 'signing out',
  'POST /recover': 'the owner\'s recovery code',
  'POST /account/password': 'everyone changes their own password (signed in)',
  'POST /__test/clock': 'test builds only (production guard)',
  'POST /__test/seed': 'test builds only (production guard)',
};

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE', 'ALL']);
// Path words that mean an admin, publisher or owner page wherever they appear.
const ROLE_WORDS = /\/(admin|publish|publisher|owner|edit|editor)(\/|$)/;

const under = (path: string, prefix: string) => path === prefix || path.startsWith(prefix + '/');

/** Middleware takes (c, next); a handler takes (c). Hono stores both as given. */
const isMiddleware = (r: RouteEntry) => r.method === 'ALL' && r.handler.length >= 2;

/** Reasons the route table lets a role route through without its gate (empty when every one is gated). */
export function ungated(routes: readonly RouteEntry[]): string[] {
  const problems: string[] = [];
  routes.forEach((r, index) => {
    if (isMiddleware(r)) return;
    const name = `${r.method} ${r.path}`;
    const zone = GATES.find((g) => under(r.path, g.prefix));
    if (zone) {
      const gateAt = routes.findIndex((m) => isMiddleware(m) && (m.path === zone.gate || m.path === zone.alsoGate) && matchesBase(m.path, r.path));
      if (gateAt < 0 || gateAt > index) problems.push(`${name} is not behind the gate ${zone.gate} (registered before it, or no gate)`);
      return;
    }
    if (WRITE_METHODS.has(r.method) && !OPEN_WRITES[name]) problems.push(`${name} changes data outside the role-gated prefixes`);
    else if (ROLE_WORDS.test(r.path)) problems.push(`${name} serves a role page outside the role-gated prefixes`);
  });
  return problems;
}

/** Whether a gate pattern ("/x/*" also matches "/x"; "/x" matches only "/x") covers a path. */
function matchesBase(gate: string, path: string): boolean {
  if (gate.endsWith('/*')) return under(path, gate.slice(0, -2));
  return gate === path;
}

// ------------------------------------------------------------ self-check ----
const gate: MiddlewareHandler = async (_c, next) => { await next(); };
const page = (c: { text: (s: string) => Response }) => c.text('ok');

test('role guard: the checker catches a planted violation (self-check)', () => {
  const clean = new Hono();
  clean.use('/owner', gate);
  clean.use('/owner/*', gate);
  clean.use('/s/:spaceId/admin/*', gate);
  clean.use('/s/:spaceId/publish/*', gate);
  clean.post('/signin', page);
  clean.get('/s/:spaceId/learn/:subjectId', page);
  clean.get('/s/:spaceId/publish', page);
  clean.post('/s/:spaceId/publish/subjects/:subjectId/chapters', page);
  clean.post('/owner/spaces', page);
  assert.deepEqual(ungated(clean.routes), [], 'a correctly gated table passes');

  const planted = (build: (app: Hono) => void) => {
    const app = new Hono();
    app.use('/owner', gate);
    app.use('/owner/*', gate);
    app.use('/s/:spaceId/admin/*', gate);
    app.use('/s/:spaceId/publish/*', gate);
    build(app);
    return ungated(app.routes);
  };
  assert.deepEqual(planted((a) => a.post('/s/:spaceId/subjects/:subjectId/chapters', page)),
    ['POST /s/:spaceId/subjects/:subjectId/chapters changes data outside the role-gated prefixes'], 'a write outside the prefixes');
  assert.deepEqual(planted((a) => a.get('/s/:spaceId/edit/:subjectId', page)),
    ['GET /s/:spaceId/edit/:subjectId serves a role page outside the role-gated prefixes'], 'an editor page outside the prefixes');
  assert.deepEqual(planted((a) => a.get('/admin/people', page)),
    ['GET /admin/people serves a role page outside the role-gated prefixes'], 'an admin page outside the space');
  assert.deepEqual(planted((a) => a.all('/s/:spaceId/learn/:id', page)),
    ['ALL /s/:spaceId/learn/:id changes data outside the role-gated prefixes'], 'a catch-all handler (it answers POST too)');
  assert.deepEqual(planted((a) => a.delete('/account/password', page)),
    ['DELETE /account/password changes data outside the role-gated prefixes'], 'only the named open writes, by method and path');

  // A handler registered before its gate is not behind it.
  const early = new Hono();
  early.post('/s/:spaceId/publish/subjects/:subjectId/publish', page);
  early.use('/s/:spaceId/publish/*', gate);
  early.get('/owner/spaces/new', page);
  early.use('/owner/*', gate);
  assert.deepEqual(ungated(early.routes), [
    'POST /s/:spaceId/publish/subjects/:subjectId/publish is not behind the gate /s/:spaceId/publish/* (registered before it, or no gate)',
    'GET /owner/spaces/new is not behind the gate /owner/* (registered before it, or no gate)',
  ]);
  // The owner home itself needs the gate on "/owner" or "/owner/*".
  const noBase = new Hono();
  noBase.get('/owner', page);
  assert.equal(ungated(noBase.routes).length, 1, 'a gated prefix with no gate at all');
});

// ---------------------------------------------------------- the product ----
async function productRoutes(): Promise<RouteEntry[]> {
  // The router reads the build constant at load time; true includes the test
  // hooks, so the table checked here is the larger of the two builds.
  (globalThis as { __TEST_HOOKS__?: boolean }).__TEST_HOOKS__ = true;
  const { app } = await import('../../src/app.ts');
  return app.routes as RouteEntry[];
}

test('role guard: every route that changes data or serves an admin or publisher page is behind its role gate', async () => {
  const routes = await productRoutes();
  const handlers = routes.filter((r) => !isMiddleware(r));
  assert.ok(handlers.length >= 20, `expected the product's routes, found ${handlers.length}`);
  const publishWrites = handlers.filter((r) => WRITE_METHODS.has(r.method) && under(r.path, '/s/:spaceId/publish'));
  assert.ok(publishWrites.length >= 1, 'the publisher\'s editing routes exist under /s/:spaceId/publish (so this check is meaningful)');
  for (const g of GATES) {
    assert.ok(routes.some((r) => isMiddleware(r) && r.path === g.gate), `the gate ${g.gate} is registered`);
  }
  assert.deepEqual(ungated(routes), [], 'register role routes under their gated prefix, after the gate');
});

// ------------------------------------------------------- live sweep ----
const SPACE = 'مدرسة مسك';
const ADMIN = { display_name: 'Amal Hassan', username: 'amal.admin', password: 'admin-first-pass', mobile: '01012345678' };
const people = {
  hadeer: { username: 'hadeer', password: 'hadeer-first-pass', display_name: 'Hadeer', mobile: '01022223333', role: 'publisher' as const },
  salma: { username: 'salma.learner', password: 'salma-first-pass', display_name: 'Salma', mobile: '01033334444', role: 'learner' as const },
};

let worker: RunningWorker;
let spaceId = '';
let ids: Record<string, string> = {};

/** The route's address with real ids in place of its parameters. */
function address(path: string): string {
  return path
    .replace(':spaceId', spaceId)
    .replace(/:([A-Za-z]+)/g, (_, name: string) => ids[name] ?? 'no-such-id')
    .replace(/\/\*$/, '');
}

describe('role guard: in the running product, every gated route refuses people without the role', { concurrency: false }, () => {
  before(async () => {
    worker = await startWorker();
    const owner = await setUpOwner(worker.url);
    spaceId = await createSpace(owner, { name: SPACE, kit: 'school' });
    await appointAdmin(owner, spaceId, { ...ADMIN, valid_until: utcDatePlusDays(60) });
    const s = await seed(worker.url, {
      spaceId,
      grantedBy: ADMIN.username,
      people: [{ ...people.hadeer, valid_until: utcDatePlusDays(60) }, { ...people.salma, valid_until: utcDatePlusDays(60) }],
      subjects: [{
        title: 'Mathematics', publisher: 'hadeer', published: true, users: ['salma.learner'],
        chapters: [{ title: 'Fractions', lessons: [{ title: 'Adding fractions', materials: [
          { kind: 'pdf', title: 'Worksheet', base64: b64(tinyPdf()), contentType: 'application/pdf' },
          { kind: 'image', title: 'Pizza', base64: b64(tinyPng()), contentType: 'image/png' },
        ] }] }],
      }],
    });
    const subject = s.subjects.Mathematics;
    const lesson = subject.chapters.Fractions.lessons['Adding fractions'];
    ids = { subjectId: subject.id, chapterId: subject.chapters.Fractions.id, lessonId: lesson.id, materialId: lesson.materials.Worksheet, id: spaceId };
  });

  after(async () => {
    await worker?.stop();
  });

  it('a learner (who may read the subject) is refused on every admin, publisher and owner route, by every method, with real ids', async () => {
    const routes = (await productRoutes()).filter((r) => !isMiddleware(r) && GATES.some((g) => under(r.path, g.prefix)));
    assert.ok(routes.some((r) => r.method === 'POST' && under(r.path, '/s/:spaceId/publish')), 'publisher writes are in the sweep');
    const learner = await signedIn(worker.url, people.salma.username, people.salma.password);
    // Positive control: the learner reads the subject these ids belong to.
    assert.equal((await learner.get(`/s/${spaceId}/learn/${ids.subjectId}`)).status, 200, 'the learner reads the subject');
    const publisher = await signedIn(worker.url, people.hadeer.username, people.hadeer.password);
    const admin = await signedIn(worker.url, ADMIN.username, ADMIN.password);
    for (const r of routes) {
      const path = address(r.path);
      const send = (c: typeof learner) => (r.method === 'GET' ? c.get(path) : c.post(path, { title: 'x', direction: 'up', kind: 'note', text: 'x' }));
      assert.equal((await send(learner)).status, 403, `${r.method} ${r.path} refused for a learner`);
      if (under(r.path, '/s/:spaceId/publish')) {
        assert.equal((await send(admin)).status, 403, `${r.method} ${r.path} refused for an admin (not a publisher)`);
      }
      if (under(r.path, '/s/:spaceId/admin') || under(r.path, '/owner')) {
        assert.equal((await send(publisher)).status, 403, `${r.method} ${r.path} refused for a publisher`);
      }
    }
  });
});
