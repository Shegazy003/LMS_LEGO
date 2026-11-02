// AT-6 guard: ending access is immediate and stops sessions and reset links
// (release 1.1, contract 0.2, AT-6; docs/02-LEGO-MODEL.md rules 2, 3 and 5).
//
// Against the running Worker (Wrangler + workerd, local D1 and R2), through the
// admin's and the owner's real forms, checking status codes and stored rows.
// The Worker's clock is at midday UTC of today for the whole run.
// - End access now: the confirm step (GET) changes nothing; the confirming
//   post ends access at once: the person's next page shows the "access ended"
//   message dated today in both languages, then that sign-in is over; every
//   direct link (home, subject, lesson, file, publisher pages) is refused;
//   every open reset link is dead; signing in again only shows the message.
// - A typed end date keeps the release 1 rule (through the end of that UTC
//   day); a typed date before today, or later than the admin's own end date,
//   is refused with a plain message; the rule applies to typed dates only.
// - A corrected mobile number kills every earlier reset link; the next link
//   goes to the new number and names the corrected person. Names keep the
//   release 1 bounds; an unreadable number is refused.
// - Search is server-side and space-scoped.
// - Only an admin of that space may correct, end or restore; the owner may for
//   the admins they appointed. A publisher, a learner, another space's admin,
//   another admin of the same space and a forged cross-origin post are refused,
//   and nothing changes.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startWorker, type RunningWorker } from '../support/worker.ts';
import { Client, setClockOffsetMs, setClockTo, setStartOffset, workerNow } from '../support/http.ts';
import { issueLink, userIdOf } from '../support/admin.ts';
import { appointAdmin, b64, createSpace, seed, setUpOwner, signedIn, tinyPdf } from '../support/seed.ts';
import { changes, snapshot } from '../support/state.ts';

const SPACE = 'مدرسة مسك';
const SPACE_B = 'Delta Logistics';
const ADMIN = { display_name: 'Amal Hassan', username: 'amal.admin', password: 'admin-first-pass', mobile: '01012345678' };
const ADMIN_2 = { display_name: 'Mona Farid', username: 'mona.admin', password: 'admin-two-pass', mobile: '01011112222' };
const ADMIN_B = { display_name: 'Basem Fawzy', username: 'basem.admin', password: 'admin-b-pass', mobile: '01087654321' };
const HADEER = { username: 'hadeer', password: 'hadeer-first-pass', display_name: 'Hadeer', mobile: '01022223333', role: 'publisher' as const };
const SHIMAA = { username: 'shimaa', password: 'shimaa-first-pass', display_name: 'Shimaa', mobile: '01066667777', role: 'publisher' as const };
const SALMA = { username: 'salma.learner', password: 'salma-first-pass', display_name: 'Salma Adel', mobile: '01033334444', role: 'learner' as const };
const OMAR = { username: 'omar.learner', password: 'omar-first-pass', display_name: 'Omar Nabil', mobile: '01055556666', role: 'learner' as const };
const KARIM = { username: 'karim.employee', password: 'karim-first-pass', display_name: 'Karim Said', mobile: '01077778888', role: 'learner' as const };
const DAY = 86_400_000;
const ENDED_AR = (d: string) => `انتهى وصولك إلى ${SPACE} في ${d}. للتواصل: مدير.`;
const ENDED_EN = (d: string) => `Your access to ${SPACE} ended on ${d}. Contact the Administrator.`;
const ENDED_ADMIN_AR = (d: string) => `انتهى وصولك إلى ${SPACE} في ${d}. للتواصل: المالك.`;
const ENDED_ADMIN_EN = (d: string) => `Your access to ${SPACE} ended on ${d}. Contact the owner.`;

let worker: RunningWorker;
let owner: Client;
let admin: Client;
let admin2: Client;
let adminB: Client;
let spaceId = '';
let spaceB = '';
let today = '';
let adminEnd = '';
const ids: Record<string, string> = {};

const plus = (days: number) => new Date(Date.parse(today + 'T00:00:00Z') + days * DAY).toISOString().slice(0, 10);
const textOf = (html: string) => html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const count = async (sql: string) => Number((await worker.sql(sql))[0].n);
const person = (userId: string) => `/s/${spaceId}/admin/people/${userId}`;
const clockAt = (ms: number) => setClockOffsetMs(worker.url, ms);

