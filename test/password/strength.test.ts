// Build task 7: password strength as a setting, stored per password, upgraded
// at sign-in, default unchanged. Against the running Worker (Wrangler +
// workerd, local D1), through the product's real forms.
//
// The Worker here is configured at Y = 20,000 iterations (wrangler dev --var
// PASSWORD_ITERATIONS:20000). People whose stored hash was made at another
// strength X (100,000, the strength of every hash written before this task,
// and 10,000, the floor) are given that hash directly in the database, made by
// the product's own hashing code. Then:
// 1. every password the product writes (owner setup, appointing an admin or a
//    person, a password set by the appointer, change own password) is stored
//    at Y;
// 2. a successful sign-in re-writes a hash made at X once, at Y; a second
//    sign-in writes nothing (a re-write always draws a fresh salt, so an
//    identical stored value proves nothing was written); the old password
//    still works and a wrong one still fails, and a failure writes no hash;
// 3. the same holds on the reset-link and recovery-code paths, which end with
//    a known (new) password: it is stored at Y, and the next sign-in writes
//    nothing;
// 4. a setting outside the floor and ceiling refuses to serve at all;
// 5. the production build, with its own configuration, stores passwords at
//    the configured production strength (test/guards/production-guard.test.ts
//    asserts that this strength is 100,000).
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startWorker, type RunningWorker } from '../support/worker.ts';
import { Client, workerNow } from '../support/http.ts';
import { OWNER, appointAdmin, createSpace, setUpOwner, signedIn } from '../support/seed.ts';
import { appointPerson, issueLink, userIdOf } from '../support/admin.ts';
import { hashPassword, verifyPassword } from '../../src/auth/password.ts';

const Y = 20_000;
// Written by the code on main before build task 7 (552409e) for this password.
const WRITTEN_BEFORE = { password: 'written-before-task-7', hash: 'pbkdf2-sha256$100000$kBUYJ6Apq0J3zuuu7GZZkw$qo3TNXhowWVZMXhznE0PqhLtIkqDX3Re2jB8m4eLGPY' };
const ADMIN = { display_name: 'Amal Hassan', username: 'amal.admin', password: 'admin-first-pass', mobile: '01012345678' };
const person = (username: string, role: 'publisher' | 'learner', mobile: string) =>
  ({ display_name: username, username, password: `${username}-first-pass`, role, mobile });
const SALMA = person('salma', 'learner', '01033334444');
const OMAR = person('omar', 'learner', '01055556666');
const HADEER = person('hadeer', 'publisher', '01022223333');
const SHIMAA = person('shimaa', 'publisher', '01066667777');

const iterationsOf = (stored: string) => Number(stored.split('$')[1]);

function readConfig(): any {
  const text = readFileSync(new URL('../../wrangler.jsonc', import.meta.url), 'utf8');
  return JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
}

let worker: RunningWorker;
let spaceId = '';
let recoveryCode = '';
let admin: Client;
const running: RunningWorker[] = [];

async function storedHash(username: string): Promise<string> {
  const rows = await worker.sql(`SELECT password_hash FROM user WHERE username = '${username}'`);
  assert.equal(rows.length, 1, `user ${username}`);
  return String(rows[0].password_hash);
}

/** Gives a person a hash made elsewhere (at another strength), straight into the database. */
async function giveHash(username: string, hash: string): Promise<void> {
  await worker.sql(`UPDATE user SET password_hash = '${hash}' WHERE username = '${username}'`);
  assert.equal(await storedHash(username), hash);
}

async function signIn(username: string, password: string): Promise<number> {
  return (await new Client(worker.url).post('/signin', { username, password })).status;
}

/** After a password was re-written at Y: it signs in, writes nothing more, and a wrong one fails. */
async function settledAtY(username: string, password: string, old?: string): Promise<void> {
  const settled = await storedHash(username);
  assert.equal(iterationsOf(settled), Y, `${username}: stored at the configured strength`);
  assert.equal(await verifyPassword(password, settled), true, `${username}: the stored hash is of the right password`);
  assert.equal(await signIn(username, password), 302, `${username}: the password signs in`);
  assert.equal(await storedHash(username), settled, `${username}: a sign-in at the configured strength writes nothing`);
  assert.equal(await signIn(username, `${password}-wrong`), 401, `${username}: a wrong password still fails`);
  if (old) assert.equal(await signIn(username, old), 401, `${username}: the replaced password no longer signs in`);
  assert.equal(await storedHash(username), settled, `${username}: a failure writes no hash`);
}

