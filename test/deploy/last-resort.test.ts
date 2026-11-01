// Deploy rails: the owner's last-resort reset, walked end to end against the
// local emulation of the production build (no Cloudflare account).
//
// The owner has lost both the password and the recovery code. The script
// (scripts/owner-last-resort.mjs) is run exactly as the owner would run it; the
// SQL inside the one command it prints is run against the local database (the
// owner runs the same text with --remote); then the product's own /recover page
// accepts the new code once, the old code is dead, and every old sign-in ends.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startWorker, type RunningWorker } from '../support/worker.ts';
import { Client } from '../support/http.ts';
import { OWNER } from '../support/seed.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));
const CODE = /\b[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}\b/g;

let worker: RunningWorker;

const recoveryCodeOn = (html: string) => html.match(/id="recovery-code"[^>]*>([^<]+)</)?.[1]?.trim();

describe('Deploy rails: the owner\'s last-resort reset works on the local database', { concurrency: false }, () => {
  before(async () => {
    worker = await startWorker({ production: true });
  });
  after(async () => {
    await worker?.stop();
  });

  it('the printed command, run against the local database, lets /recover accept the new code once; the old code dies and old sign-ins end', async () => {
    // First setup: the owner is signed in on two browsers and was shown a code.
    const first = new Client(worker.url);
    const setup = await first.post('/setup', OWNER);
    assert.equal(setup.status, 200, 'owner setup');
    const oldCode = recoveryCodeOn(await setup.text());
    assert.ok(oldCode, 'the setup page shows the first recovery code');
    const second = await (async () => {
      const c = new Client(worker.url);
      assert.equal((await c.post('/signin', { username: OWNER.username, password: OWNER.password })).status, 302);
      return c;
    })();
    for (const c of [first, second]) assert.equal((await c.get('/owner')).status, 200, 'signed in before the reset');

    // The owner runs the script on their own computer.
    const out = execFileSync(process.execPath, ['scripts/owner-last-resort.mjs'], { cwd: root, encoding: 'utf8' });
    const codes = out.match(CODE) ?? [];
    assert.equal(codes.length, 1, `the new code is printed exactly once:\n${out}`);
    const newCode = codes[0];
    const commandLines = out.split('\n').filter((l) => l.includes('wrangler d1 execute'));
    assert.equal(commandLines.length, 1, 'exactly one command is printed');
    const command = commandLines[0].trim();
    const m = /^npx wrangler d1 execute lms-lego --remote --command "([^"]+)"$/.exec(command);
    assert.ok(m, `the command targets the live database by name: ${command}`);
    const sql = m[1];
    assert.ok(!sql.includes(newCode) && !sql.includes(newCode.replace(/-/g, '')), 'only the hash travels, never the code');

    // The same SQL, run against the local database (the owner runs it with --remote).
    const results = await worker.sqlAll(sql);
    assert.deepEqual(results.at(-1), [{ username: OWNER.username }], 'the command shows the owner\'s username');
    const users = await worker.sql('SELECT COUNT(*) AS n FROM user');
    assert.equal(Number(users[0].n), 1, 'no account was added');

    // The old code is dead.
    const anyone = new Client(worker.url);
    const stale = await anyone.post('/recover', { username: OWNER.username, code: oldCode!, password: 'never-this-one' });
    assert.equal(stale.status, 401, 'the old recovery code is refused');

    // The new code works on the normal /recover page, once.
    const owner = new Client(worker.url);
    const recovered = await owner.post('/recover', { username: OWNER.username, code: newCode, password: 'owner-pass-after-reset' });
    assert.equal(recovered.status, 200, '/recover accepts the new code');
    const further = recoveryCodeOn(await recovered.text());
    assert.ok(further && further !== newCode, 'and shows a further new code to keep on paper');
    assert.equal((await owner.get('/owner')).status, 200, 'the owner is signed in');
    const again = await new Client(worker.url).post('/recover', { username: OWNER.username, code: newCode, password: 'someone-else-pass' });
    assert.equal(again.status, 401, 'the new code works only once');

    // Every old sign-in has ended; the new password signs in; /setup stays closed.
    for (const c of [first, second]) {
      const res = await c.get('/owner');
      assert.equal(res.status, 302, 'an old sign-in has ended');
      assert.equal(new URL(res.headers.get('location')!, worker.url).pathname, '/signin');
    }
    const fresh = new Client(worker.url);
    assert.equal((await fresh.post('/signin', { username: OWNER.username, password: 'owner-pass-after-reset' })).status, 302, 'the new password signs in');
    assert.equal((await fresh.get('/owner')).status, 200);
    assert.equal((await new Client(worker.url).post('/setup', { ...OWNER, username: 'intruder' })).status, 403, '/setup is not reopened');
  });
});