async function membership(userId: string, space = spaceId): Promise<{ valid_until: string; ended_on: string | null }> {
  const rows = await worker.sql(`SELECT valid_until, ended_on FROM membership WHERE user_id = '${userId}' AND space_id = '${space}'`);
  assert.equal(rows.length, 1);
  return { valid_until: String(rows[0].valid_until), ended_on: rows[0].ended_on === null ? null : String(rows[0].ended_on) };
}

/** The response is the "access ended" page dated `date`, in the space's first language and then its second. */
async function assertEnded(res: Response, date: string, where: string, who: 'admin' | 'owner' = 'admin'): Promise<void> {
  assert.equal(res.status, 403, `${where}: refused (got ${res.status})`);
  const text = textOf(await res.text());
  const [ar, en] = who === 'admin' ? [ENDED_AR(date), ENDED_EN(date)] : [ENDED_ADMIN_AR(date), ENDED_ADMIN_EN(date)];
  assert.ok(text.includes(ar), `${where}: the message in Arabic`);
  assert.ok(text.includes(en), `${where}: then in English`);
}

/** The request is refused: the "access ended" page (403), or sent to sign in (302) because that sign-in is over. */
async function assertRefused(res: Response, where: string): Promise<void> {
  if (res.status === 302) {
    assert.equal(new URL(res.headers.get('location') ?? '', worker.url).pathname, '/signin', `${where}: sent to sign in`);
    return;
  }
  assert.equal(res.status, 403, `${where}: refused (got ${res.status})`);
  assert.ok(!(res.headers.get('content-type') ?? '').includes('pdf'), `${where}: no file bytes`);
}