describe('Password strength: stored per password, re-written at the configured strength on sign-in', { concurrency: false }, () => {
  before(async () => {
    worker = await startWorker({ vars: { PASSWORD_ITERATIONS: String(Y) } });
    running.push(worker);
    const today = new Date(await workerNow(worker.url)).toISOString().slice(0, 10);
    const plus = (days: number) => new Date(Date.parse(today + 'T00:00:00Z') + days * 86_400_000).toISOString().slice(0, 10);
    const ownerClient = new Client(worker.url);
    const setup = await ownerClient.post('/setup', OWNER);
    assert.equal(setup.status, 200, 'owner setup');
    recoveryCode = (await setup.text()).match(/id="recovery-code"[^>]*>([^<]+)</)?.[1]?.trim() ?? '';
    assert.ok(recoveryCode, 'the recovery code is shown at setup');
    spaceId = await createSpace(ownerClient, { name: 'Mesk School', kit: 'school' });
    await appointAdmin(ownerClient, spaceId, { ...ADMIN, valid_until: plus(60) });
    admin = await signedIn(worker.url, ADMIN.username, ADMIN.password);
    for (const p of [SALMA, OMAR, HADEER, SHIMAA]) await appointPerson(worker, admin, spaceId, { ...p, valid_until: plus(30) });
  });

  after(async () => {
    for (const w of running) await w.stop();
  });

  it('every password the product writes is stored at the configured strength', async () => {
    for (const username of [OWNER.username, ADMIN.username, SALMA.username, OMAR.username, HADEER.username, SHIMAA.username]) {
      assert.equal(iterationsOf(await storedHash(username)), Y, `${username}: owner setup or appointment stores at ${Y}`);
    }
    const omarId = await userIdOf(worker, OMAR.username);
    const set = await admin.post(`/s/${spaceId}/admin/people/${omarId}/password`, { new_password: 'omar-set-by-admin' });
    assert.equal(set.status, 200, 'the admin sets Omar\'s password');
    assert.equal(iterationsOf(await storedHash(OMAR.username)), Y, 'a password set by the appointer is stored at the configured strength');
    const shimaa = await signedIn(worker.url, SHIMAA.username, SHIMAA.password);
    const changed = await shimaa.post('/account/password', { current_password: SHIMAA.password, new_password: 'shimaa-own-new-pass' });
    assert.equal(changed.status, 200, 'Shimaa changes her own password');
    await settledAtY(SHIMAA.username, 'shimaa-own-new-pass', SHIMAA.password);
  });

  it('sign-in re-writes a hash written before this task (100,000) once, at the configured strength (downgrade)', async () => {
    await giveHash(SALMA.username, WRITTEN_BEFORE.hash);
    assert.equal(await signIn(SALMA.username, 'not-her-password'), 401, 'a wrong password fails');
    assert.equal(await storedHash(SALMA.username), WRITTEN_BEFORE.hash, 'and writes no hash');
    assert.equal(await signIn(SALMA.username, WRITTEN_BEFORE.password), 302, 'the old password signs in');
    const rewritten = await storedHash(SALMA.username);
    assert.notEqual(rewritten, WRITTEN_BEFORE.hash, 'the stored hash was re-written');
    await settledAtY(SALMA.username, WRITTEN_BEFORE.password);
  });

  it('sign-in re-writes a hash made at the floor (10,000) once, at the configured strength (upgrade)', async () => {
    const atFloor = await hashPassword('omar-floor-pass', 10_000);
    await giveHash(OMAR.username, atFloor);
    assert.equal(await signIn(OMAR.username, 'omar-floor-pazz'), 401, 'a wrong password fails');
    assert.equal(await storedHash(OMAR.username), atFloor, 'and writes no hash');
    assert.equal(await signIn(OMAR.username, 'omar-floor-pass'), 302, 'the old password signs in');
    assert.notEqual(await storedHash(OMAR.username), atFloor, 'the stored hash was re-written');
    await settledAtY(OMAR.username, 'omar-floor-pass');
  });

  it('a reset link stores the new password at the configured strength; the next sign-in writes nothing', async () => {
    await giveHash(HADEER.username, await hashPassword(HADEER.password, 100_000));
    const hadeerId = await userIdOf(worker, HADEER.username);
    const issued = await issueLink(admin, `/s/${spaceId}/admin/people/${hadeerId}`);
    assert.equal(issued.status, 200, 'the admin makes a reset link for Hadeer');
    const used = await new Client(worker.url).post(new URL(issued.link).pathname, { username: HADEER.username, new_password: 'hadeer-reset-pass' });
    assert.equal(used.status, 200, 'Hadeer sets a new password from the link');
    await settledAtY(HADEER.username, 'hadeer-reset-pass', HADEER.password);
  });

  it('the recovery code stores the new password at the configured strength; the next sign-in writes nothing', async () => {
    await giveHash(OWNER.username, await hashPassword(OWNER.password, 100_000));
    const recovered = await new Client(worker.url).post('/recover', { username: OWNER.username, code: recoveryCode, password: 'owner-recovered-pass' });
    assert.equal(recovered.status, 200, 'the owner recovers with the code');
    await settledAtY(OWNER.username, 'owner-recovered-pass', OWNER.password);
  });

  it('an unknown username fails like a wrong password', async () => {
    assert.equal(await signIn('nobody.here', 'any-password-at-all'), 401);
  });
});

describe('Password strength: the setting itself', { concurrency: false }, () => {
  const started: RunningWorker[] = [];
  after(async () => {
    for (const w of started) await w.stop();
  });

  it('a setting below the floor refuses to serve: every request answers 500, nothing is stored, and the log says why', async () => {
    const w = await startWorker({ vars: { PASSWORD_ITERATIONS: '9999' } });
    started.push(w);
    assert.equal((await fetch(w.url + '/', { redirect: 'manual' })).status, 500, 'GET / refused');
    const setup = await new Client(w.url).post('/setup', OWNER);
    assert.equal(setup.status, 500, 'owner setup refused');
    assert.deepEqual(await w.sql('SELECT username FROM user'), [], 'no account was made at a strength nobody chose');
    assert.match(w.log(), /PASSWORD_ITERATIONS/, 'the Worker log names the setting');
  });

  it('the production build stores passwords at the strength its own configuration states', async () => {
    const configured = Number(readConfig().vars?.PASSWORD_ITERATIONS);
    assert.ok(Number.isInteger(configured), 'production configuration states PASSWORD_ITERATIONS');
    const w = await startWorker({ production: true });
    started.push(w);
    await setUpOwner(w.url);
    const rows = await w.sql(`SELECT password_hash FROM user WHERE username = '${OWNER.username}'`);
    assert.equal(iterationsOf(String(rows[0]?.password_hash)), configured, 'the production build hashes at the configured strength');
  });
});
