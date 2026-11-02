// Hardening task H-1 (docs/09-CONTRACT-R1.1.md section 4): the sign-in re-hash
// against a concurrent password change. The newer password always wins.
//
// A sign-in reads the stored hash, checks the typed password against it, and,
// when the hash was made at another strength than the configured one, writes
// it again at the configured strength (src/auth/password.ts rehashIfNeeded);
// then it writes the session. A password change (a reset link, the admin's
// "set password", the person's own change on My account) can land between any
// two of those steps. Whatever the moment:
// - the stored hash is the one the change wrote: the re-hash never overwrites it;
// - the new password works and the old one does not, now or later;
// - the sign-in that typed the old password is not signed in afterwards.
//
// Driven through the product's real router and forms (test/support/in-process.ts):
// the change is made at an exact database statement of the racing sign-in, for
// each of four moments and each of the three ways to change a password. The
// person's stored hash is made at 20,000 iterations while the product runs at
// 10,000, so every sign-in here re-writes it.
//
// Self-check: the same race against a deliberately broken re-hash (its "only
// if the stored hash is still the checked one" condition removed) must fail
// these checks, so they can see the fault they guard against.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Client, utcDatePlusDays } from '../support/http.ts';
import { appointAdmin, createSpace, setUpOwner, signedIn } from '../support/seed.ts';
import { issueLink } from '../support/admin.ts';
import { startInProcess, type InProcessWorker, type StatementHooks } from '../support/in-process.ts';
import { hashPassword, verifyPassword } from '../../src/auth/password.ts';

const CONFIGURED = 10_000;
const STORED_AT = 20_000;
const OLD = 'omar-old-pass-2026';
const NEW = 'omar-new-pass-2026';
const ADMIN = { display_name: 'Amal Hassan', username: 'amal.admin', password: 'admin-first-pass', mobile: '01012345678' };
const OMAR = { display_name: 'Omar', username: 'omar', role: 'learner', mobile: '01055556666' };

const REHASH_WRITE = 'UPDATE user SET password_hash = ? WHERE id = ? AND password_hash = ?';
const SIGN_IN_READ = 'SELECT id, password_hash FROM user WHERE username = ?';
const SESSION_WRITE = /^\s*INSERT INTO session\b/;

type Change = 'reset link' | 'admin sets the password' | 'own change on My account';
const CHANGES: Change[] = ['reset link', 'admin sets the password', 'own change on My account'];

interface Moment {
  name: string;
  when: 'before' | 'after';
  matches(sql: string): boolean;
}
const MOMENTS: Moment[] = [
  { name: 'after the sign-in read the stored hash', when: 'after', matches: (s) => s.trim() === SIGN_IN_READ },
  { name: 'just before the re-hash write', when: 'before', matches: (s) => s.trim() === REHASH_WRITE },
  { name: 'after the re-hash, just before the session write', when: 'before', matches: (s) => SESSION_WRITE.test(s) },
  { name: 'just after the session write', when: 'after', matches: (s) => SESSION_WRITE.test(s) },
];

interface Observed {
  fired: boolean;
  changedTo: string;
  stored: string;
  newWorks: boolean;
  oldWorks: boolean;
  racerSignedIn: boolean;
  oldSignInLater: number;
  newSignInLater: number;
  /** The probe below, on a client that really signed in (so a "not signed in" means something). */
  probeSeesSignIn: boolean;
}

/** Signed in: /home does not send the client to the sign-in page. */
async function isSignedIn(c: Client): Promise<boolean> {
  const res = await c.get('/home');
  return !(res.status === 302 && new URL(res.headers.get('location') ?? '', 'http://x').pathname === '/signin');
}

const storedHash = (w: InProcessWorker) =>
  String((w.sqlite.prepare('SELECT password_hash FROM user WHERE username = ?').get(OMAR.username) as { password_hash: string }).password_hash);