describe('AT-6 guard: ending access is immediate and stops sessions and reset links', { concurrency: false }, () => {
  const content: Record<string, string> = {};

  before(async () => {
    worker = await startWorker();
    today = new Date(await workerNow(worker.url)).toISOString().slice(0, 10);
    setStartOffset(worker.url, Date.parse(`${today}T12:00:00Z`) - Date.now());
    assert.equal((await clockAt(0)).status, 200);
    adminEnd = plus(60);
    owner = await setUpOwner(worker.url);
    spaceId = await createSpace(owner, { name: SPACE, kit: 'school' });
    spaceB = await createSpace(owner, { name: SPACE_B, kit: 'company' });
    await appointAdmin(owner, spaceId, { ...ADMIN, valid_until: adminEnd });
    await appointAdmin(owner, spaceId, { ...ADMIN_2, valid_until: adminEnd });
    await appointAdmin(owner, spaceB, { ...ADMIN_B, valid_until: adminEnd });
    const s = await seed(worker.url, {
      spaceId,
      grantedBy: ADMIN.username,
      people: [HADEER, SHIMAA, SALMA, OMAR].map((p) => ({ ...p, valid_until: plus(30) })),
      groups: [{ name: 'Science', members: [SALMA.username, OMAR.username] }],
      subjects: [{
        title: 'Mathematics', publisher: HADEER.username, published: true, groups: ['Science'],
        chapters: [{ title: 'Fractions', lessons: [{ title: 'Adding fractions', materials: [
          { kind: 'pdf', title: 'Worksheet', base64: b64(tinyPdf()), contentType: 'application/pdf' },
        ] }] }],
      }],
    });
    await seed(worker.url, { spaceId: spaceB, grantedBy: ADMIN_B.username, people: [{ ...KARIM, valid_until: plus(30) }] });
    Object.assign(ids, s.users, {
      admin: await userIdOf(worker, ADMIN.username), admin2: await userIdOf(worker, ADMIN_2.username), karim: await userIdOf(worker, KARIM.username),
    });
    const math = s.subjects.Mathematics;
    const lesson = math.chapters.Fractions.lessons['Adding fractions'];
    Object.assign(content, { subject: math.id, chapter: math.chapters.Fractions.id, lesson: lesson.id, pdf: lesson.materials.Worksheet });
    admin = await signedIn(worker.url, ADMIN.username, ADMIN.password);
    admin2 = await signedIn(worker.url, ADMIN_2.username, ADMIN_2.password);
    adminB = await signedIn(worker.url, ADMIN_B.username, ADMIN_B.password);
  });

  after(async () => {
    if (worker) await setClockOffsetMs(worker.url, 0).catch(() => undefined);
    await worker?.stop();
  });

  it('End access now at midday UTC: the next page shows the message dated today, every direct link is refused, every sign-in and open reset link stops; the confirm step and Cancel change nothing', async () => {
    assert.equal(new Date(await workerNow(worker.url)).getUTCHours(), 12, 'midday UTC');
    const salmaId = ids[SALMA.username];
    const phoneA = await signedIn(worker.url, SALMA.username, SALMA.password);
    const phoneB = await signedIn(worker.url, SALMA.username, SALMA.password);
    assert.equal((await phoneA.get(`/s/${spaceId}/file/${content.pdf}`)).status, 200, 'positive control: the learner opens the file');
    const link = await issueLink(admin, person(salmaId));
    assert.equal(link.status, 200);
    assert.equal(await count(`SELECT COUNT(*) AS n FROM session WHERE user_id = '${salmaId}'`), 2);

    // The confirm step and Cancel (back to the person's page) are plain GETs and change nothing.
    const beforeConfirm = await snapshot(worker);
    const confirm = await admin.get(`${person(salmaId)}/end`);
    assert.equal(confirm.status, 200);
    const confirmText = textOf(await confirm.text());
    assert.ok(confirmText.includes(`إنهاء وصول ${SALMA.display_name} الآن؟`), 'the confirm step names the person');
    assert.equal((await admin.get(person(salmaId))).status, 200, 'Cancel leads back to the person');
    assert.deepEqual(changes(beforeConfirm, await snapshot(worker)), {}, 'nothing changed');
    assert.equal((await phoneA.get(`/s/${spaceId}`)).status, 200, 'still in the space');

    const ended = await admin.post(`${person(salmaId)}/end`, {});
    assert.equal(ended.status, 303, 'access ends');
    assert.deepEqual(await membership(salmaId), { valid_until: plus(30), ended_on: today }, 'ended today; the end date is kept');
    assert.equal(await count(`SELECT COUNT(*) AS n FROM reset_link WHERE user_id = '${salmaId}' AND used_at IS NULL`), 0, 'no reset link of hers is open');

    // At once: the next page of each sign-in shows the message, then that sign-in is over.
    await assertEnded(await phoneA.get(`/s/${spaceId}`), today, 'next page (first phone)');
    await assertRefused(await phoneA.get(`/s/${spaceId}/learn/${content.subject}`), 'the first phone after the message');
    await assertEnded(await phoneB.get(`/s/${spaceId}/read/${content.lesson}`), today, 'next page (second phone, a direct link)');
    await assertRefused(await phoneB.get(`/s/${spaceId}/file/${content.pdf}`), 'the second phone after the message');
    assert.equal((await phoneA.get('/account')).status, 302, 'the ended sign-in opens no other page either');
    assert.equal(await count(`SELECT COUNT(*) AS n FROM session WHERE user_id = '${salmaId}'`), 0, 'no sign-in of hers is left');

    // The open reset link is dead and sets nothing.
    assert.equal((await new Client(worker.url).get(`/r/${link.token}`)).status, 410, 'the reset link is dead');
    const tried = await new Client(worker.url).post(`/r/${link.token}`, { username: SALMA.username, new_password: 'taken-over-pass' });
    assert.equal(tried.status, 410, 'it cannot set a password');

    // She can still sign in (release 1 rule 3) with her own password; every direct link is refused with the message.
    const again = await signedIn(worker.url, SALMA.username, SALMA.password);
    for (const path of [`/s/${spaceId}`, `/s/${spaceId}/learn/${content.subject}`, `/s/${spaceId}/read/${content.lesson}`, `/s/${spaceId}/file/${content.pdf}`]) {
      const res = await again.get(path);
      assert.ok(!(res.headers.get('content-type') ?? '').includes('pdf'), `${path}: no file bytes`);
      await assertEnded(res, today, `direct link ${path}`);
    }
    // Ending again changes nothing.
    const once = await snapshot(worker);
    assert.equal((await admin.post(`${person(salmaId)}/end`, {})).status, 303);
    const diff = changes(once, await snapshot(worker));
    assert.ok(!diff.membership, 'ending an ended person changes nothing');
  });

  it('End access now on a publisher: the publisher pages and their writes are refused at once', async () => {
    const hadeerId = ids[HADEER.username];
    const hadeer = await signedIn(worker.url, HADEER.username, HADEER.password);
    assert.equal((await hadeer.get(`/s/${spaceId}/publish/edit/${content.subject}`)).status, 200, 'positive control');
    assert.equal((await admin.post(`${person(hadeerId)}/end`, {})).status, 303);
    await assertEnded(await hadeer.get(`/s/${spaceId}/publish`), today, 'the publisher home');
    const again = await signedIn(worker.url, HADEER.username, HADEER.password);
    const before = await snapshot(worker);
    await assertEnded(await again.post(`/s/${spaceId}/publish/edit/${content.subject}/add`, { title: 'Late chapter' }), today, 'adding a chapter');
    await assertEnded(await again.get(`/s/${spaceId}/publish/compose/${content.lesson}`), today, 'the lesson editor');
    assert.deepEqual(changes(before, await snapshot(worker)), {}, 'nothing written');
    // Restore brings her back (nothing was deleted).
    assert.equal((await admin.post(`${person(hadeerId)}/restore`, { valid_until: plus(30) })).status, 303);
    assert.deepEqual(await membership(hadeerId), { valid_until: plus(30), ended_on: null });
    assert.equal((await again.get(`/s/${spaceId}/publish/edit/${content.subject}`)).status, 200, 'the publisher is back');
  });

  it('typed end dates: today keeps access through that UTC day; before today or later than the admin\'s own is refused; the rule applies to typed dates only', async () => {
    const shimaaId = ids[SHIMAA.username];
    const correct = (fields: Record<string, string>) => admin.post(`${person(shimaaId)}/correct`, { display_name: SHIMAA.display_name, mobile: '', ...fields });
    const before = await snapshot(worker);
    for (const [date, message] of [
      [plus(-1), 'اختر تاريخ انتهاء من اليوم فصاعداً.'],
      [plus(61), `لا يمكن أن يتجاوز تاريخ الانتهاء تاريخ انتهائك أنت، ${adminEnd}.`],
      ['2026-02-30', 'اختر تاريخ انتهاء من اليوم فصاعداً.'],
      ['', 'اختر تاريخ انتهاء من اليوم فصاعداً.'],
    ]) {
      const res = await correct({ valid_until: date });
      assert.equal(res.status, 400, `${date || 'no date'} is refused`);
      assert.ok(textOf(await res.text()).includes(message), `${date || 'no date'}: the plain message`);
    }
    assert.deepEqual(changes(before, await snapshot(worker)), {}, 'nothing stored');

    assert.equal((await correct({ valid_until: today })).status, 303, 'today is accepted');
    const shimaa = await signedIn(worker.url, SHIMAA.username, SHIMAA.password);
    assert.equal((await shimaa.get(`/s/${spaceId}/publish`)).status, 200, 'access through the rest of today');
    assert.equal((await setClockTo(worker.url, Date.parse(`${today}T23:59:58Z`))).status, 200, 'two seconds before midnight UTC');
    assert.equal((await shimaa.get(`/s/${spaceId}/publish`)).status, 200, 'still in');
    assert.equal((await setClockTo(worker.url, Date.parse(`${plus(1)}T00:00:01Z`))).status, 200, 'one second after midnight UTC');
    await assertEnded(await shimaa.get(`/s/${spaceId}/publish`), today, 'the next UTC day');

    // The next day her stored end date is in the past. Correcting her name
    // alone (no typed date) is accepted: the rule is for typed dates only.
    const renamed = await admin.post(`${person(shimaaId)}/correct`, { display_name: 'Shimaa Ali', mobile: '' });
    assert.equal(renamed.status, 303, 'a correction with no typed date');
    assert.deepEqual(await membership(shimaaId), { valid_until: today, ended_on: null }, 'the stored date is untouched');
    // Restoring takes a typed date, so it follows the rule: the day before the clock's today is refused.
    const lateRestore = await admin.post(`${person(shimaaId)}/restore`, { valid_until: today });
    assert.equal(lateRestore.status, 400, 'yesterday is refused for a restore');
    assert.equal((await admin.post(`${person(shimaaId)}/restore`, { valid_until: plus(61) })).status, 400, 'later than the admin\'s own is refused for a restore');
    assert.deepEqual(await membership(shimaaId), { valid_until: today, ended_on: null }, 'nothing stored');
    assert.equal((await clockAt(0)).status, 200);
    assert.equal((await shimaa.get(`/s/${spaceId}/publish`)).status, 200, 'back at midday today, the end date today still holds');
  });

  it('a corrected mobile number kills every earlier reset link; the next link goes to the new number and names the corrected person; unreadable numbers and unbounded names are refused', async () => {
    const omarId = ids[OMAR.username];
    const first = await issueLink(admin, person(omarId));
    assert.equal(first.number, '201055556666');
    const before = await snapshot(worker);
    for (const [fields, why] of [
      [{ display_name: OMAR.display_name, mobile: '0102' }, 'an unreadable number'],
      [{ display_name: OMAR.display_name, mobile: 'abc' }, 'letters'],
      [{ display_name: '', mobile: '' }, 'an empty name'],
      [{ display_name: 'x'.repeat(101), mobile: '' }, 'a name over 100 characters'],
      [{ display_name: 'Omar\nNabil', mobile: '' }, 'a name on two lines'],
    ] as const) {
      const res = await admin.post(`${person(omarId)}/correct`, { ...fields, valid_until: plus(30) });
      assert.equal(res.status, 400, `${why} is refused`);
    }
    assert.deepEqual(changes(before, await snapshot(worker)), {}, 'nothing stored');
    assert.equal((await new Client(worker.url).get(`/r/${first.token}`)).status, 200, 'the link still works after refused corrections');

    // A name-only correction keeps the open link; the next message carries the new name.
    assert.equal((await admin.post(`${person(omarId)}/correct`, { display_name: 'Omar Nabeel', mobile: '', valid_until: plus(30) })).status, 303);
    const second = await issueLink(admin, person(omarId));
    assert.ok(second.message.includes('Omar Nabeel'), 'the next WhatsApp message carries the corrected name');
    assert.equal((await new Client(worker.url).get(`/r/${first.token}`)).status, 410, 'a newer link kills the older one (release 1)');

    const res = await admin.post(`${person(omarId)}/correct`, { display_name: 'Omar Nabeel', mobile: '+20 102 444 5555', valid_until: plus(30) });
    assert.equal(res.status, 303);
    assert.equal((await worker.sql(`SELECT mobile FROM user WHERE id = '${omarId}'`))[0].mobile, '+201024445555', 'stored in international form');
    assert.equal((await new Client(worker.url).get(`/r/${second.token}`)).status, 410, 'every link issued before the change is dead');
    assert.equal(await count(`SELECT COUNT(*) AS n FROM reset_link WHERE user_id = '${omarId}' AND used_at IS NULL`), 0);
    const third = await issueLink(admin, person(omarId));
    assert.equal(third.number, '201024445555', 'the next link goes to the new number');
    assert.ok(third.message.includes('Omar Nabeel'));
    const page = await (await admin.get(person(omarId))).text();
    for (const n of ['+201024445555', '201024445555', '01024445555']) assert.ok(!page.includes(n), `the person page does not show ${n}`);
    assert.ok(!worker.log().includes('201024445555'), 'the Worker log never contains the number');
  });

  it('search is server-side and space-scoped; typed wildcards are only text', async () => {
    const listed = async (c: Client, path: string) => {
      const html = await (await c.get(path)).text();
      return { ids: [...html.matchAll(/data-user="([^"]+)"/g)].map((m) => m[1]), text: textOf(html) };
    };
    const salma = await listed(admin, `/s/${spaceId}/admin/people?q=SALMA`);
    assert.deepEqual(salma.ids, [ids[SALMA.username]], 'part of a name or username, any letter case: only that person');
    const omar = await listed(admin, `/s/${spaceId}/admin/people?q=${encodeURIComponent('omar.l')}`);
    assert.deepEqual(omar.ids, [ids[OMAR.username]], 'part of a username');
    const karim = await listed(admin, `/s/${spaceId}/admin/people?q=Karim`);
    assert.deepEqual(karim.ids, [], 'another space\'s person is never found');
    assert.ok(karim.text.includes('لا أحد هنا يطابق «Karim».'), 'the plain message');
    assert.deepEqual((await listed(adminB, `/s/${spaceB}/admin/people?q=Salma`)).ids, [], 'nor from the other side');
    assert.deepEqual((await listed(adminB, `/s/${spaceB}/admin/people?q=Karim`)).ids, [ids.karim], 'positive control in the other space');
    for (const wildcard of ['%', '_', '\\']) {
      assert.deepEqual((await listed(admin, `/s/${spaceId}/admin/people?q=${encodeURIComponent(wildcard)}`)).ids, [], `"${wildcard}" matches only itself`);
    }
    const long = await admin.get(`/s/${spaceId}/admin/people?q=${'a'.repeat(5000)}`);
    assert.equal(long.status, 200, 'a very long search is cut, not an error');
  });

  it('only an admin of that space may correct, end or restore: a publisher, a learner, another space\'s admin, another admin and a forged cross-origin post are refused, and nothing changes', async () => {
    const omarId = ids[OMAR.username];
    const publisher = await signedIn(worker.url, HADEER.username, HADEER.password);
    const omar = await signedIn(worker.url, OMAR.username, OMAR.password);
    const fields = { display_name: 'Forged', mobile: '01099998888', valid_until: plus(5) };
    const before = await snapshot(worker);
    const attempts: [string, () => Promise<Response>][] = [];
    for (const [who, c] of [['a publisher', publisher], ['a learner', omar], ['another space\'s admin', adminB]] as const) {
      for (const action of ['correct', 'end', 'restore']) attempts.push([`${who} POST ${action}`, () => c.post(`${person(omarId)}/${action}`, fields)]);
      attempts.push([`${who} GET end`, () => c.get(`${person(omarId)}/end`)]);
    }
    for (const action of ['correct', 'end', 'restore']) {
      // Another space's admin, with this person's id under their own space's address.
      attempts.push([`another space's admin, own address, POST ${action}`, () => adminB.post(`/s/${spaceB}/admin/people/${omarId}/${action}`, fields)]);
      // An admin cannot correct, end or restore another admin, nor themselves (the owner does).
      attempts.push([`an admin on another admin, POST ${action}`, () => admin.post(`${person(ids.admin2)}/${action}`, fields)]);
      attempts.push([`an admin on themselves, POST ${action}`, () => admin2.post(`${person(ids.admin2)}/${action}`, fields)]);
      // A forged cross-origin post, with the admin's own session.
      attempts.push([`a forged cross-origin POST ${action}`, () => admin.postWith(`${person(omarId)}/${action}`, fields, { origin: 'https://evil.example' })]);
      attempts.push([`an origin-less POST ${action}`, () => admin.postWith(`${person(omarId)}/${action}`, fields, {})]);
      // The owner's routes are the owner's only.
      attempts.push([`an admin on the owner's route, POST ${action}`, () => admin.post(`/owner/spaces/${spaceId}/people/${ids.admin2}/${action}`, fields)]);
    }
    attempts.push(['an admin on another space\'s person, GET end', () => admin.get(`${person(ids.karim)}/end`)]);
    for (const [what, send] of attempts) {
      const res = await send();
      assert.equal(res.status, 403, `${what}: refused (got ${res.status})`);
    }
    assert.deepEqual(changes(before, await snapshot(worker)), {}, 'nothing changed');
  });

  it('the owner corrects, ends and restores the admins they appointed (AMBER: the same page the owner already has for them)', async () => {
    const base = `/owner/spaces/${spaceId}/people/${ids.admin2}`;
    assert.equal((await owner.post(`${base}/correct`, { display_name: 'Mona Farid Ali', mobile: '', valid_until: plus(90) })).status, 303, 'the owner is not bound by an end date of their own');
    assert.deepEqual(await membership(ids.admin2), { valid_until: plus(90), ended_on: null });
    assert.equal((await owner.post(`${base}/correct`, { display_name: 'Mona Farid Ali', mobile: '', valid_until: plus(-1) })).status, 400, 'a typed date before today is refused');
    assert.equal((await owner.get(`${base}/end`)).status, 200, 'the confirm step');
    assert.equal((await owner.post(`${base}/end`, {})).status, 303);
    await assertEnded(await admin2.get(`/s/${spaceId}/admin/people`), today, 'the ended admin\'s next page', 'owner');
    const again = await signedIn(worker.url, ADMIN_2.username, ADMIN_2.password);
    await assertEnded(await again.get(`/s/${spaceId}/admin`), today, 'the ended admin signing in again', 'owner');
    assert.equal((await owner.post(`${base}/restore`, { valid_until: plus(20) })).status, 303);
    assert.equal((await again.get(`/s/${spaceId}/admin`)).status, 200, 'the admin is back');
    assert.equal((await owner.post(`/owner/spaces/${spaceId}/people/${ids[OMAR.username]}/end`, {})).status, 403, 'the owner page is for admins only');
  });
});
