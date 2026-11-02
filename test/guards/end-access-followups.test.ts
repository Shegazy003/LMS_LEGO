// AT-6 follow-ups (the AT-6 Verifier's carried items, build task 11):
// - Ended people: for a person whose access has ended (End access now, or an
//   end date in the past), the appointer's "Send reset link by WhatsApp" (both
//   steps) and "Set a new password" are refused with a plain message, and
//   nothing is stored, until access is restored. The same holds on the owner's
//   page for an ended admin.
// - Ended spaces on /home: the list of a person's spaces marks a space whose
//   access has ended, with the day it ended, in Arabic and in English (the
//   dictionary's words).
// - The refresh race is proven at unit level in test/unit/session-refresh.test.ts
//   (this CI step runs it too).
//
// Against the running Worker (Wrangler + workerd, local D1 and R2), through the
// admin's and the owner's real forms. The Worker's clock is at midday UTC.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startWorker, type RunningWorker } from '../support/worker.ts';
import { Client, setClockOffsetMs, setStartOffset, workerNow } from '../support/http.ts';
import { userIdOf } from '../support/admin.ts';
import { appointAdmin, createSpace, seed, setUpOwner, signedIn } from '../support/seed.ts';
import { changes, snapshot } from '../support/state.ts';

const SPACE = 'مدرسة مسك';
const SPACE_B = 'Delta Logistics';
const ADMIN = { display_name: 'Amal Hassan', username: 'amal.admin', password: 'admin-first-pass', mobile: '01012345678' };
const ADMIN_2 = { display_name: 'Mona Farid', username: 'mona.admin', password: 'admin-two-pass', mobile: '01011112222' };
const ADMIN_B = { display_name: 'Basem Fawzy', username: 'basem.admin', password: 'admin-b-pass', mobile: '01087654321' };
const SALMA = { username: 'salma.learner', password: 'salma-first-pass', display_name: 'Salma Adel', mobile: '01033334444', role: 'learner' as const };
const OMAR = { username: 'omar.learner', password: 'omar-first-pass', display_name: 'Omar Nabil', mobile: '01055556666', role: 'learner' as const };
const KARIM = { username: 'karim.employee', password: 'karim-first-pass', display_name: 'Karim Said', mobile: '01077778888', role: 'learner' as const };
const DAY = 86_400_000;

const REFUSED_AR = (name: string) => `انتهى وصول ${name}. استعِد الوصول أولاً؛ وبعدها يمكنك إرسال رابط إعادة تعيين أو تعيين كلمة مرور جديدة.`;
const REFUSED_EN = (name: string) => `Access for ${name} has ended. Restore access first; then you can send a reset link or set a new password.`;
const ENDED_AR = (d: string) => `انتهى الوصول في ${d}`;
const ENDED_EN = (d: string) => `access ended on ${d}`;

let worker: RunningWorker;
let owner: Client;
let admin: Client;
let spaceId = '';
let spaceB = '';
let today = '';
const ids: Record<string, string> = {};

const plus = (days: number) => new Date(Date.parse(today + 'T00:00:00Z') + days * DAY).toISOString().slice(0, 10);
const textOf = (html: string) => html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const person = (userId: string) => `/s/${spaceId}/admin/people/${userId}`;

/** The three reset actions on a person's page, as the appointer sends them. */
function resetActions(who: Client, base: string): [string, () => Promise<Response>][] {
  return [
    ['GET link (the confirmation step)', () => who.get(`${base}/link`)],
    ['POST link (the confirming tap)', () => who.post(`${base}/link`, {})],
    ['POST password', () => who.post(`${base}/password`, { new_password: 'a-new-pass-2026' })],
  ];
}

async function assertAllRefused(who: Client, base: string, message: string, where: string): Promise<void> {
  const before = await snapshot(worker);
  for (const [what, send] of resetActions(who, base)) {
    const res = await send();
    assert.equal(res.status, 400, `${where}: ${what} is refused (got ${res.status})`);
    const text = textOf(await res.text());
    assert.ok(text.includes(message), `${where}: ${what} says so plainly`);
    assert.ok(!text.includes('/r/'), `${where}: ${what} shows no link`);
  }
  assert.deepEqual(changes(before, await snapshot(worker)), {}, `${where}: nothing stored (no reset link, no password, no sign-in change)`);
}

