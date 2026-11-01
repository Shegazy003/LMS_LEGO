// AT-5 guard: what people type is bounded before it is used.
//
// - Usernames: at most 32 characters wherever one is accepted. A longer one
//   typed at a password door (sign-in, recovery code, reset link) is refused
//   like a wrong one, and never builds a longer rate-limit key.
// - Display names: 1 to 100 characters on one line wherever one is set (the
//   owner's and the admin's appoint forms), so the fixed WhatsApp message
//   cannot be bloated or given extra lines.
// - Kit labels: 1 to 40 characters on one line, the same keys in every
//   language of the space, escaped on output. The theme, kit choice and
//   account language accept only what the page offers.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startWorker, type RunningWorker } from '../support/worker.ts';
import { Client, tinyPng, utcDatePlusDays } from '../support/http.ts';
import { issueLink, userIdOf } from '../support/admin.ts';
import { appointAdmin, createSpace, seed, setUpOwner, signedIn } from '../support/seed.ts';

const SPACE = 'مدرسة مسك';
const ADMIN = { display_name: 'Amal Hassan', username: 'amal.admin', password: 'admin-first-pass', mobile: '01012345678' };
const HADEER = { username: 'hadeer', password: 'hadeer-first-pass', display_name: 'Hadeer', mobile: '01022223333', role: 'publisher' as const };
const CONCEPTS = ['space', 'admin', 'publisher', 'learner', 'group', 'subject', 'chapter', 'lesson', 'material'];
const LONG = 'a'.repeat(5000);

let worker: RunningWorker;
let owner: Client;
let admin: Client;
let spaceId = '';
let hadeerId = '';

const count = async (sql: string) => Number((await worker.sql(sql))[0].n);
const kitJson = async () =>
  JSON.parse(String((await worker.sql(`SELECT k.json FROM kit k JOIN space s ON s.kit_id = k.id WHERE s.id = '${spaceId}'`))[0].json));
/** The maxlength of the named input inside the form (read from that input's own tag). */
const maxlengthOf = (html: string, form: string, name: string) =>
  html.match(new RegExp(`<form[^>]*id="${form}"[\\s\\S]*?(<input[^>]*name="${name}"[^>]*>)`))?.[1].match(/maxlength="(\d+)"/)?.[1];

function labelsOf(kit: { labels: Record<string, Record<string, string>> }): Record<string, string> {
  return Object.fromEntries(['ar', 'en'].flatMap((l) => CONCEPTS.map((c) => [`${l}.${c}`, kit.labels[l][c]])));
}

