// AT-2 guard: failed sign-ins are rate-limited, and access starts on its
// start date (two items carried into task 4).
//
// 1. Rate limit. Failed sign-ins and failed reset-link usernames are counted
//    per username and per client. Five failures for one username refuse that
//    username for 15 minutes from the first failure; fifty failures from one
//    client refuse that client for an hour. A refused attempt checks no
//    password and writes nothing, so a flood cannot spend the free plan's
//    daily database writes; a success clears that username's count.
// 2. valid_from. A membership counts from its start date as well as up to its
//    end date: before it starts, the space answers 403 with a plain message.
//
// People here come from the test seeding route (only what this guard needs);
// the admin's screens are covered by AT-2 itself.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startWorker, type RunningWorker } from '../support/worker.ts';
import { Client, setClockOffsetMs, setClockTo, workerNow } from '../support/http.ts';
import { appointAdmin, createSpace, seed, setUpOwner, signedIn } from '../support/seed.ts';
import { issueLink, userIdOf } from '../support/admin.ts';

const SPACE = 'مدرسة مسك';
const ADMIN = { display_name: 'Amal Hassan', username: 'amal.admin', password: 'admin-first-pass', mobile: '01012345678' };
const person = (username: string, role: 'publisher' | 'learner', mobile: string) => ({ username, password: `${username}-pass`, display_name: username, mobile, role });
const SALMA = person('salma', 'learner', '01033334444');
const OMAR = person('omar', 'learner', '01055556666');
const HADEER = person('hadeer', 'publisher', '01022223333');
const MIN = 60_000;
const TOO_MANY = 'Too many failed attempts.';
// The words of a page as a reader sees them: tags removed (inline marks such as <bdi> add no space), spaces collapsed.
const text = (html: string) => html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ');

let worker: RunningWorker;
let spaceId = '';
let today = '';
const plus = (days: number) => new Date(Date.parse(today + 'T00:00:00Z') + days * 86_400_000).toISOString().slice(0, 10);

async function attempt(username: string, password: string): Promise<{ status: number; body: string }> {
  const res = await new Client(worker.url).post('/signin', { username, password });
  return { status: res.status, body: text(await res.text()) };
}

async function limitRows(): Promise<Record<string, unknown>[]> {
  return worker.sql('SELECT key, window_start, failures FROM attempt_limit ORDER BY key');
}