async function assertAllAllowed(who: Client, base: string, where: string): Promise<void> {
  for (const [what, send] of resetActions(who, base)) {
    const res = await send();
    assert.equal(res.status, 200, `${where}: ${what} works again (got ${res.status})`);
  }
}

describe('AT-6 follow-ups: ended people and ended spaces', { concurrency: false }, () => {
  before(async () => {
    worker = await startWorker();
    today = new Date(await workerNow(worker.url)).toISOString().slice(0, 10);
    setStartOffset(worker.url, Date.parse(`${today}T12:00:00Z`) - Date.now());
    assert.equal((await setClockOffsetMs(worker.url, 0)).status, 200);
    owner = await setUpOwner(worker.url);
    spaceId = await createSpace(owner, { name: SPACE, kit: 'school' });
    spaceB = await createSpace(owner, { name: SPACE_B, kit: 'company' });
    await appointAdmin(owner, spaceId, { ...ADMIN, valid_until: plus(60) });
    await appointAdmin(owner, spaceId, { ...ADMIN_2, valid_until: plus(60) });
    await appointAdmin(owner, spaceB, { ...ADMIN_B, valid_until: plus(60) });
    const s = await seed(worker.url, { spaceId, grantedBy: ADMIN.username, people: [SALMA, OMAR].map((p) => ({ ...p, valid_until: plus(30) })) });
    await seed(worker.url, { spaceId: spaceB, grantedBy: ADMIN_B.username, people: [{ ...KARIM, valid_until: plus(30) }] });
    Object.assign(ids, s.users, { admin2: await userIdOf(worker, ADMIN_2.username), karim: await userIdOf(worker, KARIM.username), adminB: await userIdOf(worker, ADMIN_B.username) });
    admin = await signedIn(worker.url, ADMIN.username, ADMIN.password);
  });

  after(async () => {
    if (worker) await setClockOffsetMs(worker.url, 0).catch(() => undefined);
    await worker?.stop();
  });

  it('a person ended with "End access now": the admin\'s send reset link (both steps) and set a new password are refused with a plain message, in Arabic and in English, until access is restored', async () => {
    const salmaId = ids[SALMA.username];
    await assertAllAllowed(admin, person(salmaId), 'positive control, while access lasts');
    assert.equal((await admin.post(`${person(salmaId)}/end`, {})).status, 303, 'access ends');
    const hashBefore = (await worker.sql(`SELECT password_hash FROM user WHERE id = '${salmaId}'`))[0].password_hash;

    await assertAllRefused(admin, person(salmaId), REFUSED_AR(SALMA.display_name), 'ended learner (Arabic)');
    assert.equal(await (await worker.sql(`SELECT COUNT(*) AS n FROM reset_link WHERE user_id = '${salmaId}' AND used_at IS NULL`))[0].n, 0, 'no open reset link');
    assert.equal((await worker.sql(`SELECT password_hash FROM user WHERE id = '${salmaId}'`))[0].password_hash, hashBefore, 'the password is unchanged');
    // Her old password still signs her in, to the "access ended" message only (release 1 rule 3).
    const again = await signedIn(worker.url, SALMA.username, SALMA.password);
    assert.equal((await again.get(`/s/${spaceId}`)).status, 403);

    assert.equal((await admin.post('/account/language', { lang: 'en' })).status, 303, 'the admin reads English');
    await assertAllRefused(admin, person(salmaId), REFUSED_EN(SALMA.display_name), 'ended learner (English)');
    assert.equal((await admin.post('/account/language', { lang: 'ar' })).status, 303);

    assert.equal((await admin.post(`${person(salmaId)}/restore`, { valid_until: plus(20) })).status, 303, 'access restored');
    await assertAllAllowed(admin, person(salmaId), 'after Restore access');
    assert.notEqual((await worker.sql(`SELECT password_hash FROM user WHERE id = '${salmaId}'`))[0].password_hash, hashBefore, 'a new password can be set again');
  });

  it('a person whose end date has passed is refused the same way; the owner\'s page for an ended admin too', async () => {
    const omarId = ids[OMAR.username];
    assert.equal((await admin.post(`${person(omarId)}/correct`, { display_name: OMAR.display_name, mobile: '', valid_until: today })).status, 303, 'end date today');
    await assertAllAllowed(admin, person(omarId), 'still today');
    assert.equal((await setClockOffsetMs(worker.url, 13 * 3_600_000)).status, 200, 'one hour after midnight UTC, the next day');
    try {
      const adminNextDay = await signedIn(worker.url, ADMIN.username, ADMIN.password);
      await assertAllRefused(adminNextDay, person(omarId), REFUSED_AR(OMAR.display_name), 'learner past the end date');
    } finally {
      assert.equal((await setClockOffsetMs(worker.url, 0)).status, 200);
    }

    const base = `/owner/spaces/${spaceId}/people/${ids.admin2}`;
    await assertAllAllowed(owner, base, 'owner, positive control');
    assert.equal((await owner.post(`${base}/end`, {})).status, 303, 'the owner ends the admin');
    // The owner's pages outside a space follow the browser's language: English here.
    await assertAllRefused(owner, base, REFUSED_EN(ADMIN_2.display_name), 'owner, ended admin');
    assert.equal((await owner.post(`${base}/restore`, { valid_until: plus(30) })).status, 303);
    await assertAllAllowed(owner, base, 'owner, after Restore access');
  });

  it('/home marks a space whose access has ended as ended, with the day, in Arabic and in English', async () => {
    // A person with a place in two spaces: Karim (Delta Logistics) also learns
    // at Mesk School. No screen makes this in this release (usernames are
    // product-wide and every appoint form creates a new person), so the second
    // membership is written straight into the test database.
    await worker.sql(
      `INSERT INTO membership (id, space_id, user_id, role, valid_from, valid_until, granted_by)
       VALUES ('m-karim-mesk', '${spaceId}', '${ids.karim}', 'learner', '${today}', '${plus(30)}', '${ids.adminB}')`,
    );
    const karim = await signedIn(worker.url, KARIM.username, KARIM.password);
    assert.equal((await karim.post('/account/language', { lang: 'ar' })).status, 303);
    let home = await karim.get('/home');
    assert.equal(home.status, 200, 'the list of his spaces');
    let text = textOf(await home.text());
    assert.ok(text.includes(SPACE) && text.includes(SPACE_B), 'both spaces are listed');
    assert.ok(!text.includes(ENDED_AR(today)), 'positive control: nothing is marked ended yet');

    assert.equal((await admin.post(`${person(ids.karim)}/end`, {})).status, 303, 'Mesk School ends his access');
    const again = await signedIn(worker.url, KARIM.username, KARIM.password);
    home = await again.get('/home');
    const html = await home.text();
    text = textOf(html);
    const items = [...html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((m) => textOf(m[1]));
    const mesk = items.find((i) => i.includes(SPACE)) ?? '';
    const delta = items.find((i) => i.includes(SPACE_B)) ?? '';
    assert.ok(mesk.includes(ENDED_AR(today)), `Mesk School is marked ended, with the day (Arabic): ${mesk}`);
    assert.ok(!delta.includes(ENDED_AR(today)), 'Delta Logistics is not');
    assert.match(html, /<html lang="ar" dir="rtl"/, 'an Arabic page');

    assert.equal((await again.post('/account/language', { lang: 'en' })).status, 303);
    const en = await (await again.get('/home')).text();
    const enItems = [...en.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((m) => textOf(m[1]));
    assert.ok((enItems.find((i) => i.includes(SPACE)) ?? '').includes(ENDED_EN(today)), 'marked ended, with the day (English)');
    assert.ok(!(enItems.find((i) => i.includes(SPACE_B)) ?? '').includes(ENDED_EN(today)), 'the other space is not');
    assert.match(en, /<html lang="en" dir="ltr"/, 'an English page');

    // Restored, the mark is gone.
    assert.equal((await admin.post(`${person(ids.karim)}/restore`, { valid_until: plus(10) })).status, 303);
    const restored = textOf(await (await again.get('/home')).text());
    assert.ok(!restored.includes(ENDED_EN(today)), 'no space is marked ended after Restore access');
  });
});
