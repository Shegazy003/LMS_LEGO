// AT-2 guard: reset links are single-use, bound to the username and expire
// (contract 0.3, AT-2 step 5 and the critic's safeguards in section 8).
//
// Against the running Worker (Wrangler + workerd, local D1), through the
// admin's and the owner's real forms, checking status codes and stored rows:
// - the token is random (at least 128 bits), only its hash is stored, and it
//   expires 30 minutes after creation;
// - a wrong username is refused and does not use the link up; the attempts on
//   one link are bounded; the right username sets the password once; a second
//   use is refused; issuing a fresh link kills every older one;
// - setting the password from the link ends every sign-in of that person;
// - only the appointer issues a link or sets a password (the admin for
//   publishers and learners, the owner for admins);
// - the registered number is shown only as its last digits, appears in full
//   only in the confirmation step's wa.me link, and never in the Worker's log;
// - the message is the fixed product text, which the admin cannot change;
// - the reset page shows the space's name and plain instructions in its language.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { startWorker, type RunningWorker } from '../support/worker.ts';
import { Client, setClockOffsetMs, workerNow } from '../support/http.ts';
import { appointAdmin, createSpace, setUpOwner, signedIn } from '../support/seed.ts';
import { appointPerson, issueLink, userIdOf, type IssuedLink } from '../support/admin.ts';

const SPACE = 'مدرسة مسك';
const SPACE_B = 'Delta Logistics';
const ADMIN = { display_name: 'Amal Hassan', username: 'amal.admin', password: 'admin-first-pass', mobile: '01012345678' };
const ADMIN_2 = { display_name: 'Mona Farid', username: 'mona.admin', password: 'admin-two-pass', mobile: '01011112222' };
const ADMIN_B = { display_name: 'Basem Fawzy', username: 'basem.admin', password: 'admin-b-pass', mobile: '01087654321' };
const HADEER = { display_name: 'Hadeer', username: 'hadeer', password: 'hadeer-first-pass', role: 'publisher' as const, mobile: '01022223333' };
const SALMA = { display_name: 'Salma Adel', username: 'salma.learner', password: 'salma-first-pass', role: 'learner' as const, mobile: '01033334444' };
const OMAR = { display_name: 'Omar Nabil', username: 'omar.learner', password: 'omar-first-pass', role: 'learner' as const, mobile: '01055556666' };
const MIN = 60_000;
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const text = (html: string) => html.replace(/<[^>]*>/g, ' ');

let worker: RunningWorker;
let owner: Client;
let admin: Client;
let spaceA = '';
let spaceB = '';
const ids: Record<string, string> = {};
let today = '';

const person = (user: string) => `/s/${spaceA}/admin/people/${ids[user]}`;
const resetPath = (l: IssuedLink) => new URL(l.link).pathname;

async function linkRows(user: string) {
  return worker.sql(`SELECT id, token_hash, created_at, expires_at, used_at, failed_attempts, space_id, created_by FROM reset_link WHERE user_id = '${ids[user]}' ORDER BY created_at, rowid`);
}

async function signInStatus(username: string, password: string): Promise<number> {
  return (await new Client(worker.url).post('/signin', { username, password })).status;
}