describe('AT-2 guard: failed sign-ins are rate-limited and access starts on its start date', { concurrency: false }, () => {
  before(async () => {
    worker = await startWorker();
    today = new Date(await workerNow(worker.url)).toISOString().slice(0, 10);
    const owner = await setUpOwner(worker.url);
    spaceId = await createSpace(owner, { name: SPACE, kit: 'school' });
    await appointAdmin(owner, spaceId, { ...ADMIN, valid_until: plus(60) });
    await seed(worker.url, {
      spaceId,
      grantedBy: ADMIN.username,
      people: [SALMA, OMAR, HADEER].map((p) => ({ ...p, valid_until: plus(30) })),
    });
  });

  after(async () => {
    if (worker) await setClockOffsetMs(worker.url, 0).catch(() => undefined);
    await worker?.stop();
  });

  it('five failed sign-ins for one username refuse it, even with the right password, until 15 minutes after the first', async () => {
    for (let i = 1; i <= 5; i++) assert.equal((await attempt(SALMA.username, `wrong-${i}`)).status, 401, `failure ${i}`);
    const refused = await attempt(SALMA.username, SALMA.password);
    assert.equal(refused.status, 429, 'the sixth attempt is refused');
    assert.ok(refused.body.includes(TOO_MANY), 'with a plain message');
    assert.ok(!refused.body.includes('not correct'), 'and without saying whether the password was right');
    assert.equal((await attempt(HADEER.username, HADEER.password)).status, 302, 'another username from the same client still signs in');
    assert.equal((await setClockOffsetMs(worker.url, 14 * MIN)).status, 200);
    assert.equal((await attempt(SALMA.username, SALMA.password)).status, 429, 'still refused after 14 minutes');
    assert.equal((await setClockOffsetMs(worker.url, 15 * MIN + 1000)).status, 200);
    assert.equal((await attempt(SALMA.username, SALMA.password)).status, 302, 'open again after 15 minutes');
  });

  it('a refused attempt writes nothing; a success clears the username\'s count', async () => {
    for (let i = 1; i <= 5; i++) await attempt(OMAR.username, `wrong-${i}`);
    const blocked = await limitRows();
    const omarKey = blocked.find((r) => r.key === 'u:omar');
    assert.ok(omarKey && Number(omarKey.failures) === 5, 'five failures are counted for the username');
    for (let i = 0; i < 5; i++) assert.equal((await attempt(OMAR.username, `still-wrong-${i}`)).status, 429);
    assert.deepEqual(await limitRows(), blocked, 'refused attempts changed no stored count');

    assert.equal((await setClockOffsetMs(worker.url, 31 * MIN)).status, 200);
    for (let i = 1; i <= 3; i++) assert.equal((await attempt(OMAR.username, `again-${i}`)).status, 401);
    assert.equal((await attempt(OMAR.username, OMAR.password)).status, 302, 'a success after three failures');
    assert.ok(!(await limitRows()).some((r) => r.key === 'u:omar'), 'clears the username\'s count');
    for (let i = 1; i <= 4; i++) assert.equal((await attempt(OMAR.username, `later-${i}`)).status, 401);
    assert.equal((await attempt(OMAR.username, OMAR.password)).status, 302, 'four new failures do not refuse it');
  });

  it('failed usernames on a reset link count for the link\'s person and for the client', async () => {
    assert.equal((await setClockOffsetMs(worker.url, 60 * MIN)).status, 200);
    const admin = await signedIn(worker.url, ADMIN.username, ADMIN.password);
    const salmaId = await userIdOf(worker, SALMA.username);
    const l = await issueLink(admin, `/s/${spaceId}/admin/people/${salmaId}`);
    assert.equal(l.status, 200, 'the admin makes a link for Salma');
    const path = new URL(l.link).pathname;
    for (let i = 1; i <= 5; i++) {
      assert.equal((await new Client(worker.url).post(path, { username: `guess-${i}`, new_password: 'guessed-pass' })).status, 401);
    }
    assert.equal(Number((await limitRows()).find((r) => r.key === 'u:salma')?.failures), 5, 'counted for Salma');
    assert.equal((await attempt(SALMA.username, SALMA.password)).status, 429, 'so Salma\'s own sign-in is slowed too');
    const fresh = await issueLink(admin, `/s/${spaceId}/admin/people/${salmaId}`);
    const blocked = await new Client(worker.url).post(new URL(fresh.link).pathname, { username: SALMA.username, new_password: 'salma-new-pass' });
    assert.equal(blocked.status, 429, 'and a fresh link waits for the same 15 minutes');
    assert.ok(text(await blocked.text()).includes('محاولات فاشلة كثيرة'), 'with the plain message in the space\'s language');
  });

  it('a membership that has not started yet does not open the space; it opens on its start date', async () => {
    // Seeded memberships start today (the Worker's today). Yesterday at noon, they have not started.
    assert.equal((await setClockTo(worker.url, Date.parse(today + 'T00:00:00Z') - 12 * 60 * MIN)).status, 200);
    const hadeer = await signedIn(worker.url, HADEER.username, HADEER.password);
    const early = await hadeer.get(`/s/${spaceId}`);
    assert.equal(early.status, 403, 'refused before the start date');
    const body = text(await early.text());
    assert.ok(body.includes(`يبدأ وصولك إلى ${SPACE} في ${today}.`), 'with a plain message in the space\'s first language');
    assert.ok(body.includes(`Your access to ${SPACE} starts on ${today}.`), 'and in its second');
    assert.equal((await hadeer.get(`/s/${spaceId}/learn/x`)).status, 403, 'every address in the space');
    assert.equal((await setClockTo(worker.url, Date.parse(today + 'T00:00:00Z') + 60 * MIN)).status, 200);
    assert.equal((await hadeer.get(`/s/${spaceId}`)).status, 200, 'open from the first hour of the start date');
  });

  it('fifty failed sign-ins from one client refuse every username from that client for an hour; the stored key is not the address', async () => {
    assert.equal((await setClockOffsetMs(worker.url, 120 * MIN)).status, 200);
    // Every earlier window is over by now, so the client's count starts again.
    for (let i = 0; i < 50; i++) assert.equal((await attempt(`nobody-${i}`, 'whatever-pass')).status, 401, `failure ${i + 1}`);
    const refused = await attempt(HADEER.username, HADEER.password);
    assert.equal(refused.status, 429, 'the right password from the same client is refused');
    const rows = await limitRows();
    const client = rows.filter((r) => String(r.key).startsWith('c:'));
    assert.equal(client.length, 1, 'one key for this client');
    assert.match(String(client[0].key), /^c:[0-9a-f]{16,}$/, 'a hash, not the address');
    assert.ok(!JSON.stringify(rows).includes('127.0.0.1'));
    assert.equal((await setClockOffsetMs(worker.url, 120 * MIN + 59 * MIN)).status, 200);
    assert.equal((await attempt(HADEER.username, HADEER.password)).status, 429, 'still refused within the hour');
    assert.equal((await setClockOffsetMs(worker.url, 120 * MIN + 60 * MIN + 1000)).status, 200);
    assert.equal((await attempt(HADEER.username, HADEER.password)).status, 302, 'open again after the hour');
  });
});