/** One race: Omar signs in with the old password while `change` sets the new one at `moment`. */
async function race(change: Change, moment: Moment, broken = false): Promise<Observed> {
  const w = await startInProcess({ PASSWORD_ITERATIONS: String(CONFIGURED) });
  try {
    const owner = await setUpOwner(w.url);
    const spaceId = await createSpace(owner, { name: 'Mesk School', kit: 'school' });
    await appointAdmin(owner, spaceId, { ...ADMIN, valid_until: utcDatePlusDays(60) });
    const admin = await signedIn(w.url, ADMIN.username, ADMIN.password);
    const appointed = await admin.post(`/s/${spaceId}/admin/people`, { ...OMAR, password: OLD, valid_until: utcDatePlusDays(30) });
    assert.equal(appointed.status, 303, 'Omar appointed');
    const userId = String((w.sqlite.prepare('SELECT id FROM user WHERE username = ?').get(OMAR.username) as { id: string }).id);
    const personPath = `/s/${spaceId}/admin/people/${userId}`;
    // Omar's phone, already signed in (for the own change).
    const phone = await signedIn(w.url, OMAR.username, OLD);
    const link = change === 'reset link' ? await issueLink(admin, personPath) : null;
    if (link) assert.equal(link.status, 200, 'reset link issued');
    // Omar's stored hash, made at another strength: the next sign-in re-writes it.
    w.sqlite.prepare('UPDATE user SET password_hash = ? WHERE username = ?').run(await hashPassword(OLD, STORED_AT), OMAR.username);

    const changePassword = async () => {
      const res = change === 'reset link'
        ? await new Client(w.url).post(`/r/${link!.token}`, { username: OMAR.username, new_password: NEW })
        : change === 'admin sets the password'
          ? await admin.post(`${personPath}/password`, { new_password: NEW })
          : await phone.post('/account/password', { current_password: OLD, new_password: NEW });
      assert.equal(res.status, 200, `${change}: the password change is accepted`);
    };

    let fired = false;
    let changedTo = '';
    const step = async (sql: string) => {
      if (fired || !moment.matches(sql)) return;
      fired = true;
      w.setHooks({ rewrite: hooks.rewrite }); // the change itself runs straight through
      await changePassword();
      changedTo = storedHash(w);
    };
    const hooks: StatementHooks = {
      [moment.when]: step,
      // The self-check's broken product: the re-hash writes whatever the stored hash is.
      rewrite: (sql, params) =>
        broken && sql.trim() === REHASH_WRITE ? ['UPDATE user SET password_hash = ? WHERE id = ?', params.slice(0, 2)] : [sql, params],
    };
    w.setHooks(hooks);
    const racer = new Client(w.url);
    await racer.post('/signin', { username: OMAR.username, password: OLD });
    w.setHooks({});
    await w.settle();

    const stored = storedHash(w);
    const later = new Client(w.url);
    const newSignInLater = (await later.post('/signin', { username: OMAR.username, password: NEW })).status;
    return {
      fired,
      changedTo,
      stored,
      newWorks: await verifyPassword(NEW, stored),
      oldWorks: await verifyPassword(OLD, stored),
      racerSignedIn: await isSignedIn(racer),
      oldSignInLater: (await new Client(w.url).post('/signin', { username: OMAR.username, password: OLD })).status,
      newSignInLater,
      probeSeesSignIn: await isSignedIn(later),
    };
  } finally {
    w.stop();
  }
}

function assertNewerWins(o: Observed, where: string): void {
  assert.ok(o.fired, `${where}: the change was made at that moment of the sign-in (the race happened)`);
  assert.ok(o.probeSeesSignIn, `${where}: the sign-in probe sees a real sign-in (check is meaningful)`);
  assert.equal(o.stored, o.changedTo, `${where}: the stored hash is the one the change wrote (the re-hash did not overwrite it)`);
  assert.ok(o.newWorks, `${where}: the new password works`);
  assert.ok(!o.oldWorks, `${where}: the old password no longer works`);
  assert.ok(!o.racerSignedIn, `${where}: the sign-in that typed the old password is not signed in afterwards`);
  assert.equal(o.oldSignInLater, 401, `${where}: signing in later with the old password fails`);
  assert.equal(o.newSignInLater, 302, `${where}: signing in later with the new password works`);
}

describe('re-hash race: a password change during a sign-in re-hash always wins', { concurrency: false }, () => {
  for (const change of CHANGES) {
    for (const moment of MOMENTS) {
      it(`${change}, ${moment.name}`, async () => {
        assertNewerWins(await race(change, moment), `${change}, ${moment.name}`);
      });
    }
  }

  it('without a race, the sign-in re-writes the hash at the configured strength (the re-hash path is exercised)', async () => {
    const w = await startInProcess({ PASSWORD_ITERATIONS: String(CONFIGURED) });
    try {
      const owner = await setUpOwner(w.url);
      const spaceId = await createSpace(owner, { name: 'Mesk School', kit: 'school' });
      await appointAdmin(owner, spaceId, { ...ADMIN, valid_until: utcDatePlusDays(60) });
      const before = await hashPassword(ADMIN.password, STORED_AT);
      w.sqlite.prepare('UPDATE user SET password_hash = ? WHERE username = ?').run(before, ADMIN.username);
      await signedIn(w.url, ADMIN.username, ADMIN.password);
      const after = String((w.sqlite.prepare('SELECT password_hash FROM user WHERE username = ?').get(ADMIN.username) as { password_hash: string }).password_hash);
      assert.notEqual(after, before, 'the hash was re-written');
      assert.equal(Number(after.split('$')[1]), CONFIGURED, 'at the configured strength');
      assert.ok(await verifyPassword(ADMIN.password, after), 'the same password still works');
    } finally {
      w.stop();
    }
  });

  it('self-check: against a re-hash that overwrites whatever is stored, these checks fail', async () => {
    const o = await race('reset link', MOMENTS[1], true);
    assert.ok(o.fired, 'the race happened against the broken re-hash');
    assert.throws(() => assertNewerWins(o, 'broken re-hash'), assert.AssertionError, 'the broken re-hash must be caught');
    assert.ok(o.oldWorks, 'the broken re-hash put the old password back (what the guard exists to stop)');
  });
});
