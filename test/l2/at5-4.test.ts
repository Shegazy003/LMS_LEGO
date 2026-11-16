// AT-5.4 (product-contract v2, LMS wave 1, L2, section 8.4): /recover says
// "Only the product owner has a recovery code. Everyone else: ask the person
// who gave you your account." above today's form, as the first text after its
// heading, with a link back to sign-in; a non-owner username and an unknown
// username get today's single failure message, identically; the owner's
// recovery works exactly as today (a new password, a new code shown once, the
// old code and password dead; AT-1.3 and the recovery unit tests are their own
// unchanged steps).
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Client, utcDatePlusDays } from '../support/http.ts';
import { startProduct, type Product } from '../support/product.ts';
import { OWNER, appointAdmin, createSpace, signedIn } from '../support/seed.ts';
import { plain } from '../wave1/world.ts';
import { product, withoutUsername } from './signin.ts';

describe('AT-5.4 the recovery page says who it is for; non-owner and unknown usernames get one answer; the owner\'s recovery is today\'s', { concurrency: false }, () => {
  let p: Product;
  let code = '';
  before(async () => {
    p = await startProduct();
    const setup = await new Client(p.url).post('/setup', OWNER);
    assert.equal(setup.status, 200, 'owner setup');
    code = (await setup.text()).match(/id="recovery-code"[^>]*>([^<]+)</)?.[1]?.trim() ?? '';
    assert.ok(code, 'the first recovery code');
  });
  after(async () => {
    await p?.stop();
  });

  for (const lang of ['en', 'ar'] as const) {
    it(`${lang}: the new line is the first text after the heading, above today's form, with a link back to sign-in`, async () => {
      const t = product(lang);
      const body = await (await new Client(p.url, { lang }).get('/recover')).text();
      const main = body.slice(body.indexOf('<main'), body.indexOf('</main>'));
      const afterHeading = main.slice(main.indexOf('</h1>') + 5);
      const firstText = plain(afterHeading.slice(0, afterHeading.indexOf('<form')));
      assert.ok(firstText.startsWith(t('recoverOnlyOwner')), `the first text after the heading is the new line (${firstText})`);
      if (lang === 'en') assert.ok(firstText.startsWith('Only the product owner has a recovery code. Everyone else: ask the person who gave you your account.'));
      assert.match(main, /<form id="recover"[\s\S]*name="username"[\s\S]*name="code"[\s\S]*name="password"/, 'today\'s form, below it');
      assert.ok(main.indexOf('id="recover-who"') < main.indexOf('<form id="recover"'));
      assert.match(main, new RegExp(`<a id="back-to-signin" href="/signin">${t('backToSignIn')}</a>`), 'a link back to sign-in');
    });
  }

  it('a non-owner username and an unknown username get today\'s single failure message, identically', async () => {
    const owner = await signedIn(p.url, OWNER.username, OWNER.password);
    // A person who is not the owner: the admin of the owner's first space.
    const spaceId = await createSpace(owner, { name: 'مدرسة مسك', kit: 'school' });
    await appointAdmin(owner, spaceId, { display_name: 'Amal Hassan', username: 'amal.admin', password: 'admin-first-pass', mobile: '01012345678', valid_until: utcDatePlusDays(30) });
    for (const lang of ['en', 'ar'] as const) {
      const t = product(lang);
      const answers = [];
      for (const username of ['amal.admin', 'nobody.here']) {
        const res = await new Client(p.url, { lang }).post('/recover', { username, code, password: 'not-the-owner-1' });
        answers.push({ status: res.status, body: withoutUsername(await res.text(), username) });
      }
      assert.equal(answers[0].status, 401);
      assert.equal(answers[1].status, answers[0].status, `${lang}: the same status`);
      assert.equal(answers[1].body, answers[0].body, `${lang}: the same page, apart from the typed username`);
      assert.ok(plain(answers[0].body).includes(t('recoverFailed')), `${lang}: today's single message`);
      assert.equal([...answers[0].body.matchAll(/role="alert"/g)].length, 1);
    }
  });

  it('the owner\'s recovery works exactly as today', async () => {
    const c = new Client(p.url);
    const recovered = await c.post('/recover', { username: OWNER.username, code, password: 'owner-pass-renewed' });
    assert.equal(recovered.status, 200);
    const next = (await recovered.text()).match(/id="recovery-code"[^>]*>([^<]+)</)?.[1]?.trim();
    assert.ok(next && next !== code, 'a new code is shown once');
    assert.equal((await c.get('/owner')).status, 200, 'recovery signs the owner in');
    assert.equal((await new Client(p.url).post('/recover', { username: OWNER.username, code, password: 'another-pass-1' })).status, 401, 'the used code is dead');
    assert.equal((await new Client(p.url).post('/signin', { username: OWNER.username, password: OWNER.password })).status, 401, 'the old password is dead');
    assert.equal((await new Client(p.url).post('/signin', { username: OWNER.username, password: 'owner-pass-renewed' })).status, 302, 'the new one works');
  });
});
