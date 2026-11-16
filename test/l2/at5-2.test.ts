// AT-5.2 (product-contract v2, LMS wave 1, L2, section 8.3 "Unchanged"):
// inside a space, on reset-link and access-ended pages, and wherever a person
// has their own language in My account, pages follow exactly today's rules;
// the lms_lang cookie changes nothing there. Each page is read three times, on
// a device that chose Arabic, one that chose English and one that chose
// nothing (asking for English), and must be the same bytes.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '../support/http.ts';
import { issueLink } from '../support/admin.ts';
import { HADEER, SALMA, YOUSSEF, wave1World, type Wave1World } from '../wave1/world.ts';
import { EnglishDevice, htmlLang } from './signin.ts';

const DEVICES = ['ar', 'en', null] as const;

/** The same page read on three devices: status, language and the body, which must be equal. */
async function same(name: string, read: (c: Client) => Promise<Response>, base: string, expected: { lang: string; dir: string }): Promise<void> {
  const seen: { status: number; body: string }[] = [];
  for (const d of DEVICES) {
    const res = await read(new EnglishDevice(base, d));
    seen.push({ status: res.status, body: await res.text() });
  }
  assert.deepEqual(htmlLang(seen[0].body), expected, `${name}: today's language`);
  assert.equal(seen[1].status, seen[0].status, `${name}: the same status with lms_lang=en`);
  assert.equal(seen[1].body, seen[0].body, `${name}: the same page with lms_lang=en`);
  assert.equal(seen[2].status, seen[0].status, `${name}: the same status with no choice`);
  assert.equal(seen[2].body, seen[0].body, `${name}: the same page with no choice`);
}

const AR = { lang: 'ar', dir: 'rtl' };
const EN = { lang: 'en', dir: 'ltr' };

describe('AT-5.2 inside a space, reset links, access ended and a person\'s own language: the cookie changes nothing', { concurrency: false }, () => {
  let w: Wave1World;
  before(async () => {
    w = await wave1World();
  });
  after(async () => {
    await w?.close();
  });

  const signIn = async (c: Client, who: { username: string; password: string }) => {
    assert.equal((await c.post('/signin', { username: who.username, password: who.password })).status, 302);
    return c;
  };

  it('inside a space, with no language of one\'s own: the space\'s first language, whatever the cookie (School, Company, University)', async () => {
    for (const s of [w.school, w.company, w.university]) {
      for (const path of [`/s/${s.id}`, `/s/${s.id}/learn/${s.math}`, `/s/${s.id}/read/${s.lessons['Adding fractions']}`, `/s/${s.id}/results`, `/s/${s.id}/no-such-page`]) {
        await same(`${s.kit} ${path}`, async (c) => (await signIn(c, SALMA)).get(path), w.p.url, AR);
      }
    }
    const editor = `/s/${w.school.id}/publish/compose/${w.school.lessons['Adding fractions']}`;
    await same(`publisher ${editor}`, async (c) => (await signIn(c, HADEER)).get(editor), w.p.url, AR);
  });

  it('a person with their own language in My account: their language on every page, whatever the cookie', async () => {
    for (const lang of ['en', 'ar'] as const) {
      const set = await signIn(new Client(w.p.url), SALMA);
      assert.equal((await set.post('/account/language', { lang })).status, 303);
      for (const path of ['/home', '/account', `/s/${w.school.id}`, `/s/${w.company.id}`, '/no-such-page']) {
        await same(`Salma (${lang}) ${path}`, async (c) => (await signIn(c, SALMA)).get(path), w.p.url, lang === 'en' ? EN : AR);
      }
    }
  });

  it('reset-link pages: the space\'s first language, whatever the cookie (a usable link, then a used one)', async () => {
    const issued = await issueLink(w.admin, `/s/${w.school.id}/admin/people/${w.ids[YOUSSEF.username]}`);
    assert.equal(issued.status, 200, 'a reset link for Youssef');
    const path = new URL(issued.link).pathname;
    await same('a usable reset link', (c) => c.get(path), w.p.url, AR);
    const used = await new Client(w.p.url).post(path, { username: YOUSSEF.username, new_password: 'youssef-new-pass-1' });
    assert.ok(used.status < 500, `the link is used (${used.status})`);
    await same('a used reset link', (c) => c.get(path), w.p.url, AR);
  });

  it('access-ended pages: the space\'s languages, whatever the cookie', async () => {
    assert.equal((await w.admin.post(`/s/${w.school.id}/admin/people/${w.ids[HADEER.username]}/end`, {})).status, 303, 'End access now for Hadeer');
    await same('the access-ended page', async (c) => (await signIn(c, HADEER)).get(`/s/${w.school.id}`), w.p.url, AR);
  });
});