describe('AT-5 guard: usernames, display names and kit labels are bounded', { concurrency: false }, () => {
  before(async () => {
    worker = await startWorker();
    owner = await setUpOwner(worker.url);
    spaceId = await createSpace(owner, { name: SPACE, kit: 'school' });
    await appointAdmin(owner, spaceId, { ...ADMIN, valid_until: utcDatePlusDays(60) });
    const s = await seed(worker.url, { spaceId, grantedBy: ADMIN.username, people: [{ ...HADEER, valid_until: utcDatePlusDays(30) }] });
    hadeerId = s.users[HADEER.username];
    admin = await signedIn(worker.url, ADMIN.username, ADMIN.password);
  });

  after(async () => {
    await worker?.stop();
  });

  it('usernames: at most 32 characters; an overlong one at a password door is refused and never builds a longer rate-limit key', async () => {
    const c = new Client(worker.url);
    assert.equal((await c.post('/signin', { username: LONG, password: 'not-the-password' })).status, 401, 'sign-in refuses it');
    assert.equal((await c.post('/recover', { username: LONG, code: 'AAAA-BBBB-CCCC-DDDD', password: 'new-password-1' })).status, 401, 'recovery refuses it');
    const link = await issueLink(admin, `/s/${spaceId}/admin/people/${hadeerId}`);
    assert.equal((await c.post(`/r/${link.token}`, { username: LONG, new_password: 'new-password-1' })).status, 401, 'a reset link refuses it');
    const keys = (await worker.sql('SELECT key FROM attempt_limit')).map((r) => String(r.key));
    assert.ok(keys.length >= 2, 'the failures were counted');
    for (const key of keys) assert.ok(key.length <= 34, `a rate-limit key stays short (${key.length} characters)`);
    assert.ok(!keys.some((k) => k.includes('a'.repeat(33))), 'the overlong username is not stored');

    // 32 characters is a valid username; 33 is refused by both appoint forms and stores nothing.
    const u32 = 'u'.repeat(32);
    await appointAdmin(owner, spaceId, { display_name: 'Long Name', username: u32, password: 'long-name-pass', mobile: '01011112222', valid_until: utcDatePlusDays(30) });
    assert.equal((await new Client(worker.url).post('/signin', { username: u32, password: 'long-name-pass' })).status, 302, 'a 32-character username signs in');
    const u33 = 'v'.repeat(33);
    const byOwner = await owner.post(`/owner/spaces/${spaceId}/admins`, { display_name: 'Too Long', username: u33, password: 'too-long-pass', mobile: '01011113333', valid_until: utcDatePlusDays(30) });
    assert.equal(byOwner.status, 400);
    const byAdmin = await admin.post(`/s/${spaceId}/admin/people`, { display_name: 'Too Long', username: u33, password: 'too-long-pass', role: 'learner', mobile: '01011113333', valid_until: utcDatePlusDays(30) });
    assert.equal(byAdmin.status, 400);
    assert.equal(await count(`SELECT COUNT(*) AS n FROM user WHERE username = '${u33}'`), 0);

    // Every username box stops at 32 characters.
    const anon = new Client(worker.url);
    const fresh = await issueLink(admin, `/s/${spaceId}/admin/people/${hadeerId}`);
    for (const [where, html, form] of [
      ['sign-in', await (await anon.get('/signin')).text(), 'signin'],
      ['recovery', await (await anon.get('/recover')).text(), 'recover'],
      ['reset link', await (await anon.get(`/r/${fresh.token}`)).text(), 'reset'],
      ['owner appoints an admin', await (await owner.get(`/owner/spaces/${spaceId}`)).text(), 'appoint-admin'],
      ['admin appoints a person', await (await admin.get(`/s/${spaceId}/admin/people`)).text(), 'appoint'],
    ] as const) {
      assert.equal(maxlengthOf(html, form, 'username'), '32', `${where}: the username box stops at 32 characters`);
    }
  });

  it('display names: 1 to 100 characters on one line, wherever a display name is set; the WhatsApp message stays bounded', async () => {
    const appointByOwner = (display_name: string, username: string) =>
      owner.post(`/owner/spaces/${spaceId}/admins`, { display_name, username, password: 'display-pass-1', mobile: '01011114444', valid_until: utcDatePlusDays(30) });
    const appointByAdmin = (display_name: string, username: string) =>
      admin.post(`/s/${spaceId}/admin/people`, { display_name, username, password: 'display-pass-1', role: 'learner', mobile: '01011115555', valid_until: utcDatePlusDays(30) });
    const refused = [
      ['101 characters', 'n'.repeat(101)],
      ['a line break', 'Amal\nForged second line'],
      ['a carriage return', 'Amal\rForged'],
      ['a tab', 'Amal\tHassan'],
      ['a right-to-left override', 'Amal ‮dlrow'],
      ['nothing but spaces', '   '],
    ] as const;
    for (const [i, [what, name]] of refused.entries()) {
      assert.equal((await appointByOwner(name, `owner.refused${i}`)).status, 400, `owner form refuses ${what}`);
      assert.equal((await appointByAdmin(name, `admin.refused${i}`)).status, 400, `admin form refuses ${what}`);
    }
    assert.equal(await count("SELECT COUNT(*) AS n FROM user WHERE username LIKE '%.refused%'"), 0, 'nothing stored');

    const html = await (await owner.get(`/owner/spaces/${spaceId}`)).text();
    assert.equal(maxlengthOf(html, 'appoint-admin', 'display_name'), '100');
    const people = await (await admin.get(`/s/${spaceId}/admin/people`)).text();
    assert.equal(maxlengthOf(people, 'appoint', 'display_name'), '100');

    // 100 characters is accepted, and the message that carries it stays bounded.
    const longest = 'م'.repeat(100);
    assert.equal((await appointByAdmin(longest, 'longest.name')).status, 303);
    const id = await userIdOf(worker, 'longest.name');
    const link = await issueLink(admin, `/s/${spaceId}/admin/people/${id}`);
    assert.ok(link.message.includes(longest), 'the message names the person');
    assert.equal(link.message.split('\n').length, 4, 'the fixed message keeps its four lines');
    assert.ok(link.message.length < 1000, `the message stays short (${link.message.length} characters)`);
  });

  it('kit labels: 1 to 40 characters on one line, the same keys in every language, escaped on output; kit, theme and language accept only what is offered', async () => {
    const path = `/owner/spaces/${spaceId}/labels`;
    const base = labelsOf(await kitJson());
    const before = JSON.stringify(await kitJson());
    const without = (key: string) => Object.fromEntries(Object.entries(base).filter(([k]) => k !== key));
    const refusedCases = [
      ['an empty name', { ...base, 'ar.group': '' }],
      ['a name of spaces', { ...base, 'en.group': '   ' }],
      ['41 characters', { ...base, 'en.subject': 'x'.repeat(41) }],
      ['a line break', { ...base, 'ar.subject': 'مادّة\nسطر' }],
      ['a missing key', without('en.lesson')],
      ['a key no kit has', { ...base, 'ar.guardian': 'ولي أمر' }],
      ['a language the space does not have', { ...base, 'fr.publisher': 'Professeur' }],
    ] as const;
    for (const [what, body] of refusedCases) {
      const res = await owner.post(path, body);
      assert.equal(res.status, 400, `${what} is refused`);
      assert.ok((await res.text()).includes('id="error"'), `${what}: a plain message`);
    }
    assert.equal(JSON.stringify(await kitJson()), before, 'nothing changed');

    // Accepted: 40 characters, and markup, which is stored as typed and shown as text.
    const forty = 'y'.repeat(40);
    const res = await owner.post(path, { ...base, 'en.chapter': forty, 'ar.group': '<b>فريق</b>', 'en.group': '<script>alert(1)</script>' });
    assert.equal(res.status, 303);
    const kit = await kitJson();
    assert.equal(kit.labels.en.chapter, forty);
    assert.equal(kit.labels.ar.group, '<b>فريق</b>');
    assert.deepEqual(Object.keys(kit.labels.ar).sort(), [...CONCEPTS].sort(), 'Arabic keeps exactly the nine keys');
    assert.deepEqual(Object.keys(kit.labels.en).sort(), [...CONCEPTS].sort(), 'English keeps exactly the nine keys');
    const home = await (await admin.get(`/s/${spaceId}`)).text();
    assert.ok(home.includes('&lt;b&gt;فريق&lt;/b&gt;') && !home.includes('<b>فريق</b>'), 'the admin home shows the label as text');
    assert.equal((await admin.post('/account/language', { lang: 'en' })).status, 303);
    const english = await (await admin.get(`/s/${spaceId}`)).text();
    assert.ok(english.includes('&lt;script&gt;') && !english.includes('<script>alert'), 'escaped in English too');
    const ownerPage = await (await owner.get(`/owner/spaces/${spaceId}`)).text();
    assert.ok(!ownerPage.includes('<script>alert'), 'escaped in the kit editor');

    // Only the three seed kits; only a colour; only an image; only the space's languages.
    const now = JSON.stringify(await kitJson());
    assert.equal((await owner.post(`/owner/spaces/${spaceId}/kit`, { kit: 'pirate', confirm: 'yes' })).status, 400, 'an unknown kit is refused');
    const badColour = new FormData();
    badColour.set('primary_color', 'red; background:url(x)');
    assert.equal((await owner.post(`/owner/spaces/${spaceId}/theme`, badColour)).status, 400, 'a colour that is not #rrggbb is refused');
    const badLogo = new FormData();
    badLogo.set('primary_color', '#123456');
    badLogo.set('logo', new Blob(['<html>not an image</html>'], { type: 'image/png' }), 'logo.png');
    assert.equal((await owner.post(`/owner/spaces/${spaceId}/theme`, badLogo)).status, 400, 'a logo that is not an image is refused');
    assert.equal(JSON.stringify(await kitJson()), now, 'nothing changed');
    const okLogo = new FormData();
    okLogo.set('primary_color', '#123456');
    okLogo.set('logo', new Blob([tinyPng()], { type: 'image/png' }), 'logo.png');
    assert.equal((await owner.post(`/owner/spaces/${spaceId}/theme`, okLogo)).status, 303, 'a real image and colour are accepted');

    const learner = await signedIn(worker.url, HADEER.username, HADEER.password);
    assert.equal((await learner.post('/account/language', { lang: 'fr' })).status, 400, 'a language the space does not have is refused');
    assert.equal((await worker.sql(`SELECT lang FROM user WHERE id = '${hadeerId}'`))[0].lang, null, 'nothing stored');
    // Only the owner edits a kit.
    assert.equal((await admin.post(path, base)).status, 403, 'an admin cannot edit the kit');
  });
});