describe('AT-2 guard: reset links are single-use, bound to the username and expire', { concurrency: false }, () => {
  before(async () => {
    worker = await startWorker();
    today = new Date(await workerNow(worker.url)).toISOString().slice(0, 10);
    const plus = (days: number) => new Date(Date.parse(today + 'T00:00:00Z') + days * 86_400_000).toISOString().slice(0, 10);
    owner = await setUpOwner(worker.url);
    spaceA = await createSpace(owner, { name: SPACE, kit: 'school' });
    spaceB = await createSpace(owner, { name: SPACE_B, kit: 'company', languages: 'en,ar' });
    await appointAdmin(owner, spaceA, { ...ADMIN, valid_until: plus(60) });
    await appointAdmin(owner, spaceA, { ...ADMIN_2, valid_until: plus(60) });
    await appointAdmin(owner, spaceB, { ...ADMIN_B, valid_until: plus(60) });
    for (const u of [ADMIN, ADMIN_2, ADMIN_B]) ids[u.username] = await userIdOf(worker, u.username);
    ids.owner = await userIdOf(worker, 'owner');
    admin = await signedIn(worker.url, ADMIN.username, ADMIN.password);
    for (const p of [HADEER, SALMA, OMAR]) ids[p.username] = await appointPerson(worker, admin, spaceA, { ...p, valid_until: plus(30) });
  });

  after(async () => {
    if (worker) await setClockOffsetMs(worker.url, 0).catch(() => undefined);
    await worker?.stop();
  });

  it('the token is random and at least 128 bits, only its hash is stored, and it expires 30 minutes after creation', async () => {
    const l = await issueLink(admin, person(HADEER.username));
    assert.equal(l.status, 200, 'the confirming tap makes the link');
    assert.match(l.link, new RegExp(`^${worker.url}/r/[A-Za-z0-9_-]+$`), 'a link to this product');
    assert.ok(Buffer.from(l.token, 'base64url').length * 8 >= 128, 'at least 128 bits');
    const rows = await linkRows(HADEER.username);
    assert.equal(rows.length, 1);
    const r = rows[0];
    assert.equal(r.token_hash, sha256(l.token), 'the SHA-256 of the token is stored');
    assert.ok(!JSON.stringify(rows).includes(l.token), 'the token itself is not stored');
    assert.equal(Number(r.expires_at) - Number(r.created_at), 30 * MIN, 'expires 30 minutes after creation');
    assert.equal(r.used_at, null);
    assert.equal(r.space_id, spaceA);
    assert.equal(r.created_by, ids[ADMIN.username]);
  });

  it('the number is shown only by its last digits; in full only in the wa.me link of the confirmation step; never in the log', async () => {
    const full = ['+201022223333', '201022223333', '01022223333', '1022223333'];
    for (const path of [`/s/${spaceA}/admin/people`, person(HADEER.username), `${person(HADEER.username)}/link`]) {
      const res = await admin.get(path);
      assert.equal(res.status, 200, `${path} opens`);
      const html = await res.text();
      assert.ok(html.includes('3333'), `${path} shows the last digits`);
      for (const n of full) assert.ok(!html.includes(n), `${path} does not show ${n}`);
    }
    const l = await issueLink(admin, person(HADEER.username));
    assert.equal(l.number, '201022223333', 'the WhatsApp button carries the international number');
    assert.ok(l.href.startsWith('https://wa.me/201022223333?text='));
    const outsideHref = l.html.replace(/href="https:\/\/wa\.me\/[^"]*"/, '');
    for (const n of full) assert.ok(!outsideHref.includes(n), `the result page shows ${n} nowhere but in the wa.me link`);
    for (const n of full) assert.ok(!worker.log().includes(n), `the Worker log does not contain ${n}`);
  });

  it('the WhatsApp message is the fixed product text in the space\'s first language; the admin cannot change it', async () => {
    const l = await issueLink(admin, person(HADEER.username), { text: 'evil text', message: 'evil message', link: 'https://evil.example/' });
    assert.equal(l.status, 200);
    assert.equal(l.message, [
      `السلام عليكم. هذه رسالة من ${SPACE}.`,
      `أرسل ${ADMIN.display_name} (مدير) رابطاً لتعيين كلمة مرور جديدة لحساب ${HADEER.display_name} على ${worker.url}.`,
      'افتح الرابط، واكتب اسم المستخدم ثم كلمة المرور الجديدة. الرابط صالح لمدة 30 دقيقة ولمرة واحدة.',
      l.link,
    ].join('\n'));
    assert.ok(!l.html.includes('evil'), 'nothing the admin sends enters the message or the page');
  });

  it('the reset page shows the space\'s name and plain instructions in its language, and leaks nothing', async () => {
    const l = await issueLink(admin, person(HADEER.username));
    const res = await new Client(worker.url).get(resetPath(l));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('referrer-policy'), 'no-referrer', 'the token never leaves in a Referer');
    assert.match(res.headers.get('cache-control') ?? '', /no-store/);
    const html = await res.text();
    assert.match(html, /<html lang="ar" dir="rtl">/);
    assert.ok(html.includes(SPACE), 'the space\'s name');
    assert.ok(text(html).includes('اكتب اسم المستخدم، ثم كلمة المرور الجديدة التي تريدها'), 'plain instructions in Arabic');
    assert.ok(!html.includes(HADEER.username) && !html.includes(HADEER.display_name), 'the page does not say whose link it is');
    assert.ok(!html.includes('3333'), 'nor any digit of the number');
    const unknown = await new Client(worker.url).get('/r/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
    assert.equal(unknown.status, 410, 'an unknown link is refused');
  });

  it('a wrong username is refused and does not use the link up; the right one sets the password once; a second use is refused; every sign-in ends', async () => {
    const before = await signedIn(worker.url, HADEER.username, HADEER.password);
    assert.equal((await before.get(`/s/${spaceA}`)).status, 200, 'Hadeer is signed in elsewhere');
    const l = await issueLink(admin, person(HADEER.username));
    const visitor = new Client(worker.url);
    const wrong = await visitor.post(resetPath(l), { username: SALMA.username, new_password: 'taken-over-pass' });
    assert.equal(wrong.status, 401, 'a wrong username is refused');
    assert.ok(text(await wrong.text()).includes('اسم المستخدم هذا لا يطابق الرابط'), 'with a plain message');
    let row = (await linkRows(HADEER.username)).at(-1)!;
    assert.equal(row.used_at, null, 'the link is not used up');
    assert.equal(Number(row.failed_attempts), 1, 'the attempt is counted');
    assert.equal(await signInStatus(SALMA.username, 'taken-over-pass'), 401, 'nothing changed for the other person');

    const ok = await visitor.post(resetPath(l), { username: 'Hadeer', new_password: 'hadeer-new-pass' });
    assert.equal(ok.status, 200, 'the right username (any letter case) sets the password');
    assert.match(await ok.text(), /id="done"/);
    row = (await linkRows(HADEER.username)).at(-1)!;
    assert.ok(Number(row.used_at) > 0, 'the link is used');
    assert.equal(await signInStatus(HADEER.username, HADEER.password), 401, 'the old password is dead');
    assert.equal(await signInStatus(HADEER.username, 'hadeer-new-pass'), 302, 'the new password works');
    HADEER.password = 'hadeer-new-pass';
    const after = await before.get(`/s/${spaceA}`);
    assert.equal(after.status, 302, 'the earlier sign-in has ended');

    const again = await visitor.post(resetPath(l), { username: HADEER.username, new_password: 'second-use-pass' });
    assert.equal(again.status, 410, 'a second use is refused');
    assert.equal((await visitor.get(resetPath(l))).status, 410);
    assert.equal(await signInStatus(HADEER.username, 'second-use-pass'), 401);
  });

  it('the link is refused once the clock reaches 30 minutes after its creation', async () => {
    const l = await issueLink(admin, person(SALMA.username));
    assert.equal(l.number, '201033334444', 'a learner\'s link goes to the parent\'s registered number');
    assert.equal((await setClockOffsetMs(worker.url, 29 * MIN)).status, 200);
    assert.equal((await new Client(worker.url).get(resetPath(l))).status, 200, 'still open after 29 minutes');
    assert.equal((await setClockOffsetMs(worker.url, 30 * MIN)).status, 200);
    assert.equal((await new Client(worker.url).get(resetPath(l))).status, 410, 'refused at 30 minutes');
    const late = await new Client(worker.url).post(resetPath(l), { username: SALMA.username, new_password: 'too-late-pass' });
    assert.equal(late.status, 410);
    assert.equal(await signInStatus(SALMA.username, 'too-late-pass'), 401, 'the password is unchanged');
    assert.equal((await setClockOffsetMs(worker.url, 0)).status, 200);
  });

  it('issuing a fresh link kills every earlier one', async () => {
    const first = await issueLink(admin, person(SALMA.username));
    const second = await issueLink(admin, person(SALMA.username));
    assert.notEqual(first.token, second.token);
    const rows = await linkRows(SALMA.username);
    assert.ok(rows.slice(0, -1).every((r) => r.used_at !== null), 'every earlier link of this person is marked used');
    assert.equal(rows.at(-1)!.used_at, null);
    const old = await new Client(worker.url).post(resetPath(first), { username: SALMA.username, new_password: 'old-link-pass' });
    assert.equal(old.status, 410, 'the earlier link is dead');
    const fresh = await new Client(worker.url).post(resetPath(second), { username: SALMA.username, new_password: 'salma-new-pass' });
    assert.equal(fresh.status, 200, 'the fresh link works');
    assert.equal(await signInStatus(SALMA.username, 'salma-new-pass'), 302);
  });

  it('the attempts on one link are bounded: after five wrong usernames it is dead', async () => {
    const l = await issueLink(admin, person(OMAR.username));
    const visitor = new Client(worker.url);
    for (let i = 0; i < 5; i++) {
      const res = await visitor.post(resetPath(l), { username: `guess${i}`, new_password: 'guessed-pass' });
      assert.equal(res.status, 401, `wrong username ${i + 1} refused`);
    }
    const row = (await linkRows(OMAR.username)).at(-1)!;
    assert.equal(Number(row.failed_attempts), 5);
    // Wait out the per-username slow-down (15 minutes), still inside the link's 30 minutes.
    assert.equal((await setClockOffsetMs(worker.url, 16 * MIN)).status, 200);
    const right = await visitor.post(resetPath(l), { username: OMAR.username, new_password: 'omar-new-pass' });
    assert.equal(right.status, 410, 'even the right username is refused now');
    assert.equal(await signInStatus(OMAR.username, 'omar-new-pass'), 401);
    assert.equal(await signInStatus(OMAR.username, OMAR.password), 302, 'the old password still works');
    assert.equal((await setClockOffsetMs(worker.url, 0)).status, 200);
  });

  it('only the appointer issues a link: the admin for publishers and learners, the owner for admins', async () => {
    const count = async () => Number((await worker.sql('SELECT COUNT(*) AS n FROM reset_link'))[0].n);
    const start = await count();
    const hadeer = await signedIn(worker.url, HADEER.username, HADEER.password);
    const salma = await signedIn(worker.url, SALMA.username, 'salma-new-pass');
    const adminB = await signedIn(worker.url, ADMIN_B.username, ADMIN_B.password);
    const refusals: [string, Client, string][] = [
      ['a publisher', hadeer, `${person(SALMA.username)}/link`],
      ['a learner', salma, `${person(HADEER.username)}/link`],
      ['the admin of another space, under that space', adminB, `/s/${spaceB}/admin/people/${ids[HADEER.username]}/link`],
      ['the admin of another space, under this space', adminB, `${person(HADEER.username)}/link`],
      ['an admin, for another admin of the same space', admin, `/s/${spaceA}/admin/people/${ids[ADMIN_2.username]}/link`],
      ['an admin, for the owner', admin, `/s/${spaceA}/admin/people/${ids.owner}/link`],
      ['an admin, for themselves', admin, `/s/${spaceA}/admin/people/${ids[ADMIN.username]}/link`],
      ['the owner, for a publisher (appointed by the admin)', owner, `/owner/spaces/${spaceA}/people/${ids[HADEER.username]}/link`],
      ['the owner, for an admin of another space under this one', owner, `/owner/spaces/${spaceA}/people/${ids[ADMIN_B.username]}/link`],
    ];
    for (const [who, client, path] of refusals) {
      for (const res of [await client.get(path), await client.post(path, {})]) {
        assert.equal(res.status, 403, `${who}: ${path} refused`);
      }
    }
    assert.equal(await count(), start, 'no link was made by any refusal');

    const byOwner = await issueLink(owner, `/owner/spaces/${spaceA}/people/${ids[ADMIN_2.username]}`);
    assert.equal(byOwner.status, 200, 'the owner issues a link for an admin they appointed');
    assert.equal(byOwner.number, '201011112222');
    assert.ok(byOwner.message.includes(SPACE) && byOwner.message.split('\n').at(-1) === byOwner.link, 'in the space\'s language, link last');
    const used = await new Client(worker.url).post(resetPath(byOwner), { username: ADMIN_2.username, new_password: 'mona-new-pass' });
    assert.equal(used.status, 200);
    assert.equal(await signInStatus(ADMIN_2.username, 'mona-new-pass'), 302);
  });

  it('whoever appointed a person can set a new password directly; every sign-in of that person ends', async () => {
    const salma = await signedIn(worker.url, SALMA.username, 'salma-new-pass');
    const short = await admin.post(`${person(SALMA.username)}/password`, { new_password: 'short' });
    assert.equal(short.status, 400, 'too short is refused');
    const set = await admin.post(`${person(SALMA.username)}/password`, { new_password: 'set-by-admin-pass' });
    assert.equal(set.status, 200);
    assert.match(await set.text(), /id="done"/);
    assert.equal(await signInStatus(SALMA.username, 'salma-new-pass'), 401, 'the earlier password is dead');
    assert.equal(await signInStatus(SALMA.username, 'set-by-admin-pass'), 302, 'the new one works');
    assert.equal((await salma.get(`/s/${spaceA}`)).status, 302, 'the earlier sign-in has ended');

    const hadeer = await signedIn(worker.url, HADEER.username, HADEER.password);
    for (const [who, client, path] of [
      ['an admin, for another admin', admin, `/s/${spaceA}/admin/people/${ids[ADMIN_2.username]}/password`],
      ['a publisher, for a learner', hadeer, `${person(SALMA.username)}/password`],
      ['the owner, for a learner', owner, `/owner/spaces/${spaceA}/people/${ids[SALMA.username]}/password`],
    ] as [string, Client, string][]) {
      assert.equal((await client.post(path, { new_password: 'not-allowed-pass' })).status, 403, `${who} refused`);
    }
    assert.equal(await signInStatus(ADMIN_2.username, 'not-allowed-pass'), 401);
    assert.equal(await signInStatus(SALMA.username, 'not-allowed-pass'), 401);

    const byOwner = await owner.post(`/owner/spaces/${spaceA}/people/${ids[ADMIN_2.username]}/password`, { new_password: 'mona-owner-pass' });
    assert.equal(byOwner.status, 200, 'the owner sets a new password for an admin');
    assert.equal(await signInStatus(ADMIN_2.username, 'mona-owner-pass'), 302);
  });
});
