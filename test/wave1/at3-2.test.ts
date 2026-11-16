// AT-3.2 (product-contract v2, LMS wave 1, L1, section 7.2): "once" is per
// account, per space, per browser, per switch-on. Each browser is a client
// with its own cookie jar; "C" sends only its session, as a browser that
// refuses every other cookie.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '../support/http.ts';
import { SALMA, YOUSSEF, activity, as, home, lessonPath, wave1World, type Wave1World } from './world.ts';
import { noticeCookies, noticeForm, sessionOf, switchUser } from './notice.ts';
import { noticeCookieName, noticeCookieOptions } from '../../src/notice.ts';

describe('AT-3.2 told once per account, space, browser and switch-on; every time without cookies', { concurrency: false }, () => {
  let w: Wave1World;
  before(async () => {
    w = await wave1World();
    await activity(w, true);
  });
  after(async () => {
    await w?.close();
  });

  const formOf = async (c: Client, path: string) => noticeForm(await (await c.get(path)).text());

  it('browser A: Salma, then Youssef, then Salma; browser B: Salma; off and on again the same day; browser C without cookies', async () => {
    const s = w.school;
    const a = await as(w, SALMA);
    assert.equal(await formOf(a, home(s)), 'full', 'A Salma: full first');
    assert.equal(await formOf(a, home(s)), 'folded', 'A Salma: then folded');

    await switchUser(a, YOUSSEF);
    assert.equal(await formOf(a, home(s)), 'full', 'A Youssef: his own first time, in full');
    assert.equal(await formOf(a, home(s)), 'folded', 'A Youssef: then folded');

    await switchUser(a, SALMA);
    assert.equal(await formOf(a, home(s)), 'folded', 'A Salma again after Youssef: folded');

    const b = await as(w, SALMA);
    assert.equal(await formOf(b, lessonPath(s, s.lessons['Adding fractions'])), 'full', 'B Salma: full first');
    assert.equal(await formOf(b, home(s)), 'folded');

    // Off, then on again on the same day: a new switch-on.
    const before = String((await w.p.sql(`SELECT enabled_since FROM lesson_view_setting WHERE space_id = '${s.id}'`))[0].enabled_since);
    await activity(w, false);
    assert.equal(await formOf(a, home(s)), null, 'off: no notice');
    await activity(w, true);
    assert.equal(String((await w.p.sql(`SELECT enabled_since FROM lesson_view_setting WHERE space_id = '${s.id}'`))[0].enabled_since), before, 'the same day');
    assert.equal(await formOf(a, home(s)), 'full', 'A Salma after the new switch-on: full once more');
    assert.equal(await formOf(a, home(s)), 'folded');

    // C: refuses every cookie but the session.
    const c = new Client(w.p.url);
    assert.equal((await c.post('/signin', { username: SALMA.username, password: SALMA.password })).status, 302);
    const only = { cookie: `lms_session=${sessionOf(c)}` };
    assert.ok(only.cookie.length > 'lms_session='.length);
    for (let i = 0; i < 2; i++) assert.equal(noticeForm(await (await c.getWith(home(s), only)).text()), 'full', `C: full, time ${i + 1}`);
  });

  it('the cookie: lms_notice_<space id>_<user id> holding the switch-on tick, Path=/s/<space id>, HttpOnly, SameSite=Lax, one year, no name or content', async () => {
    await activity(w, false);
    await activity(w, true);
    const s = w.school;
    const a = await as(w, SALMA);
    const res = await a.get(home(s));
    const lines = noticeCookies(res);
    assert.equal(lines.length, 1, 'one notice cookie, set with the full form');
    const tick = String((await w.p.sql(`SELECT changed_at FROM lesson_view_setting WHERE space_id = '${s.id}'`))[0].changed_at);
    const [pair, ...attrs] = lines[0].split(';').map((x) => x.trim());
    assert.equal(pair, `lms_notice_${s.id}_${w.ids[SALMA.username]}=${tick}`);
    const lower = attrs.map((x) => x.toLowerCase());
    assert.ok(lower.includes(`path=/s/${s.id}`), 'its path is the space');
    assert.ok(lower.includes('httponly'));
    assert.ok(lower.includes('samesite=lax'));
    assert.ok(lower.includes('max-age=31536000'), 'one year');
    assert.ok(!lines[0].includes(SALMA.display_name) && !lines[0].includes(SALMA.username), 'no name');
    assert.deepEqual(noticeCookies(await a.get(home(s))), [], 'the folded form sets nothing');
  });

  it('the cookie is Secure on the live https address (the same rule as the session cookie)', () => {
    const live = noticeCookieOptions('space-1', true);
    assert.deepEqual(live, { path: '/s/space-1', httpOnly: true, secure: true, sameSite: 'Lax', maxAge: 31_536_000 });
    assert.equal(noticeCookieName('space-1', 'user-2'), 'lms_notice_space-1_user-2');
  });
});
